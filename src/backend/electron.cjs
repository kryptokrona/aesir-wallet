const windowStateManager = require("electron-window-state");
const contextMenu = require("electron-context-menu");
const { app, BrowserWindow, ipcMain, systemPreferences, powerMonitor, dialog } = require("electron");
const serve = require("electron-serve");
const path = require("path");
const WB = require("kryptokrona-wallet-backend-js");
const notifier = require("node-notifier");
const Crypto = require("kryptokrona-crypto").Crypto;
const fetch = require("cross-fetch");
const keytar = require("keytar");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const { createSwarm, destroySwarm, sendMessage } = require("./hyper/index.cjs");


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

const wallets = new Store();
const nodes = new Store();
const contacts = new Store();
const miscs = new Store();

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
    daemon = new WB.Daemon(node.url, node.port, node.ssl);
  }
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

//////// START WALLET
ipcMain.on("start-wallet", async (e, walletName, password, node, file) => {

  if (!daemon) {
    daemon = new WB.Daemon(node.url, node.port);
  }

  if (loggedIn) {
    await verifyPassword(password);
    return;
  }
  
  let knownWallets = await getMyWallets()
  //Save opened wallet file path if we did not create a new one on first start and name it if it's not known
  if (file) {
    if (!knownWallets.some(a => a.wallet === walletName)) {
      knownWallets.unshift({ wallet: walletName.toLowerCase(), path: file });
      wallets.set("wallets", knownWallets);
    }
  }

  [walletBackend] = await logIntoWallet(walletName, password);
  if (!walletBackend) return;

  await walletBackend.start();
  walletBackend.setLogLevel(WB.LogLevel.WARNING);
  walletBackend.enableAutoOptimization(true);
  walletBackend.scanCoinbaseTransactions(true);

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

ipcMain.handle("create-wallet", async (e, walletName, password, node) => {
  
  try {

    if (!daemon) {
      daemon = new WB.Daemon(node.url, node.port, node.ssl);
    }

    walletName = walletName.toLowerCase()

    walletBackend = await WB.WalletBackend.createWallet(daemon);

    const [seed, err] = await walletBackend.getMnemonicSeed();

    let height;

    try {
      const req = await fetch(`http://${node.url}:${node.port}/getinfo`);
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

    [walletBackend, error] = await WB.WalletBackend.importWalletFromSeed(daemon, height, seed);
  
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

async function saveWalletInfo(walletName) {
  let walletPath = userDataDir + "/" + walletName + ".wallet"
  let knownWallets = await getMyWallets()
  knownWallets.unshift({ wallet: walletName.toLowerCase(), path: walletPath });
  await wallets.set("wallets", knownWallets);
  return walletPath
}

async function getWalletPath(walletName) {
  let knownWallets = await getMyWallets()
  const thisWallet = knownWallets.find(a => a.wallet === walletName)
  
  //If no path is found, save the wallet in AppData folder
  if (thisWallet?.path === undefined) return userDataDir + "/" + walletName + ".wallet"
  return thisWallet.path
}

async function logIntoWallet(walletName, password) {
  const thisPath = await getWalletPath(walletName)
  const [walletBackend, error] = await WB.WalletBackend.openWalletFromFile(daemon, thisPath, password);
  if (error) {
    console.log("Failed to open wallet: " + error.toString());
    mainWindow.webContents.send("wrong-password");
    return [false];
  } else {
    loggedIn = true;
    successMessage('Starting wallet...')
    userPassword = await crypto.cn_fast_hash(toHex(password));
    return [walletBackend];
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
    try {
      const req = await fetch(`${node.ssl ? 'https://' : 'http://' }${node.url}:${node.port}/getinfo`);
      if (!req.ok) {
        return false
      }

      const res = await req.json();

      return res.status === "OK";

    } catch (e) {
      console.log(e);
      return false
    }
});

ipcMain.handle('change-node', async (e, node) => {
  console.log('SETTING', node);
  daemon = new WB.Daemon(node.url, node.port, node.ssl)
  await walletBackend.swapNode(daemon)
  nodes.set("node", { url: node.url, port: node.port, ssl: node.ssl });
  successMessage('Connecting to node')
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

ipcMain.handle('create-subwallet', async (e) => {
  const [address, error] = await walletBackend.addSubWallet();
  if (!error) {
    console.log(`Created subwallet with address of ${address}`);
  }
  await saveWallet(userDataDir, walletName, password)
})

ipcMain.handle('delete-subwallet', async (e) => {

})

ipcMain.handle('balance-subwallet', async (e) => {

})

ipcMain.handle('prepare-transaction', async (e, address, amount, paymentID, sendAll) => {
  console.log(address, amount, paymentID, sendAll);
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
  if (!result.success) errorMessage('Error: Could not send transaction')
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

ipcMain.handle('generate-paymentId', async (e, paymentId) => {
  return WB.validatePaymentID(paymentId);
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

const sender = (channel, data) => {
  mainWindow.webContents.send(channel, data)
}

ipcMain.on('connect-hyper', async (e, secret) => {
  createSwarm(sender, secret)
})

ipcMain.on('disconnect-hyper', async (e, domain) => {
  destroySwarm(sender)
})

ipcMain.on('send-message', async (e, data) => {
  sendMessage(data)
})

///////////// OPEN URL IN EXTERNAL BROWSER

ipcMain.on('open-link', async (e, url) => {
  const {shell} = require('electron')
  shell.openExternal(url)
})