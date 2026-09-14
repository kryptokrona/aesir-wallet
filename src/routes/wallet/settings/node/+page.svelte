<script>
  import NodeSelector from '$lib/components/NodeSelector.svelte';
  import { node } from '$lib/stores/node.js';
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import Button from '$lib/components/buttons/Button.svelte';
  import toast from 'svelte-french-toast';

  const toastStyle =
    'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);';

  // ---- XKR node ------------------------------------------------------------
  let showSelector = false;

  const changeNode = async (e) => {
    const change = await window.api.changeNode(e.detail.node);
    if (!change) {
      toast.error('Cannot connect to node.', { position: 'top-right', style: toastStyle });
      $node.loading = false;
    }
    $node.loading = false;
    $node.selectedNode = change;
    showSelector = false;
  };

  let progress;
  $: progress = Number((($node.walletBlockCount / $node.networkBlockCount) * 100).toFixed(2));
  $: if ($node.networkBlockCount === 0) {
    $node.nodeStatus = 'Node offline';
  }
  $: progressCheck = Number.isFinite(progress);

  // ---- Bitcoin (electrum) node --------------------------------------------
  // The BTC side of a swap talks to an electrum server; "Automatic" (empty url)
  // lets the engine use its built-in multi-server list with failover. Changing
  // it probes the server (response check) then restarts the swap engine.
  // Fallback presets so the section is usable even if the backend handler isn't
  // available yet (e.g. the electron main process hasn't been restarted).
  const BTC_FALLBACK_PRESETS = [
    { label: 'Automatic (recommended)', url: '' },
    { label: 'Blockstream (testnet)', url: 'tcp://electrum.blockstream.info:60001' },
    { label: 'Blockstream SSL (testnet)', url: 'ssl://electrum.blockstream.info:60002' },
  ];

  let btcUrl = '';
  let btcPresets = BTC_FALLBACK_PRESETS;
  let btcCustom = '';
  let btcSaving = false;
  let btcChecking = ''; // url currently being probed, for per-row feedback

  onMount(async () => {
    try {
      const res = await window.api?.invoke('get-btc-node');
      if (res) {
        btcUrl = res.url ?? '';
        if (Array.isArray(res.presets) && res.presets.length) btcPresets = res.presets;
      }
    } catch (_) {
      // keep the fallback presets
    }
  });

  $: btcLabel = btcPresets.find((p) => p.url === btcUrl)?.label ?? (btcUrl || 'Automatic (recommended)');

  async function applyBtc(url) {
    if (btcSaving) return;
    btcSaving = true;
    btcChecking = url;
    try {
      // Response check, same as the XKR node picker: don't switch to a server
      // that doesn't answer. "Automatic" (empty url) always passes.
      const alive = await window.api.invoke('check-btc-node', url);
      if (!alive) {
        toast.error('Cannot connect to node.', { position: 'top-right', style: toastStyle });
        return;
      }
      const res = await window.api.invoke('set-btc-node', url);
      if (res && res.ok) {
        btcUrl = res.url ?? url;
        btcCustom = '';
        toast.success('Connected to node.', { position: 'top-right', style: toastStyle });
      } else {
        toast.error('Cannot connect to node.', { position: 'top-right', style: toastStyle });
      }
    } catch (e) {
      toast.error(e?.message || 'Could not update Bitcoin node', { position: 'top-right', style: toastStyle });
    } finally {
      btcSaving = false;
      btcChecking = '';
    }
  }

  function applyBtcCustom() {
    const url = btcCustom.trim();
    if (!url) return;
    if (!/^(tcp|ssl):\/\/.+:\d+$/.test(url)) {
      toast.error('Use tcp://host:port or ssl://host:port', { position: 'top-right', style: toastStyle });
      return;
    }
    applyBtc(url);
  }
</script>

