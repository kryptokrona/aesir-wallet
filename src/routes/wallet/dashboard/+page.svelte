<script>
  import { fade } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import Transaction from '$lib/components/layout/Transaction.svelte';
  import { goto } from '$app/navigation';
  import { createChart } from 'lightweight-charts';
  import { transactions } from '$lib/stores/wallet';
  import { node } from '$lib/stores/node';
  import { btc, refreshBtc } from '$lib/stores/btc.js';
  import { fiat, getCoinPriceFromAPI } from '$lib/stores/fiat.js';
  import { fiatStr } from '$lib/utils/fiat.js';

  const MAX_PAGES = 2;
  let transactionsList = [];
  let dates = [];

  const shortId = (s) => (s ? s.slice(0, 8) + '…' + s.slice(-8) : '');

  // Unified history feed: always show BOTH XKR and BTC history, merged by time,
  // regardless of which balance (wallet mode) is currently displayed.
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
    // Pending (unconfirmed) txs just happened -- float them to the top even
    // without a timestamp yet, then order newest-first.
    const byRecency = (a, b) =>
      a.confirmed === b.confirmed ? (b.time || 0) - (a.time || 0) : a.confirmed ? 1 : -1;
    return [...xkr, ...bt].sort(byRecency).slice(0, 8);
  })();
  let txChart;
  let chart;
  let area;

  let btcPoll;
  onMount(async () => {
    $node.loading = false;
    await formatAndRender(false);
    refreshBtc();
    getCoinPriceFromAPI();
    // Poll the BTC wallet so incoming/outgoing txs (incl. unconfirmed) appear in
    // the feed live, without needing to navigate away and back.
    btcPoll = setInterval(refreshBtc, 8000);
  });
  onDestroy(() => btcPoll && clearInterval(btcPoll));

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

  // Interpolate a series of {t (unix secs), v} with a monotone cubic (Fritsch–
  // Carlson) spline into many points, so the plotted line is a true smooth curve
  // instead of a few straight segments with visible corners. Monotone => it never
  // overshoots between points (no phantom dips below the balance).
  function densifyMonotone(pts, perGap = 14) {
    const n = pts.length;
    if (n < 3) return pts.map((p) => ({ time: p.t, value: p.v }));
    const xs = pts.map((p) => p.t);
    const ys = pts.map((p) => p.v);
    const m = []; // secant slopes
    for (let i = 0; i < n - 1; i++) m[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    const c = new Array(n); // tangents
    c[0] = m[0];
    c[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) c[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) {
        c[i] = 0;
        c[i + 1] = 0;
        continue;
      }
      const a = c[i] / m[i];
      const b = c[i + 1] / m[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const t = 3 / h;
        c[i] = t * a * m[i];
        c[i + 1] = t * b * m[i];
      }
    }
    const out = [];
    for (let i = 0; i < n - 1; i++) {
      const x0 = xs[i];
      const h = xs[i + 1] - x0;
      for (let k = 0; k < perGap; k++) {
        const t = k / perGap;
        const t2 = t * t;
        const t3 = t2 * t;
        const value =
          (2 * t3 - 3 * t2 + 1) * ys[i] +
          (t3 - 2 * t2 + t) * h * c[i] +
          (-2 * t3 + 3 * t2) * ys[i + 1] +
          (t3 - t2) * h * c[i + 1];
        out.push({ time: Math.round(x0 + t * h), value });
      }
    }
    out.push({ time: xs[n - 1], value: ys[n - 1] });
    return out;
  }

  async function renderchart(update) {
    let data = [];
    let runningBalance = 0.0;
    // Accumulate the running balance in chronological (oldest-first) order --
    // wallet-backend-js returns transactions newest-first, and summing them in
    // that order produces a nonsensical, spiky curve.
    const chronological = [...transactionsList].sort((a, b) => (a.time || 0) - (b.time || 0));
    for (const thisTx of chronological) {
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

    // Smooth the daily balance series with a centered moving average so a single
    // large tx doesn't dominate the whole chart with a spike. The window scales
    // with the amount of data; short series are left as-is.
    const smoothed = (() => {
      const n = summarizedData.length;
      if (n < 5) return summarizedData;
      const window = Math.max(3, Math.min(9, Math.round(n / 8)));
      const half = Math.floor(window / 2);
      return summarizedData.map((pt, i) => {
        const start = Math.max(0, i - half);
        const end = Math.min(n, i + half + 1);
        let sum = 0;
        for (let j = start; j < end; j++) sum += summarizedData[j].value;
        return { time: pt.time, value: sum / (end - start) };
      });
    })();

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
        lineType: 0,
        priceLineVisible: false,
        lineVisible: true,
      });

      return [newChart, areaSeries];
    }

    area.priceScale().applyOptions({ visible: false });
    chart.timeScale().applyOptions({ borderColor: border_color, visible: false });
    // Timestamp the (smoothed) daily points, then interpolate into a dense,
    // genuinely smooth curve.
    const toTs = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / 1000);
    const dense = densifyMonotone(smoothed.map((p) => ({ t: toTs(p.time), v: p.value })));
    area.setData(dense);

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
        // param.time is now a unix timestamp (we interpolate on a seconds axis).
        const dateStr =
          typeof param.time === 'number'
            ? new Date(param.time * 1000).toISOString().split('T')[0]
            : param.time;
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
            {@const fiatAmt = fiatStr(tx.amount, 'xkr', $fiat)}
            <div
              class="row"
              class:unconfirmed={!tx.confirmed}
              class:blink_me={!tx.confirmed}
              on:click={() => goto(`/wallet/transaction/${tx.id}`)}
            >
              <p style="opacity: 80%;">{shortId(tx.id)}</p>
              <div class="amt" class:has-fiat={fiatAmt}>
                <p class="tx amount-crypto" style="background: none" class:sent={tx.amount > 0}>
                  {tx.amount.toFixed(5)} XKR
                </p>
                {#if fiatAmt}<p class="tx amount-fiat" style="background: none" class:sent={tx.amount > 0}>{fiatAmt}</p>{/if}
              </div>
            </div>
          {:else}
            {@const fiatAmt = fiatStr(tx.amount, 'btc', $fiat)}
            <div
              class="row"
              class:unconfirmed={!tx.confirmed}
              class:blink_me={!tx.confirmed}
              on:click={() => goto(`/wallet/transaction/${tx.id}?kind=btc`)}
            >
              <p style="opacity: 80%;">{shortId(tx.id)}</p>
              <div class="amt" class:has-fiat={fiatAmt}>
                <p class="tx amount-crypto" style="background: none" class:sent={tx.amount > 0}>
                  {tx.amount.toFixed(8)} BTC
                </p>
                {#if fiatAmt}<p class="tx amount-fiat" style="background: none" class:sent={tx.amount > 0}>{fiatAmt}</p>{/if}
              </div>
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
    align-items: center;
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

  .row:first-of-type {
    border-top: 1px solid var(--border-color);
  }

  .row:last-of-type {
    border-bottom: none;
  }

  .unconfirmed {
    color: var(--alert-color);
  }
  .amt {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }
  .amt .tx {
    margin: 0;
  }
  // Fiat value is hidden by default and swapped in for the crypto amount only
  // while the row is hovered (and only when a price is available).
  .amount-fiat {
    display: none;
  }
  .row:hover .amt.has-fiat .amount-crypto {
    display: none;
  }
  .row:hover .amt.has-fiat .amount-fiat {
    display: block;
  }
  .notx {
    padding: 30px;
  }
</style>
