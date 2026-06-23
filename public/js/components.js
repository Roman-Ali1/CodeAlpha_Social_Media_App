/**
 * components.js
 * Reusable DOM element builders.
 * Every function takes data in, returns a DOM element out.
 * Never calls the API. Never reads global state.
 */

/* ── Avatar ───────────────────────────────────────────────────────
   Shows image if user has avatar URL, otherwise shows first letter.
   sizeClass = "avatar-sm" | "avatar" | "avatar-lg"
──────────────────────────────────────────────────────────────── */
function renderAvatar(user, sizeClass = "avatar") {
  const el = document.createElement("div");
  el.className = sizeClass;

  if (user.avatar) {
    const img = document.createElement("img");
    img.src = user.avatar;
    img.alt = user.username;
    // If image URL is broken, fall back to letter
    img.onerror = () => {
      el.innerHTML = "";
      el.textContent = (user.username || "?")[0].toUpperCase();
    };
    el.appendChild(img);
  } else {
    el.textContent = (user.username || "?")[0].toUpperCase();
  }

  return el;
}

/* ── Time formatter ───────────────────────────────────────────────
   Converts ISO date string to "just now", "5m ago", "3h ago", etc.
──────────────────────────────────────────────────────────────── */
function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/* ── Post Card ────────────────────────────────────────────────────
   Builds a full post card with header, content, actions.

   @param post         — post object from API (includes username, avatar)
   @param currentUser  — logged-in user object (or null for guests)
   @param callbacks    — { onLike, onComment, onDelete, onUserClick }
──────────────────────────────────────────────────────────────── */
function renderPostCard(post, currentUser, callbacks = {}) {
  const card = document.createElement("div");
  card.className = "post-card";
  card.dataset.id = post.id;

  const isOwner = currentUser && post.user_id === currentUser.id;

  /* Header: avatar + username + time + optional delete button */
  const header = document.createElement("div");
  header.className = "post-header";

  const userEl = document.createElement("div");
  userEl.className = "post-user";
  userEl.appendChild(renderAvatar(post, "avatar-sm"));

  const userInfo = document.createElement("div");

  const usernameEl = document.createElement("div");
  usernameEl.className = "post-username";
  usernameEl.textContent = "@" + post.username;

  const timeEl = document.createElement("div");
  timeEl.className = "post-time";
  timeEl.textContent = timeAgo(post.created_at);

  userInfo.appendChild(usernameEl);
  userInfo.appendChild(timeEl);
  userEl.appendChild(userInfo);

  // Clicking username navigates to that user's profile
  userEl.addEventListener("click", () =>
    callbacks.onUserClick?.(post.username),
  );
  header.appendChild(userEl);

  // Delete button — only visible to post owner
  if (isOwner) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-btn delete-btn";
    deleteBtn.title = "Delete post";
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6M14 11v6"/>
        <path d="M9 6V4h6v2"/>
      </svg>
    `;
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onDelete?.(post.id, card);
    });
    header.appendChild(deleteBtn);
  }

  card.appendChild(header);

  /* Post content text — textContent prevents XSS */
  const content = document.createElement("div");
  content.className = "post-content";
  content.textContent = post.content;
  content.addEventListener("click", () => callbacks.onComment?.(post));
  card.appendChild(content);

  /* ── Media renderer (image or video) ──────────────────────────────
   Detects URL type and renders the right element.
   Call this inside renderPostCard where image_url was handled.
──────────────────────────────────────────────────────────────── */
  function renderPostMedia(url, onClickCallback) {
    if (!url || !url.trim()) return null;

    const wrapper = document.createElement("div");
    wrapper.className = "post-media";

    // Detect media type from URL extension
    const cleanUrl = url.split("?")[0].toLowerCase();
    const videoExts = [".mp4", ".webm", ".ogg", ".mov"];
    const isVideo =
      videoExts.some((ext) => cleanUrl.endsWith(ext)) ||
      url.includes("youtube.com") ||
      url.includes("youtu.be") ||
      url.includes("vimeo.com");

    if (isVideo) {
      // YouTube / Vimeo — convert to embed
      const youtubeMatch = url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      );
      const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);

      if (youtubeMatch) {
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube.com/embed/${youtubeMatch[1]}`;
        iframe.width = "100%";
        iframe.height = "315";
        iframe.style.border = "none";
        iframe.style.display = "block";
        iframe.allowFullscreen = true;
        iframe.allow =
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        wrapper.appendChild(iframe);
      } else if (vimeoMatch) {
        const iframe = document.createElement("iframe");
        iframe.src = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        iframe.width = "100%";
        iframe.height = "315";
        iframe.style.border = "none";
        iframe.style.display = "block";
        iframe.allowFullscreen = true;
        wrapper.appendChild(iframe);
      } else {
        // Direct video file
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.preload = "metadata";
        video.onerror = () => wrapper.remove();
        wrapper.appendChild(video);
      }
    } else {
      // Image
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Post media";
      img.onerror = () => wrapper.remove();
      if (onClickCallback) img.addEventListener("click", onClickCallback);
      wrapper.appendChild(img);
    }

    return wrapper;
  }

  /* Media — image or video */
  const mediaEl = renderPostMedia(post.image_url, () =>
    callbacks.onComment?.(post),
  );
  if (mediaEl) card.appendChild(mediaEl);

  /* Action bar */
  const actions = document.createElement("div");
  actions.className = "post-actions";

  // Like button
  const likeBtn = document.createElement("button");
  likeBtn.className = "action-btn like-btn" + (post.liked ? " liked" : "");
  likeBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06
               a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78
               1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
    <span class="like-count">${post.likesCount}</span>
  `;
  likeBtn.addEventListener("click", () => callbacks.onLike?.(post, likeBtn));
  actions.appendChild(likeBtn);

  // Comment button
  const commentBtn = document.createElement("button");
  commentBtn.className = "action-btn";
  commentBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
    <span>${post.commentsCount}</span>
  `;
  commentBtn.addEventListener("click", () => callbacks.onComment?.(post));
  actions.appendChild(commentBtn);

  card.appendChild(actions);
  return card;
}

