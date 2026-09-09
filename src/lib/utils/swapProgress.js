// Maps the Rust taker's BobState display strings (from swap_infos `state_name`)
// onto a compact, user-facing progress timeline. Shared by the swap page and
// the SwapTimeline component so both agree on step index, friendly wording and
// terminal outcome. The strings here must match swap-machine/src/bob/mod.rs.

// The happy-path milestones, in order. `state_name` is bucketed into one of
// these by STATE_STEP below.
export const STEPS = [
  "Send BTC",
  "BTC locked",
  "Lock XKR",
  "Finalize",
  "Receive XKR",
  "Done",
];

// state_name -> index into STEPS.
const STATE_STEP = {
  "quote has been requested": 0,
  "execution setup done": 0,
  "btc lock ready to publish": 0,
  "btc is locked": 1,
  "xmr lock transaction candidate found": 2,
  "xmr lock transaction seen": 2,
  "xmr is locked": 2,
  "encrypted signature ready to be sent": 3,
  "encrypted signature is sent": 3,
  "btc is redeemed": 3,
  "xmr redeem tx is constructed": 4,
  "xmr redeem tx is published": 4,
  "xmr is redeemed": 5,
};

// A friendly, present-tense description of what's happening right now.
const FRIENDLY = {
  "quote has been requested": "Requesting quote…",
  "execution setup done": "Preparing swap…",
  "btc lock ready to publish": "Sending Bitcoin…",
  "btc is locked": "Bitcoin locked — waiting for the maker to lock XKR…",
  "xmr lock transaction candidate found": "Maker is locking XKR…",
  "xmr lock transaction seen": "Maker locked XKR — confirming…",
  "xmr is locked": "XKR locked — finalizing…",
  "encrypted signature ready to be sent": "Finalizing swap…",
  "encrypted signature is sent": "Finalizing swap…",
  "btc is redeemed": "Almost done — claiming your XKR…",
  "xmr redeem tx is constructed": "Claiming your XKR…",
  "xmr redeem tx is published": "Receiving XKR…",
  "xmr is redeemed": "Swap complete — XKR received!",
  // refund / failure wording
  "waiting for cancel timelock expiration": "Swap didn't complete — preparing refund…",
  "cancel timelock is expired": "Preparing Bitcoin refund…",
  "btc cancel is published": "Refunding your Bitcoin…",
  "btc is cancelled": "Refunding your Bitcoin…",
  "btc refund is published": "Refunding your Bitcoin…",
  "btc early refund is published": "Refunding your Bitcoin…",
  "btc partial refund is published": "Refunding your Bitcoin…",
  "btc is refunded": "Your Bitcoin was refunded.",
  "btc is early refunded": "Your Bitcoin was refunded.",
  "btc is partially refunded": "Your Bitcoin was partially refunded.",
  "full btc refund": "Your Bitcoin was refunded.",
  "partial btc refund": "Your Bitcoin was partially refunded.",
  "safely aborted": "Swap was safely aborted — no funds moved.",
  "btc is punished": "Swap failed and was punished.",
};

// Terminal / branch classification. "active" means still progressing on the
// happy path; the rest are outcomes the UI treats specially.
const REFUNDED = new Set([
  "btc is refunded",
  "btc is early refunded",
  "btc is partially refunded",
  "btc is cancelled",
  "full btc refund",
  "partial btc refund",
]);
const REFUNDING = new Set([
  "waiting for cancel timelock expiration",
  "cancel timelock is expired",
  "btc cancel is published",
  "btc refund is published",
  "btc early refund is published",
  "btc partial refund is published",
]);

// Short per-step descriptions for the vertical timeline (taker/Bob side).
const STEP_DESC = {
  "Send BTC": "Locking your Bitcoin into the swap contract",
  "BTC locked": "Your Bitcoin is locked on-chain",
  "Lock XKR": "The maker locks the XKR you're buying",
  "Finalize": "Exchanging signatures to settle the swap",
  "Receive XKR": "Sweeping the XKR to your wallet",
  "Done": "Swap complete",
};

// ---- Maker (Alice) side ----------------------------------------------------
// The maker receives BTC and sends XKR, so its milestones and wording differ.
// Strings must match swap-machine/src/alice/mod.rs.
export const MAKER_STEPS = ["BTC locked", "Lock XKR", "Finalize", "BTC received"];

