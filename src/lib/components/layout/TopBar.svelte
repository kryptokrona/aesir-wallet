<div class="top-bar light">
    <div class="window-buttons">
        <div class="button red" on:click={() => window.api.send('quit')}></div>
        <div class="button orange" on:click={() => window.api.send('minimize')}></div>
    </div>
    <div class="draggable drag-area"></div>
</div>

<style lang="scss">

  .top-bar {
    width: 100%;
    display: flex;
    position: fixed;
    top: 0;
    height: 30px;
    transition: 150ms ease-in-out;

    &:hover {
      background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255, 255, 255, 0.2), rgba(255, 255, 159, 0));

      .red {
        background-color: #ed6580;
      }

      .orange {
        background-color: #e3b75f;
      }

    }
  }

  .window-buttons {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 12px 0 5px 12px;

    .button {
      width: 12px;
      height: 12px;
      border-radius: 100%;
      background-color: #252525;
      cursor: pointer;
    }
  }

  .drag-area {
    width: 100%;
    cursor: grab;
  }

</style>
