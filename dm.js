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
let dmThreadVisibleCount = 24;
let dmThreadFilterKey = "";
let dmComposeQuery = "";
let dmComposeOpen = false;
let dmComposeEscBound = false;
let dmThreadSearchRaf = 0;
let dmComposeSearchRaf = 0;
let dmInputMetricsRaf = 0;
let dmRenderedMessagePartnerId = "";
let dmRenderedMessageKeys = [];

const DM_POLL_INTERVAL_MS = 12000;
const DM_FETCH_LIMIT = 350;
const DM_MESSAGE_LIMIT = 250;
const DM_THREAD_BATCH = 24;

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
  dmThreadVisibleCount = DM_THREAD_BATCH;
  dmThreadFilterKey = "";
  dmComposeQuery = "";
  dmComposeOpen = false;
  if (typeof window !== "undefined") {
    if (dmThreadSearchRaf) window.cancelAnimationFrame(dmThreadSearchRaf);
    if (dmComposeSearchRaf) window.cancelAnimationFrame(dmComposeSearchRaf);
    if (dmInputMetricsRaf) window.cancelAnimationFrame(dmInputMetricsRaf);
  }
  dmThreadSearchRaf = 0;
  dmComposeSearchRaf = 0;
  dmInputMetricsRaf = 0;
  dmRenderedMessagePartnerId = "";
  dmRenderedMessageKeys = [];
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

