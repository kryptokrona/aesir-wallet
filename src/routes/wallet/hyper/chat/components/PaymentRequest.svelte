<script>
  import { prettyNumbers } from "$lib/utils/index.js";
  import Button from "$lib/components/buttons/Button.svelte";

  export let data;
  //let { id, tyoe, time, nickname, message, amount } = data;

  let timeStamp = new Date(parseInt(123)).toLocaleTimeString().substring(0, 5)

  const declineRequest = () => {
    const data = {
      id: crypto.randomUUID(),
      type: 'message',
      timeStamp: Date.now(),
      nickname: 'Yggdrasil',
      message: 'Anon declined your request'
    }

    window.api.send('send-message', data)
  }

  const acceptRequest = () => {
    const data = {
      id: crypto.randomUUID(),
      type: 'message',
      timeStamp: Date.now(),
      nickname: 'Yggdrasil',
      message: 'Anon accepted your request',
      hash: '123',
      amount: '123'
    }

    window.api.send('send-message', data)
  }


</script>

<div class="bubble">
  <div>
    <h4>Swepool | <span style="font-weight: normal; font-size: 0.8rem">{timeStamp}</span></h4>
    <p>💰 Payment request - <span style="color: var(--title-color)">{prettyNumbers('120000000')} XKR</span></p>
  </div>
  <div style="display: flex; gap: 1rem">
    <Button text="Accept" on:click={acceptRequest}/>
    <Button text="Decline" on:click={declineRequest}/>
  </div>
</div>

<style lang="scss">

  .bubble {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    z-index: 1;
    width: 100%;
    border-top: 1px solid var(--border-color);
    padding: 1rem 2rem;

    p {
      margin: 0;
    }

    h4 {
      margin-bottom: 5px;
    }
  }

  .message {
    font-weight: 400;
    font-family: "Roboto Mono", monospace;
    color: var(--title-color);
    word-break: break-word;
  }
</style>