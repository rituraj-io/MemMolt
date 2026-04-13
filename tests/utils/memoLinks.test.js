// tests/utils/memoLinks.test.js
const {
	extractMemoLinks,
	normalizeMemoLinks,
	parseMemoRef,
	serializeLinks,
	parseLinks,
} = require('../../functions/utils/memoLinks');


describe('extractMemoLinks', () => {
	it('returns empty array for empty / non-string input', () => {
		expect(extractMemoLinks('')).toEqual([]);
		// @ts-expect-error
		expect(extractMemoLinks(null)).toEqual([]);
		// @ts-expect-error
		expect(extractMemoLinks(undefined)).toEqual([]);
	});

	it('extracts a bare memo reference without heading', () => {
		const md = 'See [the other memo](M:2) for details.';
		expect(extractMemoLinks(md)).toEqual(['M:2']);
	});

	it('extracts a memo reference with a heading slug', () => {
		const md = 'Read [Color theory](M:2#heading-2) first.';
		expect(extractMemoLinks(md)).toEqual(['M:2#heading-2']);
	});

	it('extracts multiple refs in document order', () => {
		const md = 'First [a](M:3), then [b](M:1#intro), then [c](M:7).';
		expect(extractMemoLinks(md)).toEqual(['M:3', 'M:1#intro', 'M:7']);
	});

	it('deduplicates identical refs', () => {
		const md = '[x](M:2) and [y](M:2) and [z](M:2#s)';
		expect(extractMemoLinks(md)).toEqual(['M:2', 'M:2#s']);
	});

	it('ignores external / file links', () => {
		const md = 'See [file](./VERSION.md#install) and [web](https://example.com).';
		expect(extractMemoLinks(md)).toEqual([]);
	});

	it('ignores links that look like memos but are not (wrong prefix)', () => {
		const md = '[nope](N:2) [nope2](m:2) [nope3](B:2)';
		expect(extractMemoLinks(md)).toEqual([]);
	});

	it('mixes valid and ignored links correctly', () => {
		const md = 'See [file](./doc.md) and [memo](M:5#heading-2) now.';
		expect(extractMemoLinks(md)).toEqual(['M:5#heading-2']);
	});

	it('ignores links inside fenced code blocks', () => {
		const md = [
			'Real link [a](M:1) here.',
			'```',
			'Example syntax: [b](M:99#demo)',
			'```',
			'Also [c](M:2).',
		].join('\n');
		expect(extractMemoLinks(md)).toEqual(['M:1', 'M:2']);
	});

	it('ignores links inside inline code spans', () => {
		const md = 'Use `[x](M:99)` as the syntax. Then really go to [real](M:1).';
		expect(extractMemoLinks(md)).toEqual(['M:1']);
	});

	it('allows underscores in heading slug (GitHub preserves _ in anchors)', () => {
		const md = 'See [thing](M:4#my_section).';
		expect(extractMemoLinks(md)).toEqual(['M:4#my_section']);
	});
});


describe('extractMemoLinks with raw headings', () => {
	it('slugifies natural-form headings on extract', () => {
		const md = 'See [intro](M:4#My Section: Part 1).';
		expect(extractMemoLinks(md)).toEqual(['M:4#my-section-part-1']);
	});

	it('is idempotent against pre-slugified headings', () => {
		const md = 'See [intro](M:4#my-section-part-1).';
		expect(extractMemoLinks(md)).toEqual(['M:4#my-section-part-1']);
	});

	it('dedupes equivalent natural + slug forms to a single ref', () => {
		const md = '[a](M:4#My Section) and [b](M:4#my-section)';
		expect(extractMemoLinks(md)).toEqual(['M:4#my-section']);
	});

	it('drops heading when slugify produces empty string (punctuation-only)', () => {
		const md = '[x](M:4#!!!)';
		expect(extractMemoLinks(md)).toEqual(['M:4']);
	});
});


describe('normalizeMemoLinks', () => {
	it('rewrites a natural heading to its slug form', () => {
		const md = 'See [t](M:2#My Section).';
		expect(normalizeMemoLinks(md)).toBe('See [t](M:2#my-section).');
	});

	it('leaves id-only refs alone', () => {
		const md = 'See [t](M:2) and [u](M:3).';
		expect(normalizeMemoLinks(md)).toBe('See [t](M:2) and [u](M:3).');
	});

	it('is idempotent on already-slugified refs', () => {
		const md = 'See [t](M:2#my-section).';
		expect(normalizeMemoLinks(md)).toBe('See [t](M:2#my-section).');
	});

	it('drops heading entirely if slug is empty', () => {
		const md = '[x](M:4#!!!)';
		expect(normalizeMemoLinks(md)).toBe('[x](M:4)');
	});

	it('does not rewrite links inside fenced code blocks', () => {
		const md = [
			'Real: [t](M:2#My Section)',
			'```',
			'Example: [t](M:2#My Section)',
			'```',
		].join('\n');
		const result = normalizeMemoLinks(md);
		expect(result).toContain('[t](M:2#my-section)');            // real one rewritten
		expect(result).toContain('Example: [t](M:2#My Section)');  // code block preserved verbatim
	});

	it('does not rewrite links inside inline code', () => {
		const md = 'Syntax: `[t](M:2#My Section)`. Real: [t](M:2#My Section).';
		const result = normalizeMemoLinks(md);
		expect(result).toContain('`[t](M:2#My Section)`');       // inline preserved
		expect(result).toContain('Real: [t](M:2#my-section).');  // real rewritten
	});

	it('ignores external / file links', () => {
		const md = 'See [doc](./file.md#My Section) and [web](https://x.com).';
		expect(normalizeMemoLinks(md)).toBe(md);
	});

	it('handles empty / non-string input', () => {
		expect(normalizeMemoLinks('')).toBe('');
		// @ts-expect-error
		expect(normalizeMemoLinks(null)).toBe(null);
	});
});


describe('parseMemoRef', () => {
	it('parses id only', () => {
		expect(parseMemoRef('M:12')).toEqual({ memo_id: 'M:12', heading: null });
	});

	it('parses id with heading', () => {
		expect(parseMemoRef('M:12#some-heading')).toEqual({ memo_id: 'M:12', heading: 'some-heading' });
	});
});


describe('serializeLinks / parseLinks roundtrip', () => {
	it('roundtrips an array of refs', () => {
		const refs = ['M:1', 'M:2#h'];
		expect(parseLinks(serializeLinks(refs))).toEqual(refs);
	});

	it('parseLinks returns [] for null/empty/malformed', () => {
		expect(parseLinks(null)).toEqual([]);
		expect(parseLinks('')).toEqual([]);
		expect(parseLinks('not-json')).toEqual([]);
		expect(parseLinks('{"not":"array"}')).toEqual([]);
	});
});
