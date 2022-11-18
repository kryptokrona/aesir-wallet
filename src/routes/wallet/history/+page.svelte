<script>
    import Button from "$lib/components/buttons/Button.svelte";
    import { fade } from "svelte/transition";
</script>

<div class="header" in:fade>
  <h3>History</h3>
  <div>
    <Button text="-" />
    <Button text="+" />
  </div>
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