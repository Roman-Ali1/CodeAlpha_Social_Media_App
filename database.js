/**
 * database.js
 * SQLite via sql.js (pure JavaScript - no native build required)
 * Handles all DB initialization, schema creation, and query helpers.
 */

const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const DB_PATH = path.join(__dirname, "socialapp.db");

// The database instance - shared across all query calls
let db = null;

/* ─────────────────────────────────────────────────────────────
   SCHEMA
   All 5 tables defined here.
   CREATE TABLE IF NOT EXISTS means safe to run on every startup.
───────────────────────────────────────────────────────────── */
const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    bio         TEXT DEFAULT '',
    avatar      TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    image_url   TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS likes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(follower_id, following_id)
  );
`;

/* ─────────────────────────────────────────────────────────────
   PERSIST
   Exports DB from memory and writes bytes to disk.
   Call this after every INSERT / UPDATE / DELETE.
───────────────────────────────────────────────────────────── */
function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/* ─────────────────────────────────────────────────────────────
   QUERY HELPERS
   Three functions cover 100% of your query needs.
───────────────────────────────────────────────────────────── */

/**
 * run() — For INSERT, UPDATE, DELETE
 * Returns { lastID } so you can fetch the newly created row.
 *
 * Example:
 *   const { lastID } = run("INSERT INTO users (username) VALUES (?)", ["roman"]);
 */
function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();

  const result = db.exec("SELECT last_insert_rowid()");
  const lastID = result[0]?.values[0][0];

  persist(); // Always save to disk after a write
  return { lastID };
}

/**
 * all() — For SELECT that returns multiple rows
 * Returns array of plain objects.
 *
 * Example:
 *   const posts = all("SELECT * FROM posts WHERE user_id = ?", [5]);
 */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * get() — For SELECT that returns a single row
 * Returns the row object or null if not found.
 *
 * Example:
 *   const user = get("SELECT * FROM users WHERE id = ?", [1]);
 */
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/* ─────────────────────────────────────────────────────────────
   INIT
   Call this once when the server starts.
   Loads existing DB from disk or creates a fresh one.
───────────────────────────────────────────────────────────── */
async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    // Load existing database from disk
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log("✅ Loaded existing database from disk");
  } else {
    // Create brand new empty database
    db = new SQL.Database();
    console.log("✅ Created new database");
  }

  // Run schema — creates tables if they don't exist yet
  db.run(SCHEMA);
  persist();

  console.log("✅ Database ready:", DB_PATH);
}

// Export everything server.js will need
module.exports = { initDB, run, all, get };