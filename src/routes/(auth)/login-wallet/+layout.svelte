<script>
import toast from "svelte-french-toast";

window.api.receive('wrong-password', () => {
    toast.error('Wrong password', {
        position: 'top-right',
        style: 'border-radius: 5px; background: #171717; border: 1px solid #252525; color: #fff;',
    })
})

</script>

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