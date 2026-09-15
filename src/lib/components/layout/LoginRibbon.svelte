<script>
  import { onMount, onDestroy } from 'svelte';
  import { scale, blur } from 'svelte/transition';

  export let angle = 40;
  export let logoWidth = 128;
  export let gapX = -10;
  export let pinhole = true;
  export let pinholeX = '50%';
  export let pinholeY = '38%';
  export let pinholeInner = '18%';
  export let pinholeOuter = '42%';

  const LOGO_RATIO = 54 / 176;
  const rowHeight = Math.round(logoWidth * LOGO_RATIO);
  const pitch = rowHeight + 52;
  const cell = logoWidth + gapX;

  let cols = 30;
  let rows = 30;
  $: half = cols * cell;

  const sizeToViewport = () => {
    const field = 4 * Math.max(window.innerWidth, window.innerHeight);
    cols = Math.ceil(field / cell) + 2;
    rows = Math.ceil(field / pitch) + 1;
  };

  let mounted = false;
  onMount(() => {
    sizeToViewport();
    window.addEventListener('resize', sizeToViewport);
    mounted = true;
  });
  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', sizeToViewport);
  });

  $: lines = Array.from({ length: rows }, (_, i) => ({
    opacity: 0.05 + 0.06 * (0.5 + 0.5 * Math.sin(-i * 0.7)),
    reverse: i % 2 === 1,
    duration: (120 + (i % 5) * 0.4) * (cell / 20),
  }));

  $: mask = pinhole
    ? `radial-gradient(circle at ${pinholeX} ${pinholeY}, #000 ${pinholeInner}, transparent ${pinholeOuter})`
    : 'none';
</script>

{#if mounted}
  <div class="ribbon" in:blur out:scale aria-hidden="true" style="--mask: {mask};">
    <div class="field" style="--angle: {angle}deg; --pitch: {pitch}px; --half: {half}px;">
      {#each lines as line}
        <div class="row" style="--h: {rowHeight}px; --op: {line.opacity}; --dur: {line.duration}s;">
          <div class="track" class:reverse={line.reverse}>
            {#each Array(cols * 2) as _}
              <span class="logo" style="width: {logoWidth}px; margin-right: {gapX}px;" />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style lang="scss">
  .ribbon {
    position: absolute;
    top: 50%;
    left: 50%;
    width: var(--ribbon-w, min(520px, 88vw));
    height: var(--ribbon-h, min(500px, 74vh));
    transform: translate(-50%, -50%);
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    border-radius: 15px;
    -webkit-mask: var(--mask, none);
    mask: var(--mask, none);
  }

  .field {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 220vmax;
    height: 220vmax;
    transform: translate(-50%, -50%) rotate(calc(var(--angle) * -1));
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: calc(var(--pitch) - var(--h));
  }

  .row {
    height: var(--h);
    width: 100%;
    opacity: var(--op);
    overflow: hidden;
  }

  .track {
    display: flex;
    align-items: center;
    width: max-content;
    height: 100%;
    will-change: transform;
    animation: drift var(--dur) linear infinite;
  }
  .track.reverse {
    animation-name: drift-rev;
  }

  .logo {
    height: var(--h);
    flex: none;
    display: block;
    background-color: var(--text-color);
    -webkit-mask: url(/logo.svg) no-repeat center / 100% 100%;
    mask: url(/logo.svg) no-repeat center / 100% 100%;
    user-select: none;
  }

  @keyframes drift {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(calc(var(--half) * -1));
    }
  }
  @keyframes drift-rev {
    from {
      transform: translateX(calc(var(--half) * -1));
    }
    to {
      transform: translateX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .track {
      animation: none;
    }
  }
</style>
