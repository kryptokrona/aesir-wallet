<script>
  import { fade } from 'svelte/transition';
  import { wallet } from '$lib/stores/wallet.js';
  import { fiat } from '$lib/stores/fiat.js';
  import { onMount } from 'svelte';
  import { LinkedChart, LinkedLabel } from 'svelte-tiny-linked-charts';

  var incommingTransactions = [];
  var outgoingTransactions = [];
  var outgoingDates = [];
  var incommingDates = [];
  var showIncommingTransactions = true;

  $: fiatBalance = '$' + (($wallet.balance[0] * $fiat) / 100000).toFixed(5);

  onMount(async () => {
    await formatTransactions();
  });

  const formatTransactions = async () => {
    let transactions = await window.api.getTransactions(0, true);

    incommingTransactions = [];
    outgoingTransactions = [];

    for (let i = 0; i < transactions.length; i++) {
      let value = parseFloat(transactions[i].total / 100000).toFixed(3);
      if (value > 0) {
        incommingTransactions.push(value);
        incommingDates.push(new Date(transactions[i].timestamp * 1000).toUTCString());
      } else {
        outgoingTransactions.push((value * -1).toFixed(3));
        outgoingDates.push(new Date(transactions[i].timestamp * 1000).toUTCString());
      }
    }

    outgoingTransactions.reverse();
    incommingTransactions.reverse();
    incommingDates.reverse();
    outgoingDates.reverse();
    incommingDates = incommingDates;
    outgoingDates = outgoingDates;
  };

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
    {#if incommingDates.length > 0 || outgoingDates.length > 0}
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
          <div style="text-align: center; position: absolute; left: 0; right: 0; top: 20px; margin: auto;">
            <LinkedLabel linked="incomming" />
          </div>
          <div>
            <LinkedChart
              values={incommingTransactions}
              labels={incommingDates}
              linked="incomming"
              valuePosition="floating"
              showValue={true}
              grow={true}
              fill="#0eff6b"
              tabindex="0"
              height="300"
              width="450"
              align="left"
              gap="4"
              valuePrepend="xkr"
            />
          </div>
        {:else}
          <div style="text-align: center; position: absolute; left: 0; right: 0; top: 20px; margin: auto;">
            <LinkedLabel linked="outgoing" />
          </div>
          <div>
            <LinkedChart
              values={outgoingTransactions}
              labels={outgoingDates}
              linked="outgoing"
              valuePosition="floating"
              showValue={true}
              grow={true}
              fill="#5a8bdb"
              tabindex="0"
              height="300"
              width="450"
              align="left"
              gap="4"
              valuePrepend="xkr"
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
