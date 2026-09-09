const windowStateManager = require("electron-window-state");
const contextMenu = require("electron-context-menu");
const { app, BrowserWindow, ipcMain, systemPreferences, powerMonitor, dialog, globalShortcut } = require("electron");

// In development the app name defaults to "Electron", so every dev Electron app
// shares ~/Library/Application Support/Electron. Give this app its own folder.
// Must run before any userData path is resolved (electron-store below).
if (!app.isPackaged) app.setName("AesirDev");
const serve = require("electron-serve");
const path = require("path");
const WB = require("kryptokrona-wallet-backend-js");
const { Address } = require("kryptokrona-utils");
const xkrSwap = require("./swap/xkr-wallet-rpc.cjs");
const xkrSwapEngine = require("./swap/engine.cjs");
const xkrSwapRpc = require("./swap/swap-rpc.cjs");
const swapSwarm = require("./swap/swap-swarm.cjs");
const asbRpc = require("./swap/asb-rpc.cjs");
const xkrSwapAsb = require("./swap/asb.cjs");
const notifier = require("node-notifier");
const Crypto = require("kryptokrona-crypto").Crypto;
const fetch = require("cross-fetch");
const keytar = require("keytar");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const nodeCrypto = require("crypto");
const { error } = require("console");


try {
  require("electron-reloader")(module);
} catch (e) {
  console.error(e);
}

const serveURL = serve({ directory: "." });
const port = process.env.PORT || 5173;
const dev = !app.isPackaged;
let mainWindow;

let userDataDir = app.getPath("userData");
const crypto = new Crypto();

function createWindow() {
  let windowState = windowStateManager({
    defaultWidth: 700,
    defaultHeight: 600
  });

  const mainWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    maxHeight: 700,
    maxWidth: 600,
    minHeight: 700,
    minWidth: 600,
    webPreferences: {
      enableRemoteModule: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: true,
      preload: path.join(__dirname, "preload.cjs")
    },
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height
  });

  windowState.manage(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("close", () => {
    windowState.saveState(mainWindow);
  });

  
  if (dev) {
    console.log('Running in development')
    mainWindow.openDevTools()
  }

  return mainWindow;
}

contextMenu({
  showLookUpSelection: false,
  showSearchWithGoogle: false,
  showCopyImage: false,
  prepend: (defaultActions, params, browserWindow) => [
    {
      label: "Make App 💻"
    }
  ]
});

function loadVite(port) {
  mainWindow.loadURL(`http://localhost:${port}`).catch((e) => {
    console.log("Error loading URL, retrying", e);
    setTimeout(() => {
      loadVite(port);
    }, 200);
  });
}

function createMainWindow() {
  mainWindow = createWindow();
  mainWindow.once("close", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'r') {
        event.preventDefault()
    }
  })

  mainWindow.setMenu(null)

  globalShortcut.unregisterAll()

  if (dev) loadVite(port);
  else serveURL(mainWindow);
}

app.once("ready", createMainWindow);

