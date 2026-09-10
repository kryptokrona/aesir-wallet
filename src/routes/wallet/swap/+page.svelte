<script>
  // BTC -> XKR atomic swap screen.
  //
  // The received XKR always lands on the wallet's own primary address (no address
  // field). Makers are auto-discovered via rendezvous and the best price is picked
  // automatically (no maker picker). The user sees a live fiat preview of what they
  // send and receive, confirms in a prepared-swap popup, then watches a live
  // progress timeline. Talks to the Rust taker daemon via the electron.cjs swap-* IPC.
  import { onMount, onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import toast from 'svelte-french-toast';
  import { fiat } from '$lib/stores/fiat.js';
  import { fiatStr } from '$lib/utils/fiat.js';
  import { btc, refreshBtc } from '$lib/stores/btc.js';
  import { wallet } from '$lib/stores/wallet.js';
  import SwapTimeline from '$lib/components/SwapTimeline.svelte';
  import Button from '$lib/components/buttons/Button.svelte';
  import { isTerminal, swapStatusLabel } from '$lib/utils/swapProgress.js';
  import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
  import { createChart } from 'lightweight-charts';
  import { dev } from '$app/environment';

  let engineUp = false;
  let sellers = [];
  let infos = []; // live taker swaps (drives the in-progress monitor)
  let historyList = []; // merged, persistent swap history (taker + maker) from the local cache
  let primaryAddress = ''; // our own XKR receive address (never shown as a field)
  let poll;

  let view = 'form'; // "form" | "monitor"
  let showPrepare = false;
  let starting = false;
  let activeSwapId = null;
  let snapshot = null; // { btc, xkr, rate, maker } captured at start for the monitor

  let amountBtc = '';
  let amountXkr = '';
  let lastEdited = 'btc'; // which field the user typed in, so we know which to derive

  // Headroom reserved for the taker's on-chain Bitcoin lock-tx fee, which is
  // charged on top of the swap amount. The engine floors it to the 1000-sat
  // min-relay fee on testnet; reserve extra so fee-rate variation never tips a
  // near-max swap into "Insufficient funds" during setup.
  const BTC_LOCK_FEE_BUFFER_SAT = 2000;

  const short = (s) => (s ? s.slice(0, 8) + '…' + s.slice(-6) : '');
  const err = (m) =>
    toast.error(m, {
      position: 'top-right',
      style:
        'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
    });

  // ---- pricing / preview (all reactive) ------------------------------------
  $: amountNum = parseFloat(amountBtc) || 0;
  $: amountSat = Math.round(amountNum * 1e8);
  // Best price for a buyer = the lowest sat-per-XKR quote on offer.
  $: quotedSellers = sellers.filter((s) => s.quote && s.quote.price > 0);
  $: bestSeller = quotedSellers.length ? quotedSellers.reduce((a, b) => (b.quote.price < a.quote.price ? b : a)) : null;
  // A specific maker the user picked from the sell book (a cheap maker can offer a
  // tiny amount, blocking bigger trades -- so you can pick a pricier maker with the
  // size you want). Tracked by XKR address and re-resolved each poll so it survives
  // quote refreshes; if that maker disappears, we fall back to the best price.
  let selectedAddr = null;
  $: selectedSeller = selectedAddr ? quotedSellers.find((s) => s.xkrAddress === selectedAddr) : null;
  $: activeSeller = selectedSeller || bestSeller;
  $: rate = activeSeller?.quote.price ?? null; // sats per XKR (of the active maker)
  $: minBtc = activeSeller ? activeSeller.quote.min_quantity / 1e8 : null;
  $: maxBtc = activeSeller ? activeSeller.quote.max_quantity / 1e8 : null;

  // Sell book (asks): each maker's advertised offer, cheapest first. `xkr` is how
  // much XKR they'll sell (max BTC sats / price), `cum` the running total.
  $: asks = quotedSellers
    .map((s) => ({
      price: s.quote.price,
      xkr: s.quote.price > 0 ? s.quote.max_quantity / s.quote.price : 0,
      btcSat: s.quote.max_quantity,
      peer: s.peer_id,
      address: s.xkrAddress, // used to pick this maker for a swap
    }))
    .sort((a, b) => a.price - b.price);
  $: cumAsks = (() => {
    let c = 0;
    return asks.map((a, i) => ({ ...a, cum: (c += a.xkr), i }));
  })();
  $: bookTotalXkr = cumAsks.length ? cumAsks[cumAsks.length - 1].cum : 0;

  // Sell-book pagination (5 offers per page). The chart still shows the full depth.
  const BOOK_PER_PAGE = 5;
  let bookPageNum = 0;
  $: bookPages = Math.max(1, Math.ceil(cumAsks.length / BOOK_PER_PAGE));
  $: if (bookPageNum > bookPages - 1) bookPageNum = bookPages - 1;
  $: bookPage = bookPageNum + 1;
  $: pagedAsks = cumAsks.slice(bookPageNum * BOOK_PER_PAGE, bookPageNum * BOOK_PER_PAGE + BOOK_PER_PAGE);
  $: xkrReceive = parseFloat(amountXkr) || 0;
  $: withinRange =
    activeSeller && amountSat >= activeSeller.quote.min_quantity && amountSat <= activeSeller.quote.max_quantity;
  // The taker must also pay the on-chain Bitcoin lock-tx fee on top of the swap
  // amount. On testnet this floors to the 1000-sat min-relay fee; reserve a
  // safe headroom so "swap almost my whole balance" can't fail mid-setup with
  // "Insufficient funds" (which shows up as a stuck/never-started swap).
  $: maxSpendableSat =
    $btc.balanceSat != null ? Math.max(0, $btc.balanceSat - BTC_LOCK_FEE_BUFFER_SAT) : null;
  $: overBalance = maxSpendableSat != null && amountSat > maxSpendableSat;

  function fmtFiat(v) {
    const c = ($fiat.currencies || []).find((x) => x.ticker === $fiat.ticker) || {
      symbol: '$',
      symbolLocation: 'prefix',
    };
    const n = (v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return c.symbolLocation === 'prefix' ? `${c.symbol}${n}` : `${n} ${c.symbol}`;
  }
  const fmtXkr = (v) => (v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  // Fiat with more precision, for the tiny per-XKR fiat price.
  const fmtFiatSmall = (v) => {
    const c = ($fiat.currencies || []).find((x) => x.ticker === $fiat.ticker) || {
      symbol: '$',
      symbolLocation: 'prefix',
    };
    const n = (v || 0).toLocaleString(undefined, { maximumSignificantDigits: 3 });
    return c.symbolLocation === 'prefix' ? `${c.symbol}${n}` : `${n} ${c.symbol}`;
  };
  // XKR amount a swap will/did receive, from swap_infos (xmr_amount is piconero;
  // 1 XKR = 1e12 piconero in the engine's units). Used when we have no local snapshot.
  const xkrFromInfo = (info) => (info?.xmr_amount || 0) / 1e12;
  // Fiat value of a swap, for the history rows/details. Prefer pricing the XKR
  // leg (what the user cares about); fall back to the BTC leg if we have no XKR
  // price. `f` is passed in so the template re-renders when prices arrive.
  const swapFiatStr = (info, f) =>
    fiatStr(xkrFromInfo(info), 'xkr', f) || fiatStr((info?.btc_amount || 0) / 1e8, 'btc', f);

  $: btcFiatStr = fmtFiat($fiat.btcPrice * amountNum);
  $: xkrFiatStr = fmtFiat($fiat.balance * xkrReceive);

  // ---- two-way BTC <-> XKR amount conversion (rate = sats per XKR) ----------
  function computeXkr(btcStr) {
    const sat = Math.round((parseFloat(btcStr) || 0) * 1e8);
    return rate && sat ? String(+(sat / rate).toFixed(5)) : '';
  }
  function computeBtc(xkrStr) {
    const xkrAmt = parseFloat(xkrStr) || 0;
    const sat = rate ? Math.round(xkrAmt * rate) : 0;
    return sat ? String(+(sat / 1e8).toFixed(8)) : '';
  }
  function onBtcInput(e) {
    amountBtc = e.currentTarget.value;
    lastEdited = 'btc';
    amountXkr = computeXkr(amountBtc);
  }
  function onXkrInput(e) {
    amountXkr = e.currentTarget.value;
    lastEdited = 'xkr';
    amountBtc = computeBtc(amountXkr);
  }
  // When the live rate changes under us, refresh whichever field is derived.
  function reconcileFromSource() {
    if (!rate) return;
    if (lastEdited === 'xkr') amountBtc = computeBtc(amountXkr);
    else amountXkr = computeXkr(amountBtc);
  }
  $: rate, reconcileFromSource();

  // ---- data ----------------------------------------------------------------
  async function refreshStatus() {
    try {
      const s = await window.api.invoke('swap-rpc-status');
      engineUp = !!(s && s.engineRunning);
    } catch (_) {
      engineUp = false;
    }
  }
  // TEMP (dev only): preview the sell book with ~50 fake makers. Never runs in a
  // production build (gated on `dev`). Flip to true to re-enable; delete MOCK_BOOK +
  // generateMockSellers to remove entirely.
  const MOCK_BOOK = false;
  function generateMockSellers() {
    const base = marketSats > 0 ? marketSats * 1.01 : 4.8; // best ask ~1% above market
    const out = [];
    for (let i = 0; i < 50; i++) {
      const t = i / 49;
      // Price rises from the best ask up to ~2.4x, denser near the best.
      const price = +(base * (1 + Math.pow(t, 1.6) * 1.4)).toPrecision(4);
      // Deterministic pseudo-random size, in BTC sats (~0.001 .. 0.15 BTC).
      const r = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
      const btcSat = Math.round((0.001 + r * 0.14) * 1e8);
      out.push({
        peer_id: '12D3KooMockMaker' + String(i).padStart(2, '0'),
        xkrAddress: 'SEKReXAMPLEmock' + i,
        multiaddr: null,
        quote: { price, min_quantity: 10000, max_quantity: btcSat },
      });
    }
    return out;
  }

  async function refreshSellers() {
    if (dev && MOCK_BOOK) {
      sellers = generateMockSellers();
      return;
    }
    const res = await window.api.invoke('swap-list-sellers');
    if (res && res.ok && Array.isArray(res.result)) sellers = res.result;
  }
  async function refreshInfos() {
    // Live taker swaps drive the in-progress monitor and refresh the taker cache.
    const res = await window.api.invoke('swap-infos');
    if (res && res.ok && Array.isArray(res.result)) infos = res.result;
    // Refresh the maker cache too (no-op result unless market-making is running).
    await window.api.invoke('swap-maker-swaps');
    // Read the merged, persistent history (survives engine/ASB being down).
    const hist = await window.api.invoke('swap-history-cache');
    if (hist && hist.ok && Array.isArray(hist.result)) historyList = hist.result;
  }
  async function loadAddress() {
    try {
      const forms = (await window.api.getAddressForms()) ?? [];
      const primary = forms.find((f) => f.primary) ?? forms[0];
      if (primary) primaryAddress = primary.standard;
    } catch (_) {}
  }

  // Prefer the LIVE taker swap (freshest state); fall back to the persistent cache
  // so maker swaps (and older taker swaps) can still open the progress page.
  $: activeInfo =
    (() => {
      const live = infos.find((i) => i.swap_id === activeSwapId);
      if (live) return { ...live, role: 'taker' };
      return sortedInfos.find((i) => i.swap_id === activeSwapId) || null;
    })();
  $: activeTerminal = activeInfo ? isTerminal(activeInfo.state_name, activeInfo.role) : false;
  // The engine stamps start_date via the Rust `time` crate's OffsetDateTime
  // Display, e.g. "2026-09-07 21:19:26.642276 +00:00:00" -- space-separated, with
  // microseconds and a seconds-bearing offset, which JS `Date` can't parse.
  // Normalize it to ISO-8601 before parsing so the sort actually orders by time.
  function parseSwapDate(str) {
    if (!str) return NaN;
    let t = Date.parse(str);
    if (Number.isFinite(t)) return t;
    const iso = String(str)
      .replace(' ', 'T') // date/time separator
      .replace(/\s*([+-]\d{2}):?(\d{2})(?::\d{2})?$/, '$1:$2'); // "+00:00:00" -> "+00:00"
    return Date.parse(iso);
  }

  // Sort key: prefer the locally-recorded `firstSeen` (stable, monotonic -- set when
  // we first cached the swap), since the engine's start_date can be unparseable or
  // inconsistent. Fall back to start_date, then to "now" (a brand-new swap pins top).
  const swapTime = (s) => {
    if (s && Number.isFinite(s.firstSeen)) return s.firstSeen;
    const t = parseSwapDate(s?.start_date);
    return Number.isFinite(t) ? t : Date.now();
  };
  // Active (in-flight) swaps rank above finished ones so they always show first.
  const swapRank = (s) => (isTerminal(s?.state_name, s?.role) ? 0 : 1);

  // The cached history is already merged (taker + maker) and normalized; sort it
  // active-first, then newest-first, for both the recent list (top 3) and the
  // full history view.
  $: sortedInfos = [...historyList].sort(
    (a, b) => swapRank(b) - swapRank(a) || swapTime(b) - swapTime(a),
  );

  // Full swap-history pagination, mirroring /history (10 per page).
  const HISTORY_PER_PAGE = 10;
  let historyPageNum = 0;
  $: historyPages = Math.max(1, Math.ceil(sortedInfos.length / HISTORY_PER_PAGE));
  $: if (historyPageNum > historyPages - 1) historyPageNum = historyPages - 1;
  $: historyPage = historyPageNum + 1;
  $: pagedHistory = sortedInfos.slice(
    historyPageNum * HISTORY_PER_PAGE,
    historyPageNum * HISTORY_PER_PAGE + HISTORY_PER_PAGE,
  );

  function setMax() {
    if ($btc.balanceSat == null) return;
    // Reserve headroom for the on-chain lock fee so the swap can actually afford
    // amount + fee (see BTC_LOCK_FEE_BUFFER_SAT).
    let sat = $btc.balanceSat - BTC_LOCK_FEE_BUFFER_SAT;
    if (maxBtc != null) sat = Math.min(sat, activeSeller.quote.max_quantity);
    amountBtc = sat > 0 ? String(+(sat / 1e8).toFixed(8)) : '0';
    lastEdited = 'btc';
    amountXkr = computeXkr(amountBtc);
  }

  function openPrepare() {
    if (!engineUp) return err("Swap engine isn't running yet");
    if (!activeSeller) return err('No makers available yet');
    if (!primaryAddress) return err('No XKR receive address');
    if (!amountNum || amountNum <= 0) return err('Enter a BTC amount');
    if (!withinRange) return err(`Amount must be between ${minBtc} and ${maxBtc} BTC`);
    if (overBalance)
      return err('Amount too high — leave room for the Bitcoin network fee (try Max)');
    showPrepare = true;
  }

  // A started swap can fail during setup (e.g. the maker is out of XKR) before it
  // ever shows up in swap-infos, which would otherwise leave the monitor spinning
  // on "Loading swap…" forever. If nothing loads within the window, surface it.
  let monitorLoadFailed = false;
  let monitorErrorMsg = ''; // terminal failure reason from the engine, when we have one
  let monitorStatusMsg = ''; // transient "still trying" reason (e.g. reaching the maker)
  let monitorTimer = null;
  function watchMonitorLoad() {
    monitorLoadFailed = false;
    monitorErrorMsg = '';
    monitorStatusMsg = '';
    if (monitorTimer) clearTimeout(monitorTimer);
    monitorTimer = setTimeout(() => {
      if (view === 'monitor' && !activeInfo) monitorLoadFailed = true;
    }, 25000);
  }

  // Ask the engine for the active swap's real failure reason. A swap that fails
  // during setup never appears in swap-infos (no SwapSetupCompleted state), so we
  // poll this by swap_id while watching a freshly-started swap. When a reason
  // lands, show it instead of the generic timeout and stop the spinner.
  async function checkSwapError() {
    if (view !== 'monitor' || !activeSwapId || activeTerminal) return;
    try {
      const res = await window.api.invoke('swap-error', activeSwapId);
      const r = res && res.ok && res.result;
      const msg = r && r.error;
      if (msg && r.terminal) {
        // The swap gave up — show it as a failure and stop the spinner/timeout.
        if (monitorTimer) clearTimeout(monitorTimer);
        monitorStatusMsg = '';
        monitorErrorMsg = msg;
        monitorLoadFailed = true;
      } else if (msg) {
        // Transient: still trying (e.g. reaching the maker). Show the reason but
        // keep waiting -- cancel the generic timeout so it doesn't flip to failed.
        if (monitorTimer) clearTimeout(monitorTimer);
        monitorStatusMsg = msg;
        monitorErrorMsg = '';
        monitorLoadFailed = false;
      } else {
        monitorStatusMsg = '';
      }
    } catch (_) {
      // engine not reachable right now; the poll will retry
    }
  }

  async function confirmSwap() {
    if (starting) return;
    if (!activeSeller) {
      showPrepare = false;
      return err('Maker is no longer available — try again');
    }
    starting = true;
    const snap = { btc: amountNum, xkr: xkrReceive, rate, maker: short(activeSeller.peer_id) };
    try {
      const res = await window.api.invoke('swap-start', {
        xkrAddress: activeSeller.xkrAddress,
        amountSat,
        xkrReceiveAddress: primaryAddress,
      });
      if (res && res.ok && res.result?.swap_id) {
        activeSwapId = res.result.swap_id;
        snapshot = snap;
        amountBtc = '';
        amountXkr = '';
        showPrepare = false;
        view = 'monitor';
        watchMonitorLoad();
        await refreshInfos();
      } else {
        err(res?.error || 'Failed to start swap');
      }
    } finally {
      starting = false;
    }
  }

  function openMonitor(id) {
    activeSwapId = id;
    snapshot = null;
    view = 'monitor';
    watchMonitorLoad();
  }
  function newSwap() {
    view = 'form';
    activeSwapId = null;
    snapshot = null;
  }

  // ---- market maker (sell XKR for BTC) -------------------------------------
  let makerStatus = { advertising: false, asbRunning: false, peerId: null, error: null, advertised: null, btcBalanceSat: null };
  // Per-swap bounds are background defaults now — the UI is two sliders (price +
  // amount), not free-text fields.
  const makerMinBtc = 0.0001;
  const makerMaxBtc = 0.05;
  // Two-slider controls: ask price (sats/XKR) centered on the live market price,
  // and the total XKR to sell (0..inventory). Captured once when the form opens so
  // live price ticks don't shift the sliders under the user.
  let priceCenterSats = 5; // market price captured at open (for the "% vs market" readout)
  let priceSatsValue = 5; // the chosen ask (sats/XKR) -- typed, or nudged with +/-
  const PRICE_NUDGE = 0.05; // +/- buttons move the ask 5% per click (scale-invariant)
  let maxSellXkr = 0; // total XKR to sell (the limit-order size)
  let makerCtrlInit = false;
  let makerBusy = false;
  let makerStarting = false; // clicked start, engine booting

  $: inventoryXkr = ($wallet?.balance?.[0] ?? 0) / 100000; // atomic -> XKR (5 dp)
  $: makerState = makerStatus.error
    ? 'error'
    : makerStatus.advertising
      ? 'live'
      : makerStatus.orderFilled
        ? 'filled'
        : // Booted resume-only to finish an in-flight swap -- it never advertises, so
          // don't show it as an endless "starting…".
          makerStatus.resumeOnly && makerStatus.asbRunning && !makerStarting
          ? 'recovering'
          : makerStarting || makerStatus.asbRunning
            ? 'starting'
            : 'off';
  // Live market price in sats/XKR = XKR fiat price / BTC fiat price, expressed in sats.
  $: marketSats = $fiat.balance > 0 && $fiat.btcPrice > 0 ? ($fiat.balance / $fiat.btcPrice) * 1e8 : 0;
  // Initialize the sliders once the form is open AND the balance has loaded (so the
  // sell slider isn't locked at 0). Price centers on the live market, or 5 sat/XKR
  // if prices aren't in yet.
  $: if (!makerCtrlInit && view === 'maker' && makerState === 'off' && inventoryXkr > 0) {
    priceCenterSats = marketSats > 0 ? marketSats : 5;
    priceSatsValue = +priceCenterSats.toPrecision(4); // start at market
    maxSellXkr = inventoryXkr;
    makerCtrlInit = true;
  }
  $: priceFiatPerXkr = ((parseFloat(priceSatsValue) || 0) * ($fiat.btcPrice || 0)) / 1e8;
  $: pricePct = ((parseFloat(priceSatsValue) || 0) / (priceCenterSats || 1) - 1) * 100;
  $: sellPct = inventoryXkr > 0 ? (maxSellXkr / inventoryXkr) * 100 : 0;
  // Fiat proceeds at YOUR chosen ask price (not the current market price).
  $: sellFiat = maxSellXkr * priceFiatPerXkr;

  // Limit-sell progress (atomic XKR -> XKR), when an order is active.
  $: makerOrder = makerStatus.order || null;
  $: orderSoldXkr = makerOrder ? makerOrder.committedAtomic / 100000 : 0;
  $: orderTargetXkr = makerOrder ? makerOrder.targetAtomic / 100000 : 0;
  $: orderPct = makerOrder && orderTargetXkr > 0 ? Math.min(100, (orderSoldXkr / orderTargetXkr) * 100) : 0;

  async function refreshMakerStatus() {
    try {
      const res = await window.api.invoke('swap-maker-status');
      if (res && res.ok) {
        makerStatus = res.result;
        if (makerStatus.advertising || makerStatus.error) makerStarting = false;
      }
    } catch (_) {}
  }
  function openMaker() {
    view = 'maker';
    makerCtrlInit = false; // recapture the market-centered controls from fresh data
    refreshMakerStatus();
  }
  // Pick a specific maker from the sell book as the swap counterparty (or clear
  // back to auto/best). Selection is by XKR address (see selectedAddr above).
  function selectSeller(a) {
    selectedAddr = a.address;
    view = 'form';
  }
  function clearSeller() {
    selectedAddr = null;
  }
  // +/- step the ask multiplicatively so it works at any price scale (incl. sub-sat).
  function nudgePrice(dir) {
    const base = parseFloat(priceSatsValue) || priceCenterSats || 1;
    const next = dir > 0 ? base * (1 + PRICE_NUDGE) : base / (1 + PRICE_NUDGE);
    priceSatsValue = +next.toPrecision(4);
  }
  async function startMaker() {
    if (makerBusy || makerStarting) return;
    makerBusy = true;
    makerStarting = true;
    try {
      const res = await window.api.invoke('swap-maker-start', {
        priceSats: String(priceSatsValue),
        minSat: Math.round(makerMinBtc * 1e8), // per-swap bounds: background defaults
        maxSat: Math.round(makerMaxBtc * 1e8),
        targetXkr: maxSellXkr || 0, // total to sell (0 = sell freely)
      });
      if (!(res && res.ok)) {
        makerStarting = false;
        err(res?.error || 'Failed to start market making');
      }
      // poll through the boot -> live transition (engine takes a few seconds)
      for (const d of [1500, 3500, 6000, 10000, 16000, 24000, 32000]) setTimeout(refreshMakerStatus, d);
    } finally {
      makerBusy = false;
    }
  }
  async function stopMaker() {
    if (makerBusy) return;
    makerBusy = true;
    makerStarting = false;
    makerCtrlInit = false; // re-center the sliders next time the form opens
    try {
      await window.api.invoke('swap-maker-stop');
      await refreshMakerStatus();
    } finally {
      makerBusy = false;
    }
  }
  function retryMaker() {
    makerStatus = { ...makerStatus, error: null };
    makerStarting = false;
  }

  // If a swap is in flight, jump to watching it. This must survive the engine
  // being briefly down (e.g. right after the wallet auto-locks and you log back
  // in, which restarts the engine): the in-flight swap won't appear in swap-infos
  // until the engine is back up, so we keep trying on every poll and restore the
  // first time it surfaces -- once per page mount, so it won't fight navigation.
  let didRestore = false;
  function maybeRestoreLiveSwap() {
    if (didRestore || view !== 'form') return;
    const live = infos.filter((i) => !isTerminal(i.state_name));
    if (!live.length) return;
    live.sort((a, b) => swapTime(b) - swapTime(a));
    didRestore = true;
    openMonitor(live[0].swap_id);
  }

  onMount(async () => {
    await Promise.all([refreshStatus(), refreshSellers(), refreshInfos(), loadAddress(), refreshBtc()]);
    maybeRestoreLiveSwap();
    poll = setInterval(async () => {
      await Promise.all([refreshStatus(), refreshSellers(), refreshInfos(), refreshBtc()]);
      maybeRestoreLiveSwap();
      await checkSwapError();
      if (view === 'maker') await refreshMakerStatus();
    }, 4000);
  });
  // ---- sell-book depth chart (reuses lightweight-charts, like the dashboard) -----
  let bookChartEl;
  let bookChart = null;
  let bookSeries = null;
  let bookTooltip = null;
  const BOOK_PRICE_SCALE = 1e6; // map the sats/XKR price onto lightweight-charts "time"

  function renderBook() {
    if (!bookChartEl || !cumAsks.length) return;
    const cs = getComputedStyle(document.documentElement);
    const primary = cs.getPropertyValue('--primary-color').trim();
    const textColor = cs.getPropertyValue('--text-color').trim();
    if (!bookChart) {
      bookChart = createChart(bookChartEl, {
        autoSize: true,
        layout: { background: { color: '#00000000' }, textColor },
        grid: { vertLines: { color: '#00000000' }, horzLines: { color: '#00000000' } },
        // Hide the y-axis (it ate horizontal space) -- the value shows in the tooltip.
        rightPriceScale: { visible: false, scaleMargins: { top: 0.15, bottom: 0.1 } },
        // The x-axis is PRICE, not time: format the synthetic timestamp back to the
        // fiat price per XKR (sats -> BTC fiat price).
        timeScale: {
          borderVisible: false,
          tickMarkFormatter: (t) => fmtFiatSmall(((t / BOOK_PRICE_SCALE) * ($fiat.btcPrice || 0)) / 1e8),
        },
        localization: {
          timeFormatter: (t) => fmtFiatSmall(((t / BOOK_PRICE_SCALE) * ($fiat.btcPrice || 0)) / 1e8) + '/XKR',
        },
        handleScroll: false,
        handleScale: false,
      });
      bookSeries = bookChart.addAreaSeries({
        topColor: primary,
        bottomColor: primary + '28',
        lineColor: primary,
        lineWidth: 2,
        lineType: 1, // steps -> reads like an order-book depth
        priceLineVisible: false,
      });

      // Floating tooltip (same pattern as the dashboard): show the cumulative XKR
      // available at the hovered price, since the y-axis is hidden.
      bookTooltip = document.createElement('div');
      bookTooltip.style = `position: absolute; display: none; padding: 6px 8px; box-sizing: border-box; font-size: 12px; z-index: 1000; top: 12px; left: 12px; pointer-events: none; border: 1px solid; border-radius: 6px; white-space: nowrap;`;
      bookTooltip.style.background = cs.getPropertyValue('--backgound-color');
      bookTooltip.style.borderColor = cs.getPropertyValue('--border-color');
      bookTooltip.style.color = primary;
      bookChartEl.appendChild(bookTooltip);

      bookChart.subscribeCrosshairMove((param) => {
        const el = bookChartEl;
        if (
          !param.point ||
          !param.time ||
          param.point.x < 0 ||
          param.point.x > el.clientWidth ||
          param.point.y < 0 ||
          param.point.y > el.clientHeight
        ) {
          bookTooltip.style.display = 'none';
          return;
        }
        const d = param.seriesData.get(bookSeries);
        if (!d) {
          bookTooltip.style.display = 'none';
          return;
        }
        const priceFiat = ((param.time / BOOK_PRICE_SCALE) * ($fiat.btcPrice || 0)) / 1e8;
        bookTooltip.style.display = 'block';
        bookTooltip.innerHTML =
          `<div style="font-family: 'Roboto Mono', monospace; font-size: 17px;">${fmtXkr(d.value)} XKR</div>` +
          `<div style="font-size: 11px; opacity: 0.7; color: ${textColor}">up to ${fmtFiatSmall(priceFiat)}/XKR</div>`;
        let x = param.point.x + 14;
        if (x > el.clientWidth - 130) x = param.point.x - 130;
        bookTooltip.style.left = Math.max(0, x) + 'px';
        bookTooltip.style.top = Math.max(0, param.point.y - 10) + 'px';
      });
    }
    // Unique, ascending "time" per price level (dedupe equal prices, keep max cum).
    const byTime = new Map();
    for (const a of cumAsks) byTime.set(Math.round(a.price * BOOK_PRICE_SCALE), a.cum);
    const data = [...byTime.entries()].sort((x, y) => x[0] - y[0]).map(([time, value]) => ({ time, value }));
    bookSeries.setData(data);
    bookChart.timeScale().fitContent();
  }
  function destroyBook() {
    if (bookChart) {
      try {
        bookChart.remove();
      } catch (_) {}
      bookChart = null;
      bookSeries = null;
    }
    if (bookTooltip) {
      try {
        bookTooltip.remove();
      } catch (_) {}
      bookTooltip = null;
    }
  }
  // Render when the book view is open and the container is mounted; refresh on new
  // quotes; tear the chart down when we leave the view.
  $: if (view === 'book' && bookChartEl && cumAsks) renderBook();
  $: if (view !== 'book' && bookChart) destroyBook();

  onDestroy(() => {
    if (poll) clearInterval(poll);
    destroyBook();
  });
</script>

<div class="header" in:fade>
  <h3>
    {view === 'maker'
      ? 'Market Maker'
      : view === 'history'
        ? 'Swap history'
        : view === 'book'
          ? 'Sell book'
          : 'Swap BTC → XKR'}
  </h3>
  {#if view === 'form'}
    <div class="head-actions">
      <Button text="Market Maker" on:click={openMaker} />
      <Button
        text="Swap"
        highlight
        disabled={!engineUp || !activeSeller || !amountNum || !withinRange || overBalance}
        on:click={openPrepare}
      />
    </div>
  {:else if view === 'history'}
    <div class="pager">
      <p>{historyPage}/{historyPages}</p>
      {#if historyPageNum > 0}<Button text="-" on:click={() => historyPageNum--} />{/if}
      {#if historyPage < historyPages}<Button text="+" on:click={() => historyPageNum++} />{/if}
      <button class="backbutton" on:click={() => (view = 'form')}>
        <ArrowLeft />
      </button>
    </div>
  {:else if view === 'book'}
    <div class="pager">
      <p>{bookPage}/{bookPages}</p>
      {#if bookPageNum > 0}<Button text="-" on:click={() => bookPageNum--} />{/if}
      {#if bookPage < bookPages}<Button text="+" on:click={() => bookPageNum++} />{/if}
      <button class="backbutton" on:click={() => (view = 'form')}>
        <ArrowLeft />
      </button>
    </div>
  {:else}
    <button
      class="backbutton"
      on:click={() => (view === 'maker' ? (view = 'form') : newSwap())}
    >
      <ArrowLeft />
    </button>
  {/if}
</div>

{#if !engineUp}
  <div class="notice" in:fade>The swap engine isn't running yet. Swaps become available once it starts.</div>
{/if}

{#if view === 'form'}
  <div class="swap-wrapper" in:fly={{ y: 16, delay: 40 }}>
    <div class="fieldlabel">
      <span>You pay (BTC)</span>
      <span class="avail">
        {#if $btc.balanceSat != null}Available: {($btc.balanceSat / 1e8).toFixed(8)} BTC{:else}Available: —{/if}
      </span>
    </div>
    <div class="field">
      <input type="number" style="width: 60%" placeholder="Amount" value={amountBtc} on:input={onBtcInput} />
      <p class="fiat-value" style="width: 40%; text-align: right">{btcFiatStr}</p>
      <Button on:click={setMax} text="Max" width="105" height="36" />
    </div>

    <div class="swap-arrow">
      <span style="display: inline-flex; transform: rotate(-90deg)"><ArrowLeft /></span>
    </div>

    <div class="fieldlabel">
      <span>You receive (XKR)</span>
      <span class="rate">
        {#if selectedSeller}<button class="rate-link" on:click={clearSeller} title="Reset to best price"
            >Maker: {rate} sat/XKR ✕</button
          >{:else if bestSeller}<button class="rate-link" on:click={() => (view = 'book')}
            >{rate} sat/XKR · {quotedSellers.length} maker{quotedSellers.length === 1 ? '' : 's'} ›</button
          >{:else}Searching for makers…{/if}
      </span>
    </div>
    <div class="field">
      <input type="number" style="width: 60%" placeholder="Amount" value={amountXkr} on:input={onXkrInput} />
      <p class="fiat-value" style="width: 40%; text-align: right">{xkrFiatStr}</p>
      <Button on:click={setMax} text="Max" width="105" height="36" />
    </div>
  </div>

  {#if activeSeller && amountNum > 0 && !withinRange}
    <p class="hint warn">Amount must be between {minBtc} and {maxBtc} BTC.</p>
  {:else if overBalance}
    <p class="hint warn">
      Amount too high — leave room for the Bitcoin network fee. Tap Max to fill the largest swappable amount.
    </p>
  {/if}

  <!-- Gate on the merged history (sortedInfos), NOT live taker `infos`: a pure
       maker has no taker infos, so gating on `infos` hid its swap history entirely. -->
  {#if sortedInfos.length}
    <div class="recent" in:fly={{ y: 16, delay: 120 }}>
      <div class="list-header">
        <h3>Recent swaps</h3>
        {#if sortedInfos.length > 3}
          <Button text="See full history →" on:click={() => (view = 'history')} />
        {/if}
      </div>
      {#each sortedInfos.slice(0, 3) as info (info.swap_id)}
        {@const swapFiat = swapFiatStr(info, $fiat)}
        {@const swapStatus = swapStatusLabel(info.state_name, info.role)}
        <button class="swap-row" on:click={() => openMonitor(info.swap_id)}>
          <div class="swap-id">
            <span class="role" class:sell={info.role === 'maker'}>{info.role === 'maker' ? 'Sell' : 'Buy'}</span>
            {fmtXkr(xkrFromInfo(info))} XKR{#if swapFiat}<span class="swap-fiat"> ({swapFiat})</span>{/if}
          </div>
          <div class="state" class:done={swapStatus === 'Finished'} class:failed={swapStatus === 'Failed'}>
            {swapStatus}
          </div>
        </button>
      {/each}
    </div>
  {/if}
{/if}

{#if view === 'history'}
  <div class="recent" in:fly={{ y: 16, delay: 40 }}>
    {#each pagedHistory as info (info.swap_id)}
      {@const swapFiat = swapFiatStr(info, $fiat)}
      {@const swapStatus = swapStatusLabel(info.state_name, info.role)}
      <button class="swap-row" on:click={() => openMonitor(info.swap_id)}>
        <div class="swap-id">
          <span class="role" class:sell={info.role === 'maker'}>{info.role === 'maker' ? 'Sell' : 'Buy'}</span>
          {fmtXkr(xkrFromInfo(info))} XKR{#if swapFiat}<span class="swap-fiat"> ({swapFiat})</span>{/if}
        </div>
        <div class="state" class:done={swapStatus === 'Finished'} class:failed={swapStatus === 'Failed'}>
          {swapStatus}
        </div>
      </button>
    {/each}
  </div>
{/if}

{#if view === 'book'}
  <div class="card monitor" in:fly={{ y: 16, delay: 40 }}>
    {#if cumAsks.length}
      <div class="book-chart" bind:this={bookChartEl}></div>
      <div class="book-table">
        <div class="book-row book-head">
          <span>Price / XKR</span>
          <span>XKR</span>
          <span>Total XKR</span>
        </div>
        {#each pagedAsks as a (a.peer + '-' + a.price)}
          <button
            class="book-row book-pick"
            class:best={a.i === 0}
            class:selected={selectedAddr && a.address === selectedAddr}
            on:click={() => selectSeller(a)}
            title="Swap with this maker"
          >
            <span class="bk-price">{fmtFiatSmall((a.price * ($fiat.btcPrice || 0)) / 1e8)}</span>
            <span>{fmtXkr(a.xkr)}</span>
            <span class="bk-cum">{fmtXkr(a.cum)}</span>
          </button>
        {/each}
      </div>
      <div class="meta book-meta">
        <span>{cumAsks.length} maker{cumAsks.length === 1 ? '' : 's'} · {fmtXkr(bookTotalXkr)} XKR offered</span>
      </div>
    {:else}
      <p class="maker-blurb">No makers are advertising right now — check back in a moment.</p>
    {/if}
  </div>
{/if}

{#if view === 'monitor'}
  <div class="card monitor" in:fly={{ y: 16, delay: 40 }}>
    {#if activeInfo}
      <div class="recap">
        {#if activeInfo.role === 'maker'}
          {@const sendXkr = xkrFromInfo(activeInfo)}
          {@const recvBtc = activeInfo.btc_amount / 1e8}
          <div>
            <span class="k">You send</span>
            <span class="v">≈ {fmtXkr(sendXkr)} XKR</span>
            {#if fiatStr(sendXkr, 'xkr', $fiat)}<span class="vfiat">≈ {fiatStr(sendXkr, 'xkr', $fiat)}</span>{/if}
          </div>
          <div class="to">
            <span style="display: inline-flex; transform: rotate(180deg)"><ArrowLeft /></span>
          </div>
          <div class="rt">
            <span class="k">You receive</span>
            <span class="v">{recvBtc.toFixed(8)} BTC</span>
            {#if fiatStr(recvBtc, 'btc', $fiat)}<span class="vfiat">≈ {fiatStr(recvBtc, 'btc', $fiat)}</span>{/if}
          </div>
        {:else}
          {@const sendBtc = snapshot?.btc ?? activeInfo.btc_amount / 1e8}
          {@const recvXkr = snapshot?.xkr ?? xkrFromInfo(activeInfo)}
          <div>
            <span class="k">You send</span>
            <span class="v">{sendBtc.toFixed(8)} BTC</span>
            {#if fiatStr(sendBtc, 'btc', $fiat)}<span class="vfiat">≈ {fiatStr(sendBtc, 'btc', $fiat)}</span>{/if}
          </div>
          <div class="to">
            <span style="display: inline-flex; transform: rotate(180deg)"><ArrowLeft /></span>
          </div>
          <div class="rt">
            <span class="k">You receive</span>
            <span class="v">≈ {fmtXkr(recvXkr)} XKR</span>
            {#if fiatStr(recvXkr, 'xkr', $fiat)}<span class="vfiat">≈ {fiatStr(recvXkr, 'xkr', $fiat)}</span>{/if}
          </div>
        {/if}
      </div>

      <SwapTimeline
        stateName={activeInfo.state_name}
        role={activeInfo.role}
        txLockId={activeInfo.tx_lock_id || activeInfo.btc_lock_txid}
        xkrLockTxid={activeInfo.xmr_lock_txid}
        xkrRedeemTxid={activeInfo.xmr_redeem_txid}
        startDate={activeInfo.start_date}
      />

      <div class="meta">
        <span>Swap {short(activeInfo.swap_id)}</span>
        {#if snapshot?.maker}<span>Maker {snapshot.maker}</span>{/if}
      </div>
    {:else if monitorLoadFailed}
      {#if monitorErrorMsg}
        <p class="hint warn">{monitorErrorMsg}</p>
        <p class="hint">No BTC was sent.</p>
      {:else}
        <p class="hint warn">
          This swap didn't get off the ground — the maker likely has no spendable XKR (out of inventory)
          or became unreachable during setup. No BTC was sent. Check the app logs for details.
        </p>
      {/if}
      <button class="primary inline" on:click={newSwap}>Back</button>
    {:else if monitorStatusMsg}
      <p class="hint">{monitorStatusMsg}</p>
      <button class="primary inline" on:click={newSwap}>Back</button>
    {:else}
      <p class="hint">Loading swap…</p>
    {/if}
  </div>
{/if}

{#if view === 'maker'}
  <div class="card monitor" in:fly={{ y: 16, delay: 40 }}>
    <div class="maker-head">
      <span
        class="status-dot"
        class:on={makerState === 'live'}
        class:pending={makerState === 'starting' || makerState === 'recovering'}
        class:warn={makerState === 'error'}
      />
      <span class="status-text">
        {makerState === 'live'
          ? 'Market making — live'
          : makerState === 'recovering'
            ? 'Finishing an in-flight swap…'
            : makerState === 'starting'
              ? 'Market making — starting…'
              : makerState === 'error'
                ? 'Market making — problem'
                : 'Market making — off'}
      </span>
    </div>

    {#if makerState === 'error'}
      <p class="maker-error">{makerStatus.error}</p>
      <button class="primary inline" on:click={retryMaker}>Try again</button>
    {:else if makerState === 'recovering'}
      <p class="maker-blurb">
        A market-making swap from a previous session is still in flight — the engine restarted just to finish it,
        and isn't advertising for new swaps. It'll wrap up on its own; once it's done you can start market-making
        again.
      </p>
      <button class="primary inline" on:click={stopMaker} disabled={makerBusy}>
        {makerBusy ? 'Stopping…' : 'Stop recovery'}
      </button>
    {:else if makerState === 'starting'}
      <p class="maker-blurb">
        Starting the market-making engine and announcing you on the swap network — this takes a few seconds.
      </p>
      <div class="recap">
        <div>
          <span class="k">Inventory</span>
          <span class="v">{fmtXkr(inventoryXkr)} XKR</span>
        </div>
      </div>
      <button class="primary inline" on:click={stopMaker} disabled={makerBusy}>Cancel</button>
    {:else if makerState === 'live'}
      <p class="maker-blurb">
        You're advertised on the swap network. Takers can discover you and swap BTC for your XKR over a private,
        hole-punched connection — no server, no port forwarding.
      </p>
      <div class="recap">
        <div>
          <span class="k">Inventory</span>
          <span class="v">{fmtXkr(inventoryXkr)} XKR</span>
        </div>
        <div class="rt">
          <span class="k">Price</span>
          <span class="v">{makerStatus.advertised ? makerStatus.advertised.price : priceSatsValue} sat/XKR</span>
        </div>
      </div>
      <div class="recap">
        <div>
          <span class="k">BTC earned</span>
          <span class="v">
            {#if makerStatus.btcBalanceSat != null}{(makerStatus.btcBalanceSat / 1e8).toFixed(8)} BTC{:else}—{/if}
          </span>
        </div>
      </div>
      {#if makerOrder}
        <div class="order-progress">
          <div class="op-head">
            <span class="k">Sell order</span>
            <span class="v">{fmtXkr(orderSoldXkr)} / {fmtXkr(orderTargetXkr)} XKR</span>
          </div>
          <div class="op-bar"><div class="op-fill" style="width: {orderPct}%"></div></div>
        </div>
      {/if}
      {#if makerStatus.peerId}<div class="meta"><span>Peer {short(makerStatus.peerId)}</span></div>{/if}
      <button class="primary inline" on:click={stopMaker} disabled={makerBusy}>
        {makerBusy ? 'Stopping…' : 'Stop market making'}
      </button>
    {:else if makerState === 'filled'}
      <p class="maker-blurb">
        Your sell order filled — the XKR you offered has all been sold. Any in-flight swaps will finish on their
        own. Click Done to shut the maker engine down.
      </p>
      <button class="primary inline" on:click={stopMaker} disabled={makerBusy}>
        {makerBusy ? 'Stopping…' : 'Done'}
      </button>
    {:else}
      <p class="maker-blurb">
        Sell your XKR for BTC like a limit order: pick your price and how much to sell, then turn it on. Your
        wallet is the inventory, and buyers reach you peer-to-peer.
      </p>

      <!-- Price: text entry with +/- steppers (reuses the shared Button component). -->
      <div class="slider-block">
        <div class="slider-head">
          <span class="sl-label">Price (sat/XKR)</span>
          <span class="sl-value sl-sub" style="font-weight: 400">
            ≈ {fmtFiatSmall(priceFiatPerXkr)}/XKR
            <span class="sl-mid" class:off={Math.abs(pricePct) >= 0.5}>
              · {Math.abs(pricePct) < 0.5 ? 'market' : (pricePct > 0 ? '+' : '') + pricePct.toFixed(0) + '% vs market'}
            </span>
          </span>
        </div>
        <div class="stepper">
          <Button text="−" width="42" on:click={() => nudgePrice(-1)} />
          <div class="field stepper-input">
            <input type="number" step="any" min="0" bind:value={priceSatsValue} />
          </div>
          <Button text="+" width="42" on:click={() => nudgePrice(1)} />
        </div>
      </div>

      <!-- Amount slider: total XKR to sell (0..inventory). Per-swap min/max are hidden. -->
      <div class="slider-block">
        <div class="slider-head">
          <span class="sl-label">Sell</span>
          <span class="sl-value">
            {fmtXkr(maxSellXkr)} XKR
            <span class="sl-sub">≈ {fmtFiat(sellFiat)}</span>
          </span>
        </div>
        <input
          type="range"
          min="0"
          max={inventoryXkr}
          step={Math.max(inventoryXkr / 200, 0.00001)}
          bind:value={maxSellXkr}
          disabled={inventoryXkr <= 0}
        />
        <div class="slider-foot">
          <span>0</span>
          <span class="sl-mid">{sellPct.toFixed(0)}% of balance</span>
          <span>{fmtXkr(inventoryXkr)} XKR</span>
        </div>
      </div>

      <button
        class="primary inline"
        on:click={startMaker}
        disabled={makerBusy || !engineUp || maxSellXkr <= 0 || priceSatsValue <= 0}
      >
        {makerBusy ? 'Starting…' : 'Start selling'}
      </button>
    {/if}
  </div>
{/if}

{#if showPrepare}
  <div class="overlay" on:click|self={() => (showPrepare = false)} transition:fade={{ duration: 120 }}>
    <div class="modal" in:fly={{ y: 12 }}>
      <h4>Confirm swap</h4>
      <div class="rows">
        <div class="prow">
          <span>You send</span>
          <span class="strong">
            {amountNum} BTC
            <em>{btcFiatStr}</em>
          </span>
        </div>
        <div class="prow">
          <span>You receive</span>
          <span class="strong">
            ≈ {fmtXkr(xkrReceive)} XKR
            <em>{xkrFiatStr}</em>
          </span>
        </div>
        <div class="prow sub">
          <span>Rate</span>
          <span>{rate} sat/XKR</span>
        </div>
        <div class="prow sub">
          <span>Maker</span>
          <span>{activeSeller ? short(activeSeller.peer_id) : '—'}</span>
        </div>
        <div class="prow sub">
          <span>Receive at</span>
          <span>{short(primaryAddress)}</span>
        </div>
      </div>
      <p class="disclaimer">
        Atomic, non-custodial swap. If the maker fails to lock XKR, your Bitcoin is automatically refunded. Network fees
        apply on both chains.
      </p>
      <div class="actions">
        <button class="ghost" on:click={() => (showPrepare = false)} disabled={starting}>Cancel</button>
        <button class="primary" on:click={confirmSwap} disabled={starting}>
          {starting ? 'Starting…' : 'Confirm swap'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 60px;
    border-bottom: 1px solid var(--border-color);
    padding: 0 2rem 0 2rem;

    h3 {
      margin: 0;
      color: var(--text-color);
    }

    .head-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .pager {
      display: flex;
      align-items: center;
      gap: 0.6rem;

      p {
        margin: 0;
        opacity: 0.7;
        font-size: 0.9rem;
      }
    }
  }
  .notice {
    margin: 0.6rem 1.6rem;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-color);
    opacity: 0.85;
    font-size: 0.85rem;
  }
  .card {
    margin: 0.8rem 1.6rem;
    padding: 1rem 1.2rem;
    border: 1px solid var(--border-color);
    border-radius: 12px;

    h4 {
      margin: 0 0 0.8rem;
      color: var(--text-color);
    }
  }

  .swap-wrapper {
    margin: 0.8rem 1.6rem;
    gap: 1rem;

    h4 {
      margin: 0 0 0.8rem;
      color: var(--text-color);
    }
  }

  // Amount fields -- 1:1 with the /wallet/send amount field (.field / .fiat-value).
  .fieldlabel {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    margin: 0.2rem 0 0.4rem;
    font-size: 0.78rem;
    color: var(--text-color);

    span:first-child {
      opacity: 0.75;
    }
    .avail {
      opacity: 0.5;
    }
    .rate {
      color: var(--primary-color);
      opacity: 0.85;
      text-align: right;
    }
    .rate-link {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--primary-color);
      font: inherit;
      &:hover {
        text-decoration: underline;
      }
    }
  }

  .book-meta {
    justify-content: center;
    text-align: center;
  }
  .book-chart {
    position: relative; // anchor the floating tooltip
    width: 100%;
    height: 200px;
    margin: 0.4rem 0 1rem;
  }
  .book-table {
    display: flex;
    flex-direction: column;
  }
  .book-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border-color);
    font-size: 0.82rem;
    color: var(--text-color);

    span:nth-child(2),
    span:nth-child(3) {
      text-align: right;
    }
    &.best .bk-price {
      color: var(--primary-color);
      font-weight: 700;
    }
  }
  // Rows are buttons (pick this maker as the swap counterparty).
  .book-pick {
    background: none;
    border: none;
    border-bottom: 1px solid var(--border-color);
    color: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    width: 100%;
    transition: background 120ms ease-in-out;

    &:hover {
      background: var(--border-color);
    }
    &.selected {
      background: color-mix(in srgb, var(--primary-color) 16%, transparent);
    }
  }
  .book-head {
    opacity: 0.5;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--border-color);
  }
  .bk-cum {
    opacity: 0.7;
  }

  .field {
    display: flex;
    align-items: center;
    background-color: var(--input-background);
    border: 1px solid var(--input-border);
    border-radius: 7px;
    padding: 2px 4px;
    width: 100%;

    input {
      border: none;
      font-size: 1rem;
      width: 100%;

      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
    }

    p {
      margin: 0 1rem 0 0;
      opacity: 50%;
    }
  }

  .swap-arrow {
    text-align: center;
    opacity: 0.5;
    color: var(--text-color);
    font-size: 1.1rem;
    margin: 0.8rem 0 -0.8rem 0;
  }

  .hint {
    margin: 0.2rem 1.7rem;
    font-size: 0.8rem;
    color: var(--text-color);
    opacity: 0.6;

    &.warn {
      color: var(--swap-fail-color, #e5484d);
      opacity: 0.95;
    }
  }

  button.backbutton {
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

  button.primary {
    display: block;
    width: calc(100% - 3.2rem);
    margin: 0.6rem 1.6rem;
    background: var(--primary-color);
    // Font in the background colour so it contrasts on light-highlight themes
    // (e.g. the dark theme's neon-green highlight).
    color: var(--backgound-color);
    border: none;
    border-radius: 8px;
    padding: 0.8rem;
    cursor: pointer;
    font-size: 0.95rem;

    &.inline {
      width: 100%;
      margin: 1rem 0 0;
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  // Full-width swap list, styled exactly like the transaction list on /history:
  // a header bar (title left, action right) followed by full-bleed rows.
  .recent {
    width: 100%;

    .list-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 60px;
      border-top: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
      padding: 0 2rem;

      h3 {
        margin: 0;
        color: var(--text-color);
      }
    }

    .swap-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      height: 52.1px;
      padding: 0 2rem;
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--border-color);
      cursor: pointer;
      text-align: left;
      color: var(--text-color);

      &:hover {
        background-color: var(--border-color);
        border-bottom: 1px solid transparent;
      }
      // Maker (sell) swaps aren't monitorable through the taker engine, so they're
      // read-only rows -- no pointer, no hover highlight.
      &.readonly {
        cursor: default;

        &:hover {
          background-color: transparent;
          border-bottom: 1px solid var(--border-color);
        }
      }
      // Match the /history transaction rows: the id reads like the hash there
      // (default body size, slightly dimmed), with the amount as a smaller detail.
      .swap-id {
        opacity: 0.8;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .role {
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        color: var(--backgound-color);
        background: var(--primary-color);
        opacity: 0.9;

        &.sell {
          background: var(--text-color);
          opacity: 0.55;
        }
      }
      .swap-amt {
        opacity: 0.6;
        font-size: 0.8rem;
      }
      .swap-fiat {
        opacity: 0.75;
      }
      .state {
        opacity: 0.8;
        text-align: right;
        max-width: 55%;

        &.done {
          color: var(--primary-color);
          opacity: 1;
        }
        &.failed {
          color: var(--warn-color);
          opacity: 1;
        }
      }
    }
  }

  .monitor {
    .recap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.8rem;
      margin-bottom: 1.4rem;

      .k {
        display: block;
        font-size: 0.72rem;
        opacity: 0.55;
        color: var(--text-color);
      }
      .v {
        color: var(--text-color);
        font-weight: 600;
      }
      .vfiat {
        display: block;
        font-size: 0.72rem;
        opacity: 0.5;
        color: var(--text-color);
      }
      .rt {
        text-align: right;
      }
      .to {
        opacity: 0.4;
      }
    }
    .meta {
      display: flex;
      justify-content: space-between;
      margin-top: 1.3rem;
      font-size: 0.75rem;
      color: var(--text-color);
      opacity: 0.55;
    }
  }

  .maker-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.9rem;

    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--border-color);
      flex: none;

      &.on {
        background: var(--primary-color);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 22%, transparent);
      }
      &.pending {
        background: var(--primary-color);
        animation: mm-pulse 1.2s ease-in-out infinite;
      }
      &.warn {
        background: var(--swap-fail-color, #e5484d);
      }
    }
    .status-text {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-color);
    }
  }
  @keyframes mm-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
  .maker-error {
    margin: 0 0 1.1rem;
    padding: 0.8rem 0.95rem;
    border: 1px solid var(--swap-fail-color, #e5484d);
    border-radius: 10px;
    font-size: 0.83rem;
    line-height: 1.45;
    color: var(--text-color);
    background: color-mix(in srgb, var(--swap-fail-color, #e5484d) 8%, transparent);
  }
  .maker-blurb {
    margin: 0 0 1.1rem;
    font-size: 0.83rem;
    line-height: 1.45;
    color: var(--text-color);
    opacity: 0.7;
  }
  .mm-row {
    display: flex;
    gap: 0.7rem;

    .field {
      flex: 1;
    }
  }
  .maker-hint {
    margin: 0.4rem 0 0;
    font-size: 0.72rem;
    line-height: 1.4;
    color: var(--text-color);
    opacity: 0.5;
  }
  .slider-block {
    margin: 0 0 1.3rem;
  }
  .slider-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
  }
  .sl-label {
    font-size: 0.78rem;
    opacity: 0.6;
    color: var(--text-color);
  }
  .sl-value {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text-color);
  }
  .sl-sub {
    font-size: 0.74rem;
    font-weight: 400;
    opacity: 0.55;
    margin-left: 0.35rem;
  }
  .slider-foot {
    display: flex;
    justify-content: space-between;
    margin-top: 0.35rem;
    font-size: 0.68rem;
    opacity: 0.45;
    color: var(--text-color);
  }
  .sl-mid {
    opacity: 0.85;
    &.off {
      color: var(--primary-color);
      opacity: 1;
    }
  }
  input[type='range'] {
    width: 100%;
    margin: 0;
    accent-color: var(--primary-color);
    cursor: pointer;
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
  .stepper {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;

    .stepper-input {
      flex: 1;
      height: 30px; // match the shared Button height
      box-sizing: border-box;

      input {
        text-align: center;
        background: transparent;
        color: var(--text-color);
      }
    }
  }
  .order-progress {
    margin-top: 0.9rem;
  }
  .op-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.35rem;
    .k {
      font-size: 0.72rem;
      opacity: 0.55;
      color: var(--text-color);
    }
    .v {
      font-size: 0.8rem;
      color: var(--text-color);
      font-weight: 600;
    }
  }
  .op-bar {
    height: 6px;
    border-radius: 999px;
    background: var(--border-color);
    overflow: hidden;
  }
  .op-fill {
    height: 100%;
    background: var(--primary-color);
    border-radius: 999px;
    transition: width 300ms ease-in-out;
  }

  .overlay {
    position: fixed;
    inset: 0;
    // Dim scrim over the page; the theme var is `--backgound-color` (sic).
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 1.5rem;
  }
  .modal {
    width: 100%;
    max-width: 380px;
    background: var(--backgound-color);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    border-radius: 14px;
    padding: 1.3rem 1.4rem;

    h4 {
      margin: 0 0 1rem;
      color: var(--text-color);
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .prow {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 1rem;
      color: var(--text-color);
      font-size: 0.9rem;

      span:first-child {
        opacity: 0.6;
      }
      .strong {
        font-weight: 600;
        text-align: right;

        em {
          display: block;
          font-style: normal;
          font-weight: 400;
          font-size: 0.78rem;
          opacity: 0.6;
        }
      }
      &.sub {
        font-size: 0.82rem;
        opacity: 0.85;
      }
    }
    .disclaimer {
      margin: 1rem 0 1.2rem;
      font-size: 0.75rem;
      line-height: 1.4;
      color: var(--text-color);
      opacity: 0.6;
    }
    .actions {
      display: flex;
      gap: 0.8rem;

      button {
        flex: 1;
        margin: 0;
      }
      .ghost {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-color);
        border-radius: 8px;
        padding: 0.8rem;
        cursor: pointer;

        &:disabled {
          opacity: 0.5;
        }
      }
    }
  }
</style>
