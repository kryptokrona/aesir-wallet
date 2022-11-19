import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const hyper = writable({
    connected: false,
    peer: 1,
    messages: [
        {nickname: 'Anon', message: 'Hello'},
        {nickname: 'Anon', message: 'Hello'},
        {nickname: 'Anon', message: 'Hello'},
        {nickname: 'Anon', message: 'Hello'},
    ],
});

if (browser) {
    window.api.receive('hyper-message', (data) => {
        hyper.update((store) => {
            store.messages.push(data);
        });
    });

    window.api.receive('peer-connected', () => {
        hyper.update(store => {
            store.peer = store.peer +1
        })
    })

    window.api.receive('peer-connected', () => {
        hyper.update(store => {
            if(store.peer <= 1) store.peer = store.peer - 1
        })
    })
}
