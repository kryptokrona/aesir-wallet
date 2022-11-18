<script>
  import Button from "$lib/components/buttons/Button.svelte";
  import Themes from "./Themes.svelte";
  import { fade } from "svelte/transition";
</script>

<div class="header" in:fade>
  <h3>Settings</h3>
  <div>
    <Button text="Wallet" />
    <Button text="Node" />
    <Button text="Theme" />
    <Button text="Theme" />
  </div>
</div>
<div class="wrapper">
  <Themes />
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

  .wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
  }
</style>