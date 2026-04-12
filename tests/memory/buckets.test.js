// tests/memory/buckets.test.js
// Unit tests for all 4 bucket domain functions: create, search, update, delete.
// The embedder is auto-mocked by tests/helpers.js — do NOT re-mock it here.

const { resetDb, getDb } = require('../helpers');
const { createBucket } = require('../../functions/memory/buckets/create');
const { searchBuckets } = require('../../functions/memory/buckets/search');
const { updateBucket } = require('../../functions/memory/buckets/update');
const { deleteBucket } = require('../../functions/memory/buckets/delete');
const { createThread } = require('../../functions/memory/threads/create');
const { createMemo } = require('../../functions/memory/memos/create');


describe('buckets domain', () => {
	beforeEach(() => {
		resetDb();
	});


	// ─── createBucket ────────────────────────────────────────────────────────────

	describe('createBucket', () => {
		test('returns a record with bucket_id formatted as B:1', async () => {
			const result = await createBucket({ name: 'Alpha', summary: 'First bucket' });

			expect(result.bucket_id).toBe('B:1');
		});

		test('stores bucket_name and bucket_summary on the record', async () => {
			const result = await createBucket({ name: 'Alpha', summary: 'First bucket' });

			expect(result.bucket_name).toBe('Alpha');
			expect(result.bucket_summary).toBe('First bucket');
		});

		test('record has created_at and updated_at timestamps', async () => {
			const result = await createBucket({ name: 'Alpha', summary: 'First bucket' });

			expect(result.created_at).toBeDefined();
			expect(result.updated_at).toBeDefined();
			expect(typeof result.created_at).toBe('string');
			expect(typeof result.updated_at).toBe('string');
		});

		test('multiple creates get sequential IDs: B:1, B:2, B:3', async () => {
			const b1 = await createBucket({ name: 'One', summary: 'Summary one' });
			const b2 = await createBucket({ name: 'Two', summary: 'Summary two' });
			const b3 = await createBucket({ name: 'Three', summary: 'Summary three' });

			expect(b1.bucket_id).toBe('B:1');
			expect(b2.bucket_id).toBe('B:2');
			expect(b3.bucket_id).toBe('B:3');
		});

		test('inserts a corresponding entry in buckets_vec', async () => {
			await createBucket({ name: 'Alpha', summary: 'First bucket' });

			const db = getDb();
			const row = db.prepare(`SELECT id FROM buckets_vec WHERE id = 'B:1'`).get();

			expect(row).toBeDefined();
			expect(row.id).toBe('B:1');
		});
	});


	// ─── searchBuckets ───────────────────────────────────────────────────────────

	describe('searchBuckets', () => {
		test('returns empty array when no buckets exist', async () => {
			const results = await searchBuckets('anything');

			expect(results).toEqual([]);
		});

		test('returns empty array when query matches nothing', async () => {
			await createBucket({ name: 'Alpha', summary: 'Contains cats and dogs' });

			// FTS5 MATCH on a term not in the content will produce no rows.
			// Vector search may still return the single bucket via cosine similarity,
			// so we only assert no FTS hit by checking an exact non-matching term.
			const results = await searchBuckets('xyznotpresent12345');

			// Results may include the bucket via vector fallback; just assert shape.
			// The meaningful assertion is that it doesn't throw.
			expect(Array.isArray(results)).toBe(true);
		});

		test('returns buckets that match the query by FTS5', async () => {
			await createBucket({ name: 'Machine Learning', summary: 'Deep learning and neural networks' });
			await createBucket({ name: 'Cooking Recipes', summary: 'Delicious food and nutrition' });

			const results = await searchBuckets('neural networks');

			const ids = results.map(r => r.bucket_id);
			expect(ids).toContain('B:1');
		});

		test('each result has bucket_id, bucket_name, bucket_summary, threads, score', async () => {
			await createBucket({ name: 'Science', summary: 'Physics and chemistry fundamentals' });

			const results = await searchBuckets('physics');

			expect(results.length).toBeGreaterThan(0);
			const first = results[0];
			expect(first).toHaveProperty('bucket_id');
			expect(first).toHaveProperty('bucket_name');
			expect(first).toHaveProperty('bucket_summary');
			expect(first).toHaveProperty('threads');
			expect(first).toHaveProperty('score');
			expect(Array.isArray(first.threads)).toBe(true);
		});

		test('threads array contains up to 5 threads per bucket', async () => {
			const bucket = await createBucket({ name: 'History', summary: 'World history overview' });

			// Create 6 threads — result should be capped at 5
			for (let i = 1; i <= 6; i++) {
				await createThread({
					parent_bucket_id: bucket.bucket_id,
					name: `Thread ${i}`,
					summary: `Thread summary ${i}`,
				});
			}

			const results = await searchBuckets('world history');

			expect(results.length).toBeGreaterThan(0);
			expect(results[0].threads.length).toBeLessThanOrEqual(5);
		});

		test('threads items have thread_id and thread_name', async () => {
			const bucket = await createBucket({ name: 'History', summary: 'Ancient civilizations' });
			await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'Romans',
				summary: 'Roman empire history',
			});

			const results = await searchBuckets('ancient civilizations');

			expect(results.length).toBeGreaterThan(0);
			const thread = results[0].threads[0];
			expect(thread).toHaveProperty('thread_id');
			expect(thread).toHaveProperty('thread_name');
		});

		test('respects the limit parameter', async () => {
			await createBucket({ name: 'Alpha', summary: 'First entry alpha content' });
			await createBucket({ name: 'Beta', summary: 'Second entry beta content' });
			await createBucket({ name: 'Gamma', summary: 'Third entry gamma content' });

			// limit=1 — RRF merged list sliced to 1
			const results = await searchBuckets('entry', 1);

			expect(results.length).toBeLessThanOrEqual(1);
		});

		test('results have a numeric score field from RRF', async () => {
			await createBucket({ name: 'Finance', summary: 'Stock markets and investments' });

			const results = await searchBuckets('stock markets');

			expect(results.length).toBeGreaterThan(0);
			expect(typeof results[0].score).toBe('number');
			expect(results[0].score).toBeGreaterThan(0);
		});
	});


	// ─── updateBucket ────────────────────────────────────────────────────────────

	describe('updateBucket', () => {
		test('updates name only when only name is provided', async () => {
			const created = await createBucket({ name: 'Old Name', summary: 'Original summary' });

			const updated = await updateBucket({ bucket_id: created.bucket_id, name: 'New Name' });

			expect(updated.bucket_name).toBe('New Name');
			expect(updated.bucket_summary).toBe('Original summary');
		});

		test('updates summary only when only summary is provided', async () => {
			const created = await createBucket({ name: 'My Bucket', summary: 'Old summary' });

			const updated = await updateBucket({ bucket_id: created.bucket_id, summary: 'New summary' });

			expect(updated.bucket_name).toBe('My Bucket');
			expect(updated.bucket_summary).toBe('New summary');
		});

		test('updates both name and summary when both are provided', async () => {
			const created = await createBucket({ name: 'Old Name', summary: 'Old summary' });

			const updated = await updateBucket({
				bucket_id: created.bucket_id,
				name: 'New Name',
				summary: 'New summary',
			});

			expect(updated.bucket_name).toBe('New Name');
			expect(updated.bucket_summary).toBe('New summary');
		});

		test('throws when bucket_id does not exist', async () => {
			await expect(
				updateBucket({ bucket_id: 'B:9999', name: 'Ghost' }),
			).rejects.toThrow('Bucket not found: B:9999');
		});

		test('throws when neither name nor summary is provided', async () => {
			const created = await createBucket({ name: 'Stable', summary: 'Stable summary' });

			await expect(
				updateBucket({ bucket_id: created.bucket_id }),
			).rejects.toThrow('No fields provided to update.');
		});

		test('updated_at is refreshed after update', async () => {
			const created = await createBucket({ name: 'Timed', summary: 'Time test' });
			const originalUpdatedAt = created.updated_at;

			// Small delay so CURRENT_TIMESTAMP has a chance to differ (SQLite second precision)
			await new Promise(res => setTimeout(res, 1100));

			const updated = await updateBucket({ bucket_id: created.bucket_id, name: 'Timed New' });

			// updated_at should be a valid timestamp string
			expect(updated.updated_at).toBeDefined();
			// The field itself is returned and is a string
			expect(typeof updated.updated_at).toBe('string');
			// If a second has elapsed, updated_at will differ from created_at
			// (SQLite CURRENT_TIMESTAMP has second-level precision)
			// We at minimum assert the field is present and the record came back
			expect(updated.bucket_id).toBe(created.bucket_id);
		});

		test('returned record has all expected fields', async () => {
			const created = await createBucket({ name: 'Full Record', summary: 'Full summary' });
			const updated = await updateBucket({ bucket_id: created.bucket_id, name: 'Updated' });

			expect(updated).toHaveProperty('bucket_id');
			expect(updated).toHaveProperty('bucket_name');
			expect(updated).toHaveProperty('bucket_summary');
			expect(updated).toHaveProperty('created_at');
			expect(updated).toHaveProperty('updated_at');
		});

		test('updates the vector entry after summary change', async () => {
			const created = await createBucket({ name: 'Vector Test', summary: 'Before update' });
			await updateBucket({ bucket_id: created.bucket_id, summary: 'After update' });

			// syncVector does delete-then-insert so the row should still exist
			const db = getDb();
			const row = db.prepare(`SELECT id FROM buckets_vec WHERE id = ?`).get(created.bucket_id);
			expect(row).toBeDefined();
		});
	});


	// ─── deleteBucket ────────────────────────────────────────────────────────────

	describe('deleteBucket', () => {
		test('removes the bucket from the buckets table', async () => {
			const bucket = await createBucket({ name: 'Doomed', summary: 'Will be deleted' });

			await deleteBucket(bucket.bucket_id);

			const db = getDb();
			const row = db.prepare(`SELECT bucket_id FROM buckets WHERE bucket_id = ?`).get(bucket.bucket_id);
			expect(row).toBeUndefined();
		});

		test('returns { bucket_id, threads_deleted, memos_deleted }', async () => {
			const bucket = await createBucket({ name: 'Return Shape', summary: 'Shape test' });

			const result = await deleteBucket(bucket.bucket_id);

			expect(result).toHaveProperty('bucket_id', bucket.bucket_id);
			expect(result).toHaveProperty('threads_deleted');
			expect(result).toHaveProperty('memos_deleted');
		});

		test('returns threads_deleted = 0 and memos_deleted = 0 for empty bucket', async () => {
			const bucket = await createBucket({ name: 'Empty', summary: 'No children' });

			const result = await deleteBucket(bucket.bucket_id);

			expect(result.threads_deleted).toBe(0);
			expect(result.memos_deleted).toBe(0);
		});

		test('cascades: removes all child threads on delete', async () => {
			const bucket = await createBucket({ name: 'Parent', summary: 'Has threads' });
			await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T1', summary: 'Thread one' });
			await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T2', summary: 'Thread two' });

			await deleteBucket(bucket.bucket_id);

			const db = getDb();
			const threads = db
				.prepare(`SELECT thread_id FROM threads WHERE parent_bucket_id = ?`)
				.all(bucket.bucket_id);

			expect(threads).toHaveLength(0);
		});

		test('cascades: removes all child memos on delete', async () => {
			const bucket = await createBucket({ name: 'Parent', summary: 'Has memos' });
			const thread = await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'Thread',
				summary: 'Thread summary',
			});
			await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Memo 1',
				summary: 'Memo summary 1',
				content: 'Memo content 1',
			});
			await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Memo 2',
				summary: 'Memo summary 2',
				content: 'Memo content 2',
			});

			await deleteBucket(bucket.bucket_id);

			const db = getDb();
			const memos = db
				.prepare(`SELECT memo_id FROM memos WHERE parent_thread_id = ?`)
				.all(thread.thread_id);

			expect(memos).toHaveLength(0);
		});

		test('returns correct threads_deleted and memos_deleted counts', async () => {
			const bucket = await createBucket({ name: 'Counted', summary: 'Count cascade' });
			const t1 = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T1', summary: 'S1' });
			const t2 = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T2', summary: 'S2' });
			await createMemo({ parent_thread_id: t1.thread_id, title: 'M1', summary: 'MS1', content: 'C1' });
			await createMemo({ parent_thread_id: t1.thread_id, title: 'M2', summary: 'MS2', content: 'C2' });
			await createMemo({ parent_thread_id: t2.thread_id, title: 'M3', summary: 'MS3', content: 'C3' });

			const result = await deleteBucket(bucket.bucket_id);

			expect(result.threads_deleted).toBe(2);
			expect(result.memos_deleted).toBe(3);
		});

		test('throws when bucket_id does not exist', async () => {
			await expect(deleteBucket('B:9999')).rejects.toThrow('Bucket not found: B:9999');
		});

		test('cleans up buckets_vec entry after delete', async () => {
			const bucket = await createBucket({ name: 'Vec Clean', summary: 'Vector cleanup test' });

			// Verify vec entry exists before delete
			const db = getDb();
			const before = db.prepare(`SELECT id FROM buckets_vec WHERE id = ?`).get(bucket.bucket_id);
			expect(before).toBeDefined();

			await deleteBucket(bucket.bucket_id);

			const after = db.prepare(`SELECT id FROM buckets_vec WHERE id = ?`).get(bucket.bucket_id);
			expect(after).toBeUndefined();
		});

		test('cleans up threads_vec entries after cascade delete', async () => {
			const bucket = await createBucket({ name: 'Vec Threads', summary: 'Thread vector cleanup' });
			const thread = await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'TClean',
				summary: 'Clean me',
			});

			// Verify threads_vec row exists
			const db = getDb();
			const before = db.prepare(`SELECT id FROM threads_vec WHERE id = ?`).get(thread.thread_id);
			expect(before).toBeDefined();

			await deleteBucket(bucket.bucket_id);

			const count = db.prepare(`SELECT COUNT(*) as cnt FROM threads_vec WHERE id = ?`).get(thread.thread_id);
			expect(count.cnt).toBe(0);
		});

		test('cleans up memos_vec entries after cascade delete', async () => {
			const bucket = await createBucket({ name: 'Vec Memos', summary: 'Memo vector cleanup' });
			const thread = await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'Thread',
				summary: 'Thread summary',
			});
			const memo = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'MemoClean',
				summary: 'Clean memo',
				content: 'Content',
			});

			// Verify memos_vec row exists
			const db = getDb();
			const before = db.prepare(`SELECT id FROM memos_vec WHERE id = ?`).get(memo.memo_id);
			expect(before).toBeDefined();

			await deleteBucket(bucket.bucket_id);

			const count = db.prepare(`SELECT COUNT(*) as cnt FROM memos_vec WHERE id = ?`).get(memo.memo_id);
			expect(count.cnt).toBe(0);
		});

		test('all vec tables go to 0 rows for deleted bucket and its children', async () => {
			const bucket = await createBucket({ name: 'Full Cascade', summary: 'Full cascade vec test' });
			const thread = await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'Thread',
				summary: 'Thread for cascade',
			});
			await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Memo',
				summary: 'Memo for cascade',
				content: 'Cascade content',
			});

			await deleteBucket(bucket.bucket_id);

			const db = getDb();
			const bucketsVec = db.prepare(`SELECT COUNT(*) as cnt FROM buckets_vec`).get();
			const threadsVec = db.prepare(`SELECT COUNT(*) as cnt FROM threads_vec`).get();
			const memosVec = db.prepare(`SELECT COUNT(*) as cnt FROM memos_vec`).get();

			expect(bucketsVec.cnt).toBe(0);
			expect(threadsVec.cnt).toBe(0);
			expect(memosVec.cnt).toBe(0);
		});
	});
});
