<script>
  // Copyright (c) 2022, The Kryptokrona Developers

  import NodeStatus from '$lib/components/popups/NodeStatus.svelte';
  import FundsStatus from '$lib/components/popups/FundsStatus.svelte';
  import { wallet } from '$lib/stores/wallet.js';
  import { node } from '$lib/stores/node.js';
  import Globe from '$lib/components/icons/Globe.svelte';
  import Warning from '$lib/components/icons/Warning.svelte';
  import { fade, fly } from 'svelte/transition';
  import { prettyNumbers } from '$lib/utils';
  import { fiat } from '$lib/stores/fiat.js';
  import { onMount, onDestroy, tick } from 'svelte';
  import Auto from '$lib/components/icons/Auto.svelte';

  //Variables and default values
  let dc;
  let nodePopup = false;
  let fundsPopup = false;
  let display = [];
  let showFiat = false;
  let fiatBalance;
  let loading = true;
  let randomInterval;

  function changeTicker(it) {
    let change = true;
    let currency = $fiat.currencies.find((a) => a.ticker === it);
    if (!currency) currency = $fiat.currencies.find((a) => a.ticker === 'usd');
    if (currency.symbolLocation === 'postfix') change = false;
    return [currency.symbol, change];
  }

  // Randomize digits while loading
  onMount(() => {
    randomInterval = setInterval(() => {
      if (loading) {
        display = prettyNumbers(Math.floor(Math.random() * 999999999999)).toString().split('');
      }
    }, 50);

    return () => clearInterval(randomInterval);
  });

  // Stop animation when the first real data tick arrives
  async function stopLoading() {
    loading = false;
    clearInterval(randomInterval);
    await tick();
  }

  // Watch for the first real balance update from the backend
  $: if (loading && $wallet.balance && ($wallet.balance[0] !== 0 || $wallet.balance[1] !== 0)) {
    stopLoading();
  }

  // Normal reactive display update once loading is done
  $: {
    if (!loading) {
      if (showFiat) {
        fiatBalance = (($wallet.balance[0] * $fiat.balance) / 100000).toFixed(5);
        let [ticker, change] = changeTicker($fiat.ticker);
        if (change) display = ticker + fiatBalance;
        else display = fiatBalance + '///' + ticker.toUpperCase();
      } else {
        display = prettyNumbers($wallet.balance[0] + $wallet.balance[1])
          .toString()
          .split('');
      }
    }
  }
</script>

{#if nodePopup}
  <NodeStatus on:click={() => (nodePopup = !nodePopup)} />
{:else if fundsPopup}
  <FundsStatus on:click={() => (fundsPopup = !fundsPopup)} />
{/if}

<div class="balance" in:fade>
  <div class="summary">
    <h2 on:click={() => (showFiat = !showFiat)}>
      Balance <span style="opacity: 50%; cursor: pointer" on:click><Auto /></span>
    </h2>
    <div style="display: inline-flex">
        {#each display ?? [] as number, i (number + i)}
          {#key number}
            {#if number !== '/'}
              <p
                in:fly={{ y: 20, delay: i * 100 }}
                style="font-size: 1.75rem; margin-top: 10px; color: var(--primary-color)"
              >
                {number}
              </p>
            {:else}
              <div style="width: 5px;" />
            {/if}
          {/key}
        {/each}
    </div>
  </div>
  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px">
    <Globe
      yellow={$node.nodeStatus === 'Syncing'}
      red={$node.nodeStatus === 'Not Synced' || $node.nodeStatus === 'Disconnected' || $node.nodeStatus === 'Dead node'}
      blink={$node.nodeStatus !== 'Synced'}
      on:click={() => (nodePopup = !nodePopup)}
    />
    <Warning
      blink={$wallet.balance[1] !== 0}
      grey={$wallet.balance[1] === 0}
      yellow={$wallet.balance[1] !== 0}
      red={dc}
      on:click={() => (fundsPopup = !fundsPopup)}
    />
  </div>
</div>

<style lang="scss">
  .balance {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    height: 120px;
    border-bottom: 1px solid var(--border-color);
    padding: 25px 30px;
    box-sizing: border-box;

    p {
      margin: 0;
    }

    .breakdown {
      display: flex;
      flex-direction: column;
      justify-content: space-between;

      div {
        display: flex;
        flex-direction: column;
        margin-bottom: 10px;
      }
    }
  }
</style>
