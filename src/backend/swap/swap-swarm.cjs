// HyperSwarm-based swap connectivity — NAT traversal for BTC<->XKR swaps with no
// server/rendezvous. Reuses Hugin's swarm patterns + the `hyperswarm-hugin` fork.
//
// ONE topic: the BOARD (constant, public). Makers advertise a signed announce
// {xkrAddress, libp2p peerId, quote}; takers collect them (the seller list). The
// same board CONNECTION between a taker and a maker then also carries the swap
// itself: the raw libp2p swap bytes are framed as JSON messages (base64) and
// multiplexed over that one connection. We used to open a separate per-swap
// "beam" swarm, but a fresh 2-peer swarm hole-punches unreliably (it failed to
// connect ~99% of the time in the field) whereas the long-lived, busy board
// connection is already established and stable. Carrying the swap over it is far
// more reliable. The swap is still end-to-end encrypted twice (libp2p Noise +
// HyperSwarm's transport encryption), so the board only ever sees ciphertext.
//
// The Rust engine is untouched: the ASB listens on a local port, and the taker
// dials a local bridge socket (/ip4/127.0.0.1/tcp/<port>) with the maker's real
// libp2p PeerId — libp2p's noise + PeerId auth run end-to-end over the pipe.

const net = require("net");
const crypto = require("crypto");
const HyperSwarm = require("hyperswarm-hugin");
const { topicForKey, signXkr, verifyXkr } = require("./swap-crypto.cjs");

const BOARD_KEY = "xkr-swap-market-v1";
const ANNOUNCE_INTERVAL_MS = 15000;
const HEARTBEAT_MS = 8000; // board ping/pong so bidirectionality stays visible in logs
const MAKER_TTL_MS = 45000;

// Swap-stream message types multiplexed over the board connection:
//   sopen  {sid}          taker -> maker: begin a swap connection (open an ASB socket)
//   sdata  {sid, d:b64}    either way: raw swap bytes
//   sclose {sid}           either way: the connection ended
const M_OPEN = "sopen";
const M_DATA = "sdata";
const M_CLOSE = "sclose";

const newSid = () => crypto.randomBytes(8).toString("hex");

// Create a hyperswarm-hugin node bound to the topic derived from `key`, and join
// it. Mirrors hugin-desktop's create_swarm: join as BOTH server AND client so the
// DHT can rendezvous the two peers from either direction, and `flushed()` waits
// until our announce is actually live on the DHT.
function joinTopic(key, { maxPeers = 64, log } = {}) {
  const { topic, base_keys, dht_keys, sig } = topicForKey(key);
  const swarm = new HyperSwarm({ maxPeers, firewall: () => false }, sig, dht_keys, base_keys);
  const discovery = swarm.join(topic, { server: true, client: true });
  discovery
    .flushed()
    .then(() => { if (log) log(`topic ${topic.toString("hex").slice(0, 8)}… announced on DHT`); })
    .catch((e) => { if (log) log(`topic flush error: ${e.message}`); });
  return { swarm, discovery, topic };
}

// Newline-delimited JSON messages over a duplex stream (the board connection).
function onJson(conn, handler) {
  let buf = "";
  conn.on("data", (d) => {
    buf += d.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (_) {
        continue;
      }
      handler(msg);
    }
  });
}
function sendJson(conn, obj) {
  try {
    conn.write(JSON.stringify(obj) + "\n");
  } catch (_) {}
}

