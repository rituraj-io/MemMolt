// MemMolt search benchmark.
// Seeds a realistic dataset, warms the embedder, then runs N search queries
// and reports average / p50 / p95 / p99 latency.
//
// Usage:
//   node benchmark/search-benchmark.js              # default 10,000 queries
//   node benchmark/search-benchmark.js 5000         # custom count
//   MEMCLAW_DB_PATH=:memory: node ...               # in-memory run

const path = require('path');
const fs = require('fs');


// Use an isolated benchmark DB so we don't clobber the user's real memory
const BENCH_DB = path.join(__dirname, '.bench.sqlite');
if (fs.existsSync(BENCH_DB)) fs.unlinkSync(BENCH_DB);
process.env.MEMCLAW_DB_PATH = BENCH_DB;


const { initSqlite, closeSqlite } = require('../database/sqlite');
const { createBucket } = require('../functions/memory/buckets/create');
const { createThread } = require('../functions/memory/threads/create');
const { createMemo } = require('../functions/memory/memos/create');
const { searchMemos } = require('../functions/memory/memos/search');
const { searchBuckets } = require('../functions/memory/buckets/search');
const { searchThreads } = require('../functions/memory/threads/search');


// Seed data — realistic volumes for a power user (not a stress test)
const SEED_BUCKETS = 10;
const SEED_THREADS_PER_BUCKET = 5;
const SEED_MEMOS_PER_THREAD = 20; // → 1000 memos total

// Benchmark queries
const TOTAL_QUERIES = Number(process.argv[2]) || 10_000;
const WARMUP_QUERIES = 50;


// Realistic sample queries (mix of single words, phrases, fuzzy terms)
const SAMPLE_QUERIES = [
	'thumbnail design',
	'retention hooks',
	'script ideas',
	'meta description',
	'reels editing tips',
	'viral content patterns',
	'ad copy that converts',
	'customer avatar research',
	'funnel analysis',
	'email subject lines',
	'marketing automation',
	'SEO keywords',
	'landing page conversion',
	'content calendar',
	'brand voice guidelines',
	'product launch checklist',
	'analytics dashboard',
	'customer feedback',
	'pricing strategy',
	'competitor research',
];

const SAMPLE_TOPICS = [
	'Content Creation',
	'Marketing',
	'Product Development',
	'Customer Research',
	'Analytics',
	'Design',
	'Engineering',
	'Operations',
	'Finance',
	'Personal Development',
];

const SAMPLE_SUBTOPICS = [
	'YouTube',
	'Instagram',
	'TikTok',
	'Email Campaigns',
	'SEO',
	'Paid Ads',
	'Organic Growth',
	'Retention',
	'Onboarding',
	'Pricing',
];


/** Build a realistic-ish memo body */
function makeContent(i) {
	return `# Memo ${i}\n\nKey insight ${i}: reach a segment with a clear hook, measure the response, iterate quickly. Test variations A and B. Track engagement for 7 days before deciding.\n\n- Item one for memo ${i}\n- Item two about ${SAMPLE_QUERIES[i % SAMPLE_QUERIES.length]}\n- Item three about experimentation\n\nSee related notes elsewhere. Keep summaries accurate.`;
}


/** Percentile of a sorted numeric array */
function percentile(sorted, p) {
	const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
	return sorted[idx];
}


/** Format ms with 2 decimals */
function fmt(ms) {
	return `${ms.toFixed(2)} ms`;
}


async function seed() {
	console.log('Seeding database...');
	const t0 = Date.now();

	/** @type {string[]} */
	const threadIds = [];
	const memoIds = [];

	for (let b = 0; b < SEED_BUCKETS; b++) {
		const topic = SAMPLE_TOPICS[b % SAMPLE_TOPICS.length];
		const bucket = await createBucket({
			name: `${topic} ${b}`,
			summary: `Notes, ideas, and references about ${topic}. Running log of what we've tried and what worked.`,
		});

		for (let t = 0; t < SEED_THREADS_PER_BUCKET; t++) {
			const subtopic = SAMPLE_SUBTOPICS[(b * SEED_THREADS_PER_BUCKET + t) % SAMPLE_SUBTOPICS.length];
			const thread = await createThread({
				parent_bucket_id: bucket.bucket_id,
				name: `${subtopic} ${b}.${t}`,
				summary: `Working notes on ${subtopic} tactics, campaigns, and playbooks under ${topic}.`,
			});
			threadIds.push(thread.thread_id);

			for (let m = 0; m < SEED_MEMOS_PER_THREAD; m++) {
				const i = b * SEED_THREADS_PER_BUCKET * SEED_MEMOS_PER_THREAD + t * SEED_MEMOS_PER_THREAD + m;
				const memo = await createMemo({
					parent_thread_id: thread.thread_id,
					title: `${SAMPLE_QUERIES[i % SAMPLE_QUERIES.length]} — take ${m}`,
					summary: `Hypothesis, test, result for ${SAMPLE_QUERIES[i % SAMPLE_QUERIES.length]}. Keep it focused.`,
					content: makeContent(i),
				});
				memoIds.push(memo.memo_id);
			}
		}
	}

	const totalMemos = threadIds.length * SEED_MEMOS_PER_THREAD;
	console.log(
		`  ${SEED_BUCKETS} buckets · ${threadIds.length} threads · ${totalMemos} memos · seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`
	);

	return { threadIds, memoIds };
}


