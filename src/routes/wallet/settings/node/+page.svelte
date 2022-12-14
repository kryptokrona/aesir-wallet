<script>
  import NodeSelector from '$lib/components/NodeSelector.svelte';
  import { node } from "$lib/stores/node.js";

  const changeNode = async (e) => {
    $node.selectedNode = await window.api.changeNode(e.detail.node)
  }
</script>

<div class="wrapper">
  <NodeSelector on:connect={(e) => changeNode(e)} />
</div>

<style lang="scss">
  .wrapper {
    margin-top: 10rem;
    width: 100%;
    height: 100%;
    padding: 30px;
  }
</style>
