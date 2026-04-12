// tests/memory/threads.test.js
// Comprehensive unit tests for all 5 thread domain functions.

const { resetDb, getDb } = require('../helpers');
const { createBucket } = require('../../functions/memory/buckets/create');
const { createThread } = require('../../functions/memory/threads/create');
const { searchThreads } = require('../../functions/memory/threads/search');
const { updateThread } = require('../../functions/memory/threads/update');
const { deleteThread } = require('../../functions/memory/threads/delete');
const { moveThread } = require('../../functions/memory/threads/move');
const { createMemo } = require('../../functions/memory/memos/create');


// Helper: seed a bucket + thread so tests start with a known state
async function seedBucketAndThread(bucketOverrides = {}, threadOverrides = {}) {
	const bucket = await createBucket({
		name: 'Test Bucket',
		summary: 'A default test bucket',
		...bucketOverrides,
	});

	const thread = await createThread({
		parent_bucket_id: bucket.bucket_id,
		name: 'Test Thread',
		summary: 'A default test thread',
		...threadOverrides,
	});

	return { bucket, thread };
}


describe('threads domain', () => {
	beforeEach(() => {
		resetDb();
	});


	// ─── createThread ────────────────────────────────────────────────────────────

	describe('createThread', () => {
		it('returns a record with thread_id formatted as T:1', async () => {
			const { bucket } = await seedBucketAndThread();
			const db = getDb();
			const row = db.prepare('SELECT thread_id FROM threads WHERE thread_id = ?').get('T:1');
			expect(row).toBeDefined();
			expect(row.thread_id).toBe('T:1');
		});

		it('assigns sequential IDs across multiple creates', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });

			const t1 = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T1', summary: 's1' });
			const t2 = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T2', summary: 's2' });
			const t3 = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T3', summary: 's3' });

			expect(t1.thread_id).toBe('T:1');
			expect(t2.thread_id).toBe('T:2');
			expect(t3.thread_id).toBe('T:3');
		});

		it('throws when parent_bucket_id does not exist', async () => {
			await expect(
				createThread({ parent_bucket_id: 'B:999', name: 'Orphan', summary: 'no parent' }),
			).rejects.toThrow('Parent bucket not found: B:999');
		});

		it('stores name, summary, and parent_bucket_id on the record', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });
			const thread = await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'My Thread',
				summary: 'My Summary',
			});

			expect(thread.thread_name).toBe('My Thread');
			expect(thread.thread_summary).toBe('My Summary');
			expect(thread.parent_bucket_id).toBe(bucket.bucket_id);
		});

		it('adds a vector entry in threads_vec after creation', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });
			const thread = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T', summary: 'vec test' });

			const db = getDb();
			const vecRow = db.prepare('SELECT id FROM threads_vec WHERE id = ?').get(thread.thread_id);
			expect(vecRow).toBeDefined();
		});
	});


	// ─── searchThreads ────────────────────────────────────────────────────────────

	describe('searchThreads', () => {
		it('returns an empty array when no threads match', async () => {
			const results = await searchThreads('zzz_no_match_xyzxyz');
			expect(results).toEqual([]);
		});

		it('returns threads matching the query', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });
			await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'Machine Learning Concepts',
				summary: 'Deep dive into neural networks and gradient descent',
			});

			const results = await searchThreads('neural networks');
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].thread_name).toBe('Machine Learning Concepts');
		});

		it('each result includes a memos array with memo_id and memo_title', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });
			const thread = await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'Project Alpha Notes',
				summary: 'Notes about project alpha planning',
			});

			await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Sprint 1',
				summary: 'First sprint tasks',
				content: 'Do things',
			});

			await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Sprint 2',
				summary: 'Second sprint tasks',
				content: 'Do more things',
			});

			const results = await searchThreads('project alpha planning');
			expect(results.length).toBeGreaterThan(0);

			const found = results.find(r => r.thread_id === thread.thread_id);
			expect(found).toBeDefined();
			expect(Array.isArray(found.memos)).toBe(true);
			expect(found.memos).toHaveLength(2);
			expect(found.memos[0]).toHaveProperty('memo_id');
			expect(found.memos[0]).toHaveProperty('memo_title');
		});

		it('returns empty memos array when thread has no memos', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });
			await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'Empty Thread',
				summary: 'A thread with zero memos attached',
			});

			const results = await searchThreads('zero memos attached');
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].memos).toEqual([]);
		});

		it('respects the limit parameter', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });

			for (let i = 1; i <= 5; i++) {
				await createThread({
					parent_bucket_id: bucket.bucket_id,
					name: `Thread ${i}`,
					summary: `Summary about dragons and castles number ${i}`,
				});
			}

			const results = await searchThreads('dragons and castles', 2);
			expect(results.length).toBeLessThanOrEqual(2);
		});

		it('each result has a numeric score field from RRF', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });
			await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: 'Scored Thread',
				summary: 'This thread is used to verify score field presence',
			});

			const results = await searchThreads('score field presence');
			expect(results.length).toBeGreaterThan(0);
			expect(typeof results[0].score).toBe('number');
		});
	});


	// ─── updateThread ─────────────────────────────────────────────────────────────

	describe('updateThread', () => {
		it('updates name only', async () => {
			const { thread } = await seedBucketAndThread();
			const updated = await updateThread({ thread_id: thread.thread_id, name: 'New Name' });

			expect(updated.thread_name).toBe('New Name');
			expect(updated.thread_summary).toBe(thread.thread_summary);
		});

		it('updates summary only', async () => {
			const { thread } = await seedBucketAndThread();
			const updated = await updateThread({ thread_id: thread.thread_id, summary: 'New Summary' });

			expect(updated.thread_summary).toBe('New Summary');
			expect(updated.thread_name).toBe(thread.thread_name);
		});

		it('updates both name and summary', async () => {
			const { thread } = await seedBucketAndThread();
			const updated = await updateThread({
				thread_id: thread.thread_id,
				name: 'Both Name',
				summary: 'Both Summary',
			});

			expect(updated.thread_name).toBe('Both Name');
			expect(updated.thread_summary).toBe('Both Summary');
		});

		it('throws when thread_id does not exist', async () => {
			await expect(
				updateThread({ thread_id: 'T:999', name: 'Ghost' }),
			).rejects.toThrow('Thread not found: T:999');
		});

		it('throws when no fields are provided', async () => {
			const { thread } = await seedBucketAndThread();
			await expect(
				updateThread({ thread_id: thread.thread_id }),
			).rejects.toThrow('No fields provided to update.');
		});

		it('refreshes updated_at on update', async () => {
			const { thread } = await seedBucketAndThread();
			const before = thread.updated_at;

			// Small delay to ensure timestamp differs
			await new Promise(r => setTimeout(r, 1100));

			const updated = await updateThread({ thread_id: thread.thread_id, name: 'Renamed' });
			expect(updated.updated_at).not.toBe(before);
		});

		it('syncs updated vector entry after update', async () => {
			const { thread } = await seedBucketAndThread();
			const db = getDb();

			const before = db.prepare('SELECT embedding FROM threads_vec WHERE id = ?').get(thread.thread_id);
			await updateThread({ thread_id: thread.thread_id, summary: 'Totally different summary now' });
			const after = db.prepare('SELECT embedding FROM threads_vec WHERE id = ?').get(thread.thread_id);

			// Vector should still exist (upserted)
			expect(after).toBeDefined();
			// Embedding bytes differ because the text changed
			expect(Buffer.compare(before.embedding, after.embedding)).not.toBe(0);
		});
	});


	// ─── deleteThread ─────────────────────────────────────────────────────────────

	describe('deleteThread', () => {
		it('removes the thread from the database', async () => {
			const { thread } = await seedBucketAndThread();
			await deleteThread(thread.thread_id);

			const db = getDb();
			const row = db.prepare('SELECT thread_id FROM threads WHERE thread_id = ?').get(thread.thread_id);
			expect(row).toBeUndefined();
		});

		it('cascades and removes child memos', async () => {
			const { thread } = await seedBucketAndThread();

			await createMemo({ parent_thread_id: thread.thread_id, title: 'M1', summary: 's', content: 'c' });
			await createMemo({ parent_thread_id: thread.thread_id, title: 'M2', summary: 's', content: 'c' });

			await deleteThread(thread.thread_id);

			const db = getDb();
			const memos = db.prepare('SELECT memo_id FROM memos WHERE parent_thread_id = ?').all(thread.thread_id);
			expect(memos).toHaveLength(0);
		});

		it('returns { thread_id, parent_bucket_id, memos_deleted }', async () => {
			const { bucket, thread } = await seedBucketAndThread();

			await createMemo({ parent_thread_id: thread.thread_id, title: 'M', summary: 's', content: 'c' });

			const result = await deleteThread(thread.thread_id);

			expect(result.thread_id).toBe(thread.thread_id);
			expect(result.parent_bucket_id).toBe(bucket.bucket_id);
			expect(result.memos_deleted).toBe(1);
		});

		it('returns memos_deleted = 0 when thread has no memos', async () => {
			const { thread } = await seedBucketAndThread();
			const result = await deleteThread(thread.thread_id);
			expect(result.memos_deleted).toBe(0);
		});

		it('throws when thread_id does not exist', async () => {
			await expect(deleteThread('T:999')).rejects.toThrow('Thread not found: T:999');
		});

		it('cleans up threads_vec entry after deletion', async () => {
			const { thread } = await seedBucketAndThread();
			await deleteThread(thread.thread_id);

			const db = getDb();
			const vecRow = db.prepare('SELECT id FROM threads_vec WHERE id = ?').get(thread.thread_id);
			expect(vecRow).toBeUndefined();
		});

		it('cleans up memos_vec entries for cascaded memos', async () => {
			const { thread } = await seedBucketAndThread();
			const m1 = await createMemo({ parent_thread_id: thread.thread_id, title: 'M1', summary: 's1', content: 'c' });
			const m2 = await createMemo({ parent_thread_id: thread.thread_id, title: 'M2', summary: 's2', content: 'c' });

			await deleteThread(thread.thread_id);

			const db = getDb();
			const v1 = db.prepare('SELECT id FROM memos_vec WHERE id = ?').get(m1.memo_id);
			const v2 = db.prepare('SELECT id FROM memos_vec WHERE id = ?').get(m2.memo_id);
			expect(v1).toBeUndefined();
			expect(v2).toBeUndefined();
		});

		it('threads_vec and memos_vec counts decrease by the right amounts', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });
			const t1 = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T1', summary: 's1' });
			const t2 = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'T2', summary: 's2' });

			await createMemo({ parent_thread_id: t1.thread_id, title: 'M1', summary: 's', content: 'c' });
			await createMemo({ parent_thread_id: t1.thread_id, title: 'M2', summary: 's', content: 'c' });
			await createMemo({ parent_thread_id: t2.thread_id, title: 'M3', summary: 's', content: 'c' });

			const db = getDb();
			const threadVecBefore = db.prepare('SELECT COUNT(*) as n FROM threads_vec').get().n;
			const memoVecBefore = db.prepare('SELECT COUNT(*) as n FROM memos_vec').get().n;

			await deleteThread(t1.thread_id);

			const threadVecAfter = db.prepare('SELECT COUNT(*) as n FROM threads_vec').get().n;
			const memoVecAfter = db.prepare('SELECT COUNT(*) as n FROM memos_vec').get().n;

			expect(threadVecAfter).toBe(threadVecBefore - 1);
			expect(memoVecAfter).toBe(memoVecBefore - 2);
		});
	});


	// ─── moveThread ───────────────────────────────────────────────────────────────

	describe('moveThread', () => {
		it('updates the thread parent_bucket_id to the new bucket', () => {
			// moveThread is synchronous — wrap in async only for the async setup
			return (async () => {
				const bucketA = await createBucket({ name: 'A', summary: 'bucket a' });
				const bucketB = await createBucket({ name: 'B', summary: 'bucket b' });
				const thread = await createThread({ parent_bucket_id: bucketA.bucket_id, name: 'T', summary: 's' });

				moveThread(thread.thread_id, bucketB.bucket_id);

				const db = getDb();
				const row = db.prepare('SELECT parent_bucket_id FROM threads WHERE thread_id = ?').get(thread.thread_id);
				expect(row.parent_bucket_id).toBe(bucketB.bucket_id);
			})();
		});

		it('returns { thread_id, old_bucket_id, new_bucket_id }', async () => {
			const bucketA = await createBucket({ name: 'A', summary: 'a' });
			const bucketB = await createBucket({ name: 'B', summary: 'b' });
			const thread = await createThread({ parent_bucket_id: bucketA.bucket_id, name: 'T', summary: 's' });

			const result = moveThread(thread.thread_id, bucketB.bucket_id);

			expect(result).toEqual({
				thread_id: thread.thread_id,
				old_bucket_id: bucketA.bucket_id,
				new_bucket_id: bucketB.bucket_id,
			});
		});

		it('throws when thread does not exist', async () => {
			const bucket = await createBucket({ name: 'B', summary: 's' });
			expect(() => moveThread('T:999', bucket.bucket_id)).toThrow('Thread not found: T:999');
		});

		it('throws when destination bucket does not exist', async () => {
			const { thread } = await seedBucketAndThread();
			expect(() => moveThread(thread.thread_id, 'B:999')).toThrow('Destination bucket not found: B:999');
		});

		it('throws when thread is already in the destination bucket', async () => {
			const { bucket, thread } = await seedBucketAndThread();
			expect(() => moveThread(thread.thread_id, bucket.bucket_id)).toThrow(
				'Thread is already in the specified bucket.',
			);
		});
	});
});
