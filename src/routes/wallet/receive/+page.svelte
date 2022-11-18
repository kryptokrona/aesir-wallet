<script>
  import { onMount } from "svelte";
  import { wallet } from "$lib/stores/wallet.js";
  import toast from "svelte-french-toast";
  import CopyButton from "$lib/components/icons/CopyButton.svelte";
  import { fade, fly } from "svelte/transition";

  let address;
  let subWallets;
  onMount(async () => {
    $wallet.addresses = await window.api.getAddresses();
  });

  const copy = address => {
    navigator.clipboard.writeText(address);
    toast.success("Copied", {
      position: "top-right",
      style: "border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);"
    });
  };

  const createWallet = async () => {
    $wallet.addresses = await window.api.createSubwallet();
  };

  const deleteWallet = async () => {
    $wallet.addresses = await window.api.deleteSubwallet();
  };

</script>

<div class="header" in:fade>
  <h3>Wallet</h3>
</div>
<div class="list">

  {#each $wallet.addresses as address}
    <div class="row" in:fly={{y: 20, delay: 50}}>
      <p
        class:primary={address === $wallet.addresses[0]}>{address.substring(0, 10) + "..." + address.substring(89, address.length)}</p>
      <div on:click={() => copy(address)}>
        <CopyButton />
      </div>
    </div>
  {/each}

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

  .list {
    overflow: scroll;
    width: 100%;
    height: 100%;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2rem 0 2rem;
    border-bottom: 1px solid var(--border-color);
    height: 50px;
  }

  .primary {
    color: var(--primary-color);
  }
</style>