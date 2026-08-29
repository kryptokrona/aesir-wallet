// Child-process manager for the Rust swap engine's TAKER daemon
// (xkr-swap-core's `swap` binary, `serve` subcommand). The wallet app spawns it
// as a child; it boots a taker `Context` (libp2p swarm + Bitcoin electrum
// wallet), reaches the XKR chain through the local XKR wallet JSON-RPC service
// (./xkr-wallet-rpc.cjs, via the XKR_WALLET_RPC_URL env var), and exposes a
// JSON-RPC API on `servePort` that the renderer drives (see ./swap-rpc.cjs).

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let engineProcess;

// Resolve the swap engine binary:
//   1. XKR_SWAP_ENGINE_BIN env var (dev / explicit override)
//   2. packaged app: <resources>/bin/swap[.exe]  (electron-builder extraResources)
function resolveEngineBinary(app) {
  const fromEnv = process.env.XKR_SWAP_ENGINE_BIN;
  if (fromEnv) return fromEnv;
  const exe = process.platform === "win32" ? "swap.exe" : "swap";
  if (app && app.isPackaged) {
    return path.join(process.resourcesPath, "bin", exe);
  }
  return null;
}

// Spawn the taker `swap serve` daemon. Non-fatal: if the binary is missing or
// fails to spawn, the wallet keeps working (swaps are just unavailable).
//
// Params:
//   app          - electron app (for isPackaged / resourcesPath)
//   xkrRpcPort   - port of the local XKR wallet RPC service (xkr-wallet-rpc.cjs)
//   servePort    - port the taker JSON-RPC daemon should listen on
//   electrumUrl  - Bitcoin electrum RPC URL for the BTC side
//   testnet      - whether to run with --testnet defaults
//   onLog        - optional (text, stream) log callback
function startEngine({ app, xkrRpcPort, servePort, electrumUrl, testnet = true, onLog } = {}) {
  stopEngine();

  const bin = resolveEngineBinary(app);
  if (!bin || !fs.existsSync(bin)) {
    console.warn(
      "xkr-swap engine binary not found" +
        (bin ? ` at ${bin}` : "") +
        " (set XKR_SWAP_ENGINE_BIN); swap engine not started",
    );
    return null;
  }

  const args = ["serve", "--rpc-port", String(servePort)];
  if (testnet) args.unshift("--testnet");
  if (electrumUrl) args.push("--electrum-rpc", electrumUrl);

  const child = spawn(bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // The engine reaches the XKR chain through the local wallet RPC service.
      XKR_WALLET_RPC_URL: `http://127.0.0.1:${xkrRpcPort}`,
    },
  });
  engineProcess = child;

  const log = (data, stream) => {
    const text = data.toString().trim();
    if (!text) return;
    console.log(`[xkr-swap-engine] ${text}`);
    if (onLog) onLog(text, stream);
  };
  child.stdout.on("data", (d) => log(d, "stdout"));
  child.stderr.on("data", (d) => log(d, "stderr"));
  child.on("exit", (code, signal) => {
    console.log(`[xkr-swap-engine] exited (code=${code}, signal=${signal})`);
    if (engineProcess === child) engineProcess = undefined;
  });
  child.on("error", (err) => {
    console.error(`[xkr-swap-engine] spawn error: ${err.message}`);
    if (engineProcess === child) engineProcess = undefined;
  });

  console.log(
    `[xkr-swap-engine] spawned ${bin} ${args.join(" ")} ` +
      `(XKR_WALLET_RPC_URL=http://127.0.0.1:${xkrRpcPort})`,
  );
  return child;
}

function stopEngine() {
  if (!engineProcess) return;
  try {
    engineProcess.kill();
  } catch (e) {
    console.error(`[xkr-swap-engine] failed to kill: ${e.message}`);
  }
  engineProcess = undefined;
}

function isRunning() {
  return !!engineProcess;
}

module.exports = { startEngine, stopEngine, isRunning, resolveEngineBinary };
