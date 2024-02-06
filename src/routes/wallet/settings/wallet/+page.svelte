<script>
  import Button from '$lib/components/buttons/Button.svelte';
  import Tooltip from '$lib/components/Tooltip.svelte';
  import { goto } from '$app/navigation';
  import { node } from '$lib/stores/node.js';

  let height = 0;

  const resetWallet = () => {
    if (!checkHeight(height)) return;
    window.api.resetWallet(height);
  };

  const rewindWallet = () => {
    if (!checkHeight(height)) return;
    window.api.rewindWallet(height);
  };

  const checkHeight = (h) => {
    if (h > $node.networkBlockCount) {
      window.api.errorMessage('Cannot scan from height');
      return false;
    }
    return true;
  };

  const getPrivKeys = async () => {
    const keys = await window.api.getPrivateKeys();
    navigator.clipboard.writeText(keys[0]);
    window.api.successMessage('Private key copied');
  };
</script>

<div class="wrapper">
  <h2>Wallet Settings</h2>

  <div class="card-wrapper">
    <h5>Export private keys</h5>
    <br />

    <Button text="Export mnemonic" on:click={() => goto('/auth/backup-wallet')} />
    <Button text="Export private key" on:click={getPrivKeys} />
  </div>

  <div class="card-wrapper">
    <h5>Resynchronize wallet</h5>
    <br />

    <input bind:value={height} placeholder="Enter block height" />

    <span class="button_wrapper">
      <Tooltip title="Forget all transactions and rescan from height">
        <Button text="Rescan from blockheight" on:click={resetWallet} />
      </Tooltip>
    </span>

    <span class="button_wrapper">
      <Tooltip title="Remember transactions and look for missing transactions from height">
        <Button text="Rewind" on:click={rewindWallet} />
        <br />
        <br />
      </Tooltip>
    </span>
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

  .button_wrapper {
    display: inline-block;
    vertical-align: top;
  }
</style>
