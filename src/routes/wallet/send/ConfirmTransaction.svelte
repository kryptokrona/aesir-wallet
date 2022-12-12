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
  </div>


<style lang="scss">

  .wrapper {
    padding: 1rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>