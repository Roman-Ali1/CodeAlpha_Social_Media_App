/**
 * api.js
 * Central API client. Every fetch() call in the app goes through here.
 * Returns data on success, throws Error on failure.
 * Never touches the DOM.
 */

const API = (() => {

  const BASE = "/api";

  /* ── Core fetch wrapper ─────────────────────────────────────────
     Automatically:
     - Attaches JWT token from localStorage
     - Sets Content-Type header
     - Throws on non-2xx responses with the server's error message
  ──────────────────────────────────────────────────────────────── */
  async function apiFetch(path, options = {}) {
    const token = localStorage.getItem("nexus_token");

    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(BASE + path, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong");
    }

    return data;
  }

  /* ── Public API methods ─────────────────────────────────────── */
  return {

    // AUTH
    register: (username, email, password) =>
      apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      }),

    login: (login, password) =>
      apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ login, password }),
      }),

    // USERS
    getMe: () =>
      apiFetch("/users/me"),

    updateMe: (bio, avatar) =>
      apiFetch("/users/me", {
        method: "PUT",
        body: JSON.stringify({ bio, avatar }),
      }),

    getUser: (username) =>
      apiFetch(`/users/${username}`),

    searchUsers: (query) =>
      apiFetch(`/users/search/${encodeURIComponent(query)}`),

    // FOLLOWS
    follow: (username) =>
      apiFetch(`/users/${username}/follow`, { method: "POST" }),

    unfollow: (username) =>
      apiFetch(`/users/${username}/follow`, { method: "DELETE" }),

    getFollowers: (username) =>
      apiFetch(`/users/${username}/followers`),

    getFollowing: (username) =>
      apiFetch(`/users/${username}/following`),

    // POSTS
    getFeed: () =>
      apiFetch("/posts/feed"),

    getExplore: () =>
      apiFetch("/posts/explore"),

    getUserPosts: (username) =>
      apiFetch(`/users/${username}/posts`),

    createPost: (content, image_url = "") =>
      apiFetch("/posts", {
        method: "POST",
        body: JSON.stringify({ content, image_url }),
      }),

    deletePost: (id) =>
      apiFetch(`/posts/${id}`, { method: "DELETE" }),

    // LIKES
    likePost: (id) =>
      apiFetch(`/posts/${id}/like`, { method: "POST" }),

    unlikePost: (id) =>
      apiFetch(`/posts/${id}/like`, { method: "DELETE" }),

    // COMMENTS
    getComments: (postId) =>
      apiFetch(`/posts/${postId}/comments`),

    addComment: (postId, content) =>
      apiFetch(`/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),

    deleteComment: (id) =>
      apiFetch(`/comments/${id}`, { method: "DELETE" }),
  };

})();