const MAKER_STEP_DESC = {
  "BTC locked": "Waiting for the taker to lock Bitcoin",
  "Lock XKR": "Locking your XKR into the swap contract",
  "Finalize": "Exchanging signatures to settle the swap",
  "BTC received": "Sweeping the Bitcoin to your wallet",
};

// A short description for a step label, given the role.
export const descFor = (role, label) =>
  (role === "maker" ? MAKER_STEP_DESC : STEP_DESC)[label] || "";

const MAKER_STATE_STEP = {
  started: 0,
  "bitcoin lock transaction in mempool": 0,
  "btc is locked": 1,
  "xmr lock transaction constructed": 1,
  "xmr lock transaction sent": 1,
  "xmr is locked": 2,
  "xmr lock transfer proof sent": 2,
  "encrypted signature is learned": 2,
  "bitcoin redeem transaction published": 3,
  "btc is redeemed": 3,
};

const MAKER_FRIENDLY = {
  started: "Waiting for the taker to lock Bitcoin…",
  "bitcoin lock transaction in mempool": "Taker is locking Bitcoin…",
  "btc is locked": "Bitcoin locked — locking your XKR…",
  "xmr lock transaction constructed": "Locking your XKR…",
  "xmr lock transaction sent": "Locking your XKR…",
  "xmr is locked": "XKR locked — waiting for the taker's signature…",
  "xmr lock transfer proof sent": "XKR locked — waiting for the taker's signature…",
  "encrypted signature is learned": "Signature received — claiming your Bitcoin…",
  "bitcoin redeem transaction published": "Receiving your Bitcoin…",
  "btc is redeemed": "Swap complete — Bitcoin received!",
  // refund / failure (the maker keeps its XKR)
  "waiting for cancel timelock expiration": "Swap didn't complete — awaiting refund…",
  "cancel timelock is expired": "Returning your XKR…",
  "btc is cancelled": "Swap cancelled — returning your XKR…",
  "xmr refund tx is constructed": "Returning your XKR…",
  "xmr refund tx is published": "Returning your XKR…",
  "xmr is refunded": "Swap didn't complete — your XKR was returned.",
  "btc is refunded": "Swap didn't complete — your XKR was returned.",
  "btc is early refunded": "Swap didn't complete — your XKR was returned.",
  "btc is partially refunded": "Swap partially completed.",
  "safely aborted": "Swap was safely aborted — no funds moved.",
  "btc is punished": "The taker abandoned the swap — punished.",
};

const MAKER_REFUNDED = new Set([
  "xmr is refunded",
  "btc is refunded",
  "btc is early refunded",
  "btc is cancelled",
  "btc is partially refunded",
]);
const MAKER_REFUNDING = new Set([
  "waiting for cancel timelock expiration",
  "cancel timelock is expired",
  "xmr refund tx is constructed",
  "xmr refund tx is published",
  "xmr is refundable",
  "btc is early refundable",
]);

export const stepsFor = (role) => (role === "maker" ? MAKER_STEPS : STEPS);

export function swapOutcome(stateName, role = "taker") {
  if (role === "maker") {
    if (stateName === "btc is redeemed") return "done";
    if (stateName === "btc is punished") return "punished";
    if (stateName === "safely aborted") return "aborted";
    if (MAKER_REFUNDED.has(stateName)) return "refunded";
    if (MAKER_REFUNDING.has(stateName)) return "refunding";
    return "active";
  }
  if (stateName === "xmr is redeemed") return "done";
  if (stateName === "btc is punished") return "punished";
  if (stateName === "safely aborted") return "aborted";
  if (REFUNDED.has(stateName)) return "refunded";
  if (REFUNDING.has(stateName)) return "refunding";
  return "active";
}

export const isTerminal = (stateName, role = "taker") =>
  ["done", "punished", "aborted", "refunded"].includes(swapOutcome(stateName, role));

export const stateToStep = (stateName, role = "taker") =>
  (role === "maker" ? MAKER_STATE_STEP : STATE_STEP)[stateName] ?? 0;

export const friendlyState = (stateName, role = "taker") =>
  (role === "maker" ? MAKER_FRIENDLY : FRIENDLY)[stateName] || stateName || "Starting…";
