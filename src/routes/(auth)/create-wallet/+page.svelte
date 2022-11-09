<script>
    import StartFlash from "$lib/components/layout/StartFlash.svelte";
    import {onMount} from "svelte";
    import ArrowRight from "$lib/components/icons/ArrowRight.svelte";
    import {fade, fly} from 'svelte/transition'
    import Backward from "$lib/components/icons/Backward.svelte";
    import NodeSelector from "$lib/components/NodeSelector.svelte";
    import toast from "svelte-french-toast";
    import {goto} from "$app/navigation";
    import {sleep} from "$lib/utils.js";

    let animate = false
    onMount(() => {
        animate = true
    })

    let step = 1
    let password = ''
    let walletName = ''
    let nodeOnline

    const createWallet = async (e) => {
        const node = e.detail.node
        await toast.promise(nodeOnline = window.api.checkNode(node),
            {
                loading: 'Connecting to node',
                success: 'Node connected',
                error: 'Could not connect.',
            },
            {
                position: 'top-right',
                style: 'border-radius: 5px; background: #171717; border: 1px solid #252525; color: #fff;',
            }
        );
        if (nodeOnline) {
            await sleep(1000)
            const wallet = window.api.walletCreate(walletName, password, node)
            if (wallet) await goto('/login-wallet')
            password = ''
            walletName = ''
        }
    }

</script>

{#if animate}
    <StartFlash/>
{/if}
<section in:fade>
    <div style="margin-bottom: 2rem"></div>
    {#if step === 1}
        <div class="field">
            <input in:fly={{y: 20}} placeholder="Wallet name.." type="text" autofocus bind:value={walletName}/>
            <button class="enabled" on:click={() => step++}>
                <ArrowRight green={walletName.length >= 3}/>
            </button>
        </div>
    {:else if step === 2}
        <div class="field">
            <input in:fly={{y: 20}} placeholder="Password.." type="password" autofocus bind:value={password}/>
            <button on:click={() => step++}>
                <ArrowRight green={password.length >= 3}/>
            </button>
        </div>
    {:else if step === 3}
        <NodeSelector on:connect={(e) => createWallet(e)}/>
    {/if}
    {#if step !== 1}
        <div style="margin-top: 2rem" in:fade on:click={() => {if(step > 1) step--}}>
            <Backward/>
        </div>
        {:else}
        <div style="margin-top: 2rem; opacity: 0%"><Backward/></div>
    {/if}
</section>

<style lang="scss">
  section {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

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
      border: 1px solid transparent;
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

