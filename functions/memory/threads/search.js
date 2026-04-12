// functions/memory/threads/search.js
const { getDb } = require('../../../database/sqlite');
const { embed, vectorToBlob } = require('../../utils/embedder');
const { rrfMerge } = require('../../utils/rrf');
const { buildFtsQuery } = require('../../utils/ftsQuery');


/**
 * @typedef {Object} ThreadSearchResult
 * @property {string} thread_id
 * @property {string} thread_name
 * @property {string} thread_summary
 * @property {string} parent_bucket_id
 * @property {Array<{ memo_id: string, memo_title: string }>} memos
 * @property {number} score
 */


/**
 * Search threads using hybrid FTS5 + Vector search with RRF
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {Promise<ThreadSearchResult[]>}
 */
async function searchThreads(query, limit = 20) {
	const db = getDb();

	// FTS5 full-text search on thread name/summary. Sanitize the user query to a
	// safe quoted-token MATCH expression; skip FTS entirely if nothing usable remains.
	const ftsQuery = buildFtsQuery(query);
	const ftsResults = ftsQuery
		? /** @type {Array<{ thread_id: string, rank: number }>} */ (
				db
					.prepare(
						`SELECT t.thread_id, rank
			FROM threads_fts
			JOIN threads t ON t.id = threads_fts.rowid
			WHERE threads_fts MATCH ?
			ORDER BY rank
			LIMIT ?`,
					)
					.all(ftsQuery, limit)
			)
		: [];

	// Vector KNN search via sqlite-vec — embed the raw (unsanitized) query
	// so the embedder sees the full natural language input.
	const queryVec = await embed(query);
	const queryBlob = vectorToBlob(queryVec);
	const vectorResults = /** @type {Array<{ id: string }>} */ (
		db
			.prepare(
				`SELECT id
			FROM threads_vec
			WHERE embedding MATCH ?
			ORDER BY distance
			LIMIT ?`,
			)
			.all(queryBlob, limit)
	);

	// Build ranked lists for RRF merge
	const ftsList = ftsResults.map((row, index) => ({
		id: row.thread_id,
		rank: index,
	}));

	const vectorList = vectorResults.map((row, index) => ({
		id: row.id,
		rank: index,
	}));

	const merged = rrfMerge([ftsList, vectorList]);
	const topIds = merged.slice(0, limit).map(r => r.id);

	if (topIds.length === 0) return [];

	// Fetch full thread data for merged result IDs
	const placeholders = topIds.map(() => '?').join(',');
	const threads = /** @type {Array<{ thread_id: string, thread_name: string, thread_summary: string, parent_bucket_id: string }>} */ (
		db
			.prepare(
				`SELECT thread_id, thread_name, thread_summary, parent_bucket_id
			FROM threads
			WHERE thread_id IN (${placeholders})`,
			)
			.all(...topIds)
	);

	// Attach memo titles and RRF score to each thread
	const results = threads.map(thread => {
		const memos = /** @type {Array<{ memo_id: string, memo_title: string }>} */ (
			db
				.prepare(
					`SELECT memo_id, memo_title
				FROM memos
				WHERE parent_thread_id = ?`,
				)
				.all(thread.thread_id)
		);

		const rrfEntry = merged.find(r => r.id === thread.thread_id);

		return {
			...thread,
			memos,
			score: rrfEntry ? rrfEntry.score : 0,
		};
	});

	results.sort((a, b) => b.score - a.score);

	return results;
}


module.exports = { searchThreads };
