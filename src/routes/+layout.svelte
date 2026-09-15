<script>
  import '../lib/theme/global.scss';
  import '../lib/theme/themes.scss';
  import { onMount } from 'svelte';
  import TopBar from '../lib/components/layout/TopBar.svelte';
  import toast, { Toaster } from 'svelte-french-toast';
  import { theme, user } from '$lib/stores/user.js';
  import { goto } from '$app/navigation';
  import { updater } from '$lib/stores/updater.js';
  import { page } from '$app/stores';
  import Updater from '$lib/components/updater/Updater.svelte';
  import { hyper } from '$lib/stores/hyper.js';
  import { transactions, wallet } from '$lib/stores/wallet';
  import Verify from '$lib/components/Verify.svelte';
  let ready = false;

  document.addEventListener('contextmenu', (event) => event.preventDefault());

  onMount(async () => {
    document.documentElement.className = $theme;

    ready = true;

    window.api.receive('updater', (data) => {
      data = data.toString();

      switch (data) {
        case 'checking':
          //Do something
          break;
        case 'available':
          $updater.step = 1;
          $updater.showPopup = true;
          $updater.updateAvailable = true;
          break;
        case 'not-available':
          if ($page.url.pathname === '/settings') {
            $updater.step = 4;
            $updater.showPopup = true;
          }
          break;
        case 'downloaded':
          $updater.showPopup = true;
          $updater.step = 3;
          break;
        default:
        //Do nothing
      }
    });

    window.api.receive('update-progress', (progress) => {
      $updater.step = 2;
      $updater.percentageDownloaded = progress.percent;
      $updater.dataDownloaded = progress.transferred;
      $updater.downloadSize = progress.total;
      $updater.downloadSpeed = progress.bytesPerSecond;
    });

    window.api.receive('version', (version) => {
      $updater.version = version;
    });

    window.api.receive('wrong-password', async () => {
      toast.error('Wrong password', {
        position: 'top-right',
        style: 'border-radius: 5px; background: #171717; border: 1px solid #252525; color: #fff;',
      });
    });

    window.api.receive('error-message', async (error) => {
      toast.error(error, {
        position: 'top-right',
        style: 'border-radius: 5px; background: #171717; border: 1px solid #252525; color: #fff;',
      });
    });

    window.api.receive('success-message', async (success) => {
      toast.success(success, {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    });

    window.api.receive('hyper-peer', (peer) => {
      if (peer) $hyper.peer++;
      if (!peer) $hyper.peer--;
    });

    window.api.receive('hyper-message', (data) => {
      if (!$page.url.pathname.startsWith('/wallet/hyper')) {
        toast.success('New message', {
          icon: '💬',
          position: 'top-right',
          style:
            'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
        });
      }
      let knownMessages = $hyper.messages ?? [];
      knownMessages.push(data);
      $hyper.messages = knownMessages;
    });
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

  $: if ($user.idleTime >= 300) goto('/auth/login-wallet');
</script>

<TopBar />
{#if ready}
  <Toaster />
  <main>
    <slot />
  </main>
  {#if $updater.showPopup}
    <Updater on:hide={() => ($updater.showPopup = false)} />
  {/if}
{/if}

{#if $wallet.verify}
  <Verify />
{/if}

<style lang="scss">
  main {
    width: 100vw;
    height: 100vh;
  }
</style>
