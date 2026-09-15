const http = require('http');
const WB = require('kryptokrona-wallet-backend-js');
const { Address } = require('kryptokrona-utils');

const DEFAULT_FEE = 10;

const swapMixin = () => parseInt(process.env.XKR_SWAP_MIXIN || '3', 10);

const floorScanHeight = () => parseInt(process.env.XKR_WALLET_SCAN_HEIGHT || '0', 10);

const scanCoinbase = () => process.env.XKR_SCAN_COINBASE === '1' || process.env.XKR_SCAN_COINBASE === 'true';

function makeDaemon(daemonHost, daemonPort, ssl) {
    return new WB.Daemon(daemonHost, daemonPort, false, !!ssl);
}

function mainWalletIfMatches(ctx, spendSecret) {
    try {
        const w = ctx.getMainWallet && ctx.getMainWallet();
        if (!w || typeof w.getPrimaryAddressPrivateKeys !== 'function') return null;
        const [primarySpend] = w.getPrimaryAddressPrivateKeys();
        return primarySpend && spendSecret && primarySpend === spendSecret ? w : null;
    } catch (_) {
        return null;
    }
}

let mainWalletWriteChain = Promise.resolve();
function withMainWalletWriteLock(fn) {
    const run = mainWalletWriteChain.then(fn, fn);
    mainWalletWriteChain = run.catch(() => {});
    return run;
}

