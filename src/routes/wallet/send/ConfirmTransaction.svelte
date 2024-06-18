<script lang="ts">
  import { wallet } from "$lib/stores/wallet.js";
  import { prettyNumbers } from "$lib/helpers";
  import Button from "$lib/components/buttons/Button.svelte";
  import { fade } from 'svelte/transition'

  const sendTransaction = async () => {
    const sent = await window.api.sendTransaction($wallet.preparedTransaction.hash);
    $wallet.preparedTransaction = undefined
  };

  const deleteTransaction = async () => {
    const deleted = await window.api.deleteTransaction($wallet.preparedTransaction.hash);
    $wallet.preparedTransaction = undefined
  };

</script>

<div class="wrapper">
    {#if $wallet.preparedTransaction}
      <div in:fade|local class="tx">
        <h4>Receiving Address</h4>
        <p style="margin-bottom: 30px; color: var(--primary-color)">{$wallet.preparedTransaction.address.substr(0, 24) + ".." + $wallet.preparedTransaction.address.substr(84, $wallet.preparedTransaction.address.length)}</p>
        <h4>PaymentID</h4>
        <p style="margin-bottom: 30px; color: var(--primary-color)">{$wallet.preparedTransaction.paymentid ? $wallet.preparedTransaction.paymentid : 'Not Applicable'}</p>
        <div style="display: flex; gap: 2rem">
          <div>
            <h4>Total Amount</h4>
            <p style="color: var(--primary-color)">{$wallet.preparedTransaction.amount}</p>
          </div>
          <div>
            <h4>Fee</h4>
            <p style="color: var(--primary-color)">{prettyNumbers($wallet.preparedTransaction.fee)}</p>
          </div>
        </div>
        <div style="margin-top: 1rem">
          <Button on:click={deleteTransaction} text="Cancel"/>
          <Button on:click={sendTransaction} text="Confirm"/>
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
</style>