async function runBenchmark(label, fn, iterations) {
	// Warm-up
	for (let i = 0; i < WARMUP_QUERIES; i++) await fn(i);

	// Measured run
	const samples = new Float64Array(iterations);
	const t0 = process.hrtime.bigint();

	for (let i = 0; i < iterations; i++) {
		const s = process.hrtime.bigint();
		await fn(i);
		samples[i] = Number(process.hrtime.bigint() - s) / 1e6; // → ms
	}

	const wallSeconds = Number(process.hrtime.bigint() - t0) / 1e9;
	const sorted = Array.from(samples).sort((a, b) => a - b);
	const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

	console.log(`\n${label}`);
	console.log(`  Iterations : ${iterations.toLocaleString()}`);
	console.log(`  Wall time  : ${wallSeconds.toFixed(2)}s`);
	console.log(`  Throughput : ${(iterations / wallSeconds).toFixed(0)} ops/sec`);
	console.log(`  Avg        : ${fmt(avg)}`);
	console.log(`  p50        : ${fmt(percentile(sorted, 50))}`);
	console.log(`  p95        : ${fmt(percentile(sorted, 95))}`);
	console.log(`  p99        : ${fmt(percentile(sorted, 99))}`);
	console.log(`  Max        : ${fmt(sorted[sorted.length - 1])}`);

	return { label, iterations, wallSeconds, avg, p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99), max: sorted[sorted.length - 1] };
}


async function main() {
	console.log(`\nMemMolt Search Benchmark`);
	console.log(`========================`);
	console.log(`Queries: ${TOTAL_QUERIES.toLocaleString()}  ·  Warmup: ${WARMUP_QUERIES}\n`);

	initSqlite();
	await seed();

	console.log('\nWarming up embedder (first model invocation downloads ~90MB on fresh install)...');
	const tWarm = Date.now();
	await searchMemos({ query: 'warm up' });
	console.log(`  Embedder warm in ${((Date.now() - tWarm) / 1000).toFixed(2)}s`);

	const results = [];

	results.push(
		await runBenchmark('search_memos (hybrid: FTS5 + vec + RRF)', async (i) => {
			await searchMemos({ query: SAMPLE_QUERIES[i % SAMPLE_QUERIES.length] });
		}, TOTAL_QUERIES)
	);

	results.push(
		await runBenchmark('search_bucket (hybrid: FTS5 + vec + RRF)', async (i) => {
			await searchBuckets(SAMPLE_TOPICS[i % SAMPLE_TOPICS.length]);
		}, Math.min(TOTAL_QUERIES, 2000))
	);

	results.push(
		await runBenchmark('search_thread (hybrid: FTS5 + vec + RRF)', async (i) => {
			await searchThreads(SAMPLE_SUBTOPICS[i % SAMPLE_SUBTOPICS.length]);
		}, Math.min(TOTAL_QUERIES, 2000))
	);

	closeSqlite();
	if (fs.existsSync(BENCH_DB)) fs.unlinkSync(BENCH_DB);
	const walFile = BENCH_DB + '-wal';
	const shmFile = BENCH_DB + '-shm';
	if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
	if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

	// Write summary JSON for README badge generation / CI checks
	const summary = {
		timestamp: new Date().toISOString(),
		node: process.version,
		platform: `${process.platform}-${process.arch}`,
		dataset: {
			buckets: SEED_BUCKETS,
			threads: SEED_BUCKETS * SEED_THREADS_PER_BUCKET,
			memos: SEED_BUCKETS * SEED_THREADS_PER_BUCKET * SEED_MEMOS_PER_THREAD,
		},
		results,
	};
	fs.writeFileSync(path.join(__dirname, 'latest.json'), JSON.stringify(summary, null, 2));
	console.log(`\nSummary written to benchmark/latest.json`);
}


main().catch((err) => {
	console.error('Benchmark failed:', err);
	process.exit(1);
});
