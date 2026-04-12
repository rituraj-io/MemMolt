const { buildFtsQuery } = require('../../functions/utils/ftsQuery');


describe('buildFtsQuery', () => {
	test('simple alphanumeric query is quoted per token', () => {
		expect(buildFtsQuery('hello world')).toBe('"hello" "world"');
	});


	test('strips special characters that would break FTS5 parsing', () => {
		expect(buildFtsQuery('half-life')).toBe('"half" "life"');
		expect(buildFtsQuery('(quantum)')).toBe('"quantum"');
		expect(buildFtsQuery('"quoted"')).toBe('"quoted"');
		expect(buildFtsQuery('path/to/file')).toBe('"path" "to" "file"');
		expect(buildFtsQuery('user@example.com')).toBe('"user" "example" "com"');
	});


	test('drops FTS boolean operators', () => {
		expect(buildFtsQuery('cat AND dog')).toBe('"cat" "dog"');
		expect(buildFtsQuery('cat OR dog')).toBe('"cat" "dog"');
		expect(buildFtsQuery('cat NOT dog')).toBe('"cat" "dog"');
		expect(buildFtsQuery('foo NEAR bar')).toBe('"foo" "bar"');
	});


	test('preserves case of non-operator tokens', () => {
		expect(buildFtsQuery('iPhone MacBook')).toBe('"iPhone" "MacBook"');
	});


	test('drops operators regardless of case', () => {
		expect(buildFtsQuery('cat and dog')).toBe('"cat" "dog"');
		expect(buildFtsQuery('cat Or dog')).toBe('"cat" "dog"');
	});


	test('handles unicode letters and numbers', () => {
		expect(buildFtsQuery('café 2024')).toBe('"café" "2024"');
		expect(buildFtsQuery('日本語')).toBe('"日本語"');
	});


	test('returns empty string for empty / non-string / all-special input', () => {
		expect(buildFtsQuery('')).toBe('');
		expect(buildFtsQuery('!!!')).toBe('');
		expect(buildFtsQuery('()-*')).toBe('');
		// @ts-expect-error exercising runtime guard
		expect(buildFtsQuery(null)).toBe('');
		// @ts-expect-error exercising runtime guard
		expect(buildFtsQuery(undefined)).toBe('');
	});


	test('returns empty string when all tokens are FTS operators', () => {
		expect(buildFtsQuery('AND OR NOT')).toBe('');
	});


	test('collapses multiple whitespace between tokens', () => {
		expect(buildFtsQuery('  hello    world  ')).toBe('"hello" "world"');
	});
});
