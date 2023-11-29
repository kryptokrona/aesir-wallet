import {writable} from "svelte/store";
import { browser } from "$app/environment";

export const user = writable({
    contacts: [],
    touchId: undefined,
    idleTime: 0,
})

export const theme = writable(localStorage.getItem("themes") ?? 'blue');