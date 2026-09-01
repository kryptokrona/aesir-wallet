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
  import { walletMode } from '$lib/stores/walletMode.js';
  import { btc, refreshBtc } from '$lib/stores/btc.js';
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
        display = prettyNumbers(Math.floor(Math.random() * 900000000000) + 100000000000).toString().split('');
      }
    }, 50);

    return () => clearInterval(randomInterval);
  });

  // Keep the BTC wallet (balance/txs) fresh so the BTC and Total modes are live.
  onMount(() => {
    refreshBtc();
    const i = setInterval(refreshBtc, 6000);
    return () => clearInterval(i);
  });

  // Reveal digits one at a time from left to right
  async function revealBalance(targetDisplay) {
    clearInterval(randomInterval);

    // Pad or trim current display to match target length
    let current = [...display];
    while (current.length < targetDisplay.length) current.push('0');
    current = current.slice(0, targetDisplay.length);

    let revealIndex = 0;

    // Keep randomizing unrevealed digits at the same 50ms speed
    const scrambleInterval = setInterval(() => {
      for (let j = revealIndex; j < targetDisplay.length; j++) {
        if (targetDisplay[j] === ',' || targetDisplay[j] === '.') {
          current[j] = targetDisplay[j];
        } else {
          current[j] = Math.floor(Math.random() * 10).toString();
        }
      }
      display = [...current];
    }, 50);

    // Reveal correct digits one at a time at 120ms
    for (let i = 0; i < targetDisplay.length; i++) {
      current[i] = targetDisplay[i];
      revealIndex = i + 1;
      display = [...current];
      await new Promise(r => setTimeout(r, 120));
    }

    clearInterval(scrambleInterval);
    loading = false;
    await tick();
  }

  // Reveal the initial balance on first load.
  $: if (loading && $wallet.balance !== null) {
    const target = prettyNumbers($wallet.balance[0] + $wallet.balance[1]).toString().split('');
    revealBalance(target);
  }

  // Total value across both wallets, in the selected fiat/crypto ticker.
  function totalFiat() {
    const xkrValue = (($wallet.balance?.[0] ?? 0) / 100000) * ($fiat.balance ?? 0);
    const btcValue = (($btc.balanceSat ?? 0) / 1e8) * ($fiat.btcPrice ?? 0);
    return (xkrValue + btcValue).toFixed(2);
  }

  // One denomination at a time, cycled by clicking the balance ('///' renders as
  // spacing before the unit):
  //   xkr  -> "1,000,000.00000 XKR"
  //   btc  -> "136.00 mBTC"   (1 mBTC = 100,000 sat)
  //   fiat -> total value in the selected fiat ticker.
  $: {
    if (!loading && $wallet.balance) {
      if ($walletMode === 'fiat') {
        const value = totalFiat();
        let [ticker, change] = changeTicker($fiat.ticker);
        if (change) display = ticker + value;
        else display = value + '///' + ticker.toUpperCase();
      } else if ($walletMode === 'btc') {
        const mbtc = (($btc.balanceSat ?? 0) / 1e5).toLocaleString('en-US', {
          maximumFractionDigits: 2,
        });
        display = mbtc + '///mBTC';
      } else {
        display = prettyNumbers($wallet.balance[0] + $wallet.balance[1]).toString() + '///XKR';
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
    <h2 style="transition: opacity 0.3s ease all" on:click={() => walletMode.cycle()}>
      Balance <span style="opacity: 50%; cursor: pointer" on:click><Auto /></span>
    </h2>
    <div style="display: inline-flex; transition: opacity 0.8s ease" class:blink_me_balance={loading}>
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
      blink={$wallet.balance && $wallet.balance[1] !== 0}
      grey={!$wallet.balance || $wallet.balance[1] === 0}
      yellow={$wallet.balance && $wallet.balance[1] !== 0}
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
