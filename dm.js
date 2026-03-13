import { supabase } from "./supabaseClient.js";
import { t } from "./i18n.js";
import {
  $,
  showToast,
  renderAvatar,
  formatHandle,
  formatDateTimeDisplay,
} from "./utils.js";

let dmContext = {
  getCurrentUser: () => null,
  getCurrentLang: () => "ja",
  getProfilesForUsers: async () => new Map(),
  isMessagesPageActive: () => false,
};

let dmThreads = [];
let dmPartners = [];
let dmMessages = [];
let dmActivePartnerId = "";
let dmThreadsLoaded = false;
let dmThreadsLoading = false;
let dmMessagesLoading = false;
let dmPollTimer = null;

const DM_POLL_INTERVAL_MS = 12000;
const DM_FETCH_LIMIT = 350;
const DM_MESSAGE_LIMIT = 250;

export function setDmContext(next = {}) {
  dmContext = { ...dmContext, ...next };
}

const getCurrentUser = () => dmContext.getCurrentUser?.();
const getCurrentLang = () => dmContext.getCurrentLang?.() || "ja";
const getProfilesForUsers = (...args) =>
  dmContext.getProfilesForUsers?.(...args) || new Map();
const isMessagesPageActive = () => !!dmContext.isMessagesPageActive?.();

function getDmTranslations() {
  return t[getCurrentLang()] || t.ja;
}

function clearDmState() {
  dmThreads = [];
  dmPartners = [];
  dmMessages = [];
  dmActivePartnerId = "";
  dmThreadsLoaded = false;
}

function getPartnerId(row, userId) {
  if (!row || !userId) return "";
  if (row.sender_id === userId) return row.recipient_id || "";
  if (row.recipient_id === userId) return row.sender_id || "";
  return "";
}

function getProfileDisplay(profile, fallbackId = "") {
  const handleText = formatHandle(profile?.handle || "") || "";
  const displayName = `${profile?.display_name || ""}`.trim();
  if (displayName) {
    if (!handleText) return displayName;
    return `${displayName} ${handleText}`;
  }
  if (handleText) return handleText;
  return `@${String(fallbackId || "user").slice(0, 8)}`;
}

function formatMessageTime(value) {
  if (!value) return "";
  return formatDateTimeDisplay(value);
}

function setThreadStatus(message = "", tone = "") {
  const el = $("dm-thread-status");
  if (!el) return;
  el.textContent = message;
  el.classList.remove(
    "feed-status-loading",
    "feed-status-success",
    "feed-status-warning",
    "feed-status-error"
  );
  if (!message) return;
  if (tone === "loading") el.classList.add("feed-status-loading");
  if (tone === "success") el.classList.add("feed-status-success");
  if (tone === "warning") el.classList.add("feed-status-warning");
  if (tone === "error") el.classList.add("feed-status-error");
}

function setSendStatus(message = "", tone = "") {
  const el = $("dm-send-status");
  if (!el) return;
  el.textContent = message;
  el.classList.remove(
    "feed-status-loading",
    "feed-status-success",
    "feed-status-warning",
    "feed-status-error"
  );
  if (!message) return;
  if (tone === "loading") el.classList.add("feed-status-loading");
  if (tone === "success") el.classList.add("feed-status-success");
  if (tone === "warning") el.classList.add("feed-status-warning");
  if (tone === "error") el.classList.add("feed-status-error");
}

async function loadConnectedPartnerIds(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id,following_id")
    .or(`follower_id.eq.${userId},following_id.eq.${userId}`)
    .limit(500);

  if (error) {
    console.error("loadConnectedPartnerIds error:", error);
    return [];
  }

  const ids = new Set();
  (data || []).forEach((row) => {
    const partnerId =
      row?.follower_id === userId ? row?.following_id : row?.follower_id;
    const normalized = `${partnerId || ""}`.trim();
    if (!normalized || normalized === userId) return;
    ids.add(normalized);
  });
  return Array.from(ids);
}

