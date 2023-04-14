<script>
  import { fade } from 'svelte/transition';
  import { wallet } from '$lib/stores/wallet.js';
  import { fiat } from '$lib/stores/fiat.js';
  import { onMount } from 'svelte';

  const MAX_PAGES = 5;
  var incommingTransactions = [];
  var outgoingTransactions = [];
  var dates = [];
  var chart;

  $: fiatBalance = '$' + (($wallet.balance[0] * $fiat) / 100000).toFixed(5);

  onMount(async () => {
    await formatTransactions();
    await renderchart();
  });

  async function renderchart() {
    var options = {
      series: [
        { data: incommingTransactions, name: 'Incomming' },
        { data: outgoingTransactions, name: 'Outgoing' },
      ],
      labels: dates,
      chart: {
        type: 'bar',
        height: '350',
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
    let transactions = [];
    transactions = await getTransactions(transactions, 0);

    incommingTransactions = [];
    outgoingTransactions = [];

    for (let i = 0; i < transactions.length; i++) {
      let value = transactions[i].amount / 100000;
      let date = new Date(transactions[i].time * 1000).toUTCString();
      dates.push(date);

      if (value >= 0) {
        incommingTransactions.push(value);
        outgoingTransactions.push(0);
      } else {
        outgoingTransactions.push(value * -1);
        incommingTransactions.push(0);
      }
    }

    outgoingTransactions = outgoingTransactions.map((t) => t.toFixed(3));
    incommingTransactions = incommingTransactions.map((t) => t.toFixed(3));
    outgoingTransactions.reverse();
    incommingTransactions.reverse();
    dates.reverse();
  }
</script>

<div class="header">
  <h3 in:fade>Dashboard</h3>
</div>

<div class="wrapper">
  <div style="margin-top: 15px; padding: 0 2rem 0 2rem">
    <h3>Fiat value</h3>
    <p>{fiatBalance}</p>
    <div id="transactions-chart" style="margin-top:80px" />
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
</style>
