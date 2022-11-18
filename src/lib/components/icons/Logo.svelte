<script>
    import {fade} from 'svelte/transition'
    export let size
    export let opacity
    export let blink
    export let colorful

    let color

    $: if(colorful) color = 'var(--primary-color)'
    $: if(!colorful) color = 'var(--text-color)'

</script>
<svg  in:fade out:fade class:blink_me={blink} width="{size}px" height="{size}px" viewBox="0 0 458 458" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
        <circle id="path-8l3ufqo_6k-1" cx="229" cy="229" r="229"></circle>
    </defs>
    <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="Artboard" transform="translate(-1204.000000, -572.000000)">
            <g id="Group-2" transform="translate(1204.000000, 572.000000)">
                <mask id="mask-8l3ufqo_6k-2" fill="white">
                    <use xlink:href="#path-8l3ufqo_6k-1"></use>
                </mask>
                <g id="Mask"></g>
                <g mask="url(#mask-8l3ufqo_6k-2)" fill="{color}"  opacity="{opacity}%">
                    <g transform="translate(-436.000000, -21.000000)">
                        <polygon id="Rectangle" transform="translate(664.500000, 249.921203) rotate(-270.000000) translate(-664.500000, -249.921203) " points="415 209.074245 914 209.074245 914 290.768162 415 290.768162"></polygon>
                        <rect id="Rectangle-Copy-5" transform="translate(1030.017110, 40.845624) rotate(-180.000000) translate(-1030.017110, -40.845624) " x="731.034221" y="4.54747351e-13" width="597.965779" height="81.6912474"></rect>
                        <rect id="Rectangle-Copy-11" transform="translate(1030.017110, 145.275672) rotate(-180.000000) translate(-1030.017110, -145.275672) " x="731.034221" y="104.430048" width="597.965779" height="81.6912474"></rect>
                        <rect id="Rectangle-Copy-12" transform="translate(1030.017110, 249.705720) rotate(-180.000000) translate(-1030.017110, -249.705720) " x="731.034221" y="208.860096" width="597.965779" height="81.6912474"></rect>
                        <rect id="Rectangle-Copy-13" transform="translate(1030.017110, 354.135768) rotate(-180.000000) translate(-1030.017110, -354.135768) " x="731.034221" y="313.290145" width="597.965779" height="81.6912474"></rect>
                        <rect id="Rectangle-Copy-14" transform="translate(1030.017110, 458.565817) rotate(-180.000000) translate(-1030.017110, -458.565817) " x="731.034221" y="417.720193" width="597.965779" height="81.6912474"></rect>
                        <rect id="Rectangle-Copy-6" transform="translate(298.982890, 40.845624) rotate(-180.000000) translate(-298.982890, -40.845624) " x="0" y="0" width="597.965779" height="81.6912474"></rect>
                        <rect id="Rectangle-Copy-7" transform="translate(298.982890, 145.275672) rotate(-180.000000) translate(-298.982890, -145.275672) " x="0" y="104.430048" width="597.965779" height="81.6912474"></rect>
                        <rect id="Rectangle-Copy-8" transform="translate(298.982890, 249.705720) rotate(-180.000000) translate(-298.982890, -249.705720) " x="0" y="208.860096" width="597.965779" height="81.6912474"></rect>
                        <rect id="Rectangle-Copy-9" transform="translate(298.982890, 354.135768) rotate(-180.000000) translate(-298.982890, -354.135768) " x="0" y="313.290145" width="597.965779" height="81.6912474"></rect>
                        <rect id="Rectangle-Copy-10" transform="translate(298.982890, 458.565817) rotate(-180.000000) translate(-298.982890, -458.565817) " x="0" y="417.720193" width="597.965779" height="81.6912474"></rect>
                    </g>
                </g>
            </g>
        </g>
    </g>
</svg>