<script>
  import { hyper } from "$lib/stores/hyper.js";
  import ChatBubble from "./ChatBubble.svelte";
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import PaymentRequest from "./PaymentRequest.svelte";
</script>

<div class="outer">
  <div class="inner">

    {#each $hyper.messages ?? [] as data (data.id)}
      <div animate:flip={{duration: 200}} in:fade>
        {#if data.type === 'message'}
          <ChatBubble data={data} />
        {:else if (data.type === 'payment-request')}
          <PaymentRequest data={data}/>
        {/if}
      </div>
    {/each}
    <PaymentRequest/>
  </div>
</div>

<style lang="scss">
  .outer {
    height: calc(100% - 73px);
    display: flex;
    overflow: scroll;
    flex-direction: column-reverse;


    &::-webkit-scrollbar {
      display: none;
    }
  }

  .inner {
    display: flex;
    flex-direction: column
  }
</style>