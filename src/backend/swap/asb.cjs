const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let asbProcess;
let asbFingerprint;

function asbConfigFingerprint(env, startArgs, configPath) {
  return JSON.stringify({ env: env || {}, startArgs: startArgs || [], configPath: configPath || "" });
}

function disableTor(configPath) {
  try {
    if (!configPath || !fs.existsSync(configPath)) return;
    let toml = fs.readFileSync(configPath, "utf8");
    const before = toml;
    toml = toml
      .replace(/^\s*register_hidden_service\s*=\s*true\s*$/m, "register_hidden_service = false")
      .replace(/^\s*wormhole_enabled\s*=\s*true\s*$/m, "wormhole_enabled = false");
    if (toml !== before) {
      fs.writeFileSync(configPath, toml);
      console.log("[xkr-swap-asb] disabled Tor (hidden service + wormhole) in config");
    }
  } catch (e) {
    console.warn(`[xkr-swap-asb] could not patch Tor settings: ${e.message}`);
  }
}

function zeroAskSpread(configPath) {
  try {
    if (!configPath || !fs.existsSync(configPath)) return;
    let toml = fs.readFileSync(configPath, "utf8");
    const patched = toml.replace(/^(\s*ask_spread\s*=\s*)"?[0-9.]+"?\s*$/m, "$1" + "0.0");
    if (patched !== toml) {
      fs.writeFileSync(configPath, patched);
      console.log("[xkr-swap-asb] set maker ask_spread = 0 (slider price is the final ask)");
    }
  } catch (e) {
    console.warn(`[xkr-swap-asb] could not patch ask_spread: ${e.message}`);
  }
}

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

async function startAsb({ app, configPath, testnet = true, autoGenerateConfig = true, env = {}, startArgs = [], onLog } = {}) {
  const fp = asbConfigFingerprint(env, startArgs, configPath);
  if (asbProcess && asbFingerprint === fp) {
    console.log("[xkr-swap-asb] already running with identical config; reusing existing process");
    return asbProcess;
  }
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

  disableTor(configPath);
  zeroAskSpread(configPath);

  const args = [];
  if (testnet) args.push("--testnet");
  args.push("--config", configPath, "start", ...startArgs);

  const child = spawn(bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  asbProcess = child;
  asbFingerprint = fp;

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
    if (asbProcess === child) {
      asbProcess = undefined;
      asbFingerprint = undefined;
    }
  });
  child.on("error", (err) => {
    console.error(`[xkr-swap-asb] spawn error: ${err.message}`);
    if (asbProcess === child) {
      asbProcess = undefined;
      asbFingerprint = undefined;
    }
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
  asbFingerprint = undefined;
}

function isRunning() {
  return !!asbProcess;
}

module.exports = { startAsb, stopAsb, isRunning, resolveAsbBinary, generateConfig };