app.on("activate", () => {
  if (!mainWindow) {
    createMainWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  xkrSwapEngine.stopEngine();
  xkrSwapAsb.stopAsb();
  if (xkrSwapServer) {
    xkrSwapServer.close();
    xkrSwapServer = undefined;
  }
});

ipcMain.on("quit", () => {
  app.quit();
});

ipcMain.on("minimize", () => {
  mainWindow.minimize();
});


//ABOVE IS ALL ELECTRON
// 🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨
//BELOW IS WALLET APP

let walletBackend;
let node;
let ports;
let daemon;

// Local JSON-RPC service that handles the XKR (Kryptokrona) side of atomic
// swaps, backed by wallet-backend-js. The Rust swap engine (xkr-swap-core)
// drives it over 127.0.0.1:XKR_SWAP_RPC_PORT. See ./swap/xkr-wallet-rpc.cjs.
const XKR_SWAP_RPC_PORT = 40000;
// Port the taker `swap serve` daemon (the Rust engine) listens on for the
// renderer's JSON-RPC calls (start swap / poll progress).
const XKR_SWAP_SERVE_PORT = 40010;
// Bitcoin electrum RPC URL for the BTC side of a swap. Overridable via env for
// dev/regtest; defaults to a public testnet electrum server.
// Empty by default so the engine uses its built-in multi-server testnet electrum
// list (with failover) instead of a single server -- a single public electrum
// (e.g. Blockstream) rate-limits/stalls the initial wallet scan. Override with
// XKR_SWAP_ELECTRUM_URL to force a specific server.
const XKR_SWAP_ELECTRUM_URL = process.env.XKR_SWAP_ELECTRUM_URL || "";
// XKR rendezvous point(s) for maker discovery: comma-separated multiaddrs, each
// with a /p2p/<peer-id> part. Defaults to the deployed XKR rendezvous node;
// override with XKR_SWAP_RENDEZVOUS (empty string disables discovery).
const XKR_SWAP_RENDEZVOUS =
  process.env.XKR_SWAP_RENDEZVOUS ??
  "/dns4/deploy.cloud.cbh.kth.se/tcp/20235/p2p/12D3KooW9xM8oboXDBcmF1JrYXKWJjwAYufsEL5Aq8iGFHArMsUd";
let xkrSwapServer;

xkrSwapRpc.setServePort(XKR_SWAP_SERVE_PORT);

const wallets = new Store();
const nodes = new Store();
const contacts = new Store();
const miscs = new Store();
// Persistent cache of every swap ever seen (taker + maker), keyed by swap_id, so
// the history survives the engine/ASB being down and needn't be re-fetched from
// the binaries just to view it. Its own file to keep the (growing) list isolated.
const swapsStore = new Store({ name: "swaps" });

// A short, stable, filesystem-safe id for the currently-open XKR wallet, used to
// key ALL swap state per wallet so different wallets never see each other's swaps:
// it scopes the swap cache below AND the ASB's data dir (XKR_ASB_DATA_DIR). Derived
// from the primary address (a hash, so it's not the address verbatim in paths).
// Returns null when no wallet is loaded.
function walletKey() {
  try {
    const addr = walletBackend && walletBackend.getPrimaryAddress ? walletBackend.getPrimaryAddress() : null;
    if (!addr) return null;
    return nodeCrypto.createHash("sha256").update(addr).digest("hex").slice(0, 16);
  } catch (_) {
    return null;
  }
}

// The engine stamps start_date via Rust's `time` OffsetDateTime Display, e.g.
// "2026-09-07 21:19:26.642276 +00:00:00" -- which JS Date can't parse. Normalize
// to ISO-8601 so sorts order by real time (unparseable -> 0, i.e. sorts last).
function swapDateMs(str) {
  if (!str) return 0;
  let t = Date.parse(str);
  if (Number.isFinite(t)) return t;
  const iso = String(str)
    .replace(" ", "T")
    .replace(/\s*([+-]\d{2}):?(\d{2})(?::\d{2})?$/, "$1:$2");
  t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

// Merge freshly-fetched swaps into the local cache. `role` is 'taker' (from the
// swap engine) or 'maker' (from the ASB); their state field differs, so normalize.
function cacheSwaps(list, role) {
  if (!Array.isArray(list) || !list.length) return;
  // Scope the cache to the open wallet so swaps never bleed between wallets.
  const wid = walletKey() || "default";
  const all = swapsStore.get("swaps") || {};
  const cache = all[wid] || {};
  for (const s of list) {
    if (!s || !s.swap_id) continue;
    cache[s.swap_id] = {
      swap_id: s.swap_id,
      btc_amount: s.btc_amount,
      xmr_amount: s.xmr_amount, // piconero -- drives the "XKR" amount in the monitor
      state_name: role === "maker" ? s.state : s.state_name,
      start_date: s.start_date,
      completed: !!s.completed,
      role,
      updated_at: Date.now(),
    };
  }
  all[wid] = cache;
  swapsStore.set("swaps", all);
}

// Start (or restart) the XKR swap RPC service pointed at the given node, so a
// swap uses the same daemon the wallet is connected to. Non-fatal on failure:
// the wallet keeps working even if the swap service can't bind.
async function startXkrSwapService(node) {
  try {
    if (xkrSwapServer) {
      xkrSwapServer.close();
      xkrSwapServer = undefined;
    }
    if (!node) return;
    // Floor the *shared-address* wallet reconstructions (watchForLock / sweep /
    // confirmTx re-import the ephemeral 2-of-2 deposit from keys) near the chain
    // tip so they don't sync from genesis (mainnet is 2.5M+ blocks). The shared
    // deposit is always created "now", so a recent floor is safe. The maker's own
    // balance and lock no longer go through a re-import at all -- they read/spend
    // the already-synced primary wallet directly (getMainWallet below), so there's
    // no coinbase-scan or scan-height guessing for the maker's inventory anymore.
    // Respect an explicit XKR_WALLET_SCAN_HEIGHT if the operator set one.
    try {
      if (!process.env.XKR_WALLET_SCAN_HEIGHT) {
        const info = await fetchTimeout(`${node.ssl ? "https://" : "http://"}${node.url}:${node.port}/getinfo`);
        const j = info.ok ? await info.json() : null;
        if (j && j.height) process.env.XKR_WALLET_SCAN_HEIGHT = String(Math.max(0, j.height - 1000));
      }
    } catch (_) {}
    xkrSwapServer = xkrSwap.start({
      port: XKR_SWAP_RPC_PORT,
      daemonHost: node.url,
      daemonPort: node.port,
      ssl: node.ssl,
      // Option A: the maker's balance/lock use the app's live, already-synced
      // wallet instead of a separate re-imported instance, so the ASB and the UI
      // can never disagree about the balance. Only maker-key operations match.
      getMainWallet: () => walletBackend,
    });
    xkrSwapServer.on("error", (err) => {
      console.error("xkr-swap RPC service error:", err.message);
    });
    // Spawn the taker `swap serve` daemon: it reaches the XKR chain through the
    // wallet RPC service above and exposes its own JSON-RPC on the serve port.
    xkrSwapEngine.startEngine({
      app,
      xkrRpcPort: XKR_SWAP_RPC_PORT,
      servePort: XKR_SWAP_SERVE_PORT,
      electrumUrl: XKR_SWAP_ELECTRUM_URL,
      testnet: true,
      rendezvous: XKR_SWAP_RENDEZVOUS,
      // Resumed swaps read their receive address from this env (not persisted by
      // the engine); use our primary XKR address when the wallet is loaded.
      xkrReceiveAddress:
        walletBackend && walletBackend.getPrimaryAddress ? walletBackend.getPrimaryAddress() : undefined,
    });
    // The daemon does NOT auto-resume in-flight swaps on boot, so a swap that was
    // mid-flight when the app closed/restarted would otherwise sit frozen (e.g.
    // stuck at "btc is locked") until manually resumed. Give the daemon a moment
    // to bind, then resume every unfinished swap so restarts are self-healing.
    setTimeout(resumeInFlightSwaps, 6000);
    // Same idea for the MAKER side: if we were mid-swap when the app closed, bring
    // the ASB back resume-only so its refunds/redeems finish on their own. Slightly
    // later so the XKR wallet RPC is bound first -- the ASB needs it.
    setTimeout(resumeMakerSwapsIfAny, 8000);
  } catch (e) {
    console.error("failed to start xkr-swap RPC service:", e.message);
  }
}

// Resume any swap the daemon has persisted as not-yet-completed. Safe to call
// repeatedly: resuming an already-finished swap is a no-op, and the daemon
// serialises work per swap behind its own lock.
// Wait (bounded) for a maker peer to (re)appear on the HyperSwarm board, so a
// resumed swap can be re-bridged to it. Returns the maker record or null.
async function waitForMakerOnBoard(discovery, peerId, timeoutMs = 45000) {
  const start = Date.now();
  for (;;) {
    const m = discovery.list().find((x) => x.peerId === peerId);
    if (m) return m;
    if (Date.now() - start >= timeoutMs) return null;
    await sleep(2000);
  }
}

// Resume every unfinished swap after an engine (re)start. Crucially, the engine's
// stored maker address is a dead HyperSwarm bridge port from the previous process,
// so we re-open a fresh bridge to the maker and hand resume() its new address --
// otherwise the resumed swap keeps dialing the dead port ("request channel
// closed") and can never finish, even though its XKR/BTC are on-chain.
async function resumeInFlightSwaps() {
  try {
    const infos = await xkrSwapRpc.swapInfos();
    if (!Array.isArray(infos)) return;
    const inflight = infos.filter((i) => i && i.completed === false && i.swap_id);
    if (!inflight.length) return;
    const discovery = ensureDiscovery();
    for (const info of inflight) {
      const peerId = info.seller && info.seller.peer_id;
      let multiaddr;
      try {
        const maker = peerId ? await waitForMakerOnBoard(discovery, peerId) : null;
        if (maker) {
          const bridge = await discovery.openSwapBridge(maker.xkrAddress);
          multiaddr = bridge.multiaddr;
          console.log(`resume: re-bridged swap ${info.swap_id} -> ${multiaddr}`);
        } else {
          console.warn(
            `resume: maker ${peerId} for swap ${info.swap_id} not on board; resuming without a fresh bridge (will refund on timelock if it can't reconnect)`,
          );
        }
      } catch (e) {
        console.error("resume: bridge setup failed for", info.swap_id, e.message);
      }
      xkrSwapRpc
        .resume(info.swap_id, multiaddr)
        .then(() => console.log("resumed in-flight swap", info.swap_id))
        .catch((err) => console.error("resume failed for", info.swap_id, err.message));
    }
  } catch (e) {
    console.error("failed to enumerate swaps for resume:", e.message);
  }
}

// Lets the renderer discover where the swap service is listening and whether
// the Rust engine child process is up.
ipcMain.handle("swap-rpc-status", () => ({
  running: !!xkrSwapServer,
  port: XKR_SWAP_RPC_PORT,
  servePort: XKR_SWAP_SERVE_PORT,
  engineRunning: xkrSwapEngine.isRunning(),
  asbRunning: xkrSwapAsb.isRunning(),
}));

// ---- Swap actions (renderer -> taker `swap serve` daemon over JSON-RPC) ----
// Each returns { ok, result } or { ok: false, error } so the renderer can show
// a clear message instead of an unhandled rejection.
async function swapRpc(fn) {
  try {
    return { ok: true, result: await fn() };
  } catch (e) {
    console.error("swap rpc error:", e.message);
    return { ok: false, error: e.message };
  }
}

// ---- HyperSwarm swap connectivity (no rendezvous) ----
// Discovery + per-swap NAT-traversing bridge live in swap-swarm.cjs; the Rust
// engine only ever sees local sockets.
let swapDiscovery = null; // taker: board discovery of makers
let swapMaker = null; // maker: board advertising, when market-making
let swapMakerPeerId = null; // this ASB's libp2p peer id, parsed from its log
let swapMakerError = null; // last maker-board start error, surfaced to the panel
let swapMakerRpc = null; // asb-rpc client: peer id, XKR inventory, swaps
let swapMakerAdvertised = null; // the quote actually being advertised (price/min/max)
let swapMakerPriceSats = null; // price the running ASB was started with (restart only on change)
let swapMakerResumeOnly = false; // true when the ASB was auto-started on boot ONLY to recover/refund unfinished swaps (not advertising)
const ASB_LISTEN_PORT = 9839; // must match the ASB config's libp2p `listen` tcp port
const ASB_RPC_PORT = 9945; // ASB control JSON-RPC (localhost, Bearer-authed)

function ensureDiscovery() {
  if (swapDiscovery) return swapDiscovery;
  swapDiscovery = swapSwarm.startDiscovery({
    onUpdate: (makers) => {
      try {
        mainWindow.webContents.send("swap-makers", makers);
      } catch (_) {}
    },
    log: (m) => console.log("[swap-swarm] " + m),
  });
  return swapDiscovery;
}

// Start a swap: open a private HyperSwarm beam to the chosen maker, then hand the
// Rust taker the local bridge address + the maker's real libp2p PeerId.
// args: { xkrAddress, amountSat, xkrReceiveAddress, changeAddress? }
ipcMain.handle("swap-start", (e, args) =>
  swapRpc(async () => {
    const bridge = await ensureDiscovery().openSwapBridge(args.xkrAddress);
    try {
      return await xkrSwapRpc.buyXmrDirect({
        sellerMultiaddr: bridge.multiaddr,
        sellerPeerId: bridge.peerId,
        amountSat: args.amountSat,
        xkrReceiveAddress: args.xkrReceiveAddress,
        changeAddress: args.changeAddress,
      });
    } catch (err) {
      bridge.close();
      throw err;
    }
  }),
);
// Poll all swaps + their current state (for progress).
ipcMain.handle("swap-infos", async () => {
  const res = await swapRpc(() => xkrSwapRpc.swapInfos());
  if (res.ok && Array.isArray(res.result)) cacheSwaps(res.result, "taker");
  return res;
});
// Merged, persistent swap history (taker + maker) read straight from the local
// cache -- available instantly and even when the engine/ASB are down.
ipcMain.handle("swap-history-cache", () => {
  const wid = walletKey() || "default";
  const cache = (swapsStore.get("swaps") || {})[wid] || {};
  const list = Object.values(cache).sort((a, b) => swapDateMs(b.start_date) - swapDateMs(a.start_date));
  return { ok: true, result: list };
});
// Completed-swap history.
ipcMain.handle("swap-history", () => swapRpc(() => xkrSwapRpc.history()));
// The taker's Bitcoin balance.
ipcMain.handle("swap-balance", () => swapRpc(() => xkrSwapRpc.balance()));
// A fresh Bitcoin deposit address (fund the taker wallet to swap from).
ipcMain.handle("swap-bitcoin-address", () => swapRpc(() => xkrSwapRpc.bitcoinAddress()));
// Send BTC from the wallet. args: { address, amountSat? } (omit amountSat to drain).
ipcMain.handle("swap-withdraw-btc", (e, args) => swapRpc(() => xkrSwapRpc.withdrawBtc(args)));
// The BTC wallet's transaction history.
ipcMain.handle("swap-btc-txs", () => swapRpc(() => xkrSwapRpc.bitcoinTransactions()));
// Makers discovered over the HyperSwarm board (replaces the rendezvous). Shape
// matches the old quote-board so the UI is unchanged: { peer_id, xkrAddress, quote }.
ipcMain.handle("swap-list-sellers", () =>
  swapRpc(async () => {
    // Don't offer ourselves as a maker: our own announce is on the same board.
    const ownAddress =
      walletBackend && walletBackend.getPrimaryAddress ? walletBackend.getPrimaryAddress() : null;
    return ensureDiscovery()
      .list()
      .filter((m) => m.xkrAddress !== ownAddress)
      .map((m) => ({ peer_id: m.peerId, xkrAddress: m.xkrAddress, multiaddr: null, quote: m.quote }));
  }),
);
// Resume a swap by id.
ipcMain.handle("swap-resume", (e, swapId) => swapRpc(() => xkrSwapRpc.resume(swapId)));
// The engine's recorded failure reason for a swap (async setup failures never
// reach swap-infos), so the monitor can show WHY a swap didn't get off the ground.
ipcMain.handle("swap-error", (e, swapId) => swapRpc(() => xkrSwapRpc.swapError(swapId)));

// Start market-making: launch the local ASB with its control JSON-RPC enabled,
// ask it (over RPC, not by scraping logs) for its libp2p peer id, then advertise
// it on the HyperSwarm board so takers can find and reach it behind NAT (no
// rendezvous). The ASB locks XKR from this wallet's own keys.
// args: { configPath?, priceSats?, minSat?, maxSat?, env? }
// Spawn the ASB child with the maker env + start args. Shared by the interactive
// "start market-making" handler and the boot-time resume-only recovery so the two
// can NEVER drift on critical env (e.g. XKR_ASB_REFUND_ADDRESS, whose absence
// leaves refunds stuck at "xmr is refundable"). Returns { child, password };
// `password` authenticates the ASB control RPC.
async function spawnMakerAsb({ priceSats, resumeOnly = false, configPath, extraEnv = {} } = {}) {
  // The maker's XKR inventory IS this wallet -- the ASB locks XKR from the user's
  // own keys, so market-making needs no separate funded wallet.
  const [makerSpend, makerView] = walletBackend.getPrimaryAddressPrivateKeys();
  const cfgPath = configPath || path.join(app.getPath("userData"), "xkr-asb-config.toml");

  // Enable the ASB control RPC on localhost, Bearer-authed via a verifier file.
  const { password, verifier } = asbRpc.generateAuth();
  const authFile = path.join(app.getPath("userData"), "asb-rpc-auth");
  fs.writeFileSync(authFile, verifier, { mode: 0o600 });

  const startArgs = [
    "--rpc-bind-host", "127.0.0.1",
    "--rpc-bind-port", String(ASB_RPC_PORT),
    "--rpc-auth-file", authFile,
  ];
  // Resume-only: resume/refund the swaps already in the ASB's DB but accept NO
  // new swap requests (and we skip advertising on the board). Used on boot to
  // finish refunds without silently re-entering the market.
  if (resumeOnly) startArgs.push("--resume-only");

  // Redeem maker BTC proceeds INTO the app's own spendable wallet. The ASB and the
  // taker engine share a seed/descriptor but keep separate wallet DBs, so BTC the
  // ASB redeems into its own wallet is invisible to the app (which shows the taker
  // wallet) until a restart's full rescan. Fetching a receive address from the
  // taker daemon reveals it in THAT wallet, so redeeming there makes proceeds show
  // up live. Best-effort: if the engine isn't reachable, fall back to the ASB's
  // internal wallet (the old behaviour).
  //
  // KNOWN, ACCEPTED privacy trade-off (deliberate -- do NOT "fix" without a design
  // decision): this address is fetched once per MM session, so every swap in that
  // session redeems to the SAME address (reuse), and proceeds commingle with the
  // user's other BTC in the one app wallet. The privacy-preserving alternative is a
  // dedicated swap-proceeds derivation path with a fresh address per swap; chosen
  // against for now in favour of live visibility + zero extra on-chain fees.
  let redeemBtcAddress = null;
  try {
    const r = await xkrSwapRpc.bitcoinAddress();
    redeemBtcAddress = (r && r.address) || null;
  } catch (e) {
    console.warn("[swap-maker] couldn't get a taker BTC address for maker redeem; ASB will redeem internally:", e.message);
  }

  const child = await xkrSwapAsb.startAsb({
    app,
    configPath: cfgPath,
    testnet: true,
    env: {
      XKR_WALLET_RPC_URL: `http://127.0.0.1:${XKR_SWAP_RPC_PORT}`,
      XKR_ASB_PRICE_SATS: priceSats,
      XKR_ASB_SPEND_SECRET: makerSpend,
      XKR_ASB_VIEW_SECRET: makerView,
      // Where a FAILED swap's XKR is swept back to when the maker refunds. A
      // cancelled swap leaves the engine at "xmr is refundable"; the refund step
      // reconstructs the shared XKR wallet and sweeps to this address. Without it
      // the engine errors ("XKR_ASB_REFUND_ADDRESS not set") and the swap gets
      // stuck refundable forever. Refund to our own primary address -- the same
      // wallet the locked XKR came from.
      XKR_ASB_REFUND_ADDRESS: walletBackend.getPrimaryAddress(),
      // Derive the ASB's Bitcoin wallet from the XKR spend key -- the SAME seed
      // the taker engine uses -- so maker BTC proceeds land in the one shared
      // BTC wallet (visible/withdrawable in the app), not a separate ASB wallet.
      XKR_SWAP_SEED_KEY: makerSpend,
      // Redeem completed-swap BTC into the app's spendable wallet (see above).
      ...(redeemBtcAddress ? { XKR_ASB_REDEEM_ADDRESS: redeemBtcAddress } : {}),
      // Per-wallet ASB data dir: isolates the swap DB, identity and wallet so
      // different opened XKR wallets never see each other's maker swaps. Keyed by
      // the open wallet; falls back to a shared "default" dir if no wallet id.
      XKR_ASB_DATA_DIR: path.join(app.getPath("userData"), "asb-data", walletKey() || "default"),
      ...extraEnv,
    },
    startArgs,
  });
  return { child, password };
}

// On boot (after the wallet is loaded), bring the maker ASB back in RESUME-ONLY
// mode if there are unfinished maker swaps -- e.g. one left at "xmr is refundable"
// after both sides went offline. This resumes them so refunds complete, WITHOUT
// re-advertising on the board (the user chose resume-only recovery). A later
// explicit "start market-making" replaces this with a full advertising instance.
async function resumeMakerSwapsIfAny() {
  try {
    if (!walletBackend) return;
    if (xkrSwapAsb.isRunning()) return; // already up (e.g. user started MM already)
    // Only the OPEN wallet's maker swaps -- don't resume another wallet's swaps.
    const wid = walletKey() || "default";
    const cache = (swapsStore.get("swaps") || {})[wid] || {};
    // `completed` is the engine's own authoritative done flag (same signal the
    // taker resume uses); a refundable-but-not-yet-refunded swap is completed=false.
    const pending = Object.values(cache).filter((s) => s && s.role === "maker" && s.completed === false);
    if (!pending.length) return;

    const priceSats = String(swapMakerPriceSats || process.env.XKR_ASB_PRICE_SATS || "5");
    console.log(
      `[swap-maker] ${pending.length} unfinished maker swap(s) found; starting ASB resume-only to recover/refund`,
    );
    const { child, password } = await spawnMakerAsb({ priceSats, resumeOnly: true });
    if (!child) {
      console.warn("[swap-maker] resume-only ASB failed to start (binary missing or port in use)");
      return;
    }
    swapMakerResumeOnly = true;
    // Keep a control-RPC client so the UI's swap-maker-swaps poll can refresh the
    // cached state as the refund progresses, but do NOT advertise (no startMakerBoard).
    swapMakerRpc = asbRpc.client(ASB_RPC_PORT, password);
  } catch (e) {
    console.error("[swap-maker] resume-only recovery failed:", e.message);
  }
}

ipcMain.handle("swap-maker-start", async (e, args = {}) => {
  try {
    const priceSats = String(args.priceSats || process.env.XKR_ASB_PRICE_SATS || "5");

    // Idempotent: if the maker engine is already running (and advertising) with the
    // same price, do NOT tear it down. Killing+respawning the ASB (SIGTERM) drops
    // every live HyperSwarm beam and breaks any swap currently in setup/flight --
    // the exact cause of "the swap didn't get off the ground" on the taker. Just
    // make sure we're still advertising on the board and return the existing
    // identity. A resume-only recovery instance is NOT reused here: an explicit
    // start must upgrade it to a full advertising instance (accept new swaps).
    if (xkrSwapAsb.isRunning() && !swapMakerResumeOnly && swapMakerPriceSats === priceSats && !swapMakerError) {
      if (!swapMaker && swapMakerPeerId) startMakerBoard(args, priceSats);
      return { ok: true, reused: true };
    }

    swapMakerResumeOnly = false;
    swapMakerPeerId = null;
    swapMakerError = null;
    swapMakerRpc = null;

    const { child, password } = await spawnMakerAsb({
      priceSats,
      resumeOnly: false,
      configPath: args.configPath,
      extraEnv: args.env || {},
    });
    if (!child) {
      swapMakerPriceSats = null;
      return {
        ok: false,
        error:
          "The market-maker engine (asb) couldn't start — its binary may be missing " +
          "or its port (9839) is in use. Check the app logs.",
      };
    }
    // Remember what price this ASB is running with, so a later start with the
    // same price is a no-op (see the idempotent guard above) rather than a
    // swap-killing restart.
    swapMakerPriceSats = priceSats;

    // Ask the ASB for its peer id over its control RPC, retrying while it boots,
    // then advertise on the board. Robust -- no stdout parsing.
    const rpc = asbRpc.client(ASB_RPC_PORT, password);
    swapMakerRpc = rpc;
    (async () => {
      for (let i = 0; i < 45; i++) {
        if (swapMakerRpc !== rpc) return; // stopped / cancelled
        try {
          const res = await rpc.peerId();
          const id = res && (res.peer_id || res.peerId);
          if (id) {
            if (swapMakerRpc !== rpc) return;
            swapMakerPeerId = id;
            startMakerBoard(args, priceSats);
            return;
          }
        } catch (_) {
          // RPC not up yet / transient -- keep polling
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (swapMakerRpc === rpc && !swapMakerPeerId && !swapMakerError) {
        swapMakerError = "Couldn't reach the market-making engine's control API to read its identity.";
      }
    })();

    return { ok: true };
  } catch (err) {
    swapMakerPriceSats = null;
    return { ok: false, error: err.message };
  }
});

// Stop advertising on the board (the ASB child keeps its own lifecycle).
ipcMain.handle("swap-maker-stop", () => {
  try {
    if (swapMaker) {
      swapMaker.stop();
      swapMaker = null;
    }
    // Stop the maker engine too, otherwise asbRunning stays true and the panel is
    // stuck showing "starting". Clearing swapMakerRpc also halts the peer-id poll.
    xkrSwapAsb.stopAsb();
    swapMakerRpc = null;
    swapMakerPeerId = null;
    swapMakerError = null;
    swapMakerAdvertised = null;
    swapMakerPriceSats = null;
    swapMakerResumeOnly = false;
  } catch (_) {}
  return { ok: true };
});

// Market-making status for the maker panel.
ipcMain.handle("swap-maker-status", async () => {
  // The maker RECEIVES BTC into the ASB's own Bitcoin wallet (a separate wallet
  // from the taker engine's, which is what the main BTC balance shows), so query
  // the ASB directly for the maker's earned BTC. Best-effort: only while running.
  let btcBalanceSat = null;
  if (swapMakerRpc) {
    try {
      const r = await swapMakerRpc.bitcoinBalance();
      if (r && typeof r.balance === "number") btcBalanceSat = r.balance;
    } catch (_) {}
  }
  return {
    ok: true,
    result: {
      advertising: !!swapMaker,
      asbRunning: xkrSwapAsb.isRunning ? xkrSwapAsb.isRunning() : false,
      // The ASB is up purely to recover/refund unfinished swaps (booted resume-only),
      // NOT advertising -- lets the panel show "recovering swaps" instead of "starting".
      resumeOnly: swapMakerResumeOnly,
      peerId: swapMakerPeerId,
      error: swapMakerError,
      advertised: swapMaker ? swapMakerAdvertised : null,
      btcBalanceSat,
    },
  };
});

// Maker-side swaps (from the ASB's own DB), so the swap history can show swaps
// where YOU sold XKR for BTC too -- not just taker swaps. Only available while
// market-making is running (the ASB control RPC is up then). Best-effort: [].
ipcMain.handle("swap-maker-swaps", async () => {
  if (!swapMakerRpc) return { ok: true, result: [] };
  try {
    const swaps = await swapMakerRpc.getSwaps();
    if (Array.isArray(swaps)) cacheSwaps(swaps, "maker");
    return { ok: true, result: Array.isArray(swaps) ? swaps : [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

function startMakerBoard(args, priceSats) {
  try {
    if (swapMaker) swapMaker.stop();
    const [spend] = walletBackend.getPrimaryAddressPrivateKeys();
    const configuredMaxSat = Number(args.maxSat || 4999999);
    const minSat = Number(args.minSat || 10000);

    // The advertised max is re-derived from the maker's LIVE unlocked XKR balance
    // on every announce, so a taker can never request (or the maker advertise)
    // more XKR than is actually spendable. max_quantity is in BTC satoshis, and
    // the maker delivers XKR for BTC, so the cap is unlockedXKR * price(sats/XKR),
    // minus a small haircut for the on-chain lock fee/change. The ASB swap-setup
    // gate re-validates against the real balance as the hard backstop. Also kept
    // in swapMakerAdvertised so the panel shows the true, balance-capped quote.
    async function computeQuote() {
      let maxSat = configuredMaxSat;
      try {
        const [unlockedAtomic] = await walletBackend.getBalance();
        const unlockedXkr = Number(unlockedAtomic) / 100000; // XKR has 5 decimals
        const balanceCapSat = Math.floor(unlockedXkr * Number(priceSats) * 0.98);
        maxSat = Math.max(0, Math.min(configuredMaxSat, balanceCapSat));
      } catch (_) {
        // On a balance-read failure, fall back to the configured max; the ASB gate
        // still protects against overcommitting.
      }
      swapMakerAdvertised = { price: Number(priceSats), min_quantity: minSat, max_quantity: maxSat };
      return swapMakerAdvertised;
    }

    // Seed the advertised quote before the first announce so the panel and the
    // initial broadcast both have a value.
    swapMakerAdvertised = { price: Number(priceSats), min_quantity: minSat, max_quantity: configuredMaxSat };
    swapMaker = swapSwarm.startMaker({
      xkrAddress: walletBackend.getPrimaryAddress(),
      xkrPrivateSpendKey: spend,
      libp2pPeerId: swapMakerPeerId,
      asbHost: "127.0.0.1",
      asbPort: ASB_LISTEN_PORT,
      getQuote: computeQuote,
      log: (m) => console.log("[swap-swarm] " + m),
    });
    swapMakerError = null;
    console.log("[swap-swarm] maker board up, peer id " + swapMakerPeerId);
  } catch (err) {
    swapMaker = null;
    swapMakerError = "board: " + err.message;
    console.error("[swap-swarm] maker board failed:", err.stack || err.message);
  }
}

ipcMain.on("start-app", async e => {
  const myWallets = await wallets.get("wallets") ?? false;
  const node = await nodes.get("node") ?? null;
  const data = { myWallets, node };

  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoDownload = false;
  //This can be a setting if people wants beta releases in the future.
  autoUpdater.allowPrerelease = false;
  autoUpdater.checkForUpdatesAndNotify();

  mainWindow.webContents.send("started-app", data);
  mainWindow.setSize(600, 700, true);
  if (node) {
    daemon = new WB.Daemon(node.url, node.port);
  }
  mainWindow.webContents.send('version', app.getVersion())
});

ipcMain.on("check-new-release", () => {
  console.log("checking if new release");
  autoUpdater.checkForUpdates();
});

autoUpdater.on("checking-for-update", () => {
  mainWindow.webContents.send("updater", "checking");
});

autoUpdater.on("update-available", () => {
  mainWindow.webContents.send("updater", "available");
});

autoUpdater.on("update-not-available", () => {
  mainWindow.webContents.send("updater", "not-available");
});

autoUpdater.on("download-progress", (progress) => {
  mainWindow.webContents.send("update-progress", progress);
});

autoUpdater.on("error", (err) => {
  mainWindow.webContents.send("updater", err);
});

autoUpdater.on("update-downloaded", () => {
  mainWindow.webContents.send("updater", "downloaded");
});

ipcMain.on("download-update", (e) => {
  autoUpdater.downloadUpdate();
});

ipcMain.on("install-update", async (e, data) => {
  autoUpdater.quitAndInstall();
});

let loggedIn = false;
let userPassword;
// The path + password of the currently open wallet, captured on start so
// subwallet operations can persist the container immediately.
let currentWalletPath;
let currentPassword;

//////// START WALLET
ipcMain.on("start-wallet", async (e, walletName, password, node, file) => {

  nodes.set("node", { url: node.url, port: node.port, ssl: node.ssl });

  if (!daemon) {
    daemon = new WB.Daemon(node.url, node.port);
  }

  // Point the XKR swap RPC service at the same node the wallet uses.
  startXkrSwapService(node);

  if (loggedIn) {
    await verifyPassword(password);
    return;
  }
  
  let knownWallets = await getMyWallets()
  //Save opened wallet file path if we did not create a new one on first start and name it if it's not known
  if (file) {
    const existingWalletIndex = knownWallets.findIndex(a => a.wallet === walletName);
    if (existingWalletIndex !== -1) {
      // Update path and move to top
      const wallet = knownWallets[existingWalletIndex];
      wallet.path = file;
      knownWallets.splice(existingWalletIndex, 1);
      knownWallets.unshift(wallet);
    } else {
      // Add new wallet to top
      knownWallets.unshift({ wallet: walletName, path: file });
    }
    wallets.set("wallets", knownWallets);
  }

  walletBackend = await logIntoWallet(walletName, password);
  if (!walletBackend) return;

  await walletBackend.start();
  walletBackend.setLogLevel(WB.LogLevel.WARNING);
  walletBackend.enableAutoOptimization(true);
  walletBackend.scanPoolTransactions(true)
  walletBackend.scanCoinbaseTransactions(true);

  // Re-spawn the swap engine seeded from the XKR wallet's private spend key, so
  // its Bitcoin wallet + libp2p identity derive deterministically from this XKR
  // wallet -- restoring the XKR seed restores the entire (BTC + XKR) wallet.
  try {
    const [privateSpendKey] = walletBackend.getPrimaryAddressPrivateKeys();
    if (privateSpendKey) {
      xkrSwapEngine.startEngine({
        app,
        xkrRpcPort: XKR_SWAP_RPC_PORT,
        servePort: XKR_SWAP_SERVE_PORT,
        electrumUrl: XKR_SWAP_ELECTRUM_URL,
        testnet: true,
        seedKey: privateSpendKey,
        rendezvous: XKR_SWAP_RENDEZVOUS,
        // Resumed swaps read the receive address from XKR_RECEIVE_ADDRESS (the
        // engine doesn't persist it), so seed it with our primary XKR address.
        xkrReceiveAddress: walletBackend.getPrimaryAddress(),
      });
      // Resume any swap interrupted by a previous shutdown now that the engine
      // is respawned with the receive address available.
      setTimeout(resumeInFlightSwaps, 6000);
      // Same idea for the MAKER side: if we were mid-swap when the app closed, bring
      // the ASB back resume-only so its refunds/redeems finish on their own. Slightly
      // later so the XKR wallet RPC is bound first -- the ASB needs it.
      setTimeout(resumeMakerSwapsIfAny, 8000);
    }
  } catch (e) {
    console.error("failed to seed swap engine from XKR key:", e.message);
  }

  const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = walletBackend.getSyncStatus();
  const balance = await walletBackend.getBalance();
  mainWindow.webContents.send("data", { walletBlockCount, localDaemonBlockCount, networkBlockCount, balance });

  //////////////// EVENTS
  walletBackend.on("desync", (walletHeight, networkHeight) => {
    console.log(`Wallet is no longer synced! Wallet height: ${walletHeight}, Network height: ${networkHeight}`);
  });

  walletBackend.on("disconnect", (error) => {
    console.log("Possibly lost connection to daemon: " + error.toString());
    mainWindow.webContents.send("node-status", "Disconnected");
  });

  walletBackend.on("connect", () => {
    console.log("Regained connection to daemon!");
    mainWindow.webContents.send("node-status", "Connected");
  });

  walletBackend.on("incomingtx", (transaction) => {
    console.log(transaction);
    mainWindow.webContents.send("incoming-tx", transaction, transaction.totalAmount());
    console.log(`🚨 INCOMING TX - AMOUNT: ${WB.prettyPrintAmount(transaction.totalAmount())}`);
  });

  walletBackend.on("unconfirmedtx", (amount, hash) => { 
    mainWindow.webContents.send("incoming-hash", {hash, amount});
    notifier.notify({
      appID: "Kryptokrona Wallet",
      title: "Found a transaction",
      message: `Waiting for confirmation..`,
      icon: path.join(__dirname, "../",  "../", "static", "icon.png"),
      wait: true
    });
  });

  walletBackend.on("heightchange", async (walletBlockCount, localDaemonBlockCount, networkBlockCount) => {
    miscs.set("node-stats", { walletBlockCount, localDaemonBlockCount, networkBlockCount });

  });

  const walletPath = await getWalletPath(walletName)
  currentWalletPath = walletPath;
  currentPassword = password;
  walletSaver(walletPath, password)
  mainWindow.webContents.send("wallet-started");

  while (true) {

    try {
      //Start syncing
      await sleep(5 * 1000);
      const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = walletBackend.getSyncStatus();
      const balance = await walletBackend.getBalance();
      console.log('Balance: ', balance);
      const idle = powerMonitor.getSystemIdleTime();
      const data = { walletBlockCount, localDaemonBlockCount, networkBlockCount, balance, idle };
      mainWindow.webContents.send("data", data);
      if ((networkBlockCount - walletBlockCount) < 2) {
        // Diff between wallet height and node height is 1 or 0, we are synced
        console.log("walletBlockCount", walletBlockCount);
        console.log("localDaemonBlockCount", localDaemonBlockCount);
        console.log("networkBlockCount", networkBlockCount);
        console.log("SYNCED");
        
        mainWindow.webContents.send("node-status", "Synced");
      } else {
        if (walletBlockCount === 0) {
          await walletBackend.reset(networkBlockCount - 100)
      }
        console.log("********SYNCING********");
        console.log("Wallet ", walletBlockCount);
        console.log("LocalD", localDaemonBlockCount);
        console.log("Network", networkBlockCount);
        console.log("SYNCING");
        mainWindow.webContents.send("node-status", "Syncing");
      }
    } catch (err) {
      console.log(err);
    }
  }
});

async function getMyWallets() {
  return await wallets.get("wallets") ?? [];
}

async function walletSaver(walletPath, password) {
  setInterval( async () => {
   await saveWallet(walletPath, password)
  }, 60000)
}

async function saveWallet(walletPath, password) {
  console.log("******** SAVING WALLET ********");
  await walletBackend.saveWalletToFile(walletPath, password);
}

let known_pool_txs = [];

ipcMain.on("reset-wallet", (e, height) => {
  successMessage(`Scanning from height ${height}`)
  walletBackend.reset(parseInt(height));

});

ipcMain.on("rewind-wallet", async (e, height) => {
  successMessage(`Rewind wallet from height ${height}`)
  walletBackend.rewind(parseInt(height));

});

// Coalesce fragmented inputs (e.g. lots of mining rewards) into fewer, larger
// outputs via zero-fee fusion transactions so big sends stop failing on
// "too many inputs". Auto-optimization is already on, but this lets the user
// force a full pass on demand. Returns { ok, sent, hashes } for UI feedback.
ipcMain.handle("wallet-optimize", async () => {
  if (!walletBackend) return { ok: false, error: "Wallet not loaded" };
  try {
    const [sent, hashes] = await walletBackend.optimize();
    if (sent === 0) {
      successMessage("Wallet already optimized");
    } else {
      successMessage(`Sent ${sent} fusion transaction${sent === 1 ? "" : "s"} — funds will unlock shortly`);
    }
    return { ok: true, sent, hashes };
  } catch (err) {
    errorMessage("Optimize failed: " + err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("wallet-exists", async (e, walletName) => {
  if (fs.existsSync(userDataDir + '/' + walletName + '.wallet')) { 
    return true;
   }
   return false;
});



ipcMain.handle("create-wallet", async (e, walletName, password, node) => {
  
  try {

    if (!daemon) {
      daemon = new WB.Daemon(node.url, node.port);
    }

    walletName = walletName

    walletBackend = await WB.WalletBackend.createWallet(daemon);

    const [seed, err] = await walletBackend.getMnemonicSeed();

    let height;

    try {
      const req = await fetch(`http://${node.url}:${node.port}/getinfo`)

      if (!req.ok) {
        return reject("error");
      }

      const res = await req.json();
      if (res.status !== "OK") {
        return reject("error");
      }

      height = res.height - 100;

    } catch(err){
      height = 1650000;
    }

  
    const walletPath = await saveWalletInfo(walletName)

    await saveWallet(walletPath, password)
    await keytar.setPassword(`yggdrasilwallet?=${walletName}`, walletName, password);

  } catch (e) {
    console.log(e);
    return false;
  }

  nodes.set("node", { url: node.url, port: node.port, ssl: node.ssl });
  return wallets.get("wallets");
});

const verifyPassword = async (password) => {
  let passHash = await crypto.cn_fast_hash(toHex(password));
  if (passHash === userPassword) {
    mainWindow.webContents.send("wallet-started");
    passHash = "";
  } else {
    mainWindow.webContents.send("wrong-password");
    passHash = "";
  }
};

const checkPass = async (password) => {
  const passHash = await crypto.cn_fast_hash(toHex(password));
  if (passHash === userPassword) {
    return true
  } else {
    return false
  }
}

async function saveWalletInfo(walletName) {
  let walletPath = userDataDir + "/" + walletName + ".wallet"
  let knownWallets = await getMyWallets()
  knownWallets.unshift({ wallet: walletName, path: walletPath });
  await wallets.set("wallets", knownWallets);
  return walletPath
}

async function getWalletPath(walletName) {
  let knownWallets = await getMyWallets()
  const thisWallet = knownWallets.find(a => a.wallet === walletName)

  if (thisWallet?.path === undefined) return userDataDir + "/" + walletName + ".wallet"
  return thisWallet.path
}

async function logIntoWallet(walletName, password) {
  const thisPath = await getWalletPath(walletName)
  const [walletBackend, error] = await WB.WalletBackend.openWalletFromFile(daemon, thisPath, password);
  if (error) {
    console.log("Failed to open wallet: " + error.toString());
    mainWindow.webContents.send("wrong-password");
    return false;
  } else {
    loggedIn = true;
    successMessage('Starting wallet...')
    userPassword = await crypto.cn_fast_hash(toHex(password));
    return walletBackend;
  }
}

function errorMessage(message) {
  mainWindow.webContents.send("error-message", message);
}

function successMessage(message) {
  mainWindow.webContents.send("success-message", message);
}

ipcMain.handle("import-seed", async (e, seed, walletName, password, height, node) => {
  console.log(seed, walletName, password, height);

  if (!daemon) {
    daemon = new WB.Daemon(node.url, node.port);
  }

  [walletBackend, err] = await WB.WalletBackend.importWalletFromSeed(daemon, height, seed);
  if (err) {
    console.log("Failed to load wallet: " + err.toString());
    return false;
  }

  await saveWalletInfo(walletName)
  const walletPath = await getWalletPath(walletName)
  await saveWallet(walletPath, password)


  console.log("*******IMPORTED WALLET FROM SEED********");
  nodes.set("node", { url: node.url, port: node.port, ssl: node.ssl });
  return true;
});

ipcMain.handle("get-wallets", async (e) => {
  const userWallets = await wallets.get("wallets");
  if (userWallets) {
    console.log("Returning wallets");
    return userWallets;
  } else return false;
});

ipcMain.handle("get-addresses", (e) => {
  const addresses = walletBackend.getAddresses();
  console.log(addresses);
  if (addresses) return addresses;
});

// The wallet's own addresses are encoded under the default prefix (SEKR). The
// same keys can also be encoded under the alternate prefix (Xkr) -- both decode
// to the same wallet, so a sender using a wallet that only knows one prefix can
// still pay us. We surface both so the receive panel can show them side by side.
// (Requires kryptokrona-utils with alternateAddress(); ships with the prefix
// migration release alongside the updated wallet-backend-js.)
async function addressForms(address, primary) {
  try {
    const decoded = await Address.fromAddress(address);
    return { standard: address, alternate: await decoded.alternateAddress(), primary };
  } catch (err) {
    console.log(`Could not derive alternate address form: ${err}`);
    return { standard: address, alternate: null, primary };
  }
}

// Build the { standard, alternate, primary } list for every (sub)wallet. The
// first address returned by getAddresses() is always the primary.
async function addressFormsList() {
  const addresses = walletBackend.getAddresses();
  if (!addresses || !addresses.length) return [];
  const primary = walletBackend.getPrimaryAddress();
  return Promise.all(addresses.map((a) => addressForms(a, a === primary)));
}

ipcMain.handle("get-address-forms", async (e) => {
  return addressFormsList();
});

//Gets n transactions per page to view in frontend
ipcMain.handle('get-transactions', async (e, startIndex, all = false) => {
    const showPerPage = 10
    let txs = []
    const allTx = await walletBackend.getTransactions()
    const pages = Math.ceil(allTx.length / showPerPage)
    const pageTx = []
    if (all) txs = allTx
    else txs = await walletBackend.getTransactions(startIndex, showPerPage)
    for (const tx of txs) {
      //Unconfirmed txs do not have a blockheight or timestamp yet.
      if (tx.timestamp === 0) {
        tx.timestamp = Date.now() / 1000
        tx.blockHeight = "Unconfirmed"
      }
      //Exclude optimize txs
      if (tx.totalAmount() === 0) continue
        pageTx.push({
            hash: tx.hash,
            amount: tx.totalAmount(),
            time: tx.timestamp,
            height: tx.blockHeight,
            confirmed: true
        })
    }

    return { pageTx, pages }
})

ipcMain.handle("get-seed", async (e) => {
  const [seed, err] = await walletBackend.getMnemonicSeed();
  if (!err) {
    return seed;
  } else {
    console.log("GET SEED", err);
    return false;
  }
});

ipcMain.handle('verify-pass', async (e, password) => {
  return await checkPass(password)
})


ipcMain.handle('get-privkeys', async () => {
  return walletBackend.getPrimaryAddressPrivateKeys()
})

ipcMain.handle("get-node", async (e) => {
  const userNode = await nodes.get("node");
  if (userNode) {
    console.log("Returning node");
    return userNode;
  } else return false;
});

ipcMain.handle("check-node", async (e, node) => {
 return await checkNode(node)
});

async function checkNode(node) {
  try {
    const req = await fetchTimeout(`${node.ssl ? 'https://' : 'http://' }${node.url}:${node.port}/getinfo`);

    if (!req.ok) {
      return false
    }

    const res = await req.json();

    return res.status === "OK";

  } catch (e) {
    console.log(e);
    return false
  }
}

ipcMain.handle('change-node', async (e, node) => {
  console.log('SETTING', node);
  const check = await checkNode(node);
  daemon = new WB.Daemon(node.url, node.port);
  await walletBackend.swapNode(daemon);
  nodes.set("node", { url: node.url, port: node.port, ssl: node.ssl });
  if (check) {
    successMessage('Connecting to node')
  } else {
    errorMessage('Cannot connect to node')
  }
  
  return node
})

ipcMain.handle('set-node', (e, node) => {
  nodes.set("node", { url: node.url, port: node.port, ssl: node.ssl });
})

ipcMain.handle("check-touchId", (e) => {
  try {

    const touchId = systemPreferences.canPromptTouchID();
    if (touchId) {
      return touchId;
    } else return false;

  } catch (e) {
    return false;
  }
});

//TODO move
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

//TODO move
function toHex(str, hex) {
  try {
    hex = unescape(encodeURIComponent(str))
      .split("")
      .map(function(v) {
        return v.charCodeAt(0).toString(16);
      })
      .join("");
  } catch (e) {
    hex = str;
    //console.log('invalid text input: ' + str)
  }
  return hex;
}

function fetchTimeout(url, options = {}, timeout = 8000) {
  return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeout)
      )
  ]);
}

ipcMain.handle("get-contacts", async e => {
  return contacts.get("contacts");
});

ipcMain.handle("save-contact", async (e, username, address) => {
  let knownContacts = await contacts.get("contacts") ?? [];
  knownContacts.push({ username, address });
  await contacts.set("contacts", knownContacts);
  return knownContacts;
});

ipcMain.handle("import-contacts", async (e) => {
  let file = await dialog.showOpenDialog({
    properties: ["openFile"], filters: [{ name: "Contacts", extensions: ["json"] }]
  });

  let knownContacts = await contacts.get("contacts") ?? [];
  let raw = await fs.readFileSync(file.filePaths[0]);
  let json = await JSON.parse(raw) ?? [];
  knownContacts.push(...json);
  knownContacts = [...new Map(knownContacts.map(item => [item["address"], item])).values()];
  contacts.set("contacts", knownContacts);
  console.log(knownContacts);
  return knownContacts;
});

ipcMain.handle("delete-contact", async (e, contact) => {
  let knownContacts = await contacts.get("contacts") ?? [];
  knownContacts = knownContacts.filter(x => x.address !== contact.address);
  await contacts.set("contacts", knownContacts);
  return knownContacts;
});

async function saveCurrentWallet() {
  if (!currentWalletPath) return;
  try {
    await saveWallet(currentWalletPath, currentPassword);
  } catch (err) {
    console.log(`Could not save wallet: ${err}`);
  }
}

// Derive the private spend key of the deterministic subwallet at `index`. The
// derivation is a pure function of the root private spend key (the seed), so the
// same index always reproduces the same subwallet -- that is what makes these
// subwallets recoverable from the mnemonic. `walletBackend.addSubWallet()` by
// contrast creates a RANDOM subwallet that cannot be recovered from the seed.
async function deterministicSubWalletKey(index) {
  const [privateSpendKey] = walletBackend.getPrimaryAddressPrivateKeys();
  const keys = await crypto.generateDeterministicSubwalletKeys(privateSpendKey, index);
  return keys.private_key || keys.secretKey;
}

ipcMain.handle('create-subwallet', async (e) => {
  try {
    // Index 0 is the primary (the root key itself); new subwallets take the
    // next contiguous index, which is the current wallet count.
    const index = walletBackend.getWalletCount();
    const privateSpendKey = await deterministicSubWalletKey(index);
    const [address, error] = await walletBackend.importSubWallet(privateSpendKey);
    if (error) {
      console.log(`Could not create subwallet: ${error.toString()}`);
      errorMessage('Could not create subwallet');
    } else {
      console.log(`Created deterministic subwallet #${index}: ${address}`);
    }
  } catch (err) {
    console.log(`create-subwallet failed: ${err}`);
    errorMessage('Could not create subwallet');
  }
  await saveCurrentWallet();
  return addressFormsList();
});

ipcMain.handle('delete-subwallet', async (e, address) => {
  try {
    if (address === walletBackend.getPrimaryAddress()) {
      errorMessage('Cannot delete the primary address');
    } else {
      const error = await walletBackend.deleteSubWallet(address);
      if (error && error.errorCode !== undefined && error.errorCode !== 0) {
        console.log(`Could not delete subwallet: ${error.toString()}`);
      }
    }
  } catch (err) {
    console.log(`delete-subwallet failed: ${err}`);
  }
  await saveCurrentWallet();
  return addressFormsList();
});

// Re-derive deterministic subwallets from the seed. Given the number of
// subwallets the user previously created, deriving indices 1..count reproduces
// the exact same addresses. Already-present subwallets are skipped.
ipcMain.handle('recover-subwallets', async (e, count) => {
  const target = Math.max(0, Math.min(parseInt(count, 10) || 0, 100));
  for (let index = 1; index <= target; index++) {
    try {
      const privateSpendKey = await deterministicSubWalletKey(index);
      const [address, error] = await walletBackend.importSubWallet(privateSpendKey);
      if (error && !/already exists/i.test(error.toString())) {
        console.log(`recover subwallet #${index}: ${error.toString()}`);
      }
    } catch (err) {
      console.log(`recover subwallet #${index} failed: ${err}`);
    }
  }
  await saveCurrentWallet();
  return addressFormsList();
});

ipcMain.handle('balance-subwallet', async (e, address) => {
  try {
    const [unlocked, locked] = await walletBackend.getBalance([address]);
    return { unlocked, locked };
  } catch (err) {
    console.log(`balance-subwallet failed: ${err}`);
    return { unlocked: 0, locked: 0 };
  }
});

ipcMain.handle('prepare-transaction', async (e, address, amount, paymentID, sendAll) => {
  console.log(address, amount, paymentID, sendAll);
  if (paymentID !== undefined) {
    if (!WB.validatePaymentID(paymentID)) {
      errorMessage('The paymentId is not correct')
      return
    }
  }
  const result = await walletBackend.sendTransactionAdvanced(
    [[address, parseInt(parseFloat(amount).toFixed(5) * 100000)]],
    3,
    {isFixedFee: true, fixedFee: 10000},
    paymentID,
    undefined,
    undefined,
    false,
    sendAll,
    undefined
  );

  if (result.success) {

    let transaction = {
      address: address,
      hash: result.transactionHash,
      amount: amount,
      fee: result.fee,
      paymentId: paymentID
    }
    known_pool_txs.push(result.transactionHash)
    return transaction
  } else {
    errorMessage(result.error.toString())
  }
})

ipcMain.handle('send-transaction', async (e, hash) => {
  const result = await walletBackend.sendPreparedTransaction(hash)
  if (!result.success) {
    errorMessage('Error: Could not send transaction')
    return
  }
  successMessage('Transaction sent!')
  mainWindow.webContents.send("outgoing-tx")
  return result.success;
})

ipcMain.handle('delete-transaction', async (e, hash) => {
  const result = await walletBackend.deletePreparedTransaction(hash)
  return result.success;
})

ipcMain.handle('validate-address', async (e, address) => {
  return await WB.validateAddress(address, true)
})

ipcMain.handle('generate-paymentId', async (e) => {
  return (await crypto.generateKeys()).public_key
})


ipcMain.handle('validate-paymentId', async (e, paymentId) => {
  return WB.validatePaymentID(paymentId);
})

///////////// STATUS MESSAGES

ipcMain.on('errormessage', async (e, message) => {
  errorMessage(message)
})

ipcMain.on('successmessage', async (e, message) => {
  successMessage(message)
})

successMessage
///////////// HYPER CORE


///////////// OPEN URL IN EXTERNAL BROWSER

ipcMain.on('open-link', async (e, url) => {
  const {shell} = require('electron')
  shell.openExternal(url)
})