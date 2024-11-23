<script>
  import { fade, fly } from 'svelte/transition';
  import toast from 'svelte-french-toast';
  import { onMount } from 'svelte';
  import { wordlist } from '$lib/stores/wordlist.js';
  import { Moon } from 'svelte-loading-spinners';
  import ArrowRight from '$lib/components/icons/ArrowRight.svelte';
  import { goto } from '$app/navigation';
  import Backward from '$lib/components/icons/Backward.svelte';
  import NodeSelector from '$lib/components/NodeSelector.svelte';
  import { node } from '$lib/stores/node.js';

  let step = 1;
  let seedWordsStr;
  let seedWordsArray = Array(25).fill('');
  let inputs;

  let loading;
  let password = '';
  let blockHeight;
  let walletName = '';

  onMount(() => {
    inputs = document.querySelectorAll('input');
    inputs[0].focus();
  });

  const paste = async () => {
    seedWordsArray = Array(25).fill('');
    seedWordsStr = await navigator.clipboard.readText();
    let arr = seedWordsStr.split(' ');
    arr = arr.filter((e) => {
      return e;
    });

    if (arr.length === 25) {
      seedWordsArray = arr;
      seedWordsStr = arr.join(' ');
      toast.success('Pasted', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    } else {
      toast.error('Error', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    }
  };

  const importSeed = async (e, selectedNode = e.detail.node) => {
    $node.selectedNode = selectedNode;
    loading = true;

    //If you manually enter the words
    if (seedWordsStr === undefined) {
      seedWordsStr = seedWordsArray.join(' ');
    }
    console.log(seedWordsStr, walletName, password, parseInt(blockHeight), selectedNode);
    const walletImport = await window.api.importSeed(
      seedWordsStr,
      walletName,
      password,
      parseInt(blockHeight),
      selectedNode,
    );
    if (walletImport) await goto('/');
    seedWordsStr = '';
    walletName = '';
    blockHeight = '';
    if (!(await window.api.checkNode(selectedNode))) {
      $node.loading = false;
      toast.error('Cannot connect to node.', {
        position: 'top-right',
        style:
          'border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);',
      });
    }
    loading = false;
  };

  let meta;
  let ctrl;

  const keyDown = (e) => {
    if (e.key === 'Meta') meta = true;
    if (e.key === 'v' && meta) paste();
  };
  const keyUp = () => {
    ctrl = false;
    meta = false;
  };
</script>

<svelte:window on:keydown={keyDown} on:keyup={keyUp} />

{#if step === 1}
  <section in:fade>
    <h1>Import seed</h1>
    <div class="grid">
      {#each seedWordsArray ?? [] as word, i}
        <div style="display: flex; flex-direction: column; align-items: center">
          <p style="margin-bottom: 5px">{i + 1}</p>
          <input
            id={i}
            class="card"
            class:correct={wordlist.includes(seedWordsArray[i])}
            bind:value={seedWordsArray[i]}
            on:input={(e) => {
              if (wordlist.includes(seedWordsArray[i])) inputs[i + 1].focus();
              if (!e.target.value) inputs[i - 1].focus();
            }}
          />
        </div>
      {/each}
      <button class="card" on:click={() => goto('/auth/create-wallet')}>Back</button>
      <button class="card" on:click={paste}>Paste</button>
      <button class="card" on:click={() => step++}>Next</button>
    </div>
  </section>
{:else if step === 2}
  <section>
    <h1>Name wallet</h1>
    <div class="field">
      <input in:fly={{ y: 20 }} placeholder="Name.." type="text" bind:value={walletName} />
      <button on:click on:click={() => step++}>
        {#if loading}
          <Moon color="#ffffff" size="20" unit="px" />
        {:else}
          <ArrowRight green={walletName.length >= 3} />
        {/if}
      </button>
    </div>
    <div
      style="margin-top: 2rem"
      in:fade
      on:click={() => {
        if (step > 1) step--;
      }}
    >
      <Backward />
    </div>
  </section>
{:else if step === 3}
  <section>
    <h1>Create password</h1>
    <div class="field">
      <input in:fly={{ y: 20 }} placeholder="Password.." type="password" bind:value={password} />
      <button on:click on:click={() => step++}>
        {#if loading}
          <Moon color="#ffffff" size="20" unit="px" />
        {:else}
          <ArrowRight green={password.length >= 3} />
        {/if}
      </button>
    </div>
    <div
      style="margin-top: 2rem"
      in:fade
      on:click={() => {
        if (step > 1) step--;
      }}
    >
      <Backward />
    </div>
  </section>
{:else if step === 4}
  <section>
    <h1>Scan from block height</h1>
    <div class="field">
      <input in:fly={{ y: 20 }} placeholder="Block height" type="text" bind:value={blockHeight} />
      <button on:click={() => step++}>
        {#if loading}
          <Moon color="#ffffff" size="20" unit="px" />
        {:else}
          <ArrowRight green={blockHeight >= 0} />
        {/if}
      </button>
    </div>
    <div
      style="margin-top: 2rem"
      in:fade
      on:click={() => {
        if (step > 1) step--;
      }}
    >
      <Backward />
    </div>
  </section>
{:else if step === 5}
  <section>
    <NodeSelector on:connect={(e) => importSeed(e)} />
    <div
      style="margin-top: 2rem"
      in:fade
      on:click={() => {
        if (step > 1) step--;
      }}
    >
      <Backward />
    </div>
  </section>
{/if}

<style lang="scss">
  section {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
    padding: 4rem;
    gap: 2rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-gap: 1rem;
  }

  .card {
    height: 35px;
    width: 100%;
    min-width: 100px;
    grid-column: span 1 / span 1;
    border: 1px solid var(--card-border);
    padding: 0.55rem 1rem;
    border-radius: 0.4rem;
    cursor: pointer;
    text-align: center;
    align-self: end;
  }

  p {
    font-size: 13px;
    margin: 0;
  }

  button {
    background-color: var(--card-background);
    color: var(--title-color);
    font-weight: 600;
  }

  .correct {
    border: 1px solid var(--success-color) !important;
  }

  input {
    &:focus {
      outline: none;
      border: 1px solid var(--text-color);
    }
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
      width: 200px;
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
