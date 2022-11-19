<script>
  import { hyper } from "$lib/stores/hyper.js";
  import ChatBubble from "./ChatBubble.svelte";

  $: console.log($hyper.messages);
</script>

<div class="outer">
  <div class="inner">
    {#each $hyper.messages ?? [] as data, i}
      <ChatBubble data={data}/>
    {/each}
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