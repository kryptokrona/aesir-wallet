<script>
  import { fade } from "svelte/transition";
  import PrepareTransaction from "./PrepareTransaction.svelte";
  import ConfirmTransaction from "./ConfirmTransaction.svelte";
  import { wallet } from "$lib/stores/wallet.js";
  import Button from "$lib/components/buttons/Button.svelte";

  let prepare
</script>

<div class="header">
  <h3 in:fade>Send</h3>
  <div>
    <Button text="Send" on:click={prepare.prepareTx}/>
  </div>
</div>


<div style="height: 100%; width: 100%">
  <PrepareTransaction bind:this={prepare}/>
    <ConfirmTransaction />
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