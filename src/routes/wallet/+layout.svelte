<script>
  import Navbar from '../../lib/components/layout/Navbar.svelte';
  import Balance from '$lib/components/Balance.svelte';
  import { node } from '$lib/stores/node.js';
  import { wallet, transactions } from '$lib/stores/wallet.js';
  import { user } from '$lib/stores/user.js';
  import { page } from '$app/stores';

  // Clear stale balance from previous session on mount
  localStorage.removeItem('balance');

  window.api.receive('data', (data) => {
    $node.localDaemonBlockCount = data.localDaemonBlockCount;
    $node.networkBlockCount = data.networkBlockCount;
    $node.walletBlockCount = data.walletBlockCount;

    //Check to avoid triggering UI update if the balance is the same
    if (data.balance[0] != localStorage.getItem('balance')) {
      $wallet.balance = data.balance;
    }

    $user.idleTime = data.idle ?? 0;
    localStorage.setItem('balance', data.balance[0]);
  });

  window.api.receive('node-status', (res) => {
    $node.nodeStatus = res;
  });

  window.api.receive('incoming-hash', (tx) => {
    //We already know this pending tx
    if ($transactions.pending.some((a) => a.hash === tx.hash)) return;

    let transaction = {
      amount: tx.amount,
      hash: tx.hash,
      time: Date.now() / 1000,
      height: 'Unconfirmed',
      confirmed: false,
    };

    $transactions.txs.unshift(transaction);
    $transactions.latest.unshift(transaction);
    $transactions.pending.unshift(transaction);
    updateTxs();
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
