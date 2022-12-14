<script>
  import { fade } from "svelte/transition";
  import PrepareTransaction from "./PrepareTransaction.svelte";
  import ConfirmTransaction from "./ConfirmTransaction.svelte";
  import { wallet } from "$lib/stores/wallet.js";
</script>

<div class="header">
  <h3 in:fade>Send</h3>
</div>


<div style="height: 100%; width: 100%">
  <PrepareTransaction />
  {#if $wallet.preparedTransaction}
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
    padding: 0 2rem 0 2rem
  }

</style>