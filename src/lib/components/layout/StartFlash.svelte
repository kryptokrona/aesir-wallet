<div class="shine"></div>

<style>
    .shine {
        width:200%;
        height:200%;
        transform:translateY(100%);
        position: absolute;
        z-index:1;
        animation: slide 1000ms ease-in-out;
        background-image: linear-gradient(180deg, rgba(255,255,255,0.00) 1%, rgba(255,255,255,0.20) 9%, rgba(255,255,255,0.00) 100%);
    }

    @keyframes slide {
        0% {transform:translateY(100%);}
        100% {transform:translateY(-100%);}
    }
</style>