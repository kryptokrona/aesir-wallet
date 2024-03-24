<script>
  import NodeSelector from '$lib/components/NodeSelector.svelte';
  import { node } from '$lib/stores/node.js';
  import { fade } from 'svelte/transition';
  import Button from '$lib/components/buttons/Button.svelte';

  let showSelector = false;

  const changeNode = async (e) => {
    $node.selectedNode = await window.api.changeNode(e.detail.node);
    showSelector = false;
  };

  let progress;
  $: progress = (($node.walletBlockCount / $node.networkBlockCount) * 100).toFixed(2);

  isNaN();
</script>

<div class="wrapper">
  <div class="gird">
    <div>
      <h4>Node</h4>
      <h3>{$node.selectedNode.url ?? ''}</h3>
    </div>
    <div>
      <h4>Wallet height</h4>
      <h3>{$node.walletBlockCount ? $node.walletBlockCount : '-'}</h3>
    </div>
    <div>
      <h4>Status</h4>
      <h3>{$node.nodeStatus ? $node.nodeStatus : '-'}</h3>
    </div>
    <div>
      <h4>Status</h4>
      <h3>{isNaN(progress) ? '-' : `${progress === '100.00' ? '100%' : `${progress}%`}`}</h3>
    </div>
    <div>
      <Button text="Change node" on:click={() => (showSelector = !showSelector)} />
    </div>
  </div>
</div>

{#if showSelector}
  <div class="overlay" out:fade>
    <NodeSelector on:connect={(e) => changeNode(e)} />
  </div>
{/if}

<style lang="scss">
  .wrapper {
    width: 100%;
    height: 100%;
    padding: 30px;
  }

  .gird {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-gap: 2rem;

    div {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    h4 {
      opacity: 60%;
    }
  }

  .overlay {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--backgound-color);
    z-index: 9;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
</style>
