<script>
    import { Toaster } from "svelte-french-toast";

    console.log('auth');
</script>

<Toaster/>
<section>
    <slot/>
</section>

<style lang="scss">
  section {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
  }
</style>