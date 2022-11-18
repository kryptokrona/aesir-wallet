<script lang="ts">
  const setTheme = (theme: string) => {
    localStorage.setItem("theme", theme);
    document.documentElement.className = theme;
  };
</script>

<div class="wrapper">
  <div class="grid">

    <div class="card Midnight" on:click={() => setTheme('')}>
      <div class="header">
        <h3>Midnight</h3>
      </div>
    </div>

    <div class="card Blue" on:click={() => setTheme('blue')}>
      <div class="header">
        <h3>Blue</h3>
      </div>
    </div>

    <div class="card Dark" on:click={() => setTheme('dark')}>
      <div class="header">
        <h3>Dark</h3>
      </div>
    </div>

    <div class="card Hacker" on:click={() => setTheme('')}>
      <div class="header">
        <h3>Hacker</h3>
      </div>
    </div>

    <div class="card Flashbang" on:click={() => setTheme('')}>
      <div class="header">
        <h3>Flashbang</h3>
      </div>
    </div>

    <div class="card Idiot" on:click={() => setTheme('')}>
      <div class="header">
        <h3>Idiot</h3>
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

  .grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-gap: 1rem;
  }

  .card {
    width: 100%;
    height: 145px;
    border: 1px solid red;
    border-radius: 5px;
    grid-column: span 6 / span 6;

    .header {
      display: flex;
      align-items: center;
      padding: 0 15px 0 15px;
      height: 40px;
      border-bottom: 1px solid red;
    }
  }
</style>