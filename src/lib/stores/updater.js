import {writable} from "svelte/store";

export const updater = writable( {
    showPopup: false,
    updateAvailable: false,
    step: 1,
    percentageDownloaded: 0,
    dataDownloaded: 0,
    downloadSize: 0,
    downloadSpeed: 0,
    version: "1.0.0"
})