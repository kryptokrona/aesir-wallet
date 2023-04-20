<script>
  import { onMount } from 'svelte';
  import { node } from '$lib/stores/node.js';
  import { page } from '$app/stores';
  import { fade } from 'svelte/transition';
  import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
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
    let endpoint = `https://blocksum.org/api/json_rpc`; // TODO, change endpoint?
    const response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-cache',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'getTransaction',
        method: 'f_transaction_json',
        params: {
          hash: hash,
        },
      }),
    });
    let data = await response.json();
    transaction = data.result;
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
      <h4>Hash</h4>
      <p>{transaction.txDetails.hash}</p>
    </div>
    {#if transaction.block}
      <div style="margin-top: .5em">
        <h4>Block hash</h4>
        <p>{transaction.block.hash}</p>
      </div>
      <div style="margin-top: .5em">
        <h4>Block height</h4>
        <p>{transaction.block.height}</p>
      </div>
      <div style="margin-top: .5em">
        <h4>Block difficulty</h4>
        <p>{transaction.block.difficulty}</p>
      </div>
      <div style="margin-top: .5em">
        <h4>Timestamp</h4>
        <p>{new Date(transaction.block.timestamp * 1000).toLocaleString()}</p>
      </div>
    {/if}
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
    padding: 30px;
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
</style>
