<script>
  import Navbar from "../../lib/components/layout/Navbar.svelte";
  import Balance from "$lib/components/Balance.svelte";
  import { node } from "$lib/stores/node.js";
  import { wallet } from "$lib/stores/wallet.js";
  import { user } from "$lib/stores/user.js";
  import { page } from "$app/stores";

  window.api.receive("data", data => {
    $node.localDaemonBlockCount = data.localDaemonBlockCount;
    $node.networkBlockCount = data.networkBlockCount;
    $node.walletBlockCount = data.walletBlockCount;
    $wallet.balance = data.balance;
    $user.idleTime = data.idle ?? 0;
  });

  window.api.receive("node-status", (res) => {
    $node.nodeStatus = res;
  });
</script>

<section>
  <Navbar />
  <div>
    {#if !$page.url.pathname.startsWith('/wallet/hyper')}
      <Balance />
    {/if}
    <slot />
  </div>
</section>

<style lang="scss">
  section {
    display: flex;
    width: 100%;
    height: 100%;

    div {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }
  }


</style>