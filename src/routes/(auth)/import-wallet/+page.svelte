<script lang="ts">
    import ArrowRight from "$lib/components/icons/ArrowRight.svelte";
    import {fly, fade} from 'svelte/transition'
    import {goto} from "$app/navigation";
    import {quadIn} from "svelte/easing";
    import StartFlash from "$lib/components/layout/StartFlash.svelte";
    import {onMount} from "svelte";

    let animate: boolean = false
    onMount(() => {
        animate = true
    })

</script>

{#if animate}
    <StartFlash/>
{/if}
<div class="field" in:fade={{duration: 200, delay: 400, easing: quadIn}}>
    <input placeholder="Password..." type="password"/>
    <button on:click={() => goto('/')}>
        <ArrowRight/>
    </button>
</div>

<style lang="scss">
  .field {
    z-index: 99;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 6px 0 10px;
    background-color: var(--card-background);
    border: 1px solid var(--card-border);
    border-radius: 8px;
    transition: 100ms ease-in-out;

    &:focus-within {
      border: 1px solid #404040;
    }

    input {
      margin: 0 auto;
      width: 200px;
      height: 48px;
      transition: 200ms ease-in-out;
      color: var(--text-color);
      background-color: transparent;
      border: none;
      font-size: 1.1rem;

      &:focus {
        outline: none;
      }
    }

    button {
      border: none;
      background-color: #252525;
      height: 36px;
      width: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
      cursor: pointer;
      transition: 100ms ease-in-out;

      &:hover {
        background: #303030;
      }
    }
  }
</style>

