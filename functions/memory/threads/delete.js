// functions/memory/threads/delete.js
const { getDb } = require('../../../database/sqlite');
const { deleteVector, deleteVectors } = require('../../utils/vectorSync');


/**
 * @typedef {Object} DeleteThreadResult
 * @property {string} thread_id
 * @property {string} parent_bucket_id
 * @property {number} memos_deleted
 */


/**
 * Delete a thread and cascade delete all its memos
 * @param {string} thread_id
 * @returns {Promise<DeleteThreadResult>}
 */
async function deleteThread(thread_id) {
	const db = getDb();

	// Verify thread exists and capture parent for result
	const thread = /** @type {{ thread_id: string, parent_bucket_id: string } | undefined} */ (
		db
			.prepare(
				`SELECT thread_id, parent_bucket_id FROM threads WHERE thread_id = ?`,
			)
			.get(thread_id)
	);

	if (!thread) {
		throw new Error(`Thread not found: ${thread_id}`);
	}

	// Gather memo IDs before deletion for vector cleanup
	const memos = /** @type {Array<{ memo_id: string }>} */ (
		db.prepare(`SELECT memo_id FROM memos WHERE parent_thread_id = ?`).all(thread_id)
	);

	const memoIds = memos.map(m => m.memo_id);

	// Delete thread from SQLite — cascade handles memos
	db.prepare(`DELETE FROM threads WHERE thread_id = ?`).run(thread_id);

	// Clean up thread and memo vectors
	await deleteVector('threads', thread_id);
	if (memoIds.length > 0) await deleteVectors('memos', memoIds);

	return {
		thread_id,
		parent_bucket_id: thread.parent_bucket_id,
		memos_deleted: memoIds.length,
	};
}


module.exports = { deleteThread };
