const { rrfMerge } = require('../../functions/utils/rrf');


// ─── Empty / trivial inputs ───────────────────────────────────────────────────

test('empty input returns empty array', () => {
	const result = rrfMerge([]);
	expect(result).toEqual([]);
});

test('single list with one item returns score 1/(k+0)', () => {
	const result = rrfMerge([[{ id: 'A', rank: 0 }]]);
	expect(result).toHaveLength(1);
	expect(result[0].id).toBe('A');
	expect(result[0].score).toBeCloseTo(1 / 60, 6);
});


// ─── Multi-list boosting ──────────────────────────────────────────────────────

test('document appearing in multiple lists gets a boosted score', () => {
	const lists = [
		[{ id: 'A', rank: 0 }, { id: 'B', rank: 1 }],
		[{ id: 'A', rank: 0 }, { id: 'C', rank: 1 }],
	];
	const result = rrfMerge(lists);
	const a = result.find((r) => r.id === 'A');
	const b = result.find((r) => r.id === 'B');
	const c = result.find((r) => r.id === 'C');

	// A appears twice at rank 0 → score = 2 * (1/60)
	expect(a.score).toBeCloseTo(2 / 60, 6);
	// B and C each appear once at rank 1 → score = 1/61
	expect(b.score).toBeCloseTo(1 / 61, 6);
	expect(c.score).toBeCloseTo(1 / 61, 6);
	// A must score higher than B or C
	expect(a.score).toBeGreaterThan(b.score);
});


// ─── Rank impact ──────────────────────────────────────────────────────────────

test('lower rank position (higher rank number) yields lower score', () => {
	const result = rrfMerge([[{ id: 'A', rank: 0 }, { id: 'B', rank: 5 }]]);
	const a = result.find((r) => r.id === 'A');
	const b = result.find((r) => r.id === 'B');

	expect(a.score).toBeCloseTo(1 / 60, 6);
	expect(b.score).toBeCloseTo(1 / 65, 6);
	expect(a.score).toBeGreaterThan(b.score);
});


// ─── Sort order ───────────────────────────────────────────────────────────────

test('results are sorted by score descending', () => {
	const lists = [
		[{ id: 'C', rank: 10 }, { id: 'A', rank: 0 }, { id: 'B', rank: 5 }],
		[{ id: 'A', rank: 0 }],
	];
	const result = rrfMerge(lists);
	const scores = result.map((r) => r.score);

	for (let i = 0; i < scores.length - 1; i++) {
		expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
	}
	expect(result[0].id).toBe('A');
});


// ─── Custom k value ───────────────────────────────────────────────────────────

test('custom k=10 yields higher scores than default k=60 for the same rank', () => {
	const lists = [[{ id: 'A', rank: 0 }]];
	const scoreK10 = rrfMerge(lists, 10)[0].score;
	const scoreK60 = rrfMerge(lists, 60)[0].score;

	expect(scoreK10).toBeCloseTo(1 / 10, 6);
	expect(scoreK60).toBeCloseTo(1 / 60, 6);
	expect(scoreK10).toBeGreaterThan(scoreK60);
});


// ─── Duplicate ID within same list accumulates ────────────────────────────────

test('same ID appearing twice in one list accumulates both contributions', () => {
	// rank 0 contributes 1/60, rank 2 contributes 1/62
	const result = rrfMerge([[{ id: 'A', rank: 0 }, { id: 'A', rank: 2 }]]);
	expect(result).toHaveLength(1);
	expect(result[0].id).toBe('A');
	expect(result[0].score).toBeCloseTo(1 / 60 + 1 / 62, 6);
});


// ─── Independent IDs in separate lists ───────────────────────────────────────

test('different IDs only in one list each reflect only their own rank', () => {
	const lists = [
		[{ id: 'A', rank: 3 }],
		[{ id: 'B', rank: 7 }],
	];
	const result = rrfMerge(lists);
	const a = result.find((r) => r.id === 'A');
	const b = result.find((r) => r.id === 'B');

	expect(a.score).toBeCloseTo(1 / 63, 6);
	expect(b.score).toBeCloseTo(1 / 67, 6);
	expect(result).toHaveLength(2);
});


// ─── Cross-list rank ordering ─────────────────────────────────────────────────

test('document at rank 0 in both lists scores higher than one at rank 0 in one and rank 5 in another', () => {
	// X is rank 0 in list1, rank 0 in list2 → score = 1/60 + 1/60 = 2/60
	// Y is rank 0 in list1, rank 5 in list2 → score = 1/60 + 1/65
	const lists = [
		[{ id: 'X', rank: 0 }, { id: 'Y', rank: 0 }],
		[{ id: 'X', rank: 0 }, { id: 'Y', rank: 5 }],
	];
	const result = rrfMerge(lists);
	const x = result.find((r) => r.id === 'X');
	const y = result.find((r) => r.id === 'Y');

	expect(x.score).toBeCloseTo(2 / 60, 6);
	expect(y.score).toBeCloseTo(1 / 60 + 1 / 65, 6);
	expect(x.score).toBeGreaterThan(y.score);
	expect(result[0].id).toBe('X');
});
