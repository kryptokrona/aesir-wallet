<script>
    import ArrowRight from "$lib/components/icons/ArrowRight.svelte";
    import {fade} from 'svelte/transition'
    import {quadIn} from "svelte/easing";
    import StartFlash from "$lib/components/layout/StartFlash.svelte";
    import {onMount} from "svelte";
    import {goto} from "$app/navigation";
    import {Moon} from "svelte-loading-spinners";
    import {wallet} from "$lib/stores/wallet.js";
    import {node} from "$lib/stores/node.js";
    import {sleep} from "$lib/utils";
    import {user} from "$lib/stores/user.js";
    import {dev} from "$app/environment";

    let animate = false
    let loading = false
    let password = ''
    let nodeOnline
    let wrongPassword

    onMount(async () => {
        if(dev) {
            $node.selectedNode = await window.api.getNode()
            $wallet.wallets = await window.api.getWallets()
            $user.touchId = await window.api.checkTouchId()
            $wallet.currentWallet = $wallet.wallets[0].wallet
        }

        animate = true

        window.api.receive('wrong-password', async () => {
            await sleep(250)
            password = ''
            wrongPassword = true
            loading = false
        })

        window.api.receive('wallet-started', async () => {
            await goto('/wallet/dashboard')
            password = ''
            loading = false
        })

    })

    const login = async () => {
        loading = true
        animate = false
        wrongPassword = false
        nodeOnline = await window.api.checkNode($node.selectedNode)
        if (nodeOnline) {
            window.api.walletStart($wallet.currentWallet, password, $node.selectedNode)
        }
    }

    const keyDown = (e) => {
        if (e.key === 'Enter' && password.length >=3) {
            login()
        }
    }

</script>

<svelte:window on:keyup|preventDefault="{keyDown}" />

{#if animate}
    <StartFlash/>
{/if}

<div style="display: flex; flex-direction: column; gap: 4rem;  align-items: center" in:fade={{duration: 200, delay: 400, easing: quadIn}}>
    <div></div>
    <div class="field" class:shake={wrongPassword}>
        <input placeholder="Password..." type="password" bind:value={password}/>
        <button on:click={login}>
            {#if loading}
                <Moon color="#ffffff" size="20" unit="px"/>
            {:else}
                <ArrowRight green={password.length >= 3}/>
            {/if}
        </button>
    </div>
    <div>
        <p style="opacity: 50%">v1.0.0</p>
    </div>
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

