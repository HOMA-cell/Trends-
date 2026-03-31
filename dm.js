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
  openPostDetail: () => {},
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
let dmPinnedMessageIdsByPartner = {};
let dmDraftsByPartner = {};
let dmPreferenceUserId = "";
let dmUnreadDividerMessageId = "";
let dmReplyTargetId = "";
let dmReactionPickerMessageId = "";
let dmRealtimeChannel = null;
let dmRealtimeChannelKey = "";
let dmTypingPartnerId = "";
let dmTypingClearTimer = null;
let dmLastTypingSentAt = 0;
let dmActionSheetMessageId = "";
let dmMessagePressTimer = null;
let dmMessageSearchOpen = false;
let dmMessageSearchQuery = "";
let dmMessageSearchMatchIds = [];
let dmMessageSearchActiveIndex = -1;
let dmScrollPositionsByPartner = {};
let dmInfoPanelOpen = false;
let dmInfoTab = "overview";
let dmEntryContext = null;

const DM_POLL_INTERVAL_MS = 12000;
const DM_FETCH_LIMIT = 350;
const DM_MESSAGE_LIMIT = 250;
const DM_THREAD_BATCH = 24;
const DM_PINNED_THREADS_KEY = "trends_dm_pinned_threads_v1";
const DM_MUTED_THREADS_KEY = "trends_dm_muted_threads_v1";
const DM_PINNED_MESSAGES_KEY = "trends_dm_pinned_messages_v1";
const DM_DRAFTS_KEY = "trends_dm_drafts_v1";
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
const openDmPostDetail = (...args) => dmContext.openPostDetail?.(...args);
const setActivePage = (...args) => dmContext.setActivePage?.(...args);

function clearDmMessagePressTimer() {
  if (typeof window === "undefined" || !dmMessagePressTimer) return;
  window.clearTimeout(dmMessagePressTimer);
  dmMessagePressTimer = null;
}

function closeDmInfoPanel() {
  const panel = $("dm-info-panel");
  if (panel) {
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
  }
  if (typeof document !== "undefined") {
    document.body.classList.remove("dm-info-panel-open");
  }
  dmInfoPanelOpen = false;
}

function setDmMessageSearchOpen(next) {
  dmMessageSearchOpen = !!next;
  const wrap = $("dm-chat-search");
  if (wrap) {
    wrap.classList.toggle("hidden", !dmMessageSearchOpen);
  }
  const searchBtn = $("btn-dm-search");
  if (searchBtn) {
    searchBtn.classList.toggle("is-active", dmMessageSearchOpen);
  }
  if (!dmMessageSearchOpen) {
    dmMessageSearchQuery = "";
    dmMessageSearchMatchIds = [];
    dmMessageSearchActiveIndex = -1;
    const input = $("dm-message-search");
    if (input) input.value = "";
  }
}

function getDmTranslations() {
  return t[getCurrentLang()] || t.ja;
}

function formatDmExperience(value, tr) {
  if (!value) return "";
  const map = {
    beginner: tr.experienceBeginner || "Beginner",
    intermediate: tr.experienceIntermediate || "Intermediate",
    advanced: tr.experienceAdvanced || "Advanced",
    pro: tr.experiencePro || "Competitive",
  };
  return map[value] || value;
}

function getDmInfoFacts(profile, tr) {
  if (!profile) return [];
  const facts = [
    {
      label: tr.profileExperience || "Experience",
      value: formatDmExperience(profile.experience_level, tr),
    },
    { label: tr.profileGoal || "Goal", value: profile.training_goal },
    { label: tr.profileGym || "Gym", value: profile.gym },
    { label: tr.profileSplit || "Split", value: profile.training_split },
    {
      label: tr.profileFavoriteLifts || "Favorite lifts",
      value: profile.favorite_lifts,
    },
  ];
  return facts
    .map((item) => ({
      label: `${item.label || ""}`.trim(),
      value: `${item.value || ""}`.trim(),
    }))
    .filter((item) => item.label && item.value);
}

function clearDmState() {
  cleanupDmRealtimeChannel();
  closeDmActionSheet();
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
  dmPinnedMessageIdsByPartner = {};
  dmDraftsByPartner = {};
  dmTypingPartnerId = "";
  dmLastTypingSentAt = 0;
  dmMessageSearchOpen = false;
  dmMessageSearchQuery = "";
  dmMessageSearchMatchIds = [];
  dmMessageSearchActiveIndex = -1;
  dmScrollPositionsByPartner = {};
  dmInfoPanelOpen = false;
  dmInfoTab = "overview";
  dmEntryContext = null;
  clearDmMessagePressTimer();
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

function readDmPreferenceMap(baseKey) {
  if (typeof window === "undefined") return {};
  const storageKey = getDmPreferenceStorageKey(baseKey);
  if (!storageKey) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [`${key || ""}`.trim(), `${value || ""}`.trim()])
        .filter(([key, value]) => key && value)
    );
  } catch (error) {
    console.error("readDmPreferenceMap error:", error);
    return {};
  }
}

function writeDmPreferenceMap(baseKey, record) {
  if (typeof window === "undefined") return;
  const storageKey = getDmPreferenceStorageKey(baseKey);
  if (!storageKey) return;
  try {
    const normalized = Object.fromEntries(
      Object.entries(record || {})
        .map(([key, value]) => [`${key || ""}`.trim(), `${value || ""}`.trim()])
        .filter(([key, value]) => key && value)
    );
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  } catch (error) {
    console.error("writeDmPreferenceMap error:", error);
  }
}

function normalizeDmDraftRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = `${value.body || ""}`.slice(0, 600);
  const updatedAt = `${value.updatedAt || ""}`.trim();
  if (!body.trim()) return null;
  return {
    body,
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

function readDmDraftMap(baseKey) {
  if (typeof window === "undefined") return {};
  const storageKey = getDmPreferenceStorageKey(baseKey);
  if (!storageKey) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [`${key || ""}`.trim(), normalizeDmDraftRecord(value)])
        .filter(([key, value]) => key && value)
    );
  } catch (error) {
    console.error("readDmDraftMap error:", error);
    return {};
  }
}

function writeDmDraftMap(baseKey, record) {
  if (typeof window === "undefined") return;
  const storageKey = getDmPreferenceStorageKey(baseKey);
  if (!storageKey) return;
  try {
    const normalized = Object.fromEntries(
      Object.entries(record || {})
        .map(([key, value]) => [`${key || ""}`.trim(), normalizeDmDraftRecord(value)])
        .filter(([key, value]) => key && value)
    );
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  } catch (error) {
    console.error("writeDmDraftMap error:", error);
  }
}

function syncDmPreferenceSets(force = false) {
  const userId = `${getCurrentUser()?.id || ""}`.trim();
  if (!userId) {
    dmPreferenceUserId = "";
    dmPinnedThreadIds = new Set();
    dmMutedThreadIds = new Set();
    dmPinnedMessageIdsByPartner = {};
    dmDraftsByPartner = {};
    return;
  }
  if (!force && dmPreferenceUserId === userId) return;
  dmPreferenceUserId = userId;
  dmPinnedThreadIds = readDmPreferenceSet(DM_PINNED_THREADS_KEY);
  dmMutedThreadIds = readDmPreferenceSet(DM_MUTED_THREADS_KEY);
  dmPinnedMessageIdsByPartner = readDmPreferenceMap(DM_PINNED_MESSAGES_KEY);
  dmDraftsByPartner = readDmDraftMap(DM_DRAFTS_KEY);
}

function persistDmPreferenceSets() {
  writeDmPreferenceSet(DM_PINNED_THREADS_KEY, dmPinnedThreadIds);
  writeDmPreferenceSet(DM_MUTED_THREADS_KEY, dmMutedThreadIds);
  writeDmPreferenceMap(DM_PINNED_MESSAGES_KEY, dmPinnedMessageIdsByPartner);
  writeDmDraftMap(DM_DRAFTS_KEY, dmDraftsByPartner);
}

function isDmThreadPinned(partnerId) {
  return dmPinnedThreadIds.has(`${partnerId || ""}`.trim());
}

function isDmThreadMuted(partnerId) {
  return dmMutedThreadIds.has(`${partnerId || ""}`.trim());
}

function getDmPinnedMessageId(partnerId = dmActivePartnerId) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!targetPartnerId) return "";
  return `${dmPinnedMessageIdsByPartner?.[targetPartnerId] || ""}`.trim();
}

function getDmPinnedMessage(partnerId = dmActivePartnerId) {
  const messageId = getDmPinnedMessageId(partnerId);
  if (!messageId) return null;
  const message = getDmMessageById(messageId);
  if (message) return message;
  if (dmPinnedMessageIdsByPartner?.[partnerId]) {
    delete dmPinnedMessageIdsByPartner[partnerId];
    persistDmPreferenceSets();
  }
  return null;
}

function setDmPinnedMessage(partnerId, messageId) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  const targetMessageId = `${messageId || ""}`.trim();
  if (!targetPartnerId || !targetMessageId) return;
  syncDmPreferenceSets();
  dmPinnedMessageIdsByPartner[targetPartnerId] = targetMessageId;
  persistDmPreferenceSets();
}

function clearDmPinnedMessage(partnerId) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!targetPartnerId || !dmPinnedMessageIdsByPartner?.[targetPartnerId]) return false;
  delete dmPinnedMessageIdsByPartner[targetPartnerId];
  persistDmPreferenceSets();
  return true;
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
  const sharePayload = parseDmLinkedMessage(message, tr);
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
    kind: "post",
    title: title || tr.dmSharePreviewFallback || "Trends post",
    note,
    url,
    host,
    postId: extractDmPostIdFromUrl(url),
  };
}

function extractFirstDmUrl(text = "") {
  const match = `${text || ""}`.match(/https?:\/\/[^\s]+/i);
  return match ? `${match[0] || ""}`.trim() : "";
}

