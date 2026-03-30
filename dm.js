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
  openPublicProfile: () => {},
  openMediaViewer: null,
  setActivePage: () => {},
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
let dmThreadView = "all";
let dmMobileChatOpen = false;
let dmViewportListenerBound = false;
let dmThreadVisibleCount = 24;
let dmThreadFilterKey = "";
let dmComposeQuery = "";
let dmComposeOpen = false;
let dmComposeMode = "new";
let dmComposeSharePayload = null;
let dmComposeEscBound = false;
let dmThreadSearchRaf = 0;
let dmComposeSearchRaf = 0;
let dmInputMetricsRaf = 0;
let dmRenderedMessagePartnerId = "";
let dmRenderedMessageKeys = [];
let dmRenderedThreadListKey = "";
let dmRenderedConversationHeaderKey = "";
let dmPendingMediaFile = null;
let dmPendingMediaPreviewUrl = "";
let dmMediaSchemaState = "unknown";
let dmPinnedThreadIds = new Set();
let dmMutedThreadIds = new Set();
let dmPreferenceUserId = "";
let dmUnreadDividerMessageId = "";
let dmReplyTargetId = "";
let dmReactionPickerMessageId = "";
let dmRealtimeChannel = null;
let dmRealtimeChannelKey = "";
let dmTypingPartnerId = "";
let dmTypingClearTimer = null;
let dmLastTypingSentAt = 0;

const DM_POLL_INTERVAL_MS = 12000;
const DM_FETCH_LIMIT = 350;
const DM_MESSAGE_LIMIT = 250;
const DM_THREAD_BATCH = 24;
const DM_PINNED_THREADS_KEY = "trends_dm_pinned_threads_v1";
const DM_MUTED_THREADS_KEY = "trends_dm_muted_threads_v1";
const DM_MEDIA_ONLY_BODY = "__TRENDS_DM_MEDIA_ONLY__";
const DM_REPLY_PREFIX = "__TRENDS_DM_REPLY__";
const DM_REPLY_BODY_BREAK = "__TRENDS_DM_REPLY_BODY__";
const DM_REACTION_PREFIX = "__TRENDS_DM_REACTION__";
const DM_QUICK_LIKE_EMOJI = "❤️";
const DM_IMAGE_LIMIT_BYTES = 12 * 1024 * 1024;
const DM_ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const DM_MESSAGE_SELECT_BASE = "id,sender_id,recipient_id,body,created_at,read_at";
const DM_MESSAGE_SELECT_WITH_MEDIA =
  "id,sender_id,recipient_id,body,media_url,media_type,created_at,read_at";

export function setDmContext(next = {}) {
  dmContext = { ...dmContext, ...next };
}

const getCurrentUser = () => dmContext.getCurrentUser?.();
const getCurrentLang = () => dmContext.getCurrentLang?.() || "ja";
const getProfilesForUsers = (...args) =>
  dmContext.getProfilesForUsers?.(...args) || new Map();
const isMessagesPageActive = () => !!dmContext.isMessagesPageActive?.();
const openDmPartnerProfile = (...args) => dmContext.openPublicProfile?.(...args);
const openDmMediaViewer = (...args) => dmContext.openMediaViewer?.(...args);
const setActivePage = (...args) => dmContext.setActivePage?.(...args);

function getDmTranslations() {
  return t[getCurrentLang()] || t.ja;
}

function clearDmState() {
  cleanupDmRealtimeChannel();
  dmThreads = [];
  dmPartners = [];
  dmMessages = [];
  dmActivePartnerId = "";
  dmThreadsLoaded = false;
  dmThreadSearch = "";
  dmThreadView = "all";
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
  dmRenderedThreadListKey = "";
  dmRenderedConversationHeaderKey = "";
  dmMediaSchemaState = "unknown";
  dmUnreadDividerMessageId = "";
  dmReplyTargetId = "";
  dmReactionPickerMessageId = "";
  dmTypingPartnerId = "";
  dmLastTypingSentAt = 0;
  clearDmMediaSelection();
}

function getDmPreferenceStorageKey(baseKey) {
  const userId = `${getCurrentUser()?.id || ""}`.trim();
  if (!userId) return "";
  return `${baseKey}:${userId}`;
}

function readDmPreferenceSet(baseKey) {
  if (typeof window === "undefined") return new Set();
  const storageKey = getDmPreferenceStorageKey(baseKey);
  if (!storageKey) return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((value) => `${value || ""}`.trim()).filter(Boolean));
  } catch (error) {
    console.error("readDmPreferenceSet error:", error);
    return new Set();
  }
}

function writeDmPreferenceSet(baseKey, ids) {
  if (typeof window === "undefined") return;
  const storageKey = getDmPreferenceStorageKey(baseKey);
  if (!storageKey) return;
  try {
    const normalized = Array.from(ids || [])
      .map((value) => `${value || ""}`.trim())
      .filter(Boolean);
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  } catch (error) {
    console.error("writeDmPreferenceSet error:", error);
  }
}

function syncDmPreferenceSets(force = false) {
  const userId = `${getCurrentUser()?.id || ""}`.trim();
  if (!userId) {
    dmPreferenceUserId = "";
    dmPinnedThreadIds = new Set();
    dmMutedThreadIds = new Set();
    return;
  }
  if (!force && dmPreferenceUserId === userId) return;
  dmPreferenceUserId = userId;
  dmPinnedThreadIds = readDmPreferenceSet(DM_PINNED_THREADS_KEY);
  dmMutedThreadIds = readDmPreferenceSet(DM_MUTED_THREADS_KEY);
}

function persistDmPreferenceSets() {
  writeDmPreferenceSet(DM_PINNED_THREADS_KEY, dmPinnedThreadIds);
  writeDmPreferenceSet(DM_MUTED_THREADS_KEY, dmMutedThreadIds);
}

function isDmThreadPinned(partnerId) {
  return dmPinnedThreadIds.has(`${partnerId || ""}`.trim());
}

function isDmThreadMuted(partnerId) {
  return dmMutedThreadIds.has(`${partnerId || ""}`.trim());
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

function getProfileIdentity(profile, fallbackId = "") {
  const handleText = formatHandle(profile?.handle || "") || "";
  const displayName = `${profile?.display_name || ""}`.trim();
  const primary = displayName || handleText || `@${String(fallbackId || "user").slice(0, 8)}`;
  const secondary = displayName && handleText ? handleText : "";
  const initialSource = displayName || handleText || String(fallbackId || "user");
  const initial =
    initialSource.replace("@", "").trim().charAt(0).toUpperCase() || "U";
  return { primary, secondary, initial };
}

function formatDmFileSizeMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getDmSafeFileExtension(file) {
  const name = file?.name || "";
  const parts = name.split(".");
  const raw = parts.length > 1 ? `${parts.pop() || ""}`.toLowerCase() : "";
  if (raw && /^[a-z0-9]+$/.test(raw)) return raw;
  const fromType = (file?.type || "").split("/")[1] || "";
  const safe = fromType.toLowerCase().replace(/[^a-z0-9]/g, "");
  return safe || "bin";
}

function getDmImageValidationError(file) {
  if (!file) return null;
  const lang = getCurrentLang() === "en" ? "en" : "ja";
  if (!DM_ALLOWED_IMAGE_TYPES.has(file.type)) {
    return lang === "ja"
      ? "DMでは画像ファイル（jpg/png/webp/gif）を選択してください。"
      : "Please choose an image file (jpg/png/webp/gif) for DM.";
  }
  if (file.size > DM_IMAGE_LIMIT_BYTES) {
    return lang === "ja"
      ? `画像サイズが大きすぎます（上限 ${formatDmFileSizeMb(DM_IMAGE_LIMIT_BYTES)}）。`
      : `Image is too large (max ${formatDmFileSizeMb(DM_IMAGE_LIMIT_BYTES)}).`;
  }
  return null;
}

function isDmMediaOnlyBody(value) {
  return `${value || ""}`.trim() === DM_MEDIA_ONLY_BODY;
}

function getDmMessageDisplayBody(message) {
  const raw = `${message?.body || ""}`;
  if (isDmMediaOnlyBody(raw)) return "";
  return raw.trim();
}

function normalizeDmSnippet(value, maxLength = 92) {
  const normalized = `${value || ""}`
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildDmReplyMessage(payload = {}, body = "") {
  const targetId = `${payload.messageId || ""}`.trim();
  if (!targetId) return `${body || ""}`.trim();
  const snippet = normalizeDmSnippet(payload.snippet || "", 120);
  return [
    `${DM_REPLY_PREFIX}:${targetId}`,
    snippet,
    DM_REPLY_BODY_BREAK,
    `${body || ""}`.trim(),
  ]
    .filter((line, index) => index === 1 || line.length > 0)
    .join("\n");
}

function parseDmReplyMessage(message) {
  const raw = `${message?.body || ""}`.trim();
  if (!raw.startsWith(`${DM_REPLY_PREFIX}:`)) return null;
  const lines = raw.split("\n");
  const firstLine = `${lines.shift() || ""}`.trim();
  const targetId = firstLine.slice(`${DM_REPLY_PREFIX}:`.length).trim();
  if (!targetId) return null;
  const dividerIndex = lines.findIndex(
    (line) => `${line || ""}`.trim() === DM_REPLY_BODY_BREAK
  );
  if (dividerIndex < 0) return null;
  const snippet = normalizeDmSnippet(lines.slice(0, dividerIndex).join(" "));
  const body = lines.slice(dividerIndex + 1).join("\n").trim();
  return {
    targetId,
    snippet,
    body,
  };
}

function buildDmReactionMessage(payload = {}) {
  const targetId = `${payload.messageId || ""}`.trim();
  const emoji = `${payload.emoji || DM_QUICK_LIKE_EMOJI}`.trim();
  if (!targetId || !emoji) return "";
  return `${DM_REACTION_PREFIX}:${targetId}:${emoji}`;
}

function parseDmReactionMessage(message) {
  const raw = `${message?.body || ""}`.trim();
  if (!raw.startsWith(`${DM_REACTION_PREFIX}:`)) return null;
  const body = raw.slice(`${DM_REACTION_PREFIX}:`.length);
  const separatorIndex = body.indexOf(":");
  if (separatorIndex < 0) return null;
  const targetId = body.slice(0, separatorIndex).trim();
  const emoji = body.slice(separatorIndex + 1).trim();
  if (!targetId || !emoji) return null;
  return { targetId, emoji };
}

function getDmMessageSnippet(message, tr = getDmTranslations()) {
  const reactionPayload = parseDmReactionMessage(message);
  if (reactionPayload) {
    const template =
      tr.dmReactionSummary || t?.ja?.dmReactionSummary || "リアクション {emoji}";
    return template.replace("{emoji}", reactionPayload.emoji);
  }
  const replyPayload = parseDmReplyMessage(message);
  if (replyPayload) {
    const replyBody = getDmReplyMessageDisplayBody(replyPayload);
    return (
      normalizeDmSnippet(replyBody) ||
      normalizeDmSnippet(replyPayload.snippet) ||
      tr.dmReplyFallback ||
      "返信"
    );
  }
  const sharePayload = parseDmSharedPostMessage(message, tr);
  if (sharePayload) {
    return (
      normalizeDmSnippet(sharePayload.title) ||
      normalizeDmSnippet(sharePayload.note) ||
      normalizeDmSnippet(sharePayload.host) ||
      tr.dmSharedPostLead ||
      "Shared a post"
    );
  }
  if (getDmMessageHasImage(message)) {
    return tr.dmPhotoMessage || "Photo";
  }
  return normalizeDmSnippet(getDmMessageDisplayBody(message));
}

function getDmReplyMessageDisplayBody(replyPayload) {
  if (!replyPayload) return "";
  if (isDmMediaOnlyBody(replyPayload.body)) return "";
  return `${replyPayload.body || ""}`.trim();
}

function parseDmSharedPostMessage(message, tr = getDmTranslations()) {
  const body = getDmMessageDisplayBody(message);
  if (!body) return null;
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const leadCandidates = new Set(
    [
      tr.dmSharedPostLead,
      t?.ja?.dmSharedPostLead,
      t?.en?.dmSharedPostLead,
      "Shared a post",
      "投稿を共有しました",
    ]
      .map((value) => `${value || ""}`.trim())
      .filter(Boolean)
  );
  const lead = lines[0];
  const url = lines[lines.length - 1];
  if (!leadCandidates.has(lead)) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  const title = lines[1] || "";
  const note = lines.slice(2, -1).join("\n");
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  return {
    title: title || tr.dmSharePreviewFallback || "Trends post",
    note,
    url,
    host,
  };
}

function getDmMessageHasImage(message) {
  return (
    `${message?.media_type || ""}`.trim() === "image" &&
    `${message?.media_url || ""}`.trim().length > 0
  );
}

function isDmMediaColumnError(error) {
  const source = [
    error?.message || "",
    error?.details || "",
    error?.hint || "",
  ]
    .join(" ")
    .toLowerCase();
  return source.includes("media_url") || source.includes("media_type");
}

function normalizeDmMessageRows(rows = []) {
  return (rows || []).map((row) => ({
    ...row,
    media_url: `${row?.media_url || ""}`.trim(),
    media_type: `${row?.media_type || ""}`.trim() || null,
  }));
}

async function runDmMessageQuery(builderFactory) {
  const selectWithMedia =
    dmMediaSchemaState === "disabled" ? DM_MESSAGE_SELECT_BASE : DM_MESSAGE_SELECT_WITH_MEDIA;
  let result = await builderFactory(selectWithMedia);

  if (
    result?.error &&
    dmMediaSchemaState !== "disabled" &&
    isDmMediaColumnError(result.error)
  ) {
    dmMediaSchemaState = "disabled";
    result = await builderFactory(DM_MESSAGE_SELECT_BASE);
  } else if (!result?.error && dmMediaSchemaState === "unknown") {
    dmMediaSchemaState = "enabled";
  }

  if (!result?.error) {
    result = {
      ...result,
      data: normalizeDmMessageRows(result.data || []),
    };
  }
  return result;
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

function formatThreadTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tr = getDmTranslations();
  const lang = getCurrentLang();
  const locale = lang === "ja" ? "ja-JP" : "en-US";
  const today = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const valueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((todayStart - valueStart) / oneDay);
  if (diffDays <= 0) return formatMessageTimeOnly(date);
  if (diffDays === 1) return tr.dmYesterday || "Yesterday";
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
    }).format(date);
  }
  return formatDateDisplay(date);
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
  const mediaUrl = `${message?.media_url || ""}`.trim();
  return `pending:${sender}:${createdAt}:${length}:${mediaUrl.length}:${index}`;
}

