import { get, writable } from "svelte/store";

export const fiat = writable({
    balance: 0,
    picked: "usd",
})


export async function getCoinPriceFromAPI() {


    const picked = get(fiat).picked.toLowerCase();

    /* Note: Coingecko has to support your coin for this to work */
    let uri = `https://api.coingecko.com/api/v3/simple/price?ids=kryptokrona&vs_currencies=${picked}`;

    try {

        const resp = await fetch(uri);
        let json = await resp.json();

        const balance = json.kryptokrona[picked]

        fiat.set({balance, picked})

        localStorage.setItem('fiat', get(fiat));

        console.log('Updated coin price from API');
        console.log('BALANCE:' + balance);

    } catch (error) {
        console.log('Failed to get price from API: ' + error.toString());
        return undefined;
    }
  }

getCoinPriceFromAPI();


