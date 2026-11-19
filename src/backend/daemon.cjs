'use strict';

// The wallet's daemon: an HTTP node (`{ url, port, ssl }`), or an xkrd node over Hyperswarm
// (hugin-network/xkr-daemon) for the node `hyperswarm` or a private node's invite (`xkr:…`).
// Without a saved node the wallet takes a local node when one answers, else Hyperswarm.

const WB = require('kryptokrona-wallet-backend-js');
const { XkrDaemonRequester } = require('hugin-network/xkr-daemon');

/** The node url that means "an xkrd node found over Hyperswarm". */
const SWARM_NODE = 'hyperswarm';
/** The local node tried first. */
const LOCAL_NODE = { url: '127.0.0.1', port: 11898, ssl: false };
/** The Hyperswarm node as Aesir stores nodes. */
const SWARM = { url: SWARM_NODE, port: 0, ssl: false };

/** Whether `url` goes over Hyperswarm. */
function isSwarmNode(url) {
	return url === SWARM_NODE || (typeof url === 'string' && url.startsWith('xkr:'));
}

/** Whether a node answers `/info` on 127.0.0.1:11898 within `ms`. */
async function localNodeAnswers(ms = 2000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	try {
		const res = await fetch(`http://${LOCAL_NODE.url}:${LOCAL_NODE.port}/info`, { signal: controller.signal });
		return res.ok;
	} catch (e) {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

/** The node to use when none is saved: the local node, else Hyperswarm. */
async function defaultNode() {
	return (await localNodeAnswers()) ? { ...LOCAL_NODE } : { ...SWARM };
}

let requester = null;

/**
 * A wallet-backend-js daemon for `node`; a Hyperswarm node closes the previous requester and
 * opens a new one (`options` go to XkrDaemonRequester, for tests).
 */
function makeDaemon(node, options = {}) {
	if (requester) {
		requester.close().catch(() => {});
		requester = null;
	}
	if (!isSwarmNode(node.url)) return new WB.Daemon(node.url, node.port);
	requester = new XkrDaemonRequester({
		network: 'mainnet',
		invite: node.url === SWARM_NODE ? undefined : node.url,
		client: 'aesir',
		...options,
	});
	return WB.Daemon.withRequester(requester);
}

/** Whether the requester has a synchronized node (for the node check of a Hyperswarm node). */
async function swarmNodeAnswers() {
	if (!requester) return false;
	try {
		const answer = await requester.request('get', '/info');
		return answer.status === 200;
	} catch (e) {
		return false;
	}
}

/** The Hyperswarm requester of the current daemon (null for an HTTP node). */
function currentRequester() {
	return requester;
}

/** Closes the Hyperswarm requester, if one is open. */
async function closeDaemon() {
	if (requester) await requester.close();
	requester = null;
}

module.exports = { SWARM_NODE, SWARM, LOCAL_NODE, isSwarmNode, localNodeAnswers, defaultNode, makeDaemon, swarmNodeAnswers, currentRequester, closeDaemon };
