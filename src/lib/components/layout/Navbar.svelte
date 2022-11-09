<script>
    import {fade} from 'svelte/transition'
</script>
<nav in:fade>
    <div>
        <button>
            S
        </button>
        <button>
            R
        </button>
        <button>
            T
        </button>
        <button>
            C
        </button>
    </div>
    <div class="draggable drag"></div>
    <div>
        <button>
            O
        </button>
        <button>
            U
        </button>
    </div>
</nav>

<style lang="scss">
    nav {
      width: 80px;
      height: 100vh;
      padding-top: 3rem;
      padding-bottom: 2rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      border-right: 1px solid var(--border-color);

      div {
        display: flex;
        flex-direction: column;
        gap: 1rem;

        button {
          width: 3rem;
          height: 3rem;
          background-color: transparent;
          border: none;
          transition: 150ms ease-in-out;
          border-radius: 8px;

          &:hover {
            background-color: #252525;
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