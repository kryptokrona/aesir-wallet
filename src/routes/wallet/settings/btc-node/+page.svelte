<script>
  // Bitcoin (electrum) node picker for swaps. The BTC side of a swap talks to an
  // electrum server; "Automatic" (empty url) lets the engine use its built-in
  // multi-server list with failover. Changing it restarts the swap engine.
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import Button from '$lib/components/buttons/Button.svelte';
  import toast from 'svelte-french-toast';

  let currentUrl = '';
  let presets = [];
  let custom = '';
  let saving = false;
  let checking = ''; // the url currently being probed (for per-row feedback)

  const toastStyle =
    'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);';

  onMount(async () => {
    try {
      const res = await window.api.invoke('get-btc-node');
      currentUrl = res?.url ?? '';
      presets = res?.presets ?? [];
    } catch (_) {}
  });

  // The label to show for whatever is currently selected.
  $: currentLabel =
    presets.find((p) => p.url === currentUrl)?.label ?? (currentUrl || 'Automatic (recommended)');

  async function apply(url) {
    if (saving) return;
    saving = true;
    checking = url;
    try {
      // Response check (like the XKR node picker): don't switch to a server that
      // doesn't answer. "Automatic" (empty url) always passes.
      const alive = await window.api.invoke('check-btc-node', url);
      if (!alive) {
        toast.error('Cannot connect to node.', { position: 'top-right', style: toastStyle });
        return;
      }
      const res = await window.api.invoke('set-btc-node', url);
      if (res && res.ok) {
        currentUrl = res.url ?? url;
        custom = '';
        toast.success('Connected to node.', { position: 'top-right', style: toastStyle });
      } else {
        toast.error('Cannot connect to node.', { position: 'top-right', style: toastStyle });
      }
    } catch (e) {
      toast.error(e?.message || 'Could not update Bitcoin node', { position: 'top-right', style: toastStyle });
    } finally {
      saving = false;
      checking = '';
    }
  }

  function applyCustom() {
    const url = custom.trim();
    if (!url) return;
    if (!/^(tcp|ssl):\/\/.+:\d+$/.test(url)) {
      toast.error('Use tcp://host:port or ssl://host:port', { position: 'top-right', style: toastStyle });
      return;
    }
    apply(url);
  }
</script>

<div class="wrapper" in:fade>
  <div class="head">
    <div>
      <h4>Current Bitcoin node</h4>
      <h3>{currentLabel}</h3>
      {#if currentUrl}<p class="mono">{currentUrl}</p>{/if}
    </div>
  </div>

  <h4 class="sec">Choose a server</h4>
  <div class="presets">
    {#each presets as p}
      <button class="preset" class:active={p.url === currentUrl} disabled={saving} on:click={() => apply(p.url)}>
        <span class="lbl">
          {p.label}
          {#if checking === p.url}<span class="testing">· testing…</span>{/if}
        </span>
        <span class="mono sub">{p.url || 'built-in list, auto failover'}</span>
      </button>
    {/each}
  </div>

  <h4 class="sec">Custom server</h4>
  <div class="custom">
    <input placeholder="tcp://host:port  or  ssl://host:port" bind:value={custom} disabled={saving} />
    <Button text={saving ? 'Saving…' : 'Use'} on:click={applyCustom} />
  </div>
  <p class="hint">
    Changing the Bitcoin node restarts the swap engine and reconnects. If a single server is slow or
    down, pick “Automatic” to use the built-in list with failover.
  </p>
</div>

<style lang="scss">
  .wrapper {
    width: 100%;
    height: 100%;
    padding: 30px;
    box-sizing: border-box;
    overflow-y: auto;
  }
  h4 {
    opacity: 0.6;
    margin: 0 0 0.4rem;
  }
  h3 {
    margin: 0;
  }
  .sec {
    margin-top: 1.6rem;
  }
  .mono {
    font-family: monospace;
    font-size: 0.8rem;
    opacity: 0.7;
    margin: 0.25rem 0 0;
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
</style>
