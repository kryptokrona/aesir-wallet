<script>
    import '../lib/theme/global.scss'
    import {onMount} from 'svelte';
    import TopBar from "../lib/components/layout/TopBar.svelte";
    import toast, {Toaster} from "svelte-french-toast";
    import { theme, user } from "$lib/stores/user.js";
    import {goto} from "$app/navigation";
    import {updater} from "$lib/stores/updater.js";
    import {page} from "$app/stores";
    import Updater from "$lib/components/updater/Updater.svelte";

    let ready = false;

    onMount(async () => {

        document.documentElement.className = $theme

        ready = true;

        window.api.receive('updater', (data) => {
            data = data.toString()

            switch (data) {
                case 'checking':
                    //Do something
                    break
                case 'available':
                    $updater.step = 1
                    $updater.showPopup = true
                    $updater.updateAvailable = true
                    break
                case 'not-available':
                    if ($page.url.pathname === '/settings') {
                        $updater.step = 4
                        $updater.showPopup = true
                    }
                    break
                case 'downloaded':
                    $updater.showPopup = true
                    $updater.step = 3
                    break
                default:
                //Do nothing
            }
        })

        window.api.receive('update-progress', (progress) => {
            $updater.step = 2
            $updater.percentageDownloaded = progress.percent
            $updater.dataDownloaded = progress.transferred
            $updater.downloadSize = progress.total
            $updater.downloadSpeed = progress.bytesPerSecond
        })

        window.api.receive('wrong-password', async () => {
            toast.error('Wrong password', {
                position: 'top-right',
                style: 'border-radius: 5px; background: #171717; border: 1px solid #252525; color: #fff;',
            })
        })

    });

    $:if ($user.idleTime >= 300) goto('/auth/login-wallet')

</script>

<TopBar/>
{#if ready}
    <Toaster/>
    <main>
        <slot/>
    </main>
    {#if $updater.showPopup}
        <Updater/>
    {/if}
{/if}

<style lang="scss">
  main {
    width: 100vw;
    height: 100vh;
  }
</style>
