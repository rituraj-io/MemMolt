// functions/memory/buckets/update.js
const { getDb } = require('../../../database/sqlite');
const { syncVector } = require('../../utils/vectorSync');


/**
 * @typedef {Object} UpdateBucketParams
 * @property {string} bucket_id
 * @property {string} [name]
 * @property {string} [summary]
 */


/**
 * Update a bucket's name and/or summary
 * @param {UpdateBucketParams} params
 * @returns {Promise<import('./create').BucketRecord>}
 */
async function updateBucket({ bucket_id, name, summary }) {
	const db = getDb();

	// Build dynamic SET clause from provided fields
	const fields = [];
	const values = [];

	if (name !== undefined) {
		fields.push('bucket_name = ?');
		values.push(name);
	}

	if (summary !== undefined) {
		fields.push('bucket_summary = ?');
		values.push(summary);
	}

	if (fields.length === 0) {
		throw new Error('No fields provided to update.');
	}

	fields.push('updated_at = CURRENT_TIMESTAMP');
	values.push(bucket_id);

	// Execute update and get updated record back
	const result = /** @type {import('./create').BucketRecord | undefined} */ (
		db
			.prepare(
				`UPDATE buckets SET ${fields.join(', ')}
			WHERE bucket_id = ?
			RETURNING *`,
			)
			.get(...values)
	);

	if (!result) {
		throw new Error(`Bucket not found: ${bucket_id}`);
	}

	// Re-sync vector with updated summary
	await syncVector('buckets', result.bucket_id, result.bucket_summary);

	return result;
}


module.exports = { updateBucket };
