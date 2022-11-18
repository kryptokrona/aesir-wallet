import {writable} from "svelte/store";

export const user = writable({
    contacts: [],
    touchId: undefined,
    idleTime: 0,
})