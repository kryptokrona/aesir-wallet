const windowStateManager = require('electron-window-state');
const contextMenu = require('electron-context-menu');
const {app, BrowserWindow, ipcMain, systemPreferences} = require('electron');
const serve = require('electron-serve');
const path = require('path');
const WB = require("kryptokrona-wallet-backend-js");
const fs = require('fs')
const notifier = require('node-notifier');
const {validateAddress} = require("kryptokrona-wallet-backend-js");
const Crypto = require('kryptokrona-crypto').Crypto
const fetch = require('cross-fetch')
const keytar = require('keytar')
const Store = require('electron-store');

try {
    require('electron-reloader')(module);
} catch (e) {
    console.error(e);
}

const serveURL = serve({directory: '.'});
const port = process.env.PORT || 5173;
const dev = !app.isPackaged;
let mainWindow;

let userDataDir = app.getPath('userData');
const crypto = new Crypto();

function createWindow() {
    let windowState = windowStateManager({
        defaultWidth: 700,
        defaultHeight: 600,
    });

    const mainWindow = new BrowserWindow({
        transparent: true,
        frame: false,
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
        height: windowState.height,
    });

    windowState.manage(mainWindow);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.on('close', () => {
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
            label: 'Make App 💻',
        },
    ],
});

function loadVite(port) {
    mainWindow.loadURL(`http://localhost:${port}`).catch((e) => {
        console.log('Error loading URL, retrying', e);
        setTimeout(() => {
            loadVite(port);
        }, 200);
    });
}

function createMainWindow() {
    mainWindow = createWindow();
    mainWindow.once('close', () => {
        mainWindow = null;
    });

    if (dev) loadVite(port);
    else serveURL(mainWindow);
}

app.once('ready', createMainWindow);

