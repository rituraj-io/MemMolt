// Local embedder utility. Loads all-MiniLM-L6-v2 via @xenova/transformers
// and exposes a simple embed(text) -> Float32Array of length 384.


/** @type {any} */
let extractor = null;

/** @type {Promise<any> | null} */
let loadingPromise = null;


/**
 * Lazily load the embedding model. First call downloads ~90MB on first run
 * and caches to disk; subsequent calls reuse the cached model.
 * @returns {Promise<any>}
 */
async function getExtractor() {
	if (extractor) return extractor;
	if (loadingPromise) return loadingPromise;

	loadingPromise = (async () => {
		// Dynamic import — @xenova/transformers is an ESM package
		const { pipeline } = await import('@xenova/transformers');
		extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
		return extractor;
	})();

	return loadingPromise;
}


/**
 * Generate a 384-dimensional embedding vector for the given text.
 * @param {string} text
 * @returns {Promise<Float32Array>}
 */
async function embed(text) {
	const pipe = await getExtractor();
	const output = await pipe(text, { pooling: 'mean', normalize: true });
	return output.data;
}


/**
 * Convert a Float32Array embedding into a Buffer for insertion into sqlite-vec.
 * sqlite-vec accepts vectors as BLOBs of tightly-packed little-endian float32s.
 * @param {Float32Array} vector
 * @returns {Buffer}
 */
function vectorToBlob(vector) {
	return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}


module.exports = { embed, vectorToBlob, getExtractor };