// ---- Maker: advertise on the board, bridge accepted swaps to the local ASB ----
//
// opts: { xkrAddress, xkrPrivateSpendKey, libp2pPeerId, asbHost, asbPort, getQuote, log }
function startMaker(opts) {
  const {
    xkrAddress,
    xkrPrivateSpendKey,
    libp2pPeerId,
    asbHost = "127.0.0.1",
    asbPort,
    getQuote,
    log = () => {},
  } = opts;

  const board = joinTopic(BOARD_KEY, { maxPeers: 128, log });
  const conns = new Set();

  async function makeAnnounce() {
    const quote = getQuote ? await getQuote().catch(() => null) : null;
    const payload = { xkrAddress, peerId: libp2pPeerId, quote, ts: Date.now() };
    const sig = await signXkr(JSON.stringify(payload), xkrPrivateSpendKey);
    return { type: "announce", payload, sig };
  }

  board.swarm.on("connection", (conn) => {
    conns.add(conn);
    log(`maker: taker connected on board (${conns.size} peer(s))`);
    // Per-connection swap streams: sid -> ASB socket. One taker can run one swap
    // at a time, but keep a map so a redial (new sid) is handled cleanly.
    const asbSocks = new Map();

    const ping = setInterval(() => sendJson(conn, { type: "ping", from: "maker", t: Date.now() }), HEARTBEAT_MS);
    const cleanup = () => {
      conns.delete(conn);
      clearInterval(ping);
      for (const s of asbSocks.values()) try { s.destroy(); } catch (_) {}
      asbSocks.clear();
      log(`maker: board connection CLOSED (${conns.size} left)`);
    };
    conn.on("close", cleanup);
    conn.on("error", (e) => log(`maker: board connection error: ${e.message}`));
    makeAnnounce().then((a) => sendJson(conn, a)).catch(() => {});
    sendJson(conn, { type: "ping", from: "maker", t: Date.now() });

    onJson(conn, (msg) => {
      if (!msg) return;
      if (msg.type === "ping") { sendJson(conn, { type: "pong", from: "maker", t: msg.t }); return; }
      if (msg.type === "pong") { log(`maker: board pong from taker, RTT ${Date.now() - msg.t}ms`); return; }

      // ---- swap stream multiplexed over this board connection ----
      if (msg.type === M_OPEN && typeof msg.sid === "string") {
        if (asbSocks.has(msg.sid)) return;
        log(`maker: swap stream ${msg.sid.slice(0, 6)}… opened, dialing ASB`);
        const sock = net.connect(asbPort, asbHost, () => log(`maker: ASB ${asbHost}:${asbPort} connected`));
        asbSocks.set(msg.sid, sock);
        sock.on("data", (chunk) => sendJson(conn, { type: M_DATA, sid: msg.sid, d: chunk.toString("base64") }));
        sock.on("close", () => {
          if (asbSocks.delete(msg.sid)) sendJson(conn, { type: M_CLOSE, sid: msg.sid });
        });
        sock.on("error", (e) => log(`maker: ASB socket error (${asbHost}:${asbPort}): ${e.message}`));
        return;
      }
      if (msg.type === M_DATA && typeof msg.sid === "string") {
        const sock = asbSocks.get(msg.sid);
        if (sock) try { sock.write(Buffer.from(msg.d, "base64")); } catch (_) {}
        return;
      }
      if (msg.type === M_CLOSE && typeof msg.sid === "string") {
        const sock = asbSocks.get(msg.sid);
        if (sock) { asbSocks.delete(msg.sid); try { sock.destroy(); } catch (_) {} }
        return;
      }
    });
  });

  const timer = setInterval(async () => {
    const a = await makeAnnounce().catch(() => null);
    if (a) for (const c of conns) sendJson(c, a);
  }, ANNOUNCE_INTERVAL_MS);

  log("maker: advertising on the swap board");
  return {
    stop() {
      clearInterval(timer);
      try { board.swarm.destroy(); } catch (_) {}
    },
  };
}

