<script>
  import Button from "$lib/components/buttons/Button.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import { goto } from "$app/navigation";
  import { node } from "$lib/stores/node.js";

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
      window.api.errorMessage("Cannot scan from height");
      return false;
    }
    return true;
  };

  const getPrivKeys = async () => {
    const keys = await window.api.getPrivateKeys();
    navigator.clipboard.writeText(keys[0]);
    window.api.successMessage("Private key copied");
  };

  let optimizing = false;
  const optimizeWallet = async () => {
    if (optimizing) return;
    optimizing = true;
    try {
      await window.api.invoke("wallet-optimize");
    } finally {
      optimizing = false;
    }
  };
</script>

<div class="wrapper">
  <div class="card">
    <div class="header">
      <h5>Export private keys</h5>
    </div>
    <div class="body">
      <Button on:click={() => goto('/auth/backup-wallet')} text="Export mnemonic" />
      <Button on:click={getPrivKeys} text="Export private key" />
    </div>
  </div>

  <div class="card">
    <div class="header">
      <h5>Optimize wallet</h5>
    </div>
    <div class="body">
      <span class="button_wrapper">
        <Tooltip title="Coalesce many small inputs (e.g. mining rewards) into fewer, larger ones with zero-fee fusion transactions, so large sends stop failing. May take a while and briefly locks funds.">
          <Button on:click={optimizeWallet} text={optimizing ? 'Optimizing…' : 'Optimize now'} />
        </Tooltip>
      </span>
    </div>
  </div>

  <div class="card">
    <div class="header">
      <h5>Resynchronize wallet</h5>
    </div>
    <div class="body">
      <input bind:value={height} placeholder="Enter block height" />

      <span class="button_wrapper">
      <Tooltip title="Forget all transactions and rescan from height">
        <Button on:click={resetWallet} text="Rescan from blockheight" />
      </Tooltip>
    </span>

      <span class="button_wrapper">
      <Tooltip title="Remember transactions and look for missing transactions from height">
        <Button on:click={rewindWallet} text="Rewind" />
      </Tooltip>
    </span>
    </div>
  </div>
</div>

<style lang="scss">
  .wrapper {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    height: 100%;
    padding: 30px;
  }

  .card {
    border: 1px solid var(--border-color);
    border-radius: 5px;

    .header {
      display: flex;
      align-items: center;
      height: 40px;
      padding: 15px;
      border-bottom: 1px solid var(--border-color);
    }

    .body {
      padding: 15px;
    }
  }

  input {
    margin-bottom: 10px;
  }

  .button_wrapper {
    display: inline-block;
    vertical-align: top;
  }
</style>
