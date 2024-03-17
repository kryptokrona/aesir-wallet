<script lang="ts">
  import Logo from '$lib/components/icons/Logo.svelte';

  const setTheme = (theme: string) => {
    localStorage.setItem('themes', theme);
    document.documentElement.className = theme;
  };
</script>

<div class="wrapper">
  <div class="Box">
    <div class="card blue" on:click={() => setTheme('blue')}>
      <div class="header blue-header">
        <h3>I'm blue</h3>
      </div>
      <div style="margin: 15px 15px">
        <Logo size="50" color="#5a8bdb" />
      </div>
    </div>

    <div class="card dark" on:click={() => setTheme('dark')}>
      <div class="header dark-header">
        <h3>Hacker</h3>
      </div>
      <div style="margin: 15px 15px">
        <Logo size="50" color="#0eff6b" />
      </div>
    </div>

    <div class="card flashbang" on:click={() => setTheme('flashbang')}>
      <div class="header flashbang-header">
        <h3>Flashbang</h3>
      </div>
      <div style="margin: 20px 20px">
        <Logo size="50" color="#ff5e00" />
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .wrapper {
    width: 100%;
    height: 100%;
    padding: 30px;
  }

  .Box {
    display: flex;
    flex-direction: column;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-gap: 1rem;
  }

  .card {
    width: 100%;
    height: 145px;
    border: 1px solid red;
    border-radius: 5px;

    .header {
      display: flex;
      align-items: center;
      padding: 0 15px 0 15px;
      height: 40px;
    }
  }
  .card:hover {
    cursor: pointer;
    filter: brightness(1.3);
  }
  .blue {
    border: 1px solid var(--border-color);
    background-color: #1a1c23;
  }
  .blue-header {
    border-bottom: 1px solid var(--border-color);
  }
  .blue-header h3 {
    color: rgba(255, 255, 255, 1);
  }
  .dark {
    border: 1px solid var(--border-color);
    background-color: #121212;
  }
  .dark-header {
    border-bottom: 1px solid var(--border-color);
  }
  .dark-header h3 {
    color: rgba(255, 255, 255, 1);
  }

  .flashbang {
    border: 1px solid rgba(0, 0, 0, 0.2);
    background-color: #fcfcfc;
  }
  .flashbang-header {
    border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  }
  .flashbang-header h3 {
    color: rgba(0, 0, 0, 1);
  }
</style>
