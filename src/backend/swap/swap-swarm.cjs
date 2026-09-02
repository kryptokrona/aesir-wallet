// HyperSwarm-based swap connectivity — NAT traversal for BTC<->XKR swaps with no
// server/rendezvous. Reuses Hugin's swarm patterns + the `hyperswarm-hugin` fork.
//
// Two topic roles (mirrors Hugin's board + beam / DM split):
//   - BOARD (constant, public): makers advertise a signed announce
//     {xkrAddress, libp2p peerId, quote}; takers collect them (the seller list).
//   - BEAM (per swap, random secret key): a *private* 1:1 channel for one swap.
//     Raw bytes are bridged between this channel and the local libp2p engine, so
//     the whole swap protocol runs unchanged, end-to-end, over the hole-punched
//     pipe. Only the two swap parties know the beam key, so only they can join.
//
// The Rust engine is untouched: the ASB just listens on a local port, and the
// taker dials a local bridge socket (/ip4/127.0.0.1/tcp/<port>) with the maker's
// real libp2p PeerId — libp2p's noise + PeerId auth run end-to-end over the pipe.

const net = require("net");
const HyperSwarm = require("hyperswarm-hugin");
const { topicForKey, randomKey, signXkr, verifyXkr } = require("./swap-crypto.cjs");

const BOARD_KEY = "xkr-swap-market-v1";
const ANNOUNCE_INTERVAL_MS = 15000;
const MAKER_TTL_MS = 45000;
const BEAM_CONNECT_TIMEOUT_MS = 60000;
const BEAM_MAX_LIFETIME_MS = 30 * 60 * 1000; // swaps are minutes; keep generous

// Create a hyperswarm-hugin node bound to the topic derived from `key`, and join
// it. The fork's constructor wants (opts, sig, dht_keys, base_keys); a permissive
// firewall is fine here — the board is public and a beam is gated by its secret.
function joinTopic(key, { server = false, client = true, maxPeers = 64 } = {}) {
  const { topic, base_keys, dht_keys, sig } = topicForKey(key);
  const swarm = new HyperSwarm({ maxPeers, firewall: () => false }, sig, dht_keys, base_keys);
  const discovery = swarm.join(topic, { server, client });
  return { swarm, discovery, topic };
}

// Bidirectional pipe between two duplex streams, with mutual teardown.
function bridge(a, b) {
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    try { a.destroy(); } catch (_) {}
    try { b.destroy(); } catch (_) {}
  };
  a.on("error", cleanup);
  b.on("error", cleanup);
  a.on("close", cleanup);
  b.on("close", cleanup);
  a.pipe(b);
  b.pipe(a);
}

