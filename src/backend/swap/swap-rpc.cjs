const http = require("http");

let servePort = 40010;

function setServePort(port) {
  servePort = port;
}

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const req = http.request(
      {
        host: "127.0.0.1",
        port: servePort,
        method: "POST",
        path: "/",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 60000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
            } else {
              resolve(parsed.result);
            }
          } catch (e) {
            reject(new Error(`swap daemon returned non-JSON: ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("swap daemon request timed out")));
    req.write(body);
    req.end();
  });
}

const status = () => call("status");
const swapInfos = () => call("swap_infos");
const history = () => call("history");
const balance = () => call("balance");
const bitcoinAddress = () => call("bitcoin_address");
const bitcoinTransactions = () => call("bitcoin_transactions");
const listSellers = () => call("list_sellers");
const withdrawBtc = ({ address, amountSat }) =>
  call("withdraw_btc", { address, amount_sat: amountSat ?? null });
const resume = (swapId, sellerMultiaddr) =>
  call("resume", sellerMultiaddr ? { swap_id: swapId, seller_multiaddr: sellerMultiaddr } : { swap_id: swapId });
const swapError = (swapId) => call("swap_error", { swap_id: swapId });
const estimateLockFee = (amountSat) => call("estimate_lock_fee", { btc_amount_sat: amountSat });
const suspendCurrentSwap = () => call("suspend_current_swap");
const cancelAndRefund = (swapId) => call("cancel_and_refund", { swap_id: swapId });
const buyXmrDirect = ({ sellerMultiaddr, sellerPeerId, amountSat, xkrReceiveAddress, changeAddress }) =>
  call("buy_xmr_direct", {
    seller_multiaddr: sellerMultiaddr,
    seller_peer_id: sellerPeerId,
    btc_amount_sat: amountSat,
    xkr_receive_address: xkrReceiveAddress,
    bitcoin_change_address: changeAddress || null,
  });

module.exports = {
  setServePort,
  call,
  status,
  swapInfos,
  history,
  balance,
  bitcoinAddress,
  bitcoinTransactions,
  listSellers,
  withdrawBtc,
  resume,
  swapError,
  estimateLockFee,
  suspendCurrentSwap,
  cancelAndRefund,
  buyXmrDirect,
};