// ---- Taker: discover makers on the board, carry the swap over the board conn ---
//
// opts: { onUpdate, log }. onUpdate(makers[]) fires as announces arrive/expire.
function startDiscovery(opts = {}) {
  const { onUpdate = () => {}, log = () => {} } = opts;
  const board = joinTopic(BOARD_KEY, { maxPeers: 128, log });
  const makers = new Map(); // xkrAddress -> { xkrAddress, peerId, quote, seen, conn }
  const swapSocks = new Map(); // sid -> engine socket (routes maker's sdata back to the engine)
  log("discovery: joined board, searching for makers on the DHT…");

  function list() {
    const now = Date.now();
    for (const [k, v] of makers) if (now - v.seen > MAKER_TTL_MS) makers.delete(k);
    return [...makers.values()].map(({ conn, ...m }) => m);
  }

  board.swarm.on("connection", (conn) => {
    log("discovery: peer connected on board");
    const ping = setInterval(() => sendJson(conn, { type: "ping", from: "taker", t: Date.now() }), HEARTBEAT_MS);
    conn.on("close", () => { clearInterval(ping); log("discovery: board connection CLOSED"); });
    conn.on("error", (e) => log(`discovery: board connection error: ${e.message}`));
    sendJson(conn, { type: "ping", from: "taker", t: Date.now() });

    onJson(conn, async (msg) => {
      if (!msg) return;
      if (msg.type === "ping") { sendJson(conn, { type: "pong", from: "taker", t: msg.t }); return; }
      if (msg.type === "pong") { log(`discovery: board pong from maker, RTT ${Date.now() - msg.t}ms`); return; }

      // ---- swap bytes coming back from the maker's ASB ----
      if (msg.type === M_DATA && typeof msg.sid === "string") {
        const sock = swapSocks.get(msg.sid);
        if (sock) try { sock.write(Buffer.from(msg.d, "base64")); } catch (_) {}
        return;
      }
      if (msg.type === M_CLOSE && typeof msg.sid === "string") {
        const sock = swapSocks.get(msg.sid);
        if (sock) { swapSocks.delete(msg.sid); try { sock.destroy(); } catch (_) {} }
        return;
      }

      if (msg.type !== "announce" || !msg.payload || !msg.sig) return;
      const ok = await verifyXkr(JSON.stringify(msg.payload), msg.payload.xkrAddress, msg.sig);
      if (!ok) { log("discovery: dropped announce with bad signature"); return; }
      makers.set(msg.payload.xkrAddress, { ...msg.payload, conn, seen: Date.now() });
      log(`discovery: maker ${msg.payload.xkrAddress.slice(0, 12)}… (peer ${String(msg.payload.peerId).slice(0, 12)}…)`);
      onUpdate(list());
    });
  });

  // Open a durable local bridge to `xkrAddress`. The local TCP server stays up for
  // the whole swap; EACH connection the Rust engine makes to it is multiplexed to
  // the maker over the existing board connection (a reliable, already-hole-punched
  // channel) as its own swap stream (sid).
  function openSwapBridge(xkrAddress) {
    return new Promise((resolve, reject) => {
      log(`taker: swap requested for maker ${String(xkrAddress).slice(0, 12)}…; ${makers.size} maker(s) known`);
      const maker = makers.get(xkrAddress);
      if (!maker || !maker.conn) {
        log("taker: ABORT — maker not in board map (its announce went stale). Board connection likely dropped.");
        return reject(new Error("maker not found / offline (board connection stale)"));
      }

      // Look up the CURRENT board connection each time we send, so a board
      // reconnect mid-swap doesn't leave us writing to a dead socket.
      const boardConn = () => makers.get(xkrAddress)?.conn || null;

      const bridgeOneConnection = (sock) => {
        const conn = boardConn();
        if (!conn) { try { sock.destroy(); } catch (_) {} return; }
        const sid = newSid();
        swapSocks.set(sid, sock);
        log(`taker: engine dialed bridge — swap stream ${sid.slice(0, 6)}… over board`);
        sendJson(conn, { type: M_OPEN, sid });
        sock.on("data", (chunk) => {
          const c = boardConn();
          if (c) sendJson(c, { type: M_DATA, sid, d: chunk.toString("base64") });
        });
        sock.on("error", () => {});
        sock.on("close", () => {
          if (swapSocks.delete(sid)) {
            const c = boardConn();
            if (c) sendJson(c, { type: M_CLOSE, sid });
          }
        });
      };

      const srv = net.createServer(bridgeOneConnection);
      srv.on("error", (e) => reject(e));
      srv.listen(0, "127.0.0.1", () => {
        const port = srv.address().port;
        log(`taker: bridge server up on 127.0.0.1:${port} (maker ${maker.peerId})`);
        resolve({
          multiaddr: `/ip4/127.0.0.1/tcp/${port}`,
          peerId: maker.peerId,
          close() {
            try { srv.close(); } catch (_) {}
          },
        });
      });
    });
  }

  log("taker: listening on the swap board for makers");
  return {
    list,
    openSwapBridge,
    stop() {
      for (const s of swapSocks.values()) try { s.destroy(); } catch (_) {}
      swapSocks.clear();
      try { board.swarm.destroy(); } catch (_) {}
    },
  };
}

module.exports = { startMaker, startDiscovery, BOARD_KEY };
