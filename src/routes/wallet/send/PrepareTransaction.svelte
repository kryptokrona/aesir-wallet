<script>
  import { wallet } from '$lib/stores/wallet.js';
  import Button from '$lib/components/buttons/Button.svelte';
  import toast from 'svelte-french-toast';
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { fiat } from '$lib/stores/fiat.js';
  import { btc, refreshBtc } from '$lib/stores/btc.js';

  // "xkr" -> normal Kryptokrona send; "btc" -> withdraw from the engine's
  // Bitcoin wallet via the swap daemon.
  export let mode = 'xkr';

  let address;
  let amount;
  let paymentId;
  let sendAll;

  const short = (s) => (s ? s.slice(0, 10) + '…' + s.slice(-6) : '');

  onMount(() => {
    //Get address from url if user clicked contact
    const searchParams = new URLSearchParams(location.search);
    const contactAddress = searchParams.get('address');
    if (contactAddress) address = contactAddress;
  });

  $: fiatValue = amount
    ? '$' + ((mode === 'btc' ? $fiat.btcPrice : $fiat.balance) * amount).toFixed(mode === 'btc' ? 2 : 5)
    : '$0.00';

  // Withdraw BTC from the engine's Bitcoin wallet. The daemon validates the
  // address and broadcasts; blank amount + Max drains the wallet.
  async function sendBtc() {
    const toastStyle = {
      position: 'top-right',
      style:
        'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
    };
    if (!address) return toast.error('Enter address', toastStyle);
    if (!sendAll && (!amount || amount <= 0)) return toast.error('Enter amount', toastStyle);
    const res = await window.api.invoke('swap-withdraw-btc', {
      address,
      amountSat: sendAll ? undefined : Math.round(parseFloat(amount) * 1e8),
    });
    if (res && res.ok) {
      toast.success('Sent BTC — ' + short(res.result?.txid || ''), toastStyle);
      address = '';
      amount = '';
      sendAll = false;
      refreshBtc();
    } else {
      toast.error(res?.error || 'Failed to send', toastStyle);
    }
  }

  export const prepareTx = async () => {
    if (mode === 'btc') return sendBtc();
    let validAddress = await window.api.validateAddress(address);
    if (!amount) {
      toast.error('Enter amount', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    }
    if (!address) {
      toast.error('Enter address', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    }
    if (!validAddress) {
      address = '';
      toast.error('Invalid address', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    }

    if (validAddress && amount)
      $wallet.preparedTransaction = await window.api.prepareTransaction(address, amount, paymentId, sendAll);
    if ($wallet.preparedTransaction) {
      address = '';
      amount = '';
      paymentId = '';
    }
  };

  const generatePaymentId = async () => {
    paymentId = await window.api.generatePaymentId();
  };

  //Validate and paste address
  const pasteAddress = async () => {
    address = '';
    let pastedAddress = await navigator.clipboard.readText();
    // BTC addresses aren't XKR addresses; the daemon validates them on send.
    if (mode === 'btc') {
      address = pastedAddress.trim();
      return;
    }
    let validAddress = await window.api.validateAddress(pastedAddress);

    if (validAddress) {
      address = pastedAddress;
      toast.success('Pasted', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    } else {
      toast.error('Invalid address', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    }
  };

  const sendMaxAmount = () => {
    if (mode === 'btc') {
      amount = (($btc.balanceSat ?? 0) / 1e8).toFixed(8);
      sendAll = true;
      return;
    }
    amount = $wallet.balance[0] / 100000 - 0.1;
    amount = amount < 0 ? 0 : amount;
    sendAll = true;
  };
</script>

<div class="wrapper" in:fade>
  <div class="field">
    <input type="text" placeholder={mode === 'btc' ? 'Bitcoin address' : 'Address'} bind:value={address} />
    <Button on:click={pasteAddress} text="Paste" width="105" height="36" />
  </div>
  {#if mode !== 'btc'}
    <div class="field">
      <input type="text" placeholder="Payment Id (optional)" bind:value={paymentId} />
      <Button on:click={generatePaymentId} text="Generate" width="105" height="36" />
    </div>
  {/if}
  <div class="field" style="float: right">
    <input type="number" style="width: 60%" placeholder="Amount" bind:value={amount} />
    <p class="fiat-value" style="width: 40%; text-align: right">{fiatValue}</p>
    <Button on:click={sendMaxAmount} text="Max" width="105" height="36" />
  </div>
</div>

<style lang="scss">
  .wrapper {
    padding: 1rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    align-items: center;
    background-color: var(--input-background);
    border: 1px solid var(--input-border);
    border-radius: 7px;
    padding: 2px 4px;
    width: 100%;

    input {
      border: none;
      font-size: 1rem;
      width: 100%;

      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
    }

    p {
      margin: 0 1rem 0 0;
      opacity: 50%;
    }
  }
</style>
