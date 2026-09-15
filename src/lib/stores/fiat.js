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
    btcPrice: 0,
    ticker: "usd",
    currencies: currencies,
})

const POLL_INTERVAL_MS = 60_000;
const MIN_FETCH_GAP_MS = 30_000;

let lastFetch = 0;
let inFlight = null;
let pollTimer = null;

async function fetchCoinPrice() {
    let ticker
    const local = localStorage.getItem('fiat')

    if (local === undefined || local === null) ticker = get(fiat).ticker.toLowerCase();
    else ticker = local

    /* Note: Coingecko has to support your coin for this to work */
    let uri = `https://api.coingecko.com/api/v3/simple/price?ids=kryptokrona,bitcoin&vs_currencies=${ticker}`;

    try {

        const resp = await fetch(uri);
        let json = await resp.json();

        const balance = json.kryptokrona?.[ticker] ?? 0
        const btcPrice = json.bitcoin?.[ticker] ?? 0

        fiat.set({balance, btcPrice, ticker, currencies: currencies})

        localStorage.setItem('fiat', ticker);
        lastFetch = Date.now();
        console.log('Updated coin prices from API (XKR + BTC)');

    } catch (error) {
        console.log('Failed to get price from API: ' + error.toString());
        return undefined;
    }
}

export async function getCoinPriceFromAPI({ force = false } = {}) {
    if (!force) {
        if (inFlight) return inFlight;
        if (Date.now() - lastFetch < MIN_FETCH_GAP_MS) return;
    }
    const p = fetchCoinPrice();
    inFlight = p;
    p.finally(() => { if (inFlight === p) inFlight = null; });
    return p;
}

export function startFiatPolling(intervalMs = POLL_INTERVAL_MS) {
    getCoinPriceFromAPI({ force: true });
    if (pollTimer || typeof setInterval === 'undefined') return;
    pollTimer = setInterval(() => getCoinPriceFromAPI(), intervalMs);
}

startFiatPolling();

