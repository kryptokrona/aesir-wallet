// Child-process manager for a LOCAL maker (xkr-swap-core's `swap-asb` binary).
// A taker swap needs a maker (ASB) to swap against; for a self-contained wallet
// demo we can run one locally as a managed child.
//
// NOTE: `swap-asb ... start` requires a pre-existing config.toml (otherwise it
// drops into interactive setup, which can't run headless). Generating a valid
// ASB config -- the TOML, the ASB's funded XKR wallet keys, the Bitcoin electrum
// URL, and the libp2p listen address -- is a follow-up sub-task. This manager
// handles the process lifecycle and expects `configPath` to point at a ready
// config; it is non-fatal if the binary or config is missing.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let asbProcess;

// Resolve the ASB binary:
//   1. XKR_SWAP_ASB_BIN env var (dev / explicit override)
//   2. packaged app: <resources>/bin/swap-asb[.exe]
function resolveAsbBinary(app) {
  const fromEnv = process.env.XKR_SWAP_ASB_BIN;
  if (fromEnv) return fromEnv;
  const exe = process.platform === "win32" ? "swap-asb.exe" : "swap-asb";
  if (app && app.isPackaged) {
    return path.join(process.resourcesPath, "bin", exe);
  }
  return null;
}

// Spawn the local ASB maker. Non-fatal on any failure.
//
// Params:
//   app         - electron app (for isPackaged / resourcesPath)
//   configPath  - path to a ready swap-asb config.toml (required)
//   testnet     - run with --testnet defaults
//   env         - extra env vars (e.g. XKR_ASB_SPEND_SECRET / XKR_ASB_VIEW_SECRET,
//                 XKR_WALLET_RPC_URL) the ASB needs for the XKR side
//   onLog       - optional (text, stream) log callback
function startAsb({ app, configPath, testnet = true, env = {}, onLog } = {}) {
  stopAsb();

  const bin = resolveAsbBinary(app);
  if (!bin || !fs.existsSync(bin)) {
    console.warn(
      "swap-asb binary not found" +
        (bin ? ` at ${bin}` : "") +
        " (set XKR_SWAP_ASB_BIN); local maker not started",
    );
    return null;
  }
  if (!configPath || !fs.existsSync(configPath)) {
    console.warn(
      `swap-asb config not found${configPath ? ` at ${configPath}` : ""}; ` +
        "local maker not started (generate a config.toml first)",
    );
    return null;
  }

  const args = [];
  if (testnet) args.push("--testnet");
  args.push("--config", configPath, "start");

  const child = spawn(bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  asbProcess = child;

  const log = (data, stream) => {
    const text = data.toString().trim();
    if (!text) return;
    console.log(`[xkr-swap-asb] ${text}`);
    if (onLog) onLog(text, stream);
  };
  child.stdout.on("data", (d) => log(d, "stdout"));
  child.stderr.on("data", (d) => log(d, "stderr"));
  child.on("exit", (code, signal) => {
    console.log(`[xkr-swap-asb] exited (code=${code}, signal=${signal})`);
    if (asbProcess === child) asbProcess = undefined;
  });
  child.on("error", (err) => {
    console.error(`[xkr-swap-asb] spawn error: ${err.message}`);
    if (asbProcess === child) asbProcess = undefined;
  });

  console.log(`[xkr-swap-asb] spawned ${bin} ${args.join(" ")}`);
  return child;
}

function stopAsb() {
  if (!asbProcess) return;
  try {
    asbProcess.kill();
  } catch (e) {
    console.error(`[xkr-swap-asb] failed to kill: ${e.message}`);
  }
  asbProcess = undefined;
}

function isRunning() {
  return !!asbProcess;
}

module.exports = { startAsb, stopAsb, isRunning, resolveAsbBinary };
