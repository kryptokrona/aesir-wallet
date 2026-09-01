<script>
  import { fade } from "svelte/transition";
  import PrepareTransaction from "./PrepareTransaction.svelte";
  import ConfirmTransaction from "./ConfirmTransaction.svelte";
  import { wallet } from "$lib/stores/wallet.js";
  import Button from "$lib/components/buttons/Button.svelte";

  let prepare;
  let mode = "xkr"; // "xkr" | "btc"
</script>

<div class="header">
  <h3 in:fade>Send</h3>
  <div class="right">
    <div class="toggle" in:fade>
      <button class:active={mode === "xkr"} on:click={() => (mode = "xkr")}>XKR</button>
      <button class:active={mode === "btc"} on:click={() => (mode = "btc")}>BTC</button>
    </div>
    <Button text="Send" on:click={prepare.prepareTx} />
  </div>
</div>

<div style="height: 100%; width: 100%">
  <PrepareTransaction bind:this={prepare} {mode} />
  {#if mode === "xkr"}
    <ConfirmTransaction />
  {/if}
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

  .right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .toggle {
    display: flex;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow: hidden;

    button {
      background: transparent;
      color: var(--text-color);
      border: none;
      padding: 0.4rem 0.9rem;
      cursor: pointer;
      font-size: 0.85rem;

      &.active {
        background: var(--primary-color);
        color: #fff;
      }
    }
  }
</style>
