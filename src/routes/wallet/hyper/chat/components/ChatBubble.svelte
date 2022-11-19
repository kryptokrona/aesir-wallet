<script>
  export let data;
  const { nickname, message } = data;
</script>

<div class="bubble">
  <h4>{nickname}</h4>
  <p>{message}</p>
</div>

<style lang="scss">

  .bubble {
    width: 100%;
    border-top: 1px solid var(--border-color);
    padding: 1rem 2rem;

    p {
      margin: 0;
    }

    h4 {
      margin-bottom: 5px;
    }
  }
</style>