<script>
  import Button from "$lib/components/icons/Button.svelte";
  import { hyper } from "$lib/stores/hyper.js";

  let message;

  const sendMessage = () => {
    let messages = $hyper.messages ?? []
    messages.push({type:'message', nickname: "Anon", message })
    $hyper.messages = messages
    window.api.send('send-message', {type:'message', nickname: "Anon", message })
    message = ''
  };

</script>

<div class="wrapper">
  <div class="field">
    <input type="text" bind:value={message}>
    <Button text="Send" on:click={sendMessage} disabled={false} />
  </div>
</div>


<style lang="scss">
  .wrapper {
    position: absolute;
    bottom: 0;
    padding: 1rem 2rem;
    border-top: 1px solid var(--border-color);
    width: calc(100% - 65px);
  }

  .field {
    display: flex;
    gap: 1rem;
    background-color: var(--input-background);
    width: 100%;
  }
</style>