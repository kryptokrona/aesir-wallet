<script>
  import { wallet } from "$lib/stores/wallet.js";
  import Button from "$lib/components/buttons/Button.svelte";
  import toast from "svelte-french-toast";
  import {fade} from "svelte/transition";
  import { onMount } from "svelte";

  let address;
  let amount;
  let paymentId;
  let sendAll;

  onMount(() => {
    const searchParams = new URLSearchParams(location.search)
    const contactAddress = searchParams.get('address')
    if(contactAddress) address = contactAddress
  })

  const prepareTransaction = async () => {
    $wallet.preparedTransaction = await window.api.prepareTransaction(address, amount, paymentId, sendAll);
  };

  const generatePaymentId = () => {

  };

  const pasteAddress = async () => {
    let pastedAddress = await navigator.clipboard.readText();
    let validAddress = await window.api.validateAddress(pastedAddress);

    if (validAddress) {
      address = pastedAddress;
      toast.success("Pasted", {
        position: "top-right",
        style: "border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);"
      });
    } else {
      toast.error("Try again", {
        position: "top-right",
        style: "border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);"
      });
    }


  };

  const sendMaxAmount = () => {

  };

  const resetTransaction = () => {

  }

</script>

<div class="wrapper" in:fade>
  <div class="field">
    <input type="text" placeholder="Address" bind:value={address}>
    <Button on:click={pasteAddress} text="Paste" width="105" height="36" />
  </div>
  <div class="field">
    <input type="text" placeholder="Payment Id (optional)" bind:value={paymentId}>
    <Button on:click={generatePaymentId} text="Generate" width="105" height="36" />
  </div>
  <div class="field">
    <input type="number" placeholder="Amount" bind:value={amount}>
    <Button on:click text="Max" width="105" height="36" />
  </div>
  <div style="display: flex; gap: 1rem">
    <Button on:click={resetTransaction} text="Reset" width="100" wUnit="%" height="40" hUnit="px" />
    <Button on:click={prepareTransaction} text="Send" width="100" wUnit="%" height="40" hUnit="px" />
  </div>

</div>

<style lang="scss">

  .wrapper {
    padding: 1rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 50%;
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

      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
    }

  }

</style>