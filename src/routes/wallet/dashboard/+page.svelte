<script>
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import Transaction from '$lib/components/layout/Transaction.svelte';
  import { goto } from '$app/navigation';
  import { createChart } from 'lightweight-charts';

  const MAX_PAGES = 2;
  let transactions = [];
  let latestFour = [];
  let dates = [];
  let chart;

  onMount(async () => {
    await formatTransactions();
    await renderchart();
  });

  async function renderchart() {
    let data = [];
    let runningBalance = 0.0;
    for (const tx in transactions) {
      const thisTx = transactions[tx];
      runningBalance += thisTx.amount;
      let dateFormatted = new Date(thisTx.time * 1000).toISOString().split('T')[0];
      let formattedTx = { time: dateFormatted, value: runningBalance / 100000 };
      data.push(formattedTx);
    }

    const summarizedData = data.reduce((acc, curr) => {
      const existingItem = acc.find((item) => item.time === curr.time);

      if (existingItem) {
        existingItem.value += curr.value;
      } else {
        acc.push({ time: curr.time, value: curr.value });
      }

      return acc;
    }, []);

    const chart = createChart(document.getElementById('transactions-chart'), {
      layout: {
        background: { color: '#00000000' },
        textColor: '#ffffff55',
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
    console.log(data);
    const areaSeries = chart.addAreaSeries({
      topColor: '#2962FF',
      bottomColor: 'rgba(41, 98, 255, 0.28)',
      lineColor: '#2962FF',
      lineWidth: 2,
      crossHairMarkerVisible: false,
    });

    areaSeries.priceScale().applyOptions({ visible: false });
    // areaSeries.timeScale().applyOptions({ visible: false });

    areaSeries.setData(summarizedData);
    chart.timeScale().fitContent();
  }
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
    transactions = await getTransactions([], 0);
    latestFour = transactions.slice(0, Math.min(4, transactions.length));
    transactions.reverse();
    dates = transactions.map((t) => new Date(t.time * 1000).toLocaleString());
    dates = dates;
    console.log(transactions);
  }
</script>

<div class="wrapper">
  <div>
    <div class="header">
      <h3 in:fade>Dashboard</h3>
    </div>
    {#if dates.length > 0}
      <div id="transactions-chart" style="width: 100%; height: 300px" />
      <div class="transactions">
        {#each latestFour as tx}
          <div class="row" on:click={() => goto(`/wallet/transaction/${tx.hash}`)}>
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
</style>
