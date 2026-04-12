const { resetDb, getDb } = require('../helpers');
const { cleanupOrphans } = require('../../functions/utils/orphanCleanup');
const { createBucket } = require('../../functions/memory/buckets/create');
const { createThread } = require('../../functions/memory/threads/create');
const { createMemo } = require('../../functions/memory/memos/create');


describe('cleanupOrphans', () => {
	beforeEach(() => {
		resetDb();
	});


	test('reports zero on an empty database', () => {
		const result = cleanupOrphans();
		expect(result).toEqual({
			orphan_threads: 0,
			orphan_memos: 0,
			orphan_bucket_vectors: 0,
			orphan_thread_vectors: 0,
			orphan_memo_vectors: 0,
		});
	});


	test('reports zero when all data is well-formed', async () => {
		const b = await createBucket({ name: 'Bucket', summary: 'Summary' });
		const t = await createThread({ parent_bucket_id: b.bucket_id, name: 'Thread', summary: 'Summary' });
		await createMemo({ parent_thread_id: t.thread_id, title: 'Memo', summary: 'Summary', content: 'content' });

		const result = cleanupOrphans();
		expect(result.orphan_threads).toBe(0);
		expect(result.orphan_memos).toBe(0);
		expect(result.orphan_bucket_vectors).toBe(0);
		expect(result.orphan_thread_vectors).toBe(0);
		expect(result.orphan_memo_vectors).toBe(0);
	});


	test('deletes threads whose parent bucket was removed directly from SQL', async () => {
		const b = await createBucket({ name: 'B', summary: 'S' });
		await createThread({ parent_bucket_id: b.bucket_id, name: 'T', summary: 'S' });

		// Bypass the domain function — simulate crash or manual edit
		const db = getDb();
		db.prepare('PRAGMA foreign_keys = OFF').run();
		db.prepare('DELETE FROM buckets WHERE bucket_id = ?').run(b.bucket_id);
		db.prepare('PRAGMA foreign_keys = ON').run();

		const result = cleanupOrphans();
		expect(result.orphan_threads).toBe(1);
		expect(result.orphan_thread_vectors).toBe(1); // thread vec cleaned too
	});


	test('deletes memos whose parent thread was removed directly from SQL', async () => {
		const b = await createBucket({ name: 'B', summary: 'S' });
		const t = await createThread({ parent_bucket_id: b.bucket_id, name: 'T', summary: 'S' });
		await createMemo({ parent_thread_id: t.thread_id, title: 'M', summary: 'S', content: 'c' });

		const db = getDb();
		db.prepare('PRAGMA foreign_keys = OFF').run();
		db.prepare('DELETE FROM threads WHERE thread_id = ?').run(t.thread_id);
		db.prepare('PRAGMA foreign_keys = ON').run();

		const result = cleanupOrphans();
		expect(result.orphan_memos).toBe(1);
		expect(result.orphan_memo_vectors).toBe(1);
	});


	test('deletes orphan vector entries with no matching SQL row', async () => {
		const b = await createBucket({ name: 'B', summary: 'S' });

		// Delete the bucket row bypassing the domain function (simulates crash
		// after SQL delete but before vec cleanup)
		const db = getDb();
		db.prepare('PRAGMA foreign_keys = OFF').run();
		db.prepare('DELETE FROM buckets WHERE bucket_id = ?').run(b.bucket_id);
		db.prepare('PRAGMA foreign_keys = ON').run();

		const result = cleanupOrphans();
		expect(result.orphan_bucket_vectors).toBe(1);
	});


	test('cascades transitively — orphan thread removal also cleans up its memos and vectors', async () => {
		const b = await createBucket({ name: 'B', summary: 'S' });
		const t = await createThread({ parent_bucket_id: b.bucket_id, name: 'T', summary: 'S' });
		await createMemo({ parent_thread_id: t.thread_id, title: 'M1', summary: 'S', content: 'c' });
		await createMemo({ parent_thread_id: t.thread_id, title: 'M2', summary: 'S', content: 'c' });

		const db = getDb();
		db.prepare('PRAGMA foreign_keys = OFF').run();
		db.prepare('DELETE FROM buckets WHERE bucket_id = ?').run(b.bucket_id);
		db.prepare('PRAGMA foreign_keys = ON').run();

		const result = cleanupOrphans();
		// Orphan thread detected and deleted (FKs are re-enabled, cascade removes memos)
		expect(result.orphan_threads).toBe(1);
		// vec tables reconciled too
		expect(result.orphan_bucket_vectors).toBe(1);
		expect(result.orphan_thread_vectors).toBe(1);
		expect(result.orphan_memo_vectors).toBe(2);
	});
});
