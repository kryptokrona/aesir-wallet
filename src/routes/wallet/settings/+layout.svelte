<script>
  import Button from '$lib/components/buttons/Button.svelte';
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
</script>

<div class="header">
  <h3 in:fade>Settings</h3>
  <div in:fade>
    <Button
      text="Balance"
      on:click={() => goto('/wallet/settings/general')}
      active={$page.url.pathname === '/wallet/settings/general'}
    />
    <Button
      text="Node"
      on:click={() => goto('/wallet/settings/node')}
      active={$page.url.pathname === '/wallet/settings/node'}
    />
    <Button
      text="Wallet"
      on:click={() => goto('/wallet/settings/wallet')}
      active={$page.url.pathname === '/wallet/settings/wallet'}
    />
    <Button
      text="Themes"
      on:click={() => goto('/wallet/settings/themes')}
      active={$page.url.pathname === '/wallet/settings/themes'}
    />
  </div>
</div>
<div class="wrapper">
  <slot />
</div>

<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 60px;
    border-bottom: 1px solid var(--border-color);
    padding: 0 2rem 0 2rem;
  }

  .wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
  }
</style>
