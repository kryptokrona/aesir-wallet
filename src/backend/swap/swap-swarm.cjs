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
const HEARTBEAT_MS = 8000; // board ping/pong so bidirectionality stays visible in logs
const MAKER_TTL_MS = 45000;
const BEAM_CONNECT_TIMEOUT_MS = 60000;
const BEAM_MAX_LIFETIME_MS = 30 * 60 * 1000; // swaps are minutes; keep generous

// Create a hyperswarm-hugin node bound to the topic derived from `key`, and join
// it. The fork's constructor wants (opts, sig, dht_keys, base_keys); a permissive
// firewall is fine here — the board is public and a beam is gated by its secret.
//
// Mirrors hugin-desktop's create_swarm exactly, which is why Hugin's DMs punch
// through NATs reliably: join as BOTH server AND client (so the DHT can rendezvous
// the two peers from either direction — no single fragile hole-punch path), and
// `flushed()` waits until our announce is actually live on the DHT. `.ready`
// resolves on flush; callers may await it, and we log it for diagnostics.
function joinTopic(key, { maxPeers = 64, log } = {}) {
  const { topic, base_keys, dht_keys, sig } = topicForKey(key);
  const swarm = new HyperSwarm({ maxPeers, firewall: () => false }, sig, dht_keys, base_keys);
  const discovery = swarm.join(topic, { server: true, client: true });
  const ready = discovery
    .flushed()
    .then(() => { if (log) log(`topic ${topic.toString("hex").slice(0, 8)}… announced on DHT`); })
    .catch((e) => { if (log) log(`topic flush error: ${e.message}`); });
  return { swarm, discovery, topic, ready };
}

