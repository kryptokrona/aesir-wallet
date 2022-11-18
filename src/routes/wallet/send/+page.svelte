<script>
    import Button from "$lib/components/buttons/Button.svelte";

</script>

<div class="header">
    <h3>Send</h3>
    <Button text="Add"/>
</div>

<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
      min-height: 60px;
    border-bottom: 1px solid var(--border-color);
    padding: 0 2rem 0 2rem
  }

</style>