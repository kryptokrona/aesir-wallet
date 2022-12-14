import { writable } from "svelte/store";

export async function getCoinPriceFromAPI() {
    /* Note: Coingecko has to support your coin for this to work */
    let uri = "https://api.coinpaprika.com/v1/tickers/xkr-kryptokrona";

    try {
        const data = await fetch({
            json: true,
            method: 'GET',
            timeout: 20000,
            url: uri,
        });

        const resp = await fetch(uri);
        let json = await resp.json();
        console.log(json);
        const coinData = json.quotes.USD.price;

        console.log('Updated coin price from API');
        console.log('PRICE:' + coinData);
        fiat.set(coinData);
    } catch (error) {
        console.log('Failed to get price from API: ' + error.toString());
        return undefined;
    }
  }

getCoinPriceFromAPI();

export const fiat = writable({
})
