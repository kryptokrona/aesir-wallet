#!/usr/bin/env node
// Downloads the XKR and Bitcoin (Electrum) node lists into static/offline-nodes/
// so the pickers still have a list when GitHub is unreachable. Bundled at build
// time and in CI; the committed copies are the fallback. A failed fetch keeps the
// existing bundled copy and never fails the build.
const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.join(__dirname, "..", "static", "offline-nodes");

const SOURCES = {
  xkr: "https://raw.githubusercontent.com/kryptokrona/kryptokrona-public-nodes/main/nodes.json",
  btcMainnet: "https://raw.githubusercontent.com/spesmilo/electrum/master/electrum/chains/mainnet/servers.json",
  btcTestnet: "https://raw.githubusercontent.com/spesmilo/electrum/master/electrum/chains/testnet/servers.json",
};

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "aesir-fetch-nodes" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
          res.resume();
          return get(res.headers.location, redirects + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

async function fetchJson(url) {
  return JSON.parse(await get(url));
}

// Electrum servers.json is { host: { s: sslPort, t: tcpPort, ... } }. Prefer SSL.
function normalizeElectrum(servers) {
  const nodes = [];
  for (const [host, info] of Object.entries(servers || {})) {
    if (info && info.s) nodes.push({ name: host, url: `ssl://${host}:${info.s}` });
    else if (info && info.t) nodes.push({ name: host, url: `tcp://${host}:${info.t}` });
  }
  return { nodes };
}

function write(file, data) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(data, null, 2) + "\n");
}

function keep(file, err) {
  const exists = fs.existsSync(path.join(OUT_DIR, file));
  console.warn(
    `[fetch-nodes] ${file}: fetch failed (${err.message}); ` +
      (exists ? "keeping existing bundled copy" : "no bundled copy exists yet"),
  );
}

async function run(file, url, transform = (x) => x) {
  try {
    write(file, transform(await fetchJson(url)));
    console.log(`[fetch-nodes] ${file} updated`);
  } catch (e) {
    keep(file, e);
  }
}

async function main() {
  await run("xkr.json", SOURCES.xkr);
  await run("btc-mainnet.json", SOURCES.btcMainnet, normalizeElectrum);
  await run("btc-testnet.json", SOURCES.btcTestnet, normalizeElectrum);
}

main();
