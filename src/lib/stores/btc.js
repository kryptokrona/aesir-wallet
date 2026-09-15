import { writable, get } from "svelte/store";

export const btc = writable({
  balanceSat: null,
  address: null,
  txs: [],
  engineUp: false,
});

export async function refreshBtc() {
  if (typeof window === "undefined" || !window.api) return;
  try {
    const [status, bal, txs] = await Promise.all([
      window.api.invoke("swap-rpc-status"),
      window.api.invoke("swap-balance"),
      window.api.invoke("swap-btc-txs"),
    ]);
    const cur = get(btc);
    let address = cur.address;
    if (!address) {
      const addr = await window.api.invoke("swap-bitcoin-address");
      if (addr && addr.ok) address = addr.result?.address ?? null;
    }
    btc.set({
      balanceSat: bal && bal.ok ? bal.result?.balance ?? cur.balanceSat : cur.balanceSat,
      address,
      txs: txs && txs.ok && Array.isArray(txs.result) ? txs.result : cur.txs,
      engineUp: !!(status && status.engineRunning),
    });
  } catch (_) {}
}
