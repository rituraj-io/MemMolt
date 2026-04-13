// functions/memory/memos/create.js
const { getDb } = require('../../../database/sqlite');
const { syncVector } = require('../../utils/vectorSync');
const { extractMemoLinks, normalizeMemoLinks, serializeLinks } = require('../../utils/memoLinks');


/**
 * @typedef {Object} CreateMemoParams
 * @property {string} parent_thread_id
 * @property {string} title
 * @property {string} summary
 * @property {string} content
 */

/**
 * @typedef {Object} MemoRecord
 * @property {string} memo_id
 * @property {string} memo_title
 * @property {string} memo_summary
 * @property {string} memo_content
 * @property {string} parent_thread_id
 * @property {string} created_at
 * @property {string} updated_at
 */


/**
 * Create a new memo under a thread
 * @param {CreateMemoParams} params
 * @returns {Promise<MemoRecord>}
 */
async function createMemo({ parent_thread_id, title, summary, content }) {
	const db = getDb();

	// Verify parent thread exists
	const thread = db
		.prepare(`SELECT thread_id FROM threads WHERE thread_id = ?`)
		.get(parent_thread_id);

	if (!thread) {
		throw new Error(`Parent thread not found: ${parent_thread_id}`);
	}

	// Normalize memo-link headings (e.g. "#My Section" → "#my-section") and
	// extract the internal refs from the resulting canonical content.
	const normalizedContent = normalizeMemoLinks(content);
	const linkedMemos = serializeLinks(extractMemoLinks(normalizedContent));

	const result = /** @type {MemoRecord} */ (
		db
			.prepare(
				`INSERT INTO memos (memo_id, memo_title, memo_summary, memo_content, linked_memos, parent_thread_id)
				VALUES ('M:' || (SELECT COALESCE(MAX(id), 0) + 1 FROM memos), ?, ?, ?, ?, ?)
				RETURNING *`
			)
			.get(title, summary, normalizedContent, linkedMemos, parent_thread_id)
	);

	// Vector is title + summary, not content
	const vectorText = `Title: ${result.memo_title}\n\nSummary: ${result.memo_summary}`;
	await syncVector('memos', result.memo_id, vectorText);

	return result;
}


module.exports = { createMemo };