function renderPartnerSelect() {
  const select = $("dm-partner-select");
  if (!select) return;
  const tr = getDmTranslations();
  select.innerHTML = "";

  if (!dmPartners.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = tr.dmNoContacts || "No contacts yet.";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  dmPartners.forEach((partner) => {
    const option = document.createElement("option");
    option.value = partner.id;
    option.textContent = getProfileDisplay(partner.profile, partner.id);
    if (partner.id === dmActivePartnerId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function renderThreadList() {
  const list = $("dm-thread-list");
  if (!list) return;
  const tr = getDmTranslations();
  list.innerHTML = "";

  if (!dmThreads.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = tr.dmThreadsEmpty || "No conversations yet.";
    list.appendChild(empty);
    return;
  }

  dmThreads.forEach((thread) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dm-thread-item";
    if (thread.partnerId === dmActivePartnerId) {
      button.classList.add("is-active");
    }
    if (thread.unreadCount > 0) {
      button.classList.add("is-unread");
    }
    button.setAttribute("data-dm-thread-id", thread.partnerId);

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    const label = getProfileDisplay(thread.profile, thread.partnerId);
    const initial = label.replace("@", "").charAt(0).toUpperCase() || "U";
    renderAvatar(avatar, thread.profile, initial);

    const body = document.createElement("div");
    body.className = "dm-thread-main";

    const top = document.createElement("div");
    top.className = "dm-thread-top";
    const name = document.createElement("div");
    name.className = "dm-thread-name";
    name.textContent = label;
    top.appendChild(name);
    if (thread.unreadCount > 0) {
      const badge = document.createElement("span");
      badge.className = "dm-thread-unread";
      badge.textContent = `${thread.unreadCount}`;
      top.appendChild(badge);
    }

    const preview = document.createElement("div");
    preview.className = "dm-thread-preview";
    preview.textContent = `${thread.lastBody || ""}`.trim() || "…";

    const meta = document.createElement("div");
    meta.className = "dm-thread-meta";
    meta.textContent = formatMessageTime(thread.lastAt);

    body.appendChild(top);
    body.appendChild(preview);
    body.appendChild(meta);

    button.appendChild(avatar);
    button.appendChild(body);
    list.appendChild(button);
  });
}

function renderConversationHeader() {
  const title = $("dm-chat-title");
  if (!title) return;
  const tr = getDmTranslations();
  const active = dmPartners.find((partner) => partner.id === dmActivePartnerId);
  if (!active) {
    title.textContent = tr.dmConversationIdle || "Select a chat";
    return;
  }
  title.textContent = getProfileDisplay(active.profile, active.id);
}

function renderConversationMessages() {
  const list = $("dm-message-list");
  if (!list) return;
  const tr = getDmTranslations();
  const currentUser = getCurrentUser();
  list.innerHTML = "";

  if (!dmActivePartnerId) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      tr.dmSelectPartner || "Select a partner to start chatting.";
    list.appendChild(empty);
    return;
  }

  if (!dmMessages.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      tr.dmNoMessages || "No messages yet. Send the first one.";
    list.appendChild(empty);
    return;
  }

  dmMessages.forEach((message) => {
    const row = document.createElement("div");
    row.className = "dm-message-row";
    const isMine = message.sender_id === currentUser?.id;
    row.classList.add(isMine ? "is-self" : "is-other");

    const bubble = document.createElement("div");
    bubble.className = "dm-message-bubble";
    bubble.textContent = message.body || "";

    const meta = document.createElement("div");
    meta.className = "dm-message-meta";
    meta.textContent = formatMessageTime(message.created_at);

    row.appendChild(bubble);
    row.appendChild(meta);
    list.appendChild(row);
  });

  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

async function markConversationRead(partnerId) {
  const currentUser = getCurrentUser();
  if (!currentUser || !partnerId) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("direct_messages")
    .update({ read_at: nowIso })
    .eq("sender_id", partnerId)
    .eq("recipient_id", currentUser.id)
    .is("read_at", null);

  if (error) {
    console.error("markConversationRead error:", error);
    return;
  }

  dmThreads = dmThreads.map((thread) =>
    thread.partnerId === partnerId
      ? { ...thread, unreadCount: 0 }
      : thread
  );
  renderThreadList();
}

async function loadConversation(partnerId) {
  const currentUser = getCurrentUser();
  const tr = getDmTranslations();
  if (!currentUser || !partnerId || dmMessagesLoading) return;

  dmMessagesLoading = true;
  setSendStatus(tr.dmLoading || "Loading...", "loading");

  try {
    const pairFilter = `and(sender_id.eq.${currentUser.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${currentUser.id})`;
    const { data, error } = await supabase
      .from("direct_messages")
      .select("id,sender_id,recipient_id,body,created_at,read_at")
      .or(pairFilter)
      .order("created_at", { ascending: true })
      .limit(DM_MESSAGE_LIMIT);

    if (error) {
      console.error("loadConversation error:", error);
      setSendStatus(tr.dmLoadError || "Failed to load messages.", "error");
      return;
    }

    dmMessages = data || [];
    renderConversationMessages();
    await markConversationRead(partnerId);
    setSendStatus("", "");
  } finally {
    dmMessagesLoading = false;
  }
}

export async function refreshDmData(options = {}) {
  const currentUser = getCurrentUser();
  const tr = getDmTranslations();
  const preservePartner = !!options.preservePartner;

  if (!currentUser) {
    clearDmState();
    renderDmPage();
    return;
  }
  if (dmThreadsLoading) return;

  dmThreadsLoading = true;
  setThreadStatus(tr.dmLoading || "Loading...", "loading");

  try {
    const [messagesRes, connectedPartnerIds] = await Promise.all([
      supabase
        .from("direct_messages")
        .select("id,sender_id,recipient_id,body,created_at,read_at")
        .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
        .order("created_at", { ascending: false })
        .limit(DM_FETCH_LIMIT),
      loadConnectedPartnerIds(currentUser.id),
    ]);

    if (messagesRes.error) {
      console.error("refreshDmData messages error:", messagesRes.error);
      setThreadStatus(tr.dmLoadError || "Failed to load messages.", "error");
      return;
    }

    const rows = messagesRes.data || [];
    const threadByPartner = new Map();

    rows.forEach((row) => {
      const partnerId = getPartnerId(row, currentUser.id);
      if (!partnerId) return;
      if (!threadByPartner.has(partnerId)) {
        threadByPartner.set(partnerId, {
          partnerId,
          lastBody: `${row.body || ""}`.trim(),
          lastAt: row.created_at,
          unreadCount: 0,
          profile: null,
        });
      }
      if (row.recipient_id === currentUser.id && !row.read_at) {
        const current = threadByPartner.get(partnerId);
        current.unreadCount += 1;
      }
    });

    const partnerIdSet = new Set([
      ...threadByPartner.keys(),
      ...(connectedPartnerIds || []),
    ]);
    const partnerIds = Array.from(partnerIdSet);
    const profilesMap =
      partnerIds.length > 0
        ? await getProfilesForUsers(partnerIds)
        : new Map();

    dmThreads = Array.from(threadByPartner.values())
      .map((thread) => ({
        ...thread,
        profile: profilesMap.get(thread.partnerId) || null,
      }))
      .sort((a, b) => {
        const aTime = new Date(a.lastAt || 0).getTime();
        const bTime = new Date(b.lastAt || 0).getTime();
        return bTime - aTime;
      });

    dmPartners = partnerIds
      .map((id) => ({
        id,
        profile: profilesMap.get(id) || null,
        hasThread: threadByPartner.has(id),
      }))
      .sort((a, b) => {
        if (a.hasThread !== b.hasThread) return a.hasThread ? -1 : 1;
        const aThread = threadByPartner.get(a.id);
        const bThread = threadByPartner.get(b.id);
        const aTime = new Date(aThread?.lastAt || 0).getTime();
        const bTime = new Date(bThread?.lastAt || 0).getTime();
        if (aTime !== bTime) return bTime - aTime;
        const aLabel = getProfileDisplay(a.profile, a.id).toLowerCase();
        const bLabel = getProfileDisplay(b.profile, b.id).toLowerCase();
        return aLabel.localeCompare(bLabel);
      });

    if (!preservePartner || !dmPartners.some((partner) => partner.id === dmActivePartnerId)) {
      dmActivePartnerId = dmThreads[0]?.partnerId || dmPartners[0]?.id || "";
    }

    dmThreadsLoaded = true;
    renderPartnerSelect();
    renderThreadList();
    renderConversationHeader();
    await loadConversation(dmActivePartnerId);
    setThreadStatus("", "");
  } finally {
    dmThreadsLoading = false;
  }
}

function startDmPolling() {
  if (typeof window === "undefined") return;
  if (dmPollTimer) return;
  dmPollTimer = window.setInterval(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    if (!isMessagesPageActive()) return;
    refreshDmData({ preservePartner: true }).catch((error) => {
      console.error("DM polling refresh failed:", error);
    });
  }, DM_POLL_INTERVAL_MS);
}

function stopDmPolling() {
  if (!dmPollTimer || typeof window === "undefined") return;
  clearInterval(dmPollTimer);
  dmPollTimer = null;
}

async function handleSendMessage(event) {
  if (event) event.preventDefault();
  const currentUser = getCurrentUser();
  const tr = getDmTranslations();
  const input = $("dm-input");
  const sendBtn = $("btn-dm-send");
  const partnerSelect = $("dm-partner-select");
  const partnerId = `${dmActivePartnerId || partnerSelect?.value || ""}`.trim();
  const body = `${input?.value || ""}`.trim();

  if (!currentUser) {
    showToast(tr.dmLoginRequired || "Please log in first.", "warning");
    return;
  }
  if (!partnerId) {
    showToast(tr.dmNoPartner || "Select a partner.", "warning");
    return;
  }
  if (!body) {
    showToast(tr.dmEmptyMessage || "Enter a message.", "warning");
    return;
  }
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.classList.add("is-loading");
  }
  setSendStatus(tr.dmSending || "Sending...", "loading");
  try {
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: currentUser.id,
      recipient_id: partnerId,
      body,
    });

    if (error) {
      console.error("handleSendMessage error:", error);
      setSendStatus(tr.dmSendError || "Failed to send message.", "error");
      return;
    }

    if (input) input.value = "";
    dmActivePartnerId = partnerId;
    await refreshDmData({ preservePartner: true });
    setSendStatus("", "");
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.classList.remove("is-loading");
    }
  }
}

