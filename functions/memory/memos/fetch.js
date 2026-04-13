// functions/memory/memos/fetch.js
const { getDb } = require('../../../database/sqlite');
const { parseLinks, parseMemoRef } = require('../../utils/memoLinks');


// Cosine-similarity threshold for "similar memos" (0..1). Embeddings from
// all-MiniLM-L6-v2 are L2-normalized, so we can convert vec0's L2 distance
// to cosine similarity via `cos = 1 - L2² / 2`.
const SIMILARITY_THRESHOLD = 0.5;
const SIMILAR_MEMOS_LIMIT = 5;

// Fetch this many KNN candidates per memo. We need generous headroom
// because we filter out self and apply the cosine threshold afterwards.
const KNN_CANDIDATES = SIMILAR_MEMOS_LIMIT * 3;


/**
 * @typedef {Object} LinkedMemoRef
 * @property {string} memo_id
 * @property {string | null} heading
 * @property {string} memo_title
 * @property {string} memo_summary
 */

/**
 * @typedef {Object} SimilarMemoRef
 * @property {string} memo_id
 * @property {string} memo_title
 * @property {string} memo_summary
 * @property {number} similarity - Cosine similarity (0..1)
 */

/**
 * @typedef {Object} FetchedMemo
 * @property {string} memo_id
 * @property {string} memo_title
 * @property {string} memo_summary
 * @property {string} memo_content
 * @property {string} parent_thread_id
 * @property {LinkedMemoRef[]} linked_memos
 * @property {SimilarMemoRef[]} similar_memos
 */


/**
 * Resolve stored link refs (e.g. "M:2#heading-2") into enriched objects with
 * the target memo's title + summary. Unknown refs are dropped silently.
 *
 * @param {string[]} refs
 * @returns {LinkedMemoRef[]}
 */
function resolveLinkedMemos(refs) {
	if (refs.length === 0) return [];

	const db = getDb();

	const parsed = refs.map(parseMemoRef);
	const uniqueIds = [...new Set(parsed.map(p => p.memo_id))];

	const placeholders = uniqueIds.map(() => '?').join(',');
	const rows = /** @type {Array<{ memo_id: string, memo_title: string, memo_summary: string }>} */ (
		db
			.prepare(
				`SELECT memo_id, memo_title, memo_summary
				FROM memos
				WHERE memo_id IN (${placeholders})`
			)
			.all(...uniqueIds)
	);

	const byId = new Map(rows.map(r => [r.memo_id, r]));

	// Preserve original ref order; drop refs whose memo doesn't exist.
	const out = [];
	for (const { memo_id, heading } of parsed) {
		const target = byId.get(memo_id);
		if (!target) continue;
		out.push({
			memo_id,
			heading,
			memo_title: target.memo_title,
			memo_summary: target.memo_summary,
		});
	}

	return out;
}


/**
 * Find memos most similar to a given memo using the vec0 KNN index.
 * Returns up to SIMILAR_MEMOS_LIMIT results above SIMILARITY_THRESHOLD,
 * excluding the memo itself.
 *
 * @param {string} memo_id
 * @returns {SimilarMemoRef[]}
 */
function findSimilarMemos(memo_id) {
	const db = getDb();

	// Pull this memo's embedding from vec0, then run KNN using that blob.
	const self = /** @type {{ embedding: Buffer } | undefined} */ (
		db.prepare(`SELECT embedding FROM memos_vec WHERE id = ?`).get(memo_id)
	);

	if (!self) return [];

	const knn = /** @type {Array<{ id: string, distance: number }>} */ (
		db
			.prepare(
				`SELECT id, distance
				FROM memos_vec
				WHERE embedding MATCH ?
				ORDER BY distance
				LIMIT ?`
			)
			.all(self.embedding, KNN_CANDIDATES)
	);

	// Convert L2 distance to cosine similarity (valid for normalized vectors).
	// Filter out self + anything below the threshold, then take the top N.
	const filtered = knn
		.filter(row => row.id !== memo_id)
		.map(row => ({
			id: row.id,
			similarity: 1 - (row.distance * row.distance) / 2,
		}))
		.filter(row => row.similarity >= SIMILARITY_THRESHOLD)
		.slice(0, SIMILAR_MEMOS_LIMIT);

	if (filtered.length === 0) return [];


	// Hydrate with title + summary in one round-trip.
	const ids = filtered.map(r => r.id);
	const placeholders = ids.map(() => '?').join(',');
	const rows = /** @type {Array<{ memo_id: string, memo_title: string, memo_summary: string }>} */ (
		db
			.prepare(
				`SELECT memo_id, memo_title, memo_summary
				FROM memos
				WHERE memo_id IN (${placeholders})`
			)
			.all(...ids)
	);

	const byId = new Map(rows.map(r => [r.memo_id, r]));

	// Preserve similarity ordering from the KNN result.
	const out = [];
	for (const r of filtered) {
		const hit = byId.get(r.id);
		if (!hit) continue;
		out.push({
			memo_id: hit.memo_id,
			memo_title: hit.memo_title,
			memo_summary: hit.memo_summary,
			similarity: r.similarity,
		});
	}

	return out;
}


/**
 * Fetch one or more memos by ID, returning full content plus resolved
 * interlinks and a top-N list of semantically similar memos per result.
 *
 * @param {string[]} memo_ids
 * @returns {FetchedMemo[]}
 */
function fetchMemos(memo_ids) {
	const db = getDb();

	if (memo_ids.length === 0) return [];

	const placeholders = memo_ids.map(() => '?').join(',');
	const rows = /** @type {Array<{ memo_id: string, memo_title: string, memo_summary: string, memo_content: string, linked_memos: string, parent_thread_id: string }>} */ (
		db
			.prepare(
				`SELECT memo_id, memo_title, memo_summary, memo_content, linked_memos, parent_thread_id
				FROM memos
				WHERE memo_id IN (${placeholders})`
			)
			.all(...memo_ids)
	);


	// Enrich each memo with resolved interlinks + similarity neighbours.
	return rows.map(row => ({
		memo_id: row.memo_id,
		memo_title: row.memo_title,
		memo_summary: row.memo_summary,
		memo_content: row.memo_content,
		parent_thread_id: row.parent_thread_id,
		linked_memos: resolveLinkedMemos(parseLinks(row.linked_memos)),
		similar_memos: findSimilarMemos(row.memo_id),
	}));
}


module.exports = { fetchMemos };
