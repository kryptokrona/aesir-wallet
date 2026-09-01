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
let engineOpts; // last startEngine() options, so a crashed daemon can be respawned
let engineRestarts = []; // timestamps of recent auto-restarts (crash-loop guard)

// Resolve the swap engine binary:
//   1. XKR_SWAP_ENGINE_BIN env var (dev / explicit override)
//   2. packaged app: <resources>/bin/swap[.exe]  (electron-builder extraResources)
//   3. dev fallback: a sibling xkr-swap-core checkout's built binary, so the
//      engine auto-starts in `npm run dev` without any env once it's built.
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

// Spawn the taker `swap serve` daemon. Non-fatal: if the binary is missing or
// fails to spawn, the wallet keeps working (swaps are just unavailable).
//
// Params:
//   app          - electron app (for isPackaged / resourcesPath)
//   xkrRpcPort   - port of the local XKR wallet RPC service (xkr-wallet-rpc.cjs)
//   servePort    - port the taker JSON-RPC daemon should listen on
//   electrumUrl  - Bitcoin electrum RPC URL for the BTC side
//   testnet      - whether to run with --testnet defaults
//   seedKey      - 64-char hex of the XKR wallet's private spend key; when given,
//                  the engine derives its whole wallet (BTC + identity) from it,
//                  so the XKR wallet seed restores everything
//   rendezvous   - comma-separated rendezvous multiaddrs (each with /p2p/<id>)
//                  the taker queries to discover makers
//   onLog        - optional (text, stream) log callback
function startEngine(opts = {}) {
  const { app, xkrRpcPort, servePort, electrumUrl, testnet = true, seedKey, rendezvous, xkrReceiveAddress, onLog } =
    opts;
  stopEngine();
  engineOpts = opts; // remembered for crash-respawn

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
      // Derive the engine's whole wallet from the XKR wallet key when provided.
      ...(seedKey ? { XKR_SWAP_SEED_KEY: seedKey } : {}),
      // Rendezvous points for maker discovery.
      ...(rendezvous ? { XKR_SWAP_RENDEZVOUS: rendezvous } : {}),
      // Where redeemed XKR is swept. The engine does NOT persist the per-swap
      // receive address, so on RESUME it reads this env var (bob.rs from_db) --
      // without it a resumed swap sweeps to an empty address and fails. All swaps
      // receive to the wallet's own primary address, matching the swap UI.
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
    // A crash while the app is running otherwise silently breaks the wallet (no
    // BTC balance, no swaps) until the next wallet reload. Respawn it, unless we
    // killed it on purpose (stopEngine) or it is crash-looping.
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

// Respawn the daemon after an unexpected exit, with a crash-loop guard so a
// binary that dies immediately doesn't spin forever. Reuses the last options.
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
  engineProcess._intentionalStop = true; // suppress crash-respawn for a deliberate kill
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
