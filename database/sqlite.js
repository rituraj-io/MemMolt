const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');
const path = require('path');
const fs = require('fs');


// DB path — override via MEMMOLT_DB_PATH env var (e.g. ':memory:' for tests).
// Otherwise defaults to .db/memmolt.sqlite under project root.
const DEFAULT_DB_DIR = path.join(__dirname, '..', '.db');
const DB_PATH = process.env.MEMMOLT_DB_PATH || path.join(DEFAULT_DB_DIR, 'memmolt.sqlite');

// Only create the default dir when using a filesystem path (not for :memory:)
if (!process.env.MEMMOLT_DB_PATH && !fs.existsSync(DEFAULT_DB_DIR)) {
	fs.mkdirSync(DEFAULT_DB_DIR, { recursive: true });
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
 * Close the database connection
 */
function closeSqlite() {
	if (db) {
		db.close();
		db = null;
	}
}


module.exports = { initSqlite, getDb, closeSqlite };
