<script>
  import { hyper } from "$lib/stores/hyper.js";
  import Peer from "$lib/components/icons/Peer.svelte";
  import { fly } from "svelte/transition";
  import { goto } from "$app/navigation";


  let currentPeer = $hyper.peer
  $: setTimeout(() => currentPeer = $hyper.peer, 50)

  const leaveSwarm = () => {
    $hyper.peer = 1
    $hyper.messages = []
    window.api.send('disconnect-hyper')
    goto('/wallet/hyper')
  }

</script>

<div class="top">
  <div class="pill" on:click={leaveSwarm}>Leave</div>
  <div class="pill" class:update={currentPeer !== $hyper.peer} on:click={() => window.api.send('send-offer')}>
    <Peer size="10" strokeColor="var(--primary-color)"/>
    {#key $hyper.peer}
      <div in:fly={{y: 20}}>{$hyper.peer}</div>
    {/key}
  </div>
</div>

<style lang="scss">

  .top {
    z-index: 3;
    background: linear-gradient(#00000030, #00000000);
    position: fixed;
    top: 0;
    height: 60px;
    width: calc(100% - 65px);
    display: flex;
    justify-content: space-between;
    padding: 1rem 2rem;
  }

  .pill {
    display: flex;
    align-items: center;
    background-color: #313537;
    gap: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 5px;
  }

  .update {
    background-color: var(--button-hover-bg-color);
  }
</style>