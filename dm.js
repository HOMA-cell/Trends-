import { supabase } from "./supabaseClient.js";
import { t } from "./i18n.js";
import {
  $,
  showToast,
  renderAvatar,
  formatHandle,
  formatDateDisplay,
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
let dmThreadSearch = "";
let dmMobileChatOpen = false;
let dmViewportListenerBound = false;

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
  dmThreadSearch = "";
  dmMobileChatOpen = false;
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

function formatMessageTimeOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const lang = getCurrentLang();
  const locale = lang === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isNearBottom(el, threshold = 56) {
  if (!el) return true;
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remaining <= threshold;
}

function formatMessageDayLabel(value) {
  const tr = getDmTranslations();
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateDisplay(value);
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const todayKey = getDateKey(now);
  const valueKey = getDateKey(date);
  if (valueKey === todayKey) {
    return tr.dmToday || "Today";
  }
  const yesterday = new Date(now.getTime() - oneDay);
  if (valueKey === getDateKey(yesterday)) {
    return tr.dmYesterday || "Yesterday";
  }
  return formatDateDisplay(date);
}

function shouldUseDmStackLayout() {
  if (typeof window === "undefined") return false;
  return (window.innerWidth || 1024) <= 900;
}

function applyDmLayoutState() {
  const layout = $("dm-layout");
  const backBtn = $("btn-dm-back");
  if (!layout) return;
  const stackLayout = shouldUseDmStackLayout();
  const showChatPane = stackLayout && dmMobileChatOpen;
  layout.classList.toggle("dm-chat-open", showChatPane);
  if (backBtn) {
    backBtn.classList.toggle("hidden", !showChatPane);
  }
}

function setDmMobileChatOpen(next) {
  dmMobileChatOpen = !!next;
  applyDmLayoutState();
}

function ensureDmViewportListener() {
  if (dmViewportListenerBound || typeof window === "undefined") return;
  dmViewportListenerBound = true;
  window.addEventListener(
    "resize",
    () => {
      if (!shouldUseDmStackLayout()) {
        dmMobileChatOpen = false;
      } else if (!dmActivePartnerId) {
        dmMobileChatOpen = false;
      }
      applyDmLayoutState();
    },
    { passive: true }
  );
}

function syncThreadSearchClearButton() {
  const clearBtn = $("btn-dm-thread-search-clear");
  if (!clearBtn) return;
  clearBtn.classList.toggle("hidden", !dmThreadSearch);
}

function getFilteredThreads() {
  const query = `${dmThreadSearch || ""}`.trim().toLowerCase();
  if (!query) return dmThreads;
  return dmThreads.filter((thread) => {
    const label = getProfileDisplay(thread.profile, thread.partnerId).toLowerCase();
    const preview = `${thread.lastBody || ""}`.toLowerCase();
    return label.includes(query) || preview.includes(query);
  });
}

function renderThreadSummary() {
  const summary = $("dm-thread-summary");
  if (!summary) return;
  const tr = getDmTranslations();
  const filtered = getFilteredThreads();
  const unreadCount = filtered.reduce(
    (acc, thread) => acc + Number(thread.unreadCount || 0),
    0
  );
  const chatsLabel = tr.dmThreadSummaryChats || "chats";
  const unreadLabel = tr.dmThreadSummaryUnread || "unread";
  summary.textContent = `${filtered.length} ${chatsLabel} · ${unreadCount} ${unreadLabel}`;
}

function updateDmInputCounter() {
  const input = $("dm-input");
  const counter = $("dm-input-count");
  if (!counter || !input) return;
  const max = Number(input.getAttribute("maxlength") || 600);
  const length = `${input.value || ""}`.length;
  counter.textContent = `${length}/${max}`;
}

function autoResizeDmInput() {
  const input = $("dm-input");
  if (!(input instanceof HTMLTextAreaElement)) return;
  input.style.height = "auto";
  const nextHeight = Math.min(Math.max(input.scrollHeight, 30), 96);
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > 96 ? "auto" : "hidden";
}

function upsertThreadAfterLocalSend(partnerId, body, createdAt) {
  if (!partnerId) return;
  const previewBody = `${body || ""}`.trim();
  const existing = dmThreads.find((thread) => thread.partnerId === partnerId);
  if (existing) {
    existing.lastBody = previewBody;
    existing.lastAt = createdAt;
    existing.lastFromMe = true;
  } else {
    const partner = dmPartners.find((item) => item.id === partnerId);
    dmThreads.unshift({
      partnerId,
      lastBody: previewBody,
      lastAt: createdAt,
      lastFromMe: true,
      unreadCount: 0,
      profile: partner?.profile || null,
    });
  }
  dmThreads.sort((a, b) => {
    const aTime = new Date(a.lastAt || 0).getTime();
    const bTime = new Date(b.lastAt || 0).getTime();
    return bTime - aTime;
  });
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
  const filteredThreads = getFilteredThreads();
  list.innerHTML = "";

  if (!dmThreads.length) {
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    empty.textContent = tr.dmThreadsEmpty || "No conversations yet.";
    list.appendChild(empty);
    renderThreadSummary();
    return;
  }

  if (!filteredThreads.length) {
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    empty.textContent =
      tr.dmNoThreadMatch || "No matching conversations found.";
    list.appendChild(empty);
    renderThreadSummary();
    return;
  }

  filteredThreads.forEach((thread) => {
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
    const previewBody = `${thread.lastBody || ""}`.trim() || "…";
    const youPrefix = tr.dmYouPrefix || "You";
    preview.textContent = thread.lastFromMe
      ? `${youPrefix}: ${previewBody}`
      : previewBody;

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
  renderThreadSummary();
}

function renderConversationHeader() {
  const title = $("dm-chat-title");
  const sub = $("dm-chat-sub");
  const markReadBtn = $("btn-dm-mark-read");
  if (!title) return;
  const tr = getDmTranslations();
  const active = dmPartners.find((partner) => partner.id === dmActivePartnerId);
  if (!active) {
    title.textContent = tr.dmConversationIdle || "Select a chat";
    if (sub) {
      sub.textContent =
        tr.dmChatSubIdle || "Select a partner to start chatting.";
    }
    if (markReadBtn) {
      markReadBtn.disabled = true;
    }
    return;
  }
  title.textContent = getProfileDisplay(active.profile, active.id);
  const activeThread = dmThreads.find(
    (thread) => thread.partnerId === dmActivePartnerId
  );
  const unread = Number(activeThread?.unreadCount || 0);
  if (sub) {
    if (unread > 0) {
      const unreadLabel = tr.dmThreadSummaryUnread || "unread";
      sub.textContent = `${unread} ${unreadLabel}`;
    } else if (activeThread?.lastAt) {
      sub.textContent = `${tr.dmChatSubLastMessage || "Last message"}: ${formatMessageTime(
        activeThread.lastAt
      )}`;
    } else {
      sub.textContent =
        tr.dmChatSubIdle || "Select a partner to start chatting.";
    }
  }
  if (markReadBtn) {
    markReadBtn.disabled = unread <= 0;
  }
}

function renderConversationMessages(options = {}) {
  const list = $("dm-message-list");
  if (!list) return;
  const tr = getDmTranslations();
  const currentUser = getCurrentUser();
  const shouldStickToBottom = !!options.forceBottom || isNearBottom(list);
  list.innerHTML = "";

  if (!dmActivePartnerId) {
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    empty.textContent =
      tr.dmSelectPartner || "Select a partner to start chatting.";
    list.appendChild(empty);
    return;
  }

  if (!dmMessages.length) {
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    empty.textContent =
      tr.dmNoMessages || "No messages yet. Send the first one.";
    list.appendChild(empty);
    return;
  }

  const lastSelfMessage = [...dmMessages]
    .reverse()
    .find((message) => message?.sender_id === currentUser?.id);
  const lastSelfMessageId = `${lastSelfMessage?.id || ""}`.trim();

  let previousDayKey = "";
  dmMessages.forEach((message, index) => {
    const dayKey = getDateKey(message.created_at);
    if (dayKey && dayKey !== previousDayKey) {
      const divider = document.createElement("div");
      divider.className = "dm-day-divider";
      divider.textContent = formatMessageDayLabel(message.created_at);
      list.appendChild(divider);
      previousDayKey = dayKey;
    }

    const row = document.createElement("div");
    row.className = "dm-message-row";
    const isMine = message.sender_id === currentUser?.id;
    row.classList.add(isMine ? "is-self" : "is-other");
    if (message.pending) {
      row.classList.add("is-pending");
    }

    const bubble = document.createElement("div");
    bubble.className = "dm-message-bubble";
    bubble.textContent = message.body || "";

    const meta = document.createElement("div");
    meta.className = "dm-message-meta";
    const messageTime = formatMessageTimeOnly(message.created_at);
    const nextMessage = dmMessages[index + 1];
    const hasNextSameSender =
      !!nextMessage &&
      nextMessage.sender_id === message.sender_id &&
      getDateKey(nextMessage.created_at) === dayKey;
    const shouldShowMeta = !hasNextSameSender || !!message.pending;
    const isLastSelf =
      isMine && lastSelfMessageId && `${message.id || ""}`.trim() === lastSelfMessageId;
    if (message.pending) {
      meta.textContent = tr.dmSending || "Sending...";
    } else if (isLastSelf) {
      const stateLabel = message.read_at
        ? tr.dmSeen || "Seen"
        : tr.dmSent || "Sent";
      meta.textContent = [messageTime, stateLabel].filter(Boolean).join(" · ");
    } else {
      meta.textContent = messageTime;
    }

    row.appendChild(bubble);
    if (shouldShowMeta) {
      row.appendChild(meta);
    } else {
      row.classList.add("is-grouped");
    }
    list.appendChild(row);
  });

  if (shouldStickToBottom) {
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }
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
  renderConversationHeader();
}

async function loadConversation(partnerId, options = {}) {
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
    renderConversationMessages({ forceBottom: !!options.forceBottom });
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
          lastFromMe: row.sender_id === currentUser.id,
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
    await loadConversation(dmActivePartnerId, { forceBottom: true });
    setDmMobileChatOpen(!!dmActivePartnerId);
    renderThreadSummary();
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
  const rawBody = `${input?.value || ""}`;
  const body = rawBody.trim();

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
  const pendingId = `pending-${Date.now()}`;
  const pendingCreatedAt = new Date().toISOString();
  dmMessages = [
    ...dmMessages,
    {
      id: pendingId,
      sender_id: currentUser.id,
      recipient_id: partnerId,
      body,
      created_at: pendingCreatedAt,
      read_at: null,
      pending: true,
    },
  ];
  upsertThreadAfterLocalSend(partnerId, body, pendingCreatedAt);
  renderThreadList();
  renderConversationHeader();
  renderConversationMessages({ forceBottom: true });
  if (input) {
    input.value = "";
    autoResizeDmInput();
  }
  updateDmInputCounter();
  setSendStatus(tr.dmSending || "Sending...", "loading");
  try {
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: currentUser.id,
      recipient_id: partnerId,
      body,
    });

    if (error) {
      console.error("handleSendMessage error:", error);
      dmMessages = dmMessages.filter((message) => `${message.id || ""}` !== pendingId);
      renderConversationMessages({ forceBottom: true });
      setSendStatus(tr.dmSendError || "Failed to send message.", "error");
      return;
    }

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
  ensureDmViewportListener();
  const refreshBtn = $("btn-dm-refresh");
  if (refreshBtn && refreshBtn.dataset.bound !== "true") {
    refreshBtn.dataset.bound = "true";
    refreshBtn.addEventListener("click", () => {
      refreshDmData({ preservePartner: true }).catch((error) => {
        console.error("dm refresh failed:", error);
      });
    });
  }

  const partnerSelect = $("dm-partner-select");

  if (partnerSelect && partnerSelect.dataset.bound !== "true") {
    partnerSelect.dataset.bound = "true";
    partnerSelect.addEventListener("change", () => {
      const nextPartnerId = `${partnerSelect.value || ""}`.trim();
      if (!nextPartnerId) return;
      dmActivePartnerId = nextPartnerId;
      renderThreadList();
      renderConversationHeader();
      setDmMobileChatOpen(true);
      loadConversation(dmActivePartnerId, { forceBottom: true }).catch((error) => {
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
      setDmMobileChatOpen(true);
      loadConversation(dmActivePartnerId, { forceBottom: true }).catch((error) => {
        console.error("thread click load conversation failed:", error);
      });
    });
  }

  const backBtn = $("btn-dm-back");
  if (backBtn && backBtn.dataset.bound !== "true") {
    backBtn.dataset.bound = "true";
    backBtn.addEventListener("click", () => {
      setDmMobileChatOpen(false);
    });
  }

  const markReadBtn = $("btn-dm-mark-read");
  if (markReadBtn && markReadBtn.dataset.bound !== "true") {
    markReadBtn.dataset.bound = "true";
    markReadBtn.addEventListener("click", async () => {
      if (!dmActivePartnerId) return;
      const tr = getDmTranslations();
      setSendStatus(tr.dmLoading || "Loading...", "loading");
      await markConversationRead(dmActivePartnerId);
      await refreshDmData({ preservePartner: true });
      setSendStatus(tr.dmMarkedRead || "Marked as read.", "success");
      setTimeout(() => setSendStatus("", ""), 1200);
    });
  }

  const searchInput = $("dm-thread-search");
  if (searchInput && searchInput.dataset.bound !== "true") {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", () => {
      dmThreadSearch = `${searchInput.value || ""}`.trim();
      syncThreadSearchClearButton();
      renderThreadList();
    });
  }

  const clearSearchBtn = $("btn-dm-thread-search-clear");
  if (clearSearchBtn && clearSearchBtn.dataset.bound !== "true") {
    clearSearchBtn.dataset.bound = "true";
    clearSearchBtn.addEventListener("click", () => {
      dmThreadSearch = "";
      if (searchInput) searchInput.value = "";
      syncThreadSearchClearButton();
      renderThreadList();
      if (searchInput) searchInput.focus();
    });
  }

  const input = $("dm-input");
  if (input && input.dataset.bound !== "true") {
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      autoResizeDmInput();
      updateDmInputCounter();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      handleSendMessage();
    });
  }

  const form = $("dm-form");
  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.addEventListener("submit", handleSendMessage);
  }
  autoResizeDmInput();
  updateDmInputCounter();
  syncThreadSearchClearButton();
  renderThreadSummary();
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
  const threadSearchInput = $("dm-thread-search");
  const threadSearchClearBtn = $("btn-dm-thread-search-clear");
  const input = $("dm-input");
  const sendBtn = $("btn-dm-send");

  if (!currentUser) {
    stopDmPolling();
    clearDmState();
    setDmMobileChatOpen(false);
    if (loginRequired) {
      loginRequired.classList.remove("hidden");
      loginRequired.textContent =
        tr.dmLoginRequired || "Please log in to use DM.";
    }
    if (layout) layout.classList.add("hidden");
    if (partnerSelect) partnerSelect.disabled = true;
    if (threadSearchInput) threadSearchInput.disabled = true;
    if (threadSearchClearBtn) threadSearchClearBtn.disabled = true;
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    setThreadStatus("", "");
    setSendStatus("", "");
    return;
  }

  if (loginRequired) loginRequired.classList.add("hidden");
  if (layout) layout.classList.remove("hidden");
  if (partnerSelect) partnerSelect.disabled = false;
  if (threadSearchInput) {
    threadSearchInput.disabled = false;
    threadSearchInput.value = dmThreadSearch;
  }
  if (threadSearchClearBtn) {
    threadSearchClearBtn.disabled = false;
  }
  if (input) input.disabled = false;
  if (sendBtn && !sendBtn.classList.contains("is-loading")) sendBtn.disabled = false;
  if (shouldUseDmStackLayout()) {
    setDmMobileChatOpen(!!dmActivePartnerId);
  } else {
    setDmMobileChatOpen(false);
  }

  renderPartnerSelect();
  renderThreadList();
  renderConversationHeader();
  renderConversationMessages();
  syncThreadSearchClearButton();
  updateDmInputCounter();
  autoResizeDmInput();

  if (options.refreshIfNeeded && !dmThreadsLoaded) {
    refreshDmData({ preservePartner: true }).catch((error) => {
      console.error("renderDmPage refresh failed:", error);
    });
  }
}
