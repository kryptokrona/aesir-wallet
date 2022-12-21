<script>
  import toast from "svelte-french-toast";
  import CopyButton from "$lib/components/icons/CopyButton.svelte";
  import AddContact from "./AddContact.svelte";
  import { onMount } from "svelte";
  import { user } from "$lib/stores/user.js";
  import Button from "$lib/components/buttons/Button.svelte";
  import { fade, fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import Trashcan from "$lib/components/icons/Trashcan.svelte";
  import { saveAs } from "file-saver";
  import { goto } from "$app/navigation";

  onMount(async () => {
    $user.contacts = await window.api.getContacts() ?? [];
  });

  const copy = address => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied", {
      position: "top-right",
      style: "border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);"
    });
  };

  const sendTo = (contact) => {
    goto(`/wallet/send?address=${contact}`)
  }

  const deleteContact = async (contact) => {
    $user.contacts = await window.api.deleteContact(contact);
  };

  const exportContacts = async () => {
    const blob = new Blob([JSON.stringify($user.contacts)], {
      type: "application/json"
    });
    await saveAs(blob, `yggdrasil-contacts`);
  };

  const importContacts = async () => {
    $user.contacts = await window.api.importContacts();
  };

  $: $user.contacts;
</script>

<div class="header">
  <h3 in:fade>Contacts</h3>
  <div in:fade>
    <Button text="Export" on:click={exportContacts} />
    <Button text="Import" on:click={importContacts} />
    <AddContact />
  </div>
</div>
<div class="list">
  {#each $user.contacts ?? [] as contact, i (contact.address)}
    <div class="row" animate:flip={{duration: 500}} in:fly={{y: 30, delay:  i * 50}}>
      <p style="color: var(--primary-color)" on:click={() => sendTo(contact.address)}>{contact.username}</p>
      <div style="display: inline-flex; gap: 0.5rem">
        <div on:click={() => deleteContact(contact)}>
          <Trashcan />
        </div>
        <div on:click={() => copy(contact.address)}>
          <CopyButton />
        </div>
      </div>
    </div>
  {/each}
</div>
<style lang="scss">
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 60px;
    border-bottom: 1px solid var(--border-color);
    padding: 0 2rem 0 2rem
  }

  .list {
    overflow-y: scroll;
    width: 100%;
    height: 100%;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2rem 0 2rem;
    border-bottom: 1px solid var(--border-color);
    height: 50px;

    &:last-child {
      border-bottom: none;
    }

    &:first-child {
      border-bottom: 1px solid var(--border-color);
    }
  }

</style>
