<script>
  import {
    stepsFor,
    stateToStep,
    friendlyState,
    swapOutcome,
    descFor,
  } from "$lib/utils/swapProgress.js";

  export let stateName = "";
  export let role = "taker";
  export let txLockId = null;
  export let xkrLockTxid = null;
  export let xkrRedeemTxid = null;
  export let startDate = null;
  export let btcExplorer = "https://mempool.space/testnet/tx/";
  export let xkrExplorer = "https://xkr.network/transaction?hash=";

  $: steps = stepsFor(role);
  $: outcome = swapOutcome(stateName, role);
  $: current = outcome === "done" ? steps.length - 1 : stateToStep(stateName, role);
  $: friendly = friendlyState(stateName, role);
  $: failed = ["refunded", "refunding", "punished", "aborted"].includes(outcome);
  $: lockStep = steps.indexOf("BTC locked");
  $: lockXkrStep = steps.indexOf("Lock XKR");
  $: receiveXkrStep = steps.indexOf("Receive XKR");

  function fmtTime(str) {
    if (!str) return "";
    let ms = Date.parse(str);
    if (!Number.isFinite(ms)) {
      const iso = String(str)
        .replace(" ", "T")
        .replace(/\s*([+-]\d{2}):?(\d{2})(?::\d{2})?$/, "$1:$2");
      ms = Date.parse(iso);
    }
    if (!Number.isFinite(ms)) return "";
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const shortId = (id) => (id ? id.slice(0, 10) + "…" + id.slice(-8) : "");
  const openTx = (id) => window.api?.openLink?.(btcExplorer + id);
  const openXkr = (id) => window.api?.openLink?.(xkrExplorer + id);
</script>

<div class="vtl" class:failed>
  {#if failed}
    <div class="result" class:punish={outcome === "punished"}>
      {#if outcome === "punished"}
        The swap failed at the redeem step. This is the rare punish outcome.
      {:else if outcome === "aborted"}
        The swap was aborted before any funds moved. Nothing was lost.
      {:else if role === "maker"}
        Your XKR is being returned to your wallet. No Bitcoin was received.
      {:else}
        Your Bitcoin is being returned to your wallet. No XKR was exchanged.
      {/if}
    </div>
  {/if}

  {#each steps as label, i}
    {@const done = i < current || outcome === "done"}
    {@const active = i === current && outcome === "active"}
    <div class="step" class:done class:active class:pending={i > current && !done}>
      <div class="rail">
        <span class="dot" />
      </div>
      <div class="body">
        <div class="line1">
          <span class="title">{label}</span>
          {#if i === 0 && startDate}<span class="ts">{fmtTime(startDate)}</span>{/if}
        </div>
        <div class="desc">
          {#if active}{friendly}{:else}{descFor(role, label)}{/if}
        </div>

        {#if i === lockStep && txLockId}
          <button class="txlink" on:click={() => openTx(txLockId)} title="View on mempool.space">
            {shortId(txLockId)} ↗
          </button>
        {/if}

        {#if i === lockXkrStep && xkrLockTxid}
          <button class="txlink" on:click={() => openXkr(xkrLockTxid)} title="View on xkr.network">
            {shortId(xkrLockTxid)} ↗
          </button>
        {/if}

        {#if i === receiveXkrStep && xkrRedeemTxid}
          <button class="txlink" on:click={() => openXkr(xkrRedeemTxid)} title="View on xkr.network">
            {shortId(xkrRedeemTxid)} ↗
          </button>
        {/if}

        {#if i === lockStep && active}
          <div class="confirm">
            <span class="spinner" /> Waiting for on-chain confirmation…
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style lang="scss">
  .vtl {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .step {
    display: grid;
    grid-template-columns: 22px 1fr;
    gap: 0.6rem;
    min-height: 2.9rem;
  }

  .rail {
    position: relative;
    display: flex;
    justify-content: center;
  }
  .rail::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--border-color);
  }
  .step:first-child .rail::before {
    top: 11px;
  }
  .step:last-child .rail::before {
    bottom: calc(100% - 11px);
  }
  .step.done .rail::before,
  .step.active .rail::before {
    background: var(--primary-color);
  }

  .dot {
    position: relative;
    z-index: 1;
    margin-top: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    box-sizing: border-box;
    border: 2px solid var(--border-color);
    background: var(--backgound-color, var(--input-background, #1b1b1b));
    flex: none;
  }
  .step.done .dot {
    border-color: var(--primary-color);
    background: var(--primary-color);
  }
  .step.active .dot {
    border-color: var(--primary-color);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 22%, transparent);
    }
    50% {
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary-color) 8%, transparent);
    }
  }

  .body {
    padding-bottom: 1rem;
    min-width: 0;
  }
  .step:last-child .body {
    padding-bottom: 0;
  }
  .line1 {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-color);
    opacity: 0.55;
  }
  .step.done .title,
  .step.active .title {
    opacity: 1;
  }
  .step.active .title {
    color: var(--primary-color);
  }
  .ts {
    font-size: 0.72rem;
    color: var(--text-color);
    opacity: 0.5;
    white-space: nowrap;
  }
  .desc {
    margin-top: 0.15rem;
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--text-color);
    opacity: 0.6;
  }
  .step.active .desc {
    opacity: 0.9;
  }

  .txlink {
    margin-top: 0.4rem;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: monospace;
    font-size: 0.74rem;
    color: var(--primary-color);
    &:hover {
      text-decoration: underline;
    }
  }

  .confirm {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.4rem;
    font-size: 0.76rem;
    color: var(--text-color);
    opacity: 0.85;
  }
  .spinner {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    border-top-color: var(--primary-color);
    animation: spin 0.8s linear infinite;
    flex: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .result {
    padding: 0.8rem 0.95rem;
    margin-bottom: 0.8rem;
    border: 1px solid var(--swap-fail-color, #e5484d);
    border-radius: 10px;
    font-size: 0.85rem;
    color: var(--text-color);
    background: color-mix(in srgb, var(--swap-fail-color, #e5484d) 8%, transparent);
    &.punish {
      opacity: 0.95;
    }
  }
</style>
