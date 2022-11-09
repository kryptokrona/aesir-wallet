// preload.cjs

const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('api', {
    send: (channel, data) => {
        ipcRenderer.send(channel, data);
    },
    sendSync: (channel, data) => {
        ipcRenderer.sendSync(channel, data);
    },
    receive: (channel, func) => {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    invoke: async (channel, data) => {
        return await ipcRenderer.invoke(channel, data)
    },


    startApp: () => {
        ipcRenderer.send('start-app')
    },


    getNode: async () => {
        return await ipcRenderer.invoke('get-node')
    },
    checkNode: async (node) => {
        return await ipcRenderer.invoke('check-node', node)
    },


    getWallets: async () => {
        return await ipcRenderer.invoke('get-wallets')
    },
    walletStart: (walletName, password, node) => {
        ipcRenderer.send('start-wallet', walletName, password, node)
    },
    walletCreate: async (walletName, password, node) => {
        return await ipcRenderer.invoke('create-wallet', walletName, password, node)
    }


});
