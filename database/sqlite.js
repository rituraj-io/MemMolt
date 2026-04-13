const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');
const path = require('path');
const fs = require('fs');
const os = require('os');


// DB path resolution (priority):
//   1. MEMMOLT_DB_PATH env var — explicit override (e.g. ':memory:' for tests).
//   2. ${CLAUDE_PLUGIN_DATA}/memmolt.sqlite — when running as a Claude Code plugin.
//      Claude Code sets this to a per-plugin persistent directory that survives
//      updates, so user memory is never wiped when the plugin is reinstalled.
//   3. <repo>/.db/memmolt.sqlite — when running from a cloned git checkout
//      (detected by the presence of a .git directory next to package.json). This
//      preserves the dev workflow for contributors running `npm start` locally.
//   4. ~/.memmolt/memmolt.sqlite — safe default for `npm install -g memmolt`
//      and any other install path. Outside any plugin cache so it's never
//      touched by plugin update/uninstall.
function resolveDbPath() {
	if (process.env.MEMMOLT_DB_PATH) return process.env.MEMMOLT_DB_PATH;

	if (process.env.CLAUDE_PLUGIN_DATA) {
		return path.join(process.env.CLAUDE_PLUGIN_DATA, 'memmolt.sqlite');
	}

	const repoRoot = path.join(__dirname, '..');
	if (fs.existsSync(path.join(repoRoot, '.git'))) {
		return path.join(repoRoot, '.db', 'memmolt.sqlite');
	}

	return path.join(os.homedir(), '.memmolt', 'memmolt.sqlite');
}

const DB_PATH = resolveDbPath();


// Ensure the parent dir exists for filesystem-backed paths.
if (DB_PATH !== ':memory:') {
	const dir = path.dirname(DB_PATH);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}


/** @type {import('better-sqlite3').Database | null} */
let db = null;


/**
 * Initialize SQLite database, load sqlite-vec extension, and run schema
 * @returns {import('better-sqlite3').Database}
 */
function initSqlite() {
	if (db) return db;

	db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');

	// Load sqlite-vec extension for vector virtual tables (vec0)
	sqliteVec.load(db);

	// Run init.sql schema
	const initSql = fs.readFileSync(path.join(__dirname, 'tables', 'init.sql'), 'utf-8');
	db.exec(initSql);

	return db;
}


/**
 * Get the database instance (must call initSqlite first)
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
	if (!db) {
		throw new Error('Database not initialized. Call initSqlite() first.');
	}
	return db;
}


/**
 * Close the database connection. Safe to call multiple times.
 */
function closeSqlite() {
	if (db) {
		db.close();
		db = null;
	}
}


/**
 * Resolved DB path (exported for diagnostics / logging).
 */
const dbPath = DB_PATH;


module.exports = { initSqlite, getDb, closeSqlite, dbPath };
