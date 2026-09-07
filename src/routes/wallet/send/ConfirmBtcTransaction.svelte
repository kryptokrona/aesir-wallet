<script>
  import { wallet } from '$lib/stores/wallet.js';
  import Button from '$lib/components/buttons/Button.svelte';
  import { fade } from 'svelte/transition';
  import toast from 'svelte-french-toast';
  import { refreshBtc } from '$lib/stores/btc.js';

  const short = (s) => (s ? s.slice(0, 14) + '…' + s.slice(-10) : '');
  const toastStyle = {
    position: 'top-right',
    style:
      'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
  };

  let sending = false;

  const confirm = async () => {
    if (sending || !$wallet.preparedBtcTransaction) return;
    sending = true;
    const tx = $wallet.preparedBtcTransaction;
    const res = await window.api.invoke('swap-withdraw-btc', {
      address: tx.address,
      amountSat: tx.sendAll ? undefined : tx.amountSat,
    });
    sending = false;
    if (res && res.ok) {
      toast.success('Sent BTC — ' + short(res.result?.txid || ''), toastStyle);
      $wallet.preparedBtcTransaction = undefined;
      refreshBtc();
    } else {
      toast.error(res?.error || 'Failed to send', toastStyle);
    }
  };

  const cancel = () => {
    $wallet.preparedBtcTransaction = undefined;
  };
</script>

<div class="wrapper">
  {#if $wallet.preparedBtcTransaction}
    <div in:fade|local class="tx">
      <h4>Receiving Address</h4>
      <p style="margin-bottom: 30px; color: var(--primary-color)">
        {short($wallet.preparedBtcTransaction.address)}
      </p>
      <h4>Amount</h4>
      <p style="color: var(--primary-color)">{$wallet.preparedBtcTransaction.amountDisplay}</p>
      <p class="note">A Bitcoin network fee applies on send.</p>
      <div style="margin-top: 1rem">
        <Button on:click={cancel} text="Cancel" />
        <Button on:click={confirm} highlight disabled={sending} text={sending ? 'Sending…' : 'Confirm'} />
      </div>
    </div>
  {:else}
    <div class="tx no-tx" in:fade>
      <p>No prepared transactions 👻</p>
    </div>
  {/if}
</div>

<style lang="scss">
  .wrapper {
    padding: 1rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }

  .tx {
    height: 255px;
    padding: 1rem;
    border-radius: 5px;
    border: 1px solid var(--input-border);
    box-sizing: border-box;
    width: 100%;
  }

  .no-tx {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  p {
    margin: 0;
  }
  .note {
    margin-top: 20px;
    font-size: 0.8rem;
    opacity: 0.6;
  }
</style>
