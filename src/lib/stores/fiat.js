import { get, writable } from "svelte/store";

export const fiatPrice = writable({
})

export const fiatCurrency = writable({
    picked: "usd",
})

export async function getCoinPriceFromAPI() {


    const picked = get(fiatCurrency).picked.toLowerCase();
    /* Note: Coingecko has to support your coin for this to work */
    let uri = `https://api.coingecko.com/api/v3/simple/price?ids=kryptokrona&vs_currencies=${picked}`;

    try {

        const resp = await fetch(uri);
        let json = await resp.json();
        const coinData = json.kryptokrona[picked]

        console.log('Updated coin price from API');
        console.log('PRICE:' + coinData);

        fiatPrice.set(coinData)

    } catch (error) {
        console.log('Failed to get price from API: ' + error.toString());
        return undefined;
    }
  }

getCoinPriceFromAPI();


