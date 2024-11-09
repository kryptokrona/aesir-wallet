<script>
  import { fly } from 'svelte/transition';
  import Backdrop from '$lib/components/Backdrop.svelte';
  import { createEventDispatcher } from 'svelte';
  import { goto } from '$app/navigation';
  import { wallet } from '$lib/stores/wallet';
  import Button from './buttons/Button.svelte';

  const dispatch = createEventDispatcher();
  let password = '';
  let enableButton = false;

  $: if (password.length > 1) enableButton = true;
  else enableButton = false;

  const verify = async () => {
    const result = await window.api.verifyPass(password);
    if (!result) {
      window.api.errorMessage('Wrong password');
      return;
    }
    goto('/auth/backup-wallet');
    close();
  };

  const keyDown = (e) => {
    if (e.key === 'Enter' && password.length > 0) {
      verify();
    } else if (e.key === 'Escape') {
      close();
    }
  };

  const close = () => {
    $wallet.verify = false;
  };
</script>

<svelte:window on:keydown={keyDown} />
<Backdrop on:close={close}>
  <div in:fly={{ y: 20 }} out:fly={{ y: -50 }} class="field">
    <input placeholder="Enter password" spellcheck="false" type="password" autocomplete="false" bind:value={password} />
    <Button on:click={verify} enabled={enableButton} disabled={!enableButton} text="Confirm" />
  </div>
</Backdrop>

<style lang="scss">
  .field {
    width: 50%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: absolute;
    padding: 0 0 0 0.5rem;
    background-color: var(--card-background);
    border: 1px solid var(--card-border);
    border-radius: 0.4rem;
    padding-right: 10px;
  }

  input {
    margin: 0 auto;
    width: 100%;
    height: 50px;
    transition: 200ms ease-in-out;
    color: var(--text-color);
    background-color: transparent;
    border: none;
    font-size: 1.1rem;

    &:focus {
      outline: none;
      border: none;
    }
  }
</style>
