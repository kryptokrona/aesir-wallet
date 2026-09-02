// JSON-RPC client for the ASB's control API (swap-controller-api). This replaces
// scraping the ASB's stdout: we ask the maker engine directly for its peer id,
// XKR/BTC balance, active connections and swaps.
//
// The ASB serves this over HTTP with Bearer auth. Aesir controls both ends, so it
// generates a password + verifier file the ASB reads (--rpc-auth-file), and sends
// `Authorization: Bearer <password>` on every call. The verifier format mirrors
// swap-env/src/rpc_auth.rs: "<saltHex>:<hmacHex>", hmac = HMAC-SHA256 keyed by the
// salt hex STRING bytes over the password.

const http = require("http");
const crypto = require("crypto");

// { password, verifier } — write `verifier` to the --rpc-auth-file, keep
// `password` in memory for the Authorization header.
function generateAuth() {
  const salt = crypto.randomBytes(16).toString("hex"); // 32 hex chars
  // Strong per rpc_auth::validate_password_strength: >=16, upper+lower+digit+punct,
  // all ASCII graphic. base64 covers most classes; the suffix guarantees the rest.
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

// A client bound to a port + password. Method names match swap-controller-api.
function client(port, password) {
  const call = makeCall(port, password);
  return {
    call,
    peerId: () => call("peer_id"),
    moneroBalance: () => call("monero_balance"), // XKR inventory, in the port's units
    bitcoinBalance: () => call("bitcoin_balance"),
    multiaddresses: () => call("multiaddresses"),
    activeConnections: () => call("active_connections"),
    getSwaps: () => call("get_swaps"),
    registrationStatus: () => call("registration_status"),
  };
}

module.exports = { generateAuth, client };
