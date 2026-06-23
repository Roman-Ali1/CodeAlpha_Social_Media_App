/**
 * server.js
 * Nexus Social — Express REST API
 *
 * All routes:
 *
 * AUTH
 *   POST   /api/auth/register
 *   POST   /api/auth/login
 *
 * USERS
 *   GET    /api/users/me
 *   PUT    /api/users/me
 *   GET    /api/users/search/:query
 *   GET    /api/users/:username
 *   GET    /api/users/:username/posts
 *   GET    /api/users/:username/followers
 *   GET    /api/users/:username/following
 *
 * FOLLOWS
 *   POST   /api/users/:username/follow
 *   DELETE /api/users/:username/follow
 *
 * POSTS
 *   GET    /api/posts/feed
 *   GET    /api/posts/explore
 *   POST   /api/posts
 *   DELETE /api/posts/:id
 *
 * LIKES
 *   POST   /api/posts/:id/like
 *   DELETE /api/posts/:id/like
 *
 * COMMENTS
 *   GET    /api/posts/:id/comments
 *   POST   /api/posts/:id/comments
 *   DELETE /api/comments/:id
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const { initDB, run, all, get } = require("./database");

const app = express();
const PORT = 3000;

// Change this to a long random string in production
const JWT_SECRET = "nexus_super_secret_key_2024";

/* ─────────────────────────────────────────────────────────────
   MIDDLEWARE
───────────────────────────────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ─────────────────────────────────────────────────────────────
   AUTH MIDDLEWARE
   Two versions — use the right one on each route.
───────────────────────────────────────────────────────────── */

/**
 * authRequired — blocks request if no valid token
 * Use on: create post, like, comment, follow, edit profile
 */
function authRequired(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = header.split(" ")[1];

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * authOptional — attaches user to req IF token valid, never blocks
 * Use on: view post, view profile (guest can view, but liked/followed
 * state only shows for logged-in users)
 */
function authOptional(req, res, next) {
  const header = req.headers.authorization;

  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.split(" ")[1], JWT_SECRET);
    } catch {
      // Bad token — just ignore it, don't block
    }
  }
  next();
}

/* ─────────────────────────────────────────────────────────────
   HELPER — enrichPosts()
   Adds likesCount, commentsCount, liked to each post.
   Called before sending any post list to the frontend.
───────────────────────────────────────────────────────────── */
function enrichPosts(posts, viewerUserId = null) {
  return posts.map((post) => {
    const likesCount =
      get("SELECT COUNT(*) as c FROM likes WHERE post_id = ?", [post.id])?.c || 0;

    const commentsCount =
      get("SELECT COUNT(*) as c FROM comments WHERE post_id = ?", [post.id])?.c || 0;

    let liked = false;
    if (viewerUserId) {
      liked = !!get(
        "SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?",
        [post.id, viewerUserId]
      );
    }

    return { ...post, likesCount, commentsCount, liked };
  });
}

/* ═══════════════════════════════════════════════════════════
   AUTH ROUTES
═══════════════════════════════════════════════════════════ */

/**
 * POST /api/auth/register
 * Body: { username, email, password }
 * Returns: { token, user }
 */
app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;

  // Validate all fields present
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email and password are required" });
  }

  // Validate lengths
  if (username.trim().length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  // Check if username or email already taken
  const existing = get(
    "SELECT id FROM users WHERE username = ? OR email = ?",
    [username.trim(), email.trim()]
  );
  if (existing) {
    return res.status(409).json({ error: "Username or email already taken" });
  }

  // Hash password — never store plain text
  const hashedPassword = await bcrypt.hash(password, 10);

  // Insert new user
  const { lastID } = run(
    "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
    [username.trim(), email.trim(), hashedPassword]
  );

  // Sign JWT token
  const token = jwt.sign(
    { id: lastID, username: username.trim() },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  // Fetch created user (without password)
  const user = get(
    "SELECT id, username, email, bio, avatar, created_at FROM users WHERE id = ?",
    [lastID]
  );

  res.status(201).json({ token, user });
});

