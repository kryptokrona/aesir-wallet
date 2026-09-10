<script>
  import Button from '$lib/components/buttons/Button.svelte';
  import { fade } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import { transactions } from '$lib/stores/wallet.js';
  import { btc, refreshBtc } from '$lib/stores/btc.js';
  import { fiat, getCoinPriceFromAPI } from '$lib/stores/fiat.js';
  import { fiatStr } from '$lib/utils/fiat.js';
  import { goto } from '$app/navigation';

  const PER_PAGE = 10;
  let pageNum = 0;
  let xkrTxs = [];

  // Locally-recorded "first seen" time (unix seconds) per tx, so testnet block
  // timestamps that are 0 or bogusly in the FUTURE don't scramble the order. We
  // trust an on-chain time only when it's sane (present and not in the future);
  // otherwise we fall back to when this wallet first saw the tx. Persisted so the
  // order is stable across reloads.
  const TX_SEEN_KEY = 'txFirstSeen';
  let txSeen = {};
  try {
    txSeen = JSON.parse(localStorage.getItem(TX_SEEN_KEY) || '{}');
  } catch (_) {}
  function effTime(key, reported) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (!txSeen[key]) {
      txSeen[key] = nowSec;
      try {
        localStorage.setItem(TX_SEEN_KEY, JSON.stringify(txSeen));
      } catch (_) {}
    }
    return reported > 0 && reported <= nowSec ? reported : txSeen[key];
  }

  let btcPoll;
  onMount(async () => {
    await Promise.all([loadXkr(), refreshBtc(), getCoinPriceFromAPI()]);
    // Poll BTC so newly sent/received (unconfirmed) txs appear without a reload.
    btcPoll = setInterval(refreshBtc, 8000);
  });
  onDestroy(() => btcPoll && clearInterval(btcPoll));

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
      time: effTime('xkr:' + t.hash, t.time || 0),
      confirmed: t.confirmed !== false,
    })),
    ...(($btc.txs || []).map((t) => ({
      kind: 'btc',
      id: t.txid,
      amount: (t.amount_sat || 0) / 1e8,
      time: effTime('btc:' + t.txid, t.timestamp || 0),
      confirmed: !!t.confirmed,
    }))),
    // Pending (unconfirmed) txs just happened -- float them to the top even
    // though they have no timestamp yet, then order each group newest-first.
  ].sort((a, b) => (a.confirmed === b.confirmed ? b.time - a.time : a.confirmed ? 1 : -1));

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
        {@const fiatAmt = fiatStr(tx.amount, tx.kind, $fiat)}
        <div class="row" class:unconfirmed={!tx.confirmed} on:click={() => open(tx)}>
          <p style="opacity: 80%;">{shortId(tx.id)}</p>
          <!-- On hover, swap the crypto amount out for its fiat value (only when
               we actually have a price -- otherwise keep showing the crypto). -->
          <div class="amt" class:has-fiat={fiatAmt}>
            <p class="tx amount-crypto" style="background: none" class:sent={tx.amount > 0}>
              {tx.kind === 'btc' ? tx.amount.toFixed(8) + ' BTC' : tx.amount.toFixed(5) + ' XKR'}
            </p>
            {#if fiatAmt}
              <p class="tx amount-fiat" style="background: none" class:sent={tx.amount > 0}>{fiatAmt}</p>
            {/if}
          </div>
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

  .amt {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }
  .amt .tx {
    margin: 0;
  }
  // Fiat value is hidden by default and swapped in for the crypto amount only
  // while the row is hovered (and only when a price is available).
  .amount-fiat {
    display: none;
  }
  .row:hover .amt.has-fiat .amount-crypto {
    display: none;
  }
  .row:hover .amt.has-fiat .amount-fiat {
    display: block;
  }

  .notx {
    padding: 30px;
  }
</style>
