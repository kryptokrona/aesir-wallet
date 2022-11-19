<script>
  import { wallet } from "$lib/stores/wallet.js";
  import Button from "$lib/components/buttons/Button.svelte";

  let address = ''
  let amount = ''
  let paymentId = ''
  let sendAll = false

  const prepareTransaction = async () => {
    $wallet.preparedTransaction = await window.api.prepareTransaction(address, amount, paymentId, sendAll)
  }

  const generatePaymentId = () => {

  }

  const pasteAddress = () => {

  }

  const sendMaxAmount = () => {

  }

</script>

<div class="wrapper">
  <div class="field">
    <input type="text" placeholder="Address" bind:value={address}>
    <Button on:click text="Paste" width="105" height="36"/>
  </div>
  <div class="field">
    <input type="text" placeholder="Payment Id (optional)" bind:value={paymentId}>
    <Button on:click={generatePaymentId} text="Generate" width="105" height="36"/>
  </div>
  <div>
    <div class="field">
      <input type="text" placeholder="Amount" bind:value={amount}>
      <Button on:click text="Max" width="105" height="36"/>
    </div>
    <Button on:click={prepareTransaction} text="Send" width="100"/>
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
    border-radius: 5px;
    padding: 0.25rem;

    input {
      border: none;
    }

  }

</style>