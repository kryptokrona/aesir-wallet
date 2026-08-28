// Child-process manager for the Rust swap engine (xkr-swap-core's `xkr-wallet`
// binary, and eventually the full swap engine). The wallet app spawns it as a
// child in `serve` mode; it connects to the local XKR wallet JSON-RPC service
// (./xkr-wallet-rpc.cjs) and drives the XKR side of BTC<->XKR atomic swaps.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let engineProcess;

// Resolve the engine binary:
//   1. XKR_SWAP_ENGINE_BIN env var (dev / explicit override)
//   2. packaged app: <resources>/bin/xkr-wallet[.exe]  (electron-builder extraResources)
function resolveEngineBinary(app) {
  const fromEnv = process.env.XKR_SWAP_ENGINE_BIN;
  if (fromEnv) return fromEnv;
  const exe = process.platform === "win32" ? "xkr-wallet.exe" : "xkr-wallet";
  if (app && app.isPackaged) {
    return path.join(process.resourcesPath, "bin", exe);
  }
  return null;
}

// Spawn the engine, pointed at the local XKR wallet RPC service. Non-fatal: if
// the binary is missing or fails to spawn, the wallet keeps working.
function startEngine({ app, rpcPort, onLog } = {}) {
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

  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  const child = spawn(bin, ["--rpc-url", rpcUrl, "serve"], {
    stdio: ["ignore", "pipe", "pipe"],
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

  console.log(`[xkr-swap-engine] spawned ${bin} -> ${rpcUrl}`);
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
