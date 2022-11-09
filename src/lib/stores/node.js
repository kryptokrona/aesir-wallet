import { writable } from "svelte/store";

export const node = writable({
    selectedNode: undefined,
})