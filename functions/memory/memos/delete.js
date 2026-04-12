// functions/memory/memos/delete.js
const { getDb } = require('../../../database/sqlite');
const { deleteVector } = require('../../utils/vectorSync');


/**
 * @typedef {Object} DeleteMemoResult
 * @property {string} memo_id
 * @property {string} parent_thread_id
 */


/**
 * Delete a memo and remove its vector entry.
 * @param {string} memo_id
 * @returns {Promise<DeleteMemoResult>}
 */
async function deleteMemo(memo_id) {
	const db = getDb();

	// Verify memo exists before deletion
	const memo = /** @type {{ memo_id: string, parent_thread_id: string } | undefined} */ (
		db.prepare(`SELECT memo_id, parent_thread_id FROM memos WHERE memo_id = ?`).get(memo_id)
	);

	if (!memo) {
		throw new Error(`Memo not found: ${memo_id}`);
	}

	db.prepare(`DELETE FROM memos WHERE memo_id = ?`).run(memo_id);

	// Remove vector entry from memos_vec
	await deleteVector('memos', memo_id);

	return {
		memo_id,
		parent_thread_id: memo.parent_thread_id,
	};
}


module.exports = { deleteMemo };
