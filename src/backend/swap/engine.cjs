const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let engineProcess;
let engineOpts;
let engineRestarts = [];

function resolveEngineBinary(app) {
  const fromEnv = process.env.XKR_SWAP_ENGINE_BIN;
  if (fromEnv) return fromEnv;
  const exe = process.platform === "win32" ? "swap.exe" : "swap";
  if (app && app.isPackaged) {
    return path.join(process.resourcesPath, "bin", exe);
  }
  for (const profile of ["debug", "release"]) {
    const dev = path.join(__dirname, "../../../../xkr-swap-core/target", profile, exe);
    if (fs.existsSync(dev)) return dev;
  }
  return null;
}

function startEngine(opts = {}) {
  const { app, xkrRpcPort, servePort, electrumUrl, testnet = true, seedKey, rendezvous, xkrReceiveAddress, onLog } =
    opts;
  stopEngine();
  engineOpts = opts;

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
      XKR_WALLET_RPC_URL: `http://127.0.0.1:${xkrRpcPort}`,
      ...(seedKey ? { XKR_SWAP_SEED_KEY: seedKey } : {}),
      ...(rendezvous ? { XKR_SWAP_RENDEZVOUS: rendezvous } : {}),
      ...(xkrReceiveAddress ? { XKR_RECEIVE_ADDRESS: xkrReceiveAddress } : {}),
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
    if (!child._intentionalStop) maybeRespawn();
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

function maybeRespawn() {
  if (!engineOpts) return;
  const now = Date.now();
  engineRestarts = engineRestarts.filter((t) => now - t < 60000);
  if (engineRestarts.length >= 3) {
    console.error("[xkr-swap-engine] daemon crashed repeatedly; giving up until the wallet is reloaded");
    return;
  }
  engineRestarts.push(now);
  console.log("[xkr-swap-engine] daemon exited unexpectedly; respawning in 3s");
  setTimeout(() => {
    if (!engineProcess && engineOpts) startEngine(engineOpts);
  }, 3000);
}

function stopEngine() {
  if (!engineProcess) return;
  engineProcess._intentionalStop = true;
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

function restart(overrides = {}) {
  if (!engineOpts) return null;
  return startEngine({ ...engineOpts, ...overrides });
}

module.exports = { startEngine, stopEngine, isRunning, restart, resolveEngineBinary };
