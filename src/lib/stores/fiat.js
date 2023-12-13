import { get, writable } from "svelte/store";

export const currencies = [
    {
        ticker: 'btc',
        coinName: 'Bitcoin',
        symbol: '₿',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'eth',
        coinName: 'Ethereum',
        symbol: 'Ξ',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'ltc',
        coinName: 'Litecoin',
        symbol: 'Ł',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'aud',
        coinName: 'Australian Dollar',
        symbol: '$',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'cad',
        coinName: 'Canadian Dollar',
        symbol: '$',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'cny',
        coinName: 'Chinese Yuan Renminbi',
        symbol: '¥',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'chf',
        coinName: 'Swiss Franc',
        symbol: 'Fr',
        symbolLocation: 'postfix',
    },
    {
        ticker: 'eur',
        coinName: 'Euro',
        symbol: '€',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'gbp',
        coinName: 'Great British Pound',
        symbol: '£',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'inr',
        coinName: 'Indian Rupee',
        symbol: '₹',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'jpy',
        coinName: 'Japanese Yen',
        symbol: '¥',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'mxn',
        coinName: 'Mexican Peso',
        symbol: '$',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'nzd',
        coinName: 'New Zealand Dollar',
        symbol: '$',
        symbolLocation: 'prefix',
    },
    {
        ticker: 'rub',
        coinName: 'Russian Ruble',
        symbol: '₽',
        symbolLocation: 'postfix',
    },
    {
        ticker: 'sek',
        coinName: 'Swedish Kronor',
        symbol: 'kr',
        symbolLocation: 'postfix',
    },
    {
        ticker: 'nok',
        coinName: 'Norwegian Kroner',
        symbol: 'kr',
        symbolLocation: 'postfix',
    },
    {
        ticker: 'dkk',
        coinName: 'Danish Kroner',
        symbol: 'kr',
        symbolLocation: 'postfix',
    },
    {
        ticker: 'usd',
        coinName: 'United States Dollar',
        symbol: '$',
        symbolLocation: 'prefix',
    },
]

export const fiat = writable({
    balance: 0,
    ticker: "usd",
    currencies: currencies,
})

export async function getCoinPriceFromAPI() {

    let ticker
    const local = localStorage.getItem('fiat')

    if (local === undefined) ticker = get(fiat).ticker.toLowerCase();
    else ticker = local

    /* Note: Coingecko has to support your coin for this to work */
    let uri = `https://api.coingecko.com/api/v3/simple/price?ids=kryptokrona&vs_currencies=${ticker}`;

    try {

        const resp = await fetch(uri);
        let json = await resp.json();

        const balance = json.kryptokrona[ticker]

        fiat.set({balance, ticker, currencies: currencies})
        
        localStorage.setItem('fiat', ticker);
        console.log('Updated coin price from API');
        console.log('BALANCE:' + balance);

    } catch (error) {
        console.log('Failed to get price from API: ' + error.toString());
        return undefined;
    }
  }

getCoinPriceFromAPI();


