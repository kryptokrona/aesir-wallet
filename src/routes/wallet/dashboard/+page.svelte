<script>
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import Transaction from '$lib/components/layout/Transaction.svelte';
  import { goto } from '$app/navigation';
  import { createChart } from 'lightweight-charts';
  import { transactions } from '$lib/stores/wallet';

  const MAX_PAGES = 2;
  let transactionsList = [];
  let dates = [];
  let txChart;
  let chart;
  let area;

  onMount(async () => {
    await formatAndRender(false);
  });

  window.api.receive('incoming-tx', async () => {
    await formatAndRender(true);
  });

  async function formatAndRender(update) {
    await formatTransactions();
    await renderchart(update);
  }

  async function renderchart(update) {
    let data = [];
    let runningBalance = 0.0;
    for (const tx in transactionsList) {
      const thisTx = transactionsList[tx];
      runningBalance += thisTx.amount;
      let dateFormatted = new Date(thisTx.time * 1000).toISOString();
      let formattedTx = { time: dateFormatted, value: runningBalance / 100000 };
      data.push(formattedTx);
    }

    const summarizedData = Object.values(
      data.reduce((acc, entry) => {
        const date = entry.time.split('T')[0]; // Extract only the date part
        // If the date is not in acc or the current entry has a later time, update the entry
        if (!acc[date] || entry.time > acc[date].time) {
          acc[date] = entry;
        }

        return acc;
      }, {}),
    );

    //Get colors
    let color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color');
    color = color.trim();
    let text_color = getComputedStyle(document.documentElement).getPropertyValue('--text-color');
    text_color = text_color.trim();
    let border_color = getComputedStyle(document.documentElement).getPropertyValue('--border-color');
    border_color = border_color.trim();

    if (!update) [chart, area] = createNewChart();

    function createNewChart() {
      const newChart = createChart(txChart, {
        layout: {
          background: { color: '#00000000' },
          textColor: text_color,
        },
        grid: {
          vertLines: { color: '#00000000' },
          horzLines: { color: '#00000000' },
        },
        rightPriceScale: {
          scaleMargins: {
            bottom: 0.15,
          },
        },
      });

      const areaSeries = newChart.addAreaSeries({
        topColor: color,
        bottomColor: color + '28',
        lineColor: color,
        lineWidth: 2,
        crossHairMarkerVisible: false,
        lineType: 2,
        priceLineVisible: false,
        lineVisible: false,
      });

      return [newChart, areaSeries];
    }

    area.priceScale().applyOptions({ visible: false });
    chart.timeScale().applyOptions({ borderColor: border_color });

    area.setData(summarizedData);
    chart.timeScale().fitContent();
  }
  async function getTransactions(transactionsList, pageNum) {
    let startIndex = pageNum * 10;
    let txs = await window.api.getTransactions(startIndex, true);
    transactionsList = transactionsList.concat(txs.pageTx);
    if (pageNum < txs.pages && MAX_PAGES > pageNum) {
      return await getTransactions(transactionsList, pageNum + 1);
    }
    $transactions.txs = transactionsList;
    return transactionsList;
  }

  async function formatTransactions() {
    transactionsList = await getTransactions([], 0);
    $transactions.latest = transactionsList.slice(0, Math.min(4, transactionsList.length));
    //Add pending to list
    if ($transactions.pending.length) {
      $transactions.pending.forEach((tx) => {
        $transactions.latest.unshift(tx);
      });
    }
    $transactions = $transactions;
    transactionsList.reverse();
    dates = transactionsList.map((t) => new Date(t.time * 1000).toLocaleString());
    dates = dates;
  }
</script>

<div class="wrapper">
  <div>
    <div class="header">
      <h3 in:fade>Dashboard</h3>
    </div>
    {#if dates.length > 2}
      <div bind:this={txChart} id="transactions-chart" style="width: 100%; height: 300px" />
    {/if}
    {#if dates.length > 0}
      <div class="transactions">
        {#each $transactions.latest as tx}
          <div
            class="row"
            class:unconfirmed={tx?.confirmed === false}
            class:blink_me={tx?.confirmed === false}
            on:click={() => goto(`/wallet/transaction/${tx.hash}`)}
          >
            <p style="opacity: 80%;">
              {tx.hash.substring(0, 8) + '...' + tx.hash.substring(56, tx.hash.length)}
            </p>
            <p class="tx" style="background: none" class:sent={parseFloat(tx.amount) > 0}>
              {parseFloat(tx.amount / 100000).toFixed(5)}
            </p>
          </div>
        {/each}
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

  .transactions {
    height: 100%;
    width: 100%;
    box-sizing: border-box;
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

  .unconfirmed {
    color: var(--alert-color);
  }
</style>
