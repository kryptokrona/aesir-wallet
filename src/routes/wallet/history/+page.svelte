<script>
  import Button from '$lib/components/buttons/Button.svelte';
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { transactions } from '$lib/stores/wallet.js';
  import { btc, refreshBtc } from '$lib/stores/btc.js';
  import { goto } from '$app/navigation';

  const PER_PAGE = 10;
  let pageNum = 0;
  let xkrTxs = [];

  onMount(async () => {
    await Promise.all([loadXkr(), refreshBtc()]);
  });

  async function loadXkr() {
    // all=true returns every XKR tx, already stripped of 0-amount optimize txs.
    // We paginate client-side so each page has a fixed count (the old server-side
    // paging filtered AFTER slicing, so pages had a fluctuating number of rows).
    const res = await window.api.getTransactions(0, true);
    xkrTxs = (res && res.pageTx) || [];
    // Keep the store populated so the tx-detail page can look XKR txs up by hash.
    $transactions.txs = xkrTxs;
  }

  // One unified history of BOTH assets, newest first.
  $: merged = [
    ...xkrTxs.map((t) => ({
      kind: 'xkr',
      id: t.hash,
      amount: parseFloat(t.amount) / 100000,
      time: t.time || 0,
      confirmed: t.confirmed !== false,
    })),
    ...(($btc.txs || []).map((t) => ({
      kind: 'btc',
      id: t.txid,
      amount: (t.amount_sat || 0) / 1e8,
      time: t.timestamp || 0,
      confirmed: !!t.confirmed,
    }))),
  ].sort((a, b) => (b.time || 0) - (a.time || 0));

  // Fixed rows per page (the last page may be shorter). Clamp the current page if
  // the underlying list shrank between refreshes.
  $: pages = Math.max(1, Math.ceil(merged.length / PER_PAGE));
  $: if (pageNum > pages - 1) pageNum = pages - 1;
  $: pageTx = merged.slice(pageNum * PER_PAGE, pageNum * PER_PAGE + PER_PAGE);
  $: page = pageNum + 1;

  const shortId = (id) => id.substring(0, 8) + '...' + id.substring(id.length - 8);

  function open(tx) {
    goto(`/wallet/transaction/${tx.id}?prev=history&kind=${tx.kind}`);
  }
</script>

<div class="header">
  <h3 in:fade>History</h3>
  {#if merged.length}<p>{page}/{pages}</p>{/if}
  <div in:fade>
    {#if pageNum > 0}<Button text="-" on:click={() => pageNum--} />{/if}
    {#if page < pages}<Button text="+" on:click={() => pageNum++} />{/if}
  </div>
</div>

<div>
  {#if pageTx.length}
    <div class="transactions">
      {#each pageTx as tx (tx.kind + tx.id)}
        <div class="row" class:unconfirmed={!tx.confirmed} on:click={() => open(tx)}>
          <p style="opacity: 80%;">{shortId(tx.id)}</p>
          <p class="tx" style="background: none" class:sent={tx.amount > 0}>
            {tx.kind === 'btc' ? tx.amount.toFixed(8) + ' BTC' : tx.amount.toFixed(5) + ' XKR'}
          </p>
        </div>
      {/each}
    </div>
  {:else}
    <div class="notx">
      <h3>No transactions</h3>
    </div>
  {/if}
</div>

<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 60px;
    border-bottom: 1px solid var(--border-color);
    padding: 0 2rem 0 2rem;
  }

  .transactions {
    height: 100%;
    width: 100%;
    overflow-y: scroll;
    box-sizing: border-box;
    --scrollbarBG: transparent;
    --thumbBG: #3337;
    scrollbar-width: thin;
    scrollbar-color: var(--thumbBG) var(--scrollbarBG);

    &::-webkit-scrollbar {
      display: none;
    }
  }
  .transactions::-webkit-scrollbar {
    width: 8px;
  }
  .transactions::-webkit-scrollbar-track {
    background: var(--scrollbarBG);
  }
  .transactions::-webkit-scrollbar-thumb {
    background-color: var(--thumbBG);
    border-radius: 3px;
    border: 3px solid var(--scrollbarBG);
  }
  .row {
    display: flex;
    box-sizing: border-box;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    height: 52.1px;
    padding: 0 2rem;
    border-bottom: 1px solid var(--border-color);
    &:hover {
      background-color: var(--border-color);
      border-bottom: 1px solid transparent;
      cursor: pointer;
    }
    &:active {
      color: #121212;
    }
  }
  .unconfirmed {
    opacity: 0.55;
  }

  .notx {
    padding: 30px;
  }
</style>
