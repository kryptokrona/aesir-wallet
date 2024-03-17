<script>
  import { fiat, getCoinPriceFromAPI } from "$lib/stores/fiat.js";

  const fiatList = $fiat.currencies;

  function pick(it) {
    $fiat.ticker = it;
    localStorage.setItem("fiat", it);
    getCoinPriceFromAPI();
  }
</script>

<div class="wrapper">
  <div class="card">
    <div class="header">
      <h5>Select currency</h5>
    </div>
    <div class="body">
      <div class="list">
        {#each fiatList.reverse() as currency}
          <p class:selected={$fiat.ticker === currency.ticker} on:click={() => pick(currency.ticker)}>{currency.coinName}</p>
        {/each}
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .wrapper {
    width: 100%;
    height: calc(100% - 10px);
    padding: 30px;
  }

  p {
    opacity: 0.8;
    cursor: pointer;
    padding: 5px 15px;
    margin: 0;
    border-bottom: 1px solid var(--border-color);

    &:hover {
      opacity: 1;
    }
  }

  .card {
    border: 1px solid var(--border-color);
    border-radius: 5px;
    height: 200px;

    .header {
      padding: 15px;
      border-bottom: 1px solid var(--border-color);
    }

    .body {
      overflow: hidden;
      height: 100%;

      .list {
        overflow: scroll;
        height: calc(100% - 45.5px);
      }

      .selected {
        color: var(--primary-color)
      }
    }
  }
</style>
