/**
 * app.js
 * Main SPA controller.
 * Owns all state, handles routing, wires every feature together.
 * Reads data from API, builds UI with component functions.
 */

/* ══════════════════════════════════════════════════════════════════
   GLOBAL STATE
   Single object — never scatter state across random variables.
══════════════════════════════════════════════════════════════════ */
const State = {
  currentUser: null, // Logged-in user object
  currentProfileUsername: null, // Whose profile is currently open
  currentPostForModal: null, // Post open in the comments modal
};

/* ══════════════════════════════════════════════════════════════════
   SCREEN SWITCHING
   Two screens: auth (logged out) and app (logged in).
══════════════════════════════════════════════════════════════════ */
function showAuthScreen() {
  document.getElementById("auth-screen").classList.add("active");
  document.getElementById("app-screen").classList.remove("active");
}

function showAppScreen() {
  document.getElementById("auth-screen").classList.remove("active");
  document.getElementById("app-screen").classList.add("active");
  updateSidebarUser();
  navigateTo("feed");
}

/* ══════════════════════════════════════════════════════════════════
   BOOT — runs once on page load
   Checks localStorage for token, verifies it with the server,
   then shows the right screen.
══════════════════════════════════════════════════════════════════ */
async function boot() {
  const token = localStorage.getItem("nexus_token");

  if (!token) {
    showAuthScreen();
    return;
  }

  try {
    // Verify the token is still valid
    State.currentUser = await API.getMe();
    showAppScreen();
  } catch {
    // Token expired or invalid — clean up and show auth
    localStorage.removeItem("nexus_token");
    showAuthScreen();
  }
}

/* ══════════════════════════════════════════════════════════════════
   SIDEBAR USER
   Updates the avatar and username in the sidebar bottom section.
══════════════════════════════════════════════════════════════════ */
function updateSidebarUser() {
  const u = State.currentUser;

  // Sidebar username
  document.getElementById("sidebar-username").textContent = "@" + u.username;

  // Sidebar avatar
  const sidebarAvatar = document.getElementById("sidebar-avatar");
  sidebarAvatar.className = "avatar-sm";
  if (u.avatar) {
    sidebarAvatar.innerHTML = "";
    const img = document.createElement("img");
    img.src = u.avatar;
    img.alt = u.username;
    img.onerror = () => {
      sidebarAvatar.innerHTML = "";
      sidebarAvatar.textContent = u.username[0].toUpperCase();
    };
    sidebarAvatar.appendChild(img);
  } else {
    sidebarAvatar.textContent = u.username[0].toUpperCase();
  }

  // Compose area avatar
  const composeAvatar = document.getElementById("compose-avatar");
  composeAvatar.className = "avatar-sm";
  if (u.avatar) {
    composeAvatar.innerHTML = "";
    const img = document.createElement("img");
    img.src = u.avatar;
    img.alt = u.username;
    img.onerror = () => {
      composeAvatar.innerHTML = "";
      composeAvatar.textContent = u.username[0].toUpperCase();
    };
    composeAvatar.appendChild(img);
  } else {
    composeAvatar.textContent = u.username[0].toUpperCase();
  }
}

/* ══════════════════════════════════════════════════════════════════
   AUTH — Tab switching, Login, Register, Logout
══════════════════════════════════════════════════════════════════ */

