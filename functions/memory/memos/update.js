// functions/memory/memos/update.js
const { getDb } = require('../../../database/sqlite');
const { syncVector } = require('../../utils/vectorSync');


/**
 * @typedef {Object} LineEdit
 * @property {number} line - 1-indexed line number
 * @property {string} content - New content for that line
 */

/**
 * @typedef {Object} UpdateMemoParams
 * @property {string} memo_id
 * @property {string} [title]
 * @property {string} [summary]
 * @property {string} [content] - Full replace mode (mutually exclusive with line_edits)
 * @property {LineEdit[]} [line_edits] - Line edit mode (mutually exclusive with content)
 */


/**
 * Apply line edits to existing content.
 * Validates each line number is in bounds; throws if out of range.
 * @param {string} existingContent
 * @param {LineEdit[]} lineEdits
 * @returns {string}
 */
function applyLineEdits(existingContent, lineEdits) {
	const lines = existingContent.split('\n');

	for (const edit of lineEdits) {
		if (edit.line < 1 || edit.line > lines.length) {
			throw new Error(
				`Line number ${edit.line} is out of bounds. Document has ${lines.length} lines.`
			);
		}
		lines[edit.line - 1] = edit.content;
	}

	return lines.join('\n');
}


/**
 * Update a memo's title, summary, and/or content.
 * Content update has two mutually exclusive modes: full replace or line edits.
 * @param {UpdateMemoParams} params
 * @returns {Promise<import('./create').MemoRecord>}
 */
async function updateMemo({ memo_id, title, summary, content, line_edits }) {
	const db = getDb();

	if (content !== undefined && line_edits !== undefined) {
		throw new Error('Cannot use both "content" and "line_edits". They are mutually exclusive.');
	}

	// If line edits mode, resolve new content from existing
	let resolvedContent = content;
	if (line_edits !== undefined) {
		const existing = /** @type {{ memo_content: string } | undefined} */ (
			db.prepare(`SELECT memo_content FROM memos WHERE memo_id = ?`).get(memo_id)
		);

		if (!existing) {
			throw new Error(`Memo not found: ${memo_id}`);
		}

		resolvedContent = applyLineEdits(existing.memo_content, line_edits);
	}


	// Build dynamic SET clause
	const fields = [];
	const values = [];

	if (title !== undefined) {
		fields.push('memo_title = ?');
		values.push(title);
	}

	if (summary !== undefined) {
		fields.push('memo_summary = ?');
		values.push(summary);
	}

	if (resolvedContent !== undefined) {
		fields.push('memo_content = ?');
		values.push(resolvedContent);
	}

	if (fields.length === 0) {
		throw new Error('No fields provided to update.');
	}

	fields.push('updated_at = CURRENT_TIMESTAMP');
	values.push(memo_id);

	const result = /** @type {import('./create').MemoRecord | undefined} */ (
		db
			.prepare(
				`UPDATE memos SET ${fields.join(', ')}
				WHERE memo_id = ?
				RETURNING *`
			)
			.get(...values)
	);

	if (!result) {
		throw new Error(`Memo not found: ${memo_id}`);
	}


	// Sync vector — embeds title + summary (content changes don't affect the vector)
	const vectorText = `Title: ${result.memo_title}\n\nSummary: ${result.memo_summary}`;
	await syncVector('memos', result.memo_id, vectorText);

	return result;
}


module.exports = { updateMemo };