/**
 * POST /api/auth/login
 * Body: { login, password }  ← login = username OR email
 * Returns: { token, user }
 */
app.post("/api/auth/login", async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: "Login and password are required" });
  }

  // Find by username or email
  const user = get(
    "SELECT * FROM users WHERE username = ? OR email = ?",
    [login.trim(), login.trim()]
  );

  // Same error for wrong username or wrong password — never reveal which
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  // Strip password before sending
  const { password: _, ...safeUser } = user;

  res.json({ token, user: safeUser });
});

/* ═══════════════════════════════════════════════════════════
   USER ROUTES
   CRITICAL: /me and /search/:q MUST come before /:username
   Express matches routes top to bottom — if /:username is
   first, "me" gets treated as a username and breaks.
═══════════════════════════════════════════════════════════ */

/**
 * GET /api/users/me
 * Returns the currently logged-in user's data
 */
app.get("/api/users/me", authRequired, (req, res) => {
  const user = get(
    "SELECT id, username, email, bio, avatar, created_at FROM users WHERE id = ?",
    [req.user.id]
  );

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

/**
 * PUT /api/users/me
 * Body: { bio, avatar }
 * Updates bio and avatar of logged-in user
 */
app.put("/api/users/me", authRequired, (req, res) => {
  const { bio, avatar } = req.body;

  run(
    "UPDATE users SET bio = ?, avatar = ? WHERE id = ?",
    [bio || "", avatar || "", req.user.id]
  );

  const user = get(
    "SELECT id, username, email, bio, avatar, created_at FROM users WHERE id = ?",
    [req.user.id]
  );

  res.json(user);
});

/**
 * GET /api/users/search/:query
 * Searches users by username or bio
 */
app.get("/api/users/search/:query", authOptional, (req, res) => {
  const searchTerm = `%${req.params.query}%`;

  const users = all(
    `SELECT id, username, bio, avatar
     FROM users
     WHERE username LIKE ? OR bio LIKE ?
     LIMIT 20`,
    [searchTerm, searchTerm]
  );

  res.json(users);
});

/**
 * GET /api/users/:username
 * Returns public profile + follower counts + isFollowing status
 */
app.get("/api/users/:username", authOptional, (req, res) => {
  const user = get(
    "SELECT id, username, bio, avatar, created_at FROM users WHERE username = ?",
    [req.params.username]
  );

  if (!user) return res.status(404).json({ error: "User not found" });

  // Get counts
  const followersCount =
    get("SELECT COUNT(*) as c FROM follows WHERE following_id = ?", [user.id])?.c || 0;

  const followingCount =
    get("SELECT COUNT(*) as c FROM follows WHERE follower_id = ?", [user.id])?.c || 0;

  const postsCount =
    get("SELECT COUNT(*) as c FROM posts WHERE user_id = ?", [user.id])?.c || 0;

  // Is the logged-in user following this profile?
  let isFollowing = false;
  if (req.user) {
    isFollowing = !!get(
      "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?",
      [req.user.id, user.id]
    );
  }

  res.json({ ...user, followersCount, followingCount, postsCount, isFollowing });
});

/* ═══════════════════════════════════════════════════════════
   FOLLOW ROUTES
═══════════════════════════════════════════════════════════ */

/**
 * POST /api/users/:username/follow
 * Follow a user
 */
app.post("/api/users/:username/follow", authRequired, (req, res) => {
  const target = get("SELECT id FROM users WHERE username = ?", [req.params.username]);

  if (!target) return res.status(404).json({ error: "User not found" });

  if (target.id === req.user.id) {
    return res.status(400).json({ error: "You cannot follow yourself" });
  }

  try {
    run(
      "INSERT INTO follows (follower_id, following_id) VALUES (?, ?)",
      [req.user.id, target.id]
    );
    res.json({ following: true });
  } catch {
    // UNIQUE constraint violation = already following
    res.status(409).json({ error: "Already following this user" });
  }
});

/**
 * DELETE /api/users/:username/follow
 * Unfollow a user
 */
app.delete("/api/users/:username/follow", authRequired, (req, res) => {
  const target = get("SELECT id FROM users WHERE username = ?", [req.params.username]);

  if (!target) return res.status(404).json({ error: "User not found" });

  run(
    "DELETE FROM follows WHERE follower_id = ? AND following_id = ?",
    [req.user.id, target.id]
  );

  res.json({ following: false });
});

/**
 * GET /api/users/:username/followers
 * List of users who follow this user
 */
app.get("/api/users/:username/followers", (req, res) => {
  const user = get("SELECT id FROM users WHERE username = ?", [req.params.username]);
  if (!user) return res.status(404).json({ error: "User not found" });

  const followers = all(
    `SELECT u.id, u.username, u.bio, u.avatar
     FROM follows f
     JOIN users u ON f.follower_id = u.id
     WHERE f.following_id = ?
     ORDER BY f.created_at DESC`,
    [user.id]
  );

  res.json(followers);
});

/**
 * GET /api/users/:username/following
 * List of users this user follows
 */
app.get("/api/users/:username/following", (req, res) => {
  const user = get("SELECT id FROM users WHERE username = ?", [req.params.username]);
  if (!user) return res.status(404).json({ error: "User not found" });

  const following = all(
    `SELECT u.id, u.username, u.bio, u.avatar
     FROM follows f
     JOIN users u ON f.following_id = u.id
     WHERE f.follower_id = ?
     ORDER BY f.created_at DESC`,
    [user.id]
  );

  res.json(following);
});

/* ═══════════════════════════════════════════════════════════
   POST ROUTES
═══════════════════════════════════════════════════════════ */

/**
 * GET /api/posts/feed
 * Returns posts from people the logged-in user follows + their own posts
 * Newest first, limited to 50
 */
app.get("/api/posts/feed", authRequired, (req, res) => {
  const posts = all(
    `SELECT p.*, u.username, u.avatar
     FROM posts p
     JOIN users u ON p.user_id = u.id
     WHERE p.user_id = ?
        OR p.user_id IN (
          SELECT following_id FROM follows WHERE follower_id = ?
        )
     ORDER BY p.created_at DESC
     LIMIT 50`,
    [req.user.id, req.user.id]
  );

  res.json(enrichPosts(posts, req.user.id));
});

/**
 * GET /api/posts/explore
 * All posts newest first — visible to guests too
 */
app.get("/api/posts/explore", authOptional, (req, res) => {
  const posts = all(
    `SELECT p.*, u.username, u.avatar
     FROM posts p
     JOIN users u ON p.user_id = u.id
     ORDER BY p.created_at DESC
     LIMIT 30`
  );

  res.json(enrichPosts(posts, req.user?.id));
});

/**
 * GET /api/users/:username/posts
 * All posts by a specific user
 */
app.get("/api/users/:username/posts", authOptional, (req, res) => {
  const user = get("SELECT id FROM users WHERE username = ?", [req.params.username]);
  if (!user) return res.status(404).json({ error: "User not found" });

  const posts = all(
    `SELECT p.*, u.username, u.avatar
     FROM posts p
     JOIN users u ON p.user_id = u.id
     WHERE p.user_id = ?
     ORDER BY p.created_at DESC`,
    [user.id]
  );

  res.json(enrichPosts(posts, req.user?.id));
});

/**
 * POST /api/posts
 * Body: { content, image_url? }
 * Creates a new post
 */
app.post("/api/posts", authRequired, (req, res) => {
  const { content, image_url } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Post content is required" });
  }

  if (content.trim().length > 500) {
    return res.status(400).json({ error: "Post cannot exceed 500 characters" });
  }

  const { lastID } = run(
    "INSERT INTO posts (user_id, content, image_url) VALUES (?, ?, ?)",
    [req.user.id, content.trim(), image_url || ""]
  );

  // Return the full post with user info attached
  const post = get(
    `SELECT p.*, u.username, u.avatar
     FROM posts p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = ?`,
    [lastID]
  );

  res.status(201).json({ ...post, likesCount: 0, commentsCount: 0, liked: false });
});

/**
 * DELETE /api/posts/:id
 * Only the post owner can delete
 */
app.delete("/api/posts/:id", authRequired, (req, res) => {
  const post = get("SELECT * FROM posts WHERE id = ?", [req.params.id]);

  if (!post) return res.status(404).json({ error: "Post not found" });

  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: "You can only delete your own posts" });
  }

  run("DELETE FROM posts WHERE id = ?", [req.params.id]);
  res.json({ deleted: true });
});

