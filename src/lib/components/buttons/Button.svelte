<script>
    export let text
    export let width = 'auto'
    export let height = 'auto'
</script>

<button on:click style="width: {width}px; height: {height}px">
    {text}
    <slot/>
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
</style>