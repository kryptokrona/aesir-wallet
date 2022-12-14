<script>
  import { wallet } from "$lib/stores/wallet.js";

  const sendTransaction = async () => {
    const sent = await window.api.sendTransaction($wallet.preparedTransaction.hash);
  };

  const deleteTransaction = async () => {
    const deleted = await window.api.deleteTransaction($wallet.preparedTransaction.hash);
  };

</script>


  <div class="wrapper">
    <h2>prepared</h2>
    <button on:click={sendTransaction}>send</button>
    <button on:click={deleteTransaction}>delete</button>
  </div>


<style lang="scss">

  .wrapper {
    padding: 1rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100% - 260px);
    width: 100%;
  }
</style>