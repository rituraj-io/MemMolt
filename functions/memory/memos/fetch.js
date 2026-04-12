// functions/memory/memos/fetch.js
const { getDb } = require('../../../database/sqlite');


/**
 * @typedef {Object} FetchedMemo
 * @property {string} memo_id
 * @property {string} memo_title
 * @property {string} memo_summary
 * @property {string} memo_content
 * @property {string} parent_thread_id
 */


/**
 * Fetch one or more memos by ID, returning full content.
 * @param {string[]} memo_ids - Array of memo IDs
 * @returns {FetchedMemo[]}
 */
function fetchMemos(memo_ids) {
	const db = getDb();

	if (memo_ids.length === 0) {
		return [];
	}

	// Fetch all requested memos in one query
	const placeholders = memo_ids.map(() => '?').join(',');
	const memos = /** @type {FetchedMemo[]} */ (
		db
			.prepare(
				`SELECT memo_id, memo_title, memo_summary, memo_content, parent_thread_id
				FROM memos
				WHERE memo_id IN (${placeholders})`
			)
			.all(...memo_ids)
	);

	return memos;
}


module.exports = { fetchMemos };
