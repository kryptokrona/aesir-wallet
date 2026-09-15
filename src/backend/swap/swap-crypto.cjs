const { createHash, randomBytes } = require("crypto");
const DHT = require("hyperdht");
const Keychains = require("keypear");
const { CryptoNote, Address } = require("kryptokrona-utils");

const xkr = new CryptoNote();

function hexToUint(hex) {
  const clean = String(hex);
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function randomKey() {
  return randomBytes(32).toString("hex");
}

function naclHash(val) {
  return createHash("sha512").update(Buffer.from(hexToUint(val))).digest();
}

function createPeerBaseKeys(buf) {
  return Keychains.from(DHT.keyPair(buf));
}

function getNewPeerKeys(key) {
  const secret = Buffer.alloc(32).fill(key);
  const base_keys = createPeerBaseKeys(secret);
  const seed = randomKey();
  const dht_keys = createPeerBaseKeys(Buffer.alloc(32).fill(seed));
  const signature = base_keys.get().sign(dht_keys.get().publicKey);
  return [base_keys, dht_keys, signature];
}

function verifySignature(message, signature, pub) {
  if (!signature || signature.length !== 64) return false;
  try {
    return Keychains.verify(message, signature, pub);
  } catch (_) {
    return false;
  }
}

async function signXkr(message, privateSpendKey) {
  return await xkr.signMessage(message, privateSpendKey);
}

async function verifyXkr(message, address, signature) {
  try {
    const a = await Address.fromAddress(address);
    return await xkr.verifyMessageSignature(message, a.spend.publicKey, signature);
  } catch (_) {
    return false;
  }
}

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
