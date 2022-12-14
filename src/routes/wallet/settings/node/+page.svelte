<script>
  import NodeSelector from '$lib/components/NodeSelector.svelte';
</script>

<div class="wrapper">
  <h2>Node Settings</h2>
  <NodeSelector on:connect={(e) => console.log(e)} />
</div>

<style lang="scss">
  .wrapper {
    width: 100%;
    height: 100%;
    padding: 30px;
  }
</style>
