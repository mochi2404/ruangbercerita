(function () {
  const STORAGE_KEY = "ruang-cerita-chats";
  const CHANNEL_NAME = "ruang-cerita-sync";
  const ADMIN_SESSION_KEY = "ruang-cerita-admin-auth";
  const ADMIN_PASSWORD = "farel";
  const API = {
    chats: "/api/chats",
    messages: "/api/messages",
  };

  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  const state = {
    chats: [],
    userChatId: new URLSearchParams(window.location.search).get("chat"),
    adminChatId: new URLSearchParams(window.location.search).get("chat"),
    apiOnline: true,
    lastFingerprint: "",
    pollTimer: null,
    isFetching: false,
  };

  function readLocalChats() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeLocalChats(chats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    if (channel) channel.postMessage({ type: "sync" });
  }

  function fingerprint(chats) {
    return chats.map((chat) => `${chat.id}:${chat.last_updated}:${chat.messages.length}`).join("|");
  }

  function normalizeChats(chats) {
    return chats.map((chat) => ({
      id: chat.id,
      created_at: chat.created_at,
      last_message: chat.last_message || "",
      last_updated: chat.last_updated,
      messages: Array.isArray(chat.messages) ? chat.messages : [],
    }));
  }

  function setChats(chats, forceRender) {
    const next = normalizeChats(chats);
    const nextFingerprint = fingerprint(next);

    state.chats = next;
    if (!forceRender && nextFingerprint === state.lastFingerprint) return false;

    state.lastFingerprint = nextFingerprint;
    renderCurrentView();
    return true;
  }

  async function requestJson(url, options) {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options && options.headers) },
      cache: "no-store",
      ...options,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  }

  async function syncChats(options) {
    if (state.isFetching) return;
    state.isFetching = true;

    try {
      const payload = await requestJson(API.chats);
      state.apiOnline = true;
      setChats(payload.chats || [], options && options.force);
    } catch {
      state.apiOnline = false;
      setChats(readLocalChats(), options && options.force);
    } finally {
      state.isFetching = false;
    }
  }

  function sortedChats() {
    return [...state.chats].sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));
  }

  function getChat(id) {
    return state.chats.find((chat) => chat.id === id);
  }

  async function createChat() {
    if (state.apiOnline) {
      try {
        const payload = await requestJson(API.chats, { method: "POST", body: "{}" });
        await syncChats({ force: true });
        return payload.chat;
      } catch {
        state.apiOnline = false;
      }
    }

    const now = new Date().toISOString();
    const chat = {
      id: "local_" + Date.now(),
      created_at: now,
      messages: [],
      last_message: "",
      last_updated: now,
    };

    const chats = readLocalChats();
    chats.push(chat);
    writeLocalChats(chats);
    setChats(chats, true);
    return chat;
  }

  function addOptimisticMessage(chatId, sender, text) {
    const chat = getChat(chatId);
    const now = new Date().toISOString();
    const message = {
      id: "pending_" + Date.now(),
      sender,
      text,
      sent_at: now,
      pending: true,
    };

    if (!chat) return null;

    chat.messages = [...chat.messages, message];
    chat.last_message = text;
    chat.last_updated = now;
    state.lastFingerprint = "";
    renderCurrentView();
    return message.id;
  }

  function markFailed(chatId, messageId) {
    const chat = getChat(chatId);
    if (!chat) return;

    chat.messages = chat.messages.map((message) => (
      message.id === messageId ? { ...message, pending: false, failed: true } : message
    ));
    state.lastFingerprint = "";
    renderCurrentView();
  }

  async function sendMessage(chatId, sender, text) {
    const trimmed = text.trim();
    if (!chatId || !trimmed) return false;

    const pendingId = addOptimisticMessage(chatId, sender, trimmed);

    if (state.apiOnline && !chatId.startsWith("local_")) {
      try {
        await requestJson(API.messages, {
          method: "POST",
          body: JSON.stringify({ chat_id: chatId, sender, text: trimmed }),
        });
        await syncChats({ force: true });
        return true;
      } catch {
        markFailed(chatId, pendingId);
        showToast("Pesan belum terkirim. Coba lagi sebentar.");
        return false;
      }
    }

    const chats = readLocalChats();
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return false;

    const now = new Date().toISOString();
    chat.messages.push({ id: "local_msg_" + Date.now(), sender, text: trimmed, sent_at: now });
    chat.last_message = trimmed;
    chat.last_updated = now;
    writeLocalChats(chats);
    setChats(chats, true);
    return true;
  }

  function formatDate(value) {
    return new Date(value).toLocaleDateString("id-ID", { month: "short", day: "numeric" });
  }

  function formatTime(value) {
    return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function renderIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function renderMessage(container, message, viewer) {
    const mine = message.sender === viewer;
    const row = document.createElement("div");
    row.className = `message-group ${mine ? "msg-outgoing" : "msg-incoming"} ${message.pending ? "is-pending" : ""}`;
    row.innerHTML = `
      <div class="bubble-wrap">
        <div class="bubble ${mine ? "bubble-outgoing" : "bubble-incoming"} ${message.failed ? "bubble-failed" : ""}">
          ${escapeHtml(message.text)}
        </div>
        <div class="message-meta">
          ${message.pending ? "Mengirim..." : message.failed ? "Gagal terkirim" : formatTime(message.sent_at || new Date())}
        </div>
      </div>
    `;
    container.appendChild(row);
  }

  function renderUserList() {
    const list = document.getElementById("user-chat-list");
    const empty = document.getElementById("user-no-chats");
    if (!list || !empty) return;

    const chats = sortedChats();
    list.innerHTML = "";
    empty.classList.toggle("hidden", chats.length > 0);

    chats.forEach((chat) => {
      const link = document.createElement("a");
      link.className = "chat-item";
      link.href = `?chat=${encodeURIComponent(chat.id)}`;
      link.innerHTML = `
        <div class="chat-row">
          <p class="chat-name">Chat</p>
          <span class="chat-time">${formatDate(chat.created_at)}</span>
        </div>
        <p class="chat-preview">${escapeHtml(chat.last_message || "Mulai percakapan...")}</p>
        <p class="chat-meta">${chat.messages.length} pesan</p>
      `;
      list.appendChild(link);
    });

    renderIcons();
  }

  function renderUserChat() {
    const home = document.getElementById("user-home");
    const chatPage = document.getElementById("user-chat");
    const messages = document.getElementById("user-messages");
    if (!messages) return;

    const chat = getChat(state.userChatId);
    if (!chat) {
      window.history.replaceState(null, "", window.location.pathname);
      state.userChatId = null;
      if (home) home.classList.remove("hidden");
      if (chatPage) chatPage.classList.add("hidden");
      renderUserList();
      return;
    }

    if (home) home.classList.add("hidden");
    if (chatPage) chatPage.classList.remove("hidden");

    messages.innerHTML = "";
    chat.messages.forEach((message) => renderMessage(messages, message, "user"));
    messages.scrollTop = messages.scrollHeight;
  }

  function renderAdminList() {
    const list = document.getElementById("admin-chat-list");
    const count = document.getElementById("admin-chat-count");
    const empty = document.getElementById("admin-empty-view");
    const chatView = document.getElementById("admin-chat-view");
    const layout = document.getElementById("admin-layout");
    if (!list || !count) return;

    const chats = sortedChats();
    count.textContent = String(chats.length);
    list.innerHTML = "";

    chats.forEach((chat) => {
      const lastMessage = chat.messages[chat.messages.length - 1];
      const link = document.createElement("a");
      link.className = `chat-item ${state.adminChatId === chat.id ? "active" : ""}`;
      link.href = `/admin/?chat=${encodeURIComponent(chat.id)}`;
      link.innerHTML = `
        <div class="chat-row">
          <p class="chat-name">Pengguna</p>
          <span class="chat-time">${formatTime(chat.created_at)}</span>
        </div>
        <p class="chat-preview">${escapeHtml(chat.last_message || "Menunggu pesan...")}</p>
        <div class="chat-status">
          <span class="chat-meta">${chat.messages.length} pesan</span>
          <span class="status-badge" style="background-color:${lastMessage && lastMessage.sender === "user" ? "#FFF3E0" : "#D8F3DC"}">${lastMessage && lastMessage.sender === "user" ? "Baru" : "Dibalas"}</span>
        </div>
      `;
      list.appendChild(link);
    });

    if (state.adminChatId && getChat(state.adminChatId)) {
      empty.classList.add("hidden");
      chatView.classList.remove("hidden");
      layout.classList.add("has-open-chat");
    } else {
      chatView.classList.add("hidden");
      empty.classList.remove("hidden");
      layout.classList.remove("has-open-chat");
    }

    renderIcons();
  }

  function renderAdminChat() {
    const chat = getChat(state.adminChatId);
    if (!chat) {
      renderAdminList();
      return;
    }

    const title = document.getElementById("admin-chat-header");
    const subtitle = document.getElementById("admin-chat-subtitle");
    const messages = document.getElementById("admin-messages");

    title.textContent = "Chat dengan Pengguna";
    subtitle.textContent = `${chat.messages.length} pesan - Dibuat ${new Date(chat.created_at).toLocaleDateString("id-ID")}`;
    messages.innerHTML = "";

    chat.messages.forEach((message) => renderMessage(messages, message, "admin"));
    messages.scrollTop = messages.scrollHeight;
  }

  function renderCurrentView() {
    if (document.getElementById("admin-layout")) {
      renderAdminList();
      if (state.adminChatId) renderAdminChat();
      return;
    }

    if (state.userChatId) renderUserChat();
    else renderUserList();
  }

  function startPolling(interval) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(() => syncChats(), interval);
  }

  function handleLiveEvents() {
    window.addEventListener("storage", () => {
      if (!state.apiOnline) setChats(readLocalChats(), true);
    });

    if (channel) {
      channel.onmessage = () => {
        if (!state.apiOnline) setChats(readLocalChats(), true);
      };
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        startPolling(5000);
      } else {
        syncChats({ force: true });
        startPolling(1400);
      }
    });
  }

  function setAdminLocked(locked) {
    const layout = document.getElementById("admin-layout");
    const login = document.getElementById("admin-login-view");

    if (!layout || !login) return;

    layout.classList.toggle("is-locked", locked);
    login.classList.toggle("hidden", !locked);
  }

  function initAdminLogin(onAuthenticated) {
    const form = document.getElementById("admin-login-form");
    const input = document.getElementById("admin-password");
    const error = document.getElementById("admin-login-error");
    const logout = document.getElementById("admin-logout");
    const isAuthenticated = sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";

    setAdminLocked(!isAuthenticated);

    if (isAuthenticated) {
      onAuthenticated();
    } else {
      renderIcons();
      setTimeout(() => input && input.focus(), 80);
    }

    if (form && input) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();

        if (input.value === ADMIN_PASSWORD) {
          sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
          input.value = "";
          if (error) error.classList.add("hidden");
          setAdminLocked(false);
          onAuthenticated();
          return;
        }

        if (error) error.classList.remove("hidden");
        input.select();
      });
    }

    if (logout) {
      logout.addEventListener("click", () => {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        window.location.href = "/admin/";
      });
    }
  }

  async function initUser() {
    const startButton = document.getElementById("start-chat");
    const form = document.getElementById("user-form");
    const input = document.getElementById("user-input");

    if (startButton) {
      startButton.addEventListener("click", async () => {
        const chat = await createChat();
        if (chat) window.location.href = `/?chat=${encodeURIComponent(chat.id)}`;
      });
    }

    if (form && input) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const value = input.value;
        if (!value.trim()) return;

        input.value = "";
        const sent = await sendMessage(state.userChatId, "user", value);
        if (!sent) input.value = value;
      });
    }

    await syncChats({ force: true });
    handleLiveEvents();
    startPolling(1400);
  }

  async function initAdmin() {
    const form = document.getElementById("admin-form");
    const input = document.getElementById("admin-input");
    let adminStarted = false;

    if (form && input) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const value = input.value;
        if (!value.trim()) return;

        input.value = "";
        const sent = await sendMessage(state.adminChatId, "admin", value);
        if (!sent) input.value = value;
      });
    }

    initAdminLogin(async () => {
      if (adminStarted) return;
      adminStarted = true;
      await syncChats({ force: true });
      handleLiveEvents();
      startPolling(1200);
    });
  }

  window.RuangCerita = {
    initUser,
    initAdmin,
  };
})();
