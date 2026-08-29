# XKR atomic-swap integration

This directory is the Kryptokrona (XKR) side of BTC↔XKR atomic swaps inside the
wallet. The heavy swap protocol — the Bitcoin side, the cross-curve DLEQ and
adaptor-signature crypto, and the swap state machine — lives in the Rust engine
(`xkr-swap-core`, a fork of `eigenwallet/core`). Everything that touches the
Kryptokrona chain lives here, in JavaScript, reusing `kryptokrona-wallet-backend-js`.

```
  Rust swap engine (xkr-swap-core, child process)
        │  HTTP JSON-RPC  (127.0.0.1:40000)
        ▼
  xkr-wallet-rpc.cjs   ── wallet-backend-js ──▶  Kryptokrona daemon
```

## Files

- **`xkr-wallet-rpc.cjs`** — a local JSON-RPC service (Node `http`, no new deps).
  Methods: `ping`, `encodeAddress`, `watchForLock`, `sweep`. Backed by
  `wallet-backend-js`. Started by `electron.cjs` on `start-wallet`, pointed at the
  same node the wallet uses; closed on quit.
- **`engine.cjs`** — spawns the Rust engine's TAKER daemon (`swap serve`) as a
  child. It boots a taker `Context` (libp2p swarm + Bitcoin electrum wallet),
  reaches the XKR chain through `xkr-wallet-rpc.cjs` (via `XKR_WALLET_RPC_URL`),
  and exposes a JSON-RPC API on the serve port. Non-fatal if the binary is missing.
- **`swap-rpc.cjs`** — a tiny JSON-RPC client (Node `http`) the `electron.cjs` IPC
  handlers use to call the taker daemon: `status`, `buy_xmr_direct`, `swap_infos`
  (poll progress), `history`, `balance`, `resume`.
- **`asb.cjs`** — child-process manager for a LOCAL maker (`swap-asb`), so a swap
  can complete self-contained. Requires a ready `config.toml` (generating it +
  the ASB's funded XKR keys is a follow-up). Non-fatal if missing.

Renderer IPC (all via `window.api.invoke(...)`):
`swap-rpc-status` → `{ running, port, servePort, engineRunning, asbRunning }`;
`swap-start` (args `{ sellerMultiaddr, sellerPeerId, amountSat, xkrReceiveAddress,
changeAddress? }`), `swap-infos`, `swap-history`, `swap-balance`,
`swap-resume` (swapId), `swap-asb-start` (`{ configPath, env? }`).

## Running the engine

`engine.cjs` resolves the binary as:

1. `XKR_SWAP_ENGINE_BIN` env var (development / explicit override), else
2. packaged app: `<resources>/bin/swap[.exe]`.

**Dev:** build the engine and point the app at it:

```bash
cargo build -p swap --bin swap --manifest-path ../xkr-swap-core/Cargo.toml
XKR_SWAP_ENGINE_BIN="$(pwd)/../xkr-swap-core/target/debug/swap" npm run dev
# for a local maker (optional): build swap-asb and set XKR_SWAP_ASB_BIN too
cargo build -p swap-asb --manifest-path ../xkr-swap-core/Cargo.toml
```

**Packaging:** `build.config.json` bundles `bin/*` via `extraResources` and
`src/backend/swap/*` via `files`. Before `electron-builder` runs, build the engine
for the target and copy it in:

```bash
cargo build -p swap --bin swap --release --manifest-path ../xkr-swap-core/Cargo.toml
cp ../xkr-swap-core/target/release/swap bin/swap   # or swap.exe on Windows
# and, for a bundled local maker: cp ../xkr-swap-core/target/release/swap-asb bin/swap-asb
```

(For release builds this should be wired into the `build:*` npm scripts / CI,
cross-compiling `swap` per target.)
