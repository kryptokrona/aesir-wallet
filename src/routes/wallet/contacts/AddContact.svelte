<script>
  import { fade, fly } from "svelte/transition";
  import Button from "$lib/components/buttons/Button.svelte";
  import { user } from "$lib/stores/user";
  import toast from "svelte-french-toast";

  let open;
  let username;
  let address;
  let step = 1;

  const keyDown = (e) => {
    if (e.key === "Enter" && username.length > 0) {
      if (step === 1) {
        step++;
      } else save();
    } else if (e.key === "Escape") {
      close();
    }
  };

  const save = async () => {
    if (username && address) {
      if ($user.contacts.some(x => x.address === address)) {
        toast.error("Already added", {
          position: "top-right",
          style: "border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);"
        });
        close();
      } else {
        $user.contacts = await window.api.saveContact(username, address);
        toast.success("Added contact", {
          position: "top-right",
          style: "border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);"
        });
        close();
      }
    } else {
      toast.error("Field empty", {
        position: "top-right",
        style: "border-radius: 5px; background: var(--toast-bg-color); border: 1px solid var(--toast-b-color); color: var(--toast-text-color);"
      });
      close();
    }
  };

  const close = () => {
    step = 1;
    username = "";
    address = "";
    open = false;
  };

</script>

<svelte:window on:keyup|preventDefault="{keyDown}" />


<Button on:click="{() => (open = true)}" text="Add" />


{#if open === true}
  <div
    on:click|self="{close}"
    in:fade="{{ duration: 100 }}"
    out:fade="{{ duration: 100 }}"
    class="backdrop"
  >
    <div in:fly="{{ y: 20 }}" out:fly="{{ y: -50 }}" class="field">
      {#if step === 1}
        <input
          autofocus
          placeholder="Enter nickname"
          type="text"
          spellcheck="false"
          autocomplete="false"
          bind:value="{username}"
        />
      {:else if step === 2}
        <input in:fly="{{ y: 20 }}"
               autofocus
               placeholder="Enter address"
               type="text"
               spellcheck="false"
               autocomplete="false"
               bind:value="{address}"
        />
      {/if}
      <div style="width: 100px">
        <Button
          on:click="{() => {(step === 1) ? step++ : save() }}"
          enabled="{username}"
          disabled="{false}"
          text={step === 1 ? 'Next' : 'Add'}
        />
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: absolute;
    padding: 0 0 0 0.5rem;
    background-color: var(--card-background);
    border: 1px solid var(--card-border);
    border-radius: 0.4rem;
  }

  input {
    margin: 0 auto;
    width: 100%;
    height: 50px;
    transition: 200ms ease-in-out;
    color: var(--text-color);
    background-color: transparent;
    border: none;
    font-size: 1.1rem;

    &:focus {
      outline: none;
      border: none;
    }
  }

  .backdrop {
    position: fixed;
    display: flex;
    justify-content: center;
    align-items: center;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    background-color: var(--backdrop-color);
    backdrop-filter: blur(8px);
    z-index: 103;
    border-radius: 15px;
  }
</style>
