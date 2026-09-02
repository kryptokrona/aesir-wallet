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
    // Floor the swap wallet reconstructions near the chain tip so they don't try
    // to sync from genesis (mainnet is 2.5M+ blocks). The swap's shared-output
    // deposit and any inventory we spend are always at or above 'now', so a
    // recent floor is safe. Best-effort: on failure we leave the env untouched.
    try {
      const info = await fetchTimeout(`${node.ssl ? "https://" : "http://"}${node.url}:${node.port}/getinfo`);
      const j = info.ok ? await info.json() : null;
      if (j && j.height) process.env.XKR_WALLET_SCAN_HEIGHT = String(Math.max(0, j.height - 1000));
    } catch (_) {}
    xkrSwapServer = xkrSwap.start({
      port: XKR_SWAP_RPC_PORT,
      daemonHost: node.url,
      daemonPort: node.port,
      ssl: node.ssl,
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
  } catch (e) {
    console.error("failed to start xkr-swap RPC service:", e.message);
  }
}

// Resume any swap the daemon has persisted as not-yet-completed. Safe to call
// repeatedly: resuming an already-finished swap is a no-op, and the daemon
// serialises work per swap behind its own lock.
async function resumeInFlightSwaps() {
  try {
    const infos = await xkrSwapRpc.swapInfos();
    if (!Array.isArray(infos)) return;
    for (const info of infos) {
      if (info && info.completed === false && info.swap_id) {
        xkrSwapRpc
          .resume(info.swap_id)
          .then(() => console.log("resumed in-flight swap", info.swap_id))
          .catch((err) => console.error("resume failed for", info.swap_id, err.message));
      }
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
ipcMain.handle("swap-infos", () => swapRpc(() => xkrSwapRpc.swapInfos()));
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
  swapRpc(async () =>
    ensureDiscovery()
      .list()
      .map((m) => ({ peer_id: m.peerId, xkrAddress: m.xkrAddress, multiaddr: null, quote: m.quote })),
  ),
);
// Resume a swap by id.
ipcMain.handle("swap-resume", (e, swapId) => swapRpc(() => xkrSwapRpc.resume(swapId)));

// Start market-making: launch the local ASB with its control JSON-RPC enabled,
// ask it (over RPC, not by scraping logs) for its libp2p peer id, then advertise
// it on the HyperSwarm board so takers can find and reach it behind NAT (no
// rendezvous). The ASB locks XKR from this wallet's own keys.
// args: { configPath?, priceSats?, minSat?, maxSat?, env? }
ipcMain.handle("swap-maker-start", async (e, args = {}) => {
  try {
    swapMakerPeerId = null;
    swapMakerError = null;
    swapMakerRpc = null;
    const priceSats = String(args.priceSats || process.env.XKR_ASB_PRICE_SATS || "5");
    // The maker's XKR inventory IS this wallet -- the ASB locks XKR from the
    // user's own keys, so "click to market-make" needs no separate funded wallet.
    const [makerSpend, makerView] = walletBackend.getPrimaryAddressPrivateKeys();
    const configPath = args.configPath || path.join(app.getPath("userData"), "xkr-asb-config.toml");

    // Enable the ASB control RPC on localhost, Bearer-authed via a verifier file.
    const { password, verifier } = asbRpc.generateAuth();
    const authFile = path.join(app.getPath("userData"), "asb-rpc-auth");
    fs.writeFileSync(authFile, verifier, { mode: 0o600 });

    const child = await xkrSwapAsb.startAsb({
      app,
      configPath,
      testnet: true,
      env: {
        XKR_WALLET_RPC_URL: `http://127.0.0.1:${XKR_SWAP_RPC_PORT}`,
        XKR_ASB_PRICE_SATS: priceSats,
        XKR_ASB_SPEND_SECRET: makerSpend,
        XKR_ASB_VIEW_SECRET: makerView,
        ...(args.env || {}),
      },
      startArgs: [
        "--rpc-bind-host", "127.0.0.1",
        "--rpc-bind-port", String(ASB_RPC_PORT),
        "--rpc-auth-file", authFile,
      ],
    });
    if (!child) {
      return {
        ok: false,
        error:
          "The market-maker engine (asb) couldn't start — its binary may be missing " +
          "or its port (9839) is in use. Check the app logs.",
      };
    }

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
  } catch (_) {}
  return { ok: true };
});

// Market-making status for the maker panel.
ipcMain.handle("swap-maker-status", () => ({
  ok: true,
  result: {
    advertising: !!swapMaker,
    asbRunning: xkrSwapAsb.isRunning ? xkrSwapAsb.isRunning() : false,
    peerId: swapMakerPeerId,
    error: swapMakerError,
    advertised: swapMaker ? swapMakerAdvertised : null,
  },
}));

function startMakerBoard(args, priceSats) {
  try {
    if (swapMaker) swapMaker.stop();
    const [spend] = walletBackend.getPrimaryAddressPrivateKeys();
    // The quote we actually advertise -- captured at start (a running maker keeps
    // its price; changing it needs a restart). The panel reads this back so the
    // shown price can't diverge from reality. Set before startMaker so the first
    // announce uses it. The swap-setup gate re-validates against real balance.
    swapMakerAdvertised = {
      price: Number(priceSats),
      min_quantity: Number(args.minSat || 10000),
      max_quantity: Number(args.maxSat || 4999999),
    };
    swapMaker = swapSwarm.startMaker({
      xkrAddress: walletBackend.getPrimaryAddress(),
      xkrPrivateSpendKey: spend,
      libp2pPeerId: swapMakerPeerId,
      asbHost: "127.0.0.1",
      asbPort: ASB_LISTEN_PORT,
      getQuote: async () => swapMakerAdvertised,
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