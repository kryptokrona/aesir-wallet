<script>
  import Button from '$lib/components/buttons/Button.svelte';
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { transactions } from '$lib/stores/wallet.js';
  import { goto } from '$app/navigation';

  let pageNum = 0;
  let pages = 1;
  let txList = [];

  onMount(() => {
    getTransactions();
  });

  async function getTransactions(all = false) {
    let startIndex = pageNum * 10;
    let txs = await window.api.getTransactions(startIndex, all);
    txList = txs.pageTx;
    pages = txs.pages;
    $transactions.txs = txList;
    $transactions.page = pageNum;
  }

  $: pageNum;
  $: page = pageNum + 1;
</script>

<div class="header">
  <h3 in:fade>History</h3>
  <p>{page}/{pages}</p>
  <div in:fade>
    {#if pageNum > 0}
      <Button text="-" on:click={() => getTransactions(pageNum--)} />
    {/if}
    {#if pages >= page + 1}
      <Button text="+" on:click={() => getTransactions(pageNum++)} />
    {/if}
  </div>
</div>

<div>
  {#if txList.length}
    <div class="transactions">
      {#each $transactions.txs as tx}
        <div class="row" on:click={() => goto(`/wallet/transaction/${tx.hash}?prev=history`)}>
          <p style="opacity: 80%;">
            {tx.hash.substring(0, 8) + '...' + tx.hash.substring(56, tx.hash.length)}
          </p>
          <p class="tx" style="background: none" class:sent={parseFloat(tx.amount) > 0}>
            {parseFloat(tx.amount / 100000).toFixed(5)}
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
    width: 100%;
    height: 50px;
    padding: 0 2rem;
    border-bottom: 1px solid var(--border-color);
    &:hover {
      background-color: var(--border-color);
      cursor: pointer;
    }
    &:active {
      color: #121212;
    }
  }

  .notx {
    padding: 30px;
  }
</style>
