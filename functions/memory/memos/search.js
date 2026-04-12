// functions/memory/memos/search.js
const { getDb } = require('../../../database/sqlite');
const { embed, vectorToBlob } = require('../../utils/embedder');
const { rrfMerge } = require('../../utils/rrf');
const { buildFtsQuery } = require('../../utils/ftsQuery');


/**
 * @typedef {Object} MemoSearchResult
 * @property {string} memo_id
 * @property {string} memo_title
 * @property {string} content_preview
 * @property {string} parent_thread_id
 * @property {number} score
 */

/**
 * @typedef {Object} SearchMemosParams
 * @property {string} query
 * @property {string} [bucket_id] - Optional: scope to a specific bucket
 * @property {string} [thread_id] - Optional: scope to a specific thread
 * @property {number} [limit]
 */


/**
 * Search memos using hybrid FTS5 + Vector search with RRF.
 * Optionally scoped to a bucket and/or thread.
 * @param {SearchMemosParams} params
 * @returns {Promise<MemoSearchResult[]>}
 */
async function searchMemos({ query, bucket_id, thread_id, limit = 20 }) {
	const db = getDb();

	// Determine scope filter for SQL
	let scopeJoin = '';
	let scopeWhere = '';
	const scopeParams = [];

	if (thread_id) {
		scopeWhere = ' AND m.parent_thread_id = ?';
		scopeParams.push(thread_id);
	} else if (bucket_id) {
		scopeJoin = ' JOIN threads t ON t.thread_id = m.parent_thread_id';
		scopeWhere = ' AND t.parent_bucket_id = ?';
		scopeParams.push(bucket_id);
	}

	// FTS5 search with optional scope. Sanitize the query to a safe quoted-token
	// MATCH expression; skip FTS entirely if nothing usable remains.
	const ftsQuery = buildFtsQuery(query);
	const ftsResults = ftsQuery
		? /** @type {Array<{ memo_id: string, rank: number }>} */ (
				db
					.prepare(
						`SELECT m.memo_id, rank
				FROM memos_fts
				JOIN memos m ON m.id = memos_fts.rowid${scopeJoin}
				WHERE memos_fts MATCH ?${scopeWhere}
				ORDER BY rank
				LIMIT ?`
					)
					.all(ftsQuery, ...scopeParams, limit)
			)
		: [];


	// Vector search (sqlite-vec KNN). Embed the raw query (not the sanitized FTS form)
	// so the embedder sees the full natural language input.
	// Fetch more when scoped so post-filter doesn't exhaust results.
	const queryVec = await embed(query);
	const queryBlob = vectorToBlob(queryVec);
	const vectorLimit = bucket_id || thread_id ? limit * 3 : limit;
	const rawVectorResults = /** @type {Array<{ id: string }>} */ (
		db
			.prepare(
				`SELECT id
				FROM memos_vec
				WHERE embedding MATCH ?
				ORDER BY distance
				LIMIT ?`
			)
			.all(queryBlob, vectorLimit)
	);

	// If scoped, filter vector results to matching IDs using SQL
	let vectorIds = rawVectorResults.map(r => r.id);
	if (thread_id || bucket_id) {
		const scopedMemoIds = new Set(
			/** @type {Array<{ memo_id: string }>} */ (
				db
					.prepare(
						thread_id
							? `SELECT memo_id FROM memos WHERE parent_thread_id = ?`
							: `SELECT m.memo_id FROM memos m
								JOIN threads t ON t.thread_id = m.parent_thread_id
								WHERE t.parent_bucket_id = ?`
					)
					.all(thread_id || bucket_id)
			).map(r => r.memo_id)
		);
		vectorIds = vectorIds.filter(id => scopedMemoIds.has(id));
	}


	// Build ranked lists for RRF
	const ftsList = ftsResults.map((row, index) => ({
		id: row.memo_id,
		rank: index,
	}));

	const vectorList = vectorIds.map((id, index) => ({
		id: id,
		rank: index,
	}));

	const merged = rrfMerge([ftsList, vectorList]);
	const topIds = merged.slice(0, limit).map(r => r.id);

	if (topIds.length === 0) return [];


	// Fetch memo data with content preview (first 400 chars)
	const placeholders = topIds.map(() => '?').join(',');
	const memos = /** @type {Array<{ memo_id: string, memo_title: string, content_preview: string, parent_thread_id: string }>} */ (
		db
			.prepare(
				`SELECT memo_id, memo_title, SUBSTR(memo_content, 1, 400) AS content_preview, parent_thread_id
				FROM memos
				WHERE memo_id IN (${placeholders})`
			)
			.all(...topIds)
	);

	const results = memos.map(memo => {
		const rrfEntry = merged.find(r => r.id === memo.memo_id);
		return {
			...memo,
			score: rrfEntry ? rrfEntry.score : 0,
		};
	});

	results.sort((a, b) => b.score - a.score);

	return results;
}


module.exports = { searchMemos };
