<script>
  import { qr } from "headless-qr";
  import { fade, fly } from "svelte/transition";

  export let address = "";
  export let label = "";
  export let onClose = () => {};

  // headless-qr returns a square matrix of booleans (true = dark module).
  // We render it as a single SVG path so it stays crisp at any size and needs
  // no canvas. QR codes scan most reliably as dark-on-white, so the code itself
  // is always black on white regardless of the app theme; the surrounding card
  // follows the theme.
  const QUIET = 4; // quiet-zone modules required around a QR code

  $: matrix = address ? qr(address) : [];
  $: size = matrix.length;
  $: dim = size + QUIET * 2;
  $: cells = buildCells(matrix);

  function buildCells(m) {
    const out = [];
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (m[y][x]) out.push({ x: x + QUIET, y: y + QUIET });
      }
    }
    return out;
  }
</script>

<div class="backdrop" on:click={onClose} transition:fade={{ duration: 120 }}>
  <div class="card" on:click|stopPropagation in:fly={{ y: 30 }}>
    {#if label}
      <span class="label">{label}</span>
    {/if}
    <div class="qr">
      <svg viewBox="0 0 {dim} {dim}" width="240" height="240" shape-rendering="crispEdges" role="img" aria-label="QR code">
        <rect width={dim} height={dim} fill="#ffffff" />
        {#each cells as c}
          <rect x={c.x} y={c.y} width="1" height="1" fill="#000000" />
        {/each}
      </svg>
    </div>
    <p class="addr">{address}</p>
  </div>
</div>

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--backdrop-color, rgba(0, 0, 0, 0.6));
    z-index: 200;
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    max-width: 320px;
    padding: 1.5rem;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background-color: var(--component-background, var(--background-color));
  }

  .label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
  }

  .qr {
    padding: 12px;
    background: #ffffff;
    border-radius: 8px;
    line-height: 0;
  }

  .addr {
    margin: 0;
    font-family: "Fira Mono", ui-monospace, monospace;
    font-size: 0.72rem;
    word-break: break-all;
    text-align: center;
    opacity: 0.85;
  }
</style>
