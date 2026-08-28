// XKR wallet RPC service for atomic swaps.
//
// This is the XKR side of a BTC<->XKR atomic swap. The Rust swap engine
// (xkr-swap-core, forked from eigenwallet/core) owns the swap protocol, the
// Bitcoin side, and the cross-curve DLEQ / adaptor-signature crypto. Everything
// that touches the Kryptokrona chain lives here and is served over a tiny local
// JSON-RPC endpoint, backed by kryptokrona-wallet-backend-js.
//
// The swap's shared 2-of-2 output works with plain key arithmetic: the shared
// spend pubkey is B_A+B_B and the shared view secret is v_A+v_B. Whoever learns
// both spend shares reconstructs the one-time key and sweeps with an ordinary
// transaction. The engine computes the combined keys (ed25519, curve25519-dalek)
// and calls the three methods below; no consensus-critical code runs here.
//
// Methods (JSON-RPC 2.0 over HTTP POST /):
//   ping()                                              -> "pong"
//   encodeAddress({spendPublicKey, viewPublicKey})      -> {address}
//   watchForLock({address, viewSecret, amount, timeoutMs?, scanHeight?})
//                                                       -> {detected, unlocked, locked, txHash}
//   sweep({spendSecret, viewSecret, destAddress, fee?, amount?, scanHeight?})
//                                                       -> {txHash, amount, fee}
//   confirmTx({spendSecret, viewSecret, txHash, confirmations?, timeoutMs?, scanHeight?})
//                                                       -> {confirmed, confirmations}
//   lockSend({senderSpendSecret, senderViewSecret, destAddress, amount, fee?, scanHeight?})
//                                                       -> {txHash, amount, fee}
//
// Run standalone (for testing):
//   node xkr-wallet-rpc.cjs --port 40000 --daemon 127.0.0.1:31001

const http = require('http');
const WB = require('kryptokrona-wallet-backend-js');
const { Address } = require('kryptokrona-utils');

const DEFAULT_FEE = 10; // atomic units (network MINIMUM_FEE)

function makeDaemon(daemonHost, daemonPort, ssl) {
    // isCacheApi=false; ssl defaults to false for local/known nodes.
    return new WB.Daemon(daemonHost, daemonPort, false, !!ssl);
}

// Import a wallet, sync it, run `fn(wallet)`, and always stop it afterwards.
async function withWallet(makeWallet, fn) {
    const [wallet, err] = await makeWallet();
    if (err) throw new Error(err.toString());
    try {
        await wallet.start();
        return await fn(wallet);
    } finally {
        await wallet.stop().catch(() => {});
    }
}

async function poll(desc, timeoutMs, intervalMs, pred) {
    const start = Date.now();
    for (;;) {
        const done = await pred();
        if (done) return done;
        if (Date.now() - start >= timeoutMs) throw new Error('timed out waiting for: ' + desc);
        await new Promise((r) => setTimeout(r, intervalMs));
    }
}

// ---- RPC methods -----------------------------------------------------------

