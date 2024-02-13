<script>
  import Navbar from '../../lib/components/layout/Navbar.svelte';
  import Balance from '$lib/components/Balance.svelte';
  import { node } from '$lib/stores/node.js';
  import { wallet, transactions } from '$lib/stores/wallet.js';
  import { user } from '$lib/stores/user.js';
  import { page } from '$app/stores';

  window.api.receive('data', (data) => {
    $node.localDaemonBlockCount = data.localDaemonBlockCount;
    $node.networkBlockCount = data.networkBlockCount;
    $node.walletBlockCount = data.walletBlockCount;
    $wallet.balance = data.balance;
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

  window.api.receive('incoming-tx', (tx, val) => {
    //Delete from pending list on dashboard
    if ($transactions.pending.some((a) => a.hash === tx.hash)) {
      deletePendingTx(tx.hash);
    }

    let transaction = {
      amount: val,
      hash: tx.hash,
      time: tx.timestamp,
      height: tx.blockHeight,
      confirmed: true,
    };

    if ($page.url.pathname === '/wallet/dashboard') {
      //Add to dashboard to update latest four txs.
      $transactions.latest.unshift(transaction);
    }
    //Add to history page
    $transactions.txs.unshift(transaction);
    updateTxs();
  });

  function updateTxs() {
    $transactions = $transactions;
    console.log('$transactions.latest', $transactions.latest);
  }

  function deletePendingTx(hash) {
    $transactions.latest = $transactions.latest.filter((a) => a.hash !== hash);
    $transactions.pending = $transactions.pending.filter((a) => a.hash !== hash);
    $transactions.txs = $transactions.txs.filter((a) => a.hash !== hash);
    updateTxs();
  }
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
