// functions/utils/memoLinks.js
// Parse & normalize internal memo links from memo content. We only care about
// references that point to memos stored in our SQLite DB — i.e. URLs of the
// form "M:<id>" optionally with a "#<heading>" anchor. External/file links
// like [text](./foo.md) are ignored.
//
// The LLM is allowed to write headings in their human-readable form
// (e.g. `[t](M:2#My Section: Part 1)`). We slugify to the GitHub-style
// anchor form at save time. Pre-slugified refs pass through unchanged
// (slugifying a slug is idempotent).


const { slugify } = require('./slugify');


// Matches the URL portion of a Markdown link to an internal memo:
//   ](M:123)               → id only
//   ](M:123#anything here) → id + raw heading (anything except `)` or newline)
// Capture groups: 1 = id (e.g. "M:123"), 2 = raw heading text or undefined.
const MEMO_LINK_RE = /\]\((M:\d+)(?:#([^)\n]+))?\)/g;


// Strip fenced code blocks (``` ... ```) and inline code (`...`) so links
// that are only *shown as examples* in a memo don't get treated as real refs
// — and aren't rewritten by normalizeMemoLinks either.
const FENCED_CODE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;


/**
 * Replace code spans/blocks with sentinel placeholders so subsequent
 * regex operations leave them alone. Returns the masked string and a
 * function to restore the original code.
 *
 * @param {string} content
 * @returns {{ masked: string, unmask: (s: string) => string }}
 */
function maskCodeRegions(content) {
	/** @type {string[]} */
	const stash = [];
	/** @type {(match: string) => string} */
	const store = (match) => {
		stash.push(match);
		return `\u0000CODE${stash.length - 1}\u0000`;
	};
	const masked = content.replace(FENCED_CODE_RE, store).replace(INLINE_CODE_RE, store);
	/** @type {(s: string) => string} */
	const unmask = (s) => s.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => stash[Number(i)]);
	return { masked, unmask };
}


/**
 * Rewrite memo-link headings to their canonical GitHub-style slug form,
 * leaving code blocks/spans untouched. Idempotent: running twice is a no-op.
 *
 *   [t](M:2#My Section)   →  [t](M:2#my-section)
 *   [t](M:2#my-section)   →  [t](M:2#my-section)   (unchanged)
 *   [t](M:2)              →  [t](M:2)              (no heading to normalize)
 *
 * @param {string} content
 * @returns {string}
 */
function normalizeMemoLinks(content) {
	if (typeof content !== 'string' || content.length === 0) return content;

	const { masked, unmask } = maskCodeRegions(content);

	const rewritten = masked.replace(MEMO_LINK_RE, (_match, id, rawHeading) => {
		if (rawHeading === undefined) return `](${id})`;
		const slug = slugify(rawHeading);
		// If slugify strips everything (e.g. heading was punctuation-only),
		// drop the anchor rather than emit `](M:2#)`.
		return slug ? `](${id}#${slug})` : `](${id})`;
	});

	return unmask(rewritten);
}


/**
 * Extract all internal memo link refs from markdown content.
 * Returns a deduplicated, insertion-ordered array of refs like
 * ["M:2#heading-2", "M:5"].
 *
 * Links inside fenced / inline code are ignored. Raw headings are slugified
 * on the fly (same as normalizeMemoLinks) so extraction matches the DB form
 * regardless of whether the caller already normalized.
 *
 * @param {string} content
 * @returns {string[]}
 */
function extractMemoLinks(content) {
	if (typeof content !== 'string' || content.length === 0) return [];

	const { masked } = maskCodeRegions(content);

	const seen = new Set();
	const out = [];

	for (const match of masked.matchAll(MEMO_LINK_RE)) {
		const id = match[1];
		const rawHeading = match[2];
		const slug = rawHeading ? slugify(rawHeading) : '';
		const ref = slug ? `${id}#${slug}` : id;

		if (!seen.has(ref)) {
			seen.add(ref);
			out.push(ref);
		}
	}

	return out;
}


/**
 * Split a ref like "M:2#heading-2" into its memo id and optional heading.
 * @param {string} ref
 * @returns {{ memo_id: string, heading: string | null }}
 */
function parseMemoRef(ref) {
	const hashIdx = ref.indexOf('#');
	if (hashIdx === -1) {
		return { memo_id: ref, heading: null };
	}
	return {
		memo_id: ref.slice(0, hashIdx),
		heading: ref.slice(hashIdx + 1),
	};
}


/**
 * Serialize a list of refs to the JSON string stored in memos.linked_memos.
 * @param {string[]} refs
 * @returns {string}
 */
function serializeLinks(refs) {
	return JSON.stringify(refs);
}


/**
 * Parse the JSON string stored in memos.linked_memos back into an array.
 * Tolerates null / empty / malformed values by returning [].
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
function parseLinks(raw) {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}


module.exports = {
	extractMemoLinks,
	normalizeMemoLinks,
	parseMemoRef,
	serializeLinks,
	parseLinks,
};
