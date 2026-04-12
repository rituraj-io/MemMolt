// functions/memory/threads/update.js
const { getDb } = require('../../../database/sqlite');
const { syncVector } = require('../../utils/vectorSync');


/**
 * @typedef {Object} UpdateThreadParams
 * @property {string} thread_id
 * @property {string} [name]
 * @property {string} [summary]
 */


/**
 * Update a thread's name and/or summary
 * @param {UpdateThreadParams} params
 * @returns {Promise<import('./create').ThreadRecord>}
 */
async function updateThread({ thread_id, name, summary }) {
	const db = getDb();

	// Build dynamic SET clause from provided fields
	const fields = [];
	const values = [];

	if (name !== undefined) {
		fields.push('thread_name = ?');
		values.push(name);
	}

	if (summary !== undefined) {
		fields.push('thread_summary = ?');
		values.push(summary);
	}

	if (fields.length === 0) {
		throw new Error('No fields provided to update.');
	}

	fields.push('updated_at = CURRENT_TIMESTAMP');
	values.push(thread_id);

	const result = /** @type {import('./create').ThreadRecord | undefined} */ (
		db
			.prepare(
				`UPDATE threads SET ${fields.join(', ')}
			WHERE thread_id = ?
			RETURNING *`,
			)
			.get(...values)
	);

	if (!result) {
		throw new Error(`Thread not found: ${thread_id}`);
	}

	// Sync updated summary to vector store
	await syncVector('threads', result.thread_id, result.thread_summary);

	return result;
}


module.exports = { updateThread };