export function setupDmControls() {
  const refreshBtn = $("btn-dm-refresh");
  if (refreshBtn && refreshBtn.dataset.bound !== "true") {
    refreshBtn.dataset.bound = "true";
    refreshBtn.addEventListener("click", () => {
      refreshDmData({ preservePartner: true }).catch((error) => {
        console.error("dm refresh failed:", error);
      });
    });
  }

  const startBtn = $("btn-dm-start");
  const partnerSelect = $("dm-partner-select");
  if (startBtn && startBtn.dataset.bound !== "true") {
    startBtn.dataset.bound = "true";
    startBtn.addEventListener("click", () => {
      const nextPartnerId = `${partnerSelect?.value || ""}`.trim();
      if (!nextPartnerId) return;
      dmActivePartnerId = nextPartnerId;
      renderPartnerSelect();
      renderThreadList();
      renderConversationHeader();
      loadConversation(dmActivePartnerId).catch((error) => {
        console.error("open conversation failed:", error);
      });
    });
  }

  if (partnerSelect && partnerSelect.dataset.bound !== "true") {
    partnerSelect.dataset.bound = "true";
    partnerSelect.addEventListener("change", () => {
      const nextPartnerId = `${partnerSelect.value || ""}`.trim();
      if (!nextPartnerId) return;
      dmActivePartnerId = nextPartnerId;
      renderThreadList();
      renderConversationHeader();
      loadConversation(dmActivePartnerId).catch((error) => {
        console.error("partner change load conversation failed:", error);
      });
    });
  }

  const threadList = $("dm-thread-list");
  if (threadList && threadList.dataset.bound !== "true") {
    threadList.dataset.bound = "true";
    threadList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-dm-thread-id]");
      if (!button) return;
      const nextPartnerId = `${button.getAttribute("data-dm-thread-id") || ""}`.trim();
      if (!nextPartnerId) return;
      dmActivePartnerId = nextPartnerId;
      renderPartnerSelect();
      renderThreadList();
      renderConversationHeader();
      loadConversation(dmActivePartnerId).catch((error) => {
        console.error("thread click load conversation failed:", error);
      });
    });
  }

  const form = $("dm-form");
  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.addEventListener("submit", handleSendMessage);
  }
}

