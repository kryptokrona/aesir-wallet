import {writable} from "svelte/store";

export const wallet = writable({
    wallets: [],
    currentWallet: undefined,
    balance: [0, 0],
    addresses: [],
    preparedTransaction: undefined,
    file: false,
    path: false
})

export const transactions = writable({
    page: 0,
    txs: [],
    latest: [],
    pending: []
})