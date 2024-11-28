<script>
  import StartFlash from '$lib/components/layout/StartFlash.svelte';
  import { onMount } from 'svelte';
  import ArrowRight from '$lib/components/icons/ArrowRight.svelte';
  import { fade, fly } from 'svelte/transition';
  import Backward from '$lib/components/icons/Backward.svelte';
  import NodeSelector from '$lib/components/NodeSelector.svelte';
  import Button from '$lib/components/buttons/Button.svelte';
  import { wallet } from '$lib/stores/wallet.js';
  import { node } from '$lib/stores/node.js';
  import { sleep } from '$lib/utils';
  import { goto } from '$app/navigation';
  import toast from 'svelte-french-toast';

  let animate = false;
  onMount(() => {
    animate = true;
  });

  let step = 1;
  let password = '';
  let walletName = '';
  let files;
  let fileList;

  const checkWalletName = async () => {
    if (await window.api.walletExists(walletName)) {
      window.api.errorMessage('A wallet with that name already exists!');
      return false;
    }
    step++;
  };

  const createWallet = async (e, selectedNode = e.detail.node) => {
    $node.selectedNode = selectedNode;

    const myWallets = await window.api.walletCreate(walletName, password, selectedNode);

    if (myWallets) {
      $wallet.wallets = myWallets;
      $wallet.currentWallet = myWallets[0].wallet;
      window.api.walletStart($wallet.currentWallet, password, selectedNode, false);
      password = '';
      walletName = '';
      $wallet.started = true;
      await sleep(300);
      await goto('/auth/backup-wallet');
    }
    if (!(await window.api.checkNode(selectedNode))) {
      toast.error('Cannot connect to node.', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    }
    $node.loading = false;
  };

  const openFromFile = () => {
    fileList.click();
  };

  const selectedFile = async () => {
    let file = files[0];
    $wallet.currentWallet = file.name.split('.')[0];
    $wallet.file = true;
    $wallet.path = file.path;
    await goto(`./login-wallet`);
  };
</script>

{#if animate}
  <StartFlash />
{/if}

<section in:fade>
  <div style="margin-bottom: 2rem" />
  {#if step === 1}
    <h2>Create wallet</h2>
    <div class="field">
      <input in:fly={{ y: 20 }} placeholder="Wallet name.." type="text" autofocus bind:value={walletName} />
      <button
        class="enabled"
        on:click={() => {
          checkWalletName();
        }}
      >
        <ArrowRight green={walletName.length >= 3} />
      </button>
    </div>

    <p>- or -</p>

    <Button on:click={() => openFromFile()} text="Open" width="105" height="36" />
    <Button on:click={() => goto('/auth/import-wallet')} text="Import" width="105" height="36" />

    <input
      bind:this={fileList}
      bind:files
      class="open"
      type="file"
      on:change={() => selectedFile()}
      style="width: 0;"
    />
  {:else if step === 2}
    <h2>Secure wallet</h2>
    <div class="field">
      <input in:fly={{ y: 20 }} placeholder="Password.." type="password" autofocus bind:value={password} />
      <button on:click={() => step++}>
        <ArrowRight green={password.length >= 3} />
      </button>
    </div>
  {:else if step === 3}
    <NodeSelector on:connect={(e) => createWallet(e)} />
  {/if}
  {#if step !== 1}
    <div
      style="margin-top: 2rem"
      in:fade
      on:click={() => {
        if (step > 1) step--;
      }}
    >
      <Backward />
    </div>
  {:else}
    <div style="margin-top: 2rem; opacity: 0%">
      <Backward />
    </div>
  {/if}
</section>

<style lang="scss">
  .open {
    opacity: 0;
  }
  section {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rem;
  }

  .field {
    z-index: 99;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 6px 0 10px;
    background-color: var(--card-background);
    border: 1px solid var(--card-border);
    border-radius: 8px;
    transition: 100ms ease-in-out;

    &:focus-within {
      border: 1px solid #404040;
    }

    input {
      margin: 0 auto;
      width: 200px;
      height: 48px;
      transition: 200ms ease-in-out;
      color: var(--text-color);
      background-color: transparent;
      border: none;
      font-size: 1.1rem;

      &:focus {
        outline: none;
      }
    }

    button {
      border: 1px solid transparent;
      background-color: #252525;
      height: 36px;
      width: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
      cursor: pointer;
      transition: 100ms ease-in-out;

      &:hover {
        background: #303030;
      }
    }
  }

  .import {
    text-decoration: underline;
    opacity: 50%;
    transition: 150ms ease-in-out;
    cursor: pointer;
    &:hover {
      opacity: 100%;
    }
  }
</style>
