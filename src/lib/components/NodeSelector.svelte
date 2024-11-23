<script>
  import { fade } from 'svelte/transition';
  import { createEventDispatcher, onMount } from 'svelte';
  import ArrowRight from '$lib/components/icons/ArrowRight.svelte';
  import { node } from '$lib/stores/node.js';
  import Auto from '$lib/components/icons/Auto.svelte';
  import { Moon } from 'svelte-loading-spinners';
  import Button from '$lib/components/buttons/Button.svelte';

  let nodeInput = '';
  let nodeDetails = '';
  let selectedNode;
  let loadingNode;
  let nodeList = [];

  onMount(async () => {
    if ($node.selectedNode) {
      if ($node.selectedNode.ssl) {
        nodeInput = `https://${$node.selectedNode.url}:${$node.selectedNode.port}`;
      } else {
        nodeInput = `http://${$node.selectedNode.url}:${$node.selectedNode.port}`;
      }
    } else {
      nodeInput = '';
      selectedNode = '';
    }

    nodeList = await getNodeList();
    console.log(nodeList);
  });

  const dispatch = new createEventDispatcher();

  const back = () => {
    $node.loading = false;
    dispatch('back');
  };

  const connectTo = () => {
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

  const chooseNode = async (pickedNode, i) => {
    console.log('Indexxx', i);
    $node.loading = true;
    nodeInput = `${pickedNode.url}:${pickedNode.port}`;
    selectedNode = i;
    await checkNode(pickedNode);
    $node.loading = false;
  };

  const getNodeList = async () => {
    let nodes = await fetch('https://raw.githubusercontent.com/kryptokrona/kryptokrona-public-nodes/main/nodes.json');
    nodes = await nodes.json();
    nodes = nodes.nodes;
    return nodes;
  };

  const randomNode = async (ssl = true) => {
    loadingNode = true;
    let recommended_node = undefined;

    let nodes = await getNodeList();

    let node_requests = [];
    let ssl_nodes = [];
    if (ssl) {
      ssl_nodes = nodes.filter((node) => {
        return node.ssl;
      });
    } else {
      ssl_nodes = nodes.filter((node) => {
        return !node.ssl;
      });
    }

    ssl_nodes = ssl_nodes.sort((a, b) => 0.5 - Math.random());

    for (let n = 0; n < ssl_nodes.length; n++) {
      let this_node = ssl_nodes[n];

      let nodeURL = `${this_node.ssl ? 'https://' : 'http://'}${this_node.url}:${this_node.port}/info`;
      try {
        const resp = await fetch(
          nodeURL,
          {
            method: 'GET',
          },
          1000,
        );

        if (resp.ok) {
          loadingNode = false;
          console.log('indexz', nodeList.indexOf(this_node));
          const nodeIndex = nodeList.find((a) => a.url === this_node.url && a.ssl === this_node.ssl);
          chooseNode(this_node, nodeList.indexOf(nodeIndex));

          return;
        }
      } catch (e) {
        console.log(e);
      }
    }

    if (recommended_node === undefined) {
      nodeInput = await randomNode(false);
    }
  };

  const checkNodes = async () => {
    // Create an array to store all fetch promises
    const fetchPromises = [];

    for (const node of nodeList) {
      const nodeURL = `${node.ssl ? 'https://' : 'http://'}${node.url}:${node.port}/info`;
      const fetchPromise = fetch(nodeURL, { method: 'GET' })
        .then((response) => {
          node.online = true;
          nodeList = nodeList;
          // this.setState({
          //     nodes: Globals.daemons,
          //     forceUpdate: this.state.forceUpdate + 1,
          // });
        })
        .catch((error) => {
          // Handle errors here
          node.online = false;
          nodeList = nodeList;
          // this.setState({
          //     nodes: Globals.daemons,
          //     forceUpdate: this.state.forceUpdate + 1,
          // });
        });
      fetchPromises.push(fetchPromise);
    }

    // Wait for all fetch promises to resolve
    await Promise.all(fetchPromises);
    console.log(nodeList);
  };

  const checkNode = async (pickedNode) => {
    // Create an array to store all fetch promises
    const fetchPromises = [];

    const nodeURL = `${pickedNode.ssl ? 'https://' : 'http://'}${pickedNode.url}:${pickedNode.port}/info`;
    const fetchPromise = fetch(nodeURL, { method: 'GET' })
      .then((response) => {
        pickedNode.online = true;
        nodeList.some((a) => {
          if (a.url === pickedNode.url && a.ssl === pickedNode.ssl) a.online = true;
        });
        nodeList = nodeList;
      })
      .catch((error) => {
        node.online = false;
        nodeList.some((a) => {
          if (a.url === pickedNode.url && a.ssl === pickedNode.ssl) a.online = false;
        });
        nodeList = nodeList;
      });
    fetchPromises.push(fetchPromise);
    // Wait for all fetch promises to resolve
    await Promise.all(fetchPromises);
  };
</script>

<section in:fade>
  <h2>Pick a node</h2>
  <div class="field">
    <input placeholder="Enter url & port" type="text" spellcheck="false" autofocus bind:value={nodeInput} />
    <button style="margin-right: 0.25rem" on:click={randomNode}>
      {#if loadingNode}
        <Moon color="#ffffff" size="20" unit="px" />
      {:else}
        <Auto />
      {/if}
    </button>

    <button disabled={$node.loading} on:click={connectTo}>
      {#if $node.loading}
        <Moon color="#ffffff" size="20" unit="px" />
      {:else}
        <ArrowRight green={nodeInput} />
      {/if}
    </button>
  </div>
  <div class="node-list">
    {#each nodeList as node, i}
      <div
        class="node-card"
        class:selected={selectedNode === i}
        on:click={() => {
          chooseNode(node, i);
        }}
      >
        <p id="node">{node.name}</p>
        <span class="status" class:online={node.online === true} class:offline={node.online === false}>&nbsp;</span>
      </div>
    {/each}
  </div>
  <Button on:click={() => checkNodes()} text="Check availability" width="155" height="36" />
</section>

<style lang="scss">
  section {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    max-width: 500px;
  }

  .node-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .node-card {
    background-color: var(--card-background);
    border: 1px solid var(--card-border);
    padding: 0.55rem 1rem;
    border-radius: 0.4rem;
    cursor: pointer;
    position: relative;

    p {
      margin: 0;
      font-size: 0.75rem;
    }

    .status {
      display: inline-block;
      background-color: rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      height: 6px;
      width: 6px;
      position: absolute;
      top: 5px;
      right: 5px;
    }

    .online {
      background-color: greenyellow;
    }

    .offline {
      background-color: red;
    }
  }

  .selected {
    border-color: var(--success-color);
    color: var(--title-color);
  }

  .button_wrapper {
    display: flex;
    gap: 1rem;
    width: 400px;
    justify-content: center;
  }

  .field {
    z-index: 99;
    display: flex;
    justify-content: space-between;
    align-items: center;
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
      width: 300px;
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
