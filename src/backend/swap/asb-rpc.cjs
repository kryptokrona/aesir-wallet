const http = require("http");
const crypto = require("crypto");

function generateAuth() {
  const salt = crypto.randomBytes(16).toString("hex");
  const password = crypto.randomBytes(24).toString("base64").replace(/=+$/, "") + "Aa9$";
  const hmac = crypto.createHmac("sha256", salt).update(password).digest("hex");
  return { password, verifier: `${salt}:${hmac}` };
}

function makeCall(port, password) {
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Authorization: "Bearer " + password,
          },
          timeout: 15000,
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            if (res.statusCode === 401) return reject(new Error("ASB RPC unauthorized"));
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
              } else {
                resolve(parsed.result);
              }
            } catch (_) {
              reject(new Error("ASB RPC returned non-JSON: " + data.slice(0, 120)));
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("ASB RPC request timed out")));
      req.write(body);
      req.end();
    });
}

function client(port, password) {
  const call = makeCall(port, password);
  return {
    call,
    peerId: () => call("peer_id"),
    moneroBalance: () => call("monero_balance"),
    bitcoinBalance: () => call("bitcoin_balance"),
    multiaddresses: () => call("multiaddresses"),
    activeConnections: () => call("active_connections"),
    getSwaps: () => call("get_swaps"),
    registrationStatus: () => call("registration_status"),
  };
}

module.exports = { generateAuth, client };
