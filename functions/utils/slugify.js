// functions/utils/slugify.js
// GitHub-style heading slugifier. Mirrors how GitHub renders heading anchors
// so our memo links behave the same way Obsidian/GitHub users expect.


/**
 * Convert a heading string into a GitHub-style anchor slug.
 *
 * Rules:
 * - Lowercase the whole string.
 * - Strip punctuation (keep alphanumerics, hyphens, underscores, and whitespace).
 *   Underscores are preserved because GitHub's slugger keeps them.
 * - Replace whitespace runs with a single hyphen.
 * - Collapse repeated hyphens.
 * - Trim leading / trailing hyphens.
 *
 * Note: duplicate-heading disambiguation (-1, -2 suffixes) is intentionally
 * not handled here — we operate on a single heading string in isolation.
 *
 * @param {string} heading
 * @returns {string}
 */
function slugify(heading) {
	if (typeof heading !== 'string') return '';

	return heading
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')        // strip combining diacritics
		.replace(/[^a-z0-9_\s-]/g, '')          // keep alnum + underscore + space + hyphen
		.trim()
		.replace(/\s+/g, '-')                   // spaces → single hyphen
		.replace(/-+/g, '-')                    // collapse repeated hyphens
		.replace(/^-|-$/g, '');                 // trim edge hyphens
}


module.exports = { slugify };
