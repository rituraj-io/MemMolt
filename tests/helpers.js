// Shared test helpers.
// - Mocks the embedder so tests don't download the ~90MB model
// - Resets the in-memory SQLite DB between tests


// Mock the embedder to return deterministic 384-dim vectors derived from text.
// Same input → same vector. Different inputs → different vectors.
// This lets vector search return stable-but-distinguishable rankings.
jest.mock('../functions/utils/embedder', () => {
	/**
	 * @param {string} text
	 * @returns {Float32Array}
	 */
	function fakeEmbed(text) {
		const vec = new Float32Array(384);

		// Seed from text hash so same text yields same vector
		let seed = 0;
		for (let i = 0; i < text.length; i++) {
			seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
		}

		// Fill with pseudo-random floats derived from seed
		let state = seed || 1;
		for (let i = 0; i < 384; i++) {
			state = (state * 1103515245 + 12345) >>> 0;
			vec[i] = ((state & 0xffff) / 0xffff) * 2 - 1;
		}

		// Normalize so distance comparisons behave like all-MiniLM output
		let norm = 0;
		for (let i = 0; i < 384; i++) norm += vec[i] * vec[i];
		norm = Math.sqrt(norm) || 1;
		for (let i = 0; i < 384; i++) vec[i] /= norm;

		return vec;
	}

	return {
		embed: jest.fn(async (text) => fakeEmbed(text)),
		vectorToBlob: (vec) => Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength),
		getExtractor: jest.fn(),
	};
});


const { initSqlite, getDb, closeSqlite } = require('../database/sqlite');


/**
 * Reset the database to a fresh state for each test.
 * Uses a new :memory: connection so triggers/FTS/vec tables are all rebuilt.
 */
function resetDb() {
	closeSqlite();
	initSqlite();
}


module.exports = { resetDb, initSqlite, getDb, closeSqlite };
