<script>
  import { fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { createEventDispatcher, onMount } from 'svelte';
  import { base } from '$app/paths';
  import ArrowRight from '$lib/components/icons/ArrowRight.svelte';
  import { node } from '$lib/stores/node.js';
  import Auto from '$lib/components/icons/Auto.svelte';
  import { Moon } from 'svelte-loading-spinners';
  import Button from '$lib/components/buttons/Button.svelte';
  import toast from 'svelte-french-toast';

  export let kind = 'xkr'; // "xkr" | "btc"
  export let showBack = false;

  let nodeInput = '';
  let nodeDetails = '';
  let selectedKey = '';
  let loadingNode = false;
  let nodeList = [];
  let checking = false;
  let checked = false;

  // btc-only state
  let loading = false;
  let testnet = false;

  const dispatch = new createEventDispatcher();

  const toastStyle =
    'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);';

  $: placeholder = kind === 'btc' ? 'ssl://host:port' : 'Enter url & port';
  $: busy = kind === 'btc' ? loading : $node.loading;
  $: autoBusy = kind === 'btc' ? loading : loadingNode;
  $: onlineCount = nodeList.filter((n) => n.online === true).length;

  const keyOf = (n) => (kind === 'btc' ? n.url : `${n.url}:${n.port}`);

  onMount(async () => {
    if (kind === 'btc') {
      const net = await window.api.invoke('get-swap-network').catch(() => null);
      testnet = !!(net && net.testnet);

      const cur = await window.api.invoke('get-btc-node').catch(() => null);
      selectedKey = (cur && cur.url) || '';
      nodeInput = selectedKey;

      nodeList = await getBtcNodeList(testnet);
      return;
    }

    if ($node.selectedNode) {
      const { url, port, ssl } = $node.selectedNode;
      nodeInput = `${ssl ? 'https' : 'http'}://${url}:${port}`;
      selectedKey = `${url}:${port}`;
    }

    nodeList = await getNodeList();
  });

  // ---- shared --------------------------------------------------------------

  const rank = (n) => (n.online === true ? 0 : n.online === false ? 2 : 1);

  const pick = (n) => (kind === 'btc' ? chooseBtcNode(n) : chooseNode(n));

  const auto = () => (kind === 'btc' ? applyBtcNode('') : randomNode());

  const connectTo = () => {
    if (kind === 'btc') {
      const url = nodeInput.trim();
      if (url) applyBtcNode(url);
      return;
    }
    connectToXkr();
  };

  const probe = (n) => (kind === 'btc' ? probeBtc(n) : probeXkr(n));

  const checkNodes = async () => {
    checking = true;
    nodeList.forEach((n) => {
      n.checking = true;
      n.online = undefined;
    });
    nodeList = nodeList;
    await Promise.all(
      nodeList.map(async (n) => {
        n.online = await probe(n);
        n.checking = false;
        nodeList = [...nodeList].sort((a, b) => rank(a) - rank(b));
      }),
    );
    checking = false;
    checked = true;
  };

  const back = () => {
    $node.loading = false;
    dispatch('back');
  };

  // ---- XKR -----------------------------------------------------------------

  const xkrUrl = (n) => `${n.ssl ? 'https://' : 'http://'}${n.url}:${n.port}/info`;

  const probeXkr = (n) =>
    fetch(xkrUrl(n), { method: 'GET', signal: AbortSignal.timeout(5000) })
      .then(() => true)
      .catch(() => false);

  const connectToXkr = () => {
    $node.loading = true;
    let input = nodeInput;
    if (input.startsWith('http://')) {
      input = input.replace(/(^\w+:|^)\/\//, '');
      nodeDetails = {
        url: input.split(':')[0] ?? input,
        port: parseInt(input.split(':')[1]) ?? '',
        ssl: false,
      };
    } else if (input.startsWith('https://')) {
      input = input.replace(/(^\w+:|^)\/\//, '');
      nodeDetails = {
        url: input.split(':')[0] ?? input,
        port: parseInt(input.split(':')[1]) ?? '',
        ssl: true,
      };
    } else {
      const thisNode = nodeList.find((a) => a.url === input.split(':')[0] && a.port === parseInt(input.split(':')[1]));
      if (!thisNode) {
        window.api.errorMessage('Add http/https to your link');
        $node.loading = false;
        return;
      }
      nodeDetails = {
        url: thisNode.url,
        port: parseInt(thisNode.port),
        ssl: thisNode.ssl,
      };
    }

    dispatch('connect', {
      node: nodeDetails,
    });
    $node.selectedNode = nodeDetails;
  };

  const chooseNode = async (picked) => {
    $node.loading = true;
    nodeInput = `${picked.url}:${picked.port}`;
    selectedKey = keyOf(picked);
    const listed = nodeList.find((a) => keyOf(a) === selectedKey) || picked;
    listed.online = await probeXkr(picked);
    nodeList = nodeList;
    $node.loading = false;
  };

  const getNodeList = async () => {
    let nodes = await fetch('https://raw.githubusercontent.com/kryptokrona/kryptokrona-public-nodes/main/nodes.json');
    nodes = await nodes.json();
    return nodes.nodes;
  };

  const randomNode = async () => {
    loadingNode = true;
    try {
      const nodes = await getNodeList();
      for (const ssl of [true, false]) {
        const candidates = nodes.filter((n) => !!n.ssl === ssl).sort(() => 0.5 - Math.random());
        for (const candidate of candidates) {
          if (await probeXkr(candidate)) {
            const listed = nodeList.find((a) => keyOf(a) === keyOf(candidate));
            await chooseNode(listed || candidate);
            return;
          }
        }
      }
      toast.error('No reachable node found', { position: 'top-right', style: toastStyle });
    } catch (e) {
      toast.error('Could not load the node list', { position: 'top-right', style: toastStyle });
    } finally {
      loadingNode = false;
    }
  };

  // ---- BTC -----------------------------------------------------------------

  // Electrum servers.json is { host: { s: sslPort, t: tcpPort } }. Prefer SSL.
  const normalizeElectrum = (servers) => {
    const nodes = [];
    for (const [host, info] of Object.entries(servers || {})) {
      if (info && info.s) nodes.push({ name: host, url: `ssl://${host}:${info.s}` });
      else if (info && info.t) nodes.push({ name: host, url: `tcp://${host}:${info.t}` });
    }
    return nodes;
  };

  const getBtcNodeList = async (isTestnet) => {
    const net = isTestnet ? 'testnet' : 'mainnet';
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/spesmilo/electrum/master/electrum/chains/${net}/servers.json`,
      );
      if (!res.ok) throw new Error('fetch failed');
      return normalizeElectrum(await res.json());
    } catch (e) {
      try {
        const res = await fetch(`${base}/offline-nodes/btc-${net}.json`);
        return (await res.json()).nodes || [];
      } catch (_) {
        return [];
      }
    }
  };

  const probeBtc = (n) => window.api.invoke('check-btc-node', n.url).catch(() => false);

  const applyBtcNode = async (url) => {
    loading = true;
    const res = await window.api.invoke('set-btc-node', url).catch((e) => ({ ok: false, error: e.message }));
    loading = false;
    if (res && res.ok) {
      selectedKey = url;
      toast.success(url ? 'Bitcoin node set — reconnecting…' : 'Using automatic node selection', {
        position: 'top-right',
        style: toastStyle,
      });
      dispatch('done', { url });
    } else {
      toast.error(`Couldn't set Bitcoin node${res && res.error ? ': ' + res.error : ''}`, {
        position: 'top-right',
        style: toastStyle,
      });
    }
  };

  const chooseBtcNode = async (picked) => {
    nodeInput = picked.url;
    selectedKey = picked.url;
    picked.online = await probeBtc(picked);
    nodeList = nodeList;
  };
