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

export function fiatStr(amount, kind, f) {
  if (f == null) return "";
  const unitPrice = kind === "btc" ? f.btcPrice : f.balance;
  if (!unitPrice) return "";
  return formatCurrency((amount || 0) * unitPrice, f);
}