async function withWallet(makeWallet, fn, opts = {}) {
    const [wallet, err] = await makeWallet();
    if (err) throw new Error(err.toString());
    try {
        if (scanCoinbase()) wallet.scanCoinbaseTransactions(true);
        if (opts.scanPool) wallet.scanPoolTransactions(true);
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

const methods = {
    async ping() {
        return 'pong';
    },

    async encodeAddress({ spendPublicKey, viewPublicKey }) {
        if (!spendPublicKey || !viewPublicKey) throw new Error('spendPublicKey and viewPublicKey required');
        const address = await Address.fromPublicKeys(spendPublicKey, viewPublicKey);
        return { address: await address.toString() };
    },

    async watchForLock({ address, viewSecret, amount, timeoutMs, scanHeight }, ctx) {
        if (!address || !viewSecret || !amount) throw new Error('address, viewSecret, amount required');
        return withWallet(
            () => WB.WalletBackend.importViewWallet(makeDaemon(ctx.daemonHost, ctx.daemonPort, ctx.ssl), scanHeight || floorScanHeight(), viewSecret, address),
            async (wallet) => {
                const { unlocked, locked, txHash } = await poll('deposit', timeoutMs || 180000, 2000, async () => {
                    const [u, l] = await wallet.getBalance();
                    if (u + l < amount) return null;
                    const incoming = (await wallet.getTransactions()).find((t) => t.totalAmount() > 0);
                    if (!incoming) return null;
                    return { unlocked: u, locked: l, txHash: incoming.hash };
                });
                return { detected: true, unlocked, locked, txHash };
            },
            { scanPool: true },
        );
    },

    async sweep({ spendSecret, viewSecret, destAddress, fee, amount, scanHeight }, ctx) {
        if (!spendSecret || !viewSecret || !destAddress) throw new Error('spendSecret, viewSecret, destAddress required');
        const useFee = typeof fee === 'number' ? fee : DEFAULT_FEE;
        return withWallet(
            () => WB.WalletBackend.importWalletFromKeys(makeDaemon(ctx.daemonHost, ctx.daemonPort, ctx.ssl), scanHeight || floorScanHeight(), viewSecret, spendSecret),
            async (wallet) => {
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
                    swapMixin(),
                    WB.FeeType.FixedFee(useFee),
                    undefined,
                    undefined,
                    wallet.getPrimaryAddress(),
                    true,
                    false,
                );
                if (!result.success) throw new Error(result.error.toString());
                return { txHash: result.transactionHash, amount: sendAmount, fee: useFee };
            },
        );
    },

    async confirmTx({ spendSecret, viewSecret, txHash, confirmations, timeoutMs, scanHeight }, ctx) {
        if (!spendSecret || !viewSecret || !txHash) throw new Error('spendSecret, viewSecret, txHash required');
        const need = typeof confirmations === 'number' ? confirmations : 1;
        return withWallet(
            () => WB.WalletBackend.importWalletFromKeys(makeDaemon(ctx.daemonHost, ctx.daemonPort, ctx.ssl), scanHeight || floorScanHeight(), viewSecret, spendSecret),
            async (wallet) => {
                const depth = await poll('tx confirmations', timeoutMs || 600000, 3000, async () => {
                    const tx = await wallet.getTransaction(txHash);
                    if (!tx || !tx.blockHeight) return null;
                    const [, , networkBlockCount] = wallet.getSyncStatus();
                    const d = networkBlockCount - tx.blockHeight + 1;
                    return d >= need ? d : null;
                });
                return { confirmed: true, confirmations: depth };
            },
        );
    },

    async lockSend({ senderSpendSecret, senderViewSecret, destAddress, amount, fee, scanHeight }, ctx) {
        if (!senderSpendSecret || !senderViewSecret || !destAddress || !amount) {
            throw new Error('senderSpendSecret, senderViewSecret, destAddress, amount required');
        }
        const useFee = typeof fee === 'number' ? fee : DEFAULT_FEE;

        const mainWallet = mainWalletIfMatches(ctx, senderSpendSecret);
        if (mainWallet) {
            return withMainWalletWriteLock(async () => {
                const [unlocked] = await mainWallet.getBalance();
                if (unlocked < amount + useFee) {
                    throw new Error(`insufficient spendable XKR for lock: have ${unlocked}, need ${amount + useFee}`);
                }
                const result = await mainWallet.sendTransactionAdvanced(
                    [[destAddress, amount]],
                    swapMixin(),
                    WB.FeeType.FixedFee(useFee),
                    undefined,
                    undefined,
                    mainWallet.getPrimaryAddress(),
                    true,
                    false,
                );
                if (!result.success) throw new Error(result.error.toString());
                return { txHash: result.transactionHash, amount, fee: useFee };
            });
        }

        return withWallet(
            () => WB.WalletBackend.importWalletFromKeys(makeDaemon(ctx.daemonHost, ctx.daemonPort, ctx.ssl), scanHeight || floorScanHeight(), senderViewSecret, senderSpendSecret),
            async (wallet) => {
                await poll('spendable balance for lock', 180000, 2000, async () => {
                    const [u] = await wallet.getBalance();
                    return u >= amount + useFee ? u : null;
                });
                const result = await wallet.sendTransactionAdvanced(
                    [[destAddress, amount]],
                    swapMixin(),
                    WB.FeeType.FixedFee(useFee),
                    undefined,
                    undefined,
                    wallet.getPrimaryAddress(),
                    true,
                    false,
                );
                if (!result.success) throw new Error(result.error.toString());
                return { txHash: result.transactionHash, amount, fee: useFee };
            },
        );
    },

    async balance({ spendSecret, viewSecret, scanHeight }, ctx) {
        if (!spendSecret || !viewSecret) throw new Error('spendSecret, viewSecret required');

        const mainWallet = mainWalletIfMatches(ctx, spendSecret);
        if (mainWallet) {
            let [unlocked, locked] = await mainWallet.getBalance();
            const remaining = ctx.makerRemaining && ctx.makerRemaining();
            if (typeof remaining === "number") unlocked = Math.min(unlocked, remaining);
            return { unlocked, locked };
        }

        return withWallet(
            () => WB.WalletBackend.importWalletFromKeys(makeDaemon(ctx.daemonHost, ctx.daemonPort, ctx.ssl), scanHeight || floorScanHeight(), viewSecret, spendSecret),
            async (wallet) => {
                await poll('balance sync', 60000, 2000, async () => {
                    const [walletHeight, , networkHeight] = wallet.getSyncStatus();
                    return networkHeight > 0 && walletHeight >= networkHeight - 1 ? true : null;
                }).catch(() => {});
                const [unlocked, locked] = await wallet.getBalance();
                return { unlocked, locked };
            },
        );
    },
};

function start({ port, daemonHost, daemonPort, ssl, getMainWallet, makerRemaining }) {
    const ctx = { daemonHost, daemonPort, ssl: !!ssl, getMainWallet, makerRemaining };
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
