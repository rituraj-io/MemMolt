# Contributing to MemMolt

Thanks for your interest in contributing! This document covers the basics of how to get a dev environment running, how the codebase is organized, and the conventions we follow.

---

## Getting set up

```bash
git clone https://github.com/rituraj-io/MemMolt.git
cd MemMolt
npm install
npm test
```

If `npm test` passes (127 tests, ~5 seconds), your environment is good to go.

### Requirements

- Node.js 18+
- SQLite is bundled via `better-sqlite3` — no separate install needed
- The embedding model (`all-MiniLM-L6-v2`, ~90 MB) downloads automatically on first real search. Tests use a mocked embedder so you don't need it to run them.

---

## Project layout

```
memmolt/
├── database/
│   ├── sqlite.js           # SQLite connector + sqlite-vec extension loader
│   └── tables/init.sql     # Full schema (tables + FTS5 + vec0 + triggers)
├── functions/
│   ├── memory/             # Domain logic, one folder per entity
│   │   ├── buckets/
│   │   ├── threads/
│   │   └── memos/
│   ├── mcp/                # MCP tool wrappers + tool registry
│   └── utils/              # Embedder, RRF, vector sync, FTS sanitizer, orphan cleanup
├── tests/                  # Jest unit tests mirroring the above
├── documentations/         # Versioned user-facing specs
├── docs/                   # Internal design docs, plans
├── index.js                # Entry point (MCP server + transport selection)
└── README.md
```

### How a request flows

```
MCP client (Claude Code)
        │
        ▼
   index.js              ← transport, routing to tool handler
        │
        ▼
 functions/mcp/*.js      ← thin wrapper: parse params, call domain, shape response
        │
        ▼
functions/memory/**/*.js ← business logic (the only layer that does real work)
        │
        ▼
  database/*.js          ← SQLite queries (source of truth) + vec upserts
```

Keep this separation. MCP handlers should be thin. Domain functions should not know they're being called over MCP.

---

## Design principle: stay lightweight

Before anything else, internalize this: **MemMolt is meant to be fast, small, and invisible**. It should never feel like a heavyweight service. This shapes every architectural decision.

Guidelines for contributions:

- **No separate services.** If your change requires running a second process, a background daemon, or a hosted service — rethink the approach first.
- **No heavy dependencies.** Pause before adding a new `npm install`. Does it bundle native binaries for every OS? Does it pull in dozens of transitive deps? Is there a lighter alternative? Is a short hand-written version viable?
- **No slow paths by default.** Don't introduce a network call, a disk scan, or a big in-memory transform on the hot path (search, create, update). If it's unavoidable, make it lazy.
- **Watch the install size and RAM footprint.** The whole point is that users can run MemMolt alongside Claude Code without noticing it's there.
- **Simplicity beats cleverness.** A plain SQL query usually wins over a clever abstraction. Straight-line code is easier to audit for performance.

If you find yourself thinking *"we could add a worker pool / cache layer / background sync / config system for this"*, first ask: **is the current approach actually slow enough to justify the complexity?** Most of the time, the answer is no.

---

## Coding standards

All from `CLAUDE.md`:

- **Language:** JavaScript with JSDoc types. The TypeScript compiler (`tsc`) runs in `--noEmit --checkJs` mode to enforce type safety.
- **Formatting:** Prettier config in `.prettierrc.json`. Tabs, single quotes, trailing commas (es5), 120-char width.
- **File size:** Keep files focused — aim for 250 lines, hard limit around 500. Split into components/utilities when they grow past that.
- **Sections:** Separate major sections of a file with **2 blank lines**.
- **Comments:** Write a brief comment above each section explaining what it does. Don't comment self-evident lines.
- **No emojis** in code or files unless explicitly requested.
- **Component reuse:** Follow DRY. If you find yourself duplicating logic, factor it out.

Run these before pushing:

```bash
npx tsc --noEmit      # Must be clean
npm test              # Must be all green
```

---

## Adding or changing features

### Adding a new MCP tool

1. **Domain logic** — add the pure function in `functions/memory/<entity>/<action>.js`.
   - Takes a plain-object param, returns a plain-object result.
   - Calls `getDb()` and `syncVector()`/`deleteVector()` as needed.
   - Does NOT know about MCP or HTTP.
