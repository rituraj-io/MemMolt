const { getDb } = require('../../database/sqlite');


/**
 * @typedef {Object} OrphanCleanupResult
 * @property {number} orphan_threads - Threads whose parent bucket no longer exists
 * @property {number} orphan_memos - Memos whose parent thread no longer exists
 * @property {number} orphan_bucket_vectors - bucket_vec rows without a matching bucket
 * @property {number} orphan_thread_vectors - thread_vec rows without a matching thread
 * @property {number} orphan_memo_vectors - memo_vec rows without a matching memo
 */


/**
 * One-shot integrity sweep. Removes any rows whose parent reference is dangling,
 * plus any vector entries whose SQL row has vanished. Should be safe to run at
 * every startup — a well-formed database simply reports zero of everything.
 *
 * Why this exists:
 *   - Foreign-key cascades handle deletes in normal operation, but vec entries
 *     are cleaned up by our own code after the SQL delete. A crash between
 *     the two steps can leave a vec row with no matching SQL row.
 *   - External tooling (manual SQL, restored backups) can introduce dangling
 *     references this function reconciles.
 *
 * @returns {OrphanCleanupResult}
 */
function cleanupOrphans() {
	const db = getDb();

	// Run everything in a single transaction so startup sees a consistent state
	const runCleanup = db.transaction(() => {
		// 1. Orphan threads — parent bucket gone. Cascade will remove their memos too.
		const threadRes = db
			.prepare(
				`DELETE FROM threads
				WHERE parent_bucket_id NOT IN (SELECT bucket_id FROM buckets)`
			)
			.run();

		// 2. Orphan memos — parent thread gone (cascade may have caught these already)
		const memoRes = db
			.prepare(
				`DELETE FROM memos
				WHERE parent_thread_id NOT IN (SELECT thread_id FROM threads)`
			)
			.run();

		// 3. Orphan vec entries — SQL row no longer exists for their ID
		const bucketVecRes = db
			.prepare(
				`DELETE FROM buckets_vec
				WHERE id NOT IN (SELECT bucket_id FROM buckets)`
			)
			.run();

		const threadVecRes = db
			.prepare(
				`DELETE FROM threads_vec
				WHERE id NOT IN (SELECT thread_id FROM threads)`
			)
			.run();

		const memoVecRes = db
			.prepare(
				`DELETE FROM memos_vec
				WHERE id NOT IN (SELECT memo_id FROM memos)`
			)
			.run();

		return {
			orphan_threads: threadRes.changes,
			orphan_memos: memoRes.changes,
			orphan_bucket_vectors: bucketVecRes.changes,
			orphan_thread_vectors: threadVecRes.changes,
			orphan_memo_vectors: memoVecRes.changes,
		};
	});

	return runCleanup();
}


module.exports = { cleanupOrphans };