export function handleDmPageChange(page) {
  if (page === "messages") {
    startDmPolling();
    renderDmPage({ refreshIfNeeded: true });
    return;
  }
  stopDmPolling();
}

export function renderDmPage(options = {}) {
  const tr = getDmTranslations();
  const currentUser = getCurrentUser();
  const loginRequired = $("dm-login-required");
  const layout = $("dm-layout");
  const partnerSelect = $("dm-partner-select");
  const input = $("dm-input");
  const sendBtn = $("btn-dm-send");

  if (!currentUser) {
    stopDmPolling();
    clearDmState();
    if (loginRequired) {
      loginRequired.classList.remove("hidden");
      loginRequired.textContent =
        tr.dmLoginRequired || "Please log in to use DM.";
    }
    if (layout) layout.classList.add("hidden");
    if (partnerSelect) partnerSelect.disabled = true;
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    setThreadStatus("", "");
    setSendStatus("", "");
    return;
  }

  if (loginRequired) loginRequired.classList.add("hidden");
  if (layout) layout.classList.remove("hidden");
  if (partnerSelect) partnerSelect.disabled = false;
  if (input) input.disabled = false;
  if (sendBtn && !sendBtn.classList.contains("is-loading")) sendBtn.disabled = false;

  renderPartnerSelect();
  renderThreadList();
  renderConversationHeader();
  renderConversationMessages();

  if (options.refreshIfNeeded && !dmThreadsLoaded) {
    refreshDmData({ preservePartner: true }).catch((error) => {
      console.error("renderDmPage refresh failed:", error);
    });
  }
}
