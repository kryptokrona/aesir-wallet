// Decides which desktop notification (if any) a swap state transition warrants.
//
// The state-name vocabulary and the refund/complete classification mirror the
// renderer's src/lib/utils/swapProgress.js — keep the two in sync. We keep a
// backend copy because electron.cjs is CommonJS and can't require that ES module.

// Taker (Bob) progress steps: raw engine state -> 0-based step index.
const STATE_STEP = {
  'quote has been requested': 0,
  'execution setup done': 0,
  'btc lock ready to publish': 0,
  'btc is locked': 1,
  'xmr lock transaction candidate found': 2,
  'xmr lock transaction seen': 2,
  'xmr is locked': 2,
  'encrypted signature ready to be sent': 3,
  'encrypted signature is sent': 3,
  'btc is redeemed': 3,
  'xmr redeem tx is constructed': 4,
  'xmr redeem tx is published': 4,
  'xmr is redeemed': 5,
};

// Maker (Alice) progress steps.
const MAKER_STATE_STEP = {
  started: 0,
  'bitcoin lock transaction in mempool': 0,
  'btc is locked': 1,
  'xmr lock transaction constructed': 1,
  'xmr lock transaction sent': 1,
  'xmr is locked': 2,
  'xmr lock transfer proof sent': 2,
  'encrypted signature is learned': 2,
  'bitcoin redeem transaction published': 3,
  'btc is redeemed': 3,
};

// Human-readable messages for each state (taker / maker).
const FRIENDLY = {
  'quote has been requested': 'Requesting quote…',
  'execution setup done': 'Preparing swap…',
  'btc lock ready to publish': 'Sending Bitcoin…',
  'btc is locked': 'Bitcoin locked — waiting for the maker to lock XKR…',
  'xmr lock transaction candidate found': 'Maker is locking XKR…',
  'xmr lock transaction seen': 'Maker locked XKR — confirming…',
  'xmr is locked': 'XKR locked — finalizing…',
  'encrypted signature ready to be sent': 'Finalizing swap…',
  'encrypted signature is sent': 'Finalizing swap…',
  'btc is redeemed': 'Almost done — claiming your XKR…',
  'xmr redeem tx is constructed': 'Claiming your XKR…',
  'xmr redeem tx is published': 'Receiving XKR…',
  'xmr is redeemed': 'XKR received!',
};

const MAKER_FRIENDLY = {
  started: 'Waiting for the taker to lock Bitcoin…',
  'bitcoin lock transaction in mempool': 'Taker is locking Bitcoin…',
  'btc is locked': 'Bitcoin locked — locking your XKR…',
  'xmr lock transaction constructed': 'Locking your XKR…',
  'xmr lock transaction sent': 'Locking your XKR…',
  'xmr is locked': "XKR locked — waiting for the taker's signature…",
  'xmr lock transfer proof sent': "XKR locked — waiting for the taker's signature…",
  'encrypted signature is learned': 'Signature received — claiming your Bitcoin…',
  'bitcoin redeem transaction published': 'Receiving your Bitcoin…',
  'btc is redeemed': 'Bitcoin received!',
};

const REFUNDED = new Set([
  'btc is refunded',
  'btc is early refunded',
  'btc is partially refunded',
  'btc is cancelled',
  'full btc refund',
  'partial btc refund',
]);
const REFUNDING = new Set([
  'waiting for cancel timelock expiration',
  'cancel timelock is expired',
  'btc cancel is published',
  'btc refund is published',
  'btc early refund is published',
  'btc partial refund is published',
]);

const MAKER_REFUNDED = new Set([
  'xmr is refunded',
  'btc is refunded',
  'btc is early refunded',
  'btc is cancelled',
  'btc is partially refunded',
]);
const MAKER_REFUNDING = new Set([
  'waiting for cancel timelock expiration',
  'cancel timelock is expired',
  'xmr refund tx is constructed',
  'xmr refund tx is published',
  'xmr is refundable',
  'btc is early refundable',
]);

function swapOutcome(stateName, role) {
  if (role === 'maker') {
    if (stateName === 'btc is redeemed') return 'done';
    if (stateName === 'btc is punished') return 'punished';
    if (stateName === 'safely aborted') return 'aborted';
    if (MAKER_REFUNDED.has(stateName)) return 'refunded';
    if (MAKER_REFUNDING.has(stateName)) return 'refunding';
    return 'active';
  }
  if (stateName === 'xmr is redeemed') return 'done';
  if (stateName === 'btc is punished') return 'punished';
  if (stateName === 'safely aborted') return 'aborted';
  if (REFUNDED.has(stateName)) return 'refunded';
  if (REFUNDING.has(stateName)) return 'refunding';
  return 'active';
}

const stateToStep = (stateName, role) =>
  (role === 'maker' ? MAKER_STATE_STEP : STATE_STEP)[stateName] ?? 0;

const friendlyState = (stateName, role) =>
  (role === 'maker' ? MAKER_FRIENDLY : FRIENDLY)[stateName] || stateName || 'In progress…';

// Given the previous and current cached swap entries, return the one notification
// this transition warrants, or null. `prev` is undefined the first time a swap is seen.
function swapNotification(prev, next) {
  if (!next || !next.state_name) return null;
  const role = next.role === 'maker' ? 'maker' : 'taker';
  const o = swapOutcome(next.state_name, role);
  const po = prev && prev.state_name ? swapOutcome(prev.state_name, role) : null;

  // Terminal / refund transitions take priority over generic step progress.
  if (o === 'done' && po !== 'done') {
    return {
      title: 'Swap completed',
      message: role === 'maker' ? 'Bitcoin received — swap complete.' : 'XKR received — swap complete.',
    };
  }
  if (o === 'refunded' && po !== 'refunded') {
    return {
      title: 'Swap refund completed',
      message: role === 'maker' ? 'Your XKR was returned.' : 'Your Bitcoin was refunded.',
    };
  }
  if (o === 'refunding' && po !== 'refunding' && po !== 'refunded') {
    return {
      title: 'Swap refund started',
      message:
        role === 'maker'
          ? "Swap didn't complete — returning your XKR…"
          : "Swap didn't complete — refunding your Bitcoin…",
    };
  }

  // Maker-only: a taker just opened a swap with us (first time we see this id).
  if (!prev && role === 'maker' && o === 'active') {
    return { title: 'Swap initiated', message: friendlyState(next.state_name, role) };
  }

  // A normal progress step finished — fire only when the step index advances,
  // so the several sub-states within one step don't each ping.
  if (prev && o === 'active' && stateToStep(next.state_name, role) > stateToStep(prev.state_name, role)) {
    return { title: 'Swap step complete', message: friendlyState(next.state_name, role) };
  }

  return null;
}

module.exports = { swapNotification, swapOutcome, stateToStep, friendlyState };
