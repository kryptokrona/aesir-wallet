import {writable} from "svelte/store";

export const wallet = writable({
    wallets: [],
    currentWallet: undefined,
    balance: null,
    addresses: [],
    preparedTransaction: undefined,
    file: false,
    path: false,
    started: false,
    verify: false
})

export const transactions = writable({
    page: 0,
    txs: [],
    latest: [],
    pending: []
})