const methods = {
    async ping() {
        return 'pong';
    },

    // Encode the shared 2-of-2 keys as a fundable Kryptokrona address.
    async encodeAddress({ spendPublicKey, viewPublicKey }) {
        if (!spendPublicKey || !viewPublicKey) throw new Error('spendPublicKey and viewPublicKey required');
        const address = await Address.fromPublicKeys(spendPublicKey, viewPublicKey);
        return { address: await address.toString() };
    },

    // Watch the shared address (view-only) until the locked deposit lands.
    async watchForLock({ address, viewSecret, amount, timeoutMs, scanHeight }, ctx) {
        if (!address || !viewSecret || !amount) throw new Error('address, viewSecret, amount required');
        return withWallet(
            () => WB.WalletBackend.importViewWallet(makeDaemon(ctx.daemonHost, ctx.daemonPort, ctx.ssl), scanHeight || 0, viewSecret, address),
            async (wallet) => {
                const [unlocked, locked] = await poll('deposit', timeoutMs || 180000, 2000, async () => {
                    const [u, l] = await wallet.getBalance();
                    return u + l >= amount ? [u, l] : null;
                });
                // Surface the hash of the incoming lock deposit so the engine can
                // record it (the tx that credits this view-only wallet).
                const incoming = (await wallet.getTransactions()).find((t) => t.totalAmount() > 0);
                return { detected: true, unlocked, locked, txHash: incoming ? incoming.hash : null };
            },
        );
    },

    // Reconstruct the shared wallet from the combined secrets and sweep it out.
    async sweep({ spendSecret, viewSecret, destAddress, fee, amount, scanHeight }, ctx) {
        if (!spendSecret || !viewSecret || !destAddress) throw new Error('spendSecret, viewSecret, destAddress required');
        const useFee = typeof fee === 'number' ? fee : DEFAULT_FEE;
        return withWallet(
            () => WB.WalletBackend.importWalletFromKeys(makeDaemon(ctx.daemonHost, ctx.daemonPort, ctx.ssl), scanHeight || 0, viewSecret, spendSecret),
            async (wallet) => {
                // Idempotency: if the shared output was already swept (e.g. a prior
                // attempt that broadcast but whose response was lost), return that tx
                // rather than double-spending — otherwise the caller's retry loop
                // would spin forever against an already-empty output.
                const outcome = await poll('spendable balance or prior sweep', 180000, 2000, async () => {
                    const prior = (await wallet.getTransactions()).find((t) => t.totalAmount() < 0);
                    if (prior) return { existing: prior.hash };
                    const [u] = await wallet.getBalance();
                    return u > useFee ? { spendable: u } : null;
                });
                if (outcome.existing) {
                    return { txHash: outcome.existing, amount: 0, fee: 0, alreadySwept: true };
                }
                const sendAmount = typeof amount === 'number' ? amount : outcome.spendable - useFee;
                const result = await wallet.sendTransactionAdvanced(
                    [[destAddress, sendAmount]],
                    0, // mixin
                    WB.FeeType.FixedFee(useFee),
                    undefined, // paymentID
                    undefined, // subWalletsToTakeFrom
                    wallet.getPrimaryAddress(), // change back to the shared address
                    true, // relayToNetwork
                    false, // sendAll
                );
                if (!result.success) throw new Error(result.error.toString());
                return { txHash: result.transactionHash, amount: sendAmount, fee: useFee };
            },
        );
    },

    // Confirm a transaction that spends FROM the shared address (redeem/refund)
    // has reached `confirmations` depth. Keyed by txHash so it is safe to re-poll
    // after a restart without re-broadcasting. Imports the shared wallet from the
    // combined keys (like `sweep`) so the outgoing spend is reliably tracked.
    async confirmTx({ spendSecret, viewSecret, txHash, confirmations, timeoutMs, scanHeight }, ctx) {
        if (!spendSecret || !viewSecret || !txHash) throw new Error('spendSecret, viewSecret, txHash required');
        const need = typeof confirmations === 'number' ? confirmations : 1;
        return withWallet(
            () => WB.WalletBackend.importWalletFromKeys(makeDaemon(ctx.daemonHost, ctx.daemonPort, ctx.ssl), scanHeight || 0, viewSecret, spendSecret),
            async (wallet) => {
                const depth = await poll('tx confirmations', timeoutMs || 600000, 3000, async () => {
                    const tx = await wallet.getTransaction(txHash);
                    if (!tx || !tx.blockHeight) return null; // unseen or still in the pool
                    const [, , networkBlockCount] = wallet.getSyncStatus();
                    const d = networkBlockCount - tx.blockHeight + 1;
                    return d >= need ? d : null;
                });
                return { confirmed: true, confirmations: depth };
            },
        );
    },

    // Alice's side: send `amount` from the ASB's own funded wallet to the shared
    // address (the XKR lock). Imports the sender wallet from the ASB's keys. Note:
    // unlike Monero's build-then-publish, this broadcasts atomically, so it is not
    // crash-idempotent on the ASB's general-purpose wallet — the engine's state
    // persistence bounds the double-send window to a crash mid-broadcast.
    async lockSend({ senderSpendSecret, senderViewSecret, destAddress, amount, fee, scanHeight }, ctx) {
        if (!senderSpendSecret || !senderViewSecret || !destAddress || !amount) {
            throw new Error('senderSpendSecret, senderViewSecret, destAddress, amount required');
        }
        const useFee = typeof fee === 'number' ? fee : DEFAULT_FEE;
        return withWallet(
            () => WB.WalletBackend.importWalletFromKeys(makeDaemon(ctx.daemonHost, ctx.daemonPort, ctx.ssl), scanHeight || 0, senderViewSecret, senderSpendSecret),
            async (wallet) => {
                await poll('spendable balance for lock', 180000, 2000, async () => {
                    const [u] = await wallet.getBalance();
                    return u >= amount + useFee ? u : null;
                });
                const result = await wallet.sendTransactionAdvanced(
                    [[destAddress, amount]],
                    0, // mixin
                    WB.FeeType.FixedFee(useFee),
                    undefined, // paymentID
                    undefined, // subWalletsToTakeFrom
                    wallet.getPrimaryAddress(), // change back to the ASB wallet
                    true, // relayToNetwork
                    false, // sendAll
                );
                if (!result.success) throw new Error(result.error.toString());
                return { txHash: result.transactionHash, amount, fee: useFee };
            },
        );
    },
};

// ---- JSON-RPC HTTP server --------------------------------------------------

function start({ port, daemonHost, daemonPort, ssl }) {
    const ctx = { daemonHost, daemonPort, ssl: !!ssl };
    const server = http.createServer((req, res) => {
        if (req.method !== 'POST') {
            res.writeHead(405).end();
            return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
            let id = null;
            try {
                const rpc = JSON.parse(body);
                id = rpc.id ?? null;
                const method = methods[rpc.method];
                if (!method) throw new Error('unknown method: ' + rpc.method);
                const result = await method(rpc.params || {}, ctx);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: e.message || String(e) } }));
            }
        });
    });
    server.listen(port, '127.0.0.1', () => {
        console.log(`xkr-wallet-rpc listening on 127.0.0.1:${port} -> daemon ${daemonHost}:${daemonPort}`);
    });
    return server;
}

module.exports = { start, methods };

// CLI entry point for standalone testing.
if (require.main === module) {
    const args = process.argv.slice(2);
    const get = (flag, def) => {
        const i = args.indexOf(flag);
        return i >= 0 ? args[i + 1] : def;
    };
    const port = parseInt(get('--port', '40000'), 10);
    const [daemonHost, daemonPortStr] = get('--daemon', '127.0.0.1:11898').split(':');
    const ssl = args.includes('--ssl');
    start({ port, daemonHost, daemonPort: parseInt(daemonPortStr, 10), ssl });
}
