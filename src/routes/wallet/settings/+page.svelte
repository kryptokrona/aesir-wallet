<script>

import NodeSelector from "$lib/components/NodeSelector.svelte";
import Button from "$lib/components/buttons/Button.svelte";
import Themes from "./Themes.svelte";
</script>

<div class="header">
  <h3>Settings</h3>
  <div>
    <Button text="Wallet"/>
    <Button text="Node"/>
    <Button text="Theme"/>
    <Button text="Theme"/>
  </div>
</div>
<div class="wrapper">
  <Themes/>
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