app.on('activate', () => {
    if (!mainWindow) {
        createMainWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('quit', () => {
    app.quit()
})

ipcMain.on('minimize', () => {
    mainWindow.minimize()
})

//ABOVE IS ALL ELECTRON
// 🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨
//BELOW IS WALLET APP

let walletBackend
let node
let ports
let daemon

const wallets = new Store()
const nodes = new Store()
const contacts = new Store()
const miscs = new Store()


ipcMain.on('start-app', async e => {
    const myWallets = await wallets.get('wallets')
    const touchId = systemPreferences.canPromptTouchID()
    const node = await nodes.get('node')
    const data = {myWallets, touchId, node}
    mainWindow.webContents.send('started-app', data)
    if(node) {
        daemon = new WB.Daemon(node.url, node.port);
    }
})


//////// START WALLET
ipcMain.on('start-wallet', async (e, walletName, password, node) => {

    if(!daemon) {
        daemon = new WB.Daemon(node.url, node.port);
    }

    walletBackend = await logIntoWallet(walletName, password)

    if (walletBackend === 'Wrong password') {
        mainWindow.webContents.send('wrong-password', true)
        return
    }

    await walletBackend.start();
    mainWindow.webContents.send('wallet-started')
    walletBackend.setLogLevel(WB.LogLevel.WARNING)
    walletBackend.enableAutoOptimization(true);
    walletBackend.scanCoinbaseTransactions(true)

    const privateViewKey = walletBackend.getPrivateViewKey();
    const myAddress = walletBackend.getPrimaryAddress()
    const [publicSpendKey, privateSpendKey, err] = await walletBackend.getSpendKeys(myAddress);

    if (err) {
        console.log('Failed to get spend keys for address: ' + err.toString());
    }

    const keyset = {publicSpendKey, privateSpendKey, privateViewKey}

    //////////////// EVENTS
    walletBackend.on('desync', (walletHeight, networkHeight) => {
        console.log(`Wallet is no longer synced! Wallet height: ${walletHeight}, Network height: ${networkHeight}`);
    });

    walletBackend.on('disconnect', (error) => {
        console.log('Possibly lost connection to daemon: ' + error.toString());
        mainWindow.webContents.send('node-status', 'Disconnected')
    });

    walletBackend.on('connect', () => {
        console.log('Regained connection to daemon!');
        mainWindow.webContents.send('node-status', 'Connected')
    });

    walletBackend.on('incomingtx', (transaction) => {
        console.log(transaction)
        notifier.notify({
            title: 'Transaction confirmed',
            message: `${transaction.totalAmount()} XKR`,
            icon: 'https://cdn.discordapp.com/attachments/788875613753835533/975829842870280282/icon.png',
            wait: true
        });
        console.log(`🚨 INCOMING TX - AMOUNT: ${WB.prettyPrintAmount(transaction.totalAmount())}`);
    });

    walletBackend.on('heightchange', async (walletBlockCount, localDaemonBlockCount, networkBlockCount) => {
        console.log('HEIGHT CHANGE')

        if ((localDaemonBlockCount - walletBlockCount) < 2) {
            //Save height to misc.db
            miscs.set('node-stats', {walletBlockCount, localDaemonBlockCount, networkBlockCount})

            //Save new height to wallet file
            console.log('******** SAVING WALLET ********');
            walletBackend.saveWalletToFile(userDataDir + '/' + walletName + '.wallet', password)
        }
    })

    while (true) {

        try {
            //Start syncing
            await sleep(3000);
            backgroundSyncTransactions(keyset)
            const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = walletBackend.getSyncStatus();
            mainWindow.webContents.send('node-sync-data', {walletBlockCount, localDaemonBlockCount, networkBlockCount})
            if ((localDaemonBlockCount - walletBlockCount) < 2) {
                // Diff between wallet height and node height is 1 or 0, we are synced
                console.log('walletBlockCount', walletBlockCount);
                console.log('localDaemonBlockCount', localDaemonBlockCount);
                console.log('networkBlockCount', networkBlockCount);
                console.log('SYNCED ✅');
                mainWindow.webContents.send('node-status', 'Synced ✅')
            } else {
                if ((networkBlockCount - walletBlockCount) > 100000 || walletBlockCount === 0) {
                    await walletBackend.reset(networkBlockCount - 1000)
                }
                console.log('********SYNCING********');
                console.log('Wallet ', walletBlockCount);
                console.log('LocalD', localDaemonBlockCount);
                console.log('Network', networkBlockCount);
                console.log('SYNCING 📡');
                mainWindow.webContents.send('node-status', 'Syncing 📡')
            }
        } catch (err) {
            console.log(err);
        }
    }
})

let known_pool_txs = []

async function backgroundSyncTransactions(keyset) {
    console.log('Background syncing...');
    let message_was_unknown;
    try {
        const resp = await fetch('http://' + 'blocksum.org:11898' + '/get_pool_changes_lite', {
            method: 'POST',
            body: JSON.stringify({knownTxsIds: known_pool_txs})
        })
        let json = await resp.json();
        json = JSON.stringify(json).replaceAll('.txPrefix', '').replaceAll('transactionPrefixInfo.txHash', 'transactionPrefixInfotxHash');
        json = JSON.parse(json);
        let txs = json.addedTxs


        txs.forEach(tx => {
            checkTx(tx, keyset)
        })

    } catch (err) {
        console.log(err);
        console.log('Sync error')
    }
}

//Checks if we can unlock transactions
async function checkTx(tx, keyset) {
    known_pool_txs.push(tx.transactionPrefixInfotxHash)
    const txPublicKey = tx.transactionPrefixInfo.extra.substring(2, 66)
    console.log('HEEJ', txPublicKey)
    const derivation = await crypto.generateKeyDerivation(txPublicKey, keyset.privateViewKey);
    const transactionOutputs = tx.transactionPrefixInfo.vout.entries()

    for (const [outputIndex, output] of tx.transactionPrefixInfo.vout.entries()) {
        console.log('testing this key', output.target.data.key);

        /* Derive the spend key from the transaction, using the previous
           derivation */
        const derivedSpendKey = await crypto.underivePublicKey(derivation, outputIndex, output.target.data.key);
        console.log('derived', derivedSpendKey);

        /* See if the derived spend key matches any of our spend keys */
        if (keyset.publicSpendKey === derivedSpendKey) {
            console.log('******************** Found transaction *******************', derivedSpendKey);
            mainWindow.webContents.send('incoming-hash', tx.transactionPrefixInfotxHash)
            notifier.notify({
                title: 'Found a transaction',
                message: `Waiting for confirmation..`,
                icon: 'https://cdn.discordapp.com/attachments/788875613753835533/975829842870280282/icon.png',
                wait: true
            });
        }
    }
}

ipcMain.handle('create-wallet', async (e, walletName, password, node) => {

    try {
        daemon = new WB.Daemon(node.url, node.port);
        walletBackend = await WB.WalletBackend.createWallet(daemon);

        walletBackend.saveWalletToFile(userDataDir + '/' + walletName + '.wallet', password)
        await keytar.setPassword(`yggdrasilwallet?=${walletName}`, walletName, password)
        let knownWallets = await wallets.get('wallets') ?? []
        knownWallets.push({wallet: walletName.toLowerCase()})
        await wallets.set('wallets', knownWallets)
    } catch (e) {
        console.log(e)
        return false
    }

    nodes.set('node', {url: node.url, port: node.port})
    return true
})

async function logIntoWallet(walletName, password) {
    const [walletBackend, error] = await WB.WalletBackend.openWalletFromFile(daemon, userDataDir + '/' + walletName + '.wallet', password);
    if (error) {
        console.log('Failed to open wallet: ' + error.toString());
        return 'Wrong password'
    }
    return walletBackend
}

ipcMain.handle('get-wallets', (e) => {
    const myWallets = wallets.get('wallets')
    if (myWallets) {
        return myWallets
    } else return false
})

ipcMain.handle('get-node', async (e) => {
    const node = nodes.get('node')
    if (node) {
        return node
    } else return false
})

ipcMain.handle('check-node', async (e, node) => {
    return await new Promise(async (resolve, reject) => {
        console.log(node)
        try {
            const req = await fetch(`http://${node.url}:${node.port}/getinfo`)
            if (!req.ok) {
                return reject('error')
            }

            const res = await req.json()
            if (res.status !== 'OK') {
                return reject('error')
            }

            return resolve('success')

        } catch (e) {
            console.log(e)
            return reject('error')
        }
    })
})

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}






