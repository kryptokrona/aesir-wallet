import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const hyper = writable({
    nickname: 'Anon',
    connected: false,
    peer: 1,
    messages: [],
});