/* ── Profile Header ───────────────────────────────────────────────
   Renders avatar, username, bio, stats row, action buttons.

   @param user         — user object from GET /api/users/:username
   @param currentUser  — logged-in user
   @param callbacks    — { onFollow, onEdit, onTabClick }
──────────────────────────────────────────────────────────────── */
function renderProfileHeader(user, currentUser, callbacks = {}) {
  const isMe = currentUser && user.id === currentUser.id;

  const container = document.createElement("div");
  container.className = "profile-info";

  // Large avatar
  container.appendChild(renderAvatar(user, "avatar avatar-lg"));

  const details = document.createElement("div");
  details.className = "profile-details";

  // Username
  const username = document.createElement("div");
  username.className = "profile-username";
  username.textContent = "@" + user.username;
  details.appendChild(username);

  // Bio
  const bio = document.createElement("div");
  bio.className = "profile-bio";
  bio.textContent = user.bio || "No bio yet.";
  details.appendChild(bio);

  // Stats row
  const stats = document.createElement("div");
  stats.className = "profile-stats";

  const statDefs = [
    { label: "Posts", value: user.postsCount, tab: "posts" },
    { label: "Followers", value: user.followersCount, tab: "followers" },
    { label: "Following", value: user.followingCount, tab: "following" },
  ];

  statDefs.forEach(({ label, value, tab }) => {
    const stat = document.createElement("div");
    stat.className = "stat";
    stat.dataset.tab = tab;
    stat.innerHTML = `
      <span class="stat-value">${value}</span>
      <span class="stat-label">${label}</span>
    `;
    stat.addEventListener("click", () => callbacks.onTabClick?.(tab));
    stats.appendChild(stat);
  });

  details.appendChild(stats);

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "profile-actions";

  if (isMe) {
    // Own profile — show Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "btn-outline";
    editBtn.textContent = "Edit Profile";
    editBtn.addEventListener("click", () => callbacks.onEdit?.());
    actions.appendChild(editBtn);
  } else if (currentUser) {
    // Someone else's profile — show Follow/Unfollow
    const followBtn = document.createElement("button");
    followBtn.className = "btn-follow" + (user.isFollowing ? " following" : "");
    followBtn.textContent = user.isFollowing ? "Following" : "Follow";
    followBtn.addEventListener("click", () =>
      callbacks.onFollow?.(user, followBtn),
    );
    actions.appendChild(followBtn);
  }

  details.appendChild(actions);
  container.appendChild(details);
  return container;
}

/* ── Comment Item ─────────────────────────────────────────────────
   Single comment row: avatar + body + author + text + meta
──────────────────────────────────────────────────────────────── */
function renderComment(comment, currentUser, onDelete, onUserClick) {
  const item = document.createElement("div");
  item.className = "comment-item";
  item.dataset.id = comment.id;

  item.appendChild(renderAvatar(comment, "avatar-sm"));

  const body = document.createElement("div");
  body.className = "comment-body";

  const author = document.createElement("div");
  author.className = "comment-author";
  author.textContent = "@" + comment.username;
  author.addEventListener("click", () => onUserClick?.(comment.username));
  body.appendChild(author);

  const text = document.createElement("div");
  text.className = "comment-text";
  text.textContent = comment.content;
  body.appendChild(text);

  const meta = document.createElement("div");
  meta.className = "comment-meta";

  const time = document.createElement("span");
  time.className = "comment-time";
  time.textContent = timeAgo(comment.created_at);
  meta.appendChild(time);

  // Delete link — only for comment owner
  if (currentUser && comment.user_id === currentUser.id) {
    const del = document.createElement("span");
    del.className = "comment-delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => onDelete?.(comment.id, item));
    meta.appendChild(del);
  }

  body.appendChild(meta);
  item.appendChild(body);
  return item;
}

/* ── User Card ────────────────────────────────────────────────────
   Used in followers / following lists
──────────────────────────────────────────────────────────────── */
function renderUserCard(user, onClick) {
  const card = document.createElement("div");
  card.className = "user-card";

  card.appendChild(renderAvatar(user, "avatar"));

  const info = document.createElement("div");

  const name = document.createElement("div");
  name.className = "username";
  name.textContent = "@" + user.username;

  const bio = document.createElement("div");
  bio.className = "bio-text";
  bio.textContent = user.bio || "No bio yet.";

  info.appendChild(name);
  info.appendChild(bio);
  card.appendChild(info);

  card.addEventListener("click", () => onClick?.(user.username));
  return card;
}

/* ── Toast ────────────────────────────────────────────────────────
   Shows a brief notification at the bottom of the screen.
──────────────────────────────────────────────────────────────── */
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");

  // Force reflow so transition triggers
  void toast.offsetWidth;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 2500);
}

/* ── Empty State ──────────────────────────────────────────────────
   Placeholder shown when a list has no items
──────────────────────────────────────────────────────────────── */
function renderEmpty(title, subtitle = "") {
  const div = document.createElement("div");
  div.className = "empty-state";

  const strong = document.createElement("strong");
  strong.textContent = title;
  div.appendChild(strong);

  if (subtitle) {
    const span = document.createElement("span");
    span.textContent = subtitle;
    div.appendChild(span);
  }

  return div;
}
