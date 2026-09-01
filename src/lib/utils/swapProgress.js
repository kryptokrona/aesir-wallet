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

export function swapOutcome(stateName) {
  if (stateName === "xmr is redeemed") return "done";
  if (stateName === "btc is punished") return "punished";
  if (stateName === "safely aborted") return "aborted";
  if (REFUNDED.has(stateName)) return "refunded";
  if (REFUNDING.has(stateName)) return "refunding";
  return "active";
}

export const isTerminal = (stateName) =>
  ["done", "punished", "aborted", "refunded"].includes(swapOutcome(stateName));

export const stateToStep = (stateName) => STATE_STEP[stateName] ?? 0;

export const friendlyState = (stateName) =>
  FRIENDLY[stateName] || stateName || "Starting…";