function isNearBottom(el, threshold = 56) {
  if (!el) return true;
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remaining <= threshold;
}

function clearDmTypingState(options = {}) {
  if (dmTypingClearTimer && typeof window !== "undefined") {
    window.clearTimeout(dmTypingClearTimer);
  }
  dmTypingClearTimer = null;
  if (!options.force && !dmTypingPartnerId) return;
  dmTypingPartnerId = "";
  renderConversationHeader({ force: true });
}

function scheduleDmTypingClear(partnerId) {
  if (typeof window === "undefined") return;
  if (dmTypingClearTimer) {
    window.clearTimeout(dmTypingClearTimer);
  }
  dmTypingClearTimer = window.setTimeout(() => {
    if (`${partnerId || ""}`.trim() !== `${dmTypingPartnerId || ""}`.trim()) return;
    clearDmTypingState({ force: true });
  }, 3200);
}

function getDmRealtimeChannelName(currentUserId, partnerId) {
  const ids = [`${currentUserId || ""}`.trim(), `${partnerId || ""}`.trim()]
    .filter(Boolean)
    .sort();
  if (ids.length !== 2) return "";
  return `trends-dm:${ids.join(":")}`;
}

function cleanupDmRealtimeChannel() {
  clearDmTypingState({ force: true });
  if (!dmRealtimeChannel) {
    dmRealtimeChannelKey = "";
    return;
  }
  try {
    supabase.removeChannel(dmRealtimeChannel);
  } catch (error) {
    console.error("cleanupDmRealtimeChannel error:", error);
  }
  dmRealtimeChannel = null;
  dmRealtimeChannelKey = "";
}

function ensureDmRealtimeChannel(partnerId = dmActivePartnerId) {
  const currentUserId = `${getCurrentUser()?.id || ""}`.trim();
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!currentUserId || !targetPartnerId) {
    cleanupDmRealtimeChannel();
    return;
  }
  const nextKey = getDmRealtimeChannelName(currentUserId, targetPartnerId);
  if (!nextKey) {
    cleanupDmRealtimeChannel();
    return;
  }
  if (dmRealtimeChannel && dmRealtimeChannelKey === nextKey) return;

  cleanupDmRealtimeChannel();
  dmRealtimeChannelKey = nextKey;
  dmRealtimeChannel = supabase
    .channel(nextKey, {
      config: {
        broadcast: {
          self: false,
        },
      },
    })
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const from = `${payload?.from || ""}`.trim();
      const to = `${payload?.to || ""}`.trim();
      const isTyping = payload?.isTyping === true;
      if (
        from !== targetPartnerId ||
        to !== currentUserId ||
        targetPartnerId !== `${dmActivePartnerId || ""}`.trim()
      ) {
        return;
      }
      if (!isTyping) {
        clearDmTypingState({ force: true });
        return;
      }
      dmTypingPartnerId = targetPartnerId;
      renderConversationHeader({ force: true });
      scheduleDmTypingClear(targetPartnerId);
    })
    .subscribe();
}

async function sendDmTypingState(isTyping) {
  const currentUserId = `${getCurrentUser()?.id || ""}`.trim();
  const targetPartnerId = `${dmActivePartnerId || ""}`.trim();
  if (!currentUserId || !targetPartnerId) return;
  ensureDmRealtimeChannel(targetPartnerId);
  if (!dmRealtimeChannel) return;
  const now = Date.now();
  if (isTyping && now - dmLastTypingSentAt < 900) return;
  dmLastTypingSentAt = isTyping ? now : 0;
  try {
    await dmRealtimeChannel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        from: currentUserId,
        to: targetPartnerId,
        isTyping: !!isTyping,
        at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("sendDmTypingState error:", error);
  }
}

function syncDmJumpLatestButton() {
  const list = $("dm-message-list");
  const button = $("btn-dm-jump-latest");
  if (!list || !button) return;
  const shouldShow =
    !!dmActivePartnerId &&
    dmMessages.length > 0 &&
    !isNearBottom(list, 96);
  button.classList.toggle("hidden", !shouldShow);
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
  const shell = layout.closest(".dm-shell");
  const stackLayout = shouldUseDmStackLayout();
  const showChatPane = stackLayout && dmMobileChatOpen;
  layout.classList.toggle("dm-chat-open", showChatPane);
  if (shell) {
    shell.classList.toggle("is-chat-open", showChatPane);
  }
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
  const preview = normalizeDmSearchText(
    getDmMessageSnippet(
      {
        body: thread?.lastBody,
        media_url: thread?.lastMediaUrl,
        media_type: thread?.lastMediaType,
      },
      getDmTranslations()
    )
  );
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
  const pinnedBoost = isDmThreadPinned(thread?.partnerId) ? 20 : 0;
  return tokenScore + unreadBoost + pinnedBoost + getDmRecencyScore(thread?.lastAt);
}

function compareDmThreads(a, b) {
  const aPinned = isDmThreadPinned(a?.partnerId);
  const bPinned = isDmThreadPinned(b?.partnerId);
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  const aTime = new Date(a?.lastAt || 0).getTime();
  const bTime = new Date(b?.lastAt || 0).getTime();
  if (aTime !== bTime) return bTime - aTime;
  const aLabel = getProfileDisplay(a?.profile, a?.partnerId).toLowerCase();
  const bLabel = getProfileDisplay(b?.profile, b?.partnerId).toLowerCase();
  return aLabel.localeCompare(bLabel);
}

function getDmThreadViewLabel(view, tr = getDmTranslations()) {
  switch (`${view || "all"}`.trim()) {
    case "unread":
      return tr.dmFilterUnread || "Unread";
    case "pinned":
      return tr.dmFilterPinned || "Pinned";
    case "muted":
      return tr.dmFilterMuted || "Muted";
    default:
      return tr.dmFilterAll || "All";
  }
}

function getDmThreadUnitLabel(count, tr = getDmTranslations()) {
  const unit = tr.dmThreadSummaryThreadUnit || "chats";
  return getCurrentLang() === "ja" ? `${count}${unit}` : `${count} ${unit}`;
}

function matchesDmThreadView(thread, view = dmThreadView) {
  switch (`${view || "all"}`.trim()) {
    case "unread":
      return Number(thread?.unreadCount || 0) > 0;
    case "pinned":
      return isDmThreadPinned(thread?.partnerId);
    case "muted":
      return isDmThreadMuted(thread?.partnerId);
    default:
      return true;
  }
}

function getThreadViewCounts() {
  const counts = {
    all: dmThreads.length,
    unread: 0,
    pinned: 0,
    muted: 0,
  };
  dmThreads.forEach((thread) => {
    if (Number(thread?.unreadCount || 0) > 0) counts.unread += 1;
    if (isDmThreadPinned(thread?.partnerId)) counts.pinned += 1;
    if (isDmThreadMuted(thread?.partnerId)) counts.muted += 1;
  });
  return counts;
}

function ensureDmFilterButtonContent(button) {
  if (!(button instanceof HTMLButtonElement)) return { label: null, count: null };
  let label = button.querySelector(".dm-thread-filter-label");
  if (!label) {
    label = document.createElement("span");
    label.className = "dm-thread-filter-label";
    button.replaceChildren(label);
  }
  let count = button.querySelector(".dm-thread-filter-count");
  if (!count) {
    count = document.createElement("span");
    count.className = "dm-thread-filter-count";
    button.appendChild(count);
  }
  return { label, count };
}

function syncDmThreadFilterButtons() {
  const counts = getThreadViewCounts();
  const filters = [
    ["dm-filter-all", "all"],
    ["dm-filter-unread", "unread"],
    ["dm-filter-pinned", "pinned"],
    ["dm-filter-muted", "muted"],
  ];

  filters.forEach(([id, view]) => {
    const button = $(id);
    if (!(button instanceof HTMLButtonElement)) return;
    const { label, count } = ensureDmFilterButtonContent(button);
    if (label) label.textContent = getDmThreadViewLabel(view);
    if (count) count.textContent = `${counts[view] || 0}`;
    const isActive = dmThreadView === view;
    button.setAttribute("role", "tab");
    button.classList.toggle("chip-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  });
}

function getVisibleThreadsForCurrentView() {
  return [...dmThreads].sort(compareDmThreads).filter((thread) =>
    matchesDmThreadView(thread, dmThreadView)
  );
}

function getFilteredThreads() {
  const visibleThreads = getVisibleThreadsForCurrentView();
  const query = normalizeDmSearchText(dmThreadSearch);
  if (!query) return visibleThreads;
  return visibleThreads
    .map((thread) => ({ thread, score: scoreThreadForQuery(thread, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return compareDmThreads(a.thread, b.thread);
    })
    .map((row) => row.thread);
}

function renderThreadSummary() {
  const summary = $("dm-thread-summary");
  if (!summary) return;
  const tr = getDmTranslations();
  const filtered = getFilteredThreads();
  const hasSearch = normalizeDmSearchText(dmThreadSearch).length > 0;
  const isFilteredView = dmThreadView !== "all";
  let summaryText = "";
  if (hasSearch) {
    const base = getDmThreadUnitLabel(filtered.length, tr);
    summaryText = isFilteredView
      ? `${getDmThreadViewLabel(dmThreadView, tr)} · ${base}`
      : base;
  } else if (isFilteredView) {
    summaryText = `${getDmThreadViewLabel(dmThreadView, tr)} · ${getDmThreadUnitLabel(
      filtered.length,
      tr
    )}`;
  }
  summary.textContent = summaryText;
  summary.classList.toggle("is-empty", !summaryText);
}

function createDmThreadSectionLabel(text) {
  const label = document.createElement("div");
  label.className = "dm-thread-section-label";
  label.textContent = text;
  return label;
}

function toggleDmThreadPinned(partnerId) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!targetPartnerId) return;
  syncDmPreferenceSets();
  const tr = getDmTranslations();
  if (dmPinnedThreadIds.has(targetPartnerId)) {
    dmPinnedThreadIds.delete(targetPartnerId);
    showToast(tr.dmThreadUnpinned || "Removed from pinned.", "success");
  } else {
    dmPinnedThreadIds.add(targetPartnerId);
    showToast(tr.dmThreadPinned || "Pinned conversation.", "success");
  }
  persistDmPreferenceSets();
  dmRenderedThreadListKey = "";
  renderThreadList({ preserveScroll: true, forceFull: true, keepWindow: true });
  renderConversationHeader({ force: true });
}

function toggleDmThreadMuted(partnerId) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!targetPartnerId) return;
  syncDmPreferenceSets();
  const tr = getDmTranslations();
  if (dmMutedThreadIds.has(targetPartnerId)) {
    dmMutedThreadIds.delete(targetPartnerId);
    showToast(tr.dmThreadUnmuted || "Conversation unmuted.", "success");
  } else {
    dmMutedThreadIds.add(targetPartnerId);
    showToast(tr.dmThreadMuted || "Conversation muted.", "success");
  }
  persistDmPreferenceSets();
  dmRenderedThreadListKey = "";
  renderThreadList({ preserveScroll: true, forceFull: true, keepWindow: true });
  renderConversationHeader({ force: true });
}

function renderDmMediaPreview() {
  const preview = $("dm-media-preview");
  const image = $("dm-media-preview-image");
  const name = $("dm-media-preview-name");
  const label = $("dm-media-preview-label");
  if (!preview || !image || !name || !label) return;

  if (dmPendingMediaPreviewUrl) {
    image.src = dmPendingMediaPreviewUrl;
    image.alt = dmPendingMediaFile?.name || "DM image preview";
    name.textContent = dmPendingMediaFile?.name || "";
    label.textContent =
      getDmTranslations().dmSelectedPhoto || "Photo ready to send";
    preview.classList.remove("hidden");
    return;
  }

  image.removeAttribute("src");
  image.alt = "";
  name.textContent = "";
  label.textContent = "";
  preview.classList.add("hidden");
}

function clearDmMediaSelection() {
  const input = $("dm-media-input");
  if (input) {
    input.value = "";
  }
  if (dmPendingMediaPreviewUrl && typeof URL !== "undefined") {
    URL.revokeObjectURL(dmPendingMediaPreviewUrl);
  }
  dmPendingMediaPreviewUrl = "";
  dmPendingMediaFile = null;
  renderDmMediaPreview();
  updateDmComposerState();
}

function setDmPendingMediaFile(file) {
  if (dmPendingMediaPreviewUrl && typeof URL !== "undefined") {
    URL.revokeObjectURL(dmPendingMediaPreviewUrl);
    dmPendingMediaPreviewUrl = "";
  }
  dmPendingMediaFile = file || null;
  if (dmPendingMediaFile && typeof URL !== "undefined") {
    dmPendingMediaPreviewUrl = URL.createObjectURL(dmPendingMediaFile);
  }
  renderDmMediaPreview();
  updateDmComposerState();
}

function setDmMediaControlsDisabled(disabled) {
  const mediaBtn = $("btn-dm-media");
  const mediaInput = $("dm-media-input");
  const removeBtn = $("btn-dm-media-remove");
  if (mediaBtn) mediaBtn.disabled = !!disabled;
  if (mediaInput) mediaInput.disabled = !!disabled;
  if (removeBtn) removeBtn.disabled = !!disabled;
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
    updateDmComposerState();
    return;
  }
  if (dmInputMetricsRaf) {
    window.cancelAnimationFrame(dmInputMetricsRaf);
  }
  dmInputMetricsRaf = window.requestAnimationFrame(() => {
    dmInputMetricsRaf = 0;
    autoResizeDmInput();
    updateDmInputCounter();
    updateDmComposerState();
  });
}

