const { getDb } = require('../../database/sqlite');
const { embed, vectorToBlob } = require('./embedder');


// Maps entity type to the corresponding vec0 virtual table name
const VEC_TABLES = {
	buckets: 'buckets_vec',
	threads: 'threads_vec',
	memos: 'memos_vec',
};


/**
 * Upsert a vector entry for the given entity. Generates the embedding locally
 * via @xenova/transformers, then stores it as a BLOB in the vec0 table.
 * @param {'buckets' | 'threads' | 'memos'} entityType
 * @param {string} id - The entity ID (e.g. B:1, T:5, M:42)
 * @param {string} text - The text to embed (summary, or title+summary for memos)
 */
async function syncVector(entityType, id, text) {
	const db = getDb();
	const table = VEC_TABLES[entityType];

	const vector = await embed(text);
	const blob = vectorToBlob(vector);

	// vec0 tables don't support ON CONFLICT, so delete-then-insert for upsert
	db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
	db.prepare(`INSERT INTO ${table} (id, embedding) VALUES (?, ?)`).run(id, blob);
}


/**
 * Delete a single vector entry.
 * @param {'buckets' | 'threads' | 'memos'} entityType
 * @param {string} id
 */
function deleteVector(entityType, id) {
	const db = getDb();
	const table = VEC_TABLES[entityType];
	db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}


/**
 * Delete multiple vector entries by ID.
 * @param {'buckets' | 'threads' | 'memos'} entityType
 * @param {string[]} ids
 */
function deleteVectors(entityType, ids) {
	if (ids.length === 0) return;

	const db = getDb();
	const table = VEC_TABLES[entityType];
	const placeholders = ids.map(() => '?').join(',');
	db.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).run(...ids);
}


module.exports = { syncVector, deleteVector, deleteVectors, VEC_TABLES };
