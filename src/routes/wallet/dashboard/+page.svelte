<script>
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import Transaction from '$lib/components/layout/Transaction.svelte';
  import { goto } from '$app/navigation';

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
    var options = {
      series: [
        {
          data: transactions.map(function (t) {
            if (t.amount > 0) return (t.amount / 100000).toFixed(3);
            return 0;
          }),
          name: 'Incomming',
        },
        {
          data: transactions.map(function (t) {
            if (t.amount < 0) return ((t.amount / 100000) * -1).toFixed(3);
            return 0;
          }),
          name: 'Outgoing',
        },
      ],
      labels: dates,
      chart: {
        type: 'bar',
        height: '300',
        width: '100%',
        toolbar: {
          show: false,
        },
      },
      colors: ['#0eff6b', '#5a8bdb'],
      plotOptions: {
        bar: {
          horizontal: false,
          borderRadius: 2,
          borderRadiusApplication: 'end',
        },
      },
      fill: {
        type: 'solid',
      },
      tooltip: {
        enabled: true,
      },
      grid: {
        show: false,
      },
      dataLabels: {
        enabled: false,
      },
      legend: {
        show: true,
      },
      xaxis: {
        labels: {
          show: false,
        },
        axisTicks: {
          show: false,
        },
      },
      yaxis: {
        opposite: true,
        labels: {
          formatter: (value) => {
            return value + ' xkr';
          },
        },
      },
    };

    const ApexCharts = (await import('apexcharts')).default;
    chart = new ApexCharts(document.querySelector('#transactions-chart'), options);
    chart.render();
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
  }
</script>

<div class="wrapper">
  <div>
    <div class="header">
      <h3 in:fade>Dashboard</h3>
    </div>
    {#if dates.length > 0}
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
      <div id="transactions-chart" />
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
