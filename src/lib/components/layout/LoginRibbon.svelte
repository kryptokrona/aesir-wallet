<script>
  // Decorative background for the login screen: diagonal "ribbons" of the
  // Kryptokrona logo, spaced out and tiled edge-to-edge, each line drifting the
  // opposite way to its neighbours at a slightly different opacity so the whole
  // field reads like layered ribbons.
  //
  // The logos are tinted with the theme's highlight colour (see .logo below),
  // so the same mask works on every theme.
  import { onMount, onDestroy } from 'svelte';

  export let angle = 40; // tilt in degrees
  export let logoWidth = 128; // px
  export let gapX = -10; // px of empty space between logos on a line

  const LOGO_RATIO = 54 / 176;
  const rowHeight = Math.round(logoWidth * LOGO_RATIO);
  const pitch = rowHeight + 52; // vertical distance between ribbon centres
  const cell = logoWidth + gapX; // one logo + its trailing gap

  let cols = 30;
  let rows = 30;
  // px width of one repeating half; scrolling by exactly this loops seamlessly.
  $: half = cols * cell;

  const sizeToViewport = () => {
    // The field is a 220vmax square rotated behind the form; cover it fully.
    const field = 4 * Math.max(window.innerWidth, window.innerHeight);
    cols = Math.ceil(field / cell) + 2;
    rows = Math.ceil(field / pitch) + 1;
  };

  onMount(() => {
    sizeToViewport();
    window.addEventListener('resize', sizeToViewport);
  });
  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', sizeToViewport);
  });

  // A gentle sine wave of opacities gives the layered-ribbon look; each row
  // also drifts against its neighbour at a slightly different speed.
  $: lines = Array.from({ length: rows }, (_, i) => ({
    opacity: 0.05 + 0.06 * (0.5 + 0.5 * Math.sin(-i * 0.7)),
    reverse: i % 2 === 1,
    duration: (120 + (i % 5) * 0.4) * (cell / 20), // px/s roughly constant
  }));
</script>

<div class="ribbon" aria-hidden="true">
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

<style lang="scss">
  .ribbon {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    border-radius: 15px;
  }

  // Oversized, centred and rotated so the tilted rows still cover every corner.
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

  // The logo is drawn as a mask so it can be painted in the theme's highlight
  // colour (an <img> would render the SVG's own fill and can't be tinted).
  .logo {
    height: var(--h);
    flex: none;
    display: block;
    background-color: var(--text-color);
    -webkit-mask: url(/logo.svg) no-repeat center / 100% 100%;
    mask: url(/logo.svg) no-repeat center / 100% 100%;
    user-select: none;
  }

  // One repeating half of travel per cycle keeps the loop perfectly seamless.
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
