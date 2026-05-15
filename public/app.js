// =====================================================================
// EpiNotes · frontend SPA
// Vanilla JS. No build step. Talks to same-origin API.
// =====================================================================

const API = ""; // same origin
const TOKEN_KEY = "epinotes_token";
const EMAIL_KEY = "epinotes_email";

// ----- state -----
let state = {
  token: localStorage.getItem(TOKEN_KEY),
  email: localStorage.getItem(EMAIL_KEY),
  notes: [],
  currentId: null,
  saveTimer: null,
  authMode: "login",
};

// ----- helpers -----
function $(sel) {
  return document.querySelector(sel);
}
function $$(sel) {
  return document.querySelectorAll(sel);
}

function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3000);
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // handle 204
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      logout();
      throw new Error("Session expired. Please sign in again.");
    }
    const msg = (data && data.message) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ============ AUTH ============

function showAuth() {
  $("#auth-view").classList.remove("hidden");
  $("#app-view").classList.add("hidden");
}

function showApp() {
  $("#auth-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  $("#user-email").textContent = state.email || "";
  loadNotes();
}

function logout() {
  state.token = null;
  state.email = null;
  state.notes = [];
  state.currentId = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  showAuth();
}

function switchTab(tab) {
  state.authMode = tab;
  $$(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab),
  );
  $("#auth-submit").textContent =
    tab === "login" ? "Sign in" : "Create account";
  $("#auth-message").textContent = "";
  $("#auth-message").classList.remove("success");
  $("#pw-hint").textContent =
    tab === "login" ? "Minimum 8 characters." : "Use at least 8 characters.";
  const pw = $('input[name="password"]');
  pw.setAttribute(
    "autocomplete",
    tab === "login" ? "current-password" : "new-password",
  );
}

