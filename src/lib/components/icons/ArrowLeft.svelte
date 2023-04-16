<script>
  export let green;
  let color = 'var(--text-color)';

  $: {
    if (green) {
      color = 'var(--primary-color)';
    } else color = 'var(--text-color)';
  }
</script>

<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M9.57 5.92993L3.5 11.9999L9.57 18.0699"
    stroke-opacity="1"
    stroke={color}
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-dasharray="0,0"
    fill-rule="nonzero"
  />
  <path
    d="M20.5 12H3.67004"
    stroke-opacity="1"
    stroke={color}
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-dasharray="0,0"
    fill-rule="nonzero"
  />
</svg>
