<script>
  import { onMount } from "svelte"
  import { fade, fly } from "svelte/transition"
  import { goto } from "$app/navigation"
  import toast from "svelte-french-toast"
  import { wallet } from "$lib/stores/wallet.js"
  import { saveAs } from "file-saver"

  let step = 1
  let seedWords
  let seedWordsArray
  let randomNumbersArray = new Set()

  let checkArray = new Array(8).fill({ "word": "" })

  const toastStyle = {
    position: "top-right",
    style: "border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color)"
  }

  const checkAllWords = () => [...randomNumbersArray].every((num, i) => checkArray[i].word === seedWordsArray[num - 1])

  const validateAndProceed = () => {
    if (checkAllWords()) {
      toast.success("Success!", toastStyle)
      goto('/wallet/dashboard')
    } else {
      toast.error("Some words are incorrect. Please check and try again.", toastStyle)
    }
  }

  onMount(async () => {
    seedWords = await window.api.getSeed()
    seedWordsArray = seedWords.split(" ")
    while (randomNumbersArray.size < 8) {
      randomNumbersArray.add(Math.floor(Math.random() * 10) + 1)
    }
    randomNumbersArray = [...randomNumbersArray]
  })

  const copy = () => {
    navigator.clipboard.writeText(seedWords)
    toast.success("Copied", toastStyle)
  }

  const exportTxt = () => {
    const blob = new Blob([`Seed for wallet ${$wallet.currentWallet}: ${seedWords}`], { type: "text/plain" })
    saveAs(blob, `wallet-${$wallet.currentWallet}`)
  }
</script>


{#if step === 1}
  <section in:fade>
    <h1>Backup wallet</h1>
    <div class="grid">
      {#each seedWordsArray ?? [] as word, i}
        <div style="display: flex; flex-direction: column; align-items: center">
          <p style="margin-bottom: 5px">{i + 1}</p>
          <div class="card">
            <p in:fly={{y: 20, delay: i * 30}}>{word}</p>
          </div>
        </div>
      {/each}
      <button class="card" on:click={copy}>Copy</button>
      <button class="card" on:click={exportTxt}>Export</button>
      <button class="card" on:click={() => step++}>Next</button>
    </div>
  </section>
{:else if step === 2}
  <section in:fade>
    <h1>Verify backup</h1>
    <div class="grid">
      {#each randomNumbersArray ?? [] as number, i}
        <div style="display: flex; flex-direction: column; align-items: center">
          <p style="margin-bottom: 5px">{number}</p>
          <input id={i} class="card" class:correct={checkArray[i].word === seedWordsArray[number - 1]}
                 bind:value={checkArray[i].word}>
        </div>
      {/each}
      <button class="card" style="margin-top: 1rem" on:click={() => step--}>Back</button>
      <div />
      <button class="card" style="margin-top: 1rem" on:click={() => goto('/wallet/dashboard')}>Skip</button>
      <button class="card" style="margin-top: 1rem" on:click={validateAndProceed}>Check
      </button>
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
</style>
