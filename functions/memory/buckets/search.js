// functions/memory/buckets/search.js
const { getDb } = require('../../../database/sqlite');
const { embed, vectorToBlob } = require('../../utils/embedder');
const { rrfMerge } = require('../../utils/rrf');
const { buildFtsQuery } = require('../../utils/ftsQuery');


/**
 * @typedef {Object} BucketSearchResult
 * @property {string} bucket_id
 * @property {string} bucket_name
 * @property {string} bucket_summary
 * @property {Array<{ thread_id: string, thread_name: string }>} threads
 * @property {number} score
 */


/**
 * Search buckets using hybrid FTS5 + Vector search with RRF
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {Promise<BucketSearchResult[]>}
 */
async function searchBuckets(query, limit = 20) {
	const db = getDb();

	// FTS5 full-text search ranked by BM25. Sanitize the query to a safe
	// quoted-token MATCH expression just before querying; if nothing usable
	// remains, skip FTS entirely and let vector search carry the result.
	const ftsQuery = buildFtsQuery(query);
	const ftsResults = ftsQuery
		? /** @type {{ bucket_id: string, rank: number }[]} */ (
				db
					.prepare(
						`SELECT b.bucket_id, rank
			FROM buckets_fts
			JOIN buckets b ON b.id = buckets_fts.rowid
			WHERE buckets_fts MATCH ?
			ORDER BY rank
			LIMIT ?`,
					)
					.all(ftsQuery, limit)
			)
		: [];

	// sqlite-vec KNN vector search — embed query and convert to BLOB
	const queryVec = await embed(query);
	const queryBlob = vectorToBlob(queryVec);
	const vectorResults = /** @type {{ id: string }[]} */ (
		db
			.prepare(
				`SELECT id
			FROM buckets_vec
			WHERE embedding MATCH ?
			ORDER BY distance
			LIMIT ?`,
			)
			.all(queryBlob, limit)
	);

	// Build ranked lists for RRF merge
	const ftsList = ftsResults.map((row, index) => ({ id: row.bucket_id, rank: index }));
	const vectorList = vectorResults.map((row, index) => ({ id: row.id, rank: index }));

	// Merge and take top N
	const merged = rrfMerge([ftsList, vectorList]);
	const topIds = merged.slice(0, limit).map(r => r.id);

	if (topIds.length === 0) return [];

	// Fetch full bucket records for top IDs
	const placeholders = topIds.map(() => '?').join(',');
	const buckets = /** @type {{ bucket_id: string, bucket_name: string, bucket_summary: string }[]} */ (
		db
			.prepare(
				`SELECT bucket_id, bucket_name, bucket_summary
			FROM buckets
			WHERE bucket_id IN (${placeholders})`,
			)
			.all(...topIds)
	);

	// Attach top-5 threads and RRF score to each bucket
	const results = buckets.map(bucket => {
		const threads = /** @type {{ thread_id: string, thread_name: string }[]} */ (
			db
				.prepare(
					`SELECT thread_id, thread_name
				FROM threads
				WHERE parent_bucket_id = ?
				LIMIT 5`,
				)
				.all(bucket.bucket_id)
		);

		const rrfEntry = merged.find(r => r.id === bucket.bucket_id);

		return {
			...bucket,
			threads,
			score: rrfEntry ? rrfEntry.score : 0,
		};
	});

	// Return sorted by RRF score descending
	results.sort((a, b) => b.score - a.score);

	return results;
}


module.exports = { searchBuckets };
