<script>
import Button from "$lib/components/buttons/Button.svelte";
import { goto } from "$app/navigation";

let height = 0;


const resetWallet = () => {

  window.api.resetWallet(height);

};

const rewindWallet = () => {

  window.api.rewindWallet(height);

};

</script>

<div class="wrapper">
  <h2>Wallet Settings</h2>

  <div class="card-wrapper">

    <h5>Export private keys</h5><br>

    <Button text="Export mnemonic" on:click={() => goto('/auth/backup-wallet')} />
    <Button text="Export private key" on:click={console.log('Clicked')} />

  </div>

  <div class="card-wrapper">

    <h5>Resynchronize wallet</h5><br>



    <input bind:value={height} placeholder="Enter block height">
    <Button text="Rescan from blockheight" on:click={resetWallet} />
    <Button text="Rewind" on:click={rewindWallet} /><br><br>

  </div>


</div>

<style lang="scss">
  .wrapper {
    width: 100%;
    height: 100%;
    padding: 30px;
  }

  input {
    margin-bottom: 5px;
  }
</style>
