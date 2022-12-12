<script>
  import { hyper } from "$lib/stores/hyper.js";

  let message;

  const sendMessage = () => {
    const data = {
      type: 'message',
      id: crypto.randomUUID(),
      time: Date.now(),
      nickname: $hyper.nickname,
      message: message,
    }

    let messages = $hyper.messages ?? []
    messages.push(data)
    $hyper.messages = messages
    window.api.send('send-message', data)
    message = ''
  };

</script>

<div class="wrapper">
  <div class="field">
    <input type="text" bind:value={message} placeholder="Message.." on:keydown={(e) => {if(e.key === 'Enter') sendMessage()}}>
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