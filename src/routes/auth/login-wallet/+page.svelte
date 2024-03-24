<script>
  import ArrowRight from '$lib/components/icons/ArrowRight.svelte';
  import { fade } from 'svelte/transition';
  import { quadIn } from 'svelte/easing';
  import StartFlash from '$lib/components/layout/StartFlash.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Moon } from 'svelte-loading-spinners';
  import { wallet } from '$lib/stores/wallet.js';
  import { node } from '$lib/stores/node.js';
  import { sleep } from '$lib/utils';
  import { user } from '$lib/stores/user.js';
  import { dev } from '$app/environment';
  import toast from 'svelte-french-toast';
  import NodeSelector from '$lib/components/NodeSelector.svelte';

  let animate = false;
  let loading = false;
  let password = '';
  let nodeOnline;
  let wrongPassword;
  let openNodeSelector;
  let files;
  let fileList;

  onMount(async () => {
    if (dev) {
      $node.selectedNode = await window.api.getNode();
      $wallet.wallets = await window.api.getWallets();
      $user.touchId = await window.api.checkTouchId();
      $wallet.currentWallet = $wallet.wallets[0].wallet;
    }

    animate = true;

    window.api.receive('wrong-password', async () => {
      await sleep(250);
      password = '';
      wrongPassword = true;
      loading = false;
    });

    window.api.receive('wallet-started', async () => {
      await goto('/wallet/dashboard');
      password = '';
      loading = false;
      //Set stored balance to avoid showing zero balance while loading
      $wallet.balance = [parseInt(localStorage.getItem('balance')), 0] ?? [0, 0];
      $wallet.started = true;
    });
  });

  const login = async () => {
    loading = true;
    animate = false;
    wrongPassword = false;

    nodeOnline = await window.api.checkNode($node.selectedNode);
    if (nodeOnline) {
      window.api.walletStart($wallet.currentWallet, password, $node.selectedNode, $wallet.path);
    } else if (!nodeOnline) {
      loading = false;
      password = '';
      toast.error('Node error', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
      openNodeSelector = true;
    }
  };

  const keyDown = (e) => {
    if (e.key === 'Enter' && password.length >= 3) {
      login();
    }
  };

  const handleNodeChange = (node) => {
    window.api.setNode(node);
    openNodeSelector = false;
  };

  const openFromFile = () => {
    fileList.click();
  };

  const selectedFile = async () => {
    console.log('Selected');
    let file = files[0];
    $wallet.currentWallet = file.name.split('.')[0];
    $wallet.file = true;
    $wallet.path = file.path;

    console.log('New selected', $wallet);
  };
</script>

<svelte:window on:keyup|preventDefault={keyDown} />

{#if animate}
  <StartFlash />
{/if}

{#if openNodeSelector}
  <NodeSelector on:connect={(e) => handleNodeChange(e.detail.node)} />
{:else}
  <div
    style="display: flex; flex-direction: column; gap: 2rem;  align-items: center"
    in:fade={{ duration: 200, delay: 400, easing: quadIn }}
  >
    <div />
    <div class="field" class:shake={wrongPassword}>
      <input placeholder="Password..." type="password" bind:value={password} />
      <button on:click={login}>
        {#if loading}
          <Moon color="#ffffff" size="20" unit="px" />
        {:else}
          <ArrowRight green={password.length >= 3} />
        {/if}
      </button>
    </div>
    <div class="info">
      <div style="text-align: center">
        <p>{$wallet.currentWallet}.wallet</p>
        {#if !$wallet.started}
          <p class="import" on:click={() => openFromFile()}>Open another wallet</p>
        {/if}
      </div>

      <input
        bind:this={fileList}
        bind:files
        class="open"
        type="file"
        on:change={() => selectedFile()}
        style="width: 0;"
      />
    </div>
  </div>
{/if}

<style lang="scss">
  .field {
    z-index: 99;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 6px 0 10px;
    background-color: var(--input-background);
    border: 1px solid var(--input-border);
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
      border: 1px solid var(--button-b-color);
      background-color: var(--button-bg-color);
      height: 36px;
      width: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
      cursor: pointer;
      transition: 100ms ease-in-out;

      &:hover {
        background: var(--button-hover-bg-color);
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

  .open {
    opacity: 0;
  }

  .info {
    position: absolute;
    bottom: 30px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;

    p{
      margin: 0;
    }
  }
</style>
