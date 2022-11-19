// preload.cjs

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
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
    return await ipcRenderer.invoke(channel, data);
  },


  startApp: () => {
    ipcRenderer.send("start-app");
  },

  checkTouchId: () => {
    return ipcRenderer.invoke("check-touchId");
  },


  getNode: async () => {
    return await ipcRenderer.invoke("get-node");
  },
  checkNode: async (node) => {
    return await ipcRenderer.invoke("check-node", node);
  },


  getWallets: async () => {
    return await ipcRenderer.invoke("get-wallets");
  },
  walletStart: (walletName, password, node) => {
    ipcRenderer.send("start-wallet", walletName, password, node);
  },
  walletCreate: async (walletName, password, node) => {
    return await ipcRenderer.invoke("create-wallet", walletName, password, node);
  },
  createSubwallet: async () => {
    return await ipcRenderer.invoke('create-subwallet')
  },
  deleteSubwallet: async (subwallet) => {
    return await ipcRenderer.invoke('delete-subwallet', subwallet)
  },
  subwalletBalance: async (subwallet) => {
    return await ipcRenderer.invoke('balance-subwallet', subwallet)
  },
  importSeed: async (seed, walletName, password, height, node) => {
    return await ipcRenderer.invoke("import-seed", seed, walletName, password, height, node);
  },
  getAddresses: () => {
    return ipcRenderer.invoke("get-addresses");
  },
  getSeed: () => {
    return ipcRenderer.invoke("get-seed");
  },


  getContacts: async () => {
    return await ipcRenderer.invoke("get-contacts");
  },
  saveContact: async (username, address) => {
    return await ipcRenderer.invoke("save-contact", username, address);
  },
  deleteContact: async (contact) => {
    return await ipcRenderer.invoke('delete-contact', contact)
  },
  importContacts: async () => {
    return await ipcRenderer.invoke('import-contacts')
  },


  prepareTransaction: async (address, amount, paymentID, sendAll) => {
    return await ipcRenderer.invoke('prepare-transaction', address, amount, paymentID, sendAll)
  },
  sendTransaction: async (hash) => {
    return await ipcRenderer.invoke('send-transaction', hash)
  },
  deleteTransaction: async (hash) => {
    return await ipcRenderer.invoke('delete-transaction', hash)
  },


});