2. **MCP handler** — add a thin wrapper in `functions/mcp/<entity>Tools.js`.
   - Parses params, calls the domain function, shapes the response.
   - Adds `agent_guidance` if the next action isn't obvious for the agent.
3. **Tool registration** — add to `TOOL_DEFINITIONS` and the `routeToolCall` switch in `functions/mcp/registerTools.js`.
4. **Tests** — add unit tests in `tests/memory/<entity>.test.js`. MCP wrappers don't need direct tests.
5. **Docs** — update `README.md` tool list and `documentations/VERSION1.0.0.md`.

### Changing the schema

Schema changes touch multiple places. The order matters:

1. Update `database/tables/init.sql` (tables, indexes, triggers, vec tables).
2. Update domain functions that read/write the changed columns.
3. Update vector sync if the embedded text shape changed.
4. Update or add tests to exercise the new schema.
5. Update `documentations/VERSION1.0.0.md` and the design doc under `docs/superpowers/specs/`.

There's currently **no formal migration system**. If you change the schema, manually delete `.db/memclaw.sqlite` before running again. A migration framework is a welcome contribution — see the "Ideas" section below.

---

## Tests

- Framework: **Jest**, configured in `package.json`.
- Test files live in `tests/` mirroring the source structure.
- Each test uses a fresh in-memory SQLite DB via `resetDb()` (see `tests/helpers.js`).
- The embedder is auto-mocked to return deterministic 384-dim vectors derived from input text — same input → same vector, different inputs → different vectors.

```bash
npm test                    # Run the full suite
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
npx jest tests/memory/buckets.test.js    # Single file
npx jest -t 'createBucket'              # By test name
```

Write tests for:
- Happy paths (basic success case)
- Error conditions (invalid inputs, missing parents)
- Cascade effects (deleting a bucket deletes threads + memos + their vectors)
- Edge cases (empty arrays, out-of-bounds line edits, etc.)

You do NOT need to test:
- The MCP wrapper files in `functions/mcp/` (thin routing)
- The embedder or sqlite-vec directly (external, well-tested libs)
- `index.js` transport wiring

---

## Commit messages

Keep them short and descriptive. Conventional prefix is nice but not enforced:

```
feat: add move_memo tool
fix: close SQLite connection on SIGINT
refactor: extract FTS sanitizer into its own util
docs: clarify line_edits mode in VERSION1.0.0
test: cover orphan cleanup transitive cascade
chore: bump dev deps
```

**Don't** commit `.db/`, `node_modules/`, or your local editor config.

**Don't** use `git commit --no-verify` or skip hooks. If a hook is failing, fix the root cause.

---

## Pull requests

1. Fork + branch from `main`.
2. Make your change. Keep the diff focused — one logical change per PR.
3. Run `npx tsc --noEmit` and `npm test`. Both must pass.
4. Open a PR with:
   - What the change does
   - Why it's needed
   - Any breaking changes (flag prominently)
5. Be responsive to review feedback.

If your change touches architecture (new dependency, new layer, new transport), **open an issue first** to discuss the approach. Saves everyone time.

---

## Reporting bugs

Open a GitHub issue with:

- What you tried to do
- What you expected to happen
- What actually happened (error message, logs, test output)
- Your Node version, OS, and MemMolt version
- Minimal reproduction steps if possible

---

## Ideas worth exploring

These are open invitations. PRs welcome:

- **Schema migrations.** A lightweight versioned-migration system (a `migrations/` folder, tracked in a `schema_version` table).
- **Streamable HTTP transport.** Replace the deprecated SSE transport with the newer MCP streamable HTTP.
- **Per-collection embedding models.** Some users may want different models for different entity types.
- **Export / import.** Dump buckets / threads / memos to portable formats (JSON, Markdown archives) and re-import.
- **CLI for manual inspection.** A small `memmolt` CLI for browsing the memory without going through an agent.
- **Multi-user / multi-project support.** Currently one DB file per install. Support multiple databases selectable at connect time.
- **Zod migration.** Convert `TOOL_DEFINITIONS` from JSON schemas to Zod, switch from `Server` to `McpServer` (removes a deprecation warning).

---

## Code of conduct

Be kind, assume good intent, and keep discussions focused on the work. This is a personal tool that people want to trust with their notes — maintain that trust in both code and communication.

---

## License

By contributing, you agree your work will be released under the project's ISC license.
