<script>
  import NodeSelector from '$lib/components/NodeSelector.svelte';
  import { node } from '$lib/stores/node.js';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { onMount, onDestroy } from 'svelte';
  import Button from '$lib/components/buttons/Button.svelte';
  import toast from 'svelte-french-toast';

  let mode = 'xkr'; // "xkr" | "btc"
  $: dir = mode === 'btc' ? 1 : -1;
  const slide = { duration: 280, easing: cubicOut };
  let showSelector = false;
  let showBtcSelector = false;

  // BTC monitoring
  let btcNode = 'Automatic';
  let btcHeight = null;
  let btcStatus = '-';

  const changeNode = async (e) => {
    const change = await window.api.changeNode(e.detail.node);
    if (!change) {
      toast.error('Cannot connect to node.', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
      $node.loading = false;
      return;
    }
    $node.loading = false;
    $node.selectedNode = change;
    showSelector = false;
  };

  const hostOf = (url) => (url || '').replace(/^\w+:\/\//, '');

  const loadBtcStatus = async () => {
    btcStatus = 'Checking…';
    const cur = await window.api.invoke('get-btc-node').catch(() => null);
    const configured = (cur && cur.url) || '';
    const st = await window.api.invoke('swap-btc-status').catch(() => null);
    const urls = (st && st.ok && st.result && st.result.electrum_urls) || [];
    btcHeight = st && st.ok && st.result ? st.result.height || 0 : null;

    // "Connected" only if a node actually responds. A specific node is probed
    // directly; in automatic mode we probe the engine's pool and report the first
    // one that answers (so an onion node with no Tor correctly reads unreachable).
    const candidates = configured ? [configured] : urls;
    let connected = null;
    if (candidates.length) {
      const results = await Promise.all(
        candidates.map(async (url) => ({
          url,
          ok: await window.api.invoke('check-btc-node', url).catch(() => false),
        })),
      );
      connected = (results.find((r) => r.ok) || {}).url || null;
    }

    if (connected) {
      btcStatus = btcHeight ? 'Synced' : 'Connected';
      btcNode = configured
        ? hostOf(connected)
        : `Automatic — ${hostOf(connected)}${urls.length > 1 ? ` (+${urls.length - 1})` : ''}`;
    } else if (candidates.length) {
      btcStatus = configured ? 'Unreachable' : 'Disconnected';
      btcNode = configured ? hostOf(configured) : 'Automatic';
    } else {
      const rpc = await window.api.invoke('swap-rpc-status').catch(() => null);
      btcStatus = rpc && rpc.running ? 'Connecting…' : 'Disconnected';
      btcNode = configured ? hostOf(configured) : 'Automatic';
    }
  };

  let btcPoll = null;
  const startBtcPoll = () => {
    stopBtcPoll();
    btcPoll = setInterval(loadBtcStatus, 5000);
  };
  const stopBtcPoll = () => {
    if (btcPoll) {
      clearInterval(btcPoll);
      btcPoll = null;
    }
  };

  onMount(loadBtcStatus);
  onDestroy(stopBtcPoll);

  // Refresh while the BTC tab is open (not while the picker overlay is up).
  $: if (mode === 'btc' && !showBtcSelector) {
    loadBtcStatus();
    startBtcPoll();
  } else {
    stopBtcPoll();
  }

  let progress;
  $: progress = (($node.walletBlockCount / $node.networkBlockCount) * 100).toFixed(2);
</script>

<div class="page">
  <div class="toggle-bar">
    <div class="toggle" in:fade>
      <button class:active={mode === 'xkr'} on:click={() => (mode = 'xkr')}>XKR</button>
      <button class:active={mode === 'btc'} on:click={() => (mode = 'btc')}>BTC</button>
    </div>
  </div>

  <div class="content">
    {#if mode === 'xkr'}
      <div class="gird" in:fly={{ ...slide, x: 80 * dir }} out:fly={{ ...slide, x: -80 * dir }}>
        <div class="card">
          <div class="header"><h5>Node</h5></div>
          <div class="body"><h3>{$node.selectedNode.url ?? ''}</h3></div>
        </div>
        <div class="card">
          <div class="header"><h5>Wallet height</h5></div>
          <div class="body"><h3>{$node.walletBlockCount ? $node.walletBlockCount : '-'}</h3></div>
        </div>
        <div class="card">
          <div class="header"><h5>Status</h5></div>
          <div class="body"><h3>{$node.nodeStatus ? $node.nodeStatus : '-'}</h3></div>
        </div>
        <div class="card">
          <div class="header"><h5>Sync</h5></div>
          <div class="body">
            <h3>{isNaN(progress) ? '-' : `${progress === '100.00' ? '100%' : `${progress}%`}`}</h3>
          </div>
        </div>
        <div class="action">
          <Button text="Change node" on:click={() => (showSelector = !showSelector)} />
        </div>
      </div>
    {:else}
      <div class="gird" in:fly={{ ...slide, x: 80 * dir }} out:fly={{ ...slide, x: -80 * dir }}>
        <div class="card">
          <div class="header"><h5>Node</h5></div>
          <div class="body"><h3>{btcNode}</h3></div>
        </div>
        <div class="card">
          <div class="header"><h5>Bitcoin height</h5></div>
          <div class="body"><h3>{btcHeight ? btcHeight : '-'}</h3></div>
        </div>
        <div class="card">
          <div class="header"><h5>Status</h5></div>
          <div class="body"><h3>{btcStatus}</h3></div>
        </div>
        <div class="action">
          <Button text="Change node" on:click={() => (showBtcSelector = true)} />
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showSelector}
  <div class="overlay" out:fade>
    <NodeSelector showBack on:connect={(e) => changeNode(e)} on:back={() => (showSelector = false)} />
  </div>
{/if}

{#if showBtcSelector}
  <div class="overlay" out:fade>
    <NodeSelector kind="btc" showBack on:done={() => (showBtcSelector = false)} on:back={() => (showBtcSelector = false)} />
  </div>
{/if}

<style lang="scss">
  .page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .toggle-bar {
    display: flex;
    justify-content: center;
    padding: 20px 30px;
  }

  .toggle {
    display: flex;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow: hidden;

    button {
      background: transparent;
      color: var(--text-color);
      border: none;
      padding: 0.4rem 0.9rem;
      cursor: pointer;
      font-size: 0.85rem;

      &.active {
        background: var(--primary-color);
        color: var(--backgound-color);
      }
    }
  }

  .content {
    flex: 1;
    display: grid;
    justify-items: center;
    align-items: start;
    padding: 20px 30px;
    overflow-x: hidden;
  }

  .gird {
    grid-area: 1 / 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-gap: 1rem;
    width: 100%;
    max-width: 520px;

    .action {
      grid-column: 1 / -1;
      display: flex;
      justify-content: center;
    }
  }

  .card {
    min-width: 0;
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

      h3 {
        margin: 0;
        overflow-wrap: anywhere;
      }
    }
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
  }
</style>
