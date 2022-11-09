<script>
import Navbar from "../../lib/components/layout/Navbar.svelte";
import {Toaster} from "svelte-french-toast";

</script>

<Navbar/>
<Toaster/>
<section>
    <slot/>
</section>

<style lang="scss">

</style>