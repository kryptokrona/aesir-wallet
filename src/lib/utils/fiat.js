// Shared fiat formatting for showing the fiat (e.g. USD) value of an XKR or BTC
// amount anywhere in the wallet. Uses the fiat store's live prices and the
// currently selected currency ticker/symbol. Set the currency to USD in
// settings to get USD everywhere.

// Format a fiat currency amount using the selected currency's symbol.
export function formatCurrency(value, f) {
  if (f == null || !isFinite(value)) return "";
  const cur =
    (f.currencies || []).find((c) => c.ticker === f.ticker) ||
    (f.currencies || []).find((c) => c.ticker === "usd") || { symbol: "$", symbolLocation: "prefix" };
  const num = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = value < 0 ? "-" : "";
  return cur.symbolLocation === "postfix" ? `${sign}${num} ${cur.symbol}` : `${sign}${cur.symbol}${num}`;
}

// Fiat value of an amount. `kind` is 'xkr' or 'btc'; `amount` is in native units
// (XKR, or BTC -- not sats/atomic). `f` is the fiat store value (get(fiat)).
// Returns '' when we don't have a price yet.
export function fiatStr(amount, kind, f) {
  if (f == null) return "";
  const unitPrice = kind === "btc" ? f.btcPrice : f.balance; // price of 1 unit in ticker
  if (!unitPrice) return "";
  return formatCurrency((amount || 0) * unitPrice, f);
}