function getDmComposerPlaceholder() {
  const tr = getDmTranslations();
  if (!getCurrentUser()) {
    return tr.dmLoginRequired || "Please log in to use DMs.";
  }
  if (!dmActivePartnerId) {
    return tr.dmComposerDisabledPlaceholder || tr.dmSelectPartner || "Select a conversation.";
  }
  return tr.dmInputPlaceholder || "Type a message";
}

function updateDmComposerState() {
  const currentUser = getCurrentUser();
  const input = $("dm-input");
  const sendBtn = $("btn-dm-send");
  const mediaBtn = $("btn-dm-media");
  const mediaInput = $("dm-media-input");
  const mediaRemoveBtn = $("btn-dm-media-remove");
  const form = $("dm-form");
  const isSending = !!sendBtn?.classList.contains("is-loading");
  const hasConversation = !!`${dmActivePartnerId || ""}`.trim();
  const canCompose = !!currentUser && hasConversation;
  const hasBody = !!`${input?.value || ""}`.trim();
  const hasMedia = !!dmPendingMediaFile;
  const canSend = canCompose && (hasBody || hasMedia);

  if (input) {
    input.disabled = isSending || !canCompose;
    input.placeholder = getDmComposerPlaceholder();
  }
  if (mediaBtn) {
    mediaBtn.disabled = isSending || !canCompose;
  }
  if (mediaInput) {
    mediaInput.disabled = isSending || !canCompose;
  }
  if (mediaRemoveBtn) {
    mediaRemoveBtn.disabled = isSending || !hasMedia;
  }
  if (sendBtn) {
    sendBtn.disabled = isSending || !canSend;
  }
  if (form) {
    form.classList.toggle("is-disabled", !canCompose);
    form.classList.toggle("has-media", hasMedia);
    form.classList.toggle("has-reply", !!dmReplyTargetId);
  }
}

function getDmMessageById(messageId) {
  const targetId = `${messageId || ""}`.trim();
  if (!targetId) return null;
  return dmMessages.find((message) => `${message?.id || ""}`.trim() === targetId) || null;
}

function getDmReplyAuthorLabel(message, tr = getDmTranslations()) {
  if (!message) return tr.dmReplyFallback || "Reply";
  const currentUserId = `${getCurrentUser()?.id || ""}`.trim();
  if (`${message.sender_id || ""}`.trim() === currentUserId) {
    return tr.dmYouPrefix || "You";
  }
  const partnerId = `${message.sender_id || ""}`.trim();
  const partner =
    dmPartners.find((item) => item.id === partnerId) ||
    dmThreads.find((item) => item.partnerId === partnerId);
  return getProfileIdentity(partner?.profile || null, partnerId).primary;
}

function renderDmReplyComposer() {
  const preview = $("dm-reply-preview");
  const title = $("dm-reply-title");
  const author = $("dm-reply-author");
  const text = $("dm-reply-text");
  const cancelBtn = $("btn-dm-reply-cancel");
  if (!preview) return;
  const tr = getDmTranslations();
  const targetMessage = getDmMessageById(dmReplyTargetId);
  if (!targetMessage) {
    dmReplyTargetId = "";
    preview.classList.add("hidden");
    if (title) title.textContent = "";
    if (author) author.textContent = "";
    if (text) text.textContent = "";
    if (cancelBtn) {
      cancelBtn.title = tr.dmCancelReply || "Cancel reply";
      cancelBtn.setAttribute("aria-label", tr.dmCancelReply || "Cancel reply");
    }
    return;
  }
  preview.classList.remove("hidden");
  if (title) title.textContent = tr.dmReplyingTo || "Replying to";
  if (author) author.textContent = getDmReplyAuthorLabel(targetMessage, tr);
  if (text) {
    text.textContent =
      getDmMessageSnippet(targetMessage, tr) ||
      tr.dmReplyFallback ||
      "Reply";
  }
  if (cancelBtn) {
    cancelBtn.title = tr.dmCancelReply || "Cancel reply";
    cancelBtn.setAttribute("aria-label", tr.dmCancelReply || "Cancel reply");
  }
}

function clearDmReplyTarget() {
  dmReplyTargetId = "";
  renderDmReplyComposer();
  updateDmComposerState();
}

function setDmReplyTarget(messageId, options = {}) {
  const targetMessage = getDmMessageById(messageId);
  if (!targetMessage || targetMessage.pending) return;
  const hadReactionPicker = !!dmReactionPickerMessageId;
  dmReactionPickerMessageId = "";
  dmReplyTargetId = `${messageId || ""}`.trim();
  renderDmReplyComposer();
  updateDmComposerState();
  if (hadReactionPicker) {
    renderConversationMessages({ forceFull: true });
  }
  if (options.focus !== false) {
    const input = $("dm-input");
    if (input instanceof HTMLTextAreaElement && !input.disabled) {
      input.focus();
      const nextLength = `${input.value || ""}`.length;
      input.setSelectionRange(nextLength, nextLength);
    }
  }
}

function scrollToDmMessage(messageId, options = {}) {
  const list = $("dm-message-list");
  const targetId = `${messageId || ""}`.trim();
  if (!list || !targetId) return false;
  const targetRow = Array.from(list.querySelectorAll(".dm-message-row")).find(
    (row) => `${row.getAttribute("data-dm-message-id") || ""}`.trim() === targetId
  );
  if (!targetRow) return false;
  targetRow.scrollIntoView({
    behavior: options.behavior || "smooth",
    block: options.block || "center",
  });
  targetRow.classList.add("is-highlighted");
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      targetRow.classList.remove("is-highlighted");
    }, 1200);
  }
  return true;
}

function buildDmReactionMap(messages = []) {
  const currentUserId = `${getCurrentUser()?.id || ""}`.trim();
  const reactionMap = new Map();
  (messages || []).forEach((message) => {
    const reactionPayload = parseDmReactionMessage(message);
    if (!reactionPayload?.targetId) return;
    const targetId = `${reactionPayload.targetId || ""}`.trim();
    if (!targetId) return;
    const list = reactionMap.get(targetId) || [];
    let entry = list.find((item) => item.emoji === reactionPayload.emoji);
    if (!entry) {
      entry = {
        emoji: reactionPayload.emoji,
        count: 0,
        fromCurrentUser: false,
      };
      list.push(entry);
      reactionMap.set(targetId, list);
    }
    entry.count += 1;
    if (`${message.sender_id || ""}`.trim() === currentUserId) {
      entry.fromCurrentUser = true;
    }
  });
  reactionMap.forEach((entries) => {
    entries.sort((a, b) => {
      if (a.fromCurrentUser !== b.fromCurrentUser) return a.fromCurrentUser ? -1 : 1;
      return b.count - a.count;
    });
  });
  return reactionMap;
}

function hasDmReactionFromCurrentUser(messageId, emoji = DM_QUICK_LIKE_EMOJI) {
  const targetId = `${messageId || ""}`.trim();
  const currentUserId = `${getCurrentUser()?.id || ""}`.trim();
  if (!targetId || !currentUserId) return false;
  return dmMessages.some((message) => {
    const reactionPayload = parseDmReactionMessage(message);
    if (!reactionPayload) return false;
    return (
      `${message.sender_id || ""}`.trim() === currentUserId &&
      `${reactionPayload.targetId || ""}`.trim() === targetId &&
      `${reactionPayload.emoji || ""}`.trim() === `${emoji || ""}`.trim()
    );
  });
}

function toggleDmReactionPicker(messageId) {
  const targetId = `${messageId || ""}`.trim();
  if (!targetId) return;
  dmReactionPickerMessageId =
    dmReactionPickerMessageId === targetId ? "" : targetId;
  renderConversationMessages({ forceFull: true });
}

function renderEmptyConversationState(list, activePartner, tr) {
  list.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "dm-conversation-empty";
  const identity = activePartner
    ? getProfileIdentity(activePartner.profile, activePartner.id)
    : { primary: tr.dmConversationIdle || "Select a conversation", secondary: "", initial: "U" };

  const top = document.createElement("div");
  top.className = "dm-conversation-empty-top";

  const avatar = document.createElement("div");
  avatar.className = "avatar dm-conversation-empty-avatar";
  renderAvatar(avatar, activePartner?.profile || null, identity.initial);
  top.appendChild(avatar);

  const copy = document.createElement("div");
  copy.className = "dm-conversation-empty-copy";

  const title = document.createElement("div");
  title.className = "dm-conversation-empty-title";
  title.textContent = activePartner
    ? identity.primary
    : tr.dmConversationIdle || "Select a conversation";
  copy.appendChild(title);

  if (identity.secondary) {
    const handle = document.createElement("div");
    handle.className = "dm-conversation-empty-handle";
    handle.textContent = identity.secondary;
    copy.appendChild(handle);
  }

  const hint = document.createElement("p");
  hint.className = "dm-conversation-empty-hint";
  hint.textContent = activePartner
    ? tr.dmConversationStartHint ||
      "Say hi, share a workout, or send a photo to start the conversation."
    : tr.dmSelectPartner || "Select a partner to start chatting.";
  copy.appendChild(hint);

  top.appendChild(copy);
  empty.appendChild(top);

  const actions = document.createElement("div");
  actions.className = "dm-conversation-empty-actions";

  if (activePartner) {
    const focusBtn = document.createElement("button");
    focusBtn.type = "button";
    focusBtn.className = "btn btn-primary btn-sm";
    focusBtn.setAttribute("data-dm-empty-action", "focus");
    focusBtn.textContent = tr.dmConversationStartAction || "Write a message";
    actions.appendChild(focusBtn);

    const profileBtn = document.createElement("button");
    profileBtn.type = "button";
    profileBtn.className = "btn btn-ghost btn-sm";
    profileBtn.setAttribute("data-dm-empty-action", "profile");
    profileBtn.textContent = tr.dmOpenProfile || "Open profile";
    actions.appendChild(profileBtn);

    const prompts = document.createElement("div");
    prompts.className = "dm-conversation-empty-prompts";
    [
      tr.dmConversationPromptWorkout || "今日のワークアウト送る？",
      tr.dmConversationPromptForm || "フォーム見てほしい",
      tr.dmConversationPromptPlan || "次のトレどうする？",
    ].forEach((prompt) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "dm-conversation-empty-prompt";
      chip.setAttribute("data-dm-empty-prompt", prompt);
      chip.textContent = prompt;
      prompts.appendChild(chip);
    });
    empty.appendChild(prompts);
  }

  if (actions.childNodes.length > 0) {
    empty.appendChild(actions);
  }

  list.appendChild(empty);
}

