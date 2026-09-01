<script>
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import Transaction from '$lib/components/layout/Transaction.svelte';
  import { goto } from '$app/navigation';
  import { createChart } from 'lightweight-charts';
  import { transactions } from '$lib/stores/wallet';
  import { node } from '$lib/stores/node';
  import { walletMode } from '$lib/stores/walletMode.js';
  import { btc, refreshBtc } from '$lib/stores/btc.js';

  const MAX_PAGES = 2;
  let transactionsList = [];
  let dates = [];

  const shortId = (s) => (s ? s.slice(0, 8) + '…' + s.slice(-8) : '');

  // Unified history feed, filtered by the active wallet mode:
  //   xkr  -> XKR txs only, btc -> BTC txs only, fiat -> both (merged by time).
  $: feed = (() => {
    const xkr = ($transactions.latest || []).map((t) => ({
      kind: 'xkr',
      id: t.hash,
      amount: parseFloat(t.amount) / 100000,
      confirmed: t.confirmed !== false,
      time: t.time || 0,
    }));
    const bt = ($btc.txs || []).map((t) => ({
      kind: 'btc',
      id: t.txid,
      amount: (t.amount_sat || 0) / 1e8,
      confirmed: !!t.confirmed,
      time: t.timestamp || 0,
    }));
    let list;
    if ($walletMode === 'btc') list = bt;
    else if ($walletMode === 'fiat') list = [...xkr, ...bt].sort((a, b) => (b.time || 0) - (a.time || 0));
    else list = xkr;
    return list.slice(0, 8);
  })();
  let txChart;
  let chart;
  let area;

  onMount(async () => {
    $node.loading = false;
    await formatAndRender(false);
    refreshBtc();
  });

  window.api.receive('incoming-tx', async () => {
    await formatAndRender(true);
  });

  window.api.receive('outgoing-tx', async () => {
    await formatAndRender(true);
  });

  async function formatAndRender(update) {
    await formatTransactions();
    await renderchart(update);
  }

  async function renderchart(update) {
    let data = [];
    let runningBalance = 0.0;
    console.log(transactionsList);
    for (const tx in transactionsList) {
      const thisTx = transactionsList[tx];
      runningBalance += thisTx.amount;
      let dateFormatted = new Date(thisTx.time * 1000).toISOString().split('T')[0];
      let formattedTx = { time: dateFormatted, value: runningBalance / 100000 };
      data.push(formattedTx);
    }

    const summarizedData = Object.values(
      data.reduce((acc, entry) => {
        const date = entry.time;
        acc[date] = entry;
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

    if (transactionsList.length < 3) return;

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
        lineVisible: true,
      });

      return [newChart, areaSeries];
    }

    area.priceScale().applyOptions({ visible: false });
    chart.timeScale().applyOptions({ borderColor: border_color, visible: false });
    area.setData(summarizedData);

    chart.timeScale().fitContent();

    const container = document.getElementById('transactions-chart');

    const toolTipWidth = 80;
    const toolTipHeight = 0;
    const toolTipMargin = 15;

    // Create and style the tooltip html element
    const toolTip = document.createElement('div');

    toolTip.style = `width: fit-content; height: 75px; position: absolute; display: none; padding: 8px; box-sizing: border-box; font-size: 12px; text-align: left; z-index: 1000; top: 12px; left: 12px; pointer-events: none; border: 1px solid; border-radius: 2px;font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;`;
    toolTip.style.background = getComputedStyle(document.documentElement).getPropertyValue('--backgound-color');
    toolTip.style.color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color');
    toolTip.style.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color');
    container.appendChild(toolTip);

    // update tooltip
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        toolTip.style.display = 'none';
      } else {
        // time will be in the same format that we supplied to setData.
        // thus it will be YYYY-MM-DD
        const dateStr = param.time;
        toolTip.style.display = 'block';
        const data = param.seriesData.get(area);
        const price = data.value !== undefined ? data.value : data.close;
        toolTip.innerHTML = `<div style='font-family: "Roboto Mono", monospace; font-size: 24px; margin: 4px 0px;'>
          ${Math.round(100 * price) / 100}
          </div><div style="color: ${getComputedStyle(document.documentElement).getPropertyValue('--text-color')}">
          ${dateStr}
          </div>`;

        const coordinate = area.priceToCoordinate(price);
        let shiftedCoordinate = param.point.x - 50;
        if (coordinate === null) {
          return;
        }
        shiftedCoordinate = Math.max(0, Math.min(container.clientWidth - toolTipWidth, shiftedCoordinate));
        const coordinateY =
          coordinate - toolTipHeight - toolTipMargin > 0
            ? coordinate - toolTipHeight - toolTipMargin
            : Math.max(0, Math.min(container.clientHeight - toolTipHeight - toolTipMargin, coordinate + toolTipMargin));
        toolTip.style.left = shiftedCoordinate + 'px';
        toolTip.style.top = coordinateY + 'px';
      }
    });
  }

  async function getTransactions(transactionsList, pageNum) {
    let startIndex = pageNum * 10;
    let txs = await window.api.getTransactions(startIndex, true);
    transactionsList = transactionsList.concat(txs.pageTx);
    $transactions.txs = transactionsList;
    console.log(transactionsList.latest);
    return transactionsList;
  }

  async function formatTransactions() {
    transactionsList = await getTransactions([], 0);
    $transactions.latest = transactionsList.slice(0, Math.min(6, transactionsList.length));
    //Add pending to list
    if ($transactions.pending.length) {
      $transactions.pending.forEach((tx) => {
        $transactions.latest.unshift(tx);
      });
    }
    $transactions = $transactions;
    transactionsList.reverse();
    dates = transactionsList.map((t) => new Date(t.time * 1000).toLocaleString());
    dates = [...new Set(dates.map((dateTime) => dateTime.split(' ')[0]))];
  }
</script>

<div class="wrapper">
  <div>
    <div class="header">
      <h3 in:fade>Dashboard</h3>
    </div>
    {#if dates.length > 2}
      <div bind:this={txChart} id="transactions-chart" style="width: 100%; height: 220px" />
    {/if}
    {#if feed.length > 0}
      <div class="transactions">
        {#each feed as tx (tx.kind + tx.id)}
          {#if tx.kind === 'xkr'}
            <div
              class="row"
              class:unconfirmed={!tx.confirmed}
              class:blink_me={!tx.confirmed}
              on:click={() => goto(`/wallet/transaction/${tx.id}`)}
            >
              <p style="opacity: 80%;">{shortId(tx.id)}</p>
              <p class="tx" style="background: none" class:sent={tx.amount > 0}>
                {tx.amount.toFixed(5)} XKR
              </p>
            </div>
          {:else}
            <div class="row" class:unconfirmed={!tx.confirmed} class:blink_me={!tx.confirmed}>
              <p style="opacity: 80%;">₿ {shortId(tx.id)}</p>
              <p class="tx" style="background: none" class:sent={tx.amount > 0}>
                {tx.amount.toFixed(8)} BTC
              </p>
            </div>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="notx">
        <h3>No transactions</h3>
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
    vertical-align: middle;
    line-height: 1em;
    &:hover {
      background-color: var(--border-color);
      cursor: pointer;
    }
    &:active {
      color: #121212;
    }
  }

  .row:last-of-type {
    border-bottom: none;
  }

  .unconfirmed {
    color: var(--alert-color);
  }
  .notx {
    padding: 30px;
  }
</style>
