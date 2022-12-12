<script>
    // Copyright (c) 2022, The Kryptokrona Developers
    import {fade, fly} from "svelte/transition";
    import Close from "$lib/components/icons/Close.svelte";
    import {node} from "$lib/stores/node.js";

    let progress

    $: {
        progress = (($node.walletBlockCount / $node.networkBlockCount) * 100)
    }

</script>

<div in:fade="{{duration: 100}}" out:fade="{{duration: 100}}" class="popup" on:click|self>
    <div in:fly="{{y: 50}}" out:fly="{{y: -50}}" class="popup-card layered-shadow">
        <div style="margin-bottom: 10px; display: flex; justify-content: space-between">
            <h3 style="color: var(--title-color)" on:click={() => window.api.rescanWallet()}>Node status</h3>
        </div>
        <div>
            <h5 style="margin-bottom: 10px">Node</h5>
            <input disabled type="text" placeholder="Nickname" bind:value={$node.selectedNode.url}>
        </div>
        <div>
            <h5 style="margin-bottom: 10px">Status</h5>
            <input disabled type="text" placeholder="Node Status" bind:value={$node.nodeStatus}>
        </div>
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 5px">
                <h5 style="margin-bottom: 10px">Sync</h5>
            </div>
            <div class="goal">
                <h4>{progress === 100 ? progress.toFixed(0) : progress.toFixed(2) ?? 0.00}%</h4>
                <div class="progress" class:stripes={progress !== 100} class:synced={(progress === 100)}
                     style="width: {progress}%;"></div>
            </div>
        </div>
    </div>
</div>

<style lang="scss">
  .popup {
    position: fixed;
    display: flex;
    justify-content: center;
    align-items: center;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    background-color: rgba(10, 10, 10, 0.90);
    z-index: 103;

    .popup-card {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      background-color: var(--backgound-color);
      border: 1px solid var(--border-color);
      border-radius: 5px;
      box-sizing: border-box;
      padding: 30px 30px 40px 30px;
      width: 300px;
    }
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
    border-radius: 5px;
    margin: 5px 0;

    h4 {
      color: white;
      position: absolute;
      align-self: center;
      z-index: 9999;
    }
  }

  .progress {
    background-color: var(--alert-color);
    height: 40px;
    margin-right: auto;
    border-radius: 5px;
    transition: 200ms ease-in-out;
  }

  .synced {
    background-color: var(--success-color);
  }
</style>