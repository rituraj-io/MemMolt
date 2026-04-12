// Sanitize a user-supplied search query into a safe FTS5 MATCH expression.
//
// Usage: call this ONLY immediately before running an FTS5 MATCH query.
// Do NOT feed the sanitized output into the vector search — the embedder
// should see the original natural-language query.


// FTS5 treats these words as boolean operators; strip them so they can't
// accidentally change query semantics when a user types them literally.
const FTS_OPERATORS = new Set(['AND', 'OR', 'NOT', 'NEAR']);


/**
 * Turn an arbitrary user query into a quoted-token FTS5 MATCH expression.
 *
 * Pipeline:
 *   1. Replace all non-letter / non-number / non-whitespace chars with spaces
 *      (drops quotes, hyphens, parens, `*`, `^`, colons, etc. that FTS5 parses)
 *   2. Split on whitespace and drop any FTS boolean operator tokens
 *   3. Wrap each remaining token in double quotes so it becomes a literal phrase
 *
 * Returns an empty string when no usable tokens remain — callers should
 * treat an empty result as "skip the FTS query, return no FTS hits".
 *
 * @param {string} query
 * @returns {string}
 */
function buildFtsQuery(query) {
	if (!query || typeof query !== 'string') return '';

	// Step 1: strip everything except letters (any language), numbers, whitespace
	const sanitized = query.replace(/[^\p{L}\p{N}\s]/gu, ' ');

	// Step 2: tokenize, drop empties and boolean operators
	const tokens = sanitized
		.split(/\s+/)
		.filter((t) => t.length > 0 && !FTS_OPERATORS.has(t.toUpperCase()));

	if (tokens.length === 0) return '';

	// Step 3: quote each token as a literal phrase
	return tokens.map((t) => `"${t}"`).join(' ');
}


module.exports = { buildFtsQuery };
