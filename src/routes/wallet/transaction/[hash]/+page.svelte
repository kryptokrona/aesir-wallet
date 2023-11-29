<script>
  import { onMount } from 'svelte';
  import { node } from '$lib/stores/node.js';
  import { page } from '$app/stores';
  import { fade } from 'svelte/transition';
  import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
  import { transactions } from '$lib/stores/wallet.js';
  import { goto } from '$app/navigation';
  let transaction;
  export let previousPage = '/wallet/dashboard';

  onMount(async () => {
    let prevParam = $page.url.searchParams.get('prev');
    if (prevParam) previousPage = '/wallet/' + prevParam;

    if (!$node.selectedNode) return;
    await getTransaction($page.params['hash']);
  });

  async function getTransaction(hash) {
    let thisTX = $transactions.txs.find((a) => a.hash === hash);
    if (thisTX.amount < 0) thisTX.incoming = false;
    else thisTX.incoming = true;
    transaction = thisTX;
    return;
  }

  function getTxDetails(hash) {
    const url = `https://xkr.network/transaction?hash=${hash}`;
    window.api.openLink(url);
  }

  function getBlockDetails(hash) {
    //We need the block hash for this
    return;
  }
</script>

<div class="header">
  <h3 in:fade>Transaction</h3>
  <button
    on:click={() => {
      goto(previousPage);
    }}
  >
    <ArrowLeft />
  </button>
</div>
<div class="wrapper">
  {#if transaction}
    <div>
      <h4>Amount</h4>
      <p class="amount" class:incoming={transaction.incoming}>
        {#if transaction.incoming}+{/if}{transaction.amount / 100000} XKR
      </p>
    </div>
    <div style="margin-top: .8em">
      <h4>Hash</h4>
      <p style="cursor: pointer;" on:click={() => getTxDetails(transaction.hash)}>{transaction.hash}</p>
    </div>
    <div style="margin-top: .8em">
      <h4>Timestamp</h4>
      <p>{new Date(transaction.time * 1000).toLocaleString()}</p>
    </div>
    <div style="margin-top: .8em">
      <h4>Block</h4>
      <p on:click={() => getBlockDetails(transaction.height)}>{transaction.height}</p>
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
</style>