// Newline-delimited JSON control messages over a duplex stream (board only; a
// beam carries raw bytes, never JSON).
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
// getQuote() -> { price, min_quantity, max_quantity } (or null). Advertised for
// display; the authoritative quote is still fetched over libp2p during setup.
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

  const board = joinTopic(BOARD_KEY, { server: true, client: false, maxPeers: 128 });
  const conns = new Set();
  const beams = new Set();

  async function makeAnnounce() {
    const quote = getQuote ? await getQuote().catch(() => null) : null;
    const payload = { xkrAddress, peerId: libp2pPeerId, quote, ts: Date.now() };
    const sig = await signXkr(JSON.stringify(payload), xkrPrivateSpendKey);
    return { type: "announce", payload, sig };
  }

  function openMakerBeam(beamKey) {
    const beam = joinTopic(beamKey, { server: true, client: false, maxPeers: 4 });
    beams.add(beam);
    beam.swarm.on("connection", (conn) => {
      const sock = net.connect(asbPort, asbHost);
      bridge(conn, sock);
      log(`maker: bridged swap peer -> ASB ${asbHost}:${asbPort}`);
    });
    // reclaim the beam once the swap has had time to finish
    setTimeout(() => {
      beams.delete(beam);
      try { beam.swarm.destroy(); } catch (_) {}
    }, BEAM_MAX_LIFETIME_MS);
  }

  board.swarm.on("connection", (conn) => {
    conns.add(conn);
    log(`maker: taker connected on board (${conns.size} peer(s))`);
    conn.on("close", () => conns.delete(conn));
    conn.on("error", () => {});
    makeAnnounce().then((a) => sendJson(conn, a)).catch(() => {});
    onJson(conn, (msg) => {
      if (msg && msg.type === "swap-init" && typeof msg.beamKey === "string") {
        log("maker: swap-init received, opening private beam");
        openMakerBeam(msg.beamKey);
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
      for (const b of beams) try { b.swarm.destroy(); } catch (_) {}
      try { board.swarm.destroy(); } catch (_) {}
    },
  };
}

// ---- Taker: discover makers on the board, open a private beam per swap --------
//
// opts: { onUpdate, log }. onUpdate(makers[]) fires as announces arrive/expire.
function startDiscovery(opts = {}) {
  const { onUpdate = () => {}, log = () => {} } = opts;
  const board = joinTopic(BOARD_KEY, { server: false, client: true, maxPeers: 128 });
  const makers = new Map(); // xkrAddress -> { xkrAddress, peerId, quote, seen, conn }
  log("discovery: joined board, searching for makers on the DHT…");

  function list() {
    const now = Date.now();
    for (const [k, v] of makers) if (now - v.seen > MAKER_TTL_MS) makers.delete(k);
    return [...makers.values()].map(({ conn, ...m }) => m);
  }

  board.swarm.on("connection", (conn) => {
    log("discovery: peer connected on board");
    conn.on("error", () => {});
    onJson(conn, async (msg) => {
      if (!msg || msg.type !== "announce" || !msg.payload || !msg.sig) return;
      const ok = await verifyXkr(JSON.stringify(msg.payload), msg.payload.xkrAddress, msg.sig);
      if (!ok) {
        log("discovery: dropped announce with bad signature");
        return;
      }
      makers.set(msg.payload.xkrAddress, { ...msg.payload, conn, seen: Date.now() });
      log(`discovery: maker ${msg.payload.xkrAddress.slice(0, 12)}… (peer ${String(msg.payload.peerId).slice(0, 12)}…)`);
      onUpdate(list());
    });
  });

  // Open a private beam to `xkrAddress` and bridge it to a fresh local socket the
  // Rust taker dials. Resolves { multiaddr, peerId, close } for buy_xmr_direct.
  function openSwapBridge(xkrAddress) {
    return new Promise((resolve, reject) => {
      const maker = makers.get(xkrAddress);
      if (!maker || !maker.conn) return reject(new Error("maker not found / offline"));

      const beamKey = randomKey();
      sendJson(maker.conn, { type: "swap-init", beamKey });
      const beam = joinTopic(beamKey, { server: false, client: true, maxPeers: 4 });

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        try { beam.swarm.destroy(); } catch (_) {}
        reject(new Error("timed out reaching maker over HyperSwarm"));
      }, BEAM_CONNECT_TIMEOUT_MS);

      beam.swarm.on("connection", (conn) => {
        if (settled) {
          try { conn.destroy(); } catch (_) {}
          return;
        }
        // Local server the Rust taker dials; its (single) socket <-> the beam conn.
        // Single-shot: bridge the first dial and stop accepting, so a libp2p retry
        // can't double-pipe the same beam connection.
        const srv = net.createServer((sock) => {
          try { srv.close(); } catch (_) {}
          bridge(conn, sock);
        });
        srv.listen(0, "127.0.0.1", () => {
          settled = true;
          clearTimeout(timeout);
          const port = srv.address().port;
          log(`taker: bridged beam <-> 127.0.0.1:${port} (maker ${maker.peerId})`);
          resolve({
            multiaddr: `/ip4/127.0.0.1/tcp/${port}`,
            peerId: maker.peerId,
            close() {
              try { srv.close(); } catch (_) {}
              try { beam.swarm.destroy(); } catch (_) {}
            },
          });
        });
      });
    });
  }

  log("taker: listening on the swap board for makers");
  return { list, openSwapBridge, stop() { try { board.swarm.destroy(); } catch (_) {} } };
}

module.exports = { startMaker, startDiscovery, BOARD_KEY };