function getDmMessageKey(message, index = 0) {
  const stableId = `${message?.id || ""}`.trim();
  if (stableId) return stableId;
  const sender = `${message?.sender_id || ""}`.trim();
  const createdAt = `${message?.created_at || ""}`.trim();
  const length = `${message?.body || ""}`.length;
  return `pending:${sender}:${createdAt}:${length}:${index}`;
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

function normalizeDmSearchText(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function getDmSearchTokens(query) {
  return normalizeDmSearchText(query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
}

function escapeDmRegex(value) {
  return `${value || ""}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHighlightRegex(query) {
  const tokens = getDmSearchTokens(query);
  if (!tokens.length) return null;
  const pattern = tokens
    .map(escapeDmRegex)
    .sort((a, b) => b.length - a.length)
    .join("|");
  if (!pattern) return null;
  return new RegExp(`(${pattern})`, "gi");
}

function applyHighlightedText(el, text, query) {
  if (!el) return;
  const raw = `${text || ""}`;
  el.textContent = "";
  const regex = getHighlightRegex(query);
  if (!regex || !raw) {
    el.textContent = raw;
    return;
  }
  let cursor = 0;
  for (const match of raw.matchAll(regex)) {
    const index = Number(match.index || 0);
    if (index > cursor) {
      el.appendChild(document.createTextNode(raw.slice(cursor, index)));
    }
    const mark = document.createElement("mark");
    mark.className = "dm-highlight";
    mark.textContent = match[0] || "";
    el.appendChild(mark);
    cursor = index + `${match[0] || ""}`.length;
  }
  if (cursor < raw.length) {
    el.appendChild(document.createTextNode(raw.slice(cursor)));
  }
}

function getDmSearchTokenScore(token, source) {
  if (!token || !source) return 0;
  if (source === token) return 130;
  if (source.startsWith(token)) return 95;
  const atWord = source.indexOf(` ${token}`);
  if (atWord >= 0) return 78 - Math.min(atWord, 36);
  const index = source.indexOf(token);
  if (index < 0) return 0;
  return 62 - Math.min(index, 46);
}

function getDmRecencyScore(value) {
  const ts = new Date(value || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  const ageMs = Date.now() - ts;
  if (ageMs <= 0) return 26;
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours <= 6) return 24;
  if (ageHours <= 24) return 18;
  if (ageHours <= 72) return 11;
  if (ageHours <= 168) return 7;
  return 2;
}

function scoreThreadForQuery(thread, query) {
  const tokens = getDmSearchTokens(query);
  if (!tokens.length) return 0;
  const profile = thread?.profile || {};
  const label = normalizeDmSearchText(getProfileDisplay(profile, thread?.partnerId));
  const displayName = normalizeDmSearchText(profile.display_name);
  const handle = normalizeDmSearchText(profile.handle);
  const preview = normalizeDmSearchText(thread?.lastBody);
  const bio = normalizeDmSearchText(profile.bio);

  let tokenScore = 0;
  for (const token of tokens) {
    const bestCore = Math.max(
      getDmSearchTokenScore(token, handle) + 8,
      getDmSearchTokenScore(token, displayName) + 5,
      getDmSearchTokenScore(token, label),
      getDmSearchTokenScore(token, preview) - 14,
      getDmSearchTokenScore(token, bio) - 20
    );
    if (bestCore <= 0) return 0;
    tokenScore += bestCore;
  }

  const unreadBoost = Math.min(Number(thread?.unreadCount || 0) * 4, 24);
  return tokenScore + unreadBoost + getDmRecencyScore(thread?.lastAt);
}

function getFilteredThreads() {
  const query = normalizeDmSearchText(dmThreadSearch);
  if (!query) return dmThreads;
  return dmThreads
    .map((thread) => ({ thread, score: scoreThreadForQuery(thread, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const aTime = new Date(a.thread.lastAt || 0).getTime();
      const bTime = new Date(b.thread.lastAt || 0).getTime();
      return bTime - aTime;
    })
    .map((row) => row.thread);
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

function scheduleThreadSearchRender() {
  if (typeof window === "undefined") {
    syncThreadSearchClearButton();
    renderThreadList();
    return;
  }
  if (dmThreadSearchRaf) {
    window.cancelAnimationFrame(dmThreadSearchRaf);
  }
  dmThreadSearchRaf = window.requestAnimationFrame(() => {
    dmThreadSearchRaf = 0;
    syncThreadSearchClearButton();
    renderThreadList();
  });
}

function scheduleComposeSearchRender() {
  if (typeof window === "undefined") {
    renderComposeList();
    return;
  }
  if (dmComposeSearchRaf) {
    window.cancelAnimationFrame(dmComposeSearchRaf);
  }
  dmComposeSearchRaf = window.requestAnimationFrame(() => {
    dmComposeSearchRaf = 0;
    renderComposeList();
  });
}

function scheduleDmInputMetricsUpdate() {
  if (typeof window === "undefined") {
    autoResizeDmInput();
    updateDmInputCounter();
    return;
  }
  if (dmInputMetricsRaf) {
    window.cancelAnimationFrame(dmInputMetricsRaf);
  }
  dmInputMetricsRaf = window.requestAnimationFrame(() => {
    dmInputMetricsRaf = 0;
    autoResizeDmInput();
    updateDmInputCounter();
  });
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

function setDmComposeOpen(next) {
  const modal = $("dm-compose-modal");
  dmComposeOpen = !!next;
  if (modal) {
    modal.classList.toggle("hidden", !dmComposeOpen);
    modal.setAttribute("aria-hidden", dmComposeOpen ? "false" : "true");
  }
  if (typeof document !== "undefined") {
    document.body.classList.toggle("dm-compose-open", dmComposeOpen);
  }
}

function closeDmComposeModal() {
  setDmComposeOpen(false);
}

function scoreComposePartnerForQuery(partner, thread, query) {
  const tokens = getDmSearchTokens(query);
  if (!tokens.length) return 0;
  const profile = partner?.profile || {};
  const label = normalizeDmSearchText(getProfileDisplay(profile, partner?.id));
  const displayName = normalizeDmSearchText(profile.display_name);
  const handle = normalizeDmSearchText(profile.handle);
  const bio = normalizeDmSearchText(profile.bio);
  const threadPreview = normalizeDmSearchText(thread?.lastBody);

  let tokenScore = 0;
  for (const token of tokens) {
    const bestCore = Math.max(
      getDmSearchTokenScore(token, handle) + 8,
      getDmSearchTokenScore(token, displayName) + 5,
      getDmSearchTokenScore(token, label),
      getDmSearchTokenScore(token, threadPreview) - 12,
      getDmSearchTokenScore(token, bio) - 18
    );
    if (bestCore <= 0) return 0;
    tokenScore += bestCore;
  }

  const unreadBoost = Math.min(Number(thread?.unreadCount || 0) * 4, 20);
  return tokenScore + unreadBoost + getDmRecencyScore(thread?.lastAt);
}

function getFilteredComposePartners() {
  const query = normalizeDmSearchText(dmComposeQuery);
  if (!query) return dmPartners;
  const threadByPartner = new Map(dmThreads.map((thread) => [thread.partnerId, thread]));
  return dmPartners
    .map((partner) => ({
      partner,
      score: scoreComposePartnerForQuery(partner, threadByPartner.get(partner.id), query),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const aThread = threadByPartner.get(a.partner.id);
      const bThread = threadByPartner.get(b.partner.id);
      const aTime = new Date(aThread?.lastAt || 0).getTime();
      const bTime = new Date(bThread?.lastAt || 0).getTime();
      return bTime - aTime;
    })
    .map((row) => row.partner);
}

function renderComposeList() {
  const list = $("dm-compose-list");
  if (!list) return;
  const tr = getDmTranslations();
  list.innerHTML = "";

  if (!dmPartners.length) {
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    empty.textContent = tr.dmNoContacts || "No contacts yet.";
    list.appendChild(empty);
    return;
  }

  const filteredPartners = getFilteredComposePartners();
  if (!filteredPartners.length) {
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    empty.textContent = tr.dmNoComposeMatch || "No matching users found.";
    list.appendChild(empty);
    return;
  }

  const threadByPartner = new Map(dmThreads.map((thread) => [thread.partnerId, thread]));
  filteredPartners.forEach((partner) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dm-compose-item";
    button.setAttribute("data-dm-compose-id", partner.id);

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    const label = getProfileDisplay(partner.profile, partner.id);
    const initial = label.replace("@", "").charAt(0).toUpperCase() || "U";
    renderAvatar(avatar, partner.profile, initial);

    const main = document.createElement("div");
    main.className = "dm-compose-item-main";

    const name = document.createElement("div");
    name.className = "dm-compose-item-name";
    applyHighlightedText(name, label, dmComposeQuery);

    const thread = threadByPartner.get(partner.id);
    const unread = Number(thread?.unreadCount || 0);
    const sub = document.createElement("div");
    sub.className = "dm-compose-item-sub";
    if (unread > 0) {
      const unreadLabel = tr.dmThreadSummaryUnread || "unread";
      sub.textContent = `${unread} ${unreadLabel}`;
    } else if (thread?.lastAt) {
      sub.textContent = formatMessageTime(thread.lastAt);
    } else {
      sub.textContent = tr.dmComposeStartHint || "Tap to start chatting.";
    }

    main.appendChild(name);
    main.appendChild(sub);
    button.appendChild(avatar);
    button.appendChild(main);
    list.appendChild(button);
  });
}

function openDmComposeModal() {
  const currentUser = getCurrentUser();
  const tr = getDmTranslations();
  if (!currentUser) {
    showToast(tr.dmLoginRequired || "Please log in first.", "warning");
    return;
  }
  dmComposeQuery = "";
  const input = $("dm-compose-search");
  if (input) input.value = "";
  renderComposeList();
  setDmComposeOpen(true);
  requestAnimationFrame(() => {
    if (input) input.focus();
  });
}

function getThreadFilterKey(filteredThreads) {
  const query = `${dmThreadSearch || ""}`.trim().toLowerCase();
  const firstPartnerId = filteredThreads[0]?.partnerId || "";
  const lastPartnerId = filteredThreads[filteredThreads.length - 1]?.partnerId || "";
  return `${query}::${filteredThreads.length}::${firstPartnerId}::${lastPartnerId}`;
}

function renderThreadItem(thread, tr, query = "") {
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
  applyHighlightedText(name, label, query);
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
  if (thread.lastFromMe) {
    const prefix = document.createElement("span");
    prefix.className = "dm-preview-prefix";
    prefix.textContent = `${youPrefix}: `;
    preview.appendChild(prefix);
    const content = document.createElement("span");
    applyHighlightedText(content, previewBody, query);
    preview.appendChild(content);
  } else {
    applyHighlightedText(preview, previewBody, query);
  }

  const meta = document.createElement("div");
  meta.className = "dm-thread-meta";
  meta.textContent = formatMessageTime(thread.lastAt);

  body.appendChild(top);
  body.appendChild(preview);
  body.appendChild(meta);

  button.appendChild(avatar);
  button.appendChild(body);
  return button;
}

function expandThreadListWindow(options = {}) {
  const filteredThreads = getFilteredThreads();
  if (!filteredThreads.length || dmThreadVisibleCount >= filteredThreads.length) {
    return false;
  }
  dmThreadVisibleCount = Math.min(
    filteredThreads.length,
    dmThreadVisibleCount + DM_THREAD_BATCH
  );
  renderThreadList({ preserveScroll: options.preserveScroll !== false, keepWindow: true });
  return true;
}

function selectDmPartner(partnerId, options = {}) {
  const nextPartnerId = `${partnerId || ""}`.trim();
  if (!nextPartnerId) return;
  if (dmComposeOpen) {
    closeDmComposeModal();
  }
  dmActivePartnerId = nextPartnerId;
  renderPartnerSelect();
  renderThreadList();
  renderConversationHeader();
  if (options.openChat !== false) {
    setDmMobileChatOpen(true);
  }
  loadConversation(dmActivePartnerId, { forceBottom: options.forceBottom !== false }).catch(
    (error) => {
      console.error("select partner load conversation failed:", error);
    }
  );
}

function renderThreadList(options = {}) {
  const list = $("dm-thread-list");
  if (!list) return;
  const tr = getDmTranslations();
  const prevScrollTop = options.preserveScroll ? list.scrollTop : 0;
  const searchQuery = `${dmThreadSearch || ""}`;
  const filteredThreads = getFilteredThreads();
  const nextFilterKey = getThreadFilterKey(filteredThreads);
  if (!options.keepWindow && nextFilterKey !== dmThreadFilterKey) {
    dmThreadVisibleCount = DM_THREAD_BATCH;
  }
  dmThreadFilterKey = nextFilterKey;
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

  if (dmThreadVisibleCount < DM_THREAD_BATCH) {
    dmThreadVisibleCount = DM_THREAD_BATCH;
  }
  const activeThreadIndex = filteredThreads.findIndex(
    (thread) => thread.partnerId === dmActivePartnerId
  );
  if (activeThreadIndex >= dmThreadVisibleCount) {
    dmThreadVisibleCount = activeThreadIndex + 1;
  }

  const visibleCount = Math.min(filteredThreads.length, dmThreadVisibleCount);
  filteredThreads
    .slice(0, visibleCount)
    .forEach((thread) => list.appendChild(renderThreadItem(thread, tr, searchQuery)));

  if (visibleCount < filteredThreads.length) {
    const loadMoreButton = document.createElement("button");
    loadMoreButton.type = "button";
    loadMoreButton.className = "dm-thread-load-more";
    loadMoreButton.setAttribute("data-dm-thread-load-more", "true");
    const remaining = filteredThreads.length - visibleCount;
    const loadMoreLabel = tr.dmLoadMoreThreads || "Load more";
    loadMoreButton.textContent = `${loadMoreLabel} (${remaining})`;
    list.appendChild(loadMoreButton);
  }

  if (options.preserveScroll) {
    list.scrollTop = prevScrollTop;
  }
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

function appendDmMessageNodes({
  list,
  message,
  index,
  messages,
  previousDayKey,
  currentUserId,
  lastSelfMessageId,
  tr,
}) {
  const dayKey = getDateKey(message.created_at);
  if (dayKey && dayKey !== previousDayKey) {
    const divider = document.createElement("div");
    divider.className = "dm-day-divider";
    divider.textContent = formatMessageDayLabel(message.created_at);
    list.appendChild(divider);
  }

  const row = document.createElement("div");
  row.className = "dm-message-row";
  const isMine = message.sender_id === currentUserId;
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
  const nextMessage = messages[index + 1];
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
  return dayKey || previousDayKey;
}

function renderConversationMessages(options = {}) {
  const list = $("dm-message-list");
  if (!list) return;
  const tr = getDmTranslations();
  const currentUser = getCurrentUser();
  const currentUserId = `${currentUser?.id || ""}`.trim();
  const shouldStickToBottom = !!options.forceBottom || isNearBottom(list);
  const nextMessageKeys = dmMessages.map((message, index) =>
    getDmMessageKey(message, index)
  );

  if (!dmActivePartnerId) {
    list.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    empty.textContent =
      tr.dmSelectPartner || "Select a partner to start chatting.";
    list.appendChild(empty);
    dmRenderedMessagePartnerId = "";
    dmRenderedMessageKeys = [];
    return;
  }

  if (!dmMessages.length) {
    list.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    empty.textContent =
      tr.dmNoMessages || "No messages yet. Send the first one.";
    list.appendChild(empty);
    dmRenderedMessagePartnerId = dmActivePartnerId;
    dmRenderedMessageKeys = [];
    return;
  }

  const canAppendIncrementally =
    !options.forceFull &&
    dmRenderedMessagePartnerId === dmActivePartnerId &&
    dmRenderedMessageKeys.length > 0 &&
    nextMessageKeys.length > dmRenderedMessageKeys.length &&
    dmRenderedMessageKeys.every((key, idx) => key === nextMessageKeys[idx]);

  let appendOnly = canAppendIncrementally;
  if (appendOnly) {
    const previousMessage = dmMessages[dmRenderedMessageKeys.length - 1];
    const firstNewMessage = dmMessages[dmRenderedMessageKeys.length];
    if (previousMessage && firstNewMessage) {
      const sameSender = previousMessage.sender_id === firstNewMessage.sender_id;
      const sameDay =
        getDateKey(previousMessage.created_at) === getDateKey(firstNewMessage.created_at);
      if (sameSender && sameDay) {
        appendOnly = false;
      }
    }
  }

  const lastSelfMessage = [...dmMessages]
    .reverse()
    .find((message) => message?.sender_id === currentUserId);
  const lastSelfMessageId = `${lastSelfMessage?.id || ""}`.trim();

  if (appendOnly) {
    let previousDayKey =
      getDateKey(dmMessages[dmRenderedMessageKeys.length - 1]?.created_at) || "";
    for (let index = dmRenderedMessageKeys.length; index < dmMessages.length; index += 1) {
      previousDayKey = appendDmMessageNodes({
        list,
        message: dmMessages[index],
        index,
        messages: dmMessages,
        previousDayKey,
        currentUserId,
        lastSelfMessageId,
        tr,
      });
    }
    if (shouldStickToBottom) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    }
    dmRenderedMessagePartnerId = dmActivePartnerId;
    dmRenderedMessageKeys = nextMessageKeys;
    return;
  }

  list.innerHTML = "";
  let previousDayKey = "";
  dmMessages.forEach((message, index) => {
    previousDayKey = appendDmMessageNodes({
      list,
      message,
      index,
      messages: dmMessages,
      previousDayKey,
      currentUserId,
      lastSelfMessageId,
      tr,
    });
  });

  if (shouldStickToBottom) {
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }
  dmRenderedMessagePartnerId = dmActivePartnerId;
  dmRenderedMessageKeys = nextMessageKeys;
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
    renderComposeList();
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
  const restoreBody = rawBody;

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
    const { data: inserted, error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: currentUser.id,
        recipient_id: partnerId,
        body,
      })
      .select("id,sender_id,recipient_id,body,created_at,read_at")
      .single();

    if (error) {
      console.error("handleSendMessage error:", error);
      dmMessages = dmMessages.filter((message) => `${message.id || ""}` !== pendingId);
      renderConversationMessages({ forceBottom: true });
      if (input) {
        input.value = restoreBody;
        autoResizeDmInput();
        updateDmInputCounter();
        input.focus();
      }
      setSendStatus(tr.dmSendError || "Failed to send message.", "error");
      return;
    }

    const confirmedMessage = inserted || {
      id: pendingId,
      sender_id: currentUser.id,
      recipient_id: partnerId,
      body,
      created_at: pendingCreatedAt,
      read_at: null,
    };
    dmMessages = dmMessages.map((message) =>
      `${message.id || ""}` === pendingId
        ? { ...confirmedMessage, pending: false }
        : message
    );
    const confirmedCreatedAt = confirmedMessage.created_at || pendingCreatedAt;
    upsertThreadAfterLocalSend(partnerId, body, confirmedCreatedAt);
    dmActivePartnerId = partnerId;
    renderThreadList({ keepWindow: true });
    renderComposeList();
    renderConversationHeader();
    renderConversationMessages({ forceBottom: true });
    renderThreadSummary();
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
  if (!dmComposeEscBound && typeof document !== "undefined") {
    dmComposeEscBound = true;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dmComposeOpen) {
        closeDmComposeModal();
      }
    });
  }

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
      selectDmPartner(nextPartnerId);
    });
  }

  const composeBtn = $("btn-dm-compose");
  if (composeBtn && composeBtn.dataset.bound !== "true") {
    composeBtn.dataset.bound = "true";
    composeBtn.addEventListener("click", openDmComposeModal);
  }

  const composeCloseBtn = $("btn-dm-compose-close");
  if (composeCloseBtn && composeCloseBtn.dataset.bound !== "true") {
    composeCloseBtn.dataset.bound = "true";
    composeCloseBtn.addEventListener("click", closeDmComposeModal);
  }

  const composeBackdropBtn = $("btn-dm-compose-backdrop");
  if (composeBackdropBtn && composeBackdropBtn.dataset.bound !== "true") {
    composeBackdropBtn.dataset.bound = "true";
    composeBackdropBtn.addEventListener("click", closeDmComposeModal);
  }

  const composeSearchInput = $("dm-compose-search");
  if (composeSearchInput && composeSearchInput.dataset.bound !== "true") {
    composeSearchInput.dataset.bound = "true";
    composeSearchInput.addEventListener("input", () => {
      dmComposeQuery = `${composeSearchInput.value || ""}`.trim();
      scheduleComposeSearchRender();
    });
  }

  const composeList = $("dm-compose-list");
  if (composeList && composeList.dataset.bound !== "true") {
    composeList.dataset.bound = "true";
    composeList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-dm-compose-id]");
      if (!button) return;
      const nextPartnerId = `${button.getAttribute("data-dm-compose-id") || ""}`.trim();
      if (!nextPartnerId) return;
      closeDmComposeModal();
      selectDmPartner(nextPartnerId);
    });
  }

  const threadList = $("dm-thread-list");
  if (threadList && threadList.dataset.bound !== "true") {
    threadList.dataset.bound = "true";
    threadList.addEventListener("click", (event) => {
      const loadMoreButton = event.target.closest("button[data-dm-thread-load-more]");
      if (loadMoreButton) {
        expandThreadListWindow({ preserveScroll: true });
        return;
      }
      const button = event.target.closest("button[data-dm-thread-id]");
      if (!button) return;
      const nextPartnerId = `${button.getAttribute("data-dm-thread-id") || ""}`.trim();
      if (!nextPartnerId) return;
      selectDmPartner(nextPartnerId);
    });
    threadList.addEventListener(
      "scroll",
      () => {
        const nearBottom =
          threadList.scrollTop + threadList.clientHeight >= threadList.scrollHeight - 24;
        if (nearBottom) {
          expandThreadListWindow({ preserveScroll: true });
        }
      },
      { passive: true }
    );
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
      scheduleThreadSearchRender();
    });
  }

  const clearSearchBtn = $("btn-dm-thread-search-clear");
  if (clearSearchBtn && clearSearchBtn.dataset.bound !== "true") {
    clearSearchBtn.dataset.bound = "true";
    clearSearchBtn.addEventListener("click", () => {
      dmThreadSearch = "";
      if (searchInput) searchInput.value = "";
      scheduleThreadSearchRender();
      if (searchInput) searchInput.focus();
    });
  }

  const input = $("dm-input");
  if (input && input.dataset.bound !== "true") {
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      scheduleDmInputMetricsUpdate();
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
  renderComposeList();
}

export function handleDmPageChange(page) {
  if (page === "messages") {
    startDmPolling();
    renderDmPage({ refreshIfNeeded: true });
    return;
  }
  closeDmComposeModal();
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
    closeDmComposeModal();
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
  renderComposeList();
  syncThreadSearchClearButton();
  updateDmInputCounter();
  autoResizeDmInput();

  if (options.refreshIfNeeded && !dmThreadsLoaded) {
    refreshDmData({ preservePartner: true }).catch((error) => {
      console.error("renderDmPage refresh failed:", error);
    });
  }
}
