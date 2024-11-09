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
      $updater.step = 3;
    }
  }

  const dispatch = new createEventDispatcher();

  const hide = () => {
    dispatch('hide');
  };
</script>

<div in:fade={{ duration: 100 }} out:fade={{ duration: 100 }} class="backdrop">
  {#if $updater.step === 1}
    <h2>Update available</h2>
    <div>
      <Button on:click={() => update()} text="Update" width="180" height="40" />
      <br />
      <br />
      <Button on:click={() => hide()} text="Later" width="180" height="40" />
    </div>
  {:else if $updater.step === 2}
    <div class="updater" in:fly={{ x: -100 }} out:fly={{ x: 100 }}>
      <div class="goal">
        <h4>
          {$updater.percentageDownloaded === 100
            ? $updater.percentageDownloaded.toFixed(0)
            : $updater.percentageDownloaded.toFixed()}%
        </h4>
        <div
          class="progress"
          class:stripes={$updater.percentageDownloaded !== 100}
          class:synced={$updater.percentageDownloaded === 100}
          style="width: {$updater.percentageDownloaded}%;"
        ></div>
      </div>
    </div>
  {:else if $updater.step === 3}
    <div class="updater" style="cursor: pointer;">
      <Button on:click={() => install()} text="Install" width="180" height="40" />
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
    bottom: 330px;
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

  .goal {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 40px;
    background-color: var(--input-background);
    border: 1px solid var(--input-border);
    border-radius: 0.4rem;
    margin: 5px 0;

    h4 {
      color: white;
      position: absolute;
      align-self: center;
      z-index: 9999;
    }
  }

  .percentage {
    position: absolute;
    font-weight: 600;
  }

  .backdrop {
    position: fixed;
    display: grid;
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
