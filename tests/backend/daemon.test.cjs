'use strict';

// src/backend/daemon.cjs: which daemon the wallet gets for a node, and a wallet-backend-js
// Daemon over Hyperswarm against a stand-in xkrd node on a local DHT.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createHuginSwarm } = require('hugin-network/swarm');
const xd = require('hugin-network/xkr-daemon');
const D = require('../../src/backend/daemon.cjs');

// hyperdht's testnet, from the copy hugin-network uses
const hn = path.dirname(require.resolve('hugin-network/package.json'));
const createTestnet = require(require.resolve('hyperdht/testnet.js', { paths: [hn] }));

const INVITE = 'xkr:' + '11'.repeat(32) + '22'.repeat(32) + '33'.repeat(32) + '44'.repeat(32);

test('swarm nodes: hyperswarm and invites', () => {
	assert.equal(D.isSwarmNode('hyperswarm'), true);
	assert.equal(D.isSwarmNode(INVITE), true);
	assert.equal(D.isSwarmNode('node.example'), false);
	assert.deepEqual(D.SWARM, { url: 'hyperswarm', port: 0, ssl: false });
});

test('an HTTP node gives an HTTP daemon', async () => {
	const daemon = D.makeDaemon({ url: 'node.example', port: 11898, ssl: false });
	assert.equal(daemon.getConnectionInfo().host, 'node.example');
	assert.equal(D.currentRequester(), null);
	await D.closeDaemon();
});

test('hyperswarm: the wallet daemon syncs from an xkrd node on the wallets topic', { timeout: 90000 }, async (t) => {
	const testnet = await createTestnet(3);
	t.after(() => testnet.destroy());
	const node = createHuginSwarm({ key: xd.walletsTopicKey('mainnet'), bootstrap: testnet.bootstrap });
	t.after(() => node.swarm.destroy());
	const info = { status: 'OK', height: 11, network_height: 11, last_known_block_index: 10, hashrate: 1, major_version: 7, minor_version: 0, start_time: 0, supported_height: 0, upgrade_heights: [], version: '1.0.0', synced: true, tx_versions: [1, 2] };
	const paths = [];
	node.swarm.on('connection', (conn) => {
		conn.on('error', () => {});
		const reader = new xd.FrameReader();
		conn.on('data', (chunk) => {
			for (const f of reader.push(chunk)) {
				if (f.service) {
					conn.write(xd.encodeFrame({ v: 1, height: 10, hash: 'ab'.repeat(32), synced: true, services: ['wallet'], state_span: null, state_hash: null, pruning_seed: 0 }));
					continue;
				}
				paths.push(f.params.path);
				const body = f.params.path === '/get_transaction_details_by_hashes' ? { status: 'OK', transactions: [{ inBlockchain: true, blockIndex: 7 }] } : info;
				conn.write(xd.encodeFrame({ id: f.id, result: { status: 200, body } }));
			}
		});
	});
	await node.swarm.join(node.topic, { server: true, client: false }).flushed();

	const daemon = D.makeDaemon(D.SWARM, { bootstrap: testnet.bootstrap });
	t.after(() => D.closeDaemon());
	assert.equal(daemon.getConnectionInfo().host, 'hyperswarm');
	await daemon.init();
	assert.equal(daemon.getNetworkBlockCount(), 10, 'network_height - 1, as over HTTP');
	assert.deepEqual(daemon.getTransactionVersions(), [1, 2]);
	assert.equal(await D.swarmNodeAnswers(), true);

	// the swaps use the same requester for their raw daemon requests
	const details = await D.currentRequester().request('post', '/get_transaction_details_by_hashes', { transactionHashes: ['aa'] });
	assert.equal(details.body.transactions[0].blockIndex, 7);
	assert.ok(paths.includes('/info'));
});
