<script>
  import { fade } from "svelte/transition";
  import { wallet } from "$lib/stores/wallet.js";
  import { fiat } from "$lib/stores/fiat.js";

  $:fiatBalance = "$" + ($wallet.balance[0] * $fiat / 100000).toFixed(5);

</script>

<div class="header">
  <h3 in:fade>Dashboard</h3>
</div>

<div class="wrapper">
  <div class="card-wrapper">
    <h3>Fiat value</h3>
    <p>{fiatBalance}</p>
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
    padding: 0 2rem 0 2rem
  }
  .card-wrapper {
    margin: 10px;
  }
</style>
