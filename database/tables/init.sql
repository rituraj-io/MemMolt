-- Enable foreign keys
PRAGMA foreign_keys = ON;


-- Buckets table
CREATE TABLE IF NOT EXISTS buckets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket_id TEXT UNIQUE NOT NULL,
    bucket_name TEXT NOT NULL,
    bucket_summary TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- Threads table
CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT UNIQUE NOT NULL,
    thread_name TEXT NOT NULL,
    thread_summary TEXT NOT NULL,
    parent_bucket_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_bucket_id) REFERENCES buckets(bucket_id) ON DELETE CASCADE
);


-- Memos table
CREATE TABLE IF NOT EXISTS memos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memo_id TEXT UNIQUE NOT NULL,
    memo_title TEXT NOT NULL,
    memo_summary TEXT NOT NULL,
    memo_content TEXT NOT NULL,
    linked_memos TEXT NOT NULL DEFAULT '[]',
    parent_thread_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_thread_id) REFERENCES threads(thread_id) ON DELETE CASCADE
);


-- FTS5 virtual tables
CREATE VIRTUAL TABLE IF NOT EXISTS buckets_fts USING fts5(
    bucket_name,
    bucket_summary,
    content='buckets',
    content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS threads_fts USING fts5(
    thread_name,
    thread_summary,
    content='threads',
    content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS memos_fts USING fts5(
    memo_title,
    memo_summary,
    content='memos',
    content_rowid='id'
);


-- Vector virtual tables (sqlite-vec). 384-dim vectors from all-MiniLM-L6-v2.
-- entity_id (TEXT) is the prefixed ID like "B:1", "T:5", "M:42".
CREATE VIRTUAL TABLE IF NOT EXISTS buckets_vec USING vec0(
    id TEXT PRIMARY KEY,
    embedding float[384]
);

CREATE VIRTUAL TABLE IF NOT EXISTS threads_vec USING vec0(
    id TEXT PRIMARY KEY,
    embedding float[384]
);

CREATE VIRTUAL TABLE IF NOT EXISTS memos_vec USING vec0(
    id TEXT PRIMARY KEY,
    embedding float[384]
);


-- Triggers to keep FTS5 in sync with main tables

-- Buckets FTS triggers
CREATE TRIGGER IF NOT EXISTS buckets_ai AFTER INSERT ON buckets BEGIN
    INSERT INTO buckets_fts(rowid, bucket_name, bucket_summary)
    VALUES (new.id, new.bucket_name, new.bucket_summary);
END;

CREATE TRIGGER IF NOT EXISTS buckets_ad AFTER DELETE ON buckets BEGIN
    INSERT INTO buckets_fts(buckets_fts, rowid, bucket_name, bucket_summary)
    VALUES ('delete', old.id, old.bucket_name, old.bucket_summary);
END;

CREATE TRIGGER IF NOT EXISTS buckets_au AFTER UPDATE ON buckets BEGIN
    INSERT INTO buckets_fts(buckets_fts, rowid, bucket_name, bucket_summary)
    VALUES ('delete', old.id, old.bucket_name, old.bucket_summary);
    INSERT INTO buckets_fts(rowid, bucket_name, bucket_summary)
    VALUES (new.id, new.bucket_name, new.bucket_summary);
END;


-- Threads FTS triggers
CREATE TRIGGER IF NOT EXISTS threads_ai AFTER INSERT ON threads BEGIN
    INSERT INTO threads_fts(rowid, thread_name, thread_summary)
    VALUES (new.id, new.thread_name, new.thread_summary);
END;

CREATE TRIGGER IF NOT EXISTS threads_ad AFTER DELETE ON threads BEGIN
    INSERT INTO threads_fts(threads_fts, rowid, thread_name, thread_summary)
    VALUES ('delete', old.id, old.thread_name, old.thread_summary);
END;

CREATE TRIGGER IF NOT EXISTS threads_au AFTER UPDATE ON threads BEGIN
    INSERT INTO threads_fts(threads_fts, rowid, thread_name, thread_summary)
    VALUES ('delete', old.id, old.thread_name, old.thread_summary);
    INSERT INTO threads_fts(rowid, thread_name, thread_summary)
    VALUES (new.id, new.thread_name, new.thread_summary);
END;


-- Memos FTS triggers
CREATE TRIGGER IF NOT EXISTS memos_ai AFTER INSERT ON memos BEGIN
    INSERT INTO memos_fts(rowid, memo_title, memo_summary)
    VALUES (new.id, new.memo_title, new.memo_summary);
END;

CREATE TRIGGER IF NOT EXISTS memos_ad AFTER DELETE ON memos BEGIN
    INSERT INTO memos_fts(memos_fts, rowid, memo_title, memo_summary)
    VALUES ('delete', old.id, old.memo_title, old.memo_summary);
END;

CREATE TRIGGER IF NOT EXISTS memos_au AFTER UPDATE ON memos BEGIN
    INSERT INTO memos_fts(memos_fts, rowid, memo_title, memo_summary)
    VALUES ('delete', old.id, old.memo_title, old.memo_summary);
    INSERT INTO memos_fts(rowid, memo_title, memo_summary)
    VALUES (new.id, new.memo_title, new.memo_summary);
END;
