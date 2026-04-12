// functions/memory/buckets/delete.js
const { getDb } = require('../../../database/sqlite');
const { deleteVector, deleteVectors } = require('../../utils/vectorSync');


/**
 * @typedef {Object} DeleteBucketResult
 * @property {string} bucket_id
 * @property {number} threads_deleted
 * @property {number} memos_deleted
 */


/**
 * Delete a bucket and cascade delete all threads and memos
 * @param {string} bucket_id
 * @returns {Promise<DeleteBucketResult>}
 */
async function deleteBucket(bucket_id) {
	const db = getDb();

	// Verify bucket exists before proceeding
	const bucket = db
		.prepare(`SELECT bucket_id FROM buckets WHERE bucket_id = ?`)
		.get(bucket_id);

	if (!bucket) {
		throw new Error(`Bucket not found: ${bucket_id}`);
	}

	// Gather child IDs for vec table cleanup (before cascade delete removes them)
	const threads = /** @type {{ thread_id: string }[]} */ (
		db.prepare(`SELECT thread_id FROM threads WHERE parent_bucket_id = ?`).all(bucket_id)
	);

	const threadIds = threads.map(t => t.thread_id);

	const memos = /** @type {{ memo_id: string }[]} */ (
		threadIds.length > 0
			? db
					.prepare(
						`SELECT memo_id FROM memos
					WHERE parent_thread_id IN (${threadIds.map(() => '?').join(',')})`,
					)
					.all(...threadIds)
			: []
	);

	const memoIds = memos.map(m => m.memo_id);

	// Delete bucket — SQLite FK cascade handles threads + memos rows
	db.prepare(`DELETE FROM buckets WHERE bucket_id = ?`).run(bucket_id);

	// Clean up vec table entries (not covered by FK cascade)
	deleteVector('buckets', bucket_id);
	if (threadIds.length > 0) deleteVectors('threads', threadIds);
	if (memoIds.length > 0) deleteVectors('memos', memoIds);

	return {
		bucket_id,
		threads_deleted: threadIds.length,
		memos_deleted: memoIds.length,
	};
}


module.exports = { deleteBucket };
