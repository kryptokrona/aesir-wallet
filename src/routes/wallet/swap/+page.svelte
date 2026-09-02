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
  import { btc, refreshBtc } from '$lib/stores/btc.js';
  import { wallet } from '$lib/stores/wallet.js';
  import SwapTimeline from '$lib/components/SwapTimeline.svelte';
  import Button from '$lib/components/buttons/Button.svelte';
  import { friendlyState, isTerminal } from '$lib/utils/swapProgress.js';
  import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';

  let engineUp = false;
  let sellers = [];
  let infos = [];
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
  $: rate = bestSeller?.quote.price ?? null; // sats per XKR
  $: minBtc = bestSeller ? bestSeller.quote.min_quantity / 1e8 : null;
  $: maxBtc = bestSeller ? bestSeller.quote.max_quantity / 1e8 : null;
  $: xkrReceive = parseFloat(amountXkr) || 0;
  $: withinRange =
    bestSeller && amountSat >= bestSeller.quote.min_quantity && amountSat <= bestSeller.quote.max_quantity;
  $: overBalance = $btc.balanceSat != null && amountSat > $btc.balanceSat;

  function fmtFiat(v) {
    const c = ($fiat.currencies || []).find((x) => x.ticker === $fiat.ticker) || {
      symbol: '$',
      symbolLocation: 'prefix',
    };
    const n = (v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return c.symbolLocation === 'prefix' ? `${c.symbol}${n}` : `${n} ${c.symbol}`;
  }
  const fmtXkr = (v) => (v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  // XKR amount a swap will/did receive, from swap_infos (xmr_amount is piconero;
  // 1 XKR = 1e12 piconero in the engine's units). Used when we have no local snapshot.
  const xkrFromInfo = (info) => (info?.xmr_amount || 0) / 1e12;

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
  async function refreshSellers() {
    const res = await window.api.invoke('swap-list-sellers');
    if (res && res.ok && Array.isArray(res.result)) sellers = res.result;
  }
  async function refreshInfos() {
    const res = await window.api.invoke('swap-infos');
    if (res && res.ok && Array.isArray(res.result)) infos = res.result;
  }
  async function loadAddress() {
    try {
      const forms = (await window.api.getAddressForms()) ?? [];
      const primary = forms.find((f) => f.primary) ?? forms[0];
      if (primary) primaryAddress = primary.standard;
    } catch (_) {}
  }

  $: activeInfo = infos.find((i) => i.swap_id === activeSwapId) || null;
  $: activeTerminal = activeInfo ? isTerminal(activeInfo.state_name) : false;

  function setMax() {
    if ($btc.balanceSat == null) return;
    // leave a little headroom for the on-chain lock fee
    let sat = $btc.balanceSat - 500;
    if (maxBtc != null) sat = Math.min(sat, bestSeller.quote.max_quantity);
    amountBtc = sat > 0 ? String(+(sat / 1e8).toFixed(8)) : '0';
    lastEdited = 'btc';
    amountXkr = computeXkr(amountBtc);
  }

  function openPrepare() {
    if (!engineUp) return err("Swap engine isn't running yet");
    if (!bestSeller) return err('No makers available yet');
    if (!primaryAddress) return err('No XKR receive address');
    if (!amountNum || amountNum <= 0) return err('Enter a BTC amount');
    if (!withinRange) return err(`Amount must be between ${minBtc} and ${maxBtc} BTC`);
    if (overBalance) return err('Amount exceeds your BTC balance');
    showPrepare = true;
  }

  async function confirmSwap() {
    if (starting) return;
    if (!bestSeller) {
      showPrepare = false;
      return err('Maker is no longer available — try again');
    }
    starting = true;
    const snap = { btc: amountNum, xkr: xkrReceive, rate, maker: short(bestSeller.peer_id) };
    try {
      const res = await window.api.invoke('swap-start', {
        xkrAddress: bestSeller.xkrAddress,
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
  }
  function newSwap() {
    view = 'form';
    activeSwapId = null;
    snapshot = null;
  }

  // ---- market maker (sell XKR for BTC) -------------------------------------
  let makerStatus = { advertising: false, asbRunning: false, peerId: null, error: null, advertised: null };
  let makerPrice = '5'; // sats per XKR
  let makerMinBtc = '0.0001';
  let makerMaxBtc = '0.05';
  let makerBusy = false;
  let makerStarting = false; // clicked start, engine booting

  $: inventoryXkr = ($wallet?.balance?.[0] ?? 0) / 100000; // atomic -> XKR (5 dp)
  $: makerState = makerStatus.error
    ? 'error'
    : makerStatus.advertising
      ? 'live'
      : makerStarting || makerStatus.asbRunning
        ? 'starting'
        : 'off';

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
    refreshMakerStatus();
  }
  async function startMaker() {
    if (makerBusy || makerStarting) return;
    makerBusy = true;
    makerStarting = true;
    try {
      const res = await window.api.invoke('swap-maker-start', {
        priceSats: String(makerPrice),
        minSat: Math.round((parseFloat(makerMinBtc) || 0) * 1e8),
        maxSat: Math.round((parseFloat(makerMaxBtc) || 0) * 1e8),
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

  onMount(async () => {
    await Promise.all([refreshStatus(), refreshSellers(), refreshInfos(), loadAddress(), refreshBtc()]);
    // If a swap is already in flight, jump straight to watching it.
    const live = infos.filter((i) => !isTerminal(i.state_name));
    if (live.length) {
      live.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
      openMonitor(live[0].swap_id);
    }
    poll = setInterval(async () => {
      await Promise.all([refreshStatus(), refreshSellers(), refreshInfos(), refreshBtc()]);
      if (view === 'maker') await refreshMakerStatus();
    }, 4000);
  });
  onDestroy(() => poll && clearInterval(poll));
</script>

<div class="header" in:fade>
  <h3>{view === 'maker' ? 'Market Maker' : 'Swap BTC → XKR'}</h3>
  {#if view === 'form'}
    <button class="link" on:click={openMaker}>Market Maker</button>
  {:else}
    <button class="backbutton" on:click={() => (view === 'maker' ? (view = 'form') : newSwap())}>
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
        {#if bestSeller}Best rate: {rate} sat/XKR · {quotedSellers.length} maker{quotedSellers.length === 1
            ? ''
            : 's'}{:else}Searching for makers…{/if}
      </span>
    </div>
    <div class="field">
      <input type="number" style="width: 60%" placeholder="Amount" value={amountXkr} on:input={onXkrInput} />
      <p class="fiat-value" style="width: 40%; text-align: right">{xkrFiatStr}</p>
      <Button on:click={setMax} text="Max" width="105" height="36" />
    </div>
  </div>

  {#if bestSeller && amountNum > 0 && !withinRange}
    <p class="hint warn">Amount must be between {minBtc} and {maxBtc} BTC.</p>
  {:else if overBalance}
    <p class="hint warn">Amount exceeds your available BTC balance.</p>
  {/if}

  <button
    class="primary"
    on:click={openPrepare}
    disabled={!engineUp || !bestSeller || !amountNum || !withinRange || overBalance}
    in:fly={{ y: 16, delay: 100 }}
  >
    Swap
  </button>

  {#if infos.length}
    <div class="card recent" in:fly={{ y: 16, delay: 120 }}>
      <h4>Recent swaps</h4>
      {#each infos.slice(0, 5) as info (info.swap_id)}
        <button class="swap-row" on:click={() => openMonitor(info.swap_id)}>
          <div>
            <div class="swap-id">{short(info.swap_id)}</div>
            <div class="swap-amt">{(info.btc_amount / 1e8).toFixed(8)} BTC</div>
          </div>
          <div class="state" class:done={info.state_name === 'xmr is redeemed'}>
            {friendlyState(info.state_name)}
          </div>
        </button>
      {/each}
    </div>
  {/if}
{/if}

{#if view === 'monitor'}
  <div class="card monitor" in:fly={{ y: 16, delay: 40 }}>
    {#if activeInfo}
      <div class="recap">
        <div>
          <span class="k">You send</span>
          <span class="v">{(snapshot?.btc ?? activeInfo.btc_amount / 1e8).toFixed(8)} BTC</span>
        </div>
        <div class="to">
          <span style="display: inline-flex; transform: rotate(180deg)"><ArrowLeft /></span>
        </div>
        <div class="rt">
          <span class="k">You receive</span>
          <span class="v">≈ {fmtXkr(snapshot?.xkr ?? xkrFromInfo(activeInfo))} XKR</span>
        </div>
      </div>

      <SwapTimeline stateName={activeInfo.state_name} />

      <div class="meta">
        <span>Swap {short(activeInfo.swap_id)}</span>
        {#if snapshot?.maker}<span>Maker {snapshot.maker}</span>{/if}
      </div>
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
        class:pending={makerState === 'starting'}
        class:warn={makerState === 'error'}
      />
      <span class="status-text">
        {makerState === 'live'
          ? 'Market making — live'
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
          <span class="v">{makerStatus.advertised ? makerStatus.advertised.price : makerPrice} sat/XKR</span>
        </div>
      </div>
      {#if makerStatus.peerId}<div class="meta"><span>Peer {short(makerStatus.peerId)}</span></div>{/if}
      <button class="primary inline" on:click={stopMaker} disabled={makerBusy}>
        {makerBusy ? 'Stopping…' : 'Stop market making'}
      </button>
    {:else}
      <p class="maker-blurb">
        Sell your XKR for BTC. Set a price and turn it on — your wallet is the inventory, and buyers reach you
        peer-to-peer.
      </p>
      <div class="fieldlabel"><span>Price (sats per XKR)</span></div>
      <div class="field"><input type="number" style="width: 100%" bind:value={makerPrice} placeholder="5" /></div>

      <div class="fieldlabel" style="margin-top: 0.8rem"><span>Min (BTC)</span><span>Max (BTC)</span></div>
      <div class="mm-row">
        <div class="field"><input type="number" style="width: 100%" bind:value={makerMinBtc} placeholder="0.0001" /></div>
        <div class="field"><input type="number" style="width: 100%" bind:value={makerMaxBtc} placeholder="0.05" /></div>
      </div>

      <div class="recap" style="margin-top: 1rem">
        <div>
          <span class="k">Inventory</span>
          <span class="v">{fmtXkr(inventoryXkr)} XKR</span>
        </div>
      </div>
      <button class="primary inline" on:click={startMaker} disabled={makerBusy || !engineUp}>
        {makerBusy ? 'Starting…' : 'Start market making'}
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
          <span>{bestSeller ? short(bestSeller.peer_id) : '—'}</span>
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
    .link {
      background: none;
      border: none;
      color: var(--primary-color);
      cursor: pointer;
      font-size: 0.85rem;
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
    color: #fff;
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

  .recent {
    .swap-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      background: transparent;
      border: none;
      border-top: 1px solid var(--border-color);
      padding: 0.6rem 0;
      cursor: pointer;
      text-align: left;
      color: var(--text-color);

      &:first-of-type {
        border-top: none;
      }
      .swap-id {
        font-size: 0.85rem;
      }
      .swap-amt {
        opacity: 0.6;
        font-size: 0.75rem;
      }
      .state {
        font-size: 0.78rem;
        opacity: 0.8;
        text-align: right;
        max-width: 55%;

        &.done {
          color: var(--primary-color);
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

  .overlay {
    position: fixed;
    inset: 0;
    background: var(--background-color);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 1.5rem;
  }
  .modal {
    width: 100%;
    max-width: 380px;
    background: var(--component-background, var(--background-color, #1b1b1b));
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
