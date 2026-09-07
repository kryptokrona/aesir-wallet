<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fade } from 'svelte/transition';
  import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
  import { transactions } from '$lib/stores/wallet.js';
  import { btc, refreshBtc } from '$lib/stores/btc.js';
  import { goto } from '$app/navigation';
  let transaction;
  export let previousPage = '/wallet/dashboard';

  onMount(async () => {
    const prevParam = $page.url.searchParams.get('prev');
    if (prevParam) previousPage = '/wallet/' + prevParam;
    const kind = $page.url.searchParams.get('kind') || 'xkr';
    if (kind === 'btc') await refreshBtc();
    load($page.params['hash'], kind);
  });

  function load(id, kind) {
    if (kind === 'btc') {
      const t = ($btc.txs || []).find((a) => a.txid === id);
      if (!t) return;
      transaction = {
        kind: 'btc',
        id: t.txid,
        amount: (t.amount_sat || 0) / 1e8,
        incoming: (t.amount_sat || 0) > 0,
        time: t.timestamp || 0,
        height: t.confirmed ? t.height : 'Unconfirmed',
      };
    } else {
      let t = $transactions.txs.find((a) => a.hash === id);
      if (!t) t = ($transactions.pending || []).find((a) => a.hash === id);
      if (!t) return;
      transaction = {
        kind: 'xkr',
        id: t.hash,
        amount: t.amount / 100000,
        incoming: t.amount > 0,
        time: t.time,
        height: t.height,
      };
    }
  }

  function openExplorer() {
    const url =
      transaction.kind === 'btc'
        ? `https://mempool.space/testnet/tx/${transaction.id}`
        : `https://xkr.network/transaction?hash=${transaction.id}`;
    window.api.openLink(url);
  }
</script>

<div class="header">
  <h3 in:fade>Transaction</h3>
  <button on:click={() => goto(previousPage)}>
    <ArrowLeft />
  </button>
</div>
<div class="wrapper">
  {#if transaction}
    <div>
      <h4>Amount</h4>
      <p class="amount" class:incoming={transaction.incoming}>
        {#if transaction.incoming}+{/if}{transaction.amount}
        {transaction.kind === 'btc' ? 'BTC' : 'XKR'}
      </p>
    </div>
    <div style="margin-top: .8em">
      <h4>{transaction.kind === 'btc' ? 'Transaction ID' : 'Hash'}</h4>
      <p style="cursor: pointer;" on:click={openExplorer}>{transaction.id}</p>
    </div>
    <div style="margin-top: .8em">
      <h4>Timestamp</h4>
      <p>{transaction.time ? new Date(transaction.time * 1000).toLocaleString() : '—'}</p>
    </div>
    <div style="margin-top: .8em">
      <h4>Block</h4>
      <p>{transaction.height}</p>
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
  .wrapper {
    word-break: break-all;
    width: 100%;
    height: 100%;
    padding: 25px;
  }
  .wrapper p {
    -moz-user-select: text;
    -khtml-user-select: text;
    -webkit-user-select: text;
    -ms-user-select: text;
    user-select: text;
    margin: 0;
    padding: 0;
  }
  h2 {
    opacity: 0.8;
  }
  .hash {
    font-size: 0.8em;
  }
  button {
    border: 1px solid var(--button-b-color);
    background-color: var(--button-bg-color);
    height: 36px;
    width: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    cursor: pointer;
    transition: 100ms ease-in-out;

    &:hover {
      background: var(--button-hover-bg-color);
    }
  }

  .amount {
    font-size: 22px;
    color: var(--warn-color);
    font-family: 'Roboto Mono';
  }

  .incoming {
    color: var(--primary-color);
  }

  .explorer {
    cursor: pointer;
    color: var(--primary-color);
    font-size: 0.9em;
    &:hover {
      text-decoration: underline;
    }
  }
</style>
