<script>
    import {fade} from 'svelte/transition'
    import {createEventDispatcher} from 'svelte'
    import ArrowRight from "$lib/components/icons/ArrowRight.svelte";

    let nodeInput = ''
    let nodeDetails = ''
    let selectedNode

    const nodeList = [
        {name: 'blocksum', url: 'blocksum.org', port: 11898},
        {name: 'götapool', url: 'blocksum.org', port: 11898}
    ]

    const dispatch = new createEventDispatcher()

    const back = () => {
        dispatch('back')
    }

    const connectTo = () => {
        dispatch('connect', {
            node: nodeDetails,
        })
        nodeInput = ''
        selectedNode = ''
    }

    function chooseNode(node, i) {
        nodeInput = `${node.url}:${node.port}`
        nodeDetails = node
        selectedNode = i
    }

    const empty = () => {
        nodeInput = ''
    }
</script>

<div in:fade class="wrapper">
    <h1>Pick a node</h1>
    <div class="field">
        <input placeholder="Enter url & port" type="text" spellcheck="false" autofocus bind:value={nodeInput}/>
        <button on:click={connectTo}>
            <ArrowRight green={nodeInput}/>
        </button>
    </div>
    <div class="node-list">
        {#each nodeList as node, i}
            <div
                    class="node-card"
                    class:selected="{selectedNode === i}"
                    on:click="{() => {
                   chooseNode(node, i)
                }}"
            >
                <p id="node">{node.name}</p>
            </div>
        {/each}
    </div>
</div>

<style lang="scss">
  .wrapper {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    justify-content: center;
    align-items: center;
    max-width: 840px;
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

    p {
      margin: 0;
      font-size: 0.75rem;
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
