<script>
    // Copyright (c) 2022, The Kryptokrona Developers
    import {fade, fly} from "svelte/transition";
    import { prettyNumbers } from "$lib/utils";
    import {wallet} from "$lib/stores/wallet.js";

    let locked
    let unlocked
    let total

    $: {
        locked = prettyNumbers($wallet.balance[1])
        unlocked = prettyNumbers($wallet.balance[0])
        total = prettyNumbers($wallet.balance[0] + $wallet.balance[1])
    }
</script>

<div in:fade="{{duration: 100}}" out:fade="{{duration: 100}}" class="popup" on:click>
    <div in:fly="{{y: 50}}" out:fly="{{y: -50}}" class="popup-card layered-shadow">
        <div style="margin-bottom: 10px; display: flex; justify-content: space-between">
            <h3 style="color: var(--title-color)">Fund status</h3>
        </div>
        <div style="margin-bottom: 10px">
            <h5 style="color: var(--warn-color); margin: 0 0 5px 5px;">Locked funds</h5>
            <input disabled type="text" placeholder="Nickname" bind:value={locked}>
        </div>
        <div style="margin-bottom: 10px">
            <h5 style="color: var(--alert-color); margin: 0 0 5px 5px;">Unlocked funds</h5>
            <input disabled type="text" placeholder="Nickname" bind:value={unlocked}>
        </div>
        <div style="margin-bottom: 10px">
            <h5 style="color: var(--success-color); margin: 0 0 5px 5px;">Total Funds</h5>
            <input disabled type="text" placeholder="Nickname" bind:value={total}>
        </div>
    </div>
</div>

<style lang="scss">
  .popup {
    position: fixed;
    display: flex;
    justify-content: center;
    align-items: center;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    background-color: rgba(10, 10, 10, 0.90);
    z-index: 103;

    .popup-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      background-color: var(--backgound-color);
      border: 1px solid var(--border-color);
      border-radius: 0.4rem;
      box-sizing: border-box;
      padding: 30px 30px 40px 30px;
      width: 300px;
    }
  }
</style>