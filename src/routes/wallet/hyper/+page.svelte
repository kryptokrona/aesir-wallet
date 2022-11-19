<script>
  import { hyper } from "$lib/stores/hyper.js";
  import Button from "$lib/components/icons/Button.svelte";
  import { goto } from "$app/navigation";
  import { fade } from "svelte/transition";

  let secret = "";

  const startSwarm = () => {
    window.api.send("connect-hyper", secret);
    $hyper.connected = true;
    goto("/wallet/hyper/chat");
    secret = "";
  };

</script>

<div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%" in:fade>
  <div class="field">
    <input type="text" placeholder="Secret" bind:value={secret}>
    <Button on:click={startSwarm} text="Join" width="105" height="36" disabled={false} />
  </div>
</div>

<style lang="scss">
  .field {
    display: flex;
    align-items: center;
    background-color: var(--input-background);
    border: 1px solid var(--input-border);
    border-radius: 8px;
    padding: 0.25rem;

    input {
      border: none;
    }

  }
</style>