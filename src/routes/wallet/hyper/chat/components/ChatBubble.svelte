<script>
  import { onMount } from "svelte";

  export let data;
  let {id, tyoe, time, nickname, message } = data;

  let timeStamp = new Date(parseInt(time)).toLocaleTimeString().substring(0, 5)
</script>

<div class="bubble">
  <h4>{nickname} | <span style="font-weight: normal; font-size: 0.8rem">{timeStamp}</span></h4>
  <p>{message}</p>
</div>

<style lang="scss">

  .bubble {
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