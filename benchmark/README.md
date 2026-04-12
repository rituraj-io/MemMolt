# MemMolt Benchmarks

Speed tests for search and fetch operations. Results are written to `latest.json` and surfaced in the project README.

## Run

```bash
npm run benchmark                               # 10,000 queries (default)
node benchmark/search-benchmark.js 5000         # custom count
```

## What it measures

1. **Seed phase** — creates 10 buckets × 5 threads × 20 memos = **1,000 memos** with realistic titles, summaries, and content.
2. **Embedder warmup** — first real inference loads the `all-MiniLM-L6-v2` model into memory. This is a one-time cost per process, not part of the measured timing.
3. **Measured runs**:
   - `search_memos` — hybrid search (FTS5 + vector KNN + RRF)
   - `search_bucket` — same hybrid search at the bucket level
   - `search_thread` — same at the thread level
   - `fetch_memos` — batch fetch of 10 memos by ID (pure SQL, no embedding)

Each benchmark runs 50 warmup iterations (discarded), then the full sample. We report:

- **Average** latency
- **p50 / p95 / p99** percentiles
- **Throughput** (ops/sec)
- **Max** observed latency

## Notes

- Uses an isolated SQLite file (`benchmark/.bench.sqlite`) — your real memory is untouched.
- The file is deleted at the end of the run.
- First-ever run on a machine will pause ~30s to download the embedding model; subsequent runs are fast.
- Results vary by hardware. The committed `latest.json` reflects the maintainer's machine.
