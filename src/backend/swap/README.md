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
- **`engine.cjs`** — spawns the Rust engine binary (`xkr-wallet`) as a child in
  `serve` mode, pointed at the RPC service. Non-fatal if the binary is missing.

The renderer can query `window.api.invoke("swap-rpc-status")` →
`{ running, port, engineRunning }`.

## Running the engine

`engine.cjs` resolves the binary as:

1. `XKR_SWAP_ENGINE_BIN` env var (development / explicit override), else
2. packaged app: `<resources>/bin/xkr-wallet[.exe]`.

**Dev:** build the engine and point the app at it:

```bash
cargo build -p xkr-wallet --manifest-path ../xkr-swap-core/Cargo.toml
XKR_SWAP_ENGINE_BIN="$(pwd)/../xkr-swap-core/target/debug/xkr-wallet" npm run dev
```

**Packaging:** `build.config.json` bundles `bin/*` via `extraResources` and
`src/backend/swap/*` via `files`. Before `electron-builder` runs, build the engine
for the target and copy it in:

```bash
cargo build -p xkr-wallet --release --manifest-path ../xkr-swap-core/Cargo.toml
cp ../xkr-swap-core/target/release/xkr-wallet bin/xkr-wallet   # or xkr-wallet.exe on Windows
```

(For release builds this should be wired into the `build:*` npm scripts / CI,
cross-compiling `xkr-wallet` per target.)