function extractDmPostIdFromUrl(url = "") {
  const value = `${url || ""}`.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    const direct = `${parsed.searchParams.get("post") || ""}`.trim();
    if (direct) return direct;
    const hash = `${parsed.hash || ""}`.replace(/^#/, "");
    if (!hash) return "";
    const hashParams = new URLSearchParams(hash);
    const hashPost = `${hashParams.get("post") || ""}`.trim();
    if (hashPost) return hashPost;
    const hashMatch = hash.match(/(?:^|&)post=([^&]+)/);
    return hashMatch ? decodeURIComponent(hashMatch[1] || "").trim() : "";
  } catch {
    const fallbackMatch = value.match(/[#?&]post=([^&#]+)/i);
    return fallbackMatch ? decodeURIComponent(fallbackMatch[1] || "").trim() : "";
  }
}

function parseDmLinkedMessage(message, tr = getDmTranslations()) {
  const shared = parseDmSharedPostMessage(message, tr);
  if (shared) return shared;
  const body = getDmMessageDisplayBody(message);
  if (!body) return null;
  const url = extractFirstDmUrl(body);
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== url);
  const title = lines[0] || host || tr.dmCopyLink || "Link";
  const note = lines.slice(1).join("\n");
  return {
    kind: "link",
    title,
    note,
    url,
    host,
  };
}

function getDmSharePayloadPostId(payload) {
  if (!payload) return "";
  const explicit = `${payload.postId || ""}`.trim();
  if (explicit) return explicit;
  return extractDmPostIdFromUrl(payload.url);
}

function openDmSharedPayload(payload) {
  if (!payload?.url) return false;
  const postId = payload.kind === "post" ? getDmSharePayloadPostId(payload) : "";
  if (postId) {
    closeDmInfoPanel();
    setActivePage("feed");
    openDmPostDetail(postId);
    return true;
  }
  if (typeof window !== "undefined") {
    window.open(payload.url, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

function getDmMessageHasImage(message) {
  return (
    `${message?.media_type || ""}`.trim() === "image" &&
    `${message?.media_url || ""}`.trim().length > 0
  );
}

function getDmSearchableMessageText(message, tr = getDmTranslations()) {
  if (!message) return "";
  const parts = [];
  const replyPayload = parseDmReplyMessage(message);
  const reactionPayload = parseDmReactionMessage(message);
  const sharePayload = parseDmLinkedMessage(message, tr);
  const bodyText = getDmMessageDisplayBody(message);
  if (replyPayload) {
    parts.push(getDmReplyMessageDisplayBody(replyPayload));
    parts.push(replyPayload.snippet);
  }
  if (reactionPayload) {
    parts.push(reactionPayload.emoji);
    parts.push((tr.dmReactionSummary || "Reacted with {emoji}").replace("{emoji}", reactionPayload.emoji));
  }
  if (sharePayload) {
    parts.push(sharePayload.title, sharePayload.note, sharePayload.url, sharePayload.host);
  }
  if (getDmMessageHasImage(message)) {
    parts.push(tr.dmPhotoMessage || "Photo");
  }
  parts.push(bodyText);
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDmConversationMediaMessages(limit = 6) {
  return [...dmMessages]
    .filter((message) => !message?.pending && getDmMessageHasImage(message))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, limit);
}

function getDmConversationShareCount() {
  return dmMessages.filter((message) => !!parseDmLinkedMessage(message)).length;
}

function getDmConversationSharedItems(limit = 8) {
  const items = [];
  const seen = new Set();
  [...dmMessages]
    .filter((message) => !message?.pending)
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )
    .forEach((message) => {
      const payload = parseDmLinkedMessage(message);
      if (!payload?.url) return;
      const key = `${payload.kind || "link"}::${payload.url}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        ...payload,
        messageId: `${message?.id || ""}`.trim(),
        createdAt: message?.created_at || "",
      });
    });
  return items.slice(0, limit);
}

function getDmConversationSharedPosts(limit = 6) {
  return getDmConversationSharedItems(limit * 3)
    .filter((item) => item.kind === "post")
    .slice(0, limit);
}

function getDmConversationSharedLinks(limit = 6) {
  return getDmConversationSharedItems(limit * 3)
    .filter((item) => item.kind !== "post")
    .slice(0, limit);
}

function getDmPresenceThreads(limit = 8) {
  if (normalizeDmSearchText(dmThreadSearch).length > 0) return [];
  if (`${dmThreadView || "all"}`.trim() !== "all") return [];
  return [...dmThreads]
    .filter((thread) => {
      const presence = getDmPartnerPresence(thread?.partnerId);
      return presence.kind === "active" || presence.kind === "recent";
    })
    .sort((a, b) => {
      const aPresence = getDmPartnerPresence(a?.partnerId);
      const bPresence = getDmPartnerPresence(b?.partnerId);
      if (aPresence.kind !== bPresence.kind) {
        return aPresence.kind === "active" ? -1 : 1;
      }
      return compareDmThreads(a, b);
    })
    .slice(0, limit);
}

function openDmMediaMessage(message) {
  const mediaUrl = `${message?.media_url || ""}`.trim();
  if (!mediaUrl) return;
  const tr = getDmTranslations();
  const openViewer = openDmMediaViewer();
  const caption = getDmMessageSnippet(message, tr) || "";
  if (typeof openViewer === "function") {
    openViewer(mediaUrl, "image", {
      source: "dm",
      alt: caption || tr.dmPhotoMessage || "Photo",
      caption,
      meta: formatDateTimeDisplay(message?.created_at),
    });
    return;
  }
  if (typeof window !== "undefined") {
    window.open(mediaUrl, "_blank", "noopener,noreferrer");
  }
}

async function copyDmMessageContent(message) {
  const tr = getDmTranslations();
  if (!message) return false;
  const sharePayload = parseDmLinkedMessage(message, tr);
  const replyPayload = parseDmReplyMessage(message);
  const reactionPayload = parseDmReactionMessage(message);
  let value = "";
  if (sharePayload) {
    value = [sharePayload.title, sharePayload.note, sharePayload.url].filter(Boolean).join("\n");
  } else if (reactionPayload) {
    value = (tr.dmReactionSummary || "Reacted with {emoji}").replace(
      "{emoji}",
      reactionPayload.emoji
    );
  } else if (replyPayload) {
    value =
      getDmReplyMessageDisplayBody(replyPayload) ||
      replyPayload.snippet ||
      tr.dmReplyFallback ||
      "Reply";
  } else {
    value = getDmMessageDisplayBody(message);
  }
  if (!value && getDmMessageHasImage(message)) {
    value = `${message.media_url || ""}`.trim();
  }
  value = `${value || ""}`.trim();
  if (!value) return false;
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(value);
      showToast(tr.dmMessageCopied || "Copied.", "success");
      return true;
    }
  } catch (error) {
    console.error("copy dm message failed", error);
  }
  showToast(value, "info");
  return true;
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

function getDmDraft(partnerId = dmActivePartnerId) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!targetPartnerId) return null;
  return normalizeDmDraftRecord(dmDraftsByPartner?.[targetPartnerId]) || null;
}

function hasDmDraft(partnerId = dmActivePartnerId) {
  return !!getDmDraft(partnerId);
}

function persistDmDraft(partnerId = dmActivePartnerId, options = {}) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!targetPartnerId) return false;
  syncDmPreferenceSets();
  const input = $("dm-input");
  const rawBody =
    typeof options.body === "string" ? options.body : `${input?.value || ""}`;
  const normalized = normalizeDmDraftRecord({
    body: rawBody,
    updatedAt: new Date().toISOString(),
  });
  const previous = getDmDraft(targetPartnerId);
  const previousBody = `${previous?.body || ""}`;
  const nextBody = `${normalized?.body || ""}`;
  const changed = previousBody !== nextBody;

  if (normalized) {
    dmDraftsByPartner[targetPartnerId] = normalized;
  } else if (dmDraftsByPartner?.[targetPartnerId]) {
    delete dmDraftsByPartner[targetPartnerId];
  }

  if (changed) {
    persistDmPreferenceSets();
    if (options.refreshList) {
      renderThreadList({ preserveScroll: true, keepWindow: true });
      renderThreadSummary();
    }
  }
  return changed;
}

function clearDmDraft(partnerId = dmActivePartnerId, options = {}) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!targetPartnerId || !dmDraftsByPartner?.[targetPartnerId]) return false;
  delete dmDraftsByPartner[targetPartnerId];
  persistDmPreferenceSets();
  if (options.refreshList) {
    renderThreadList({ preserveScroll: true, keepWindow: true });
    renderThreadSummary();
  }
  return true;
}

function restoreDmDraft(partnerId = dmActivePartnerId, options = {}) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  const input = $("dm-input");
  if (!targetPartnerId || !(input instanceof HTMLTextAreaElement)) return false;
  const hasActiveComposerState =
    !!`${input.value || ""}`.trim() || !!dmPendingMediaFile || !!dmReplyTargetId;
  if (!options.force && hasActiveComposerState) return false;
  const draft = getDmDraft(targetPartnerId);
  input.value = draft?.body || "";
  autoResizeDmInput();
  updateDmInputCounter();
  updateDmComposerState();
  return !!draft;
}

function normalizeDmEntryContext(context = {}) {
  if (!context || typeof context !== "object") return null;
  const source = `${context.source || ""}`.trim();
  const partnerId = `${context.partnerId || ""}`.trim();
  if (!source || !partnerId) return null;
  return {
    source,
    partnerId,
    actorName: `${context.actorName || ""}`.trim(),
    actorHandle: `${context.actorHandle || ""}`.trim(),
    notificationType: `${context.notificationType || ""}`.trim(),
    postId: `${context.postId || ""}`.trim(),
    postLabel: `${context.postLabel || ""}`.trim(),
    previewText: `${context.previewText || ""}`.trim(),
    prefillMessage: `${context.prefillMessage || ""}`.trim(),
    prefillApplied: !!context.prefillApplied,
  };
}

function setDmEntryContext(context = null) {
  dmEntryContext = normalizeDmEntryContext(context);
}

function clearDmEntryContext() {
  dmEntryContext = null;
}

function buildDmEntryLabel(context, tr = getDmTranslations()) {
  if (!context) return "";
  if (context.source === "notification") {
    return tr.dmEntryFromNotification || "From notification";
  }
  if (context.source === "profile") {
    return tr.dmEntryFromProfile || "From profile";
  }
  return tr.dmConversationInfo || "Info";
}

function buildDmEntryText(context, tr = getDmTranslations()) {
  if (!context) return "";
  const actorHandle = formatHandle(context.actorHandle || "");
  const actorDisplay = context.actorName || actorHandle || "";
  const preview = context.previewText || context.postLabel || "";
  if (context.source === "notification") {
    if (preview && actorDisplay) {
      return `${actorDisplay} · ${preview}`;
    }
    return preview || actorDisplay || tr.dmEntryFromNotification || "From notification";
  }
  if (context.source === "profile") {
    return actorDisplay || tr.dmOpenProfile || "Open profile";
  }
  return preview || actorDisplay || "";
}

function renderDmEntryContext() {
  const wrap = $("dm-entry-context");
  const label = $("dm-entry-context-label");
  const text = $("dm-entry-context-text");
  const openPostBtn = $("btn-dm-entry-open-post");
  const openProfileBtn = $("btn-dm-entry-open-profile");
  if (!wrap || !label || !text || !openPostBtn || !openProfileBtn) return;
  const tr = getDmTranslations();
  const context =
    dmEntryContext && dmEntryContext.partnerId === `${dmActivePartnerId || ""}`.trim()
      ? dmEntryContext
      : null;
  if (!context) {
    wrap.classList.add("hidden");
    wrap.setAttribute("aria-hidden", "true");
    text.textContent = "";
    openPostBtn.classList.add("hidden");
    openProfileBtn.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  wrap.setAttribute("aria-hidden", "false");
  label.textContent = buildDmEntryLabel(context, tr);
  text.textContent = buildDmEntryText(context, tr);
  openPostBtn.classList.toggle("hidden", !context.postId);
  openProfileBtn.classList.toggle("hidden", !context.partnerId);
}

function applyDmEntryPrefill() {
  const input = $("dm-input");
  const context =
    dmEntryContext && dmEntryContext.partnerId === `${dmActivePartnerId || ""}`.trim()
      ? dmEntryContext
      : null;
  if (!(input instanceof HTMLTextAreaElement) || !context?.prefillMessage || context.prefillApplied) {
    return;
  }
  const hasContent = !!`${input.value || ""}`.trim();
  const hasDraft = hasDmDraft(dmActivePartnerId);
  if (hasContent || hasDraft || dmPendingMediaFile || dmReplyTargetId) return;
  input.value = context.prefillMessage;
  context.prefillApplied = true;
  scheduleDmInputMetricsUpdate();
  persistDmDraft(dmActivePartnerId);
}

function getDmPartnerPresence(partnerId = dmActivePartnerId, tr = getDmTranslations()) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!targetPartnerId) {
    return {
      kind: "",
      label: "",
      title: "",
      isOnline: false,
    };
  }
  if (dmTypingPartnerId === targetPartnerId) {
    return {
      kind: "typing",
      label: tr.dmTyping || "Typing…",
      title: tr.dmTyping || "Typing…",
      isOnline: true,
    };
  }
  const thread = dmThreads.find((item) => item.partnerId === targetPartnerId);
  const rawRecentAt = `${thread?.partnerLastAt || ""}`.trim();
  if (!rawRecentAt) {
    return {
      kind: "",
      label: "",
      title: "",
      isOnline: false,
    };
  }
  const recentAt = new Date(rawRecentAt);
  if (Number.isNaN(recentAt.getTime())) {
    return {
      kind: "",
      label: "",
      title: "",
      isOnline: false,
    };
  }
  const diffMs = Date.now() - recentAt.getTime();
  if (diffMs <= 5 * 60 * 1000) {
    return {
      kind: "active",
      label: tr.dmActiveNow || "Active now",
      title: tr.dmActiveNow || "Active now",
      isOnline: true,
    };
  }
  if (diffMs <= 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
    const label = (tr.dmActiveMinutesAgo || "{minutes}m ago").replace(
      "{minutes}",
      `${minutes}`
    );
    return {
      kind: "recent",
      label,
      title: label,
      isOnline: false,
    };
  }
  if (diffMs <= 24 * 60 * 60 * 1000) {
    const hours = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)));
    const label = (tr.dmActiveHoursAgo || "{hours}h ago").replace(
      "{hours}",
      `${hours}`
    );
    return {
      kind: "recent",
      label,
      title: label,
      isOnline: false,
    };
  }
  return {
    kind: "",
    label: "",
    title: "",
    isOnline: false,
  };
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

function isElementMostlyVisibleInContainer(container, element, threshold = 0.8) {
  if (!container || !element) return false;
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const visibleTop = Math.max(containerRect.top, elementRect.top);
  const visibleBottom = Math.min(containerRect.bottom, elementRect.bottom);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const totalHeight = Math.max(1, elementRect.height || 1);
  return visibleHeight / totalHeight >= threshold;
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
  const latestButton = $("btn-dm-jump-latest");
  const unreadButton = $("btn-dm-jump-unread");
  if (!list) return;
  if (latestButton) {
    const shouldShowLatest =
      !!dmActivePartnerId &&
      dmMessages.length > 0 &&
      !isNearBottom(list, 96);
    latestButton.classList.toggle("hidden", !shouldShowLatest);
  }
  if (unreadButton) {
    const unreadDivider = list.querySelector(".dm-unread-divider");
    const shouldShowUnread =
      !!dmActivePartnerId &&
      !!dmUnreadDividerMessageId &&
      unreadDivider instanceof HTMLElement &&
      !isElementMostlyVisibleInContainer(list, unreadDivider, 0.92);
    unreadButton.classList.toggle("hidden", !shouldShowUnread);
  }
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

function getDmSavedScrollState(partnerId = dmActivePartnerId) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  if (!targetPartnerId) return null;
  const state = dmScrollPositionsByPartner?.[targetPartnerId];
  if (!state || typeof state !== "object") return null;
  const top = Number(state.top);
  return {
    top: Number.isFinite(top) ? Math.max(0, top) : 0,
    atBottom: !!state.atBottom,
  };
}

function saveDmConversationScroll(partnerId = dmActivePartnerId) {
  const targetPartnerId = `${partnerId || ""}`.trim();
  const list = $("dm-message-list");
  if (!targetPartnerId || !(list instanceof HTMLElement)) return;
  const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
  dmScrollPositionsByPartner[targetPartnerId] = {
    top: Math.max(0, Math.min(list.scrollTop, maxScrollTop)),
    atBottom: isNearBottom(list, 96),
  };
}

function restoreDmConversationScroll(list, partnerId = dmActivePartnerId) {
  if (!(list instanceof HTMLElement)) return false;
  const savedState = getDmSavedScrollState(partnerId);
  if (!savedState) return false;
  requestAnimationFrame(() => {
    if (savedState.atBottom) {
      list.scrollTop = list.scrollHeight;
    } else {
      const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
      list.scrollTop = Math.max(0, Math.min(savedState.top, maxScrollTop));
    }
    saveDmConversationScroll(partnerId);
    syncDmJumpLatestButton();
  });
  return true;
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

function renderDmPresenceStrip() {
  const wrap = $("dm-presence-strip");
  const title = $("dm-presence-strip-title");
  const meta = $("dm-presence-strip-meta");
  const list = $("dm-presence-strip-list");
  if (!wrap || !title || !meta || !list) return;
  const tr = getDmTranslations();
  const threads = getDmPresenceThreads();
  if (!threads.length) {
    wrap.classList.add("hidden");
    wrap.setAttribute("aria-hidden", "true");
    list.replaceChildren();
    title.textContent = tr.dmPresenceTitle || "Active now";
    meta.textContent = "";
    return;
  }

  wrap.classList.remove("hidden");
  wrap.setAttribute("aria-hidden", "false");
  title.textContent = tr.dmPresenceTitle || "Active now";
  meta.textContent = (tr.dmPresenceMeta || "{count} active").replace(
    "{count}",
    `${threads.length}`
  );
  const fragment = document.createDocumentFragment();
  threads.forEach((thread) => {
    const partnerId = `${thread?.partnerId || ""}`.trim();
    if (!partnerId) return;
    const identity = getProfileIdentity(thread.profile, partnerId);
    const presence = getDmPartnerPresence(partnerId, tr);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dm-presence-item";
    button.setAttribute("data-dm-presence-partner", partnerId);
    button.setAttribute(
      "aria-label",
      [identity.primary, presence.label].filter(Boolean).join(" · ")
    );
    const avatar = document.createElement("span");
    avatar.className = "avatar dm-presence-avatar";
    renderAvatar(avatar, thread.profile, identity.initial);
    avatar.classList.toggle("is-online", presence.isOnline);
    avatar.classList.toggle("is-recent", presence.kind === "recent");
    const name = document.createElement("span");
    name.className = "dm-presence-name";
    name.textContent = identity.primary;
    const state = document.createElement("span");
    state.className = "dm-presence-state";
    state.textContent = presence.label || tr.dmActiveNow || "Active now";
    button.append(avatar, name, state);
    fragment.appendChild(button);
  });
  list.replaceChildren(fragment);
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

function toggleDmMessagePinned(messageId) {
  const targetMessageId = `${messageId || ""}`.trim();
  const targetPartnerId = `${dmActivePartnerId || ""}`.trim();
  if (!targetMessageId || !targetPartnerId) return false;
  syncDmPreferenceSets();
  const tr = getDmTranslations();
  const currentPinnedId = getDmPinnedMessageId(targetPartnerId);
  if (currentPinnedId && currentPinnedId === targetMessageId) {
    clearDmPinnedMessage(targetPartnerId);
    showToast(tr.dmMessageUnpinned || "Pinned message cleared.", "success");
  } else {
    setDmPinnedMessage(targetPartnerId, targetMessageId);
    showToast(tr.dmMessagePinned || "Message pinned.", "success");
  }
  renderConversationMessages({ forceFull: true });
  renderDmInfoPanel();
  return true;
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

function getDmMessageAuthorLabel(message, tr = getDmTranslations()) {
  if (!message) return tr.dmReplyFallback || "Message";
  const currentUserId = `${getCurrentUser()?.id || ""}`.trim();
  if (`${message.sender_id || ""}`.trim() === currentUserId) {
    return tr.dmYouPrefix || "You";
  }
  return getDmReplyAuthorLabel(message, tr);
}

function buildDmSearchSnippet(text, query) {
  const raw = `${text || ""}`.replace(/\s+/g, " ").trim();
  const normalizedQuery = normalizeDmSearchText(query);
  if (!raw) return "";
  if (!normalizedQuery) return raw;
  const normalizedRaw = normalizeDmSearchText(raw);
  let matchIndex = normalizedRaw.indexOf(normalizedQuery);
  if (matchIndex < 0) {
    const tokenIndex = getDmSearchTokens(query)
      .map((token) => normalizedRaw.indexOf(token))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    matchIndex = Number.isFinite(tokenIndex) ? tokenIndex : -1;
  }
  if (matchIndex < 0 || raw.length <= 96) return raw;
  const start = Math.max(0, matchIndex - 28);
  const end = Math.min(raw.length, matchIndex + normalizedQuery.length + 54);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < raw.length ? "…" : "";
  return `${prefix}${raw.slice(start, end).trim()}${suffix}`;
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
    existing.partnerLastAt = existing.partnerLastAt || "";
    existing.lastMediaUrl = mediaUrl || "";
    existing.lastMediaType = mediaType || "";
  } else {
    const partner = dmPartners.find((item) => item.id === partnerId);
    dmThreads.unshift({
      partnerId,
      lastBody: previewBody,
      lastAt: createdAt,
      lastFromMe: true,
      partnerLastAt: "",
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
      entryContext: options.entryContext || null,
      forceBottom: options.forceBottom !== false,
      openChat: options.openChat !== false,
    });
    renderDmPage();
    applyDmEntryPrefill();
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
  const draft = getDmDraft(thread?.partnerId);
  if (draft) {
    return {
      kind: "draft",
      kindLabel: tr.dmDraftBadge || "Draft",
      text: draft.body,
      fallbackText: draft.body,
      draftAt: draft.updatedAt || "",
    };
  }
  const reactionPayload = parseDmReactionMessage({ body: thread?.lastBody });
  const replyPayload = parseDmReplyMessage({ body: thread?.lastBody });
  const sharePayload = parseDmLinkedMessage({ body: thread?.lastBody }, tr);
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
      kind: sharePayload.kind === "post" ? "share" : "link",
      kindLabel:
        sharePayload.kind === "post"
          ? tr.dmSharedPostBadge || "Post"
          : tr.dmInfoLinkBadge || "Link",
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
  const presence = getDmPartnerPresence(thread?.partnerId);
  return [
    `${thread?.partnerId || ""}`.trim(),
    Number(thread?.unreadCount || 0),
    thread?.partnerId === activePartnerId ? 1 : 0,
    isDmThreadPinned(thread?.partnerId) ? 1 : 0,
    isDmThreadMuted(thread?.partnerId) ? 1 : 0,
    thread?.lastFromMe ? 1 : 0,
    `${thread?.lastAt || ""}`.trim(),
    `${thread?.partnerLastAt || ""}`.trim(),
    `${thread?.lastMediaType || ""}`.trim(),
    `${previewState.kind || ""}`.trim(),
    `${previewState.draftAt || ""}`.trim(),
    `${previewBody.length}:${previewBody.slice(0, 48)}`,
    `${presence.kind || ""}:${presence.label || ""}`,
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
  const draft = getDmDraft(thread.partnerId);
  button.classList.toggle("is-active", isActive);
  button.classList.toggle("is-unread", Number(thread.unreadCount || 0) > 0);
  button.classList.toggle("is-pinned", isPinned);
  button.classList.toggle("is-muted", isMuted);
  button.classList.toggle("has-draft", !!draft);
  button.classList.toggle("is-typing", presence.kind === "typing");
  button.classList.toggle("is-live", presence.kind === "active" || presence.kind === "typing");
  button.setAttribute("aria-pressed", isActive ? "true" : "false");

  let avatar = button.querySelector(".avatar");
  if (!avatar) {
    avatar = document.createElement("div");
    avatar.className = "avatar";
    button.appendChild(avatar);
  }
  const identity = getProfileIdentity(thread.profile, thread.partnerId);
  const presence = getDmPartnerPresence(thread.partnerId, tr);
  renderAvatar(avatar, thread.profile, identity.initial);
  avatar.classList.toggle("is-online", presence.isOnline);
  avatar.classList.toggle("is-recent", presence.kind === "recent");
  if (presence.title) {
    avatar.setAttribute("title", presence.title);
    avatar.setAttribute("aria-label", `${identity.primary} · ${presence.title}`);
  } else {
    avatar.removeAttribute("title");
    avatar.removeAttribute("aria-label");
  }
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
  let status = metaWrap.querySelector(".dm-thread-status");
  if (!status) {
    status = document.createElement("div");
    status.className = "dm-thread-status";
    metaWrap.insertBefore(status, time);
  }
  time.textContent = formatThreadTimestamp(draft?.updatedAt || thread.lastAt);
  const showStatus = !draft && presence.kind === "typing";
  status.textContent = showStatus ? presence.label : "";
  status.classList.toggle("hidden", !showStatus);
  status.classList.toggle("is-typing", presence.kind === "typing");
  const flags = metaWrap.querySelector(".dm-thread-flags");
  if (flags) {
    flags.remove();
  }

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
  const showTypingPreview = !draft && presence.kind === "typing";
  if (thread.lastFromMe && previewState.kind !== "draft" && !showTypingPreview) {
    const prefix = document.createElement("span");
    prefix.className = "dm-preview-prefix";
    prefix.textContent = `${youPrefix}: `;
    preview.appendChild(prefix);
  }
  if (previewState.kind && !showTypingPreview) {
    const previewKind = document.createElement("span");
    previewKind.className = `dm-thread-preview-pill is-${previewState.kind}`;
    previewKind.textContent = previewState.kindLabel;
    preview.appendChild(previewKind);
  }
  if (showTypingPreview) {
    const previewText = document.createElement("span");
    previewText.className = "dm-thread-preview-text is-presence is-typing";
    previewText.textContent = presence.label || tr.dmTyping || "Typing…";
    preview.appendChild(previewText);
  } else if (previewState.text || !previewState.kind) {
    const previewText = document.createElement("span");
    previewText.className = "dm-thread-preview-text";
    if (previewState.kind === "draft") {
      previewText.classList.add("is-draft");
    }
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
  closeDmActionSheet();
  if (options.entryContext) {
    setDmEntryContext({
      ...options.entryContext,
      partnerId: nextPartnerId,
    });
  } else if (dmEntryContext) {
    clearDmEntryContext();
  }
  if (nextPartnerId !== dmActivePartnerId) {
    saveDmConversationScroll(dmActivePartnerId);
    persistDmDraft(dmActivePartnerId, { refreshList: true });
    dmUnreadDividerMessageId = "";
    clearDmReplyTarget();
    dmReactionPickerMessageId = "";
    setDmMessageSearchOpen(false);
    dmMessages = [];
    dmRenderedMessageKeys = [];
  }
  if (dmComposeOpen) {
    closeDmComposeModal();
  }
  dmActivePartnerId = nextPartnerId;
  renderPartnerSelect();
  renderThreadList();
  renderConversationHeader();
  renderConversationMessages({ forceFull: true });
  renderDmEntryContext();
  restoreDmDraft(nextPartnerId, { force: true });
  applyDmEntryPrefill();
  updateDmComposerState();
  ensureDmRealtimeChannel(nextPartnerId);
  if (options.openChat !== false) {
    setDmMobileChatOpen(true);
  }
  const hasSavedScroll = !!getDmSavedScrollState(dmActivePartnerId);
  const shouldForceBottom =
    typeof options.forceBottom === "boolean" ? options.forceBottom : !hasSavedScroll;
  loadConversation(dmActivePartnerId, {
    forceBottom: shouldForceBottom,
    restoreScroll: !shouldForceBottom,
  }).catch((error) => {
    console.error("select partner load conversation failed:", error);
  });
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
    renderDmPresenceStrip();
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
    renderDmPresenceStrip();
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
    renderDmPresenceStrip();
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
    const draftThreads = regularThreads
      .filter((thread) => hasDmDraft(thread.partnerId))
      .sort((a, b) => {
        const aTime = new Date(getDmDraft(a.partnerId)?.updatedAt || 0).getTime();
        const bTime = new Date(getDmDraft(b.partnerId)?.updatedAt || 0).getTime();
        return bTime - aTime;
      });
    const regularOnlyThreads = regularThreads.filter((thread) => !hasDmDraft(thread.partnerId));
    if (pinnedThreads.length) {
      fragment.appendChild(
        createDmThreadSectionLabel(tr.dmSectionPinned || "Pinned")
      );
      appendThreadItems(pinnedThreads);
    }
    if (draftThreads.length) {
      fragment.appendChild(
        createDmThreadSectionLabel(tr.dmSectionDrafts || "Drafts")
      );
      appendThreadItems(draftThreads);
    }
    if (regularOnlyThreads.length) {
      fragment.appendChild(
        createDmThreadSectionLabel(tr.dmSectionMessages || "Messages")
      );
      appendThreadItems(regularOnlyThreads);
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
  renderDmPresenceStrip();
}

function renderConversationHeader(options = {}) {
  const title = $("dm-chat-title");
  const sub = $("dm-chat-sub");
  const headerMain = $("dm-chat-header-main");
  const searchBtn = $("btn-dm-search");
  const infoBtn = $("btn-dm-info");
  const avatar = $("dm-chat-avatar");
  if (!title) return;
  const tr = getDmTranslations();
  const force = !!options.force;
  const active = dmPartners.find((partner) => partner.id === dmActivePartnerId);
  const languageKey = getCurrentLang();
  let nextTitle = tr.dmConversationIdle || "Select a chat";
  let nextSub = tr.dmChatSubIdle || "Select a partner to start chatting.";
  let nextSearchHidden = true;
  let nextInfoHidden = true;
  let avatarProfile = null;
  let avatarFallback = "U";
  let avatarIdle = true;
  let avatarOnline = false;
  let avatarRecent = false;

  if (active) {
    const identity = getProfileIdentity(active.profile, active.id);
    const presence = getDmPartnerPresence(active.id, tr);
    nextTitle = identity.primary;
    avatarProfile = active.profile || null;
    avatarFallback = identity.initial;
    avatarIdle = false;
    avatarOnline = presence.isOnline;
    avatarRecent = presence.kind === "recent";
    const subParts = [];
    if (presence.label) {
      subParts.push(presence.label);
    }
    if (identity.secondary) {
      subParts.push(identity.secondary);
    }
    nextSub =
      dmTypingPartnerId === active.id
        ? tr.dmTyping || "Typing…"
        : subParts.filter(Boolean).join(" · ");
    nextSearchHidden = false;
    nextInfoHidden = false;
  } else {
    nextSub = "";
    avatarFallback = "…";
  }

  const nextHeaderKey = [
    languageKey,
    `${dmActivePartnerId || ""}`.trim(),
    nextTitle,
    nextSub,
    nextSearchHidden ? "1" : "0",
    nextInfoHidden ? "1" : "0",
    dmMessageSearchOpen ? "1" : "0",
    dmInfoPanelOpen ? "1" : "0",
    avatarIdle ? "1" : "0",
    avatarOnline ? "1" : "0",
    avatarRecent ? "1" : "0",
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
    avatar.classList.toggle("is-online", avatarOnline);
    avatar.classList.toggle("is-recent", avatarRecent);
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
  if (searchBtn) {
    searchBtn.disabled = nextSearchHidden;
    searchBtn.classList.toggle("hidden", nextSearchHidden);
    searchBtn.classList.toggle("is-active", dmMessageSearchOpen);
  }
  if (infoBtn) {
    infoBtn.disabled = nextInfoHidden;
    infoBtn.classList.toggle("hidden", nextInfoHidden);
    infoBtn.classList.toggle("is-active", dmInfoPanelOpen);
  }
  dmRenderedConversationHeaderKey = nextHeaderKey;
}

function updateDmMessageSearchState() {
  const tr = getDmTranslations();
  const input = $("dm-message-search");
  const countEl = $("dm-message-search-count");
  const prevBtn = $("btn-dm-message-search-prev");
  const nextBtn = $("btn-dm-message-search-next");
  const query = normalizeDmSearchText(dmMessageSearchQuery);
  if (!query || !dmActivePartnerId) {
    dmMessageSearchMatchIds = [];
    dmMessageSearchActiveIndex = -1;
    if (countEl) {
      countEl.textContent = dmMessageSearchOpen
        ? tr.dmSearchHint || "Type to search"
        : "-";
    }
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    renderDmSearchDayChips();
    renderDmSearchResults();
    if (input && dmMessageSearchOpen && document.activeElement !== input) {
      input.focus();
    }
    return;
  }
  dmMessageSearchMatchIds = dmMessages
    .filter((message) => {
      if (message?.pending) return false;
      const text = normalizeDmSearchText(getDmSearchableMessageText(message, tr));
      return !!text && text.includes(query);
    })
    .map((message) => `${message?.id || ""}`.trim())
    .filter(Boolean);

  if (!dmMessageSearchMatchIds.length) {
    dmMessageSearchActiveIndex = -1;
    if (countEl) {
      countEl.textContent = tr.dmSearchEmptyState || "No matches";
    }
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    renderDmSearchDayChips();
    renderDmSearchResults();
    return;
  }

  if (
    dmMessageSearchActiveIndex < 0 ||
    dmMessageSearchActiveIndex >= dmMessageSearchMatchIds.length
  ) {
    dmMessageSearchActiveIndex = 0;
  }
  if (countEl) {
    countEl.textContent = (tr.dmSearchCounter || "{current}/{total}")
      .replace("{current}", `${dmMessageSearchActiveIndex + 1}`)
      .replace("{total}", `${dmMessageSearchMatchIds.length}`);
  }
  if (prevBtn) prevBtn.disabled = dmMessageSearchMatchIds.length <= 1;
  if (nextBtn) nextBtn.disabled = dmMessageSearchMatchIds.length <= 1;
  renderDmSearchDayChips();
  renderDmSearchResults();
}

function goToDmSearchMatch(direction = 1) {
  if (!dmMessageSearchMatchIds.length) return;
  const total = dmMessageSearchMatchIds.length;
  dmMessageSearchActiveIndex =
    ((dmMessageSearchActiveIndex < 0 ? 0 : dmMessageSearchActiveIndex) + direction + total) %
    total;
  updateDmMessageSearchState();
  const targetId = dmMessageSearchMatchIds[dmMessageSearchActiveIndex];
  scrollToDmMessage(targetId, { block: "center" });
  renderConversationMessages({ forceFull: true });
}

function getDmSearchMatchDays() {
  if (!dmMessageSearchMatchIds.length) return [];
  const groups = [];
  const seen = new Map();
  dmMessageSearchMatchIds.forEach((messageId, index) => {
    const label = formatDateDisplay(getDmMessageById(messageId)?.created_at) || "—";
    if (!seen.has(label)) {
      seen.set(label, groups.length);
      groups.push({ label, count: 1, firstIndex: index });
      return;
    }
    const groupIndex = seen.get(label);
    if (typeof groupIndex === "number" && groups[groupIndex]) {
      groups[groupIndex].count += 1;
    }
  });
  return groups;
}

function renderDmSearchDayChips() {
  const wrap = $("dm-message-search-days");
  if (!wrap) return;
  if (!dmMessageSearchOpen || !dmMessageSearchMatchIds.length) {
    wrap.classList.add("hidden");
    wrap.replaceChildren();
    return;
  }
  const groups = getDmSearchMatchDays();
  if (!groups.length) {
    wrap.classList.add("hidden");
    wrap.replaceChildren();
    return;
  }
  const activeId =
    dmMessageSearchActiveIndex >= 0
      ? dmMessageSearchMatchIds[dmMessageSearchActiveIndex]
      : "";
  const activeLabel = formatDateDisplay(getDmMessageById(activeId)?.created_at) || "";
  wrap.classList.remove("hidden");
  wrap.replaceChildren(
    ...groups.map((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dm-chat-search-day";
      if (group.label === activeLabel) button.classList.add("is-active");
      button.setAttribute("data-dm-search-day-index", `${group.firstIndex}`);
      button.title = `${group.label} (${group.count})`;
      const label = document.createElement("span");
      label.className = "dm-chat-search-day-label";
      label.textContent = group.label;
      const count = document.createElement("span");
      count.className = "dm-chat-search-day-count";
      count.textContent = `${group.count}`;
      button.append(label, count);
      return button;
    })
  );
}

function getDmVisibleSearchResults(limit = 8) {
  if (!dmMessageSearchMatchIds.length) return [];
  const total = dmMessageSearchMatchIds.length;
  const activeIndex = dmMessageSearchActiveIndex >= 0 ? dmMessageSearchActiveIndex : 0;
  const half = Math.floor(limit / 2);
  let start = Math.max(0, activeIndex - half);
  let end = Math.min(total, start + limit);
  start = Math.max(0, end - limit);
  return dmMessageSearchMatchIds.slice(start, end).map((messageId, offset) => {
    const absoluteIndex = start + offset;
    const message = getDmMessageById(messageId);
    const tr = getDmTranslations();
    const rawText = getDmSearchableMessageText(message, tr);
    return {
      absoluteIndex,
      messageId,
      message,
      author: getDmMessageAuthorLabel(message, tr),
      time: formatThreadTimestamp(message?.created_at),
      snippet: buildDmSearchSnippet(rawText, dmMessageSearchQuery),
      isActive: absoluteIndex === activeIndex,
    };
  });
}

function renderDmSearchResults() {
  const wrap = $("dm-message-search-results");
  if (!wrap) return;
  if (!dmMessageSearchOpen || !dmMessageSearchMatchIds.length) {
    wrap.classList.add("hidden");
    wrap.replaceChildren();
    return;
  }
  const results = getDmVisibleSearchResults();
  if (!results.length) {
    wrap.classList.add("hidden");
    wrap.replaceChildren();
    return;
  }
  wrap.classList.remove("hidden");
  wrap.replaceChildren(
    ...results.map((result) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dm-chat-search-result";
      if (result.isActive) button.classList.add("is-active");
      button.setAttribute("data-dm-search-result-index", `${result.absoluteIndex}`);
      button.setAttribute(
        "aria-label",
        (getDmTranslations().dmSearchJumpToMessage || "Jump to message").replace(
          "{author}",
          result.author || ""
        )
      );

      const meta = document.createElement("div");
      meta.className = "dm-chat-search-result-meta";
      const author = document.createElement("span");
      author.className = "dm-chat-search-result-author";
      author.textContent = result.author;
      const time = document.createElement("span");
      time.className = "dm-chat-search-result-time";
      time.textContent = result.time || formatMessageDayLabel(result.message?.created_at);
      meta.append(author, time);

      const snippet = document.createElement("div");
      snippet.className = "dm-chat-search-result-snippet";
      applyHighlightedText(
        snippet,
        result.snippet || getDmTranslations().dmSearchEmptyState || "No matches",
        dmMessageSearchQuery
      );

      button.append(meta, snippet);
      return button;
    })
  );
}

function buildDmInfoSearchHitCard(result, tr = getDmTranslations()) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dm-info-search-hit";
  if (result.isActive) button.classList.add("is-active");
  button.setAttribute("data-dm-search-result-index", `${result.absoluteIndex}`);
  button.setAttribute(
    "aria-label",
    (tr.dmSearchJumpToMessage || "Jump to message").replace("{author}", result.author || "")
  );

  const meta = document.createElement("div");
  meta.className = "dm-info-search-hit-meta";
  const author = document.createElement("span");
  author.className = "dm-info-search-hit-author";
  author.textContent = result.author;
  const time = document.createElement("span");
  time.className = "dm-info-search-hit-time";
  time.textContent = result.time || formatMessageDayLabel(result.message?.created_at);
  meta.append(author, time);

  const snippet = document.createElement("div");
  snippet.className = "dm-info-search-hit-snippet";
  applyHighlightedText(
    snippet,
    result.snippet || tr.dmSearchEmptyState || "No matches",
    dmMessageSearchQuery
  );

  button.append(meta, snippet);
  return button;
}

function setDmInfoTab(nextTab = "overview") {
  const normalized =
    ["overview", "media", "shared"].includes(`${nextTab || ""}`.trim())
      ? `${nextTab || ""}`.trim()
      : "overview";
  dmInfoTab = normalized;
}

function syncDmInfoTabs() {
  const tabButtons = document.querySelectorAll("[data-dm-info-tab]");
  tabButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const tab = `${button.getAttribute("data-dm-info-tab") || ""}`.trim();
    const isActive = dmInfoTab === tab;
    button.setAttribute("role", "tab");
    button.classList.toggle("chip-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  });
  const sections = document.querySelectorAll("[data-dm-info-section]");
  sections.forEach((section) => {
    if (!(section instanceof HTMLElement)) return;
    const sectionTab = `${section.getAttribute("data-dm-info-section") || "overview"}`.trim();
    const isVisible = sectionTab === dmInfoTab;
    section.classList.toggle("hidden", !isVisible);
    section.setAttribute("aria-hidden", isVisible ? "false" : "true");
  });
}

function buildDmInfoLinkCard(item, tr = getDmTranslations()) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dm-info-link-card";
  button.setAttribute("data-dm-info-link-url", item.url);
  button.setAttribute("data-dm-info-link-kind", item.kind || "link");
  if (item.postId) {
    button.setAttribute("data-dm-info-post-id", item.postId);
  }

  const kicker = document.createElement("div");
  kicker.className = `dm-info-link-kicker is-${item.kind || "link"}`;
  kicker.textContent =
    item.kind === "post"
      ? tr.dmSharedPostBadge || "Shared post"
      : tr.dmInfoLinkBadge || "Link";

  const titleEl = document.createElement("div");
  titleEl.className = "dm-info-link-title";
  titleEl.textContent = item.title || item.host || item.url;

  const noteEl = document.createElement("div");
  noteEl.className = "dm-info-link-note";
  noteEl.textContent =
    item.note || item.host || formatDateDisplay(item.createdAt) || item.url;

  const metaRow = document.createElement("div");
  metaRow.className = "dm-info-link-meta";
  const hostEl = document.createElement("span");
  hostEl.textContent = item.host || formatDateDisplay(item.createdAt) || "link";
  const ctaEl = document.createElement("span");
  ctaEl.className = "dm-info-link-cta";
  ctaEl.textContent =
    item.kind === "post"
      ? tr.dmSharedPostOpen || "Open post"
      : tr.dmCopyLink || "Copy link";
  metaRow.append(hostEl, ctaEl);

  button.append(kicker, titleEl, noteEl, metaRow);
  return button;
}

function renderDmInfoPanel() {
  const panel = $("dm-info-panel");
  const avatar = $("dm-info-avatar");
  const title = $("dm-info-title");
  const sub = $("dm-info-sub");
  const presence = $("dm-info-presence");
  const heroMeta = $("dm-info-hero-meta");
  const summaryPills = $("dm-info-summary-pills");
  const tabs = $("dm-info-tabs");
  const stats = $("dm-info-stats");
  const profileTitle = $("dm-info-profile-title");
  const profileMeta = $("dm-info-profile-meta");
  const profileFacts = $("dm-info-profile-facts");
  const mediaTitle = $("dm-info-media-title");
  const mediaMeta = $("dm-info-media-meta");
  const mediaGrid = $("dm-info-media-grid");
  const postsTitle = $("dm-info-posts-title");
  const postsMeta = $("dm-info-posts-meta");
  const postsList = $("dm-info-posts-list");
  const linksTitle = $("dm-info-links-title");
  const linksMeta = $("dm-info-links-meta");
  const linksList = $("dm-info-links-list");
  const searchTitle = $("dm-info-search-title");
  const searchMeta = $("dm-info-search-meta");
  const searchHits = $("dm-info-search-hits");
  const openProfileBtn = $("btn-dm-info-open-profile");
  const markReadBtn = $("btn-dm-info-mark-read");
  const pinBtn = $("btn-dm-info-pin");
  const muteBtn = $("btn-dm-info-mute");
  const openSearchBtn = $("btn-dm-info-open-search");
  if (
    !panel ||
    !avatar ||
    !title ||
    !sub ||
    !presence ||
    !heroMeta ||
    !summaryPills ||
    !tabs ||
    !stats ||
    !profileTitle ||
    !profileMeta ||
    !profileFacts ||
    !mediaTitle ||
    !mediaMeta ||
    !mediaGrid ||
    !postsTitle ||
    !postsMeta ||
    !postsList ||
    !linksTitle ||
    !linksMeta ||
    !linksList ||
    !searchTitle ||
    !searchMeta ||
    !searchHits ||
    !openProfileBtn ||
    !markReadBtn ||
    !pinBtn ||
    !muteBtn ||
    !openSearchBtn
  ) {
    return;
  }

  const tr = getDmTranslations();
  profileTitle.textContent = tr.dmInfoProfileTitle || "Profile details";
  mediaTitle.textContent = tr.dmInfoMediaTitle || "Shared media";
  postsTitle.textContent = tr.dmInfoPostsTitle || "Shared posts";
  linksTitle.textContent = tr.dmInfoLinksTitle || "Shared links";
  searchTitle.textContent = tr.dmInfoSearchTitle || "Search in conversation";
  openProfileBtn.textContent = tr.dmOpenProfile || "Open profile";
  markReadBtn.textContent = tr.dmMarkRead || "Mark read";
  openSearchBtn.textContent = tr.dmInfoOpenSearch || "Open search";
  openSearchBtn.classList.toggle("is-active", dmMessageSearchOpen);

  const active = dmPartners.find((partner) => partner.id === dmActivePartnerId);
  if (!active) {
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
    dmInfoPanelOpen = false;
    return;
  }

  const identity = getProfileIdentity(active.profile, active.id);
  renderAvatar(avatar, active.profile, identity.initial);
  title.textContent = identity.primary;
  sub.textContent = identity.secondary || tr.dmChatSubIdle || "Conversation";

  const thread = dmThreads.find((item) => item.partnerId === active.id);
  const partnerPresence = getDmPartnerPresence(active.id, tr);
  const mediaMessages = getDmConversationMediaMessages(12);
  const sharedPosts = getDmConversationSharedPosts(6);
  const sharedLinks = getDmConversationSharedLinks(6);
  const shareCount = sharedPosts.length + sharedLinks.length;
  const unreadCount = Number(thread?.unreadCount || 0);
  const messageCount = dmMessages.filter((message) => !parseDmReactionMessage(message)).length;
  const replyCount = dmMessages.filter((message) => !!parseDmReplyMessage(message)).length;
  const facts = getDmInfoFacts(active.profile, tr);
  const latestMessage = dmMessages.length ? dmMessages[dmMessages.length - 1] : null;
  const latestActivity = formatDateTimeDisplay(thread?.lastAt || latestMessage?.created_at);

  presence.textContent = partnerPresence.label || tr.dmChatSubIdle || "Conversation";
  presence.classList.toggle("is-online", !!partnerPresence.isOnline);
  presence.classList.toggle("is-idle", !partnerPresence.isOnline);
  heroMeta.textContent = latestActivity
    ? `${tr.dmInfoRecentActivity || "Latest activity"} · ${latestActivity}`
    : tr.dmInfoSearchMeta || "Jump to messages by keyword";

  const summaryItems = [
    { label: tr.dmInfoMessages || "Messages", value: `${messageCount}` },
    { label: tr.dmInfoMediaCount || "Media", value: `${mediaMessages.length}` },
    { label: tr.dmInfoSharedCount || "Shared", value: `${shareCount}` },
  ];
  if (unreadCount > 0) {
    summaryItems.push({ label: tr.dmFilterUnread || "Unread", value: `${unreadCount}` });
  } else if (isDmThreadPinned(active.id)) {
    summaryItems.push({ label: tr.dmPinThread || "Pin", value: "On" });
  } else if (replyCount > 0) {
    summaryItems.push({ label: tr.dmInfoReplies || "Replies", value: `${replyCount}` });
  }
  summaryPills.replaceChildren(
    ...summaryItems.slice(0, 4).map((item) => {
      const pill = document.createElement("div");
      pill.className = "dm-info-summary-pill";
      const value = document.createElement("span");
      value.className = "dm-info-summary-pill-value";
      value.textContent = item.value;
      const label = document.createElement("span");
      label.className = "dm-info-summary-pill-label";
      label.textContent = item.label;
      pill.append(value, label);
      return pill;
    })
  );

  const statItems = [
    { label: tr.dmInfoMessages || "Messages", value: `${messageCount}` },
    { label: tr.dmInfoMediaCount || "Media", value: `${mediaMessages.length}` },
    { label: tr.dmInfoSharedCount || "Shared", value: `${shareCount}` },
    { label: tr.dmInfoReplies || "Replies", value: `${replyCount}` },
  ];
  if (unreadCount > 0) {
    statItems.push({ label: tr.dmFilterUnread || "Unread", value: `${unreadCount}` });
  }
  stats.replaceChildren(
    ...statItems.map((item) => {
      const card = document.createElement("div");
      card.className = "dm-info-stat";
      const value = document.createElement("div");
      value.className = "dm-info-stat-value";
      value.textContent = item.value;
      const labelEl = document.createElement("div");
      labelEl.className = "dm-info-stat-label";
      labelEl.textContent = item.label;
      card.append(value, labelEl);
      return card;
    })
  );

  profileMeta.textContent = facts.length
    ? (tr.dmInfoProfileMeta || "{count} profile details").replace(
        "{count}",
        `${facts.length}`
      )
    : tr.dmInfoNoProfile || "No profile details yet";

  if (facts.length) {
    profileFacts.replaceChildren(
      ...facts.map((item) => {
        const card = document.createElement("div");
        card.className = "dm-info-profile-fact";
        const labelEl = document.createElement("div");
        labelEl.className = "dm-info-profile-fact-label";
        labelEl.textContent = item.label;
        const valueEl = document.createElement("div");
        valueEl.className = "dm-info-profile-fact-value";
        valueEl.textContent = item.value;
        card.append(labelEl, valueEl);
        return card;
      })
    );
  } else {
    const empty = document.createElement("div");
    empty.className = "dm-info-empty";
    empty.textContent = tr.dmInfoNoProfile || "No profile details yet";
    profileFacts.replaceChildren(empty);
  }

  mediaMeta.textContent = mediaMessages.length
    ? (tr.dmRecentMediaOnly || "{photos} photos in this chat").replace(
        "{photos}",
        `${mediaMessages.length}`
      )
    : tr.dmInfoNoMedia || "No photos yet";

  if (mediaMessages.length) {
    mediaGrid.replaceChildren(
      ...mediaMessages.map((message) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dm-info-media-thumb";
        button.setAttribute("data-dm-info-media-id", `${message.id || ""}`);
        const image = document.createElement("img");
        image.src = message.media_url;
        image.alt = getDmMessageSnippet(message, tr) || tr.dmPhotoMessage || "Photo";
        image.loading = "lazy";
        image.decoding = "async";
        button.appendChild(image);
        return button;
      })
    );
  } else {
    const empty = document.createElement("div");
    empty.className = "dm-info-empty";
    empty.textContent = tr.dmInfoNoMedia || "No photos yet";
    mediaGrid.replaceChildren(empty);
  }

  postsMeta.textContent = sharedPosts.length
    ? (tr.dmInfoPostsMeta || "{count} shared posts").replace(
        "{count}",
        `${sharedPosts.length}`
      )
    : tr.dmInfoNoPosts || "No shared posts yet";

  if (sharedPosts.length) {
    postsList.replaceChildren(...sharedPosts.map((item) => buildDmInfoLinkCard(item, tr)));
  } else {
    const empty = document.createElement("div");
    empty.className = "dm-info-empty";
    empty.textContent = tr.dmInfoNoPosts || "No shared posts yet";
    postsList.replaceChildren(empty);
  }

  linksMeta.textContent = sharedLinks.length
    ? (tr.dmInfoLinksMetaCount || tr.dmInfoLinksMeta || "{count} shared items").replace(
        "{count}",
        `${sharedLinks.length}`
      )
    : tr.dmInfoNoLinks || "No shared links yet";

  if (sharedLinks.length) {
    linksList.replaceChildren(...sharedLinks.map((item) => buildDmInfoLinkCard(item, tr)));
  } else {
    const empty = document.createElement("div");
    empty.className = "dm-info-empty";
    empty.textContent = tr.dmInfoNoLinks || "No shared links yet";
    linksList.replaceChildren(empty);
  }

  searchMeta.textContent = dmMessageSearchMatchIds.length
    ? (tr.dmSearchCounter || "{current}/{total}")
        .replace(
          "{current}",
          `${Math.max(1, dmMessageSearchActiveIndex + 1)}`
        )
        .replace("{total}", `${dmMessageSearchMatchIds.length}`)
    : tr.dmInfoSearchMeta || "Jump to messages by keyword";
  if (dmMessageSearchMatchIds.length) {
    const visibleHits = getDmVisibleSearchResults(3);
    searchHits.classList.remove("hidden");
    searchHits.replaceChildren(...visibleHits.map((item) => buildDmInfoSearchHitCard(item, tr)));
  } else {
    searchHits.classList.add("hidden");
    searchHits.replaceChildren();
  }

  pinBtn.textContent = isDmThreadPinned(active.id)
    ? tr.dmUnpinThread || "Unpin"
    : tr.dmPinThread || "Pin";
  pinBtn.classList.toggle("is-active", isDmThreadPinned(active.id));
  muteBtn.textContent = isDmThreadMuted(active.id)
    ? tr.dmUnmuteThread || "Unmute"
    : tr.dmMuteThread || "Mute";
  muteBtn.classList.toggle("is-active", isDmThreadMuted(active.id));
  markReadBtn.disabled = unreadCount <= 0;
  markReadBtn.classList.toggle("is-disabled", unreadCount <= 0);
  markReadBtn.setAttribute("aria-disabled", unreadCount <= 0 ? "true" : "false");

  panel.classList.toggle("hidden", !dmInfoPanelOpen);
  panel.setAttribute("aria-hidden", dmInfoPanelOpen ? "false" : "true");
  syncDmInfoTabs();
  if (typeof document !== "undefined") {
    document.body.classList.toggle("dm-info-panel-open", dmInfoPanelOpen);
  }
}

function renderDmChatContext() {
  const wrap = $("dm-chat-context");
  const label = $("dm-chat-context-label");
  const meta = $("dm-chat-context-meta");
  const strip = $("dm-chat-media-strip");
  if (!wrap || !label || !meta || !strip) return;
  const tr = getDmTranslations();
  const active = dmPartners.find((partner) => partner.id === dmActivePartnerId);
  const mediaMessages = active ? getDmConversationMediaMessages(6) : [];
  const shareCount = active ? getDmConversationShareCount() : 0;
  if (!active || (!mediaMessages.length && shareCount <= 0)) {
    wrap.classList.add("hidden");
    label.textContent = tr.dmRecentMediaLabel || "Recent media";
    meta.textContent = "";
    strip.replaceChildren();
    return;
  }

  wrap.classList.remove("hidden");
  label.textContent = tr.dmRecentMediaLabel || "Recent media";
  if (mediaMessages.length > 0 && shareCount > 0) {
    meta.textContent = (tr.dmRecentMediaMeta || "{photos} photos · {shares} shared")
      .replace("{photos}", `${mediaMessages.length}`)
      .replace("{shares}", `${shareCount}`);
  } else if (mediaMessages.length > 0) {
    meta.textContent = (tr.dmRecentMediaOnly || "{photos} photos in this chat").replace(
      "{photos}",
      `${mediaMessages.length}`
    );
  } else {
    meta.textContent = (tr.dmRecentSharedOnly || "{shares} shared posts").replace(
      "{shares}",
      `${shareCount}`
    );
  }

  const fragment = document.createDocumentFragment();
  mediaMessages.forEach((message) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dm-chat-media-thumb";
    button.setAttribute("data-dm-chat-media-id", `${message.id || ""}`);
    button.setAttribute("aria-label", tr.dmOpenPhoto || "Open photo");
    const image = document.createElement("img");
    image.src = message.media_url;
    image.alt = getDmMessageSnippet(message, tr) || tr.dmPhotoMessage || "Photo";
    image.loading = "lazy";
    image.decoding = "async";
    button.appendChild(image);
    fragment.appendChild(button);
  });
  strip.replaceChildren(fragment);
}

function renderDmPinnedMessageBar() {
  const wrap = $("dm-pinned-message");
  const label = $("dm-pinned-message-label");
  const openBtn = $("btn-dm-pinned-message-open");
  const clearBtn = $("btn-dm-pinned-message-clear");
  if (!wrap || !label || !openBtn || !clearBtn) return;
  const tr = getDmTranslations();
  label.textContent = tr.dmPinnedMessageLabel || "Pinned message";
  clearBtn.textContent = tr.dmUnpinMessage || "Unpin";

  const active = dmPartners.find((partner) => partner.id === dmActivePartnerId);
  const pinnedMessage = active ? getDmPinnedMessage(active.id) : null;
  if (!active || !pinnedMessage) {
    wrap.classList.add("hidden");
    openBtn.textContent = "-";
    openBtn.removeAttribute("title");
    clearBtn.classList.add("hidden");
    return;
  }

  const author = getDmReplyAuthorLabel(pinnedMessage, tr);
  const snippet =
    getDmMessageSnippet(pinnedMessage, tr) ||
    tr.dmPinnedMessageFallback ||
    tr.dmPhotoMessage ||
    "Message";
  const timestamp = formatThreadTimestamp(pinnedMessage.created_at);
  const line = [author, snippet, timestamp].filter(Boolean).join(" · ");
  openBtn.textContent = line;
  openBtn.title = line;
  wrap.classList.remove("hidden");
  clearBtn.classList.remove("hidden");
}

function closeDmActionSheet() {
  const sheet = $("dm-action-sheet");
  if (sheet) {
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
  }
  if (typeof document !== "undefined") {
    document.body.classList.remove("dm-action-sheet-open");
  }
  dmActionSheetMessageId = "";
}

function buildDmActionSheetHero(message, sharePayload, tr = getDmTranslations()) {
  if (getDmMessageHasImage(message)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dm-action-sheet-hero-card is-media";
    button.setAttribute("aria-label", tr.dmOpenPhoto || "Open photo");
    button.addEventListener("click", () => {
      closeDmActionSheet();
      openDmMediaMessage(message);
    });

    const image = document.createElement("img");
    image.src = message.media_url;
    image.alt = getDmMessageSnippet(message, tr) || tr.dmPhotoMessage || "Photo";
    image.loading = "lazy";
    image.decoding = "async";
    button.appendChild(image);

    const badge = document.createElement("span");
    badge.className = "dm-action-sheet-hero-badge";
    badge.textContent = tr.dmPhotoMessage || "Photo";
    button.appendChild(badge);
    return button;
  }

  if (sharePayload) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dm-action-sheet-hero-card is-share";
    if (sharePayload.kind === "link") {
      button.classList.add("is-link");
    }
    button.setAttribute(
      "aria-label",
      sharePayload.kind === "post"
        ? tr.dmSharedPostOpen || "Open post"
        : tr.dmOpenLink || "Open link"
    );
    button.addEventListener("click", () => {
      closeDmActionSheet();
      openDmSharedPayload(sharePayload);
    });

    const kicker = document.createElement("div");
    kicker.className = "dm-action-sheet-hero-kicker";
    kicker.textContent =
      sharePayload.kind === "post"
        ? tr.dmSharedPostBadge || "Post"
        : tr.dmInfoLinkBadge || "Link";
    button.appendChild(kicker);

    const title = document.createElement("div");
    title.className = "dm-action-sheet-hero-title";
    title.textContent =
      sharePayload.title || sharePayload.host || tr.dmSharedPostLead || "Shared post";
    button.appendChild(title);

    if (sharePayload.note) {
      const note = document.createElement("div");
      note.className = "dm-action-sheet-hero-note";
      note.textContent = sharePayload.note;
      button.appendChild(note);
    }

    const meta = document.createElement("div");
    meta.className = "dm-action-sheet-hero-meta";
    meta.textContent = sharePayload.host || sharePayload.url || "";
    button.appendChild(meta);
    return button;
  }

  return null;
}

function openDmActionSheet(messageId) {
  const message = getDmMessageById(messageId);
  if (!message || message.pending) return;
  closeDmInfoPanel();
  const sheet = $("dm-action-sheet");
  const title = $("dm-action-sheet-title");
  const meta = $("dm-action-sheet-meta");
  const badges = $("dm-action-sheet-badges");
  const text = $("dm-action-sheet-text");
  const hero = $("dm-action-sheet-hero");
  const actions = $("dm-action-sheet-actions");
  if (!sheet || !title || !meta || !badges || !text || !hero || !actions) return;

  const tr = getDmTranslations();
  dmActionSheetMessageId = `${messageId || ""}`.trim();
  const senderLabel = getDmReplyAuthorLabel(message, tr);
  const sharePayload = parseDmLinkedMessage(message, tr);
  const snippet =
    getDmMessageSnippet(message, tr) ||
    sharePayload?.url ||
    `${message.media_url || ""}`.trim() ||
    tr.dmPhotoMessage ||
    "";

  title.textContent = senderLabel;
  meta.textContent = formatDateTimeDisplay(message.created_at) || "";
  badges.replaceChildren();
  const badgeItems = [];
  if (parseDmReplyMessage(message)) {
    badgeItems.push(tr.dmReplyBadge || "Reply");
  }
  if (getDmMessageHasImage(message)) {
    badgeItems.push(tr.dmPhotoMessage || "Photo");
  }
  if (sharePayload?.kind === "post") {
    badgeItems.push(tr.dmSharedPostBadge || "Shared post");
  } else if (sharePayload?.kind === "link") {
    badgeItems.push(tr.dmInfoLinkBadge || "Link");
  }
  if (getDmPinnedMessageId(dmActivePartnerId) === `${message.id || ""}`.trim()) {
    badgeItems.push(tr.dmPinnedMessageLabel || "Pinned");
  }
  badges.append(
    ...badgeItems.map((item) => {
      const badge = document.createElement("span");
      badge.className = "dm-action-sheet-badge";
      badge.textContent = item;
      return badge;
    })
  );
  badges.classList.toggle("hidden", badgeItems.length === 0);
  text.textContent = snippet;
  hero.replaceChildren();
  const heroCard = buildDmActionSheetHero(message, sharePayload, tr);
  if (heroCard) {
    hero.appendChild(heroCard);
  }
  hero.classList.toggle("hidden", !heroCard);
  actions.replaceChildren();
  const primaryGroup = document.createElement("div");
  primaryGroup.className = "dm-action-sheet-group is-primary";
  const secondaryGroup = document.createElement("div");
  secondaryGroup.className = "dm-action-sheet-group is-secondary";
  actions.append(primaryGroup, secondaryGroup);

  const addAction = (key, labelText, onClick, options = {}) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dm-action-sheet-btn";
    button.classList.add(options.group === "primary" ? "is-primary" : "is-secondary");
    if (options.tone) {
      button.classList.add(`is-${options.tone}`);
    }
    button.setAttribute("data-dm-action-key", key);
    const icon = document.createElement("span");
    icon.className = "dm-action-sheet-btn-icon";
    icon.textContent = options.icon || "•";
    button.appendChild(icon);

    const copy = document.createElement("span");
    copy.className = "dm-action-sheet-btn-copy";
    const label = document.createElement("span");
    label.className = "dm-action-sheet-btn-label";
    label.textContent = labelText;
    copy.appendChild(label);
    if (options.detail) {
      const detail = document.createElement("span");
      detail.className = "dm-action-sheet-btn-detail";
      detail.textContent = options.detail;
      copy.appendChild(detail);
    }
    button.appendChild(copy);

    button.addEventListener("click", async () => {
      closeDmActionSheet();
      await onClick();
    });
    (options.group === "primary" ? primaryGroup : secondaryGroup).appendChild(button);
  };

  addAction("reply", tr.dmReplyAction || "Reply", async () => {
    setDmReplyTarget(message.id);
  }, { group: "primary", icon: "↩" });

  addAction("react", tr.dmReactAction || "React", async () => {
    dmReactionPickerMessageId = `${message.id || ""}`.trim();
    renderConversationMessages({ forceFull: true });
    scrollToDmMessage(message.id, { block: "nearest" });
  }, { group: "primary", icon: "✦" });

  if (!hasDmReactionFromCurrentUser(message.id, DM_QUICK_LIKE_EMOJI)) {
    addAction("like", tr.dmQuickLike || "Like", async () => {
      await sendDmQuickReaction(message.id, DM_QUICK_LIKE_EMOJI);
    }, { group: "primary", icon: "♥" });
  }

  addAction(
    "pin",
    getDmPinnedMessageId(dmActivePartnerId) === `${message.id || ""}`.trim()
      ? tr.dmUnpinMessage || "Unpin"
      : tr.dmPinMessage || "Pin message",
    async () => {
      toggleDmMessagePinned(message.id);
    },
    { group: "secondary", icon: "⌖" }
  );

  addAction("copy", tr.dmCopyMessage || "Copy", async () => {
    await copyDmMessageContent(message);
  }, { group: "secondary", icon: "⎘" });

  if (getDmMessageHasImage(message)) {
    addAction("photo", tr.dmOpenPhoto || "Open photo", async () => {
      openDmMediaMessage(message);
    }, { group: "secondary", icon: "◫", detail: tr.dmPhotoMessage || "Photo" });
  }

  if (sharePayload?.url) {
    addAction(
      "post",
      sharePayload.kind === "post"
        ? tr.dmSharedPostOpen || "Open post"
        : tr.dmOpenLink || "Open link",
      async () => {
        openDmSharedPayload(sharePayload);
      },
      {
        group: "secondary",
        icon: "↗",
        detail: sharePayload.kind === "post" ? (tr.dmSharedPostBadge || "Post") : sharePayload.host || "",
      }
    );
  }

  primaryGroup.style.setProperty(
    "--dm-primary-count",
    `${Math.max(1, primaryGroup.childElementCount)}`
  );
  secondaryGroup.classList.toggle("hidden", secondaryGroup.childElementCount === 0);

  sheet.classList.remove("hidden");
  sheet.setAttribute("aria-hidden", "false");
  if (typeof document !== "undefined") {
    document.body.classList.add("dm-action-sheet-open");
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
  const isPinnedMessage =
    !!message?.id && getDmPinnedMessageId(dmActivePartnerId) === `${message.id || ""}`.trim();
  row.classList.toggle("is-pinned", isPinnedMessage);
  const messageId = `${message?.id || ""}`.trim();
  const searchMatchIndex = dmMessageSearchMatchIds.indexOf(messageId);
  if (searchMatchIndex >= 0) {
    row.classList.add("is-search-match");
    if (searchMatchIndex === dmMessageSearchActiveIndex) {
      row.classList.add("is-search-active");
    }
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
  const sharePayload = parseDmLinkedMessage(message, tr);
  const hasImage = getDmMessageHasImage(message);
  bubble.classList.toggle("has-media", hasImage);
  bubble.classList.toggle("is-media-only", hasImage && !messageText && !sharePayload);
  bubble.classList.toggle("has-share", !!sharePayload);
  bubble.classList.toggle("has-reply", !!replyPayload);
  if (isPinnedMessage) {
    const pinnedBadge = document.createElement("div");
    pinnedBadge.className = "dm-message-pin-badge";
    pinnedBadge.textContent = tr.dmPinnedMessageLabel || "Pinned message";
    bubble.appendChild(pinnedBadge);
  }
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
      openDmMediaMessage(message);
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
      openDmSharedPayload(sharePayload);
    });

    const shareKicker = document.createElement("div");
    shareKicker.className = "dm-message-share-kicker";
    if (sharePayload.kind === "link") {
      shareKicker.classList.add("is-link");
    }
    shareKicker.textContent =
      sharePayload.kind === "post"
        ? tr.dmSharedPostBadge || "Post"
        : tr.dmInfoLinkBadge || "Link";
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
    cta.textContent =
      sharePayload.kind === "post"
        ? tr.dmSharedPostOpen || "Open post"
        : tr.dmOpenLink || "Open link";
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

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "dm-message-tool is-icon";
    moreBtn.setAttribute("aria-label", tr.dmMessageMore || "More");
    moreBtn.setAttribute("title", tr.dmMessageMore || "More");
    moreBtn.setAttribute("data-dm-message-more", `${message?.id || ""}`);
    moreBtn.textContent = "⋯";
    tools.appendChild(moreBtn);

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
    if (message.read_at && partnerProfile) {
      const seenAvatar = document.createElement("span");
      seenAvatar.className = "avatar dm-message-seen-avatar";
      const partnerIdentity = getProfileIdentity(partnerProfile, message.recipient_id);
      renderAvatar(seenAvatar, partnerProfile, partnerIdentity.initial);
      seenAvatar.setAttribute("aria-hidden", "true");
      const seenLabel = document.createElement("span");
      seenLabel.textContent = stateLabel;
      meta.append(seenAvatar, seenLabel);
    } else {
      meta.textContent = stateLabel;
    }
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
  const shouldRestoreScroll = !!options.restoreScroll && !shouldStickToBottom;
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
    renderDmChatContext();
    renderDmPinnedMessageBar();
    renderDmEntryContext();
    updateDmMessageSearchState();
    renderDmInfoPanel();
    syncDmJumpLatestButton();
    return;
  }

  if (!dmMessages.length) {
    renderEmptyConversationState(list, activePartner, tr);
    dmRenderedMessagePartnerId = dmActivePartnerId;
    dmRenderedMessageKeys = [];
    dmReactionPickerMessageId = "";
    renderDmChatContext();
    renderDmPinnedMessageBar();
    renderDmEntryContext();
    updateDmMessageSearchState();
    renderDmInfoPanel();
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
        saveDmConversationScroll(dmActivePartnerId);
        syncDmJumpLatestButton();
      });
    } else if (shouldRestoreScroll) {
      restoreDmConversationScroll(list, dmActivePartnerId);
    }
    dmRenderedMessagePartnerId = dmActivePartnerId;
    dmRenderedMessageKeys = nextMessageKeys;
    renderDmEntryContext();
    updateDmMessageSearchState();
    renderDmInfoPanel();
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
      saveDmConversationScroll(dmActivePartnerId);
      syncDmJumpLatestButton();
    });
  } else if (shouldRestoreScroll) {
    restoreDmConversationScroll(list, dmActivePartnerId);
  }
  dmRenderedMessagePartnerId = dmActivePartnerId;
  dmRenderedMessageKeys = nextMessageKeys;
  renderDmChatContext();
  renderDmPinnedMessageBar();
  renderDmEntryContext();
  updateDmMessageSearchState();
  renderDmInfoPanel();
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
    renderConversationMessages({
      forceBottom: !!options.forceBottom,
      restoreScroll: options.restoreScroll !== false,
    });
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
          partnerLastAt: row.sender_id === partnerId ? row.created_at : "",
          lastMediaUrl: `${row.media_url || ""}`.trim(),
          lastMediaType: `${row.media_type || ""}`.trim(),
          unreadCount: 0,
          profile: null,
        });
      } else if (row.sender_id === partnerId) {
        const current = threadByPartner.get(partnerId);
        if (current && !current.partnerLastAt) {
          current.partnerLastAt = row.created_at;
        }
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
    const hasSavedScroll = !!getDmSavedScrollState(dmActivePartnerId);
    await loadConversation(dmActivePartnerId, {
      forceBottom: preservePartner ? !hasSavedScroll : true,
      restoreScroll: preservePartner && hasSavedScroll,
    });
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
    clearDmDraft(partnerId);
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
  const jumpUnreadBtn = $("btn-dm-jump-unread");
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
  if (jumpUnreadBtn && jumpUnreadBtn.dataset.bound !== "true") {
    jumpUnreadBtn.dataset.bound = "true";
    jumpUnreadBtn.addEventListener("click", () => {
      if (!messageList) return;
      const unreadDivider = messageList.querySelector(".dm-unread-divider");
      if (unreadDivider instanceof HTMLElement) {
        unreadDivider.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      const targetId = `${dmUnreadDividerMessageId || ""}`.trim();
      if (targetId) {
        scrollToDmMessage(targetId, { block: "center" });
      }
    });
  }

  const pinnedMessageOpenBtn = $("btn-dm-pinned-message-open");
  if (pinnedMessageOpenBtn && pinnedMessageOpenBtn.dataset.bound !== "true") {
    pinnedMessageOpenBtn.dataset.bound = "true";
    pinnedMessageOpenBtn.addEventListener("click", () => {
      const messageId = getDmPinnedMessageId(dmActivePartnerId);
      if (!messageId) return;
      if (!scrollToDmMessage(messageId, { block: "center" })) {
        showToast(getDmTranslations().dmReplyJumpUnavailable || "Message not found.", "info");
      }
    });
  }

  const pinnedMessageClearBtn = $("btn-dm-pinned-message-clear");
  if (pinnedMessageClearBtn && pinnedMessageClearBtn.dataset.bound !== "true") {
    pinnedMessageClearBtn.dataset.bound = "true";
    pinnedMessageClearBtn.addEventListener("click", () => {
      if (!dmActivePartnerId) return;
      if (!clearDmPinnedMessage(dmActivePartnerId)) return;
      showToast(
        getDmTranslations().dmMessageUnpinned || "Pinned message cleared.",
        "success"
      );
      renderConversationMessages({ forceFull: true });
      renderDmInfoPanel();
    });
  }

  const entryDismissBtn = $("btn-dm-entry-dismiss");
  if (entryDismissBtn && entryDismissBtn.dataset.bound !== "true") {
    entryDismissBtn.dataset.bound = "true";
    entryDismissBtn.addEventListener("click", () => {
      clearDmEntryContext();
      renderDmEntryContext();
    });
  }

  const entryOpenProfileBtn = $("btn-dm-entry-open-profile");
  if (entryOpenProfileBtn && entryOpenProfileBtn.dataset.bound !== "true") {
    entryOpenProfileBtn.dataset.bound = "true";
    entryOpenProfileBtn.addEventListener("click", () => {
      const targetPartnerId =
        dmEntryContext?.partnerId && dmEntryContext.partnerId === dmActivePartnerId
          ? dmEntryContext.partnerId
          : dmActivePartnerId;
      if (!targetPartnerId) return;
      openDmPartnerProfile(targetPartnerId);
    });
  }

  const entryOpenPostBtn = $("btn-dm-entry-open-post");
  if (entryOpenPostBtn && entryOpenPostBtn.dataset.bound !== "true") {
    entryOpenPostBtn.dataset.bound = "true";
    entryOpenPostBtn.addEventListener("click", () => {
      const postId =
        dmEntryContext?.partnerId === dmActivePartnerId
          ? `${dmEntryContext?.postId || ""}`.trim()
          : "";
      if (!postId) return;
      setActivePage("feed");
      requestAnimationFrame(() => {
        openDmPostDetail(postId);
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

  const searchBtn = $("btn-dm-search");
  const infoBtn = $("btn-dm-info");
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

  if (searchBtn && searchBtn.dataset.bound !== "true") {
    searchBtn.dataset.bound = "true";
    searchBtn.addEventListener("click", () => {
      closeDmActionSheet();
      closeDmInfoPanel();
      setDmMessageSearchOpen(!dmMessageSearchOpen);
      renderConversationHeader({ force: true });
      updateDmMessageSearchState();
      renderDmInfoPanel();
      if (dmMessageSearchOpen) {
        const inputEl = $("dm-message-search");
        if (inputEl) inputEl.focus();
      }
    });
  }

  if (infoBtn && infoBtn.dataset.bound !== "true") {
    infoBtn.dataset.bound = "true";
    infoBtn.addEventListener("click", () => {
      closeDmActionSheet();
      dmInfoPanelOpen = !dmInfoPanelOpen;
      renderConversationHeader({ force: true });
      renderDmInfoPanel();
    });
  }

  const searchInput = $("dm-message-search");
  if (searchInput && searchInput.dataset.bound !== "true") {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", () => {
      dmMessageSearchQuery = `${searchInput.value || ""}`.trim();
      dmMessageSearchActiveIndex = 0;
      updateDmMessageSearchState();
      renderConversationMessages({ forceFull: true });
      if (dmMessageSearchMatchIds.length) {
        scrollToDmMessage(dmMessageSearchMatchIds[dmMessageSearchActiveIndex], {
          block: "center",
        });
      }
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        goToDmSearchMatch(event.shiftKey ? -1 : 1);
      }
    });
  }

  const prevSearchBtn = $("btn-dm-message-search-prev");
  if (prevSearchBtn && prevSearchBtn.dataset.bound !== "true") {
    prevSearchBtn.dataset.bound = "true";
    prevSearchBtn.addEventListener("click", () => {
      goToDmSearchMatch(-1);
    });
  }

  const nextSearchBtn = $("btn-dm-message-search-next");
  if (nextSearchBtn && nextSearchBtn.dataset.bound !== "true") {
    nextSearchBtn.dataset.bound = "true";
    nextSearchBtn.addEventListener("click", () => {
      goToDmSearchMatch(1);
    });
  }

  const closeSearchBtn = $("btn-dm-message-search-close");
  if (closeSearchBtn && closeSearchBtn.dataset.bound !== "true") {
    closeSearchBtn.dataset.bound = "true";
    closeSearchBtn.addEventListener("click", () => {
      setDmMessageSearchOpen(false);
      renderConversationHeader({ force: true });
      renderConversationMessages({ forceFull: true });
      renderDmInfoPanel();
    });
  }

  const searchDays = $("dm-message-search-days");
  if (searchDays && searchDays.dataset.bound !== "true") {
    searchDays.dataset.bound = "true";
    searchDays.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dm-search-day-index]");
      if (!button) return;
      const nextIndex = Number(button.getAttribute("data-dm-search-day-index") || "-1");
      if (!Number.isFinite(nextIndex) || nextIndex < 0) return;
      dmMessageSearchActiveIndex = Math.min(
        nextIndex,
        Math.max(0, dmMessageSearchMatchIds.length - 1)
      );
      updateDmMessageSearchState();
      renderConversationMessages({ forceFull: true });
      const messageId = dmMessageSearchMatchIds[dmMessageSearchActiveIndex];
      if (messageId) {
        scrollToDmMessage(messageId, { block: "center" });
      }
    });
  }

  const searchResults = $("dm-message-search-results");
  if (searchResults && searchResults.dataset.bound !== "true") {
    searchResults.dataset.bound = "true";
    searchResults.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dm-search-result-index]");
      if (!(button instanceof HTMLButtonElement)) return;
      const nextIndex = Number(button.getAttribute("data-dm-search-result-index") || "-1");
      if (!Number.isFinite(nextIndex) || nextIndex < 0) return;
      dmMessageSearchActiveIndex = Math.min(
        nextIndex,
        Math.max(0, dmMessageSearchMatchIds.length - 1)
      );
      updateDmMessageSearchState();
      renderConversationMessages({ forceFull: true });
      const messageId = dmMessageSearchMatchIds[dmMessageSearchActiveIndex];
      if (messageId) {
        scrollToDmMessage(messageId, { block: "center" });
      }
    });
  }

  const infoSearchHits = $("dm-info-search-hits");
  if (infoSearchHits && infoSearchHits.dataset.bound !== "true") {
    infoSearchHits.dataset.bound = "true";
    infoSearchHits.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dm-search-result-index]");
      if (!(button instanceof HTMLButtonElement)) return;
      const nextIndex = Number(button.getAttribute("data-dm-search-result-index") || "-1");
      if (!Number.isFinite(nextIndex) || nextIndex < 0) return;
      dmMessageSearchActiveIndex = Math.min(
        nextIndex,
        Math.max(0, dmMessageSearchMatchIds.length - 1)
      );
      updateDmMessageSearchState();
      closeDmInfoPanel();
      renderConversationHeader({ force: true });
      renderConversationMessages({ forceFull: true });
      const messageId = dmMessageSearchMatchIds[dmMessageSearchActiveIndex];
      if (messageId) {
        scrollToDmMessage(messageId, { block: "center" });
      }
    });
  }

  const infoBackdrop = $("btn-dm-info-backdrop");
  if (infoBackdrop && infoBackdrop.dataset.bound !== "true") {
    infoBackdrop.dataset.bound = "true";
    infoBackdrop.addEventListener("click", () => {
      closeDmInfoPanel();
      renderConversationHeader({ force: true });
    });
  }

  const infoCloseBtn = $("btn-dm-info-close");
  if (infoCloseBtn && infoCloseBtn.dataset.bound !== "true") {
    infoCloseBtn.dataset.bound = "true";
    infoCloseBtn.addEventListener("click", () => {
      closeDmInfoPanel();
      renderConversationHeader({ force: true });
    });
  }

  const infoOpenProfileBtn = $("btn-dm-info-open-profile");
  if (infoOpenProfileBtn && infoOpenProfileBtn.dataset.bound !== "true") {
    infoOpenProfileBtn.dataset.bound = "true";
    infoOpenProfileBtn.addEventListener("click", () => {
      if (!dmActivePartnerId) return;
      openDmPartnerProfile(dmActivePartnerId);
      closeDmInfoPanel();
      renderConversationHeader({ force: true });
    });
  }

  const infoMarkReadBtn = $("btn-dm-info-mark-read");
  if (infoMarkReadBtn && infoMarkReadBtn.dataset.bound !== "true") {
    infoMarkReadBtn.dataset.bound = "true";
    infoMarkReadBtn.addEventListener("click", async () => {
      if (!dmActivePartnerId) return;
      const tr = getDmTranslations();
      setSendStatus(tr.dmLoading || "Loading...", "loading");
      const marked = await markConversationRead(dmActivePartnerId);
      if (!marked) {
        setSendStatus(tr.dmMarkReadError || tr.dmLoadError || "Failed to mark read.", "error");
        return;
      }
      renderDmInfoPanel();
      setSendStatus(tr.dmMarkedRead || "Marked as read.", "success");
      setTimeout(() => setSendStatus("", ""), 1200);
    });
  }

  const infoPinBtn = $("btn-dm-info-pin");
  if (infoPinBtn && infoPinBtn.dataset.bound !== "true") {
    infoPinBtn.dataset.bound = "true";
    infoPinBtn.addEventListener("click", () => {
      if (!dmActivePartnerId) return;
      toggleDmThreadPinned(dmActivePartnerId);
      renderDmInfoPanel();
    });
  }

  const infoMuteBtn = $("btn-dm-info-mute");
  if (infoMuteBtn && infoMuteBtn.dataset.bound !== "true") {
    infoMuteBtn.dataset.bound = "true";
    infoMuteBtn.addEventListener("click", () => {
      if (!dmActivePartnerId) return;
      toggleDmThreadMuted(dmActivePartnerId);
      renderDmInfoPanel();
    });
  }

  const infoOpenSearchBtn = $("btn-dm-info-open-search");
  if (infoOpenSearchBtn && infoOpenSearchBtn.dataset.bound !== "true") {
    infoOpenSearchBtn.dataset.bound = "true";
    infoOpenSearchBtn.addEventListener("click", () => {
      setDmMessageSearchOpen(true);
      closeDmInfoPanel();
      renderConversationHeader({ force: true });
      renderDmInfoPanel();
      const inputEl = $("dm-message-search");
      if (inputEl) inputEl.focus();
    });
  }

  const infoTabs = $("dm-info-tabs");
  if (infoTabs && infoTabs.dataset.bound !== "true") {
    infoTabs.dataset.bound = "true";
    infoTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dm-info-tab]");
      if (!(button instanceof HTMLButtonElement)) return;
      const nextTab = `${button.getAttribute("data-dm-info-tab") || "overview"}`.trim();
      setDmInfoTab(nextTab);
      renderDmInfoPanel();
    });
  }

  const infoMediaGrid = $("dm-info-media-grid");
  if (infoMediaGrid && infoMediaGrid.dataset.bound !== "true") {
    infoMediaGrid.dataset.bound = "true";
    infoMediaGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dm-info-media-id]");
      if (!button) return;
      const messageId = `${button.getAttribute("data-dm-info-media-id") || ""}`.trim();
      const message = getDmMessageById(messageId);
      if (!message) return;
      openDmMediaMessage(message);
    });
  }

  const bindDmInfoLinksClick = (listEl) => {
    if (!(listEl instanceof HTMLElement) || listEl.dataset.bound === "true") return;
    listEl.dataset.bound = "true";
    listEl.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-dm-info-link-url]");
      if (!button) return;
      const url = `${button.getAttribute("data-dm-info-link-url") || ""}`.trim();
      const kind = `${button.getAttribute("data-dm-info-link-kind") || "link"}`.trim();
      if (!url) return;
      const postId = `${button.getAttribute("data-dm-info-post-id") || ""}`.trim();
      const payload = { url, kind, postId };
      const target = event.target;
      const isCta = target instanceof HTMLElement && target.classList.contains("dm-info-link-cta");
      if (
        isCta &&
        kind !== "post" &&
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        try {
          await navigator.clipboard.writeText(url);
          showToast(getDmTranslations().dmMessageCopied || "Copied.", "success");
          return;
        } catch (error) {
          console.error("copy dm info link failed", error);
        }
      }
      openDmSharedPayload(payload);
    });
  };
  bindDmInfoLinksClick($("dm-info-posts-list"));
  bindDmInfoLinksClick($("dm-info-links-list"));

  const threadSearchInput = $("dm-thread-search");
  if (threadSearchInput && threadSearchInput.dataset.bound !== "true") {
    threadSearchInput.dataset.bound = "true";
    threadSearchInput.addEventListener("input", () => {
      dmThreadSearch = `${threadSearchInput.value || ""}`.trim();
      scheduleThreadSearchRender();
    });
  }

  const presenceStrip = $("dm-presence-strip-list");
  if (presenceStrip && presenceStrip.dataset.bound !== "true") {
    presenceStrip.dataset.bound = "true";
    presenceStrip.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dm-presence-partner]");
      if (!(button instanceof HTMLButtonElement)) return;
      const partnerId = `${button.getAttribute("data-dm-presence-partner") || ""}`.trim();
      if (!partnerId) return;
      selectDmPartner(partnerId, { forceBottom: true });
    });
  }

  const clearSearchBtn = $("btn-dm-thread-search-clear");
  if (clearSearchBtn && clearSearchBtn.dataset.bound !== "true") {
    clearSearchBtn.dataset.bound = "true";
    clearSearchBtn.addEventListener("click", () => {
      dmThreadSearch = "";
      if (threadSearchInput) threadSearchInput.value = "";
      scheduleThreadSearchRender();
      if (threadSearchInput) threadSearchInput.focus();
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

  const chatMediaStrip = $("dm-chat-media-strip");
  if (chatMediaStrip && chatMediaStrip.dataset.bound !== "true") {
    chatMediaStrip.dataset.bound = "true";
    chatMediaStrip.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dm-chat-media-id]");
      if (!button) return;
      const messageId = `${button.getAttribute("data-dm-chat-media-id") || ""}`.trim();
      const message = getDmMessageById(messageId);
      if (!message) return;
      openDmMediaMessage(message);
    });
  }

  const actionSheetBackdrop = $("btn-dm-action-sheet-backdrop");
  if (actionSheetBackdrop && actionSheetBackdrop.dataset.bound !== "true") {
    actionSheetBackdrop.dataset.bound = "true";
    actionSheetBackdrop.addEventListener("click", () => {
      closeDmActionSheet();
    });
  }

  const input = $("dm-input");
  if (input && input.dataset.bound !== "true") {
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      scheduleDmInputMetricsUpdate();
      persistDmDraft(dmActivePartnerId);
      const hasDraft = `${input.value || ""}`.trim().length > 0;
      sendDmTypingState(hasDraft);
    });
    input.addEventListener("blur", () => {
      persistDmDraft(dmActivePartnerId, { refreshList: true });
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
    messageList.addEventListener("scroll", () => {
      saveDmConversationScroll(dmActivePartnerId);
      syncDmJumpLatestButton();
    });
    messageList.addEventListener("click", (event) => {
      const moreButton = event.target.closest("[data-dm-message-more]");
      if (moreButton) {
        const messageId = `${moreButton.getAttribute("data-dm-message-more") || ""}`.trim();
        if (messageId) {
          openDmActionSheet(messageId);
        }
        return;
      }
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
          persistDmDraft(dmActivePartnerId);
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
    messageList.addEventListener("contextmenu", (event) => {
      const row = event.target.closest(".dm-message-row[data-dm-message-id]");
      if (!row) return;
      if (event.target.closest("button, a, input, textarea")) return;
      const messageId = `${row.getAttribute("data-dm-message-id") || ""}`.trim();
      if (!messageId) return;
      event.preventDefault();
      openDmActionSheet(messageId);
    });
    messageList.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      const row = event.target.closest(".dm-message-row[data-dm-message-id]");
      if (!row) return;
      if (event.target.closest("button, a, input, textarea")) return;
      const messageId = `${row.getAttribute("data-dm-message-id") || ""}`.trim();
      if (!messageId) return;
      clearDmMessagePressTimer();
      dmMessagePressTimer = window.setTimeout(() => {
        dmMessagePressTimer = null;
        openDmActionSheet(messageId);
      }, 420);
    });
    ["pointerup", "pointercancel", "pointerleave", "pointermove"].forEach((eventName) => {
      messageList.addEventListener(eventName, () => {
        clearDmMessagePressTimer();
      });
    });
  }
  if (typeof document !== "undefined" && document.body.dataset.dmActionSheetBound !== "true") {
    document.body.dataset.dmActionSheetBound = "true";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dmActionSheetMessageId) {
        closeDmActionSheet();
        return;
      }
      if (event.key === "Escape" && dmInfoPanelOpen) {
        closeDmInfoPanel();
        renderConversationHeader({ force: true });
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
  saveDmConversationScroll(dmActivePartnerId);
  persistDmDraft(dmActivePartnerId, { refreshList: true });
  setDmMessageSearchOpen(false);
  closeDmActionSheet();
  closeDmComposeModal();
  closeDmInfoPanel();
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
  const jumpUnreadBtn = $("btn-dm-jump-unread");
  const jumpLatestBtn = $("btn-dm-jump-latest");

  if (!currentUser) {
    stopDmPolling();
    setDmMessageSearchOpen(false);
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
    if (jumpUnreadBtn) jumpUnreadBtn.classList.add("hidden");
    if (jumpLatestBtn) jumpLatestBtn.classList.add("hidden");
    renderDmReplyComposer();
    renderDmPresenceStrip();
    renderDmChatContext();
    renderDmPinnedMessageBar();
    renderDmEntryContext();
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
  renderDmPinnedMessageBar();
  renderDmEntryContext();
  restoreDmDraft(dmActivePartnerId);
  updateDmComposerState();
  updateDmMessageSearchState();
  renderDmInfoPanel();
  syncDmJumpLatestButton();

  if (options.refreshIfNeeded && !dmThreadsLoaded) {
    refreshDmData({ preservePartner: true }).catch((error) => {
      console.error("renderDmPage refresh failed:", error);
    });
  }
}
