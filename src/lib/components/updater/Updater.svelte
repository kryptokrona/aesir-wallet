<script>
  import { fade, fly } from 'svelte/transition';
  import { updater } from '$lib/stores/updater.js';
  import { createEventDispatcher, onMount } from 'svelte';
  import Button from '$lib/components/buttons/Button.svelte';

  const update = () => {
    $updater.step++;
    window.api.send('download-update');
  };

  const install = () => {
    window.api.send('install-update');
  };

  $: {
    if ($updater.percentageDownloaded === 100) {
      $updater.step++;
    }
  }

  const dispatch = new createEventDispatcher();

  const hide = () => {
    dispatch('hide');
  };
</script>

<div in:fade={{ duration: 100 }} out:fade={{ duration: 100 }} class="backdrop">
  {#if $updater.step === 1}
    <div class="updater" style="cursor: pointer;" in:fly={{ delay: 500, y: 50 }} on:click={() => update()}>
      <p>Update available</p>
    </div>
    <Button on:click={() => hide()} text="Later" width="180" height="40" />
  {:else if $updater.step === 2}
    <div class="updater">
      <div class="progress" style="width: {$updater.percentageDownloaded}"></div>
      <p class="percentage">{$updater.percentageDownloaded}%</p>
    </div>
  {:else if $updater.step === 3}
    <div class="updater" style="cursor: pointer;" on:click={() => install()}>
      <p>Install update</p>
    </div>
  {/if}
</div>

<style lang="scss">
  .updater {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background-color: var(--toast-bg-color);
    border: 1px solid var(--toast-b-color);
    width: 180px;
    height: 40px;
    gap: 0.5rem;
    position: absolute;
    bottom: 200px;
    left: 50%;
    right: 50%;
    transform: translate(-50%);
    color: var(--button-text-color);
    transition: 150ms ease-in-out;

    p {
      margin: 0;
    }
  }

  .progress {
    cursor: progress;
    height: 100%;
    margin-right: auto;
    border-radius: 5px;
    background-color: var(--primary-color);
  }

  .percentage {
    position: absolute;
    font-weight: 600;
  }

  .backdrop {
    position: fixed;
    display: flex;
    justify-content: center;
    align-items: center;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    background-color: var(--backdrop-color);
    backdrop-filter: blur(8px);
    z-index: 103;
    border-radius: 15px;
  }
</style>