$$(".tab").forEach((b) =>
  b.addEventListener("click", () => switchTab(b.dataset.tab)),
);

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  const password = form.password.value;
  const btn = $("#auth-submit");
  const msg = $("#auth-message");
  msg.textContent = "";
  msg.classList.remove("success");
  btn.disabled = true;

  try {
    if (state.authMode === "register") {
      await api("/register", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      msg.textContent = "Account created. Signing you in…";
      msg.classList.add("success");
      // immediately log in
    }
    const data = await api("/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    state.token = data.access_token;
    state.email = email;
    localStorage.setItem(TOKEN_KEY, state.token);
    localStorage.setItem(EMAIL_KEY, email);
    showApp();
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$("#logout-btn").addEventListener("click", logout);

// ----- about modal -----
$("#about-link").addEventListener("click", async () => {
  const modal = $("#about-modal");
  const body = $("#about-body");
  body.innerHTML = '<p class="muted">Loading…</p>';
  modal.classList.remove("hidden");

  try {
    const data = await api("/about", { auth: false });
    body.innerHTML = ""; // clear, we'll build safely with textContent

    function section(label, value, mono = false) {
      const wrap = document.createElement("div");
      wrap.className = "about-body-section";
      const l = document.createElement("p");
      l.className = "about-label";
      l.textContent = label;
      const v = document.createElement("p");
      v.className = mono ? "about-value-mono" : "about-value";
      v.textContent = value;
      wrap.appendChild(l);
      wrap.appendChild(v);
      return wrap;
    }

    body.appendChild(section("Created By  ", data.name || "—"));
    body.appendChild(section("Email", data.email || "—", true));

    const features = data["my features"] || {};
    const featureLabel = document.createElement("p");
    featureLabel.className = "about-label";
    featureLabel.textContent = "My features";
    body.appendChild(featureLabel);

    for (const [name, desc] of Object.entries(features)) {
      const block = document.createElement("div");
      block.className = "feature-block";
      const n = document.createElement("p");
      n.className = "feature-name";
      n.textContent = name;
      const d = document.createElement("p");
      d.className = "feature-desc";
      d.textContent = desc;
      block.appendChild(n);
      block.appendChild(d);
      body.appendChild(block);
    }
  } catch (err) {
    body.innerHTML = "";
    const p = document.createElement("p");
    p.style.color = "var(--accent)";
    p.textContent = "Could not load /about: " + err.message;
    body.appendChild(p);
  }
});

$("#about-close").addEventListener("click", () => {
  $("#about-modal").classList.add("hidden");
});

$("#about-modal").addEventListener("click", (e) => {
  if (e.target.id === "about-modal") $("#about-modal").classList.add("hidden");
});

// ============ NOTES ============

async function loadNotes() {
  try {
    state.notes = await api("/notes");
    renderList();
    if (state.notes.length === 0) {
      $("#empty-list").hidden = false;
    } else {
      $("#empty-list").hidden = true;
      // if currentId is still valid, keep it; otherwise show empty editor state
      if (
        state.currentId &&
        !state.notes.find((n) => n.id === state.currentId)
      ) {
        state.currentId = null;
        showEditorEmpty();
      }
    }
  } catch (err) {
    toast(err.message, true);
  }
}

function renderList() {
  const ul = $("#note-list");
  ul.innerHTML = "";
  for (const note of state.notes) {
    const li = document.createElement("li");
    li.className = "note-item" + (note.id === state.currentId ? " active" : "");
    li.dataset.id = note.id;
    const preview =
      (note.content || "").replace(/\s+/g, " ").trim().slice(0, 60) ||
      "Empty note";
    li.innerHTML = `
      <p class="note-item-title"></p>
      <p class="note-item-preview"></p>
      ${!note.is_owner ? '<span class="note-item-shared">shared</span>' : ""}
    `;
    li.querySelector(".note-item-title").textContent = note.title || "Untitled";
    li.querySelector(".note-item-preview").textContent = preview;
    li.addEventListener("click", () => selectNote(note.id));
    ul.appendChild(li);
  }
}

function showEditorEmpty() {
  $("#editor").classList.add("hidden");
  $("#editor-empty").classList.remove("hidden");
}

function showEditor() {
  $("#editor").classList.remove("hidden");
  $("#editor-empty").classList.add("hidden");
}

function selectNote(id) {
  state.currentId = id;
  renderList();
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  showEditor();

  $("#editor-title").value = note.title || "";
  $("#editor-content").value = note.content || "";
  $("#note-meta").textContent =
    `${note.is_owner ? "created" : "shared"} · ${formatDate(note.created_at)}` +
    `   ·   updated ${formatDate(note.updated_at)}`;
  $("#editor-title").disabled = !note.is_owner;
  $("#editor-content").disabled = !note.is_owner;
  $("#delete-btn").classList.toggle("hidden", !note.is_owner);
  $("#share-btn").classList.toggle("hidden", !note.is_owner);
  $("#retag-btn").classList.toggle("hidden", !note.is_owner);

  // Shared-by banner: shown only when this note was shared TO the current user
  const banner = $("#shared-banner");
  if (!note.is_owner && note.shared_by_email) {
    $("#shared-banner-email").textContent = note.shared_by_email;
    banner.classList.remove("hidden");
  } else if (!note.is_owner && note.owner_email) {
    // Fallback: if shared_by_email is missing for some reason, show the owner's email
    $("#shared-banner-email").textContent = note.owner_email;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  renderTags(note.tags || []);
  $("#summary-panel").classList.add("hidden");
  $("#save-status").textContent = "Saved";
  $("#save-status").classList.remove("dirty");
}

function renderTags(tags) {
  const row = $("#tags-row");
  row.innerHTML = "";
  for (const t of tags) {
    const span = document.createElement("span");
    span.className = "tag ai";
    span.textContent = t;
    row.appendChild(span);
  }
}

// ----- new note -----
$("#new-note-btn").addEventListener("click", async () => {
  try {
    const note = await api("/notes", {
      method: "POST",
      body: { title: "Untitled", content: "" },
    });
    state.notes.unshift(note);
    renderList();
    $("#empty-list").hidden = true;
    selectNote(note.id);
    $("#editor-title").focus();
    $("#editor-title").select();
  } catch (err) {
    toast(err.message, true);
  }
});

// ----- autosave -----
function scheduleSave() {
  $("#save-status").textContent = "Saving…";
  $("#save-status").classList.add("dirty");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveCurrent, 800);
}

async function saveCurrent() {
  if (!state.currentId) return;
  const note = state.notes.find((n) => n.id === state.currentId);
  if (!note || !note.is_owner) return;
  const title = $("#editor-title").value.trim() || "Untitled";
  const content = $("#editor-content").value;
  try {
    const updated = await api(`/notes/${state.currentId}`, {
      method: "PUT",
      body: { title, content },
    });
    Object.assign(note, updated);
    renderList();
    $("#save-status").textContent = "Saved";
    $("#save-status").classList.remove("dirty");
  } catch (err) {
    $("#save-status").textContent = "Save failed";
    toast(err.message, true);
  }
}

$("#editor-title").addEventListener("input", scheduleSave);
$("#editor-content").addEventListener("input", scheduleSave);

// ----- delete -----
$("#delete-btn").addEventListener("click", async () => {
  if (!state.currentId) return;
  if (!confirm("Delete this note? This cannot be undone.")) return;
  try {
    await api(`/notes/${state.currentId}`, { method: "DELETE" });
    state.notes = state.notes.filter((n) => n.id !== state.currentId);
    state.currentId = null;
    renderList();
    showEditorEmpty();
    if (state.notes.length === 0) $("#empty-list").hidden = false;
    toast("Note deleted");
  } catch (err) {
    toast(err.message, true);
  }
});

// ----- summarize -----
$("#summarize-btn").addEventListener("click", async () => {
  if (!state.currentId) return;
  // make sure latest content is saved first
  clearTimeout(state.saveTimer);
  await saveCurrent();

  const panel = $("#summary-panel");
  panel.classList.remove("hidden");
  $("#summary-text").textContent = "Generating summary…";
  $("#summary-meta").textContent = "";

  try {
    const data = await api(`/notes/${state.currentId}/summarize`, {
      method: "POST",
    });
    $("#summary-text").textContent = data.summary;
    $("#summary-meta").textContent =
      `${data.cached ? "from cache" : "fresh"} · generated ${formatDate(data.generated_at)}`;
  } catch (err) {
    $("#summary-text").textContent = err.message;
  }
});

$("#summary-close").addEventListener("click", () => {
  $("#summary-panel").classList.add("hidden");
});

// ----- regenerate tags -----
$("#retag-btn").addEventListener("click", async () => {
  if (!state.currentId) return;
  clearTimeout(state.saveTimer);
  await saveCurrent();

  const btn = $("#retag-btn");
  btn.classList.add("loading");
  btn.textContent = "↻ thinking…";
  try {
    const { tags } = await api(`/notes/${state.currentId}/retag`, {
      method: "POST",
    });
    renderTags(tags);
    const note = state.notes.find((n) => n.id === state.currentId);
    if (note) note.tags = tags;
    toast(
      tags.length
        ? `Regenerated ${tags.length} tag${tags.length > 1 ? "s" : ""}`
        : "No tags suggested for this note",
    );
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.classList.remove("loading");
    btn.textContent = "↻ retag";
  }
});

// ----- share -----
$("#share-btn").addEventListener("click", () => {
  $("#share-modal").classList.remove("hidden");
  $('#share-form input[name="share_with_email"]').value = "";
  $("#share-message").textContent = "";
  $("#share-form input").focus();
});

$("#share-cancel").addEventListener("click", () => {
  $("#share-modal").classList.add("hidden");
});

$("#share-modal").addEventListener("click", (e) => {
  if (e.target.id === "share-modal") $("#share-modal").classList.add("hidden");
});

$("#share-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = e.target.share_with_email.value.trim();
  const msg = $("#share-message");
  msg.textContent = "";
  msg.classList.remove("success");
  try {
    const r = await api(`/notes/${state.currentId}/share`, {
      method: "POST",
      body: { share_with_email: email },
    });
    msg.textContent = r.message || "Shared.";
    msg.classList.add("success");
    setTimeout(() => $("#share-modal").classList.add("hidden"), 900);
    toast(`Shared with ${email}`);
  } catch (err) {
    msg.textContent = err.message;
  }
});

// ----- shortcuts -----
document.addEventListener("keydown", (e) => {
  // Cmd/Ctrl+S to save
  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault();
    clearTimeout(state.saveTimer);
    saveCurrent();
  }
  // Esc closes modal
  if (e.key === "Escape") {
    $("#share-modal").classList.add("hidden");
    $("#about-modal").classList.add("hidden");
  }
});

// ============ INIT ============

(function init() {
  if (state.token && state.email) {
    showApp();
  } else {
    showAuth();
  }
})();
