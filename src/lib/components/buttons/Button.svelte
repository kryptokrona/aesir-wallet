<script>
  export let text;
  export let width = "auto";
  export let height = "auto";
  export let rounded = false;
  export let wUnit;
  export let hUnit;
  export let active
</script>

<button on:click style="width: {width}{wUnit ? wUnit : 'px'}; height: {height}{hUnit ? hUnit : 'px'}" class:rounded class:active>
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
</style>