<script>
  import { fiatCurrency, getCoinPriceFromAPI } from '$lib/stores/fiat.js';

  const fiatList = ['usd', 'sek', 'nok', 'dkk', 'eur'];

  //**TODO */ Style this component

  function pickCurrency(picked) {
    $fiatCurrency.picked = picked;
    getCoinPriceFromAPI();
  }
</script>

<div class="wrapper">
  <h2>Choose a currency to display in your Balance</h2>
  <br />
  {#each fiatList as currency}
    <p on:click={() => pickCurrency(currency)}>{currency.toUpperCase()}</p>
  {/each}
</div>

<style lang="scss">
  .wrapper {
    width: 100%;
    height: 100%;
    padding: 30px;
  }
</style>
