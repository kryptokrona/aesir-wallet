<script>
  export let text;
  export let width = 'auto';
  export let height = 'auto';
  export let rounded = false;
  export let wUnit;
  export let hUnit;
  export let active;
  export let highlight = false;
  export let disabled = false;
</script>

<button
  on:click
  {disabled}
  style="width: {width}{wUnit ? wUnit : 'px'}; height: {height}{hUnit ? hUnit : 'px'}"
  class:rounded
  class:active
  class:highlight
>
  {text}
  <slot />
</button>

<style lang="scss">
  button {
    height: 30px;
    grid-column: span 1 / span 1;
    border: 1px solid var(--button-b-color);
    background-color: var(--button-bg-color);
    color: var(--button-text-color);
    font-weight: 600;
    border-radius: 0.25rem;
    padding: 0 15px 0 15px;
    cursor: pointer;
    text-align: center;
    transition: 150ms ease-in-out;
    backdrop-filter: blur(7px);

    &:hover {
      background: var(--button-hover-bg-color);
      color: var(--button-hover-text-color);
    }
  }

  .rounded {
    border-radius: 100px;
  }

  .active {
    background-color: var(--button-hover-bg-color);
  }

  .highlight {
    background-color: var(--primary-color);
    border-color: var(--primary-color);
    color: var(--backgound-color);

    &:hover {
      background: var(--primary-color);
      color: var(--backgound-color);
      opacity: 0.9;
    }
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;

    &:hover {
      background-color: var(--button-bg-color);
      color: var(--button-text-color);
    }

    &.highlight:hover {
      background-color: var(--primary-color);
      color: var(--backgound-color);
    }
  }
</style>