/* ═══════════════════════════════════════════════════════════
   LIKE ROUTES
═══════════════════════════════════════════════════════════ */

/**
 * POST /api/posts/:id/like
 * Like a post
 */
app.post("/api/posts/:id/like", authRequired, (req, res) => {
  const post = get("SELECT id FROM posts WHERE id = ?", [req.params.id]);
  if (!post) return res.status(404).json({ error: "Post not found" });

  try {
    run(
      "INSERT INTO likes (post_id, user_id) VALUES (?, ?)",
      [req.params.id, req.user.id]
    );
  } catch {
    // UNIQUE violation = already liked
    return res.status(409).json({ error: "Already liked this post" });
  }

  const likesCount =
    get("SELECT COUNT(*) as c FROM likes WHERE post_id = ?", [req.params.id])?.c || 0;

  res.json({ liked: true, likesCount });
});

/**
 * DELETE /api/posts/:id/like
 * Unlike a post
 */
app.delete("/api/posts/:id/like", authRequired, (req, res) => {
  run(
    "DELETE FROM likes WHERE post_id = ? AND user_id = ?",
    [req.params.id, req.user.id]
  );

  const likesCount =
    get("SELECT COUNT(*) as c FROM likes WHERE post_id = ?", [req.params.id])?.c || 0;

  res.json({ liked: false, likesCount });
});

