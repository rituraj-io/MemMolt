// functions/memory/buckets/create.js
const { getDb } = require('../../../database/sqlite');
const { syncVector } = require('../../utils/vectorSync');


/**
 * @typedef {Object} CreateBucketParams
 * @property {string} name
 * @property {string} summary
 */

/**
 * @typedef {Object} BucketRecord
 * @property {string} bucket_id
 * @property {string} bucket_name
 * @property {string} bucket_summary
 * @property {string} created_at
 * @property {string} updated_at
 */


/**
 * Create a new bucket
 * @param {CreateBucketParams} params
 * @returns {Promise<BucketRecord>}
 */
async function createBucket({ name, summary }) {
	const db = getDb();

	// Insert bucket with auto-incremented string ID, get full record back
	const result = /** @type {BucketRecord} */ (
		db
			.prepare(
				`INSERT INTO buckets (bucket_id, bucket_name, bucket_summary)
			VALUES ('B:' || (SELECT COALESCE(MAX(id), 0) + 1 FROM buckets), ?, ?)
			RETURNING *`,
			)
			.get(name, summary)
	);

	// Sync embedding to vec table
	await syncVector('buckets', result.bucket_id, result.bucket_summary);

	return result;
}


module.exports = { createBucket };
