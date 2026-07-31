<script>
  import { onMount } from "svelte";
  import toast from "svelte-french-toast";
  import CopyButton from "$lib/components/icons/CopyButton.svelte";
  import QRModal from "$lib/components/QRModal.svelte";
  import { fade, fly } from "svelte/transition";

  // Each entry is { standard, alternate, primary } -- the same (sub)wallet
  // encoded under the default prefix (SEKR) and, when available, the alternate
  // prefix (Xkr). Both decode to the same wallet, so recipients can hand out
  // either form.
  let addressForms = [];
  let busy = false;
  let qr = null; // { address, label } when the QR modal is open

  const refresh = async () => {
    addressForms = (await window.api.getAddressForms()) ?? [];
  };

  onMount(refresh);

  // The switch to the new prefix keeps the old one working, so we label the
  // forms by their visible prefix rather than assuming which is the default.
  const label = address =>
    address && address.startsWith("Xkr") ? "New (Xkr)" : "Legacy (SEKR)";

  const short = address =>
    address ? address.slice(0, 12) + "..." + address.slice(-8) : "";

  const walletName = (form, i) => (form.primary ? "Primary" : `Subwallet ${i}`);

  const copy = address => {
    navigator.clipboard.writeText(address);
    toast.success("Copied", {
      position: "top-right",
      style: "border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);"
    });
  };

  const addSubwallet = async () => {
    if (busy) return;
    busy = true;
    try {
      addressForms = (await window.api.createSubwallet()) ?? addressForms;
    } finally {
      busy = false;
    }
  };
</script>

<div class="header">
  <h3 in:fade>Wallet</h3>
  <button class="add" on:click={addSubwallet} disabled={busy} in:fade>
    {busy ? "Adding…" : "+ New subwallet"}
  </button>
</div>
<div class="list">

  {#each addressForms as form, i}
    <div class="group" in:fly={{y: 20, delay: 50}}>
      <div class="group-title" class:primary={form.primary}>{walletName(form, i)}</div>
      {#each [form.standard, form.alternate].filter(Boolean) as address}
        <div class="row">
          <div class="addr">
            <span class="label">{label(address)}</span>
            <p>{short(address)}</p>
          </div>
          <div class="actions">
            <button class="icon-btn" title="Show QR" on:click={() => (qr = { address, label: `${walletName(form, i)} · ${label(address)}` })}>
              <!-- simple QR glyph -->
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 3h5v5H3V3zM12 3h5v5h-5V3zM3 12h5v5H3v-5z" stroke="var(--text-color)" stroke-width="1.4"/>
                <path d="M12 12h2v2h-2v-2zM15 15h2v2h-2v-2zM15 12h.01M12 15h.01" stroke="var(--text-color)" stroke-width="1.4"/>
              </svg>
            </button>
            <div class="icon-btn" on:click={() => copy(address)}>
              <CopyButton />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/each}

</div>

{#if qr}
  <QRModal address={qr.address} label={qr.label} onClose={() => (qr = null)} />
{/if}

<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 60px;
    border-bottom: 1px solid var(--border-color);
    padding: 0 2rem 0 2rem
  }

  .add {
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background-color: var(--component-background, transparent);
    color: var(--text-color);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: var(--primary-color);
      color: var(--primary-color);
    }
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  .list {
    overflow-y: scroll;
    width: 100%;
    height: 100%;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .group {
    border-bottom: 1px solid var(--border-color);

    &:last-child {
      border-bottom: none;
    }
  }

  .group-title {
    padding: 0.6rem 2rem 0.2rem 2rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.55;

    &.primary {
      color: var(--primary-color);
      opacity: 0.9;
    }
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2rem 0 2rem;
    height: 50px;
  }

  .addr {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
  }

  .addr p {
    margin: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
  }
</style>