/* ═══════════════════════════════════════════════════════════
   COMMENT ROUTES
═══════════════════════════════════════════════════════════ */

/**
 * GET /api/posts/:id/comments
 * All comments on a post, oldest first
 */
app.get("/api/posts/:id/comments", (req, res) => {
  const comments = all(
    `SELECT c.*, u.username, u.avatar
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.post_id = ?
     ORDER BY c.created_at ASC`,
    [req.params.id]
  );

  res.json(comments);
});

/**
 * POST /api/posts/:id/comments
 * Body: { content }
 * Add a comment to a post
 */
app.post("/api/posts/:id/comments", authRequired, (req, res) => {
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Comment content is required" });
  }

  const post = get("SELECT id FROM posts WHERE id = ?", [req.params.id]);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const { lastID } = run(
    "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
    [req.params.id, req.user.id, content.trim()]
  );

  const comment = get(
    `SELECT c.*, u.username, u.avatar
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`,
    [lastID]
  );

  res.status(201).json(comment);
});

/**
 * DELETE /api/comments/:id
 * Only the comment owner can delete
 */
app.delete("/api/comments/:id", authRequired, (req, res) => {
  const comment = get("SELECT * FROM comments WHERE id = ?", [req.params.id]);

  if (!comment) return res.status(404).json({ error: "Comment not found" });

  if (comment.user_id !== req.user.id) {
    return res.status(403).json({ error: "You can only delete your own comments" });
  }

  run("DELETE FROM comments WHERE id = ?", [req.params.id]);
  res.json({ deleted: true });
});

/* ─────────────────────────────────────────────────────────────
   CATCH-ALL → Serve the SPA for any non-API route
───────────────────────────────────────────────────────────── */
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ─────────────────────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────────────────────── */
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Nexus Social running at http://localhost:${PORT}`);
  });
});