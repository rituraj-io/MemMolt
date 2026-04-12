// functions/memory/threads/move.js
const { getDb } = require('../../../database/sqlite');


/**
 * @typedef {Object} MoveThreadResult
 * @property {string} thread_id
 * @property {string} old_bucket_id
 * @property {string} new_bucket_id
 */


/**
 * Move a thread to a different bucket
 * @param {string} thread_id
 * @param {string} new_bucket_id
 * @returns {MoveThreadResult}
 */
function moveThread(thread_id, new_bucket_id) {
	const db = getDb();

	// Verify thread exists and get current parent
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

	// Verify destination bucket exists
	const bucket = db
		.prepare(`SELECT bucket_id FROM buckets WHERE bucket_id = ?`)
		.get(new_bucket_id);

	if (!bucket) {
		throw new Error(`Destination bucket not found: ${new_bucket_id}`);
	}

	const old_bucket_id = thread.parent_bucket_id;

	if (old_bucket_id === new_bucket_id) {
		throw new Error('Thread is already in the specified bucket.');
	}

	// Update parent reference — no vector sync needed (summary unchanged)
	db.prepare(
		`UPDATE threads
		SET parent_bucket_id = ?, updated_at = CURRENT_TIMESTAMP
		WHERE thread_id = ?`,
	).run(new_bucket_id, thread_id);

	return { thread_id, old_bucket_id, new_bucket_id };
}


module.exports = { moveThread };
