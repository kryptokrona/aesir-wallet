<script>
    import ArrowRight from "../../../lib/components/icons/ArrowRight.svelte";
    import {fade} from 'svelte/transition'
    import {quadIn} from "svelte/easing";
    import StartFlash from "../../../lib/components/layout/StartFlash.svelte";
    import {onMount} from "svelte";
    import toast from "svelte-french-toast";
    import {goto} from "$app/navigation";

    let animate = false
    let loading = false
    let node
    let wallets = []
    let password = ''
    let walletName
    let nodeOnline

    onMount(async () => {
        animate = true
        wallets = await window.api.getWallets()
        node = await window.api.getNode()
        walletName = wallets[0].wallet

        window.api.receive('wrong-password', () => {
            toast.error('Wrong password', {
                position: 'top-right',
                style: 'border-radius: 5px; background: #171717; border: 1px solid #252525; color: #fff;',
            })
        })

        window.api.receive('wallet-started', () => {
            toast.dismiss()
            goto('/dashboard')
            password = ''
            loading = false
        })

    })

    const login = async () => {
        loading = true
        nodeOnline = await window.api.checkNode(node)
        if (nodeOnline) {
            window.api.walletStart(walletName, password, node)
        }
    }

</script>

{#if animate}
    <StartFlash/>
{/if}

<div class="field" in:fade={{duration: 200, delay: 400, easing: quadIn}}>
    <input placeholder="Password..." type="password" bind:value={password}/>
    <button on:click={login}>
        {#if loading}
            <Moon color="#000000" size="20" unit="px"/>
        {:else}
            <ArrowRight green={password.length >= 3}/>
        {/if}
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

