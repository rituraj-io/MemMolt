// Jest setup — force all tests to use an in-memory SQLite DB.
// MUST run before any module that reads MEMMOLT_DB_PATH.

process.env.MEMMOLT_DB_PATH = ':memory:';
