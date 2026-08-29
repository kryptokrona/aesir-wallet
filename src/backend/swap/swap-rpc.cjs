// Tiny JSON-RPC client for the taker `swap serve` daemon (see ./engine.cjs).
// Node `http` only, no dependencies. Used by electron.cjs IPC handlers to start
// swaps and poll their progress from the renderer.

const http = require("http");

let servePort = 40010;

function setServePort(port) {
  servePort = port;
}

// Call a JSON-RPC method on the taker daemon. Resolves the `result`, rejects on
// transport errors or a JSON-RPC `error`.
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
        timeout: 20000,
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

// Convenience wrappers for the daemon's methods.
const status = () => call("status");
const swapInfos = () => call("swap_infos");
const history = () => call("history");
const balance = () => call("balance");
const resume = (swapId) => call("resume", { swap_id: swapId });
// Start a swap against an explicit maker. amountSat is the BTC amount to lock.
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
  resume,
  buyXmrDirect,
};
