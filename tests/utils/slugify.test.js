// tests/utils/slugify.test.js
const { slugify } = require('../../functions/utils/slugify');


describe('slugify', () => {
	it('lowercases the input', () => {
		expect(slugify('Heading Two')).toBe('heading-two');
	});

	it('replaces spaces with hyphens', () => {
		expect(slugify('multi word heading')).toBe('multi-word-heading');
	});

	it('collapses repeated whitespace to a single hyphen', () => {
		expect(slugify('too    many    spaces')).toBe('too-many-spaces');
	});

	it('strips punctuation', () => {
		expect(slugify('Hello, World!')).toBe('hello-world');
		expect(slugify('Color theory in YouTube Thumbnails?')).toBe('color-theory-in-youtube-thumbnails');
	});

	it('keeps digits', () => {
		expect(slugify('Step 1: Setup')).toBe('step-1-setup');
	});

	it('collapses repeated hyphens after punctuation removal', () => {
		expect(slugify('one -- two')).toBe('one-two');
	});

	it('trims leading/trailing hyphens', () => {
		expect(slugify('!!! leading and trailing !!!')).toBe('leading-and-trailing');
	});

	it('strips diacritics via NFKD', () => {
		expect(slugify('Café Déjà Vu')).toBe('cafe-deja-vu');
	});

	it('returns empty string for empty input', () => {
		expect(slugify('')).toBe('');
	});

	it('returns empty string for non-string input', () => {
		// @ts-expect-error - deliberately bad input
		expect(slugify(null)).toBe('');
		// @ts-expect-error - deliberately bad input
		expect(slugify(undefined)).toBe('');
	});

	it('handles punctuation-only input', () => {
		expect(slugify('!!!???')).toBe('');
	});
});
