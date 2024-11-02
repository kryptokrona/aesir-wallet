import { writable } from "svelte/store";

export const node = writable({
    selectedNode: undefined,
    walletBlockCount: null,
    localDaemonBlockCount: null,
    networkBlockCount: null,
    nodeStatus: '-',
    loading: false
})