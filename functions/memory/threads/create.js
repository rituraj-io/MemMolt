// functions/memory/threads/create.js
const { getDb } = require('../../../database/sqlite');
const { syncVector } = require('../../utils/vectorSync');


/**
 * @typedef {Object} CreateThreadParams
 * @property {string} parent_bucket_id
 * @property {string} name
 * @property {string} summary
 */

/**
 * @typedef {Object} ThreadRecord
 * @property {string} thread_id
 * @property {string} thread_name
 * @property {string} thread_summary
 * @property {string} parent_bucket_id
 * @property {string} created_at
 * @property {string} updated_at
 */


/**
 * Create a new thread under a bucket
 * @param {CreateThreadParams} params
 * @returns {Promise<ThreadRecord>}
 */
async function createThread({ parent_bucket_id, name, summary }) {
	const db = getDb();

	// Verify parent bucket exists
	const bucket = db
		.prepare(`SELECT bucket_id FROM buckets WHERE bucket_id = ?`)
		.get(parent_bucket_id);

	if (!bucket) {
		throw new Error(`Parent bucket not found: ${parent_bucket_id}`);
	}

	const result = /** @type {ThreadRecord} */ (
		db
			.prepare(
				`INSERT INTO threads (thread_id, thread_name, thread_summary, parent_bucket_id)
			VALUES ('T:' || (SELECT COALESCE(MAX(id), 0) + 1 FROM threads), ?, ?, ?)
			RETURNING *`,
			)
			.get(name, summary, parent_bucket_id)
	);

	await syncVector('threads', result.thread_id, result.thread_summary);

	return result;
}


module.exports = { createThread };