<div class="wrapper">
  <div class="gird">
    <div>
      <h4>Node</h4>
      <h3>{$node.selectedNode?.url ?? ''}</h3>
    </div>
    <div>
      <h4>Wallet height</h4>
      <h3>{$node.walletBlockCount ? $node.walletBlockCount : '-'}</h3>
    </div>
    <div>
      <h4>Status</h4>
      <h3>{$node.nodeStatus}</h3>
    </div>
    <div>
      <h4>Status</h4>
      <h3>{progressCheck ? `${progress === '100.00' ? '100%' : `${progress}%`}` : 'Node offline'}</h3>
    </div>
    <div>
      <Button text="Change node" on:click={() => (showSelector = !showSelector)} />
    </div>
  </div>

  <hr class="divider" />

  <!-- Bitcoin node (swap engine's electrum server) -->
  <div class="btc">
    <div class="btc-head">
      <h4>Bitcoin node (swaps)</h4>
      <h3>{btcLabel}</h3>
      {#if btcUrl}<p class="mono">{btcUrl}</p>{/if}
    </div>

    <h4 class="sec">Choose a server</h4>
    <div class="presets">
      {#each btcPresets as p}
        <button
          class="preset"
          class:active={p.url === btcUrl}
          disabled={btcSaving}
          on:click={() => applyBtc(p.url)}
        >
          <span class="lbl">
            {p.label}
            {#if btcChecking === p.url}<span class="testing">· testing…</span>{/if}
          </span>
          <span class="mono sub">{p.url || 'built-in list, auto failover'}</span>
        </button>
      {/each}
    </div>

    <h4 class="sec">Custom server</h4>
    <div class="custom">
      <input placeholder="tcp://host:port  or  ssl://host:port" bind:value={btcCustom} disabled={btcSaving} />
      <Button text={btcSaving ? 'Saving…' : 'Use'} on:click={applyBtcCustom} />
    </div>
    <p class="hint">
      Changing the Bitcoin node restarts the swap engine and reconnects. If a single server is slow or
      down, pick “Automatic” to use the built-in list with failover.
    </p>
  </div>
</div>

{#if showSelector}
  <div class="overlay" out:fade>
    <NodeSelector on:connect={(e) => changeNode(e)} />
  </div>
{/if}

<style lang="scss">
  .wrapper {
    width: 100%;
    height: 100%;
    padding: 30px;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .gird {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-gap: 2rem;

    div {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    h4 {
      opacity: 60%;
    }
  }

  .divider {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 2rem 0;
  }

  .btc {
    h4 {
      opacity: 0.6;
      margin: 0 0 0.4rem;
    }
    h3 {
      margin: 0;
    }
  }
  .btc-head .mono {
    margin-top: 0.25rem;
  }
  .sec {
    margin-top: 1.6rem;
  }
  .mono {
    font-family: monospace;
    font-size: 0.8rem;
    opacity: 0.7;
    margin: 0;
    word-break: break-all;
  }
  .presets {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .preset {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    padding: 0.7rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--border-color);
    background: var(--card-background, transparent);
    color: var(--text-color);
    cursor: pointer;
    transition: 100ms ease;
    &:hover {
      border-color: var(--primary-color);
    }
    &.active {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 1px var(--primary-color) inset;
    }
    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }
  .preset .lbl {
    font-weight: 600;
  }
  .preset .sub {
    opacity: 0.55;
  }
  .testing {
    font-weight: 400;
    font-size: 0.78rem;
    color: var(--primary-color);
  }
  .custom {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    input {
      flex: 1;
      height: 40px;
      padding: 0 0.8rem;
      color: var(--text-color);
      background: var(--input-background);
      border: 1px solid var(--input-border);
      border-radius: 8px;
      font-size: 0.9rem;
      &:focus {
        outline: none;
        border-color: var(--primary-color);
      }
    }
  }
  .hint {
    margin-top: 1rem;
    font-size: 0.8rem;
    opacity: 0.6;
    line-height: 1.4;
  }

  .overlay {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--backgound-color);
    z-index: 9;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 15px;
  }
</style>
