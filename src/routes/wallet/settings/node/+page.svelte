<script>
  import NodeSelector from '$lib/components/NodeSelector.svelte';
</script>

<div class="wrapper">
  <NodeSelector on:connect={(e) => console.log(e)} />
</div>

<style lang="scss">
  .wrapper {
    margin-top: 10rem;
    width: 100%;
    height: 100%;
    padding: 30px;
  }
</style>
