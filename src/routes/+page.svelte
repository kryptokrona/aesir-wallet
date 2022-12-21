<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { sleep } from "$lib/utils";
  import { node } from "$lib/stores/node.js";
  import { user } from "$lib/stores/user.js";
  import { wallet } from "$lib/stores/wallet.js";
  import Logo from "$lib/components/icons/Logo.svelte";

  let loading = true;
  let wallets;

  onMount(async () => {
    $wallet.wallets = await window.api.getWallets();
    $node.selectedNode = await window.api.getNode();
    $user.touchId = await window.api.checkTouchId();

    window.api.startApp();

    window.api.receive("started-app", async data => {
      if (data.myWallets) {
        $wallet.currentWallet = $wallet.wallets[0].wallet;
        await sleep(2250);
        loading = false;
        await sleep(250);
        await goto("/auth/login-wallet");
      } else if (!data.myWallets) {
        await sleep(2250);
        loading = false;
        await sleep(250);
        await goto("/auth/create-wallet");
      }
    });

  });
</script>

<section>
  {#if loading}
    <div class="spin">
      <Logo size="128" opacity="15" />
    </div>
  {/if}
</section>

<style lang="scss">
  section {
    display: flex;
    position: relative;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }

  .spin {
    animation: rotation forwards 2s ease-in-out normal;

    &::before {
      content: '';
      transform: rotate(0deg)
    }

    &::after {
      content: '';
      transform: rotate(180deg)
    }
  }

  @-webkit-keyframes rotation {
    0% {
      transform: rotate(0deg)
    }
    100% {
      transform: rotate(180deg)
    }
  }
</style>