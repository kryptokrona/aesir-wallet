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
ipcMain.on("start-wallet", async (e, walletName, password, node) => {

  if (!daemon) {
    daemon = new WB.Daemon(node.url, node.port);
  }

  if (loggedIn) {
    await verifyPassword(password);
    return;
  }

  walletBackend = await logIntoWallet(walletName, password);
  if (!walletBackend) return;

  await walletBackend.start();
  walletBackend.setLogLevel(WB.LogLevel.WARNING);
  walletBackend.enableAutoOptimization(true);
  walletBackend.scanCoinbaseTransactions(true);

  const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = walletBackend.getSyncStatus();
  const balance = await walletBackend.getBalance();
  mainWindow.webContents.send("data", { walletBlockCount, localDaemonBlockCount, networkBlockCount, balance });

  const privateViewKey = walletBackend.getPrivateViewKey();
  const myAddress = walletBackend.getPrimaryAddress();
  const [publicSpendKey, privateSpendKey, err] = await walletBackend.getSpendKeys(myAddress);
  const keyset = { publicSpendKey, privateSpendKey, privateViewKey };

  if (err) {
    console.log("Failed to get spend keys for address: " + err.toString());
  }

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

  walletBackend.on("heightchange", async (walletBlockCount, localDaemonBlockCount, networkBlockCount) => {
    miscs.set("node-stats", { walletBlockCount, localDaemonBlockCount, networkBlockCount });

  });

  mainWindow.webContents.send("wallet-started");

  while (true) {

    try {
      //Start syncing
      await sleep(5 * 1000);
      backgroundSyncTransactions(keyset, node);
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
        console.log("******** SAVING WALLET ********");
        await walletBackend.saveWalletToFile(userDataDir + "/" + walletName + ".wallet", password);
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

let known_pool_txs = [];

async function backgroundSyncTransactions(keyset, node) {

  let message_was_unknown;
  try {
    const resp = await fetch(`${node.ssl ? 'https://' : 'http://'}${node.url}:${node.port}/get_pool_changes_lite`, {
      method: "POST",
      body: JSON.stringify({ knownTxsIds: known_pool_txs })
    });
    let json = await resp.json();
    json = JSON.stringify(json).replaceAll(".txPrefix", "").replaceAll("transactionPrefixInfo.txHash", "transactionPrefixInfotxHash");
    json = JSON.parse(json);
    let txs = json.addedTxs;

    txs.forEach(tx => {
      checkTx(tx, keyset);
    });

  } catch (err) {
    console.log(err);
    console.log("Sync error");
  }
}

//Checks if we can unlock transactions
async function checkTx(tx, keyset) {
  if (tx.transactionPrefixInfo.extra.length >= 200) return
  known_pool_txs.push(tx.transactionPrefixInfotxHash);
  const txPublicKey = tx.transactionPrefixInfo.extra.substring(2, 66);
  const derivation = await crypto.generateKeyDerivation(txPublicKey, keyset.privateViewKey);
  const transactionOutputs = tx.transactionPrefixInfo.vout.entries();

  for (const [outputIndex, output] of tx.transactionPrefixInfo.vout.entries()) {

    /* Derive the spend key from the transaction, using the previous
       derivation */
    const derivedSpendKey = await crypto.underivePublicKey(derivation, outputIndex, output.target.data.key);

    /* See if the derived spend key matches any of our spend keys */
    if (keyset.publicSpendKey === derivedSpendKey) {
      console.log("******************** Found transaction *******************", derivedSpendKey);
      mainWindow.webContents.send("incoming-hash", tx.transactionPrefixInfotxHash);
      notifier.notify({
        appID: "Kryptokrona Wallet",
        title: "Found a transaction",
        message: `Waiting for confirmation..`,
        icon: "https://cdn.discordapp.com/attachments/788875613753835533/975829842870280282/icon.png",
        wait: true
      });
    }
  }
}

ipcMain.on("reset-wallet", (e, height) => {

  walletBackend.reset(parseInt(height));

});

ipcMain.on("rewind-wallet", async (e, height) => {

  walletBackend.rewind(parseInt(height));

});

ipcMain.handle("create-wallet", async (e, walletName, password, node) => {
  try {

    if (!daemon) {
      daemon = new WB.Daemon(node.url, node.port, node.ssl);
    }

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
      height = 1250000;
    }

    [walletBackend, error] = await WB.WalletBackend.importWalletFromSeed(daemon, height, seed);

    walletBackend.saveWalletToFile(userDataDir + "/" + walletName + ".wallet", password);
    await keytar.setPassword(`yggdrasilwallet?=${walletName}`, walletName, password);

    let knownWallets = await wallets.get("wallets") ?? [];
    knownWallets.unshift({ wallet: walletName.toLowerCase() });
    await wallets.set("wallets", knownWallets);

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

async function logIntoWallet(walletName, password) {
  const [walletBackend, error] = await WB.WalletBackend.openWalletFromFile(daemon, userDataDir + "/" + walletName + ".wallet", password);
  if (error) {
    console.log("Failed to open wallet: " + error.toString());
    mainWindow.webContents.send("wrong-password");
    return false;
  } else {
    loggedIn = true;
    userPassword = await crypto.cn_fast_hash(toHex(password));
    return walletBackend;
  }
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

  const saved = walletBackend.saveWalletToFile(userDataDir + "/" + walletName + ".wallet", password);

  if (!saved) {
    console.log("Failed to save wallet!");
    return false;
  }

  //TODO fix a save wallet function
  let knownWallets = await wallets.get("wallets") ?? [];
  knownWallets.unshift({ wallet: walletName.toLowerCase() });
  await wallets.set("wallets", knownWallets);

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
    const allTx = await walletBackend.getTransactions()
    if (all) return allTx
    const pages = Math.ceil(allTx.length / showPerPage)
    const pageTx = []
    for (const tx of await walletBackend.getTransactions(startIndex, showPerPage)) {

        pageTx.push({
            hash: tx.hash,
            amount: tx.totalAmount(),
            time: tx.timestamp,
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
  console.log('******** SAVING WALLET ********');
  walletBackend.saveWalletToFile(userDataDir + '/' + walletName + '.wallet', password)
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
    console.log(`Failed to prepare transaction: ${result.error.toString()}`);
  }
})

ipcMain.handle('send-transaction', async (e, hash) => {
  const result = await walletBackend.sendPreparedTransaction(hash)
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
