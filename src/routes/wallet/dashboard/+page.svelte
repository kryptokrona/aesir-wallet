<script>
  import { fade } from 'svelte/transition';
  import { wallet } from '$lib/stores/wallet.js';
  import { fiat } from '$lib/stores/fiat.js';
  import { onMount } from 'svelte';
  import { LinkedChart, LinkedLabel } from 'svelte-tiny-linked-charts';

  const MAX_PAGES = 10;
  var incommingTransactions = [];
  var outgoingTransactions = [];
  var outgoingDates = [];
  var incommingDates = [];
  var showIncommingTransactions = true;

  $: fiatBalance = '$' + (($wallet.balance[0] * $fiat) / 100000).toFixed(5);

  onMount(async () => {
    await formatTransactions();
  });

  async function getTransactions(transactions, pageNum) {
    let startIndex = pageNum * 10;
    let txs = await window.api.getTransactions(startIndex);
    transactions = transactions.concat(txs.pageTx);

    if (pageNum < txs.pages && MAX_PAGES > pageNum) {
      return await getTransactions(transactions, pageNum + 1);
    }
    return transactions;
  }

  async function formatTransactions() {
    let transactions = [];
    transactions = await getTransactions(transactions, 0);

    incommingTransactions = [];
    outgoingTransactions = [];

    for (let i = 0; i < transactions.length; i++) {
      let value = transactions[i].amount / 100000;
      let date = new Date(transactions[i].time * 1000).toUTCString();

      if (value >= 0) {
        let existingDateIndex = incommingDates.findIndex((d) => d == date);
        if (existingDateIndex > -1) {
          incommingTransactions[existingDateIndex] += value;
        } else {
          incommingTransactions.push(value);
          incommingDates.push(date);
        }
      } else {
        let existingDateIndex = outgoingDates.findIndex((d) => d == date);
        if (existingDateIndex > -1) {
          outgoingTransactions[existingDateIndex] += value * -1;
        } else {
          outgoingTransactions.push(value * -1);
          outgoingDates.push(date);
        }
      }
    }

    outgoingTransactions = outgoingTransactions.map((t) => t.toFixed(3));
    incommingTransactions = incommingTransactions.map((t) => t.toFixed(3));
    outgoingTransactions.reverse();
    incommingTransactions.reverse();
    incommingDates.reverse();
    outgoingDates.reverse();
    incommingDates = incommingDates;
  }

  $: fiatBalance = '$' + (($wallet.balance[0] * $fiat) / 100000).toFixed(5);
</script>

<div class="header">
  <h3 in:fade>Dashboard</h3>
</div>

<div class="wrapper">
  <div class="card-wrapper">
    <h3>Fiat value</h3>
    <p>{fiatBalance}</p>
  </div>
  <div style="margin-top: 10px; position: relative">
    {#if incommingDates.length > 0}
      <div style="text-align: center; margin-bottom: 50px">
        <button
          on:click={() => (showIncommingTransactions = true)}
          class="chart-category"
          style="width: 10px; height: 10px; background-color: #0eff6b; border: none; "
          id="incomming"
        />
        <label class="chart-category" for="incomming" style="margin-right: 8px">incomming</label>

        <button
          on:click={() => (showIncommingTransactions = false)}
          class="chart-category"
          style="width: 10px; height: 10px; background-color: #5a8bdb; border: none; "
          id="outgoing"
        />
        <label class="chart-category" for="outgoing">outgoing</label>
      </div>

      <div style="margin-left: 40px;">
        {#if showIncommingTransactions}
          <div
            style="text-align: center; position: absolute; left: 0; right: 0; top: 25px; margin: auto; font-family: Roboto Mono, monospace; font-size: 14px;"
          >
            <LinkedLabel linked="incomming" />
          </div>
          <div>
            <LinkedChart
              values={incommingTransactions}
              labels={incommingDates}
              linked="incomming"
              valuePosition="floating"
              showValue={true}
              fill="#0eff6b"
              tabindex="0"
              height="300"
              width="440"
              align="left"
              gap="4"
              valueAppend="xkr"
              grow={true}
            />
          </div>
        {:else}
          <div
            style="text-align: center; position: absolute; left: 0; right: 0; top: 25px; margin: auto; font-family: Roboto Mono, monospace; font-size: 14px;"
          >
            <LinkedLabel linked="outgoing" />
          </div>
          <div>
            <LinkedChart
              values={outgoingTransactions}
              labels={outgoingDates}
              linked="outgoing"
              valuePosition="floating"
              showValue={true}
              fill="#5a8bdb"
              tabindex="0"
              height="300"
              width="440"
              align="left"
              gap="4"
              valueAppend="xkr"
              grow={true}
            />
          </div>
        {/if}
      </div>
    {/if}
  </div>
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
  .card-wrapper {
    margin: 10px;
  }

  .chart-category:hover {
    cursor: pointer;
    filter: brightness(140%);
  }
</style>