function upsertThreadAfterLocalSend(
  partnerId,
  body,
  createdAt,
  mediaUrl = "",
  mediaType = ""
) {
  if (!partnerId) return;
  const previewBody = `${body || ""}`.trim();
  const existing = dmThreads.find((thread) => thread.partnerId === partnerId);
  if (existing) {
    existing.lastBody = previewBody;
    existing.lastAt = createdAt;
    existing.lastFromMe = true;
    existing.lastMediaUrl = mediaUrl || "";
    existing.lastMediaType = mediaType || "";
  } else {
    const partner = dmPartners.find((item) => item.id === partnerId);
    dmThreads.unshift({
      partnerId,
      lastBody: previewBody,
      lastAt: createdAt,
      lastFromMe: true,
      lastMediaUrl: mediaUrl || "",
      lastMediaType: mediaType || "",
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
  dmComposeMode = "new";
  dmComposeSharePayload = null;
  setDmComposeOpen(false);
}

function normalizeDmSharePayload(payload = {}) {
  const url = `${payload.url || ""}`.trim();
  const title = `${payload.title || ""}`.trim();
  const text = `${payload.text || ""}`.trim();
  const postId = `${payload.postId || ""}`.trim();
  if (!url) return null;
  return {
    url,
    title,
    text,
    postId,
  };
}

function buildDmShareMessage(payload, tr = getDmTranslations()) {
  if (!payload?.url) return "";
  const lines = [tr.dmSharedPostLead || "Shared a post"];
  if (payload.title) {
    lines.push(payload.title);
  } else if (payload.text) {
    lines.push(payload.text.slice(0, 120));
  }
  lines.push(payload.url);
  return lines.filter(Boolean).join("\n");
}

function renderDmComposeChrome() {
  const tr = getDmTranslations();
  const titleEl = $("dm-compose-title");
  const subEl = $("dm-compose-sub");
  const previewEl = $("dm-compose-share-preview");
  const previewKickerEl = $("dm-compose-share-kicker");
  const previewTitleEl = $("dm-compose-share-title");
  const previewNoteEl = $("dm-compose-share-note");
  const copyBtn = $("btn-dm-compose-copy-link");
  const isShare = dmComposeMode === "share" && !!dmComposeSharePayload;
  if (titleEl) {
    titleEl.textContent = isShare
      ? tr.dmShareTitle || "Share to message"
      : tr.dmComposeTitle || "New message";
  }
  if (subEl) {
    subEl.textContent = isShare
      ? tr.dmShareSub || "Choose who to send this post to."
      : tr.dmComposeSub || tr.dmComposeStartHint || "Tap to start chatting";
  }
  if (previewEl) {
    previewEl.classList.toggle("hidden", !isShare);
  }
  if (previewKickerEl) {
    previewKickerEl.textContent = tr.dmShareKicker || "Share post";
  }
  if (previewTitleEl) {
    previewTitleEl.textContent =
      dmComposeSharePayload?.title ||
      dmComposeSharePayload?.text ||
      tr.dmSharePreviewFallback || "Trends post";
  }
  if (previewNoteEl) {
    previewNoteEl.textContent = isShare
      ? dmComposeSharePayload?.url || ""
      : tr.dmSharePreviewNote || "Send this post link in DM.";
  }
  if (copyBtn) {
    copyBtn.textContent = tr.dmCopyLink || "Copy link";
    copyBtn.classList.toggle("hidden", !isShare);
  }
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
    const identity = getProfileIdentity(partner.profile, partner.id);
    renderAvatar(avatar, partner.profile, identity.initial);

    const main = document.createElement("div");
    main.className = "dm-compose-item-main";

    const name = document.createElement("div");
    name.className = "dm-compose-item-name";
    applyHighlightedText(name, identity.primary, dmComposeQuery);

    const thread = threadByPartner.get(partner.id);
    const unread = Number(thread?.unreadCount || 0);
    const sub = document.createElement("div");
    sub.className = "dm-compose-item-sub";
    const subParts = [];
    if (identity.secondary) {
      subParts.push(identity.secondary);
    }
    if (unread > 0) {
      const unreadLabel = tr.dmThreadSummaryUnread || "unread";
      subParts.push(`${unread} ${unreadLabel}`);
    } else if (thread?.lastAt) {
      subParts.push(formatThreadTimestamp(thread.lastAt));
    } else {
      subParts.push(tr.dmComposeStartHint || "Tap to start chatting.");
    }
    sub.textContent = subParts.filter(Boolean).join(" · ");

    main.appendChild(name);
    main.appendChild(sub);
    button.appendChild(avatar);
    button.appendChild(main);
    list.appendChild(button);
  });
}

function sortDmPartners(partners = []) {
  const threadByPartner = new Map(dmThreads.map((thread) => [thread.partnerId, thread]));
  return [...partners].sort((a, b) => {
    const aHasThread = threadByPartner.has(a.id);
    const bHasThread = threadByPartner.has(b.id);
    if (aHasThread !== bHasThread) return aHasThread ? -1 : 1;
    const aThread = threadByPartner.get(a.id);
    const bThread = threadByPartner.get(b.id);
    const aTime = new Date(aThread?.lastAt || 0).getTime();
    const bTime = new Date(bThread?.lastAt || 0).getTime();
    if (aTime !== bTime) return bTime - aTime;
    const aLabel = getProfileDisplay(a.profile, a.id).toLowerCase();
    const bLabel = getProfileDisplay(b.profile, b.id).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}

async function waitForDmThreadsReady(timeoutMs = 5000) {
  if (typeof window === "undefined") return;
  const startedAt = Date.now();
  while (dmThreadsLoading && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
}

async function ensureDmThreadsReady() {
  if (dmThreadsLoaded) return;
  if (dmThreadsLoading) {
    await waitForDmThreadsReady();
    return;
  }
  await refreshDmData({ preservePartner: true });
}

async function ensureDmPartnerAvailable(partnerId, partnerProfile = null) {
  const normalizedPartnerId = `${partnerId || ""}`.trim();
  if (!normalizedPartnerId) return null;
  let partner =
    dmPartners.find((item) => item.id === normalizedPartnerId) || null;
  let profile = partner?.profile || partnerProfile || null;

  if (!profile) {
    const profilesMap = await getProfilesForUsers([normalizedPartnerId]);
    profile = profilesMap.get(normalizedPartnerId) || null;
  }

  if (!partner) {
    partner = {
      id: normalizedPartnerId,
      profile,
      hasThread: dmThreads.some((thread) => thread.partnerId === normalizedPartnerId),
    };
    dmPartners = sortDmPartners([...dmPartners, partner]);
  } else if (profile && partner.profile !== profile) {
    partner.profile = profile;
    dmPartners = dmPartners.map((item) =>
      item.id === normalizedPartnerId ? { ...item, profile } : item
    );
    partner = dmPartners.find((item) => item.id === normalizedPartnerId) || partner;
  }

  if (!dmThreads.some((thread) => thread.partnerId === normalizedPartnerId)) {
    dmThreads = [...dmThreads, {
      partnerId: normalizedPartnerId,
      lastBody: "",
      lastAt: "",
      lastFromMe: false,
      lastMediaUrl: "",
      lastMediaType: "",
      unreadCount: 0,
      profile,
    }].sort(compareDmThreads);
  } else if (profile) {
    dmThreads = dmThreads
      .map((thread) =>
        thread.partnerId === normalizedPartnerId ? { ...thread, profile } : thread
      )
      .sort(compareDmThreads);
  }

  return partner;
}

function openDmComposeModal(options = {}) {
  const currentUser = getCurrentUser();
  const tr = getDmTranslations();
  if (!currentUser) {
    showToast(tr.dmLoginRequired || "Please log in first.", "warning");
    return;
  }
  const requestedMode = options?.mode === "share" ? "share" : "new";
  const nextSharePayload =
    requestedMode === "share" ? normalizeDmSharePayload(options?.payload || {}) : null;
  if (requestedMode === "share" && !nextSharePayload) {
    showToast(tr.dmShareUnavailable || "Nothing to share yet.", "warning");
    return;
  }
  dmComposeMode = requestedMode;
  dmComposeSharePayload = nextSharePayload;
  dmComposeQuery = "";
  const input = $("dm-compose-search");
  if (input) input.value = "";
  renderComposeList();
  renderDmComposeChrome();
  setDmComposeOpen(true);
  requestAnimationFrame(() => {
    if (input) input.focus();
  });
}

export function openDmShareComposer(payload = {}) {
  openDmComposeModal({ mode: "share", payload });
}

export async function openDmConversation(partnerId, options = {}) {
  const currentUser = getCurrentUser();
  const tr = getDmTranslations();
  const normalizedPartnerId = `${partnerId || ""}`.trim();
  if (!currentUser) {
    showToast(tr.dmLoginRequired || "Please log in first.", "warning");
    return false;
  }
  if (!normalizedPartnerId) return false;
  if (normalizedPartnerId === `${currentUser.id || ""}`.trim()) {
    showToast(tr.dmCannotMessageSelf || "You can't message yourself.", "warning");
    return false;
  }

  setActivePage("messages");
  try {
    await ensureDmThreadsReady();
    await ensureDmPartnerAvailable(
      normalizedPartnerId,
      options.profile || null
    );
    selectDmPartner(normalizedPartnerId, {
      forceBottom: options.forceBottom !== false,
      openChat: options.openChat !== false,
    });
    renderDmPage();
    return true;
  } catch (error) {
    console.error("openDmConversation error:", error);
    showToast(
      tr.dmOpenConversationError || "Couldn't open the conversation.",
      "error"
    );
    return false;
  }
}

function getThreadFilterKey(filteredThreads) {
  const query = `${dmThreadSearch || ""}`.trim().toLowerCase();
  const firstPartnerId = filteredThreads[0]?.partnerId || "";
  const lastPartnerId = filteredThreads[filteredThreads.length - 1]?.partnerId || "";
  return `${dmThreadView}::${query}::${filteredThreads.length}::${firstPartnerId}::${lastPartnerId}`;
}

function getThreadPreviewState(thread) {
  const tr = getDmTranslations();
  const reactionPayload = parseDmReactionMessage({ body: thread?.lastBody });
  const replyPayload = parseDmReplyMessage({ body: thread?.lastBody });
  const sharePayload = parseDmSharedPostMessage({ body: thread?.lastBody }, tr);
  const text = `${getDmMessageDisplayBody({ body: thread?.lastBody }) || ""}`.trim();
  const hasPhoto = !!thread?.lastMediaUrl && thread?.lastMediaType === "image";
  if (reactionPayload) {
    return {
      kind: "reaction",
      kindLabel: reactionPayload.emoji,
      text: (tr.dmReactionSummary || "Reacted with {emoji}").replace(
        "{emoji}",
        reactionPayload.emoji
      ),
      fallbackText: reactionPayload.emoji,
    };
  }
  if (replyPayload) {
    const replyText =
      getDmReplyMessageDisplayBody(replyPayload) ||
      replyPayload.snippet ||
      tr.dmReplyFallback ||
      "Reply";
    return {
      kind: "reply",
      kindLabel: tr.dmReplyBadge || "Reply",
      text: replyText,
      fallbackText: replyText,
    };
  }
  if (hasPhoto) {
    return {
      kind: "photo",
      kindLabel: tr.dmPhotoMessage || "Photo",
      text,
      fallbackText: text || tr.dmPhotoMessage || "Photo",
    };
  }
  if (sharePayload) {
    return {
      kind: "share",
      kindLabel: tr.dmSharedPostBadge || "Post",
      text: sharePayload.title || sharePayload.note || sharePayload.host || "",
      fallbackText:
        sharePayload.title ||
        sharePayload.note ||
        sharePayload.host ||
        tr.dmSharedPostLead ||
        "Shared a post",
    };
  }
  return {
    kind: "",
    kindLabel: "",
    text,
    fallbackText: text || "…",
  };
}

function getThreadRenderSignature(thread, query = "", activePartnerId = "") {
  const previewState = getThreadPreviewState(thread);
  const previewBody = previewState.fallbackText;
  return [
    `${thread?.partnerId || ""}`.trim(),
    Number(thread?.unreadCount || 0),
    thread?.partnerId === activePartnerId ? 1 : 0,
    isDmThreadPinned(thread?.partnerId) ? 1 : 0,
    isDmThreadMuted(thread?.partnerId) ? 1 : 0,
    thread?.lastFromMe ? 1 : 0,
    `${thread?.lastAt || ""}`.trim(),
    `${thread?.lastMediaType || ""}`.trim(),
    `${previewState.kind || ""}`.trim(),
    `${previewBody.length}:${previewBody.slice(0, 48)}`,
    normalizeDmSearchText(query),
    dmThreadView,
  ].join("|");
}

function getThreadListRenderKey(filteredThreads, visibleCount, query = "", activePartnerId = "") {
  const normalizedQuery = normalizeDmSearchText(query);
  const signatures = filteredThreads
    .slice(0, visibleCount)
    .map((thread) => getThreadRenderSignature(thread, normalizedQuery, activePartnerId));
  const remaining = Math.max(0, filteredThreads.length - visibleCount);
  return `${dmThreadView}::${normalizedQuery}::${signatures.join("||")}::more:${remaining}`;
}

function updateThreadItem(button, thread, tr, query = "") {
  if (!(button instanceof HTMLButtonElement)) return;
  button.type = "button";
  button.className = "dm-thread-item";
  button.setAttribute("data-dm-thread-id", thread.partnerId);
  const isActive = thread.partnerId === dmActivePartnerId;
  const normalizedQuery = normalizeDmSearchText(query);
  const isPinned = isDmThreadPinned(thread.partnerId);
  const isMuted = isDmThreadMuted(thread.partnerId);
  button.classList.toggle("is-active", isActive);
  button.classList.toggle("is-unread", Number(thread.unreadCount || 0) > 0);
  button.classList.toggle("is-pinned", isPinned);
  button.classList.toggle("is-muted", isMuted);
  button.setAttribute("aria-pressed", isActive ? "true" : "false");

  let avatar = button.querySelector(".avatar");
  if (!avatar) {
    avatar = document.createElement("div");
    avatar.className = "avatar";
    button.appendChild(avatar);
  }
  const identity = getProfileIdentity(thread.profile, thread.partnerId);
  renderAvatar(avatar, thread.profile, identity.initial);
  button.title = [identity.primary, identity.secondary].filter(Boolean).join(" ");

  let body = button.querySelector(".dm-thread-main");
  if (!body) {
    body = document.createElement("div");
    body.className = "dm-thread-main";
    button.appendChild(body);
  }

  let top = body.querySelector(".dm-thread-top");
  if (!top) {
    top = document.createElement("div");
    top.className = "dm-thread-top";
    body.appendChild(top);
  }
  let identityWrap = top.querySelector(".dm-thread-identity");
  if (!identityWrap) {
    identityWrap = document.createElement("div");
    identityWrap.className = "dm-thread-identity";
    top.appendChild(identityWrap);
  }
  let name = identityWrap.querySelector(".dm-thread-name");
  if (!name) {
    name = document.createElement("div");
    name.className = "dm-thread-name";
    identityWrap.appendChild(name);
  }
  applyHighlightedText(name, identity.primary, query);

  let handle = identityWrap.querySelector(".dm-thread-handle");
  const primaryNormalized = `${identity.primary || ""}`
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  const secondaryNormalized = `${identity.secondary || ""}`
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  const showHandle =
    !!identity.secondary &&
    secondaryNormalized &&
    secondaryNormalized !== primaryNormalized &&
    !!normalizedQuery;
  if (showHandle) {
    if (!handle) {
      handle = document.createElement("div");
      handle.className = "dm-thread-handle";
      identityWrap.appendChild(handle);
    }
    applyHighlightedText(handle, identity.secondary, query);
  } else if (handle) {
    handle.remove();
  }

  let metaWrap = top.querySelector(".dm-thread-top-meta");
  if (!metaWrap) {
    metaWrap = document.createElement("div");
    metaWrap.className = "dm-thread-top-meta";
    top.appendChild(metaWrap);
  }

  let time = metaWrap.querySelector(".dm-thread-time");
  if (!time) {
    time = document.createElement("div");
    time.className = "dm-thread-time";
    metaWrap.appendChild(time);
  }
  time.textContent = formatThreadTimestamp(thread.lastAt);

  let flags = metaWrap.querySelector(".dm-thread-flags");
  if (!flags) {
    flags = document.createElement("div");
    flags.className = "dm-thread-flags";
    metaWrap.insertBefore(flags, time);
  }
  flags.textContent = "";
  if (isPinned) {
    const pinnedFlag = document.createElement("span");
    pinnedFlag.className = "dm-thread-flag is-pinned";
    pinnedFlag.textContent = tr.dmPinnedBadge || "Pinned";
    flags.appendChild(pinnedFlag);
  }
  if (isMuted) {
    const mutedFlag = document.createElement("span");
    mutedFlag.className = "dm-thread-flag is-muted";
    mutedFlag.textContent = tr.dmMutedBadge || "Muted";
    flags.appendChild(mutedFlag);
  }
  flags.classList.toggle("hidden", flags.childNodes.length === 0);

  let bottom = body.querySelector(".dm-thread-bottom");
  if (!bottom) {
    bottom = document.createElement("div");
    bottom.className = "dm-thread-bottom";
    body.appendChild(bottom);
  }

  let preview = bottom.querySelector(".dm-thread-preview");
  if (!preview) {
    preview = document.createElement("div");
    preview.className = "dm-thread-preview";
    bottom.appendChild(preview);
  }
  preview.textContent = "";
  preview.classList.toggle("has-kind", !!thread?.lastMediaUrl && thread?.lastMediaType === "image");
  const previewState = getThreadPreviewState(thread);
  const youPrefix = tr.dmYouPrefix || "You";
  if (thread.lastFromMe) {
    const prefix = document.createElement("span");
    prefix.className = "dm-preview-prefix";
    prefix.textContent = `${youPrefix}: `;
    preview.appendChild(prefix);
  }
  if (previewState.kind) {
    const previewKind = document.createElement("span");
    previewKind.className = `dm-thread-preview-pill is-${previewState.kind}`;
    previewKind.textContent = previewState.kindLabel;
    preview.appendChild(previewKind);
  }
  if (previewState.text || !previewState.kind) {
    const previewText = document.createElement("span");
    previewText.className = "dm-thread-preview-text";
    applyHighlightedText(previewText, previewState.text || previewState.fallbackText, query);
    preview.appendChild(previewText);
  }

  const unreadCount = Number(thread.unreadCount || 0);
  let badge = bottom.querySelector(".dm-thread-unread");
  if (unreadCount > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "dm-thread-unread";
      bottom.appendChild(badge);
    }
    badge.textContent = "";
    badge.setAttribute("aria-label", `${unreadCount}`);
    badge.title = `${unreadCount}`;
  } else if (badge) {
    badge.remove();
  }

  button.setAttribute(
    "data-dm-thread-signature",
    getThreadRenderSignature(thread, query, dmActivePartnerId)
  );
}

function renderThreadItem(thread, tr, query = "") {
  const button = document.createElement("button");
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  const body = document.createElement("div");
  body.className = "dm-thread-main";
  button.appendChild(avatar);
  button.appendChild(body);
  updateThreadItem(button, thread, tr, query);
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
  if (nextPartnerId !== dmActivePartnerId) {
    dmUnreadDividerMessageId = "";
    clearDmReplyTarget();
    dmReactionPickerMessageId = "";
  }
  if (dmComposeOpen) {
    closeDmComposeModal();
  }
  dmActivePartnerId = nextPartnerId;
  renderPartnerSelect();
  renderThreadList();
  renderConversationHeader();
  updateDmComposerState();
  ensureDmRealtimeChannel(nextPartnerId);
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
  syncDmThreadFilterButtons();
  if (!options.keepWindow && nextFilterKey !== dmThreadFilterKey) {
    dmThreadVisibleCount = DM_THREAD_BATCH;
  }
  dmThreadFilterKey = nextFilterKey;

  if (!dmThreads.length) {
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    empty.textContent = tr.dmThreadsEmpty || "No conversations yet.";
    list.replaceChildren(empty);
    dmRenderedThreadListKey = `empty-all::${normalizeDmSearchText(searchQuery)}::${dmThreads.length}`;
    renderThreadSummary();
    return;
  }

  if (!filteredThreads.length) {
    const empty = document.createElement("div");
    empty.className = "empty dm-empty-state";
    if (normalizeDmSearchText(searchQuery).length > 0) {
      empty.textContent = tr.dmNoThreadMatch || "No matching conversations found.";
    } else if (dmThreadView === "unread") {
      empty.textContent = tr.dmNoUnreadThreads || "No unread conversations.";
    } else if (dmThreadView === "pinned") {
      empty.textContent = tr.dmNoPinnedThreads || "No pinned conversations.";
    } else if (dmThreadView === "muted") {
      empty.textContent = tr.dmNoMutedThreads || "No muted conversations.";
    } else {
      empty.textContent = tr.dmNoThreadMatch || "No matching conversations found.";
    }
    list.replaceChildren(empty);
    dmRenderedThreadListKey = `empty-filter::${dmThreadView}::${normalizeDmSearchText(searchQuery)}::${dmThreads.length}`;
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
  const nextRenderKey = getThreadListRenderKey(
    filteredThreads,
    visibleCount,
    searchQuery,
    dmActivePartnerId
  );
  if (!options.forceFull && nextRenderKey === dmRenderedThreadListKey) {
    if (options.preserveScroll) {
      list.scrollTop = prevScrollTop;
    }
    renderThreadSummary();
    return;
  }

  const existingButtons = new Map();
  list
    .querySelectorAll("button.dm-thread-item[data-dm-thread-id]")
    .forEach((button) => {
      const partnerId = `${button.getAttribute("data-dm-thread-id") || ""}`.trim();
      if (partnerId) existingButtons.set(partnerId, button);
    });
  const fragment = document.createDocumentFragment();
  const visibleThreads = filteredThreads.slice(0, visibleCount);
  const appendThreadItems = (threads) => {
    threads.forEach((thread) => {
      const partnerId = `${thread.partnerId || ""}`.trim();
      const existingButton = existingButtons.get(partnerId);
      if (existingButton) {
        const nextSignature = getThreadRenderSignature(
          thread,
          searchQuery,
          dmActivePartnerId
        );
        if (existingButton.getAttribute("data-dm-thread-signature") !== nextSignature) {
          updateThreadItem(existingButton, thread, tr, searchQuery);
        }
        fragment.appendChild(existingButton);
        return;
      }
      fragment.appendChild(renderThreadItem(thread, tr, searchQuery));
    });
  };

  const hasSearch = normalizeDmSearchText(searchQuery).length > 0;
  if (!hasSearch && dmThreadView === "all") {
    const pinnedThreads = visibleThreads.filter((thread) => isDmThreadPinned(thread.partnerId));
    const regularThreads = visibleThreads.filter((thread) => !isDmThreadPinned(thread.partnerId));
    if (pinnedThreads.length) {
      fragment.appendChild(
        createDmThreadSectionLabel(tr.dmSectionPinned || "Pinned")
      );
      appendThreadItems(pinnedThreads);
    }
    if (regularThreads.length) {
      fragment.appendChild(
        createDmThreadSectionLabel(tr.dmSectionMessages || "Messages")
      );
      appendThreadItems(regularThreads);
    }
  } else {
    appendThreadItems(visibleThreads);
  }

  if (visibleCount < filteredThreads.length) {
    const existingLoadMore = list.querySelector("button[data-dm-thread-load-more]");
    const loadMoreButton =
      existingLoadMore instanceof HTMLButtonElement
        ? existingLoadMore
        : document.createElement("button");
    loadMoreButton.type = "button";
    loadMoreButton.className = "dm-thread-load-more";
    loadMoreButton.setAttribute("data-dm-thread-load-more", "true");
    const remaining = filteredThreads.length - visibleCount;
    const loadMoreLabel = tr.dmLoadMoreThreads || "Load more";
    loadMoreButton.textContent = `${loadMoreLabel} (${remaining})`;
    fragment.appendChild(loadMoreButton);
  }

  list.replaceChildren(fragment);
  dmRenderedThreadListKey = nextRenderKey;

  if (options.preserveScroll) {
    list.scrollTop = prevScrollTop;
  }
  renderThreadSummary();
}

function renderConversationHeader(options = {}) {
  const title = $("dm-chat-title");
  const sub = $("dm-chat-sub");
  const headerMain = $("dm-chat-header-main");
  const markReadBtn = $("btn-dm-mark-read");
  const pinBtn = $("btn-dm-pin");
  const muteBtn = $("btn-dm-mute");
  const avatar = $("dm-chat-avatar");
  if (!title) return;
  const tr = getDmTranslations();
  const force = !!options.force;
  const active = dmPartners.find((partner) => partner.id === dmActivePartnerId);
  const languageKey = getCurrentLang();
  let nextTitle = tr.dmConversationIdle || "Select a chat";
  let nextSub = tr.dmChatSubIdle || "Select a partner to start chatting.";
  let nextMarkReadDisabled = true;
  let nextPinHidden = true;
  let nextMuteHidden = true;
  let nextPinActive = false;
  let nextMuteActive = false;
  let avatarProfile = null;
  let avatarFallback = "U";
  let avatarIdle = true;

  if (active) {
    const identity = getProfileIdentity(active.profile, active.id);
    nextTitle = identity.primary;
    avatarProfile = active.profile || null;
    avatarFallback = identity.initial;
    avatarIdle = false;
    const activeThread = dmThreads.find(
      (thread) => thread.partnerId === dmActivePartnerId
    );
    const unread = Number(activeThread?.unreadCount || 0);
    const subParts = [];
    if (identity.secondary) {
      subParts.push(identity.secondary);
    }
    if (isDmThreadMuted(active.id)) {
      subParts.push(tr.dmMutedBadge || "Muted");
    }
    nextSub =
      dmTypingPartnerId === active.id
        ? tr.dmTyping || "Typing…"
        : subParts.filter(Boolean).join(" · ");
    nextMarkReadDisabled = unread <= 0;
    nextPinHidden = false;
    nextMuteHidden = false;
    nextPinActive = isDmThreadPinned(active.id);
    nextMuteActive = isDmThreadMuted(active.id);
  } else {
    nextSub = "";
    avatarFallback = "…";
  }

  const nextHeaderKey = [
    languageKey,
    `${dmActivePartnerId || ""}`.trim(),
    nextTitle,
    nextSub,
    nextMarkReadDisabled ? "1" : "0",
    nextPinHidden ? "1" : "0",
    nextMuteHidden ? "1" : "0",
    nextPinActive ? "1" : "0",
    nextMuteActive ? "1" : "0",
    avatarIdle ? "1" : "0",
    `${avatarProfile?.avatar_url || ""}`.trim(),
  ].join("::");
  if (!force && nextHeaderKey === dmRenderedConversationHeaderKey) {
    return;
  }

  title.textContent = nextTitle;
  if (sub) {
    sub.textContent = nextSub;
    sub.classList.toggle(
      "is-typing",
      !!active && dmTypingPartnerId === active.id
    );
  }
  if (avatar) {
    avatar.classList.toggle("is-idle", avatarIdle);
    renderAvatar(avatar, avatarProfile, avatarFallback);
  }
  if (headerMain) {
    const canOpenProfile = !!active;
    headerMain.classList.toggle("is-clickable", canOpenProfile);
    headerMain.setAttribute("role", canOpenProfile ? "button" : "group");
    headerMain.setAttribute("tabindex", canOpenProfile ? "0" : "-1");
    if (canOpenProfile) {
      headerMain.setAttribute(
        "aria-label",
        `${tr.dmOpenProfile || "Open profile"}: ${nextTitle}`
      );
    } else {
      headerMain.removeAttribute("aria-label");
    }
  }
  if (markReadBtn) {
    markReadBtn.disabled = nextMarkReadDisabled;
    markReadBtn.classList.toggle("hidden", nextMarkReadDisabled);
  }
  if (pinBtn) {
    pinBtn.disabled = nextPinHidden;
    pinBtn.classList.toggle("hidden", nextPinHidden);
    pinBtn.classList.toggle("is-active", nextPinActive);
    pinBtn.textContent = nextPinActive
      ? tr.dmUnpinThread || "Unpin"
      : tr.dmPinThread || "Pin";
  }
  if (muteBtn) {
    muteBtn.disabled = nextMuteHidden;
    muteBtn.classList.toggle("hidden", nextMuteHidden);
    muteBtn.classList.toggle("is-active", nextMuteActive);
    muteBtn.textContent = nextMuteActive
      ? tr.dmUnmuteThread || "Unmute"
      : tr.dmMuteThread || "Mute";
  }
  dmRenderedConversationHeaderKey = nextHeaderKey;
}

function appendDmMessageNodes({
  list,
  message,
  index,
  messages,
  previousDayKey,
  currentUserId,
  lastSelfMessageId,
  partnerProfile,
  reactionMap,
  messageIndexMap,
  tr,
}) {
  const dayKey = getDateKey(message.created_at);
  const reactionPayload = parseDmReactionMessage(message);
  const reactionTargetExists =
    !!reactionPayload &&
    messageIndexMap instanceof Map &&
    messageIndexMap.has(`${reactionPayload.targetId || ""}`.trim());
  if (reactionPayload && reactionTargetExists) {
    return dayKey || previousDayKey;
  }
  if (dayKey && dayKey !== previousDayKey) {
    const divider = document.createElement("div");
    divider.className = "dm-day-divider";
    divider.textContent = formatMessageDayLabel(message.created_at);
    list.appendChild(divider);
  }
  if (
    dmUnreadDividerMessageId &&
    !message.pending &&
    `${message.id || ""}`.trim() === dmUnreadDividerMessageId
  ) {
    const unreadDivider = document.createElement("div");
    unreadDivider.className = "dm-unread-divider";
    const lineStart = document.createElement("span");
    lineStart.className = "dm-unread-divider-line";
    unreadDivider.appendChild(lineStart);
    const label = document.createElement("span");
    label.className = "dm-unread-divider-label";
    label.textContent = tr.dmUnreadDivider || "Unread messages";
    unreadDivider.appendChild(label);
    const lineEnd = document.createElement("span");
    lineEnd.className = "dm-unread-divider-line";
    unreadDivider.appendChild(lineEnd);
    list.appendChild(unreadDivider);
  }

  const row = document.createElement("div");
  row.className = "dm-message-row";
  if (message?.id) {
    row.setAttribute("data-dm-message-id", `${message.id}`);
  }
  const isMine = message.sender_id === currentUserId;
  row.classList.add(isMine ? "is-self" : "is-other");
  const previousMessage = messages[index - 1];
  const nextMessage = messages[index + 1];
  const hasPrevSameSender =
    !!previousMessage &&
    previousMessage.sender_id === message.sender_id &&
    getDateKey(previousMessage.created_at) === dayKey;
  const hasNextSameSender =
    !!nextMessage &&
    nextMessage.sender_id === message.sender_id &&
    getDateKey(nextMessage.created_at) === dayKey;
  if (!hasPrevSameSender && !hasNextSameSender) {
    row.classList.add("is-group-single");
  } else if (!hasPrevSameSender) {
    row.classList.add("is-group-start");
  } else if (!hasNextSameSender) {
    row.classList.add("is-group-end");
  } else {
    row.classList.add("is-group-middle");
  }
  if (message.pending) {
    row.classList.add("is-pending");
  }

  const stack = document.createElement("div");
  stack.className = "dm-message-stack";

  const bubble = document.createElement("div");
  bubble.className = "dm-message-bubble";
  const replyPayload = parseDmReplyMessage(message);
  const messageText = reactionPayload
    ? (tr.dmReactionSummary || "Reacted with {emoji}").replace(
        "{emoji}",
        reactionPayload.emoji
      )
    : replyPayload
      ? getDmReplyMessageDisplayBody(replyPayload)
      : getDmMessageDisplayBody(message);
  const sharePayload = parseDmSharedPostMessage(message, tr);
  const hasImage = getDmMessageHasImage(message);
  bubble.classList.toggle("has-media", hasImage);
  bubble.classList.toggle("is-media-only", hasImage && !messageText && !sharePayload);
  bubble.classList.toggle("has-share", !!sharePayload);
  bubble.classList.toggle("has-reply", !!replyPayload);
  if (!message.pending && message?.id) {
    bubble.addEventListener("dblclick", async () => {
      if (hasDmReactionFromCurrentUser(message.id, DM_QUICK_LIKE_EMOJI)) return;
      await sendDmQuickReaction(message.id, DM_QUICK_LIKE_EMOJI);
    });
  }
  if (replyPayload) {
    const replyBox = document.createElement("button");
    replyBox.type = "button";
    replyBox.className = "dm-message-reply";
    replyBox.setAttribute("data-dm-scroll-target", replyPayload.targetId);
    replyBox.setAttribute("aria-label", tr.dmJumpToReply || "Jump to replied message");
    const targetMessage = getDmMessageById(replyPayload.targetId);
    const replySource = document.createElement("span");
    replySource.className = "dm-message-reply-source";
    replySource.textContent = getDmReplyAuthorLabel(targetMessage, tr);
    const replyText = document.createElement("span");
    replyText.className = "dm-message-reply-text";
    replyText.textContent =
      getDmMessageSnippet(targetMessage, tr) ||
      replyPayload.snippet ||
      tr.dmReplyFallback ||
      "Reply";
    replyBox.append(replySource, replyText);
    replyBox.addEventListener("click", () => {
      if (!scrollToDmMessage(replyPayload.targetId)) {
        showToast(tr.dmReplyJumpUnavailable || tr.dmReplyFallback || "Reply", "info");
      }
    });
    bubble.appendChild(replyBox);
  }
  if (hasImage) {
    const mediaButton = document.createElement("button");
    mediaButton.type = "button";
    mediaButton.className = "dm-message-media";
    mediaButton.setAttribute("aria-label", tr.dmOpenPhoto || "Open photo");
    mediaButton.addEventListener("click", () => {
      const mediaUrl = `${message.media_url || ""}`.trim();
      if (!mediaUrl) return;
      const openViewer = openDmMediaViewer();
      if (typeof openViewer === "function") {
        openViewer(mediaUrl, "image", {
          source: "dm",
          alt: messageText || tr.dmPhotoMessage || "Photo",
          caption: messageText || "",
          meta: formatDateTimeDisplay(message.created_at),
        });
        return;
      }
      if (typeof window !== "undefined") {
        window.open(mediaUrl, "_blank", "noopener,noreferrer");
      }
    });
    const image = document.createElement("img");
    image.src = message.media_url;
    image.alt = messageText || tr.dmPhotoMessage || "Photo";
    image.loading = "lazy";
    image.decoding = "async";
    mediaButton.appendChild(image);
    const mediaBadge = document.createElement("span");
    mediaBadge.className = "dm-message-media-badge";
    mediaBadge.textContent = tr.dmPhotoMessage || "Photo";
    mediaButton.appendChild(mediaBadge);
    bubble.appendChild(mediaButton);
  }
  if (sharePayload) {
    const shareCard = document.createElement("button");
    shareCard.type = "button";
    shareCard.className = "dm-message-share-card";
    shareCard.setAttribute("aria-label", tr.dmSharedPostOpen || "Open post");
    shareCard.addEventListener("click", () => {
      if (typeof window === "undefined" || !sharePayload.url) return;
      window.open(sharePayload.url, "_blank", "noopener,noreferrer");
    });

    const shareKicker = document.createElement("div");
    shareKicker.className = "dm-message-share-kicker";
    shareKicker.textContent = tr.dmSharedPostBadge || "Post";
    shareCard.appendChild(shareKicker);

    const shareTitle = document.createElement("div");
    shareTitle.className = "dm-message-share-title";
    shareTitle.textContent = sharePayload.title;
    shareCard.appendChild(shareTitle);

    if (sharePayload.note) {
      const shareNote = document.createElement("div");
      shareNote.className = "dm-message-share-note";
      shareNote.textContent = sharePayload.note;
      shareCard.appendChild(shareNote);
    }

    const shareMeta = document.createElement("div");
    shareMeta.className = "dm-message-share-meta";
    const host = document.createElement("span");
    host.textContent = sharePayload.host || sharePayload.url;
    shareMeta.appendChild(host);
    const cta = document.createElement("span");
    cta.className = "dm-message-share-cta";
    cta.textContent = tr.dmSharedPostOpen || "Open post";
    shareMeta.appendChild(cta);
    shareCard.appendChild(shareMeta);
    bubble.appendChild(shareCard);
  }
  if (messageText) {
    const text = document.createElement("div");
    text.className = "dm-message-text";
    text.textContent = sharePayload ? "" : messageText;
    if (text.textContent) {
      bubble.appendChild(text);
    }
  }

  stack.appendChild(bubble);

  const messageReactions = reactionMap?.get(`${message?.id || ""}`.trim()) || [];
  if (messageReactions.length > 0) {
    const reactions = document.createElement("div");
    reactions.className = "dm-message-reactions";
    messageReactions.forEach((entry) => {
      const chip = document.createElement("span");
      chip.className = "dm-message-reaction-chip";
      chip.classList.toggle("is-active", !!entry.fromCurrentUser);
      chip.textContent = entry.count > 1 ? `${entry.emoji} ${entry.count}` : entry.emoji;
      reactions.appendChild(chip);
    });
    stack.appendChild(reactions);
  }

  if (!message.pending && !reactionPayload) {
    const tools = document.createElement("div");
    tools.className = "dm-message-tools";

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "dm-message-tool";
    replyBtn.setAttribute("aria-label", tr.dmReplyAction || "Reply");
    replyBtn.textContent = tr.dmReplyAction || "Reply";
    replyBtn.addEventListener("click", () => {
      if (!message?.id) return;
      setDmReplyTarget(message.id);
      dmReactionPickerMessageId = "";
    });
    tools.appendChild(replyBtn);

    const reactBtn = document.createElement("button");
    reactBtn.type = "button";
    reactBtn.className = "dm-message-tool is-icon";
    reactBtn.setAttribute("aria-label", tr.dmReactAction || "React");
    reactBtn.setAttribute("title", tr.dmReactAction || "React");
    reactBtn.classList.toggle(
      "is-active",
      dmReactionPickerMessageId === `${message?.id || ""}`.trim()
    );
    reactBtn.textContent = "＋";
    reactBtn.addEventListener("click", () => {
      if (!message?.id) return;
      toggleDmReactionPicker(message.id);
    });
    tools.appendChild(reactBtn);

    const likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = "dm-message-tool is-icon";
    likeBtn.setAttribute("aria-label", tr.dmQuickLike || "Like");
    likeBtn.setAttribute("title", tr.dmQuickLike || "Like");
    const likedByMe = hasDmReactionFromCurrentUser(message?.id, DM_QUICK_LIKE_EMOJI);
    likeBtn.classList.toggle("is-active", likedByMe);
    likeBtn.textContent = DM_QUICK_LIKE_EMOJI;
    likeBtn.addEventListener("click", async () => {
      if (!message?.id) return;
      if (hasDmReactionFromCurrentUser(message.id, DM_QUICK_LIKE_EMOJI)) {
        showToast(tr.dmReactionExists || "Already reacted.", "info");
        return;
      }
      await sendDmQuickReaction(message.id, DM_QUICK_LIKE_EMOJI);
    });
    tools.appendChild(likeBtn);
    stack.appendChild(tools);

    if (dmReactionPickerMessageId === `${message?.id || ""}`.trim()) {
      const picker = document.createElement("div");
      picker.className = "dm-reaction-picker";
      ["❤️", "🔥", "💪", "👏"].forEach((emoji) => {
        const emojiBtn = document.createElement("button");
        emojiBtn.type = "button";
        emojiBtn.className = "dm-reaction-picker-btn";
        emojiBtn.textContent = emoji;
        emojiBtn.classList.toggle(
          "is-active",
          hasDmReactionFromCurrentUser(message.id, emoji)
        );
        emojiBtn.setAttribute(
          "aria-label",
          (tr.dmReactWith || "React with {emoji}").replace("{emoji}", emoji)
        );
        emojiBtn.addEventListener("click", async () => {
          if (!message?.id) return;
          if (hasDmReactionFromCurrentUser(message.id, emoji)) {
            showToast(tr.dmReactionExists || "Already reacted.", "info");
            return;
          }
          await sendDmQuickReaction(message.id, emoji);
        });
        picker.appendChild(emojiBtn);
      });
      stack.appendChild(picker);
    }
  }

  const meta = document.createElement("div");
  meta.className = "dm-message-meta";
  const messageTime = formatMessageTimeOnly(message.created_at);
  const shouldShowMeta = !hasNextSameSender || !!message.pending;
  const isLastSelf =
    isMine && lastSelfMessageId && `${message.id || ""}`.trim() === lastSelfMessageId;
  if (message.pending) {
    meta.classList.add("is-pending");
    const dot = document.createElement("span");
    dot.className = "dm-message-status-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = tr.dmSending || "Sending...";
    meta.append(dot, label);
  } else if (isLastSelf) {
    const stateTime = formatMessageTimeOnly(message.read_at || message.created_at);
    const stateLabel = message.read_at
      ? `${tr.dmSeen || "Seen"}${stateTime ? ` · ${stateTime}` : ""}`
      : `${tr.dmSent || "Sent"}${stateTime ? ` · ${stateTime}` : ""}`;
    meta.classList.add("is-status-only", message.read_at ? "is-seen" : "is-sent");
    meta.textContent = stateLabel;
  } else {
    meta.textContent = messageTime;
  }

  if (shouldShowMeta) {
    stack.appendChild(meta);
  } else {
    row.classList.add("is-grouped");
  }
  row.appendChild(stack);
  list.appendChild(row);
  return dayKey || previousDayKey;
}

function renderConversationMessages(options = {}) {
  const list = $("dm-message-list");
  if (!list) return;
  const tr = getDmTranslations();
  const currentUser = getCurrentUser();
  const currentUserId = `${currentUser?.id || ""}`.trim();
  const activePartner = dmPartners.find((partner) => partner.id === dmActivePartnerId);
  const activePartnerProfile = activePartner?.profile || null;
  const shouldStickToBottom = !!options.forceBottom || isNearBottom(list);
  const nextMessageKeys = dmMessages.map((message, index) =>
    getDmMessageKey(message, index)
  );
  const messageIndexMap = new Map(
    dmMessages
      .filter((message) => !parseDmReactionMessage(message))
      .map((message) => [`${message?.id || ""}`.trim(), message])
      .filter(([id]) => !!id)
  );
  const reactionMap = buildDmReactionMap(dmMessages);

  if (!dmActivePartnerId) {
    renderEmptyConversationState(list, null, tr);
    dmRenderedMessagePartnerId = "";
    dmRenderedMessageKeys = [];
    dmReactionPickerMessageId = "";
    syncDmJumpLatestButton();
    return;
  }

  if (!dmMessages.length) {
    renderEmptyConversationState(list, activePartner, tr);
    dmRenderedMessagePartnerId = dmActivePartnerId;
    dmRenderedMessageKeys = [];
    dmReactionPickerMessageId = "";
    syncDmJumpLatestButton();
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
    if (appendOnly) {
      const previousIds = new Set(
        dmMessages
          .slice(0, dmRenderedMessageKeys.length)
          .map((message) => `${message?.id || ""}`.trim())
          .filter(Boolean)
      );
      const hasReactionAttachment = dmMessages
        .slice(dmRenderedMessageKeys.length)
        .some((message) => {
          const reaction = parseDmReactionMessage(message);
          return reaction && previousIds.has(`${reaction.targetId || ""}`.trim());
        });
      if (hasReactionAttachment) {
        appendOnly = false;
      }
    }
  }

  const lastSelfMessage = [...dmMessages]
    .reverse()
    .find(
      (message) =>
        message?.sender_id === currentUserId && !parseDmReactionMessage(message)
    );
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
        partnerProfile: activePartnerProfile,
        reactionMap,
        messageIndexMap,
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
    syncDmJumpLatestButton();
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
      partnerProfile: activePartnerProfile,
      reactionMap,
      messageIndexMap,
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
  syncDmJumpLatestButton();
}

async function markConversationRead(partnerId) {
  const currentUser = getCurrentUser();
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!currentUser || !targetPartnerId) return false;
  const hasThreadUnread = dmThreads.some(
    (thread) => thread.partnerId === targetPartnerId && Number(thread.unreadCount || 0) > 0
  );
  const hasMessageUnread =
    targetPartnerId === dmActivePartnerId &&
    dmMessages.some(
      (message) =>
        message.sender_id === targetPartnerId &&
        message.recipient_id === currentUser.id &&
        !message.read_at
    );
  if (!hasThreadUnread && !hasMessageUnread) {
    renderConversationHeader();
    return true;
  }
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("direct_messages")
    .update({ read_at: nowIso })
    .eq("sender_id", targetPartnerId)
    .eq("recipient_id", currentUser.id)
    .is("read_at", null);

  if (error) {
    console.error("markConversationRead error:", error);
    return false;
  }

  dmThreads = dmThreads.map((thread) =>
    thread.partnerId === targetPartnerId
      ? { ...thread, unreadCount: 0 }
      : thread
  );
  if (targetPartnerId === dmActivePartnerId) {
    dmMessages = dmMessages.map((message) => {
      if (
        message.sender_id === targetPartnerId &&
        message.recipient_id === currentUser.id &&
        !message.read_at
      ) {
        return { ...message, read_at: nowIso };
      }
      return message;
    });
    renderConversationMessages({ forceFull: true });
  }
  renderThreadList({ keepWindow: true });
  renderComposeList();
  renderConversationHeader();
  return true;
}

async function loadConversation(partnerId, options = {}) {
  const currentUser = getCurrentUser();
  const tr = getDmTranslations();
  if (!currentUser || !partnerId || dmMessagesLoading) return;

  dmMessagesLoading = true;
  setSendStatus(tr.dmLoading || "Loading...", "loading");

  try {
    const pairFilter = `and(sender_id.eq.${currentUser.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${currentUser.id})`;
    const { data, error } = await runDmMessageQuery((selectFields) =>
      supabase
        .from("direct_messages")
        .select(selectFields)
        .or(pairFilter)
        .order("created_at", { ascending: true })
        .limit(DM_MESSAGE_LIMIT)
    );

    if (error) {
      console.error("loadConversation error:", error);
      setSendStatus(tr.dmLoadError || "Failed to load messages.", "error");
      return;
    }

    dmMessages = data || [];
    dmUnreadDividerMessageId =
      dmMessages.find(
        (message) =>
          message.sender_id === partnerId &&
          message.recipient_id === currentUser.id &&
          !message.read_at
      )?.id || "";
    renderDmReplyComposer();
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
  syncDmPreferenceSets();

  dmThreadsLoading = true;
  setThreadStatus(tr.dmLoading || "Loading...", "loading");

  try {
    const [messagesRes, connectedPartnerIds] = await Promise.all([
      runDmMessageQuery((selectFields) =>
        supabase
          .from("direct_messages")
          .select(selectFields)
          .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
          .order("created_at", { ascending: false })
          .limit(DM_FETCH_LIMIT)
      ),
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
          lastMediaUrl: `${row.media_url || ""}`.trim(),
          lastMediaType: `${row.media_type || ""}`.trim(),
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
      .sort(compareDmThreads);

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
  const replyTargetId = `${dmReplyTargetId || ""}`.trim();
  const replyTargetMessage = getDmMessageById(replyTargetId);
  const selectedMedia = dmPendingMediaFile;
  const mediaValidationError = getDmImageValidationError(selectedMedia);
  const hasMedia = !!selectedMedia;

  if (!currentUser) {
    showToast(tr.dmLoginRequired || "Please log in first.", "warning");
    return;
  }
  if (!partnerId) {
    showToast(tr.dmNoPartner || "Select a partner.", "warning");
    return;
  }
  if (mediaValidationError) {
    showToast(mediaValidationError, "warning");
    return;
  }
  if (hasMedia && dmMediaSchemaState === "disabled") {
    const setupMessage =
      tr.dmPhotoSetupNeeded ||
      "DM photo columns are not ready yet. Run the latest Supabase migration first.";
    showToast(setupMessage, "warning");
    setSendStatus(setupMessage, "warning");
    return;
  }
  if (!body && !hasMedia) {
    showToast(tr.dmEmptyMessage || "Enter a message.", "warning");
    return;
  }
  sendDmTypingState(false);
  const replySnippet = replyTargetMessage ? getDmMessageSnippet(replyTargetMessage, tr) : "";
  const baseBody = body || (hasMedia ? DM_MEDIA_ONLY_BODY : "");
  const storedBody =
    replyTargetMessage && replyTargetId
      ? buildDmReplyMessage(
          {
            messageId: replyTargetId,
            snippet: replySnippet,
          },
          baseBody
        )
      : baseBody;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.classList.add("is-loading");
  }
  setDmMediaControlsDisabled(true);
  const pendingId = `pending-${Date.now()}`;
  const pendingCreatedAt = new Date().toISOString();
  let uploadedPath = "";
  dmMessages = [
    ...dmMessages,
    {
      id: pendingId,
      sender_id: currentUser.id,
      recipient_id: partnerId,
      body: storedBody,
      media_url: hasMedia ? dmPendingMediaPreviewUrl : "",
      media_type: hasMedia ? "image" : null,
      created_at: pendingCreatedAt,
      read_at: null,
      pending: true,
    },
  ];
  upsertThreadAfterLocalSend(
    partnerId,
    storedBody,
    pendingCreatedAt,
    hasMedia ? dmPendingMediaPreviewUrl : "",
    hasMedia ? "image" : ""
  );
  renderThreadList();
  renderConversationHeader();
  renderConversationMessages({ forceBottom: true });
  if (input) {
    input.value = "";
    autoResizeDmInput();
  }
  updateDmInputCounter();
  updateDmComposerState();
  setSendStatus(
    hasMedia
      ? tr.dmUploadingPhoto || tr.dmSending || "Uploading photo..."
      : tr.dmSending || "Sending...",
    "loading"
  );
  try {
    let mediaUrl = "";
    let mediaType = null;
    if (selectedMedia) {
      const ext = getDmSafeFileExtension(selectedMedia);
      uploadedPath = `dm/${currentUser.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("post-media")
        .upload(uploadedPath, selectedMedia);

      if (uploadErr) {
        console.error("handleSendMessage upload error:", uploadErr);
        dmMessages = dmMessages.filter((message) => `${message.id || ""}` !== pendingId);
        renderConversationMessages({ forceBottom: true });
        refreshDmData({ preservePartner: true }).catch((refreshError) => {
          console.error("dm refresh after upload failure:", refreshError);
        });
        if (input) {
          input.value = restoreBody;
          autoResizeDmInput();
          updateDmInputCounter();
          updateDmComposerState();
          input.focus();
        }
        setSendStatus(uploadErr.message || tr.dmSendError || "Failed to send message.", "error");
        return;
      }

      const { data: publicData } = supabase.storage
        .from("post-media")
        .getPublicUrl(uploadedPath);
      mediaUrl = publicData?.publicUrl || "";
      mediaType = mediaUrl ? "image" : null;
    }

    const { data: inserted, error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: currentUser.id,
        recipient_id: partnerId,
        body: storedBody,
        media_url: mediaUrl || null,
        media_type: mediaType,
      })
      .select("id,sender_id,recipient_id,body,media_url,media_type,created_at,read_at")
      .single();

    if (error) {
      console.error("handleSendMessage error:", error);
      dmMessages = dmMessages.filter((message) => `${message.id || ""}` !== pendingId);
      if (isDmMediaColumnError(error)) {
        dmMediaSchemaState = "disabled";
      }
      if (uploadedPath) {
        supabase.storage
          .from("post-media")
          .remove([uploadedPath])
          .catch(() => {});
      }
      renderConversationMessages({ forceBottom: true });
      refreshDmData({ preservePartner: true }).catch((refreshError) => {
        console.error("dm refresh after send failure:", refreshError);
      });
      if (input) {
        input.value = restoreBody;
        autoResizeDmInput();
        updateDmInputCounter();
        updateDmComposerState();
        input.focus();
      }
      const fallbackError =
        hasMedia && isDmMediaColumnError(error)
          ? tr.dmPhotoSetupNeeded ||
            "DM photo columns are not ready yet. Run the latest Supabase migration first."
          : tr.dmSendError || "Failed to send message.";
      setSendStatus(fallbackError, "error");
      return;
    }

    const confirmedMessage = inserted || {
      id: pendingId,
      sender_id: currentUser.id,
      recipient_id: partnerId,
      body: storedBody,
      media_url: mediaUrl || "",
      media_type: mediaType,
      created_at: pendingCreatedAt,
      read_at: null,
    };
    dmMessages = dmMessages.map((message) =>
      `${message.id || ""}` === pendingId
        ? { ...confirmedMessage, pending: false }
        : message
    );
    const confirmedCreatedAt = confirmedMessage.created_at || pendingCreatedAt;
    upsertThreadAfterLocalSend(
      partnerId,
      storedBody,
      confirmedCreatedAt,
      confirmedMessage.media_url || "",
      confirmedMessage.media_type || ""
    );
    dmActivePartnerId = partnerId;
    clearDmReplyTarget();
    clearDmMediaSelection();
    renderThreadList({ keepWindow: true });
    renderComposeList();
    renderConversationHeader();
    renderConversationMessages({ forceBottom: true });
    renderThreadSummary();
    setSendStatus("", "");
  } finally {
    if (sendBtn) {
      sendBtn.classList.remove("is-loading");
    }
    setDmMediaControlsDisabled(false);
    updateDmComposerState();
  }
}

async function sendDmQuickReaction(messageId, emoji = DM_QUICK_LIKE_EMOJI) {
  const currentUser = getCurrentUser();
  const tr = getDmTranslations();
  const targetMessage = getDmMessageById(messageId);
  const targetMessageId = `${messageId || ""}`.trim();
  if (!currentUser || !dmActivePartnerId || !targetMessage || !targetMessageId) {
    return false;
  }
  const reactionBody = buildDmReactionMessage({
    messageId: targetMessageId,
    emoji,
  });
  if (!reactionBody) return false;

  const pendingId = `pending-reaction-${Date.now()}`;
  const pendingCreatedAt = new Date().toISOString();
  dmMessages = [
    ...dmMessages,
    {
      id: pendingId,
      sender_id: currentUser.id,
      recipient_id: dmActivePartnerId,
      body: reactionBody,
      media_url: "",
      media_type: null,
      created_at: pendingCreatedAt,
      read_at: null,
      pending: true,
    },
  ];
  upsertThreadAfterLocalSend(dmActivePartnerId, reactionBody, pendingCreatedAt, "", "");
  renderThreadList({ keepWindow: true });
  renderConversationHeader();
  renderConversationMessages({ forceBottom: false, forceFull: true });
  setSendStatus("", "");

  const { data: inserted, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: currentUser.id,
      recipient_id: dmActivePartnerId,
      body: reactionBody,
    })
    .select("id,sender_id,recipient_id,body,media_url,media_type,created_at,read_at")
    .single();

  if (error) {
    console.error("sendDmQuickReaction error:", error);
    dmMessages = dmMessages.filter((message) => `${message.id || ""}` !== pendingId);
    renderThreadList({ keepWindow: true });
    renderConversationMessages({ forceFull: true });
    setSendStatus(tr.dmSendError || "Failed to send message.", "error");
    return false;
  }

  dmReactionPickerMessageId = "";
  dmMessages = dmMessages.map((message) =>
    `${message.id || ""}` === pendingId ? { ...inserted, pending: false } : message
  );
  upsertThreadAfterLocalSend(
    dmActivePartnerId,
    reactionBody,
    inserted?.created_at || pendingCreatedAt,
    "",
    ""
  );
  renderThreadList({ keepWindow: true });
  renderConversationHeader();
  renderConversationMessages({ forceFull: true });
  setSendStatus(tr.dmReactionSent || "Reaction sent.", "success");
  if (typeof window !== "undefined") {
    window.setTimeout(() => setSendStatus("", ""), 900);
  }
  return true;
}

async function sendShareMessageToPartner(partnerId) {
  const currentUser = getCurrentUser();
  const tr = getDmTranslations();
  const targetPartnerId = `${partnerId || ""}`.trim();
  const payload = dmComposeSharePayload;
  if (!currentUser || !targetPartnerId || !payload?.url) {
    showToast(tr.dmShareUnavailable || "Nothing to share yet.", "warning");
    return;
  }

  const body = buildDmShareMessage(payload, tr);
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: currentUser.id,
      recipient_id: targetPartnerId,
      body,
    })
    .select("id,sender_id,recipient_id,body,media_url,media_type,created_at,read_at")
    .single();

  if (error) {
    console.error("sendShareMessageToPartner error:", error);
    showToast(tr.dmSendError || "Failed to send message.", "error");
    return;
  }

  dmActivePartnerId = targetPartnerId;
  setActivePage("messages");
  await refreshDmData({ preservePartner: true });
  renderConversationMessages({ forceBottom: true });
  closeDmComposeModal();
  showToast(tr.dmShareSent || "Shared in DM.", "success");
  return data;
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
    composeList.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-dm-compose-id]");
      if (!button) return;
      const nextPartnerId = `${button.getAttribute("data-dm-compose-id") || ""}`.trim();
      if (!nextPartnerId) return;
      if (dmComposeMode === "share" && dmComposeSharePayload) {
        await sendShareMessageToPartner(nextPartnerId);
        return;
      }
      closeDmComposeModal();
      selectDmPartner(nextPartnerId);
    });
  }

  const composeCopyBtn = $("btn-dm-compose-copy-link");
  if (composeCopyBtn && composeCopyBtn.dataset.bound !== "true") {
    composeCopyBtn.dataset.bound = "true";
    composeCopyBtn.addEventListener("click", async () => {
      const tr = getDmTranslations();
      const shareUrl = `${dmComposeSharePayload?.url || ""}`.trim();
      if (!shareUrl) return;
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === "function"
        ) {
          await navigator.clipboard.writeText(shareUrl);
          showToast(tr.feedLinkCopied || tr.dmCopyLink || "Link copied.", "success");
          return;
        }
      } catch (error) {
        console.error("copy share link failed", error);
      }
      showToast(shareUrl, "info");
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

  [
    ["dm-filter-all", "all"],
    ["dm-filter-unread", "unread"],
    ["dm-filter-pinned", "pinned"],
    ["dm-filter-muted", "muted"],
  ].forEach(([id, view]) => {
    const button = $(id);
    if (!(button instanceof HTMLButtonElement) || button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      if (dmThreadView === view) return;
      dmThreadView = view;
      dmRenderedThreadListKey = "";
      renderThreadList();
    });
  });

  const jumpLatestBtn = $("btn-dm-jump-latest");
  const messageList = $("dm-message-list");
  if (messageList && messageList.dataset.scrollBound !== "true") {
    messageList.dataset.scrollBound = "true";
    messageList.addEventListener(
      "scroll",
      () => {
        syncDmJumpLatestButton();
      },
      { passive: true }
    );
  }
  if (jumpLatestBtn && jumpLatestBtn.dataset.bound !== "true") {
    jumpLatestBtn.dataset.bound = "true";
    jumpLatestBtn.addEventListener("click", () => {
      if (!messageList) return;
      messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
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
      const marked = await markConversationRead(dmActivePartnerId);
      if (!marked) {
        setSendStatus(tr.dmMarkReadError || tr.dmLoadError || "Failed to mark read.", "error");
        return;
      }
      setSendStatus(tr.dmMarkedRead || "Marked as read.", "success");
      setTimeout(() => setSendStatus("", ""), 1200);
    });
  }

  const pinBtn = $("btn-dm-pin");
  if (pinBtn && pinBtn.dataset.bound !== "true") {
    pinBtn.dataset.bound = "true";
    pinBtn.addEventListener("click", () => {
      if (!dmActivePartnerId) return;
      toggleDmThreadPinned(dmActivePartnerId);
    });
  }

  const muteBtn = $("btn-dm-mute");
  if (muteBtn && muteBtn.dataset.bound !== "true") {
    muteBtn.dataset.bound = "true";
    muteBtn.addEventListener("click", () => {
      if (!dmActivePartnerId) return;
      toggleDmThreadMuted(dmActivePartnerId);
    });
  }

  const chatHeaderMain = $("dm-chat-header-main");
  if (chatHeaderMain && chatHeaderMain.dataset.bound !== "true") {
    chatHeaderMain.dataset.bound = "true";
    const openActiveProfile = () => {
      if (!dmActivePartnerId) return;
      openDmPartnerProfile(dmActivePartnerId);
    };
    chatHeaderMain.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openActiveProfile();
    });
    chatHeaderMain.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openActiveProfile();
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

  const mediaBtn = $("btn-dm-media");
  const mediaInput = $("dm-media-input");
  const mediaRemoveBtn = $("btn-dm-media-remove");
  const replyCancelBtn = $("btn-dm-reply-cancel");
  if (mediaBtn && mediaBtn.dataset.bound !== "true") {
    mediaBtn.dataset.bound = "true";
    mediaBtn.addEventListener("click", () => {
      if (mediaInput) mediaInput.click();
    });
  }
  if (mediaInput && mediaInput.dataset.bound !== "true") {
    mediaInput.dataset.bound = "true";
    mediaInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      const error = getDmImageValidationError(file);
      if (error) {
        showToast(error, "warning");
        clearDmMediaSelection();
        return;
      }
      setDmPendingMediaFile(file);
    });
  }
  if (mediaRemoveBtn && mediaRemoveBtn.dataset.bound !== "true") {
    mediaRemoveBtn.dataset.bound = "true";
    mediaRemoveBtn.addEventListener("click", () => {
      clearDmMediaSelection();
    });
  }
  if (replyCancelBtn && replyCancelBtn.dataset.bound !== "true") {
    replyCancelBtn.dataset.bound = "true";
    replyCancelBtn.addEventListener("click", () => {
      clearDmReplyTarget();
    });
  }

  const input = $("dm-input");
  if (input && input.dataset.bound !== "true") {
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      scheduleDmInputMetricsUpdate();
      const hasDraft = `${input.value || ""}`.trim().length > 0;
      sendDmTypingState(hasDraft);
    });
    input.addEventListener("blur", () => {
      sendDmTypingState(false);
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

  if (messageList && messageList.dataset.bound !== "true") {
    messageList.dataset.bound = "true";
    messageList.addEventListener("click", (event) => {
      if (
        dmReactionPickerMessageId &&
        !event.target.closest(".dm-reaction-picker") &&
        !event.target.closest(".dm-message-tool")
      ) {
        dmReactionPickerMessageId = "";
        renderConversationMessages({ forceFull: true });
      }
      const promptButton = event.target.closest("[data-dm-empty-prompt]");
      if (promptButton) {
        const prompt = `${promptButton.getAttribute("data-dm-empty-prompt") || ""}`.trim();
        const inputElement = $("dm-input");
        if (inputElement instanceof HTMLTextAreaElement && !inputElement.disabled) {
          inputElement.value = prompt;
          scheduleDmInputMetricsUpdate();
          inputElement.focus();
          inputElement.setSelectionRange(prompt.length, prompt.length);
        }
        return;
      }
      const button = event.target.closest("[data-dm-empty-action]");
      if (!button) return;
      const action = `${button.getAttribute("data-dm-empty-action") || ""}`.trim();
      if (action === "focus") {
        const inputElement = $("dm-input");
        if (inputElement instanceof HTMLTextAreaElement && !inputElement.disabled) {
          inputElement.focus();
        }
        return;
      }
      if (action === "profile" && dmActivePartnerId) {
        openDmPartnerProfile(dmActivePartnerId);
      }
    });
  }
  autoResizeDmInput();
  updateDmInputCounter();
  syncThreadSearchClearButton();
  syncDmThreadFilterButtons();
  renderThreadSummary();
  renderComposeList();
  renderDmComposeChrome();
  renderDmMediaPreview();
  renderDmReplyComposer();
  updateDmComposerState();
}

export function handleDmPageChange(page) {
  if (page === "messages") {
    startDmPolling();
    renderDmPage({ refreshIfNeeded: true });
    return;
  }
  closeDmComposeModal();
  cleanupDmRealtimeChannel();
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
  const mediaBtn = $("btn-dm-media");
  const mediaInput = $("dm-media-input");
  const mediaRemoveBtn = $("btn-dm-media-remove");
  const jumpLatestBtn = $("btn-dm-jump-latest");

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
    if (mediaBtn) mediaBtn.disabled = true;
    if (mediaInput) mediaInput.disabled = true;
    if (mediaRemoveBtn) mediaRemoveBtn.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (jumpLatestBtn) jumpLatestBtn.classList.add("hidden");
    renderDmReplyComposer();
    setThreadStatus("", "");
    setSendStatus("", "");
    return;
  }

  if (loginRequired) loginRequired.classList.add("hidden");
  syncDmPreferenceSets();
  ensureDmRealtimeChannel(dmActivePartnerId);
  if (layout) layout.classList.remove("hidden");
  if (partnerSelect) partnerSelect.disabled = false;
  if (threadSearchInput) {
    threadSearchInput.disabled = false;
    threadSearchInput.value = dmThreadSearch;
  }
  if (threadSearchClearBtn) {
    threadSearchClearBtn.disabled = false;
  }
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
  syncDmThreadFilterButtons();
  updateDmInputCounter();
  autoResizeDmInput();
  renderDmMediaPreview();
  renderDmReplyComposer();
  updateDmComposerState();
  syncDmJumpLatestButton();

  if (options.refreshIfNeeded && !dmThreadsLoaded) {
    refreshDmData({ preservePartner: true }).catch((error) => {
      console.error("renderDmPage refresh failed:", error);
    });
  }
}
