<script>
  import { fade } from "svelte/transition";
</script>

<div class="header">
  <h3 in:fade>Dashboard</h3>
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
