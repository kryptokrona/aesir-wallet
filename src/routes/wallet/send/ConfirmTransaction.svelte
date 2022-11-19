<script>
  import { wallet } from "$lib/stores/wallet.js";

  const sendTransaction = async () => {
    const sent = await window.api.sendTransaction($wallet.preparedTransaction.hash)
  }

  const deleteTransaction = async () => {
    const deleted = await window.api.deleteTransaction($wallet.preparedTransaction.hash)
  }

</script>

<div>

</div>

<style lang="scss">

</style>