// Bidirectional pipe between two duplex streams, with mutual teardown.
// opts: { log, label } — when set, counts bytes each way and logs the first
// byte in each direction plus final totals on close, so a stalled swap shows
// exactly which hop never moved data.
function bridge(a, b, opts = {}) {
  const { log, label = "bridge" } = opts;
  let done = false;
  let ab = 0, ba = 0, firstAB = false, firstBA = false;
  const cleanup = (who) => {
    if (done) return;
    done = true;
    if (log) log(`${label}: closed by ${who} — a→b ${ab}B, b→a ${ba}B`);
    try { a.destroy(); } catch (_) {}
    try { b.destroy(); } catch (_) {}
  };
  if (log) {
    a.on("data", (d) => {
      ab += d.length;
      if (!firstAB) { firstAB = true; log(`${label}: first bytes a→b (${d.length}B)`); }
    });
    b.on("data", (d) => {
      ba += d.length;
      if (!firstBA) { firstBA = true; log(`${label}: first bytes b→a (${d.length}B)`); }
    });
  }
  a.on("error", () => cleanup("a"));
  b.on("error", () => cleanup("b"));
  a.on("close", () => cleanup("a"));
  b.on("close", () => cleanup("b"));
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

  const board = joinTopic(BOARD_KEY, { maxPeers: 128, log });
  const conns = new Set();
  const beams = new Set();

  // Persistent per-maker beam: a single stable topic the maker joins ONCE at
  // startup and keeps warm (announced on the DHT) for the whole session, exactly
  // like the board. Takers reuse it for every swap. A warm topic hole-punches
  // reliably; a fresh random topic per swap (the old model) had to punch cold
  // each time and frequently "never connected". The key is advertised so takers
  // know which topic to join. Each incoming beam connection is bridged to its own
  // fresh ASB socket, so multiple takers still fan out cleanly.
  const makerBeamKey = randomKey();

  async function makeAnnounce() {
    const quote = getQuote ? await getQuote().catch(() => null) : null;
    const payload = { xkrAddress, peerId: libp2pPeerId, beamKey: makerBeamKey, quote, ts: Date.now() };
    const sig = await signXkr(JSON.stringify(payload), xkrPrivateSpendKey);
    return { type: "announce", payload, sig };
  }

  // opts.persistent: keep the beam joined for the whole session (the stable
  // per-maker beam). Otherwise it's an old-style per-swap beam (compat for takers
  // that still send `swap-init`) and is reclaimed after the swap window.
  function openMakerBeam(beamKey, { persistent = false } = {}) {
    const beam = joinTopic(beamKey, { maxPeers: 32, log });
    beams.add(beam);
    log(`maker: joined ${persistent ? "persistent" : "private"} beam ${beamKey.slice(0, 8)}…, waiting for taker`);
    beam.swarm.on("connection", (conn) => {
      conn.on("error", (e) => log(`maker: beam conn error: ${e.message}`));
      // Dial the ASB LAZILY — only once the taker actually sends swap bytes.
      // A persistent beam parks idle connections between swaps; dialing eagerly
      // would hold an idle ASB socket that libp2p drops after its handshake
      // timeout, churning reconnects. Pause the beam until the ASB is ready and
      // replay the first chunk so nothing is lost.
      conn.once("data", (first) => {
        log("maker: swap bytes on beam, dialing ASB");
        conn.pause();
        const sock = net.connect(asbPort, asbHost, () => {
          log(`maker: ASB ${asbHost}:${asbPort} connected, bridging`);
          try { sock.write(first); } catch (_) {}
          bridge(conn, sock, { log, label: "maker-beam↔asb" });
          conn.resume();
        });
        sock.on("error", (e) => {
          log(`maker: ASB socket error (${asbHost}:${asbPort}): ${e.message}`);
          try { conn.destroy(); } catch (_) {}
        });
      });
    });
    if (!persistent) {
      // reclaim the compat beam once the swap has had time to finish
      setTimeout(() => {
        beams.delete(beam);
        try { beam.swarm.destroy(); } catch (_) {}
      }, BEAM_MAX_LIFETIME_MS);
    }
  }

  // Stand up the persistent beam immediately so it's warm before any swap.
  openMakerBeam(makerBeamKey, { persistent: true });

  board.swarm.on("connection", (conn) => {
    conns.add(conn);
    log(`maker: taker connected on board (${conns.size} peer(s))`);
    // Recurring heartbeat both ways: a pong proves taker->maker->taker actually
    // round-trips (a swap needs that direction; discovery only needs the reverse).
    const ping = setInterval(() => sendJson(conn, { type: "ping", from: "maker", t: Date.now() }), HEARTBEAT_MS);
    conn.on("close", () => { conns.delete(conn); clearInterval(ping); log(`maker: board connection CLOSED (${conns.size} left)`); });
    conn.on("error", (e) => log(`maker: board connection error: ${e.message}`));
    makeAnnounce().then((a) => sendJson(conn, a)).catch(() => {});
    sendJson(conn, { type: "ping", from: "maker", t: Date.now() });
    onJson(conn, (msg) => {
      if (!msg) return;
      if (msg.type === "ping") {
        sendJson(conn, { type: "pong", from: "maker", t: msg.t });
        return;
      }
      if (msg.type === "pong") {
        log(`maker: board pong from taker, RTT ${Date.now() - msg.t}ms`);
        return;
      }
      if (msg.type === "swap-init" && typeof msg.beamKey === "string") {
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
  const board = joinTopic(BOARD_KEY, { maxPeers: 128, log });
  const makers = new Map(); // xkrAddress -> { xkrAddress, peerId, quote, seen, conn }
  log("discovery: joined board, searching for makers on the DHT…");

  function list() {
    const now = Date.now();
    for (const [k, v] of makers) if (now - v.seen > MAKER_TTL_MS) makers.delete(k);
    return [...makers.values()].map(({ conn, ...m }) => m);
  }

  board.swarm.on("connection", (conn) => {
    log("discovery: peer connected on board");
    // Recurring heartbeat both ways: a pong proves this side can reach the maker
    // AND get a reply back -- the exact round-trip a swap's swap-init depends on.
    const ping = setInterval(() => sendJson(conn, { type: "ping", from: "taker", t: Date.now() }), HEARTBEAT_MS);
    conn.on("close", () => { clearInterval(ping); log("discovery: board connection CLOSED"); });
    conn.on("error", (e) => log(`discovery: board connection error: ${e.message}`));
    sendJson(conn, { type: "ping", from: "taker", t: Date.now() });
    onJson(conn, async (msg) => {
      if (!msg) return;
      if (msg.type === "ping") {
        sendJson(conn, { type: "pong", from: "taker", t: msg.t });
        return;
      }
      if (msg.type === "pong") {
        log(`discovery: board pong from maker, RTT ${Date.now() - msg.t}ms`);
        return;
      }
      if (msg.type !== "announce" || !msg.payload || !msg.sig) return;
      const ok = await verifyXkr(JSON.stringify(msg.payload), msg.payload.xkrAddress, msg.sig);
      if (!ok) {
        log("discovery: dropped announce with bad signature");
        return;
      }
      makers.set(msg.payload.xkrAddress, { ...msg.payload, conn, seen: Date.now() });
      log(`discovery: maker ${msg.payload.xkrAddress.slice(0, 12)}… (peer ${String(msg.payload.peerId).slice(0, 12)}…)`);
      // Warm the maker's persistent beam as soon as we discover it, so even the
      // FIRST swap connects over an already-hole-punched topic (idempotent).
      if (typeof msg.payload.beamKey === "string" && msg.payload.beamKey) {
        try { ensureBeam(msg.payload.xkrAddress, msg.payload.beamKey); } catch (_) {}
      }
      onUpdate(list());
    });
  });

  // Persistent per-maker beam cache. We join each maker's advertised beam topic
  // ONCE and keep it warm; because the topic stays announced on the DHT, its
  // connections hole-punch reliably (like the board). A tiny broker hands the
  // warm connection to whichever engine socket needs it (the swap lock means only
  // one is active at a time), and parks a spare so the next swap connects instantly.
  const beamCache = new Map(); // xkrAddress -> { key, swarm, idle:[conn], waiters:[{resolve,timer}] }

  function ensureBeam(xkrAddress, beamKey) {
    let bs = beamCache.get(xkrAddress);
    if (bs && bs.key === beamKey) return bs;
    if (bs) { try { bs.swarm.destroy(); } catch (_) {} beamCache.delete(xkrAddress); } // maker restarted -> new key
    const { swarm } = joinTopic(beamKey, { maxPeers: 32, log });
    bs = { key: beamKey, swarm, idle: [], waiters: [] };
    swarm.on("connection", (conn) => {
      conn.on("error", () => {});
      conn.on("close", () => {
        const i = bs.idle.indexOf(conn);
        if (i >= 0) bs.idle.splice(i, 1);
      });
      const w = bs.waiters.shift();
      if (w) { clearTimeout(w.timer); w.resolve(conn); }
      else bs.idle.push(conn);
    });
    beamCache.set(xkrAddress, bs);
    log(`taker: joined persistent beam ${beamKey.slice(0, 8)}… for maker ${String(xkrAddress).slice(0, 12)}…`);
    return bs;
  }

  function getBeamConn(bs, timeoutMs) {
    return new Promise((resolve, reject) => {
      const conn = bs.idle.shift();
      if (conn) return resolve(conn);
      const timer = setTimeout(() => {
        const idx = bs.waiters.findIndex((x) => x.timer === timer);
        if (idx >= 0) bs.waiters.splice(idx, 1);
        reject(new Error("persistent beam connect timeout"));
      }, timeoutMs);
      bs.waiters.push({ resolve, timer });
    });
  }

  // Open a durable local bridge to `xkrAddress`. The local TCP server stays up for
  // the whole swap; EACH connection the Rust engine makes to it is bridged to the
  // maker over the persistent beam (a warm, reused topic). Falls back to the old
  // per-swap random beam for makers that don't advertise a beamKey (older wallets).
  function openSwapBridge(xkrAddress) {
    return new Promise((resolve, reject) => {
      log(`taker: swap requested for maker ${String(xkrAddress).slice(0, 12)}…; ${makers.size} maker(s) known`);
      const maker = makers.get(xkrAddress);
      if (!maker || !maker.conn) {
        log("taker: ABORT — maker not in board map (its announce went stale). Board connection likely dropped.");
        return reject(new Error("maker not found / offline (board connection stale)"));
      }

      const usePersistent = typeof maker.beamKey === "string" && maker.beamKey.length > 0;
      const bs = usePersistent ? ensureBeam(xkrAddress, maker.beamKey) : null;
      const liveBeams = new Set(); // only used by the compat (random-beam) path

      const bridgeOneConnection = async (sock) => {
        if (usePersistent) {
          try {
            const conn = await getBeamConn(bs, BEAM_CONNECT_TIMEOUT_MS);
            log("taker: engine dialed bridge — bridging over persistent beam");
            conn.on("error", (e) => log(`taker: beam conn error: ${e.message}`));
            // bridge() destroys the beam conn when the engine socket closes; that
            // cleanly ends the maker's ASB socket, and the warm topic reconnects a
            // fresh conn (parked as idle) for the next swap.
            bridge(conn, sock, { log, label: "taker-engine↔beam" });
          } catch (e) {
            log(`taker: persistent beam never connected (${e.message}) — closing socket`);
            try { sock.destroy(); } catch (_) {}
          }
          return;
        }

        // ---- compat: maker without a persistent beam -> old per-swap beam ----
        const beamKey = randomKey();
        log(`taker: engine dialed bridge — opening private beam ${beamKey.slice(0, 8)}…`);
        if (!maker.conn) {
          try { sock.destroy(); } catch (_) {}
          return;
        }
        sendJson(maker.conn, { type: "swap-init", beamKey });
        const beam = joinTopic(beamKey, { maxPeers: 4, log });
        liveBeams.add(beam);
        let bridged = false;
        const teardown = () => { liveBeams.delete(beam); try { beam.swarm.destroy(); } catch (_) {} };
        const timeout = setTimeout(() => {
          if (bridged) return;
          log("taker: private beam for this dial never connected — closing socket");
          try { sock.destroy(); } catch (_) {}
          teardown();
        }, BEAM_CONNECT_TIMEOUT_MS);
        beam.swarm.on("connection", (conn) => {
          if (bridged) { try { conn.destroy(); } catch (_) {} return; }
          bridged = true;
          clearTimeout(timeout);
          conn.on("error", (e) => log(`taker: beam conn error: ${e.message}`));
          conn.on("close", teardown);
          bridge(conn, sock, { log, label: "taker-engine↔beam" });
        });
        sock.on("close", () => { clearTimeout(timeout); teardown(); });
      };

      const srv = net.createServer(bridgeOneConnection);
      srv.on("error", (e) => reject(e));
      srv.listen(0, "127.0.0.1", () => {
        const port = srv.address().port;
        log(`taker: bridge server up on 127.0.0.1:${port} (maker ${maker.peerId})`);
        resolve({
          multiaddr: `/ip4/127.0.0.1/tcp/${port}`,
          peerId: maker.peerId,
          // Keep the persistent beam warm for the next swap; only tear down the
          // bridge server and any compat (random) beams.
          close() {
            try { srv.close(); } catch (_) {}
            for (const b of liveBeams) try { b.swarm.destroy(); } catch (_) {}
            liveBeams.clear();
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
      for (const bs of beamCache.values()) try { bs.swarm.destroy(); } catch (_) {}
      beamCache.clear();
      try { board.swarm.destroy(); } catch (_) {}
    },
  };
}

module.exports = { startMaker, startDiscovery, BOARD_KEY };
