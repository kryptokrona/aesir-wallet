<script>
    import '../lib/theme/global.scss'
    import {onMount} from 'svelte';
    import TopBar from "../lib/components/layout/TopBar.svelte";

    let ready = false;

    onMount(() => {
        ready = true;
    });

</script>

{#if ready}
    <TopBar/>

    <main>
        <slot/>
    </main>

{/if}

<style lang="scss">
  main {
    width: 100vw;
    height: 100vh;
  }
</style>