// Switch between Login / Register tabs
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".auth-form")
      .forEach((f) => f.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}-form`).classList.add("active");
  });
});

// Login form submit
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const login = document.getElementById("login-login").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");

  errEl.classList.add("hidden");

  try {
    const { token, user } = await API.login(login, password);
    localStorage.setItem("nexus_token", token);
    State.currentUser = user;
    showAppScreen();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
});

// Register form submit
document
  .getElementById("register-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("reg-username").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const errEl = document.getElementById("register-error");

    errEl.classList.add("hidden");

    try {
      const { token, user } = await API.register(username, email, password);
      localStorage.setItem("nexus_token", token);
      State.currentUser = user;
      showAppScreen();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  });

// Logout
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("nexus_token");
  State.currentUser = null;
  // Clear feed so next user doesn't see stale data
  document.getElementById("feed-posts").innerHTML =
    '<div class="loading-state">Loading your feed…</div>';
  showAuthScreen();
});

/* ══════════════════════════════════════════════════════════════════
   VIEW NAVIGATION
   Three named views: "feed", "explore", "profile"
══════════════════════════════════════════════════════════════════ */
function navigateTo(viewName, profileUsername = null) {
  // Hide all views
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));

  // Update nav active state
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (navItem) navItem.classList.add("active");

  if (viewName === "feed") {
    document.getElementById("view-feed").classList.add("active");
    loadFeed();
  } else if (viewName === "explore") {
    document.getElementById("view-explore").classList.add("active");
    loadExplore();
  } else if (viewName === "profile") {
    document.getElementById("view-profile").classList.add("active");
    const username = profileUsername || State.currentUser.username;
    loadProfile(username);
  }
}

// Nav item clicks
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const view = item.dataset.view;
    if (view === "profile-me") {
      navigateTo("profile", State.currentUser.username);
    } else {
      navigateTo(view);
    }
  });
});

// Navigate to any user's profile from anywhere in the app
function navigateToProfile(username) {
  // Remove active from nav since this is a dynamic profile view
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  navigateTo("profile", username);
}

/* ══════════════════════════════════════════════════════════════════
   SHARED POST CALLBACKS
   Same actions (like, comment, delete, user click) work across
   feed, explore, and profile views.
══════════════════════════════════════════════════════════════════ */
function makePostCallbacks() {
  return {
    onUserClick: navigateToProfile,

    onLike: async (post, likeBtn) => {
      try {
        let result;
        if (post.liked) {
          result = await API.unlikePost(post.id);
        } else {
          result = await API.likePost(post.id);
        }
        // Update local post object
        post.liked = result.liked;
        post.likesCount = result.likesCount;
        // Update button UI
        likeBtn.classList.toggle("liked", result.liked);
        likeBtn.querySelector(".like-count").textContent = result.likesCount;
      } catch (err) {
        showToast(err.message);
      }
    },

    onComment: (post) => openPostModal(post),

    onDelete: async (postId, cardEl) => {
      if (!confirm("Delete this post? This cannot be undone.")) return;
      try {
        await API.deletePost(postId);
        cardEl.remove();
        showToast("Post deleted.");
      } catch (err) {
        showToast(err.message);
      }
    },
  };
}

/* ══════════════════════════════════════════════════════════════════
   FEED
══════════════════════════════════════════════════════════════════ */
async function loadFeed() {
  const container = document.getElementById("feed-posts");
  container.innerHTML = '<div class="loading-state">Loading your feed…</div>';

  try {
    const posts = await API.getFeed();
    container.innerHTML = "";

    if (posts.length === 0) {
      container.appendChild(
        renderEmpty(
          "Your feed is empty",
          "Follow people to see their posts here.",
        ),
      );
      return;
    }

    const callbacks = makePostCallbacks();
    posts.forEach((post) => {
      container.appendChild(renderPostCard(post, State.currentUser, callbacks));
    });
  } catch (err) {
    container.innerHTML = "";
    container.appendChild(renderEmpty("Failed to load feed", err.message));
  }
}

/* ── Compose ─────────────────────────────────────────────────────── */
const composeText = document.getElementById("compose-text");
const composeCount = document.getElementById("compose-count");
const composeBtn = document.getElementById("compose-submit");
const composeMediaUrl = document.getElementById("compose-media-url");
const composeMediaRow = document.getElementById("compose-media-row");
const composePreview = document.getElementById("compose-media-preview");
const mediaToggleBtn = document.getElementById("compose-media-toggle");

// Toggle media URL row
mediaToggleBtn.addEventListener("click", () => {
  const isOpen = composeMediaRow.classList.toggle("open");
  mediaToggleBtn.classList.toggle("active", isOpen);
  if (!isOpen) {
    composeMediaUrl.value = "";
    composePreview.innerHTML = "";
  }
});

// Live character counter + enable/disable post button
composeText.addEventListener("input", () => {
  const len = composeText.value.trim().length;
  composeCount.textContent = `${composeText.value.length} / 500`;
  composeCount.classList.toggle("warn", composeText.value.length > 450);
  composeBtn.disabled = len === 0;
});

// Live media preview as user types URL
let previewDebounce = null;
composeMediaUrl.addEventListener("input", () => {
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(() => {
    const url = composeMediaUrl.value.trim();
    composePreview.innerHTML = "";
    if (!url) return;

    // Build preview using the same renderer as posts
    const preview = renderPostMedia(url);
    if (!preview) return;

    // Add a remove button on top of preview
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-media";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      composeMediaUrl.value = "";
      composePreview.innerHTML = "";
    });

    preview.style.position = "relative";
    preview.appendChild(removeBtn);
    composePreview.appendChild(preview);
  }, 500);
});

// Post submit
composeBtn.addEventListener("click", async () => {
  const content = composeText.value.trim();
  const image_url = composeMediaUrl.value.trim();

  if (!content) return;

  composeBtn.disabled = true;
  composeBtn.textContent = "Posting…";

  try {
    const post = await API.createPost(content, image_url);

    // Reset compose
    composeText.value = "";
    composeMediaUrl.value = "";
    composePreview.innerHTML = "";
    composeMediaRow.classList.remove("open");
    mediaToggleBtn.classList.remove("active");
    composeCount.textContent = "0 / 500";
    composeCount.classList.remove("warn");

    // Prepend to feed
    const container = document.getElementById("feed-posts");
    const empty = container.querySelector(".empty-state");
    if (empty) empty.remove();

    const card = renderPostCard(post, State.currentUser, makePostCallbacks());
    container.insertBefore(card, container.firstChild);
    showToast("Post published!");
  } catch (err) {
    showToast("Error: " + err.message);
  } finally {
    composeBtn.disabled = false;
    composeBtn.textContent = "Post";
    composeBtn.disabled = composeText.value.trim().length === 0;
  }
});

/* ══════════════════════════════════════════════════════════════════
   EXPLORE
══════════════════════════════════════════════════════════════════ */
async function loadExplore() {
  const container = document.getElementById("explore-posts");
  container.innerHTML = '<div class="loading-state">Loading…</div>';

  try {
    const posts = await API.getExplore();
    container.innerHTML = "";

    if (posts.length === 0) {
      container.appendChild(
        renderEmpty("No posts yet", "Be the first to post something!"),
      );
      return;
    }

    const callbacks = makePostCallbacks();
    posts.forEach((post) => {
      container.appendChild(renderPostCard(post, State.currentUser, callbacks));
    });
  } catch (err) {
    container.innerHTML = "";
    container.appendChild(renderEmpty("Failed to load", err.message));
  }
}

/* ══════════════════════════════════════════════════════════════════
   PROFILE
══════════════════════════════════════════════════════════════════ */
async function loadProfile(username) {
  State.currentProfileUsername = username;

  const headerEl = document.getElementById("profile-header");
  const postsEl = document.getElementById("profile-posts");
  const followersEl = document.getElementById("profile-followers");
  const followingEl = document.getElementById("profile-following");

  // Reset all panels
  headerEl.innerHTML = '<div class="loading-state">Loading profile…</div>';
  postsEl.innerHTML = "";
  followersEl.innerHTML = "";
  followingEl.innerHTML = "";

  // Reset tab UI — always start on Posts tab
  document
    .querySelectorAll(".profile-tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelector(".profile-tab[data-tab='posts']")
    .classList.add("active");
  postsEl.classList.remove("hidden");
  followersEl.classList.add("hidden");
  followingEl.classList.add("hidden");

  try {
    // Load user data and posts in parallel
    const [user, posts] = await Promise.all([
      API.getUser(username),
      API.getUserPosts(username),
    ]);

    // Render profile header
    headerEl.innerHTML = "";
    headerEl.appendChild(
      renderProfileHeader(user, State.currentUser, {
        onEdit: openEditModal,
        onTabClick: switchProfileTab,
        onFollow: async (u, followBtn) => {
          try {
            if (u.isFollowing) {
              await API.unfollow(u.username);
              u.isFollowing = false;
              u.followersCount--;
              followBtn.textContent = "Follow";
              followBtn.classList.remove("following");
            } else {
              await API.follow(u.username);
              u.isFollowing = true;
              u.followersCount++;
              followBtn.textContent = "Following";
              followBtn.classList.add("following");
            }
            // Update follower count display without full reload
            const followerStat = headerEl.querySelector(
              "[data-tab='followers'] .stat-value",
            );
            if (followerStat) followerStat.textContent = u.followersCount;
          } catch (err) {
            showToast(err.message);
          }
        },
      }),
    );

    // Render posts
    postsEl.innerHTML = "";
    if (posts.length === 0) {
      postsEl.appendChild(renderEmpty("No posts yet"));
    } else {
      const callbacks = makePostCallbacks();
      posts.forEach((post) => {
        postsEl.appendChild(renderPostCard(post, State.currentUser, callbacks));
      });
    }
  } catch (err) {
    headerEl.innerHTML = "";
    headerEl.appendChild(renderEmpty("User not found", err.message));
  }
}

/* ── Profile tab switching ───────────────────────────────────────── */
function switchProfileTab(tab) {
  document
    .querySelectorAll(".profile-tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelector(`.profile-tab[data-tab="${tab}"]`)
    .classList.add("active");

  const postsEl = document.getElementById("profile-posts");
  const followersEl = document.getElementById("profile-followers");
  const followingEl = document.getElementById("profile-following");

  postsEl.classList.toggle("hidden", tab !== "posts");
  followersEl.classList.toggle("hidden", tab !== "followers");
  followingEl.classList.toggle("hidden", tab !== "following");

  // Lazy load — only fetch when tab is first opened
  if (tab === "followers" && followersEl.innerHTML === "") loadFollowers();
  if (tab === "following" && followingEl.innerHTML === "") loadFollowing();
}

// Profile tab click handlers
document.querySelectorAll(".profile-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchProfileTab(tab.dataset.tab));
});

async function loadFollowers() {
  const el = document.getElementById("profile-followers");
  el.innerHTML = '<div class="loading-state">Loading…</div>';
  try {
    const users = await API.getFollowers(State.currentProfileUsername);
    el.innerHTML = "";
    if (users.length === 0) {
      el.appendChild(renderEmpty("No followers yet"));
    } else {
      users.forEach((u) =>
        el.appendChild(renderUserCard(u, navigateToProfile)),
      );
    }
  } catch (err) {
    el.innerHTML = "";
    el.appendChild(renderEmpty("Failed to load", err.message));
  }
}

async function loadFollowing() {
  const el = document.getElementById("profile-following");
  el.innerHTML = '<div class="loading-state">Loading…</div>';
  try {
    const users = await API.getFollowing(State.currentProfileUsername);
    el.innerHTML = "";
    if (users.length === 0) {
      el.appendChild(renderEmpty("Not following anyone yet"));
    } else {
      users.forEach((u) =>
        el.appendChild(renderUserCard(u, navigateToProfile)),
      );
    }
  } catch (err) {
    el.innerHTML = "";
    el.appendChild(renderEmpty("Failed to load", err.message));
  }
}

/* ══════════════════════════════════════════════════════════════════
   EDIT PROFILE MODAL
══════════════════════════════════════════════════════════════════ */
function openEditModal() {
  const u = State.currentUser;
  document.getElementById("edit-bio").value = u.bio || "";
  document.getElementById("edit-avatar").value = u.avatar || "";
  document.getElementById("edit-error").classList.add("hidden");
  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("edit-modal").classList.add("hidden");
}

document
  .getElementById("edit-modal-close")
  .addEventListener("click", closeEditModal);

// Close on backdrop click
document.getElementById("edit-modal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("edit-modal")) closeEditModal();
});

// Save changes
document.getElementById("edit-save").addEventListener("click", async () => {
  const bio = document.getElementById("edit-bio").value;
  const avatar = document.getElementById("edit-avatar").value;
  const errEl = document.getElementById("edit-error");

  errEl.classList.add("hidden");

  try {
    State.currentUser = await API.updateMe(bio, avatar);
    closeEditModal();
    updateSidebarUser();
    // Reload profile to reflect changes
    loadProfile(State.currentUser.username);
    showToast("Profile updated!");
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST DETAIL MODAL (Comments)
══════════════════════════════════════════════════════════════════ */
async function openPostModal(post) {
  State.currentPostForModal = post;

  const modalPostEl = document.getElementById("modal-post-content");
  const commentsEl = document.getElementById("modal-comments");
  const composeArea = document.getElementById("comment-compose-area");

  // Render post inside modal
  modalPostEl.innerHTML = "";
  modalPostEl.appendChild(
    renderPostCard(post, State.currentUser, {
      onUserClick: (username) => {
        closePostModal();
        navigateToProfile(username);
      },
      onLike: async (p, likeBtn) => {
        try {
          let result;
          if (p.liked) {
            result = await API.unlikePost(p.id);
          } else {
            result = await API.likePost(p.id);
          }
          p.liked = result.liked;
          p.likesCount = result.likesCount;
          likeBtn.classList.toggle("liked", result.liked);
          likeBtn.querySelector(".like-count").textContent = result.likesCount;

          // Sync like state on the post card in the background feed
          syncPostCardLike(p.id, result);
        } catch (err) {
          showToast(err.message);
        }
      },
    }),
  );

  // Only show comment box if logged in
  composeArea.classList.toggle("hidden", !State.currentUser);
  document.getElementById("comment-input").value = "";

  // Show modal and load comments
  commentsEl.innerHTML = '<div class="loading-state">Loading comments…</div>';
  document.getElementById("post-modal").classList.remove("hidden");

  try {
    const comments = await API.getComments(post.id);
    commentsEl.innerHTML = "";

    if (comments.length === 0) {
      commentsEl.appendChild(
        renderEmpty("No comments yet", "Be the first to comment!"),
      );
    } else {
      comments.forEach((c) => {
        commentsEl.appendChild(
          renderComment(
            c,
            State.currentUser,
            handleDeleteComment,
            (username) => {
              closePostModal();
              navigateToProfile(username);
            },
          ),
        );
      });
    }
  } catch {
    commentsEl.innerHTML = "";
    commentsEl.appendChild(renderEmpty("Failed to load comments"));
  }
}

function closePostModal() {
  document.getElementById("post-modal").classList.add("hidden");
  document.getElementById("comment-input").value = "";
  State.currentPostForModal = null;
}

// Close on backdrop click
document.getElementById("post-modal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("post-modal")) closePostModal();
});

document
  .getElementById("modal-close")
  .addEventListener("click", closePostModal);

/* ── Submit comment ──────────────────────────────────────────────── */
async function submitComment() {
  const post = State.currentPostForModal;
  if (!post) return;

  const input = document.getElementById("comment-input");
  const content = input.value.trim();
  if (!content) return;

  try {
    const comment = await API.addComment(post.id, content);
    input.value = "";

    const commentsEl = document.getElementById("modal-comments");

    // Remove empty state if present
    const empty = commentsEl.querySelector(".empty-state");
    if (empty) empty.remove();

    // Append new comment
    commentsEl.appendChild(
      renderComment(
        comment,
        State.currentUser,
        handleDeleteComment,
        (username) => {
          closePostModal();
          navigateToProfile(username);
        },
      ),
    );

    // Update comment count on the post card in the background
    post.commentsCount = (post.commentsCount || 0) + 1;
    syncPostCardCommentCount(post.id, post.commentsCount);
  } catch (err) {
    showToast(err.message);
  }
}

document
  .getElementById("comment-submit")
  .addEventListener("click", submitComment);

// Also submit on Enter key
document.getElementById("comment-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitComment();
});

/* ── Delete comment ──────────────────────────────────────────────── */
async function handleDeleteComment(commentId, itemEl) {
  try {
    await API.deleteComment(commentId);
    itemEl.remove();
    showToast("Comment deleted.");
  } catch (err) {
    showToast(err.message);
  }
}

/* ── Sync helpers ────────────────────────────────────────────────── */
// Update like state on any post card currently in the DOM
function syncPostCardLike(postId, result) {
  const card = document.querySelector(`.post-card[data-id="${postId}"]`);
  if (!card) return;
  const likeBtn = card.querySelector(".like-btn");
  if (!likeBtn) return;
  likeBtn.classList.toggle("liked", result.liked);
  const countEl = likeBtn.querySelector(".like-count");
  if (countEl) countEl.textContent = result.likesCount;
}

// Update comment count on any post card currently in the DOM
function syncPostCardCommentCount(postId, newCount) {
  const card = document.querySelector(`.post-card[data-id="${postId}"]`);
  if (!card) return;
  const btns = card.querySelectorAll(".action-btn");
  // Second action button is the comment button
  if (btns[1]) {
    const countEl = btns[1].querySelector("span");
    if (countEl) countEl.textContent = newCount;
  }
}

/* ══════════════════════════════════════════════════════════════════
   SEARCH — Rich user cards in dropdown
══════════════════════════════════════════════════════════════════ */
let searchDebounceTimer = null;

document.getElementById("search-input").addEventListener("input", (e) => {
  clearTimeout(searchDebounceTimer);

  const query = e.target.value.trim();
  const dropdown = document.getElementById("search-results");

  if (!query) {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      const users = await API.searchUsers(query);
      dropdown.innerHTML = "";

      if (users.length === 0) {
        dropdown.innerHTML = `
          <div class="search-empty">
            No users found for "<strong>${query}</strong>"
          </div>`;
        dropdown.classList.remove("hidden");
        return;
      }

      users.forEach((u) => {
        const item = document.createElement("div");
        item.className = "search-result-item";

        // Avatar
        item.appendChild(renderAvatar(u, "avatar-sm"));

        // Info
        const info = document.createElement("div");
        info.className = "sr-info";

        const name = document.createElement("div");
        name.className = "sr-name";
        name.textContent = "@" + u.username;

        const bio = document.createElement("div");
        bio.className = "sr-bio";
        bio.textContent = u.bio || "No bio yet.";

        info.appendChild(name);
        info.appendChild(bio);
        item.appendChild(info);

        // Clicking navigates to profile
        item.addEventListener("click", () => {
          dropdown.classList.add("hidden");
          document.getElementById("search-input").value = "";
          navigateToProfile(u.username);
        });

        dropdown.appendChild(item);
      });

      dropdown.classList.remove("hidden");
    } catch {
      dropdown.classList.add("hidden");
    }
  }, 300);
});

// Close dropdown on outside click
document.addEventListener("click", (e) => {
  if (!e.target.closest(".sidebar-search")) {
    document.getElementById("search-results").classList.add("hidden");
  }
});

/* ══════════════════════════════════════════════════════════════════
   BOOT — Entry point
   Must be the last line in the file.
══════════════════════════════════════════════════════════════════ */
boot();
