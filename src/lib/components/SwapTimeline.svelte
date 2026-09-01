<script>
  // Horizontal progress timeline (o—o—o—o) for a live swap. Driven purely by the
  // taker's `state_name`; see $lib/utils/swapProgress.js for the mapping.
  import { STEPS, stateToStep, friendlyState, swapOutcome } from "$lib/utils/swapProgress.js";

  export let stateName = "";

  $: outcome = swapOutcome(stateName);
  $: current = outcome === "done" ? STEPS.length - 1 : stateToStep(stateName);
  $: friendly = friendlyState(stateName);
  $: failed = ["refunded", "refunding", "punished", "aborted"].includes(outcome);
</script>

<div class="progress">
  <div class="status" class:done={outcome === "done"} class:failed>
    {#if outcome === "active"}
      <span class="spinner" />
    {/if}
    <span class="status-text">{friendly}</span>
  </div>

  {#if failed}
    <div class="result" class:punish={outcome === "punished"}>
      {#if outcome === "punished"}
        The swap failed at the redeem step. This is the rare punish outcome.
      {:else if outcome === "aborted"}
        The swap was aborted before any funds moved. Nothing was lost.
      {:else}
        Your Bitcoin is being returned to your wallet. No XKR was exchanged.
      {/if}
    </div>
  {:else}
    <div class="rail">
      {#each STEPS as label, i}
        <div
          class="step"
          class:reached={i <= current}
          class:done={i < current || outcome === "done"}
          class:active={i === current && outcome === "active"}
        >
          <div class="dot" />
          <span class="lbl">{label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .progress {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    width: 100%;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: var(--text-color);

    &.done .status-text {
      color: var(--primary-color);
      font-weight: 600;
    }
    &.failed .status-text {
      color: var(--swap-fail-color, #e5484d);
    }
  }

  .spinner {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    border-top-color: var(--primary-color);
    animation: spin 0.8s linear infinite;
    flex: none;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .rail {
    display: flex;
    align-items: flex-start;
    width: 100%;
  }

  .step {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;

    // connector leading in from the previous step
    &:not(:first-child)::before {
      content: "";
      position: absolute;
      top: 8px;
      left: -50%;
      right: 50%;
      height: 2px;
      background: var(--border-color);
      z-index: 0;
    }
    &.reached:not(:first-child)::before {
      background: var(--primary-color);
    }
  }

  .dot {
    position: relative;
    z-index: 1;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    box-sizing: border-box;
    border: 2px solid var(--border-color);
    background: var(--component-background, var(--input-background, transparent));
  }

  .step.done .dot {
    border-color: var(--primary-color);
    background: var(--primary-color);
  }
  .step.active .dot {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 20%, transparent);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 22%, transparent); }
    50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary-color) 8%, transparent); }
  }

  .lbl {
    font-size: 0.66rem;
    line-height: 1.15;
    text-align: center;
    color: var(--text-color);
    opacity: 0.6;
  }
  .step.reached .lbl {
    opacity: 0.95;
  }
  .step.active .lbl {
    color: var(--primary-color);
    opacity: 1;
    font-weight: 600;
  }

  .result {
    padding: 0.8rem 0.95rem;
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
