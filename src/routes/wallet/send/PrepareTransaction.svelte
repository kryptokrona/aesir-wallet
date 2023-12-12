<script>
  import { wallet } from '$lib/stores/wallet.js';
  import Button from '$lib/components/buttons/Button.svelte';
  import toast from 'svelte-french-toast';
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { fiatPrice } from '$lib/stores/fiat.js';

  let address;
  let amount;
  let paymentId;
  let sendAll;

  onMount(() => {
    //Get address from url if user clicked contact
    const searchParams = new URLSearchParams(location.search);
    const contactAddress = searchParams.get('address');
    if (contactAddress) address = contactAddress;
  });

  $: fiatValue = amount ? '$' + ($fiatPrice * amount).toFixed(5) : '$0.00';

  export const prepareTx = async () => {
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
    }
  };

  const generatePaymentId = () => {};

  //Validate and paste address
  const pasteAddress = async () => {
    address = '';
    let pastedAddress = await navigator.clipboard.readText();
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
    amount = $wallet.balance[0] / 100000 - 0.1;
    amount = amount < 0 ? 0 : amount;
    sendAll = true;
  };
</script>

<div class="wrapper" in:fade>
  <div class="field">
    <input type="text" placeholder="Address" bind:value={address} />
    <Button on:click={pasteAddress} text="Paste" width="105" height="36" />
  </div>
  <div class="field">
    <input type="text" placeholder="Payment Id (optional)" bind:value={paymentId} />
    <Button on:click={generatePaymentId} text="Generate" width="105" height="36" />
  </div>
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
