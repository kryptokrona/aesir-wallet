<script>
  import { fiat, getCoinPriceFromAPI } from '$lib/stores/fiat.js';

  const fiatList = $fiat.currencies;

  //**TODO */ Style this component

  function pick(it) {
    $fiat.ticker = it;
    getCoinPriceFromAPI();
  }
</script>

<div class="wrapper">
  <h2>Switch display currency</h2>
  <br />
  <div class="currencylist">
    {#each fiatList.reverse() as currency}
      <p on:click={() => pick(currency.ticker)}>{currency.coinName}</p>
    {/each}
  </div>
</div>

<style lang="scss">
  .wrapper {
    width: 100%;
    height: 100%;
    padding: 30px;
  }

  p {
    opacity: 0.8;
    cursor: pointer;
    &:hover {
      opacity: 1;
    }
  }

  .currencylist {
    overflow: scroll;
    height: 60%;
    width: 100%;
    overflow-x: hidden;
  }
</style>
