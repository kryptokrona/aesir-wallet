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

// Resolve the ASB binary (the swap-asb crate builds a bin named `asb`):
//   1. XKR_SWAP_ASB_BIN env var (dev / explicit override)
//   2. packaged app: <resources>/bin/asb[.exe]
//   3. dev fallback: a sibling xkr-swap-core checkout's built binary.
function resolveAsbBinary(app) {
  const fromEnv = process.env.XKR_SWAP_ASB_BIN;
  if (fromEnv) return fromEnv;
  const exe = process.platform === "win32" ? "asb.exe" : "asb";
  if (app && app.isPackaged) {
    return path.join(process.resourcesPath, "bin", exe);
  }
  for (const profile of ["debug", "release"]) {
    const dev = path.join(__dirname, "../../../../xkr-swap-core/target", profile, exe);
    if (fs.existsSync(dev)) return dev;
  }
  return null;
}

// Generate a default config.toml at `configPath` by running the ASB's own
// non-interactive `generate-config` command (so the TOML is correct by
// construction). Resolves true on success. Non-fatal.
//
// NOTE: the generated config yields a maker that still needs a FUNDED XKR wallet
// (keys via XKR_ASB_SPEND_SECRET / XKR_ASB_VIEW_SECRET) before it can lock XKR.
function generateConfig({ app, configPath, testnet = true, force = false, env = {} } = {}) {
  return new Promise((resolve) => {
    const bin = resolveAsbBinary(app);
    if (!bin || !fs.existsSync(bin)) {
      console.warn("swap-asb binary not found; cannot generate config");
      return resolve(false);
    }
    const args = [];
    if (testnet) args.push("--testnet");
    if (configPath) args.push("--config", configPath);
    args.push("generate-config");
    if (force) args.push("--force");

    // Pass env (e.g. XKR_SWAP_RENDEZVOUS) so the generated config embeds it.
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
    child.stdout.on("data", (d) => console.log(`[xkr-swap-asb] ${d.toString().trim()}`));
    child.stderr.on("data", (d) => console.log(`[xkr-swap-asb] ${d.toString().trim()}`));
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", (err) => {
      console.error(`[xkr-swap-asb] generate-config error: ${err.message}`);
      resolve(false);
    });
  });
}

// Spawn the local ASB maker. Non-fatal on any failure. If the config is missing
// and `autoGenerateConfig` is set (default), it is generated first.
//
// Params:
//   app                - electron app (for isPackaged / resourcesPath)
//   configPath         - path to a swap-asb config.toml
//   testnet            - run with --testnet defaults
//   autoGenerateConfig - generate the config if it doesn't exist (default true)
//   env                - extra env vars (e.g. XKR_ASB_SPEND_SECRET /
//                        XKR_ASB_VIEW_SECRET, XKR_WALLET_RPC_URL)
//   onLog              - optional (text, stream) log callback
async function startAsb({ app, configPath, testnet = true, autoGenerateConfig = true, env = {}, onLog } = {}) {
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
  if (!configPath) {
    console.warn("swap-asb config path not provided; local maker not started");
    return null;
  }
  if (!fs.existsSync(configPath)) {
    if (!autoGenerateConfig) {
      console.warn(`swap-asb config not found at ${configPath}; local maker not started`);
      return null;
    }
    const ok = await generateConfig({ app, configPath, testnet, env });
    if (!ok || !fs.existsSync(configPath)) {
      console.warn("swap-asb config generation failed; local maker not started");
      return null;
    }
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

module.exports = { startAsb, stopAsb, isRunning, resolveAsbBinary, generateConfig };