</script>

<section in:fade>
  <div class="head">
    {#if showBack}
      <button class="back" on:click={back}>← Back</button>
    {/if}
    <h2>{kind === 'btc' ? 'Pick a Bitcoin node' : 'Pick a node'}</h2>
  </div>

  <div class="field">
    <input placeholder={placeholder} type="text" spellcheck="false" bind:value={nodeInput} />
    <button style="margin-right: 0.25rem" on:click={auto}>
      {#if autoBusy}
        <Moon color="#ffffff" size="20" unit="px" />
      {:else}
        <Auto />
      {/if}
    </button>
    <button disabled={busy} on:click={connectTo}>
      {#if busy}
        <Moon color="#ffffff" size="20" unit="px" />
      {:else}
        <ArrowRight green={nodeInput} />
      {/if}
    </button>
  </div>

  <div class="card">
    <div class="header">
      <h5>Nodes</h5>
      {#if checked && !checking}
        <span class="count">{onlineCount} of {nodeList.length} online</span>
      {:else}
        <span class="count">{nodeList.length}</span>
      {/if}
    </div>
    <div class="list">
      {#each nodeList as n (keyOf(n))}
        <div
          class="row"
          class:selected={selectedKey === keyOf(n)}
          role="button"
          tabindex="0"
          on:click={() => pick(n)}
          on:keydown={(e) => e.key === 'Enter' && pick(n)}
          animate:flip={{ duration: 300 }}
        >
          <span class="name">{n.name}</span>
          {#if n.checking}
            <span class="status checking"><i />Checking</span>
          {:else if n.online === true}
            <span class="status online"><i />Online</span>
          {:else if n.online === false}
            <span class="status offline"><i />Offline</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="actions">
    <Button
      text={autoBusy ? 'Choosing…' : 'Choose automatically'}
      disabled={autoBusy}
      on:click={auto}
      width="175"
      height="36"
    />
    <Button
      text={checking ? 'Checking…' : 'Check availability'}
      disabled={checking}
      on:click={checkNodes}
      width="155"
      height="36"
    />
  </div>
</section>

<style lang="scss">
  section {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 1.5rem;
    width: min(500px, 100%);
  }

  .head {
    display: flex;
    align-items: center;
    align-self: stretch;
    justify-content: center;
    position: relative;

    .back {
      position: absolute;
      left: 0;
      background: transparent;
      border: none;
      color: var(--text-color);
      cursor: pointer;
      font-size: 0.85rem;
      opacity: 0.8;
    }
  }

  .card {
    align-self: stretch;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    height: 300px;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px;
      border-bottom: 1px solid var(--border-color);

      h5 {
        margin: 0;
      }

      .count {
        font-size: 0.75rem;
        opacity: 0.6;
      }
    }

    .list {
      flex: 1;
      overflow-y: auto;
    }
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    opacity: 0.8;
    cursor: pointer;
    padding: 5px 15px;
    border-bottom: 1px solid var(--border-color);

    &:hover {
      opacity: 1;
    }

    &.selected {
      opacity: 1;
      color: var(--primary-color);
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    font-size: 0.7rem;
    color: var(--text-color);
    opacity: 0.85;

    i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }

    &.online i {
      background: var(--success-color);
      box-shadow: 0 0 6px var(--success-color);
    }

    &.offline i {
      background: var(--alert-color);
    }

    &.checking {
      opacity: 0.5;

      i {
        animation: pulse 1s ease-in-out infinite;
      }
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 1;
    }
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .field {
    z-index: 99;
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    padding: 0 6px 0 10px;
    background-color: var(--card-background);
    border: 1px solid var(--card-border);
    border-radius: 8px;
    transition: 100ms ease-in-out;

    &:focus-within {
      border: 1px solid #404040;
    }

    input {
      margin: 0 auto;
      flex: 1;
      min-width: 0;
      height: 48px;
      transition: 200ms ease-in-out;
      color: var(--text-color);
      background-color: transparent;
      border: none;
      font-size: 1.1rem;

      &:focus {
        outline: none;
      }
    }

    button {
      border: none;
      background-color: #252525;
      height: 36px;
      width: 48px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
      cursor: pointer;
      transition: 100ms ease-in-out;

      &:hover {
        background: #303030;
      }
    }
  }
</style>
