import { writable } from "svelte/store";

export const MODES = ["xkr", "btc", "fiat"];

function createWalletMode() {
  const { subscribe, set, update } = writable("xkr");
  return {
    subscribe,
    set,
    cycle: () => update((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]),
  };
}

export const walletMode = createWalletMode();
