import {writable} from "svelte/store";

export const wallet = writable({
    currentWallet: undefined
})