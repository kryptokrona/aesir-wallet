<script>
    import { fly } from 'svelte/transition'
    import {updater} from "$lib/stores/updater.js";

</script>

{#if $updater.step === 1}
    <div class="updater" style="cursor: pointer;" in:fly={{delay: 500, y: 50}} on:click={() => $updater.step++}>
        <p>Update available</p>
    </div>
{:else if $updater.step === 2}
    <div class="updater" on:click={() => $updater.step++}>
        <div class="progress" style="width: 78%"></div>
        <p class="percentage">78%</p>
    </div>
{:else if $updater.step === 3}
    <div class="updater" style="cursor: pointer;">
        <p>Install update</p>
    </div>
{/if}


<style lang="scss">

  .updater {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background-color: var(--button-bg-color);
    border: 1px solid var(--border-color);
    width: 180px;
    height: 40px;
    gap: 0.5rem;
    position: absolute;
    bottom: 30px;
    left: 50%;
    right: 50%;
    transform: translate(-50%);
    color: var(--button-text-color);
    transition: 150ms ease-in-out;

    &:hover {
      background-color: var(--button-hover-bg-color);
      color: var(--button-hover-text-color);
    }

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
</style>