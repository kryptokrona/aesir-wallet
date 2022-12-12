<script>
  import { fade } from "svelte/transition";
  import PrepareTransaction from "./PrepareTransaction.svelte";
  import ConfirmTransaction from "./ConfirmTransaction.svelte";
  import { wallet } from "$lib/stores/wallet.js";
</script>

<div class="header" in:fade>
  <h3>Send</h3>
</div>


<PrepareTransaction />
{#if $wallet.preparedTransaction}
  <ConfirmTransaction />
{/if}

<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 60px;
    border-bottom: 1px solid var(--border-color);
    padding: 0 2rem 0 2rem
  }

</style>