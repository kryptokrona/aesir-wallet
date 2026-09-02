// Swap p2p identity + signing, reusing Hugin's crypto model verbatim so the swap
// swarm speaks the same scheme as the rest of the Kryptokrona stack.
//
// Two layers, exactly like Hugin:
//   - Topic/swarm keys: a deterministic hyperdht keypair derived from a *topic*
//     key (a public board constant, or a private per-swap "beam" secret). Drives
//     the DHT identity + the hyperswarm-hugin firewall. See getNewPeerKeys().
//   - Peer identity: the user's XKR wallet keypair. Announces are signed with the
//     XKR private spend key and verified against the maker's XKR address, so peers
//     know *who* they're talking to (and can trust the advertised libp2p PeerId).
//
// Mirrors hugin-desktop/src/backend/crypto.cjs (get_new_peer_keys /
// create_peer_base_keys / naclHash / verify_signature) — kept byte-compatible.

const { createHash, randomBytes } = require("crypto");
const DHT = require("hyperdht");
const Keychains = require("keypear");
const { CryptoNote, Address } = require("kryptokrona-utils");

const xkr = new CryptoNote();

// hex string -> Uint8Array (Hugin utils.hexToUint)
function hexToUint(hex) {
  const clean = String(hex);
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

// 32-byte random, hex-encoded (Hugin utils.randomKey)
function randomKey() {
  return randomBytes(32).toString("hex");
}

// SHA-512 of the hex-decoded value (Hugin naclHash — was tweetnacl nacl.hash).
function naclHash(val) {
  return createHash("sha512").update(Buffer.from(hexToUint(val))).digest();
}

// Deterministic hyperdht keypair from a 32-byte buffer, wrapped by keypear.
function createPeerBaseKeys(buf) {
  return Keychains.from(DHT.keyPair(buf));
}

// [base_keys (deterministic from `key`), dht_keys (ephemeral), signature].
// base_keys pins the topic + firewall identity; dht_keys is a fresh per-session
// DHT identity signed by base_keys so the firewall can bind them.
function getNewPeerKeys(key) {
  const secret = Buffer.alloc(32).fill(key);
  const base_keys = createPeerBaseKeys(secret);
  const seed = randomKey();
  const dht_keys = createPeerBaseKeys(Buffer.alloc(32).fill(seed));
  const signature = base_keys.get().sign(dht_keys.get().publicKey);
  return [base_keys, dht_keys, signature];
}

// keypear signature verify (topic-level).
function verifySignature(message, signature, pub) {
  if (!signature || signature.length !== 64) return false;
  try {
    return Keychains.verify(message, signature, pub);
  } catch (_) {
    return false;
  }
}

// XKR (kryptokrona-utils) message signing — authenticates an announce to the
// maker's XKR address. `privateSpendKey` is the wallet's primary spend key.
async function signXkr(message, privateSpendKey) {
  return await xkr.signMessage(message, privateSpendKey);
}

// Verify an XKR-signed message against the signer's XKR address.
async function verifyXkr(message, address, signature) {
  try {
    const a = await Address.fromAddress(address);
    return await xkr.verifyMessageSignature(message, a.spend.publicKey, signature);
  } catch (_) {
    return false;
  }
}

// The 32-byte swarm topic for a given topic key, plus the keys the
// hyperswarm-hugin constructor needs. Board topics use a public constant key;
// per-swap "beam" topics use a random shared secret.
function topicForKey(key) {
  const [base_keys, dht_keys, sig] = getNewPeerKeys(key);
  const topicHash = base_keys.publicKey.toString("hex");
  const topic = Buffer.alloc(32).fill(topicHash);
  return { topic, topicHash, base_keys, dht_keys, sig };
}

module.exports = {
  naclHash,
  randomKey,
  createPeerBaseKeys,
  getNewPeerKeys,
  verifySignature,
  signXkr,
  verifyXkr,
  topicForKey,
};
