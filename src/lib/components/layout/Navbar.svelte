<script>
  import { fade } from 'svelte/transition';
  import Dashboard from '$lib/components/icons/Navbar/Dashboard.svelte';
  import Send from '$lib/components/icons/Navbar/Send.svelte';
  import Wallets from '$lib/components/icons/Navbar/Wallets.svelte';
  import Transactions from '$lib/components/icons/Navbar/Transactions.svelte';
  import Settings from '$lib/components/icons/Navbar/Settings.svelte';
  import Logout from '$lib/components/icons/Navbar/Logout.svelte';
  import { goto } from '$app/navigation';
  import Logo from '$lib/components/icons/Logo.svelte';
  import Contacts from '$lib/components/icons/Navbar/Contacts.svelte';
  import Tooltip from '../Tooltip.svelte';
</script>

<nav in:fade>
  <div>
    <Tooltip title="Dashboard" stylized={true}>
      <button on:click={() => goto('/wallet/dashboard')}>
        <Dashboard />
      </button>
    </Tooltip>
    <Tooltip title="Send" stylized={true}>
      <button on:click={() => goto('/wallet/send')}>
        <Send />
      </button>
    </Tooltip>
    <Tooltip title="Contacts" stylized={true}>
      <button on:click={() => goto('/wallet/contacts')}>
        <Contacts />
      </button>
    </Tooltip>
    <Tooltip title="Recieve" stylized={true}>
      <button on:click={() => goto('/wallet/receive')}>
        <Wallets />
      </button>
    </Tooltip>
    <Tooltip title="History" stylized={true}>
      <button on:click={() => goto('/wallet/history')}>
        <Transactions />
      </button>
    </Tooltip>
  </div>

  <div class="draggable drag" />

  <div>
    <Tooltip title="Settings" stylized={true}>
      <button on:click={() => goto('/wallet/settings/general')}>
        <Settings />
      </button>
    </Tooltip>
    <Tooltip title="Logout" stylized={true}>
      <button on:click={() => goto('/auth/login-wallet')}>
        <Logout />
      </button>
    </Tooltip>
    <Tooltip title="Wallet backup" stylized={true}>
      <button on:click={() => goto('/auth/backup-wallet')}>
        <Logo size="22" />
      </button>
    </Tooltip>
  </div>
</nav>

<style lang="scss">
  nav {
    width: 80px;
    height: 100vh;
    padding-top: 3rem;
    padding-bottom: 1rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    border-right: 1px solid var(--border-color);

    div {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      button {
        width: 3rem;
        height: 3rem;
        background-color: transparent;
        border: none;
        transition: 150ms ease-in-out;
        border-radius: 8px;

        &:hover {
          background-color: var(--button-hover-bg-color);
          cursor: pointer;
        }
      }
    }
  }

  .drag {
    height: 100%;
    width: 100%;
    cursor: grab;
  }
</style>
