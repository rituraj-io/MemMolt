/**
 * @typedef {Object} RRFInput
 * @property {string} id - The entity ID
 * @property {number} rank - The rank position (0-indexed)
 */

/**
 * @typedef {Object} RRFResult
 * @property {string} id - The entity ID
 * @property {number} score - The combined RRF score
 */


/**
 * Merge multiple ranked result sets using Reciprocal Rank Fusion
 * @param {RRFInput[][]} rankedLists - Array of ranked result lists
 * @param {number} [k=60] - RRF constant (default 60)
 * @returns {RRFResult[]} - Combined results sorted by RRF score descending
 */
function rrfMerge(rankedLists, k = 60) {
	/** @type {Map<string, number>} */
	const scores = new Map();

	for (const list of rankedLists) {
		for (const item of list) {
			const current = scores.get(item.id) || 0;
			scores.set(item.id, current + 1 / (k + item.rank));
		}
	}

	/** @type {RRFResult[]} */
	const results = [];
	for (const [id, score] of scores) {
		results.push({ id, score });
	}

	results.sort((a, b) => b.score - a.score);

	return results;
}


module.exports = { rrfMerge };
