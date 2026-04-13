// tests/memory/memos.test.js
// Comprehensive unit tests for all 6 memo domain functions.
const { resetDb, getDb } = require('../helpers');
const { createBucket } = require('../../functions/memory/buckets/create');
const { createThread } = require('../../functions/memory/threads/create');
const { createMemo } = require('../../functions/memory/memos/create');
const { searchMemos } = require('../../functions/memory/memos/search');
const { updateMemo } = require('../../functions/memory/memos/update');
const { deleteMemo } = require('../../functions/memory/memos/delete');
const { moveMemo } = require('../../functions/memory/memos/move');
const { fetchMemos } = require('../../functions/memory/memos/fetch');


// ---------------------------------------------------------------------------
// Helpers — build a minimal bucket + thread to attach memos to
// ---------------------------------------------------------------------------

/**
 * Seed a bucket and one or two threads for use in tests.
 * Returns { bucket, thread, thread2 }.
 */
async function seedThreads() {
	const bucket = await createBucket({ name: 'Test Bucket', summary: 'bucket summary' });
	const thread = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'Thread A', summary: 'thread a summary' });
	const thread2 = await createThread({ parent_bucket_id: bucket.bucket_id, name: 'Thread B', summary: 'thread b summary' });
	return { bucket, thread, thread2 };
}


// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('memos domain', () => {
	beforeEach(() => {
		resetDb();
	});


	// -------------------------------------------------------------------------
	// createMemo
	// -------------------------------------------------------------------------

	describe('createMemo', () => {
		it('returns a record with memo_id formatted as "M:1"', async () => {
			const { thread } = await seedThreads();
			const memo = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'First Memo',
				summary: 'A summary',
				content: 'Some content',
			});

			expect(memo.memo_id).toBe('M:1');
		});

		it('assigns sequential IDs across multiple creates', async () => {
			const { thread } = await seedThreads();
			const params = { parent_thread_id: thread.thread_id, title: 'T', summary: 'S', content: 'C' };
			const m1 = await createMemo(params);
			const m2 = await createMemo(params);
			const m3 = await createMemo(params);

			expect(m1.memo_id).toBe('M:1');
			expect(m2.memo_id).toBe('M:2');
			expect(m3.memo_id).toBe('M:3');
		});

		it('throws when parent_thread_id does not exist', async () => {
			await expect(
				createMemo({ parent_thread_id: 'T:999', title: 'X', summary: 'X', content: 'X' }),
			).rejects.toThrow('T:999');
		});

		it('stores all 4 fields on the returned record', async () => {
			const { thread } = await seedThreads();
			const memo = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'My Title',
				summary: 'My Summary',
				content: 'My Content',
			});

			expect(memo.memo_title).toBe('My Title');
			expect(memo.memo_summary).toBe('My Summary');
			expect(memo.memo_content).toBe('My Content');
			expect(memo.parent_thread_id).toBe(thread.thread_id);
		});

		it('creates a vector entry in memos_vec', async () => {
			const db = getDb();
			const { thread } = await seedThreads();

			const countBefore = db.prepare('SELECT COUNT(*) AS n FROM memos_vec').get().n;

			await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Vec Test',
				summary: 'Vec summary',
				content: 'Vec content',
			});

			const countAfter = db.prepare('SELECT COUNT(*) AS n FROM memos_vec').get().n;
			expect(countAfter).toBe(countBefore + 1);
		});
	});


	// -------------------------------------------------------------------------
	// searchMemos
	// -------------------------------------------------------------------------

	describe('searchMemos', () => {
		it('returns empty array when no memos match', async () => {
			const results = await searchMemos({ query: 'absolutely nothing here xyzzy' });
			expect(results).toEqual([]);
		});

		it('returns memos matching the query', async () => {
			const { thread } = await seedThreads();
			await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Quantum Computing',
				summary: 'Notes about quantum computing research',
				content: 'Quantum bits, superposition, entanglement.',
			});

			const results = await searchMemos({ query: 'quantum computing' });
			expect(results.length).toBeGreaterThan(0);
			expect(results.some(r => r.memo_id === 'M:1')).toBe(true);
		});

		it('includes content_preview (first 400 chars of content)', async () => {
			const { thread } = await seedThreads();
			const longContent = 'A'.repeat(600);
			await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Preview Test',
				summary: 'Testing content preview truncation',
				content: longContent,
			});

			const results = await searchMemos({ query: 'Preview Test truncation' });
			expect(results.length).toBeGreaterThan(0);
			const hit = results.find(r => r.memo_id === 'M:1');
			expect(hit).toBeDefined();
			expect(hit.content_preview).toHaveLength(400);
			expect(hit.content_preview).toBe('A'.repeat(400));
		});

		it('results have a score field', async () => {
			const { thread } = await seedThreads();
			await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Score Field',
				summary: 'Testing that score is present',
				content: 'content here',
			});

			const results = await searchMemos({ query: 'Score Field' });
			expect(results.length).toBeGreaterThan(0);
			results.forEach(r => expect(typeof r.score).toBe('number'));
		});

		it('scoped by bucket_id: returns only memos under that bucket', async () => {
			const { thread, bucket } = await seedThreads();
			const bucket2 = await createBucket({ name: 'Other Bucket', summary: 'other' });
			const threadOther = await createThread({ parent_bucket_id: bucket2.bucket_id, name: 'Other Thread', summary: 'other' });

			await createMemo({ parent_thread_id: thread.thread_id, title: 'Alpha', summary: 'Alpha memo', content: 'alpha content' });
			await createMemo({ parent_thread_id: threadOther.thread_id, title: 'Beta', summary: 'Beta memo', content: 'beta content' });

			const results = await searchMemos({ query: 'Alpha', bucket_id: bucket.bucket_id });
			const ids = results.map(r => r.memo_id);
			expect(ids).toContain('M:1');
			expect(ids).not.toContain('M:2');
		});

		it('scoped by thread_id: returns only memos in that thread', async () => {
			const { thread, thread2 } = await seedThreads();
			await createMemo({ parent_thread_id: thread.thread_id, title: 'In Thread A', summary: 'belongs to A', content: 'aaa' });
			await createMemo({ parent_thread_id: thread2.thread_id, title: 'In Thread B', summary: 'belongs to B', content: 'bbb' });

			const results = await searchMemos({ query: 'Thread A Thread B', thread_id: thread.thread_id });
			const ids = results.map(r => r.memo_id);
			expect(ids).toContain('M:1');
			expect(ids).not.toContain('M:2');
		});

		it('when both bucket_id and thread_id are provided, thread_id takes precedence', async () => {
			const { thread, thread2, bucket } = await seedThreads();
			await createMemo({ parent_thread_id: thread.thread_id, title: 'Memo In A', summary: 'in thread a', content: 'aaaa' });
			await createMemo({ parent_thread_id: thread2.thread_id, title: 'Memo In B', summary: 'in thread b', content: 'bbbb' });

			// thread_id = thread2, so only M:2 should appear, even though bucket_id covers both
			const results = await searchMemos({ query: 'Memo', thread_id: thread2.thread_id, bucket_id: bucket.bucket_id });
			const ids = results.map(r => r.memo_id);
			expect(ids).toContain('M:2');
			expect(ids).not.toContain('M:1');
		});

		it('no scope returns memos from all buckets/threads', async () => {
			const { thread, thread2 } = await seedThreads();
			await createMemo({ parent_thread_id: thread.thread_id, title: 'Global One', summary: 'global memo one', content: 'aaa' });
			await createMemo({ parent_thread_id: thread2.thread_id, title: 'Global Two', summary: 'global memo two', content: 'bbb' });

			const results = await searchMemos({ query: 'Global' });
			const ids = results.map(r => r.memo_id);
			expect(ids).toContain('M:1');
			expect(ids).toContain('M:2');
		});
	});


	// -------------------------------------------------------------------------
	// updateMemo
	// -------------------------------------------------------------------------

	describe('updateMemo', () => {
		describe('field updates', () => {
			it('updates title only', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Old Title', summary: 'Sum', content: 'Con' });

				const updated = await updateMemo({ memo_id: memo.memo_id, title: 'New Title' });

				expect(updated.memo_title).toBe('New Title');
				expect(updated.memo_summary).toBe('Sum');
				expect(updated.memo_content).toBe('Con');
			});

			it('updates summary only', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Title', summary: 'Old Sum', content: 'Con' });

				const updated = await updateMemo({ memo_id: memo.memo_id, summary: 'New Summary' });

				expect(updated.memo_summary).toBe('New Summary');
				expect(updated.memo_title).toBe('Title');
				expect(updated.memo_content).toBe('Con');
			});

			it('replaces full content (Mode 1)', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'T', summary: 'S', content: 'Old Content' });

				const updated = await updateMemo({ memo_id: memo.memo_id, content: 'Brand New Content' });

				expect(updated.memo_content).toBe('Brand New Content');
			});

			it('refreshes updated_at on update', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'T', summary: 'S', content: 'C' });
				const original_updated_at = memo.updated_at;

				// Small pause so timestamp changes
				await new Promise(r => setTimeout(r, 1100));

				const updated = await updateMemo({ memo_id: memo.memo_id, title: 'Changed' });

				expect(updated.updated_at).not.toBe(original_updated_at);
			});

			it('throws when memo_id does not exist', async () => {
				await expect(updateMemo({ memo_id: 'M:999', title: 'X' })).rejects.toThrow('M:999');
			});

			it('throws when no fields provided', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'T', summary: 'S', content: 'C' });

				await expect(updateMemo({ memo_id: memo.memo_id })).rejects.toThrow('No fields provided');
			});

			it('throws when both content and line_edits are provided', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'T', summary: 'S', content: 'Line 1\nLine 2' });

				await expect(
					updateMemo({ memo_id: memo.memo_id, content: 'new', line_edits: [{ line: 1, content: 'x' }] }),
				).rejects.toThrow('mutually exclusive');
			});
		});


		describe('line edits (Mode 2)', () => {
			it('replaces a single line', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({
					parent_thread_id: thread.thread_id,
					title: 'T',
					summary: 'S',
					content: 'Line 1\nLine 2\nLine 3',
				});

				const updated = await updateMemo({
					memo_id: memo.memo_id,
					line_edits: [{ line: 2, content: 'Replaced Line 2' }],
				});

				expect(updated.memo_content).toBe('Line 1\nReplaced Line 2\nLine 3');
			});

			it('applies multiple line edits in a single call', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({
					parent_thread_id: thread.thread_id,
					title: 'T',
					summary: 'S',
					content: 'Line 1\nLine 2\nLine 3',
				});

				const updated = await updateMemo({
					memo_id: memo.memo_id,
					line_edits: [
						{ line: 1, content: 'New Line 1' },
						{ line: 3, content: 'New Line 3' },
					],
				});

				expect(updated.memo_content).toBe('New Line 1\nLine 2\nNew Line 3');
			});

			it('line: 1 edits the first line (1-indexed)', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({
					parent_thread_id: thread.thread_id,
					title: 'T',
					summary: 'S',
					content: 'First\nSecond',
				});

				const updated = await updateMemo({
					memo_id: memo.memo_id,
					line_edits: [{ line: 1, content: 'Edited First' }],
				});

				expect(updated.memo_content.startsWith('Edited First')).toBe(true);
			});

			it('throws when line number exceeds total lines', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({
					parent_thread_id: thread.thread_id,
					title: 'T',
					summary: 'S',
					content: 'Line 1\nLine 2\nLine 3',
				});

				await expect(
					updateMemo({ memo_id: memo.memo_id, line_edits: [{ line: 4, content: 'Out of bounds' }] }),
				).rejects.toThrow('out of bounds');
			});

			it('throws when line number is less than 1', async () => {
				const { thread } = await seedThreads();
				const memo = await createMemo({
					parent_thread_id: thread.thread_id,
					title: 'T',
					summary: 'S',
					content: 'Line 1\nLine 2',
				});

				await expect(
					updateMemo({ memo_id: memo.memo_id, line_edits: [{ line: 0, content: 'Bad' }] }),
				).rejects.toThrow('out of bounds');
			});

			it('throws when memo not found in line_edits path', async () => {
				await expect(
					updateMemo({ memo_id: 'M:999', line_edits: [{ line: 1, content: 'X' }] }),
				).rejects.toThrow('M:999');
			});
		});
	});


	// -------------------------------------------------------------------------
	// deleteMemo
	// -------------------------------------------------------------------------

	describe('deleteMemo', () => {
		it('removes the memo from the database', async () => {
			const db = getDb();
			const { thread } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Del', summary: 'S', content: 'C' });

			await deleteMemo(memo.memo_id);

			const row = db.prepare('SELECT * FROM memos WHERE memo_id = ?').get(memo.memo_id);
			expect(row).toBeUndefined();
		});

		it('returns { memo_id, parent_thread_id }', async () => {
			const { thread } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Del', summary: 'S', content: 'C' });

			const result = await deleteMemo(memo.memo_id);

			expect(result.memo_id).toBe(memo.memo_id);
			expect(result.parent_thread_id).toBe(thread.thread_id);
		});

		it('throws when memo_id does not exist', async () => {
			await expect(deleteMemo('M:999')).rejects.toThrow('M:999');
		});

		it('removes the vector entry from memos_vec', async () => {
			const db = getDb();
			const { thread } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Vec Del', summary: 'S', content: 'C' });

			const countBefore = db.prepare('SELECT COUNT(*) AS n FROM memos_vec').get().n;
			await deleteMemo(memo.memo_id);
			const countAfter = db.prepare('SELECT COUNT(*) AS n FROM memos_vec').get().n;

			expect(countAfter).toBe(countBefore - 1);
		});
	});


	// -------------------------------------------------------------------------
	// moveMemo
	// -------------------------------------------------------------------------

	describe('moveMemo', () => {
		it('updates the memo parent_thread_id to the new thread', async () => {
			const db = getDb();
			const { thread, thread2 } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Move Me', summary: 'S', content: 'C' });

			moveMemo(memo.memo_id, thread2.thread_id);

			const row = db.prepare('SELECT parent_thread_id FROM memos WHERE memo_id = ?').get(memo.memo_id);
			expect(row.parent_thread_id).toBe(thread2.thread_id);
		});

		it('returns { memo_id, old_thread_id, new_thread_id }', async () => {
			const { thread, thread2 } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Move Me', summary: 'S', content: 'C' });

			const result = moveMemo(memo.memo_id, thread2.thread_id);

			expect(result.memo_id).toBe(memo.memo_id);
			expect(result.old_thread_id).toBe(thread.thread_id);
			expect(result.new_thread_id).toBe(thread2.thread_id);
		});

		it('throws when memo does not exist', () => {
			expect(() => moveMemo('M:999', 'T:1')).toThrow('M:999');
		});

		it('throws when destination thread does not exist', async () => {
			const { thread } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'T', summary: 'S', content: 'C' });

			expect(() => moveMemo(memo.memo_id, 'T:999')).toThrow('T:999');
		});

		it('throws when memo is already in the destination thread', async () => {
			const { thread } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Same', summary: 'S', content: 'C' });

			expect(() => moveMemo(memo.memo_id, thread.thread_id)).toThrow('already in');
		});
	});


	// -------------------------------------------------------------------------
	// fetchMemos
	// -------------------------------------------------------------------------

	describe('fetchMemos', () => {
		it('returns empty array when given an empty array', async () => {
			await seedThreads();
			const result = fetchMemos([]);
			expect(result).toEqual([]);
		});

		it('returns a single memo when given one ID', async () => {
			const { thread } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Fetch One', summary: 'S', content: 'C' });

			const result = fetchMemos([memo.memo_id]);

			expect(result).toHaveLength(1);
			expect(result[0].memo_id).toBe(memo.memo_id);
		});

		it('returns multiple memos when given multiple IDs', async () => {
			const { thread, thread2 } = await seedThreads();
			const m1 = await createMemo({ parent_thread_id: thread.thread_id, title: 'One', summary: 'S', content: 'C' });
			const m2 = await createMemo({ parent_thread_id: thread2.thread_id, title: 'Two', summary: 'S', content: 'C' });

			const result = fetchMemos([m1.memo_id, m2.memo_id]);

			expect(result).toHaveLength(2);
			const ids = result.map(r => r.memo_id);
			expect(ids).toContain(m1.memo_id);
			expect(ids).toContain(m2.memo_id);
		});

		it('each returned record includes full content (not a preview)', async () => {
			const { thread } = await seedThreads();
			const longContent = 'X'.repeat(1000);
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Full Content', summary: 'S', content: longContent });

			const result = fetchMemos([memo.memo_id]);

			expect(result[0].memo_content).toHaveLength(1000);
			expect(result[0].memo_content).toBe(longContent);
		});

		it('silently filters out missing IDs without throwing', async () => {
			const { thread } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'Real', summary: 'S', content: 'C' });

			const result = fetchMemos([memo.memo_id, 'M:999', 'M:8888']);

			expect(result).toHaveLength(1);
			expect(result[0].memo_id).toBe(memo.memo_id);
		});
	});


	// -------------------------------------------------------------------------
	// linked_memos column — populated by create + update from content
	// -------------------------------------------------------------------------

	describe('linked_memos column', () => {
		it('createMemo stores extracted refs in linked_memos', async () => {
			const db = getDb();
			const { thread } = await seedThreads();

			// Target memos first so the links actually resolve to something real
			const target = await createMemo({ parent_thread_id: thread.thread_id, title: 'Target', summary: 'T', content: 'x' });

			const memo = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Author',
				summary: 'S',
				content: `See [target](${target.memo_id}#intro) for details.`,
			});

			const row = db.prepare('SELECT linked_memos FROM memos WHERE memo_id = ?').get(memo.memo_id);
			expect(JSON.parse(row.linked_memos)).toEqual([`${target.memo_id}#intro`]);
		});

		it('createMemo stores empty array when content has no memo links', async () => {
			const db = getDb();
			const { thread } = await seedThreads();
			const memo = await createMemo({ parent_thread_id: thread.thread_id, title: 'T', summary: 'S', content: 'plain content' });

			const row = db.prepare('SELECT linked_memos FROM memos WHERE memo_id = ?').get(memo.memo_id);
			expect(JSON.parse(row.linked_memos)).toEqual([]);
		});

		it('updateMemo recomputes linked_memos when content is replaced', async () => {
			const db = getDb();
			const { thread } = await seedThreads();
			const memo = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'T',
				summary: 'S',
				content: 'no links yet',
			});

			await updateMemo({ memo_id: memo.memo_id, content: 'Now linked [to](M:42#section-a).' });

			const row = db.prepare('SELECT linked_memos FROM memos WHERE memo_id = ?').get(memo.memo_id);
			expect(JSON.parse(row.linked_memos)).toEqual(['M:42#section-a']);
		});

		it('updateMemo recomputes linked_memos when line_edits change a link', async () => {
			const db = getDb();
			const { thread } = await seedThreads();
			const memo = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'T',
				summary: 'S',
				content: 'Line 1\nLine 2',
			});

			await updateMemo({
				memo_id: memo.memo_id,
				line_edits: [{ line: 2, content: 'Now [linked](M:7).' }],
			});

			const row = db.prepare('SELECT linked_memos FROM memos WHERE memo_id = ?').get(memo.memo_id);
			expect(JSON.parse(row.linked_memos)).toEqual(['M:7']);
		});

		it('updateMemo clears linked_memos when new content has no refs', async () => {
			const db = getDb();
			const { thread } = await seedThreads();
			const memo = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'T',
				summary: 'S',
				content: 'See [m](M:1) and [n](M:2#x).',
			});

			await updateMemo({ memo_id: memo.memo_id, content: 'no more links' });

			const row = db.prepare('SELECT linked_memos FROM memos WHERE memo_id = ?').get(memo.memo_id);
			expect(JSON.parse(row.linked_memos)).toEqual([]);
		});

		it('updateMemo leaves linked_memos untouched when only title/summary change', async () => {
			const db = getDb();
			const { thread } = await seedThreads();
			const memo = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'T',
				summary: 'S',
				content: 'See [m](M:3#heading).',
			});

			await updateMemo({ memo_id: memo.memo_id, title: 'New Title' });

			const row = db.prepare('SELECT linked_memos FROM memos WHERE memo_id = ?').get(memo.memo_id);
			expect(JSON.parse(row.linked_memos)).toEqual(['M:3#heading']);
		});
	});


	// -------------------------------------------------------------------------
	// fetchMemos enrichment — linked_memos + similar_memos
	// -------------------------------------------------------------------------

	describe('fetchMemos enrichment', () => {
		it('resolves linked_memos with target title + summary + heading', async () => {
			const { thread } = await seedThreads();
			const target = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Target Title',
				summary: 'Target Summary',
				content: 'target body',
			});
			const author = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Author',
				summary: 'S',
				content: `Go read [that](${target.memo_id}#section-one).`,
			});

			const [fetched] = fetchMemos([author.memo_id]);

			expect(fetched.linked_memos).toEqual([
				{
					memo_id: target.memo_id,
					heading: 'section-one',
					memo_title: 'Target Title',
					memo_summary: 'Target Summary',
				},
			]);
		});

		it('drops linked refs whose target memo does not exist', async () => {
			const { thread } = await seedThreads();
			const author = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Author',
				summary: 'S',
				content: 'Broken [link](M:999#ghost).',
			});

			const [fetched] = fetchMemos([author.memo_id]);
			expect(fetched.linked_memos).toEqual([]);
		});

		it('returns empty linked_memos / similar_memos when nothing qualifies', async () => {
			const { thread } = await seedThreads();
			const memo = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Unique Alpha',
				summary: 'Unique Alpha summary',
				content: 'alpha body',
			});

			const [fetched] = fetchMemos([memo.memo_id]);
			expect(fetched.linked_memos).toEqual([]);
			expect(fetched.similar_memos).toEqual([]);
		});

		it('returns top-5 similar_memos and excludes self', async () => {
			const { thread } = await seedThreads();

			// Embedder is mocked on (title + summary), so identical title+summary
			// produces identical vectors → cosine similarity = 1 (well above the 0.6 threshold).
			const params = (content) => ({
				parent_thread_id: thread.thread_id,
				title: 'Identical Title',
				summary: 'Identical Summary',
				content,
			});

			const m1 = await createMemo(params('c1'));
			const m2 = await createMemo(params('c2'));
			const m3 = await createMemo(params('c3'));
			const m4 = await createMemo(params('c4'));
			const m5 = await createMemo(params('c5'));
			const m6 = await createMemo(params('c6'));
			const m7 = await createMemo(params('c7'));

			const [fetched] = fetchMemos([m1.memo_id]);

			// Self excluded, capped at 5
			expect(fetched.similar_memos).toHaveLength(5);
			const ids = fetched.similar_memos.map(s => s.memo_id);
			expect(ids).not.toContain(m1.memo_id);

			// All picks should come from the pool of siblings
			const pool = [m2.memo_id, m3.memo_id, m4.memo_id, m5.memo_id, m6.memo_id, m7.memo_id];
			ids.forEach(id => expect(pool).toContain(id));

			// Each entry has id + title + summary + similarity
			fetched.similar_memos.forEach(s => {
				expect(s.memo_title).toBe('Identical Title');
				expect(s.memo_summary).toBe('Identical Summary');
				expect(typeof s.similarity).toBe('number');
				expect(s.similarity).toBeGreaterThanOrEqual(0.5);
			});
		});

		it('filters out memos below the similarity threshold', async () => {
			const { thread } = await seedThreads();

			// Vastly different title+summary pairs → hashes diverge → low similarity.
			const seed = await createMemo({
				parent_thread_id: thread.thread_id,
				title: 'Zebra stripes biology',
				summary: 'Zoology notes on zebras',
				content: 'x',
			});

			// Build unrelated siblings with unrelated title/summary text
			await createMemo({ parent_thread_id: thread.thread_id, title: 'Quantum chromodynamics', summary: 'Particle physics', content: 'y' });
			await createMemo({ parent_thread_id: thread.thread_id, title: 'Renaissance art', summary: 'Painting movements', content: 'y' });

			const [fetched] = fetchMemos([seed.memo_id]);
			// With the deterministic pseudo-random embedder, unrelated hashes almost
			// never clear cos ≥ 0.6. Assert that the filter is actually applied.
			expect(fetched.similar_memos.length).toBe(0);
		});
	});
});
