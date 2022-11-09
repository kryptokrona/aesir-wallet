<script>
    import {Moon} from "svelte-loading-spinners";
    import {fade} from 'svelte/transition'
    import {onMount} from "svelte";
    import {goto} from "$app/navigation";
    import {sleep} from "../lib/utils.js";
    import {node} from "$lib/stores/node.js";
    import {user} from "$lib/stores/user.js";
    import {wallet} from "$lib/stores/wallet.js";

    let loading = true

    onMount(async () => {
        window.api.startApp()
        window.api.receive('started-app', async data => {

            $node.selectedNode = data.node
            $user.touchId = data.touchId
            $wallet.currentWallet = data.myWallets

            if (data.myWallets) {
                await sleep(700)
                loading = false

                await sleep(300)
                await goto('/login-wallet')

            } else {
                await sleep(700)
                loading = false

                await sleep(300)
                await goto('/create-wallet')
            }
        })

    })


</script>

<section>
    {#if loading}
        <div in:fade out:fade>
            <Moon color="#ffffff" size="30" unit="px"/>
        </div>
    {/if}
</section>

<style lang="scss">
    section {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      width: 100%;
    }
</style>