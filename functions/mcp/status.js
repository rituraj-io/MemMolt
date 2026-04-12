// @ts-check
'use strict';

const { getDb } = require('../../database/sqlite');


/**
 * Get system status and health info — counts for all entity and vector tables
 * @returns {{ status: string, sqlite: { buckets: number, threads: number, memos: number }, vectors: { buckets: number, threads: number, memos: number } }}
 */
function handleStatus() {
	const db = getDb();

	// SQL entity table counts
	const bucketCount = /** @type {{ count: number }} */ (db.prepare('SELECT COUNT(*) AS count FROM buckets').get()).count;
	const threadCount = /** @type {{ count: number }} */ (db.prepare('SELECT COUNT(*) AS count FROM threads').get()).count;
	const memoCount = /** @type {{ count: number }} */ (db.prepare('SELECT COUNT(*) AS count FROM memos').get()).count;


	// sqlite-vec virtual table counts
	const bucketVectors = /** @type {{ count: number }} */ (db.prepare('SELECT COUNT(*) AS count FROM buckets_vec').get()).count;
	const threadVectors = /** @type {{ count: number }} */ (db.prepare('SELECT COUNT(*) AS count FROM threads_vec').get()).count;
	const memoVectors = /** @type {{ count: number }} */ (db.prepare('SELECT COUNT(*) AS count FROM memos_vec').get()).count;


	return {
		status: 'healthy',
		sqlite: {
			buckets: bucketCount,
			threads: threadCount,
			memos: memoCount,
		},
		vectors: {
			buckets: bucketVectors,
			threads: threadVectors,
			memos: memoVectors,
		},
	};
}


module.exports = { handleStatus };
