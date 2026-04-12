// functions/memory/memos/move.js
const { getDb } = require('../../../database/sqlite');


/**
 * @typedef {Object} MoveMemoResult
 * @property {string} memo_id
 * @property {string} old_thread_id
 * @property {string} new_thread_id
 */


/**
 * Move a memo to a different thread.
 * Verifies both the memo and destination thread exist; rejects same-thread moves.
 * No vector sync needed — title/summary are unchanged.
 * @param {string} memo_id
 * @param {string} new_thread_id
 * @returns {MoveMemoResult}
 */
function moveMemo(memo_id, new_thread_id) {
	const db = getDb();

	// Verify memo exists
	const memo = /** @type {{ memo_id: string, parent_thread_id: string } | undefined} */ (
		db.prepare(`SELECT memo_id, parent_thread_id FROM memos WHERE memo_id = ?`).get(memo_id)
	);

	if (!memo) {
		throw new Error(`Memo not found: ${memo_id}`);
	}

	// Verify destination thread exists
	const thread = db
		.prepare(`SELECT thread_id FROM threads WHERE thread_id = ?`)
		.get(new_thread_id);

	if (!thread) {
		throw new Error(`Destination thread not found: ${new_thread_id}`);
	}

	const old_thread_id = memo.parent_thread_id;

	if (old_thread_id === new_thread_id) {
		throw new Error('Memo is already in the specified thread.');
	}

	db.prepare(
		`UPDATE memos
		SET parent_thread_id = ?, updated_at = CURRENT_TIMESTAMP
		WHERE memo_id = ?`
	).run(new_thread_id, memo_id);

	return { memo_id, old_thread_id, new_thread_id };
}


module.exports = { moveMemo };
