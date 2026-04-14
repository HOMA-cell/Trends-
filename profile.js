import { t } from "./i18n.js";
import {
  $,
  showToast,
  renderAvatar,
  formatHandle,
  formatDateDisplay,
  formatHeight,
  formatWeight,
  computeStreak,
  toDateKey,
  normalizeUrl,
  normalizeHandleUrl,
} from "./utils.js";

let profileContext = {
  getCurrentUser: () => null,
  getCurrentLang: () => "ja",
  getCurrentProfile: () => null,
  setCurrentProfile: () => {},
  getSettings: () => ({}),
  getAllPosts: () => [],
  getUserPosts: () => [],
  getWorkoutLogsByPost: () => new Map(),
  getLikesByPost: () => new Map(),
  getCommentsByPost: () => new Map(),
  getProfilePostCount: () => 0,
  getFollowingCount: () => 0,
  getFollowersCount: () => 0,
  getFollowingIds: () => new Set(),
  getCurrentPublicProfileId: () => null,
  setCurrentPublicProfileId: () => {},
  getPublicPostsVisibleCount: () => 0,
  setPublicPostsVisibleCount: () => {},
  getPublicPostsPageSize: () => 4,
  setCurrentGalleryPosts: () => {},
  getGalleryPage: () => 1,
  setGalleryPage: () => {},
  renderGalleryPage: () => {},
  getProfile: async () => null,
  getFollowCounts: async () => ({ following: 0, followers: 0 }),
  setActivePage: () => {},
  openPostDetail: () => {},
  openDmConversation: async () => false,
  toggleFollowForUser: async () => {},
  loadFollowStats: async () => {},
};

export function setProfileContext(next = {}) {
  profileContext = { ...profileContext, ...next };
}

const getCurrentUser = () => profileContext.getCurrentUser?.();
const getCurrentLang = () => profileContext.getCurrentLang?.() || "ja";
const getCurrentProfile = () => profileContext.getCurrentProfile?.();
const getSettings = () => profileContext.getSettings?.() || {};
const getAllPosts = () => profileContext.getAllPosts?.() || [];
const getUserPosts = () => profileContext.getUserPosts?.() || [];
const getWorkoutLogsByPost = () => profileContext.getWorkoutLogsByPost?.() || new Map();
const getLikesByPost = () => profileContext.getLikesByPost?.() || new Map();
const getCommentsByPost = () => profileContext.getCommentsByPost?.() || new Map();
const getProfilePostCount = () => profileContext.getProfilePostCount?.() || 0;
const getFollowingCount = () => profileContext.getFollowingCount?.() || 0;
const getFollowersCount = () => profileContext.getFollowersCount?.() || 0;
const getFollowingIds = () => profileContext.getFollowingIds?.() || new Set();
const getCurrentPublicProfileId = () => profileContext.getCurrentPublicProfileId?.();
const setCurrentPublicProfileId = (id) => profileContext.setCurrentPublicProfileId?.(id);
const getPublicPostsVisibleCount = () => profileContext.getPublicPostsVisibleCount?.() || 0;
const setPublicPostsVisibleCount = (count) => profileContext.setPublicPostsVisibleCount?.(count);
const getPublicPostsPageSize = () => profileContext.getPublicPostsPageSize?.() || 4;
const setCurrentGalleryPosts = (posts) => profileContext.setCurrentGalleryPosts?.(posts);
const getGalleryPage = () => profileContext.getGalleryPage?.() || 1;
const setGalleryPage = (page) => profileContext.setGalleryPage?.(page);
const renderGalleryPage = () => profileContext.renderGalleryPage?.();
const getProfile = (...args) => profileContext.getProfile?.(...args);
const getFollowCounts = (...args) => profileContext.getFollowCounts?.(...args);
const setActivePage = (page) => profileContext.setActivePage?.(page);
const openPostDetail = (...args) => profileContext.openPostDetail?.(...args);
const openDmConversation = (...args) => profileContext.openDmConversation?.(...args);
const toggleFollowForUser = (...args) => profileContext.toggleFollowForUser?.(...args);
const loadFollowStats = (...args) => profileContext.loadFollowStats?.(...args);
const followCountCache = new Map();
const FOLLOW_COUNT_CACHE_TTL_MS = 60 * 1000;
const publicProfilePostsCache = {
  postsRef: null,
  viewerId: "",
  byUser: new Map(),
};
let publicProfileGallerySignature = "";
let currentPublicProfileContentTab = "posts";
let currentPublicProfileEntryContext = null;
let pendingPublicProfileReveal = null;
let publicProfileRevealTimer = null;
const profileCompactCountFormatter =
  typeof Intl !== "undefined"
    ? new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
      })
    : null;
function formatProfileCompactCount(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  if (!profileCompactCountFormatter) return `${Math.round(numeric)}`;
  return profileCompactCountFormatter.format(numeric);
}
const PROFILE_PINNED_POST_KEY = "trends_profile_pinned_post_v1";
function getPinnedPostsMap() {
  try {
    const raw = localStorage.getItem(PROFILE_PINNED_POST_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const normalized = {};
    Object.entries(parsed).forEach(([userId, postId]) => {
      const uid = `${userId || ""}`.trim();
      const pid = `${postId || ""}`.trim();
      if (!uid || !pid) return;
      normalized[uid] = pid;
    });
    return normalized;
  } catch {
    return {};
  }
}
function getPinnedPostIdForUser(userId) {
  const uid = `${userId || ""}`.trim();
  if (!uid) return "";
  const mapByUser = getPinnedPostsMap();
  return `${mapByUser[uid] || ""}`.trim();
}
function toTimeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
function isWithinDays(value, days = 7) {
  const time = toTimeValue(value);
  if (!time) return false;
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function normalizePublicProfileEntryContext(context = {}) {
  if (!context || typeof context !== "object") return null;
  const source = `${context.source || ""}`.trim();
  const userId = `${context.userId || context.partnerId || ""}`.trim();
  if (!source || !userId) return null;
  return {
    source,
    userId,
    notificationType: `${context.notificationType || ""}`.trim(),
    actorName: `${context.actorName || ""}`.trim(),
    actorHandle: `${context.actorHandle || ""}`.trim(),
    postId: `${context.postId || ""}`.trim(),
    commentId: `${context.commentId || ""}`.trim(),
    commentActorId: `${context.commentActorId || ""}`.trim(),
    commentCreatedAt: `${context.commentCreatedAt || ""}`.trim(),
    focusComments: !!context.focusComments,
  };
}

function buildPublicProfileEntryContextFromElement(target) {
  if (!(target instanceof HTMLElement)) return null;
  return normalizePublicProfileEntryContext({
    source: target.dataset.entrySource || "",
    userId: target.dataset.userId || target.getAttribute("data-user-id") || "",
    actorName: target.dataset.entryActorName || "",
    actorHandle: target.dataset.entryActorHandle || "",
    postId: target.dataset.entryPostId || "",
    commentId: target.dataset.entryCommentId || "",
    commentActorId: target.dataset.entryCommentActorId || "",
    commentCreatedAt: target.dataset.entryCommentCreatedAt || "",
    focusComments:
      `${target.dataset.entryFocusComments || ""}`.trim().toLowerCase() === "true",
  });
}

function normalizePublicProfileRevealState(reveal = {}) {
  if (!reveal || typeof reveal !== "object") return null;
  const userId = `${reveal.userId || ""}`.trim();
  const postId = `${reveal.postId || reveal.revealPostId || ""}`.trim();
  const tab = normalizePublicProfileContentTab(reveal.tab || reveal.revealTab || "posts");
  if (!userId || !postId) return null;
  return {
    userId,
    postId,
    tab,
  };
}

function clearPublicProfileRevealState() {
  pendingPublicProfileReveal = null;
  if (publicProfileRevealTimer) {
    clearTimeout(publicProfileRevealTimer);
    publicProfileRevealTimer = null;
  }
}

function revealPublicProfilePostCard({ userId = "", postId = "", tab = "posts" } = {}) {
  const normalizedUserId = `${userId || ""}`.trim();
  const normalizedPostId = `${postId || ""}`.trim();
  if (!normalizedUserId || !normalizedPostId) return;
  if (`${getCurrentPublicProfileId() || ""}`.trim() !== normalizedUserId) return;
  const selectors =
    tab === "media"
      ? [
          `#public-profile-gallery .gallery-item[data-post-id="${normalizedPostId}"]`,
          `#public-profile-content-rail .public-profile-rail-card[data-post-id="${normalizedPostId}"]`,
        ]
      : [
          `#public-profile-posts-list .public-profile-post-card[data-post-id="${normalizedPostId}"]`,
          `#public-profile-content-rail .public-profile-rail-card[data-post-id="${normalizedPostId}"]`,
        ];
  const target = selectors
    .map((selector) => document.querySelector(selector))
    .find(Boolean);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  target.classList.add("is-revealed");
  if (publicProfileRevealTimer) {
    clearTimeout(publicProfileRevealTimer);
  }
  publicProfileRevealTimer = setTimeout(() => {
    target.classList.remove("is-revealed");
    publicProfileRevealTimer = null;
  }, 1800);
}

function buildPublicProfileEntryLabel(context, tr) {
  if (!context) return "";
  if (context.source === "notification" && context.notificationType === "follow") {
    return tr.profileEntryFromFollow || "From follow notification";
  }
  if (context.source === "comment") {
    return tr.profileEntryFromComment || "From discussion";
  }
  if (context.source === "shorts") {
    return tr.profileEntryFromShorts || "From Shorts";
  }
  if (context.source === "feed") {
    return tr.profileEntryFromFeed || "From feed";
  }
  return tr.profileEntryFromNotification || "From notification";
}

function buildPublicProfileEntryText(context, { canMessage = false, isFollowing = false, tr }) {
  if (!context) return "";
  const actorHandle = formatHandle(context.actorHandle || "");
  const actorDisplay = context.actorName || actorHandle || "";
  if (context.source === "notification" && context.notificationType === "follow") {
    const prompt =
      canMessage && !isFollowing
        ? tr.profileEntryPromptFollowBack || "Follow back or start with a message"
        : tr.profileEntryPromptMessage || "Start the conversation with a message";
    return actorDisplay ? `${actorDisplay} · ${prompt}` : prompt;
  }
  if (context.source === "comment") {
    return (
      tr.profileEntryPromptComment ||
      "Return to the discussion or open the post again."
    );
  }
  if (context.source === "shorts") {
    return tr.profileEntryPromptShorts || "Jump back to the short you were watching.";
  }
  if (context.source === "feed") {
    return tr.profileEntryPromptFeed || "Go back to the post you opened from feed.";
  }
  return actorDisplay || "";
}

function buildPublicProfileEntryAction(context, tr) {
  if (!context?.postId) return null;
  if (context.source === "comment") {
    return {
      label: tr.profileEntryReturnComment || "Back to comment",
    };
  }
  if (context.source === "shorts") {
    return {
      label: tr.profileEntryReturnShorts || "Back to short",
    };
  }
  if (context.source === "feed") {
    return {
      label: tr.profileEntryReturnPost || "Back to post",
    };
  }
  return null;
}

function handlePublicProfileEntryAction(context = {}) {
  const normalized = normalizePublicProfileEntryContext(context);
  if (!normalized?.postId) return;
  const displayName = $("public-profile-name")?.textContent?.trim() || normalized.actorName;
  const handleText = $("public-profile-handle")?.textContent?.trim() || normalized.actorHandle;
  setActivePage("feed");
  requestAnimationFrame(() => {
    openPostDetail(`${normalized.postId}`, {
      entryContext: buildPublicProfileDetailEntryContext({
        userId: normalized.userId,
        displayName,
        handle: handleText,
        tab: getPublicProfileContentTab(),
      }),
      focusComments: normalized.focusComments || normalized.source === "comment",
      focusCommentId: normalized.commentId || "",
      focusCommentActorId: normalized.commentActorId || "",
      focusCommentCreatedAt: normalized.commentCreatedAt || "",
    });
  });
}

function renderPublicProfileEntryContext(context, options = {}) {
  const wrap = $("public-profile-entry");
  const label = $("public-profile-entry-label");
  const text = $("public-profile-entry-text");
  const actionBtn = $("btn-public-profile-entry-action");
  if (!wrap || !label || !text) return;
  if (!context) {
    wrap.classList.add("hidden");
    wrap.setAttribute("aria-hidden", "true");
    label.textContent = "";
    text.textContent = "";
    if (actionBtn) {
      actionBtn.classList.add("hidden");
      actionBtn.onclick = null;
      actionBtn.textContent = "";
    }
    return;
  }
  const tr = options.tr || (t[getCurrentLang()] || t.ja);
  wrap.classList.remove("hidden");
  wrap.setAttribute("aria-hidden", "false");
  label.textContent = buildPublicProfileEntryLabel(context, tr);
  text.textContent = buildPublicProfileEntryText(context, {
    canMessage: !!options.canMessage,
    isFollowing: !!options.isFollowing,
    tr,
  });
  const action = buildPublicProfileEntryAction(context, tr);
  if (actionBtn) {
    if (action) {
      actionBtn.classList.remove("hidden");
      actionBtn.textContent = action.label;
      actionBtn.onclick = () => {
        handlePublicProfileEntryAction(context);
      };
    } else {
      actionBtn.classList.add("hidden");
      actionBtn.onclick = null;
      actionBtn.textContent = "";
    }
  }
}
function normalizeMatchText(value = "") {
  return `${value || ""}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function extractProfileTerms(value = "") {
  return Array.from(
    new Set(
      `${value || ""}`
        .split(/[,\n/・|]+/)
        .map((item) => `${item || ""}`.trim())
        .filter(Boolean)
    )
  );
}
function buildPublicProfileConnectionSignals(viewerProfile, targetProfile, tr) {
  if (!viewerProfile || !targetProfile) return [];
  const signals = [];
  const pushSignal = (label, value, accent = "") => {
    const text = `${value || ""}`.trim();
    if (!label || !text) return;
    signals.push({ label, value: text, accent });
  };

  if (
    normalizeMatchText(viewerProfile.training_goal) &&
    normalizeMatchText(viewerProfile.training_goal) ===
      normalizeMatchText(targetProfile.training_goal)
  ) {
    pushSignal(
      tr.profileConnectionSameGoal || "Similar goal",
      targetProfile.training_goal,
      "goal"
    );
  }
  if (
    normalizeMatchText(viewerProfile.gym) &&
    normalizeMatchText(viewerProfile.gym) === normalizeMatchText(targetProfile.gym)
  ) {
    pushSignal(
      tr.profileConnectionSameGym || "Same gym",
      targetProfile.gym,
      "gym"
    );
  }
  if (
    normalizeMatchText(viewerProfile.training_split) &&
    normalizeMatchText(viewerProfile.training_split) ===
      normalizeMatchText(targetProfile.training_split)
  ) {
    pushSignal(
      tr.profileConnectionSameSplit || "Same split",
      targetProfile.training_split,
      "split"
    );
  }
  if (
    normalizeMatchText(viewerProfile.experience_level) &&
    normalizeMatchText(viewerProfile.experience_level) ===
      normalizeMatchText(targetProfile.experience_level)
  ) {
    pushSignal(
      tr.profileConnectionSameExperience || "Similar experience",
      formatExperience(targetProfile.experience_level, tr),
      "experience"
    );
  }

  const viewerFavoriteSet = new Set(
    extractProfileTerms(viewerProfile.favorite_lifts).map((term) =>
      normalizeMatchText(term)
    )
  );
  const targetFavoriteTerms = extractProfileTerms(targetProfile.favorite_lifts);
  const sharedFavoriteTerms = targetFavoriteTerms.filter((term) =>
    viewerFavoriteSet.has(normalizeMatchText(term))
  );
  if (sharedFavoriteTerms.length) {
    const preview =
      sharedFavoriteTerms.slice(0, 2).join(" · ") +
      (sharedFavoriteTerms.length > 2
        ? ` +${sharedFavoriteTerms.length - 2}`
        : "");
    pushSignal(
      tr.profileConnectionSharedLifts || "Shared lifts",
      preview,
      "lifts"
    );
  }

  return signals.slice(0, 3);
}
function buildPublicProfileStarterMessage(signal, tr) {
  const label = `${signal?.label || ""}`.trim();
  const value = `${signal?.value || ""}`.trim();
  if (!label || !value) return "";
  if (label === (tr.profileConnectionSameGoal || "Similar goal")) {
    return (tr.profileConnectionStarterGoal || "同じ目標ですね。最近どんなメニューを組んでますか？").replace(
      "{value}",
      value
    );
  }
  if (label === (tr.profileConnectionSameGym || "Same gym")) {
    return (tr.profileConnectionStarterGym || "{value}仲間ですね。最近よくやる種目ありますか？").replace(
      "{value}",
      value
    );
  }
  if (label === (tr.profileConnectionSameSplit || "Same split")) {
    return (tr.profileConnectionStarterSplit || "{value}で回してるんですね。最近の当たりメニュー知りたいです。").replace(
      "{value}",
      value
    );
  }
  if (label === (tr.profileConnectionSameExperience || "Similar experience")) {
    return (tr.profileConnectionStarterExperience || "近い経験レベルですね。今いちばん伸ばしたいところはどこですか？").replace(
      "{value}",
      value
    );
  }
  if (label === (tr.profileConnectionSharedLifts || "Shared lifts")) {
    return (tr.profileConnectionStarterLifts || "{value}好きなの同じですね。最近のベストやコツがあれば聞きたいです。").replace(
      "{value}",
      value
    );
  }
  return (tr.profileConnectionStarterDefault || "{value}つながりで話しかけました。最近ハマってるトレーニングありますか？").replace(
    "{value}",
    value
  );
}
function buildPublicProfilePostMessageStarter(post, logs = [], tr = t[getCurrentLang()] || t.ja) {
  const label = buildProfilePostHeadline(post, logs, tr) || (tr.notificationViewPost || "Post");
  if ((Array.isArray(logs) ? logs : []).length) {
    const template =
      tr.dmStarterFromWorkoutPost ||
      "Saw your {label} post. What were you focused on in that session?";
    return template.replace("{label}", label).replace("{preview}", label);
  }
  if (post?.media_type === "video") {
    const template =
      tr.dmStarterFromVideoPost ||
      "Saw your video post. What were you working on in that clip?";
    return template.replace("{preview}", label || (tr.feedViewVideo || "Video"));
  }
  if (post?.media_url) {
    const template =
      tr.dmStarterFromPhotoPost ||
      "Saw your photo post. How did that session feel?";
    return template.replace("{preview}", label || (tr.feedViewPhoto || "Photo"));
  }
  const template =
    tr.dmStarterFromPost ||
    "Saw your post and wanted to ask about it. How's training going?";
  return template.replace("{preview}", label || (tr.notificationViewPost || "Post"));
}
function buildPublicProfileMessageStarter({
  viewerProfile = null,
  targetProfile = null,
  posts = [],
  workoutLogsByPost = new Map(),
  tr = t[getCurrentLang()] || t.ja,
} = {}) {
  const signals = buildPublicProfileConnectionSignals(viewerProfile, targetProfile, tr);
  if (signals.length) {
    return buildPublicProfileStarterMessage(signals[0], tr);
  }

  const latestPost = (Array.isArray(posts) ? posts : []).find((post) => !!post?.id) || null;
  if (!latestPost) {
    return tr.profileEntryPromptMessage || tr.message || "Message";
  }
  const logs = workoutLogsByPost.get(latestPost.id) || [];
  return buildPublicProfilePostMessageStarter(latestPost, logs, tr);
}
function renderPublicProfileConnection(targetEl, viewerProfile, targetProfile, tr) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  const signals = buildPublicProfileConnectionSignals(
    viewerProfile,
    targetProfile,
    tr
  );
  if (!signals.length) {
    targetEl.classList.add("hidden");
    return;
  }
  targetEl.classList.remove("hidden");
  const title = document.createElement("div");
  title.className = "public-profile-connection-title";
  title.textContent = tr.profileConnectionTitle || "Why you might connect";
  const note = document.createElement("div");
  note.className = "public-profile-connection-note";
  note.textContent =
    tr.profileConnectionNote ||
    "Shared context makes it easier to start a conversation.";
  const list = document.createElement("div");
  list.className = "public-profile-connection-list";
  signals.forEach((signal) => {
    const chip = document.createElement("div");
    chip.className = `public-profile-connection-chip${
      signal.accent ? ` is-${signal.accent}` : ""
    }`;
    const label = document.createElement("span");
    label.className = "public-profile-connection-chip-label";
    label.textContent = signal.label;
    const value = document.createElement("span");
    value.className = "public-profile-connection-chip-value";
    value.textContent = signal.value;
    chip.append(label, value);
    list.appendChild(chip);
  });
  const actions = document.createElement("div");
  actions.className = "public-profile-connection-actions";
  signals.forEach((signal) => {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "public-profile-connection-action";
    action.textContent = signal.label;
    action.addEventListener("click", async () => {
      const currentUser = getCurrentUser();
      const targetUserId = `${targetProfile?.id || ""}`.trim();
      if (!currentUser || !targetUserId || currentUser.id === targetUserId) return;
      await openDmConversation(targetUserId, {
        profile: targetProfile,
        entryContext: {
          source: "profile",
          partnerId: targetUserId,
          actorName: targetProfile?.display_name || "",
          actorHandle: targetProfile?.handle || "",
          prefillMessage: buildPublicProfileStarterMessage(signal, tr),
        },
      });
    });
    actions.appendChild(action);
  });
  targetEl.append(title, note, list, actions);
}
function formatCompactNumber(value) {
  if (!Number.isFinite(Number(value))) return "0";
  try {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Number(value));
  } catch {
    return `${Math.round(Number(value) * 10) / 10}`;
  }
}
function buildPublicProfileDetailEntryContext({
  userId = "",
  displayName = "",
  handle = "",
  tab = "posts",
} = {}) {
  return {
    source: "public_profile",
    userId: `${userId || ""}`.trim(),
    actorName: `${displayName || ""}`.trim(),
    actorHandle: `${handle || ""}`.trim(),
    tab: normalizePublicProfileContentTab(tab),
  };
}
function getPublicProfilePostKind(post, logs = []) {
  if ((Array.isArray(logs) ? logs : []).length) return "workout";
  if (post?.media_type === "video") return "video";
  if (post?.media_url) return "photo";
  return "post";
}
function getPublicProfilePostCtaLabel(post, logs = [], tr = t[getCurrentLang()] || t.ja) {
  const kind = getPublicProfilePostKind(post, logs);
  if (kind === "workout") return tr.feedViewWorkout || "View workout";
  if (kind === "video") return tr.feedViewVideo || "Watch video";
  if (kind === "photo") return tr.feedViewPhoto || "View photo";
  return tr.notificationViewPost || "View post";
}
function stripPublicProfileReplyPrefix(text = "") {
  const normalized = `${text || ""}`.trim();
  if (!normalized) return "";
  return normalized.replace(/^@[A-Za-z0-9._-]+\s+/, "").trim();
}
function getPublicProfileLatestDiscussionTarget(
  post,
  comments = [],
  currentUser = null,
  tr = t[getCurrentLang()] || t.ja
) {
  const recentComments = (Array.isArray(comments) ? comments : [])
    .filter((comment) => `${comment?.id || ""}`.trim())
    .sort(
      (a, b) =>
        new Date(b?.created_at || b?.date || 0).getTime() -
        new Date(a?.created_at || a?.date || 0).getTime()
    );
  if (!recentComments.length || !post?.id) return null;

  const latestComment = recentComments[0];
  const latestProfile = latestComment?.profile || null;
  const latestHandle = formatHandle(
    latestProfile?.handle || latestProfile?.username || "user"
  );
  const latestName =
    `${latestProfile?.display_name || ""}`.trim() || latestHandle || "@user";
  const latestPreview =
    stripPublicProfileReplyPrefix(`${latestComment?.body || ""}`) ||
    tr.commentEmpty ||
    "No comments yet.";
  const latestCommentId = `${latestComment?.id || ""}`.trim();
  const latestCommentActorId = `${latestComment?.user_id || ""}`.trim();
  const canQuickReply =
    !!currentUser &&
    !!latestCommentId &&
    !!latestCommentActorId &&
    `${currentUser.id || ""}` !== latestCommentActorId;

  return {
    recentComments,
    latestComment,
    latestName,
    latestPreview,
    latestCommentId,
    latestCommentActorId,
    canQuickReply,
  };
}

function buildPublicProfileDiscussionPreview(
  post,
  comments = [],
  {
    currentUser = null,
    entryContext = null,
    tr = t[getCurrentLang()] || t.ja,
  } = {}
) {
  const discussionTarget = getPublicProfileLatestDiscussionTarget(
    post,
    comments,
    currentUser,
    tr
  );
  if (!discussionTarget || !post?.id) return null;

  const {
    recentComments,
    latestComment,
    latestName,
    latestPreview,
    latestCommentId,
    latestCommentActorId,
    canQuickReply,
  } = discussionTarget;

  const socialPreview = document.createElement("button");
  socialPreview.type = "button";
  socialPreview.className = "post-social-preview public-profile-post-social-preview";
  if (canQuickReply) {
    socialPreview.classList.add("is-reply-ready");
  }
  socialPreview.setAttribute(
    "aria-label",
    `${
      canQuickReply ? tr.commentReply || "Reply" : tr.feedLatestReply || "Latest reply"
    } · ${latestName}`
  );
  socialPreview.addEventListener("click", (event) => {
    event.stopPropagation();
    openPostDetail(`${post.id}`, {
      entryContext,
      focusComments: true,
      focusCommentId: latestCommentId,
      focusCommentActorId: latestCommentActorId,
      focusCommentCreatedAt: latestComment?.created_at || "",
      replyToCommentId: canQuickReply ? latestCommentId : "",
      replyToCommentActorId: canQuickReply ? latestCommentActorId : "",
      replyToCommentCreatedAt: canQuickReply ? latestComment?.created_at || "" : "",
    });
  });

  const stack = document.createElement("div");
  stack.className = "post-social-preview-stack";
  recentComments.slice(0, 2).forEach((comment) => {
    const avatar = document.createElement("div");
    avatar.className = "avatar post-social-preview-avatar";
    const profile = comment?.profile || null;
    const label =
      `${profile?.display_name || ""}`.trim() ||
      formatHandle(profile?.handle || profile?.username || "u") ||
      "U";
    renderAvatar(
      avatar,
      profile,
      label.replace("@", "").charAt(0).toUpperCase() || "U"
    );
    stack.appendChild(avatar);
  });
  if (recentComments.length > 2) {
    const more = document.createElement("span");
    more.className = "post-social-preview-more";
    more.textContent = `+${recentComments.length - 2}`;
    stack.appendChild(more);
  }

  const copy = document.createElement("div");
  copy.className = "post-social-preview-copy";
  const top = document.createElement("div");
  top.className = "post-social-preview-top";
  const kicker = document.createElement("span");
  kicker.className = "post-social-preview-kicker";
  kicker.textContent = `${tr.feedLatestReply || "Latest reply"} · ${formatCompactNumber(
    recentComments.length
  )}`;
  const name = document.createElement("span");
  name.className = "post-social-preview-name";
  name.textContent = latestName;
  top.append(kicker, name);
  const snippet = document.createElement("div");
  snippet.className = "post-social-preview-snippet";
  snippet.textContent = latestPreview;
  copy.append(top, snippet);

  const action = document.createElement("span");
  action.className = "post-social-preview-action";
  action.textContent = canQuickReply
    ? tr.commentReply || "Reply"
    : tr.feedOpenDiscussion || "Open discussion";

  socialPreview.append(stack, copy, action);
  return socialPreview;
}
function buildProfileMetrics(posts = [], workoutLogsByPost = new Map()) {
  const safePosts = Array.isArray(posts) ? posts : [];
  const dateKeys = new Set();
  let mediaCount = 0;
  let weeklyPosts = 0;
  let activeDays30 = new Set();
  let workoutPostCount = 0;
  let totalSets = 0;
  let bestLift = { weight: 0, exercise: "" };
  let latestPostTime = 0;

  safePosts.forEach((post) => {
    const dateValue = post?.date || post?.created_at;
    const dateKey = toDateKey(dateValue);
    if (dateKey) dateKeys.add(dateKey);
    if (post?.media_url) mediaCount += 1;
    if (isWithinDays(dateValue, 7)) weeklyPosts += 1;
    if (isWithinDays(dateValue, 30) && dateKey) {
      activeDays30.add(dateKey);
    }
    const postTime = toTimeValue(dateValue);
    if (postTime > latestPostTime) latestPostTime = postTime;

    const logs = workoutLogsByPost.get(post?.id) || [];
    if (!logs.length) return;
    workoutPostCount += 1;
    logs.forEach((exercise) => {
      const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
      totalSets += sets.length;
      sets.forEach((set) => {
        const weight = Number(set?.weight || 0);
        if (!Number.isFinite(weight) || weight <= 0) return;
        if (weight <= bestLift.weight) return;
        bestLift = {
          weight,
          exercise: `${exercise?.exercise || ""}`.trim(),
        };
      });
    });
  });

  const todayKey = toDateKey(new Date());
  const streak =
    todayKey && dateKeys.has(todayKey) ? computeStreak(dateKeys) : 0;
  const mediaRate = safePosts.length
    ? Math.round((mediaCount / safePosts.length) * 100)
    : 0;

  return {
    postCount: safePosts.length,
    weeklyPosts,
    activeDays30: activeDays30.size,
    mediaCount,
    mediaRate,
    workoutPostCount,
    totalSets,
    bestLift,
    streak,
    latestPostTime,
  };
}
function buildProfileBadges(metrics, profile, followersCount, tr) {
  const badges = [];
  if ((metrics?.streak || 0) >= 7) {
    badges.push(tr.profileBadgeConsistency || "Consistent");
  }
  if ((metrics?.mediaCount || 0) >= 6) {
    badges.push(tr.profileBadgeCreator || "Media creator");
  }
  if ((metrics?.workoutPostCount || 0) >= 12 || (metrics?.totalSets || 0) >= 120) {
    badges.push(tr.profileBadgeDedicated || "Dedicated lifter");
  }
  const linkCount = [
    profile?.instagram,
    profile?.tiktok,
    profile?.youtube,
    profile?.website,
  ]
    .map((value) => `${value || ""}`.trim())
    .filter(Boolean).length;
  if ((followersCount || 0) >= 20 || linkCount >= 2) {
    badges.push(tr.profileBadgeSocial || "Social ready");
  }
  return badges.slice(0, 3);
}
function renderProfileBadges(targetEl, badges = []) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  const safeBadges = Array.isArray(badges) ? badges.filter(Boolean) : [];
  targetEl.classList.toggle("hidden", safeBadges.length === 0);
  safeBadges.forEach((label) => {
    const badge = document.createElement("span");
    badge.className = "profile-badge";
    badge.textContent = label;
    targetEl.appendChild(badge);
  });
}
function renderProfileCompletion(targetEl, profile, tr) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  if (!profile) {
    targetEl.classList.add("hidden");
    return;
  }
  const checks = [
    `${profile?.display_name || ""}`.trim(),
    `${profile?.handle || ""}`.trim(),
    `${profile?.bio || ""}`.trim(),
    `${profile?.avatar_url || ""}`.trim(),
    `${profile?.training_goal || ""}`.trim(),
    `${profile?.training_split || ""}`.trim(),
    `${profile?.favorite_lifts || ""}`.trim(),
    `${profile?.instagram || profile?.tiktok || profile?.youtube || profile?.website || ""}`.trim(),
  ];
  const total = checks.length;
  const done = checks.filter(Boolean).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = Math.max(0, total - done);
  if (percent >= 100) {
    targetEl.classList.add("hidden");
    return;
  }
  targetEl.classList.remove("hidden");
  const title = document.createElement("div");
  title.className = "profile-completion-title";
  title.textContent = tr.profileCompletionTitle || "Profile completion";
  const meta = document.createElement("div");
  meta.className = "profile-completion-meta";
  meta.textContent = (tr.profileCompletionDone || "{percent}% complete").replace(
    "{percent}",
    `${percent}`
  );
  const bar = document.createElement("div");
  bar.className = "profile-completion-track";
  const fill = document.createElement("div");
  fill.className = "profile-completion-fill";
  fill.style.width = `${percent}%`;
  bar.appendChild(fill);
  const hint = document.createElement("div");
  hint.className = "profile-completion-hint";
  hint.textContent = (tr.profileCompletionHint || "{count} more fields to complete").replace(
    "{count}",
    `${remaining}`
  );
  targetEl.appendChild(title);
  targetEl.appendChild(meta);
  targetEl.appendChild(bar);
  targetEl.appendChild(hint);
}
function renderPinnedPostPreview(targetEl, post, tr) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  if (!post) {
    targetEl.classList.add("hidden");
    return;
  }
  targetEl.classList.remove("hidden");
  const title = document.createElement("div");
  title.className = "profile-pinned-title";
  title.textContent = tr.profilePinnedTitle || "Pinned post";
  const body = document.createElement("div");
  body.className = "profile-pinned-body";
  const rawText = `${post?.note || post?.caption || ""}`.trim();
  const preview = rawText.length > 120 ? `${rawText.slice(0, 120)}…` : rawText;
  body.textContent = preview || "—";
  const sub = document.createElement("div");
  sub.className = "profile-pinned-sub";
  sub.textContent = formatDateDisplay(post?.date || post?.created_at || "");
  targetEl.appendChild(title);
  targetEl.appendChild(body);
  if (sub.textContent) {
    targetEl.appendChild(sub);
  }
}
function getPublicProfilePostCollections(userId, allPosts, currentUser) {
  if (!Array.isArray(allPosts) || !allPosts.length) {
    return { userPosts: [], mediaPosts: [] };
  }
  const targetUserId = `${userId || ""}`.trim();
  const viewerId = `${currentUser?.id || ""}`.trim();
  if (!targetUserId) {
    return { userPosts: [], mediaPosts: [] };
  }
  if (
    publicProfilePostsCache.postsRef !== allPosts ||
    publicProfilePostsCache.viewerId !== viewerId
  ) {
    publicProfilePostsCache.postsRef = allPosts;
    publicProfilePostsCache.viewerId = viewerId;
    publicProfilePostsCache.byUser = new Map();
  }
  const cached = publicProfilePostsCache.byUser.get(targetUserId);
  if (cached) {
    return cached;
  }
  const allowPrivate = !!viewerId && viewerId === targetUserId;
  const userPosts = [];
  const mediaPosts = [];
  allPosts.forEach((post) => {
    if (!post || post.user_id !== targetUserId) return;
    if (post.visibility === "private" && !allowPrivate) return;
    userPosts.push(post);
    if (post.media_url) {
      mediaPosts.push(post);
    }
  });
  const payload = { userPosts, mediaPosts };
  publicProfilePostsCache.byUser.set(targetUserId, payload);
  return payload;
}
function getCachedFollowCounts(userId) {
  const id = `${userId || ""}`.trim();
  if (!id) return null;
  const cached = followCountCache.get(id);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > FOLLOW_COUNT_CACHE_TTL_MS) {
    followCountCache.delete(id);
    return null;
  }
  return cached.value;
}
function setCachedFollowCounts(userId, counts) {
  const id = `${userId || ""}`.trim();
  if (!id || !counts) return;
  followCountCache.set(id, {
    cachedAt: Date.now(),
    value: {
      following: Number(counts.following || 0),
      followers: Number(counts.followers || 0),
    },
  });
}
async function loadFollowCountsCached(userId, options = {}) {
  const force = !!options.force;
  const id = `${userId || ""}`.trim();
  if (!id) return { following: 0, followers: 0 };
  if (!force) {
    const cached = getCachedFollowCounts(id);
    if (cached) return cached;
  }
  const counts = await getFollowCounts(id);
  setCachedFollowCounts(id, counts);
  return counts;
}
const toggleSectionVisibility = (titleId, containerEl) => {
  const titleEl = titleId ? $(titleId) : null;
  const hasContent = !!containerEl && containerEl.children.length > 0;
  if (titleEl) titleEl.classList.toggle("hidden", !hasContent);
  if (containerEl) containerEl.classList.toggle("hidden", !hasContent);
};
const toggleCollapsibleVisibility = (key, hasContent) => {
  if (!key) return;
  const wrapper = document.querySelector(`[data-collapsible="${key}"]`);
  const button = wrapper?.querySelector("[data-collapsible-btn]");
  const content = wrapper?.querySelector("[data-collapsible-content]");
  if (button) button.classList.toggle("hidden", !hasContent);
  if (content) {
    content.classList.toggle("hidden", !hasContent);
    if (!hasContent) {
      content.classList.remove("is-open");
      content.style.maxHeight = "0px";
      content.setAttribute("aria-hidden", "true");
    } else if (content.classList.contains("is-open")) {
      content.style.maxHeight = `${content.scrollHeight}px`;
      content.setAttribute("aria-hidden", "false");
    }
  }
};

export function formatExperience(value, tr) {
  if (!value) return "";
  const map = {
    beginner: tr.experienceBeginner || "Beginner",
    intermediate: tr.experienceIntermediate || "Intermediate",
    advanced: tr.experienceAdvanced || "Advanced",
    pro: tr.experiencePro || "Competitive",
  };
  return map[value] || value;
}

export function getProfileDisplayName(profile, fallback = "user") {
  return (
    profile?.display_name ||
    profile?.handle ||
    profile?.username ||
    fallback
  );
}

export function applyProfileTheme(container, profile) {
  if (!container) return;
  const accent = profile?.accent_color || "#e4572e";
  container.style.setProperty("--profile-accent", accent);
}

export function applyProfileBanner(bannerEl, profile) {
  if (!bannerEl) return;
  const url = profile?.banner_url;
  if (url) {
    bannerEl.style.backgroundImage = `url('${url}')`;
  } else {
    bannerEl.style.removeProperty("background-image");
  }
}

export function renderProfileFacts(factsEl, profile, tr) {
  if (!factsEl) return;
  factsEl.innerHTML = "";
  const settings = getSettings();
  const heightText = profile?.height_cm
    ? formatHeight(profile.height_cm, settings.heightUnit)
    : "";
  const experienceText = formatExperience(profile?.experience_level, tr);
  const items = [
    { label: tr.profileLocation || "Location", value: profile?.location },
    { label: tr.profileHeight || "Height", value: heightText },
    { label: tr.profileExperience || "Experience", value: experienceText },
    { label: tr.profileGym || "Gym", value: profile?.gym },
    { label: tr.profileSplit || "Split", value: profile?.training_split },
  ]
    .filter((item) => item.value)
    .slice(0, 2);
  items.forEach((item) => {
    if (!item.value) return;
    const card = document.createElement("div");
    card.className = "profile-fact";
    const label = document.createElement("div");
    label.className = "profile-fact-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "profile-fact-value";
    value.textContent = item.value;
    card.appendChild(label);
    card.appendChild(value);
    factsEl.appendChild(card);
  });
}

export function renderProfileHighlights(highlightsEl, profile, tr) {
  if (!highlightsEl) return;
  highlightsEl.innerHTML = "";
  const items = [
    { label: tr.profileGoal || "Goal", value: profile?.training_goal },
    {
      label: tr.profileFavoriteLifts || "Favorite lifts",
      value: profile?.favorite_lifts,
    },
  ]
    .filter((item) => item.value)
    .slice(0, 1);
  items.forEach((item) => {
    if (!item.value) return;
    const card = document.createElement("div");
    card.className = "profile-highlight";
    const label = document.createElement("div");
    label.className = "profile-highlight-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "profile-highlight-value";
    value.textContent = item.value;
    card.appendChild(label);
    card.appendChild(value);
    highlightsEl.appendChild(card);
  });
}

function renderPublicProfileHeroFacts(targetEl, profile, tr) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  const settings = getSettings();
  const heightText = profile?.height_cm
    ? formatHeight(profile.height_cm, settings.heightUnit)
    : "";
  const experienceText = formatExperience(profile?.experience_level, tr);
  const items = [
    { label: tr.profileGoal || "Goal", value: profile?.training_goal },
    { label: tr.profileGym || "Gym", value: profile?.gym },
    { label: tr.profileSplit || "Split", value: profile?.training_split },
    { label: tr.profileExperience || "Experience", value: experienceText },
    { label: tr.profileHeight || "Height", value: heightText },
  ]
    .filter((item) => `${item?.value || ""}`.trim())
    .slice(0, 4);

  items.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "public-profile-hero-fact";
    const label = document.createElement("span");
    label.className = "public-profile-hero-fact-label";
    label.textContent = item.label;
    const value = document.createElement("span");
    value.className = "public-profile-hero-fact-value";
    value.textContent = item.value;
    chip.append(label, value);
    targetEl.appendChild(chip);
  });

  targetEl.classList.toggle("hidden", items.length === 0);
}

function renderPublicProfileSpotlight(targetEl, metrics, profile, tr) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  if (!(metrics?.postCount || 0)) {
    targetEl.classList.add("hidden");
    return;
  }

  const shell = document.createElement("div");
  shell.className = "public-profile-spotlight-card";

  const copy = document.createElement("div");
  copy.className = "public-profile-spotlight-copy";

  const kicker = document.createElement("div");
  kicker.className = "public-profile-spotlight-kicker";
  kicker.textContent = tr.profileSpotlightTitle || "Recent momentum";

  const title = document.createElement("div");
  title.className = "public-profile-spotlight-title";
  const latestText = metrics.latestPostTime
    ? formatDateDisplay(metrics.latestPostTime)
    : tr.profileSpotlightEmpty || "No recent posts yet.";
  title.textContent = `${tr.profileSpotlightLatest || "Latest post"} · ${latestText}`;

  const note = document.createElement("div");
  note.className = "public-profile-spotlight-note";
  if (metrics.bestLift?.weight) {
    const bestLiftText = metrics.bestLift.exercise
      ? `${metrics.bestLift.exercise} · ${formatWeight(metrics.bestLift.weight)}`
      : formatWeight(metrics.bestLift.weight);
    note.textContent = `${tr.profileBestLift || "Best lift"} · ${bestLiftText}`;
  } else if (`${profile?.training_goal || ""}`.trim()) {
    note.textContent = `${tr.profileGoal || "Goal"} · ${profile.training_goal}`;
  } else {
    note.textContent = tr.profileContentPostsHint || "Latest posts";
  }

  copy.append(kicker, title, note);

  const stats = document.createElement("div");
  stats.className = "public-profile-spotlight-stats";
  [
    {
      label: tr.profileQuickPosts7d || "Posts (7d)",
      value: `${metrics.weeklyPosts}`,
    },
    {
      label: tr.profileTabMedia || "Media",
      value: `${metrics.mediaCount}`,
    },
    {
      label: tr.profileWorkouts || "Workouts",
      value: `${metrics.workoutPostCount}`,
    },
  ].forEach((item) => {
    const stat = document.createElement("div");
    stat.className = "public-profile-spotlight-stat";
    const value = document.createElement("span");
    value.className = "public-profile-spotlight-stat-value";
    value.textContent = item.value;
    const label = document.createElement("span");
    label.className = "public-profile-spotlight-stat-label";
    label.textContent = item.label;
    stat.append(value, label);
    stats.appendChild(stat);
  });

  shell.append(copy, stats);
  targetEl.appendChild(shell);
  targetEl.classList.remove("hidden");
}

export function renderProfileLinks(linksEl, profile, tr) {
  if (!linksEl) return;
  linksEl.innerHTML = "";
  const links = [
    {
      label: tr.profileInstagram || "Instagram",
      value: profile?.instagram,
      url: normalizeHandleUrl("https://instagram.com", profile?.instagram),
      prefix: "@",
    },
    {
      label: tr.profileTiktok || "TikTok",
      value: profile?.tiktok,
      url: normalizeHandleUrl("https://tiktok.com/@", profile?.tiktok),
      prefix: "@",
    },
    {
      label: tr.profileYouTube || "YouTube",
      value: profile?.youtube,
      url: normalizeUrl(profile?.youtube),
    },
    {
      label: tr.profileWebsite || "Website",
      value: profile?.website,
      url: normalizeUrl(profile?.website),
    },
  ]
    .filter((item) => item.value && item.url)
    .slice(0, 2);
  links.forEach((item) => {
    if (!item.value || !item.url) return;
    let displayValue = item.value;
    if (item.prefix && !displayValue.startsWith(item.prefix)) {
      displayValue = `${item.prefix}${displayValue}`;
    }
    const link = document.createElement("a");
    link.className = "profile-link-pill";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `${item.label}: ${displayValue
      .replace("https://", "")
      .replace("http://", "")}`;
    linksEl.appendChild(link);
  });
}

export function renderProfileStatsGrid(targetEl, posts, tr) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  const settings = getSettings();
  if (!settings.showProfileStats) {
    targetEl.classList.add("hidden");
    return;
  }
  const metrics = buildProfileMetrics(posts, getWorkoutLogsByPost());
  const bestLiftLabel = metrics.bestLift.weight
    ? metrics.bestLift.exercise
      ? `${metrics.bestLift.exercise} · ${formatWeight(metrics.bestLift.weight)}`
      : formatWeight(metrics.bestLift.weight)
    : "-";
  const cards = [
    {
      label: tr.profileWorkouts || "Workouts",
      value: `${metrics.workoutPostCount}`,
    },
    {
      label: tr.profileTotalSets || "Total sets",
      value: formatCompactNumber(metrics.totalSets),
    },
    {
      label: tr.profileBestLift || "Best lift",
      value: bestLiftLabel,
    },
  ];
  cards.forEach((item) => {
    const card = document.createElement("div");
    card.className = "profile-stat";
    const label = document.createElement("div");
    label.className = "profile-stat-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "profile-stat-value";
    value.textContent = item.value;
    card.appendChild(label);
    card.appendChild(value);
    targetEl.appendChild(card);
  });
  targetEl.classList.toggle("hidden", cards.length === 0);
}

export function renderProfileQuickStats(targetEl, posts, tr) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  const settings = getSettings();
  if (!settings.showProfileStats) {
    targetEl.classList.add("hidden");
    return;
  }
  const metrics = buildProfileMetrics(posts, getWorkoutLogsByPost());
  const quickItems = [
    {
      label: tr.profileQuickPosts7d || "Posts (7d)",
      value: `${metrics.weeklyPosts}`,
    },
    {
      label: tr.profileQuickActiveDays30d || "Active days (30d)",
      value: `${metrics.activeDays30}`,
    },
  ];
  quickItems.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "profile-quick-chip";
    const label = document.createElement("div");
    label.className = "profile-quick-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "profile-quick-value";
    value.textContent = item.value;
    chip.appendChild(label);
    chip.appendChild(value);
    targetEl.appendChild(chip);
  });
  targetEl.classList.toggle("hidden", quickItems.length === 0);
}

function renderProfileMetaStat(targetEl, label, value) {
  if (!targetEl) return;
  const labelText = `${label || ""}`.trim() || "-";
  const valueText = `${value ?? "-"}`.trim() || "-";
  targetEl.innerHTML = "";
  targetEl.setAttribute("aria-label", `${labelText}: ${valueText}`);

  const valueEl = document.createElement("span");
  valueEl.className = "profile-meta-value";
  valueEl.textContent = valueText;

  const labelEl = document.createElement("span");
  labelEl.className = "profile-meta-label";
  labelEl.textContent = labelText;

  targetEl.append(valueEl, labelEl);
}

function formatJoinedText(tr, createdAt) {
  if (!createdAt) return "";
  const prefix = tr.profileJoined || "Joined";
  return `${prefix} ${formatDateDisplay(createdAt)}`.trim();
}

function buildProfilePostHeadline(post, logs = [], tr = t[getCurrentLang()] || t.ja) {
  const rawText = (post?.note || post?.caption || "").toString().trim();
  const firstLine = rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine) {
    return firstLine.length > 78 ? `${firstLine.slice(0, 78)}…` : firstLine;
  }

  const names = logs
    .map((item) => `${item?.exercise || ""}`.trim())
    .filter(Boolean);
  if (names.length) {
    const title = names.slice(0, 2).join(" · ");
    return names.length > 2 ? `${title} +${names.length - 2}` : title;
  }

  if (post?.media_url) {
    return post.media_type === "video"
      ? tr.mediaVideoLabel || "VIDEO"
      : tr.mediaPhotoLabel || "PHOTO";
  }

  return tr.workoutLogTitle || "Workout log";
}

function buildProfilePostPreview(post, logs = [], tr = t[getCurrentLang()] || t.ja) {
  const rawText = (post?.note || post?.caption || "")
    .toString()
    .replace(/\s*\n+\s*/g, " ")
    .trim();
  if (rawText) {
    return rawText.length > 132 ? `${rawText.slice(0, 132)}…` : rawText;
  }

  if (logs.length) {
    const names = logs
      .map((item) => `${item?.exercise || ""}`.trim())
      .filter(Boolean)
      .slice(0, 3);
    const setCount = logs.reduce(
      (sum, item) => sum + ((item?.sets || []).length || 0),
      0
    );
    const segments = [];
    if (names.length) {
      segments.push(names.join(" · "));
    }
    if (setCount) {
      segments.push(`${setCount}${tr.workoutSetCountLabel || "セット"}`);
    }
    return segments.join(" / ") || (tr.workoutLogTitle || "Workout log");
  }

  if (post?.media_url) {
    return post.media_type === "video"
      ? tr.mediaVideoLabel || "VIDEO"
      : tr.mediaPhotoLabel || "PHOTO";
  }

  return "—";
}

function normalizePublicProfileContentTab(tab = "") {
  const safeTab = `${tab || ""}`.trim().toLowerCase();
  if (safeTab === "media" || safeTab === "workouts") return safeTab;
  return "posts";
}

function setPublicProfileContentTab(tab = "posts") {
  currentPublicProfileContentTab = normalizePublicProfileContentTab(tab);
}

function getPublicProfileContentTab() {
  return normalizePublicProfileContentTab(currentPublicProfileContentTab);
}

function updatePublicProfileContentTabs(counts = {}, tr = t[getCurrentLang()] || t.ja) {
  const activeTab = getPublicProfileContentTab();
  [
    {
      key: "posts",
      buttonId: "btn-public-tab-posts",
      countId: "public-tab-posts-count",
      count: counts.posts || 0,
      label: tr.profileTabPosts || "Posts",
    },
    {
      key: "media",
      buttonId: "btn-public-tab-media",
      countId: "public-tab-media-count",
      count: counts.media || 0,
      label: tr.profileTabMedia || "Media",
    },
    {
      key: "workouts",
      buttonId: "btn-public-tab-workouts",
      countId: "public-tab-workouts-count",
      count: counts.workouts || 0,
      label: tr.profileTabWorkouts || "Workouts",
    },
  ].forEach((item) => {
    const button = $(item.buttonId);
    const countEl = $(item.countId);
    if (countEl) {
      countEl.textContent = formatCompactNumber(item.count || 0);
    }
    if (!button) return;
    const isActive = activeTab === item.key;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.setAttribute("tabindex", isActive ? "0" : "-1");
    button.setAttribute(
      "aria-label",
      `${item.label} ${formatCompactNumber(item.count || 0)}`
    );
  });
}

function updatePublicProfileContentSummary(
  activeTab = "posts",
  counts = {},
  tr = t[getCurrentLang()] || t.ja
) {
  const titleEl = $("public-profile-content-summary-title");
  const noteEl = $("public-profile-content-summary-note");
  const countEl = $("public-profile-content-summary-count");
  const normalizedTab = normalizePublicProfileContentTab(activeTab);
  const configByTab = {
    posts: {
      label: tr.profileTabPosts || "Posts",
      note: tr.profileContentPostsHint || "Latest posts",
      count: counts.posts || 0,
    },
    media: {
      label: tr.profileTabMedia || "Media",
      note: tr.profileContentMediaHint || "Photos and videos",
      count: counts.media || 0,
    },
    workouts: {
      label: tr.profileTabWorkouts || "Workouts",
      note: tr.profileContentWorkoutsHint || "Training logs only",
      count: counts.workouts || 0,
    },
  };
  const selected = configByTab[normalizedTab] || configByTab.posts;
  if (titleEl) titleEl.textContent = selected.label;
  if (noteEl) noteEl.textContent = selected.note;
  if (countEl) countEl.textContent = formatCompactNumber(selected.count || 0);
}

function updatePublicProfileActionDock(
  {
    canMessage = false,
    isFollowing = false,
    counts = {},
    tr = t[getCurrentLang()] || t.ja,
  } = {}
) {
  const dockEl = $("public-profile-action-dock");
  const titleEl = $("public-profile-action-dock-title");
  const noteEl = $("public-profile-action-dock-note");
  const activeTab = normalizePublicProfileContentTab(getPublicProfileContentTab());
  const activeCount = Number(counts?.[activeTab] || 0);
  if (!dockEl || !titleEl || !noteEl) return;

  if (canMessage && !isFollowing) {
    titleEl.textContent =
      tr.profileActionDockTitleConnect || "Start the conversation";
    noteEl.textContent = (
      tr.profileActionDockNoteConnect ||
      "{count} things to react to in this profile."
    ).replace("{count}", formatCompactNumber(activeCount));
  } else if (canMessage && isFollowing) {
    titleEl.textContent =
      tr.profileActionDockTitleFollow || "Keep the momentum going";
    noteEl.textContent = (
      tr.profileActionDockNoteFollow ||
      "Jump back in with a message or share this profile."
    ).replace("{count}", formatCompactNumber(activeCount));
  } else {
    titleEl.textContent =
      tr.profileActionDockTitleShare || "Share this profile";
    noteEl.textContent = (
      tr.profileActionDockNoteShare ||
      "{count} posts you can revisit from here."
    ).replace("{count}", formatCompactNumber(activeCount));
  }
  dockEl.classList.remove("hidden");
}

function renderPublicProfileContentRail(
  targetEl,
  posts = [],
  {
    activeTab = "posts",
    displayName = "",
    handle = "",
    userId = "",
    workoutLogsByPost = new Map(),
    likesByPost = new Map(),
    commentsByPost = new Map(),
    tr = t[getCurrentLang()] || t.ja,
  } = {}
) {
  if (!targetEl) return;
  targetEl.innerHTML = "";
  const normalizedTab = normalizePublicProfileContentTab(activeTab);
  const visiblePosts = (Array.isArray(posts) ? posts : []).slice(0, 3);
  if (!visiblePosts.length) {
    targetEl.classList.add("hidden");
    return;
  }
  targetEl.classList.remove("hidden");
  visiblePosts.forEach((post, index) => {
    const logs = workoutLogsByPost.get(post.id) || [];
    const card = document.createElement("button");
    card.type = "button";
    card.className = `public-profile-rail-card is-${normalizedTab}`;
    card.dataset.postId = `${post?.id || ""}`;
    const entryContext = buildPublicProfileDetailEntryContext({
      userId,
      displayName,
      handle,
      tab: normalizedTab,
    });
    card.addEventListener("click", () => {
      if (!post?.id) return;
      openPostDetail(`${post.id}`, { entryContext });
    });

    const top = document.createElement("div");
    top.className = "public-profile-rail-top";
    const pill = document.createElement("span");
    pill.className = "public-profile-rail-pill";
    pill.textContent =
      normalizedTab === "media"
        ? post.media_type === "video"
          ? tr.mediaVideoLabel || "VIDEO"
          : tr.mediaPhotoLabel || "PHOTO"
        : normalizedTab === "workouts"
          ? tr.profileTabWorkouts || "Workouts"
          : index === 0
            ? tr.profileSpotlightLatest || "Latest post"
            : tr.profileTabPosts || "Posts";
    const date = document.createElement("span");
    date.className = "public-profile-rail-date";
    date.textContent = formatDateDisplay(post.date || post.created_at || "");
    top.append(pill, date);

    const title = document.createElement("div");
    title.className = "public-profile-rail-title";
    title.textContent = buildProfilePostHeadline(post, logs, tr);

    const note = document.createElement("div");
    note.className = "public-profile-rail-note";
    note.textContent = buildProfilePostPreview(post, logs, tr);

    const likeCount = Number(likesByPost.get(post.id) || 0);
    const commentCount = Number((commentsByPost.get(post.id) || []).length || 0);
    const stats = document.createElement("div");
    stats.className = "public-profile-rail-stats";
    const statItems = [];
    if (likeCount > 0) {
      statItems.push({
        icon: "♡",
        text: `${formatProfileCompactCount(likeCount)} ${tr.likes || "Likes"}`,
      });
    }
    if (commentCount > 0) {
      statItems.push({
        icon: "💬",
        text: `${formatProfileCompactCount(commentCount)} ${tr.comments || "Comments"}`,
      });
    }
    if (normalizedTab === "workouts") {
      const setCount = logs.reduce(
        (sum, item) => sum + ((item?.sets || []).length || 0),
        0
      );
      if (logs.length > 0) {
        statItems.push({
          icon: "🏋",
          text: `${logs.length}${tr.workoutExerciseCountLabel || "種目"}`,
        });
      }
      if (setCount > 0) {
        statItems.push({
          icon: "◔",
          text: `${setCount}${tr.workoutSetCountLabel || "セット"}`,
        });
      }
    } else if (
      normalizedTab === "media" &&
      post.bodyweight !== null &&
      post.bodyweight !== undefined &&
      post.bodyweight !== ""
    ) {
      statItems.push({
        icon: "◔",
        text: formatWeight(post.bodyweight),
      });
    }
    statItems.slice(0, 3).forEach((itemStat) => {
      const chip = document.createElement("span");
      chip.className = "public-profile-rail-stat";
      const icon = document.createElement("span");
      icon.className = "public-profile-rail-stat-icon";
      icon.textContent = itemStat.icon;
      const text = document.createElement("span");
      text.className = "public-profile-rail-stat-text";
      text.textContent = itemStat.text;
      chip.append(icon, text);
      stats.appendChild(chip);
    });

    const bottom = document.createElement("div");
    bottom.className = "public-profile-rail-bottom";
    const meta = document.createElement("span");
    meta.className = "public-profile-rail-meta";
    if (normalizedTab === "workouts") {
      const setCount = logs.reduce(
        (sum, item) => sum + ((item?.sets || []).length || 0),
        0
      );
      meta.textContent = `${logs.length}${tr.workoutExerciseCountLabel || "種目"} · ${setCount}${tr.workoutSetCountLabel || "セット"}`;
    } else if (post.bodyweight !== null && post.bodyweight !== undefined && post.bodyweight !== "") {
      meta.textContent = `${tr.weight || "Weight"} · ${formatWeight(post.bodyweight)}`;
    } else {
      meta.textContent =
        normalizedTab === "media"
          ? tr.profileContentMediaHint || "Photos and videos"
          : tr.profileContentPostsHint || "Latest posts";
    }
    const cta = document.createElement("span");
    cta.className = `public-profile-rail-cta is-${getPublicProfilePostKind(
      post,
      logs
    )}`;
    cta.textContent = getPublicProfilePostCtaLabel(post, logs, tr);
    bottom.append(meta, cta);

    if (normalizedTab === "media" && post.media_url) {
      const thumb = document.createElement("div");
      thumb.className = "public-profile-rail-thumb";
      if (post.media_type === "video") {
        const video = document.createElement("video");
        video.src = post.media_url;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        thumb.appendChild(video);
      } else {
      const img = document.createElement("img");
      img.src = post.media_url;
      img.alt = displayName || handle || "profile media";
      img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        thumb.appendChild(img);
      }
      card.append(top, thumb, title);
      if (stats.childNodes.length) card.appendChild(stats);
      card.append(bottom);
    } else {
      card.append(top, title, note);
      if (stats.childNodes.length) card.appendChild(stats);
      card.append(bottom);
    }

    targetEl.appendChild(card);
  });
}

export function updateProfileSummary() {
  const cardEl = $("profile-section");
  const bannerEl = $("profile-banner");
  const factsEl = $("profile-facts");
  const highlightsEl = $("profile-highlights");
  const statsGridEl = $("profile-stats-grid");
  const quickStatsEl = $("profile-quick-stats");
  const completionEl = $("profile-completion");
  const badgesEl = $("profile-badges");
  const pinnedEl = $("profile-pinned");
  const avatarEl = $("profile-avatar");
  const nameEl = $("profile-name");
  const emailEl = $("profile-email");
  const bioEl = $("profile-bio");
  const joinedEl = $("profile-joined");
  const postsEl = $("profile-posts");
  const followingEl = $("profile-following");
  const followersEl = $("profile-followers");
  const streakEl = $("profile-streak");
  const statTodayEl = $("stat-today");
  const statStreakEl = $("stat-streak");
  const statTotalEl = $("stat-total");
  const accountGlanceEl = $("account-glance");
  const accountGlanceAvatarEl = $("account-glance-avatar");
  const accountGlanceNameEl = $("account-glance-name");
  const accountGlanceHandleEl = $("account-glance-handle");
  const accountGlanceBioEl = $("account-glance-bio");
  const accountMiniStatsEl = $("account-mini-stats");
  const accountMiniPostsEl = $("account-mini-posts");
  const accountMiniFollowersEl = $("account-mini-followers");
  const accountMiniStreakEl = $("account-mini-streak");
  const accountMiniPostsLabelEl = $("account-mini-posts-label");
  const accountMiniFollowersLabelEl = $("account-mini-followers-label");
  const accountMiniStreakLabelEl = $("account-mini-streak-label");
  const accountShortcutsEl = $("account-shortcuts");

  const currentUser = getCurrentUser();
  const currentProfile = getCurrentProfile();
  const tr = t[getCurrentLang()] || t.ja;

  if (accountMiniPostsLabelEl) {
    accountMiniPostsLabelEl.textContent = tr.profilePosts || "Posts";
  }
  if (accountMiniFollowersLabelEl) {
    accountMiniFollowersLabelEl.textContent = tr.profileFollowers || "Followers";
  }
  if (accountMiniStreakLabelEl) {
    accountMiniStreakLabelEl.textContent = tr.profileStreak || "Streak";
  }

  if (
    !cardEl &&
    !bannerEl &&
    !factsEl &&
    !highlightsEl &&
    !statsGridEl &&
    !quickStatsEl &&
    !completionEl &&
    !badgesEl &&
    !pinnedEl &&
    !avatarEl &&
    !nameEl &&
    !emailEl &&
    !bioEl &&
    !joinedEl &&
    !postsEl &&
    !followingEl &&
    !followersEl &&
    !streakEl &&
    !statTodayEl &&
    !statStreakEl &&
    !statTotalEl &&
    !accountGlanceEl &&
    !accountMiniStatsEl &&
    !accountShortcutsEl
  ) {
    return;
  }

  if (!currentUser) {
    if (cardEl) applyProfileTheme(cardEl, null);
    if (bannerEl) {
      applyProfileBanner(bannerEl, null);
      bannerEl.classList.add("hidden");
    }
    if (factsEl) {
      factsEl.innerHTML = "";
      factsEl.classList.add("hidden");
    }
    if (highlightsEl) {
      highlightsEl.innerHTML = "";
      highlightsEl.classList.add("hidden");
    }
    if (statsGridEl) {
      statsGridEl.innerHTML = "";
      statsGridEl.classList.add("hidden");
    }
    if (quickStatsEl) {
      quickStatsEl.innerHTML = "";
      quickStatsEl.classList.add("hidden");
    }
    if (completionEl) {
      completionEl.innerHTML = "";
      completionEl.classList.add("hidden");
    }
    if (badgesEl) {
      badgesEl.innerHTML = "";
      badgesEl.classList.add("hidden");
    }
    if (pinnedEl) {
      pinnedEl.innerHTML = "";
      pinnedEl.classList.add("hidden");
    }
    if (avatarEl) renderAvatar(avatarEl, null, "-");
    if (nameEl) nameEl.textContent = "-";
    if (emailEl) {
      emailEl.textContent = "-";
      emailEl.classList.remove("is-handle", "is-email");
    }
    if (bioEl) {
      bioEl.textContent = "";
      bioEl.classList.add("hidden");
    }
    if (joinedEl) {
      joinedEl.textContent = "-";
      joinedEl.classList.add("hidden");
    }
    renderProfileMetaStat(postsEl, tr.profilePosts || "Posts", "-");
    renderProfileMetaStat(followingEl, tr.profileFollowing || "Following", "-");
    renderProfileMetaStat(followersEl, tr.profileFollowers || "Followers", "-");
    renderProfileMetaStat(streakEl, tr.profileStreak || "Streak", "-");
    if (statTodayEl) statTodayEl.textContent = "-";
    if (statStreakEl) statStreakEl.textContent = "-";
    if (statTotalEl) statTotalEl.textContent = "-";
    if (accountGlanceEl) accountGlanceEl.classList.add("hidden");
    if (accountMiniStatsEl) accountMiniStatsEl.classList.add("hidden");
    if (accountShortcutsEl) accountShortcutsEl.classList.add("hidden");
    if (accountGlanceAvatarEl) renderAvatar(accountGlanceAvatarEl, null, "U");
    if (accountGlanceNameEl) accountGlanceNameEl.textContent = "-";
    if (accountGlanceHandleEl) {
      accountGlanceHandleEl.textContent = "";
      accountGlanceHandleEl.classList.add("hidden");
    }
    if (accountGlanceBioEl) {
      accountGlanceBioEl.textContent = "";
      accountGlanceBioEl.classList.add("hidden");
    }
    if (accountMiniPostsEl) accountMiniPostsEl.textContent = "-";
    if (accountMiniFollowersEl) accountMiniFollowersEl.textContent = "-";
    if (accountMiniStreakEl) accountMiniStreakEl.textContent = "-";
    toggleSectionVisibility("profile-facts-title", factsEl);
    toggleSectionVisibility("profile-highlights-title", highlightsEl);
    toggleCollapsibleVisibility("profile-details", false);
    return;
  }

  const joinedText = formatJoinedText(tr, currentProfile?.created_at);

  const userPosts = getUserPosts();
  const postCount = userPosts.length || getProfilePostCount() || 0;

  const dateKeys = new Set(
    userPosts.map((post) => toDateKey(post.date || post.created_at)).filter(Boolean)
  );
  const todayKey = toDateKey(new Date());
  const todayCount = todayKey
    ? userPosts.filter(
        (post) => toDateKey(post.date || post.created_at) === todayKey
      ).length
    : 0;
  const streak = todayKey && dateKeys.has(todayKey) ? computeStreak(dateKeys) : 0;

  const followingCount = getFollowingCount();
  const followersCount = getFollowersCount();

  const displayName = getProfileDisplayName(currentProfile, currentUser.email || "-");
  const handleLabel = currentProfile?.handle ? formatHandle(currentProfile.handle) : "";
  const secondaryIdentity = handleLabel || currentUser.email || "-";

  if (avatarEl) {
    renderAvatar(
      avatarEl,
      currentProfile,
      (displayName || handleLabel || "?").charAt(0).toUpperCase()
    );
  }
  if (cardEl) applyProfileTheme(cardEl, currentProfile);
  if (bannerEl) {
    applyProfileBanner(bannerEl, currentProfile);
    bannerEl.classList.toggle("hidden", !currentProfile?.banner_url);
  }
  if (nameEl) {
    nameEl.textContent = displayName;
  }
  if (emailEl) {
    emailEl.textContent = secondaryIdentity;
    emailEl.classList.toggle("is-handle", Boolean(handleLabel));
    emailEl.classList.toggle("is-email", !handleLabel && Boolean(currentUser.email));
  }
  if (bioEl) {
    const bioText = (currentProfile?.bio || "").trim();
    bioEl.textContent = bioText;
    bioEl.classList.toggle("hidden", !bioText);
  }
  renderProfileFacts(factsEl, currentProfile, tr);
  renderProfileHighlights(highlightsEl, currentProfile, tr);
  renderProfileCompletion(completionEl, currentProfile, tr);
  toggleSectionVisibility("profile-facts-title", factsEl);
  toggleSectionVisibility("profile-highlights-title", highlightsEl);
  const hasProfileExtras = Boolean(
    currentProfile?.banner_url ||
      (factsEl && factsEl.children.length) ||
      (highlightsEl && highlightsEl.children.length)
  );
  toggleCollapsibleVisibility("profile-details", hasProfileExtras);
  renderProfileStatsGrid(statsGridEl, userPosts, tr);
  renderProfileQuickStats(quickStatsEl, userPosts, tr);
  const metrics = buildProfileMetrics(userPosts, getWorkoutLogsByPost());
  const badges = buildProfileBadges(
    metrics,
    currentProfile,
    followersCount,
    tr
  );
  renderProfileBadges(badgesEl, badges);
  const pinnedPostId = getPinnedPostIdForUser(currentUser?.id);
  const pinnedPost = userPosts.find(
    (post) => `${post?.id || ""}` === pinnedPostId
  );
  renderPinnedPostPreview(pinnedEl, pinnedPost, tr);
  if (joinedEl) {
    joinedEl.textContent = joinedText || "-";
    joinedEl.classList.toggle("hidden", !joinedText);
  }
  renderProfileMetaStat(postsEl, tr.profilePosts || "Posts", postCount);
  renderProfileMetaStat(
    followingEl,
    tr.profileFollowing || "Following",
    followingCount
  );
  renderProfileMetaStat(
    followersEl,
    tr.profileFollowers || "Followers",
    followersCount
  );
  renderProfileMetaStat(
    streakEl,
    tr.profileStreak || "Streak",
    `${streak}${tr.profileStreakUnit || ""}`
  );
  if (statTodayEl) statTodayEl.textContent = `${todayCount}`;
  if (statStreakEl) statStreakEl.textContent = `${streak}`;
  if (statTotalEl) statTotalEl.textContent = `${postCount}`;
  if (accountGlanceEl) accountGlanceEl.classList.remove("hidden");
  if (accountMiniStatsEl) accountMiniStatsEl.classList.remove("hidden");
  if (accountShortcutsEl) accountShortcutsEl.classList.remove("hidden");
  if (accountGlanceAvatarEl) {
    renderAvatar(
      accountGlanceAvatarEl,
      currentProfile,
      (displayName || handleLabel || "U").charAt(0).toUpperCase()
    );
  }
  if (accountGlanceNameEl) accountGlanceNameEl.textContent = displayName;
  if (accountGlanceHandleEl) {
    const handleText = handleLabel || currentUser.email || "";
    accountGlanceHandleEl.textContent = handleText;
    accountGlanceHandleEl.classList.toggle("hidden", !handleText);
  }
  if (accountGlanceBioEl) {
    const bioPreview = `${currentProfile?.bio || ""}`.trim();
    accountGlanceBioEl.textContent = bioPreview;
    accountGlanceBioEl.classList.toggle("hidden", !bioPreview);
  }
  if (accountMiniPostsEl) accountMiniPostsEl.textContent = formatCompactNumber(postCount);
  if (accountMiniFollowersEl) {
    accountMiniFollowersEl.textContent = formatCompactNumber(followersCount);
  }
  if (accountMiniStreakEl) {
    accountMiniStreakEl.textContent = formatCompactNumber(streak);
  }
}

export function setupProfileLinks() {
  const feedList = $("feed-list");
  if (feedList) {
    feedList.addEventListener("click", (e) => {
      const link = e.target.closest(".profile-link");
      if (!link) return;
      const userId = link.getAttribute("data-user-id");
      if (userId) {
        const entryContext = buildPublicProfileEntryContextFromElement(link);
        openPublicProfile(userId, entryContext ? { entryContext } : {});
      }
    });
  }

  const backBtn = $("btn-back-to-feed");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      setActivePage("feed");
      if (window.location.hash) {
        history.replaceState(null, "", window.location.pathname);
      }
      setCurrentPublicProfileId(null);
    });
  }

  const prevBtn = $("btn-gallery-prev");
  const nextBtn = $("btn-gallery-next");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      setGalleryPage(Math.max(1, getGalleryPage() - 1));
      renderGalleryPage();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      setGalleryPage(getGalleryPage() + 1);
      renderGalleryPage();
    });
  }

  document
    .querySelectorAll("[data-public-share-trigger]")
    .forEach((shareBtn) => {
      if (shareBtn.dataset.bound === "true") return;
      shareBtn.dataset.bound = "true";
      shareBtn.addEventListener("click", async () => {
      const currentPublicProfileId = getCurrentPublicProfileId();
      if (!currentPublicProfileId) return;
      const base = window.location.href.split("#")[0];
      const url = `${base}#profile=${currentPublicProfileId}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast("プロフィールURLをコピーしました。", "success");
      } catch {
        window.prompt("このURLをコピーしてください", url);
      }
    });
    });

  document
    .querySelectorAll("[data-public-message-trigger]")
    .forEach((messageBtn) => {
      if (messageBtn.dataset.bound === "true") return;
      messageBtn.dataset.bound = "true";
      messageBtn.addEventListener("click", async () => {
      if (messageBtn.classList.contains("is-loading")) return;
      const currentUser = getCurrentUser();
      const currentPublicProfileId = getCurrentPublicProfileId();
      if (!currentUser || !currentPublicProfileId || currentUser.id === currentPublicProfileId) {
        return;
      }
      messageBtn.classList.add("is-loading");
      try {
        await openDmConversation(currentPublicProfileId, {
          entryContext: {
            source: "profile",
            partnerId: currentPublicProfileId,
            actorName: messageBtn.dataset.actorName || "",
            actorHandle: messageBtn.dataset.actorHandle || "",
            prefillMessage: messageBtn.dataset.prefillMessage || "",
          },
        });
      } finally {
        messageBtn.classList.remove("is-loading");
      }
    });
    });

  document
    .querySelectorAll("[data-profile-content-tab]")
    .forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";
      button.addEventListener("click", () => {
        const nextTab = button.getAttribute("data-profile-content-tab") || "posts";
        setPublicProfileContentTab(nextTab);
        const currentPublicProfileId = getCurrentPublicProfileId();
        if (currentPublicProfileId) {
          openPublicProfile(currentPublicProfileId);
        }
      });
    });

  document
    .querySelectorAll("[data-public-follow-trigger]")
    .forEach((followBtn) => {
      if (followBtn.dataset.bound === "true") return;
      followBtn.dataset.bound = "true";
      followBtn.addEventListener("click", async () => {
      if (followBtn.classList.contains("is-loading")) return;
      const currentUser = getCurrentUser();
      const currentPublicProfileId = getCurrentPublicProfileId();
      if (!currentUser || !currentPublicProfileId) return;
      followBtn.classList.add("is-loading");
      followBtn.disabled = true;
      try {
        await toggleFollowForUser(currentPublicProfileId);
        await loadFollowStats();
        await openPublicProfile(currentPublicProfileId, {
          forceCounts: true,
          preserveEntryContext: true,
        });
      } finally {
        followBtn.classList.remove("is-loading");
        followBtn.disabled = false;
      }
    });
    });
}

export async function openPublicProfile(userId, options = {}) {
  const currentLang = profileContext.getCurrentLang?.() || "ja";
  const tr = t[currentLang] || t.ja;
  if (!userId) return;
  const forceCounts = !!options.forceCounts;
  const revealState = normalizePublicProfileRevealState({
    userId,
    postId: options.revealPostId,
    tab: options.revealTab,
  });
  if (revealState) {
    pendingPublicProfileReveal = revealState;
  } else {
    clearPublicProfileRevealState();
  }
  if (options.entryContext) {
    currentPublicProfileEntryContext = normalizePublicProfileEntryContext({
      ...options.entryContext,
      userId,
    });
  } else if (
    !options.preserveEntryContext ||
    !currentPublicProfileEntryContext ||
    currentPublicProfileEntryContext.userId !== `${userId || ""}`.trim()
  ) {
    currentPublicProfileEntryContext = null;
  }
  const prevPublicId = getCurrentPublicProfileId();
  const isSamePublicProfile = prevPublicId === userId;
  setCurrentPublicProfileId(userId);
  if (prevPublicId !== userId) {
    setPublicPostsVisibleCount(getPublicPostsPageSize());
    setPublicProfileContentTab("posts");
    toggleCollapsibleVisibility("public-profile-details", false);
  }
  if (revealState?.tab) {
    setPublicProfileContentTab(revealState.tab);
  }

  const profile = await getProfile(userId);
  const handle = profile?.handle || profile?.username || "user";

  const cardEl = $("public-profile-card");
  const bannerEl = $("public-profile-banner");
  const factsEl = $("public-profile-facts");
  const highlightsEl = $("public-profile-highlights");
  const statsGridEl = $("public-profile-stats-grid");
  const quickStatsEl = $("public-profile-quick-stats");
  const badgesEl = $("public-profile-badges");
  const pinnedEl = $("public-profile-pinned");
  const avatarEl = $("public-profile-avatar");
  const displayEl = $("public-profile-name");
  const nameEl = $("public-profile-handle");
  const bioEl = $("public-profile-bio");
  const heroFactsEl = $("public-profile-hero-facts");
  const connectionEl = $("public-profile-connection");
  const spotlightEl = $("public-profile-spotlight");
  const contentRailEl = $("public-profile-content-rail");
  const joinedEl = $("public-profile-joined");
  const postsEl = $("public-profile-posts");
  const streakEl = $("public-profile-streak");
  const followingEl = $("public-profile-following");
  const followersEl = $("public-profile-followers");
  const followButtons = Array.from(
    document.querySelectorAll("[data-public-follow-trigger]")
  );
  const messageButtons = Array.from(
    document.querySelectorAll("[data-public-message-trigger]")
  );
  const shareButtons = Array.from(
    document.querySelectorAll("[data-public-share-trigger]")
  );

  const handleText = formatHandle(handle) || "@user";
  const displayName = profile?.display_name || handleText.replace("@", "");
  if (displayEl) displayEl.textContent = displayName;
  if (nameEl) nameEl.textContent = handleText;
  if (bioEl) {
    const bioText = (profile?.bio || "").trim();
    bioEl.textContent = bioText;
    bioEl.classList.toggle("hidden", !bioText);
  }
  if (avatarEl) {
    const initial = (displayName || handleText || "U")
      .replace("@", "")
      .charAt(0)
      .toUpperCase();
    renderAvatar(avatarEl, profile, initial);
  }
  if (cardEl) applyProfileTheme(cardEl, profile);
  if (bannerEl) {
    applyProfileBanner(bannerEl, profile);
    bannerEl.classList.toggle("hidden", !profile?.banner_url);
  }
  renderProfileFacts(factsEl, profile, tr);
  renderProfileHighlights(highlightsEl, profile, tr);
  renderPublicProfileHeroFacts(heroFactsEl, profile, tr);
  toggleSectionVisibility("public-profile-facts-title", factsEl);
  toggleSectionVisibility("public-profile-highlights-title", highlightsEl);
  const hasPublicExtras = Boolean(
    profile?.banner_url ||
      (factsEl && factsEl.children.length) ||
      (highlightsEl && highlightsEl.children.length)
  );
  toggleCollapsibleVisibility("public-profile-details", hasPublicExtras);
  if (joinedEl) {
    const joinedText = formatJoinedText(tr, profile?.created_at);
    joinedEl.textContent = joinedText || "-";
    joinedEl.classList.toggle("hidden", !joinedText);
  }

  const currentUser = getCurrentUser();
  const viewerProfile =
    currentUser && currentUser.id !== userId ? getCurrentProfile() : null;
  renderPublicProfileConnection(connectionEl, viewerProfile, profile, tr);
  const allPosts = getAllPosts();
  const workoutLogsByPost = getWorkoutLogsByPost();
  const likesByPost = getLikesByPost();
  const commentsByPost = getCommentsByPost();
  const { userPosts, mediaPosts } = getPublicProfilePostCollections(
    userId,
    allPosts,
    currentUser
  );
  const workoutPosts = userPosts.filter(
    (post) => (workoutLogsByPost.get(post.id) || []).length > 0
  );
  updatePublicProfileContentTabs(
    {
      posts: userPosts.length,
      media: mediaPosts.length,
      workouts: workoutPosts.length,
    },
    tr
  );
  updatePublicProfileContentSummary(
    getPublicProfileContentTab(),
    {
      posts: userPosts.length,
      media: mediaPosts.length,
      workouts: workoutPosts.length,
    },
    tr
  );
  updatePublicProfileActionDock({
    canMessage: !!currentUser && currentUser.id !== userId,
    isFollowing: getFollowingIds().has(userId),
    counts: {
      posts: userPosts.length,
      media: mediaPosts.length,
      workouts: workoutPosts.length,
    },
    tr,
  });
  const activeContentTab = getPublicProfileContentTab();
  const selectedPosts =
    activeContentTab === "media"
      ? mediaPosts
      : activeContentTab === "workouts"
        ? workoutPosts
        : userPosts;
  if (
    revealState &&
    revealState.tab !== "media" &&
    revealState.tab === activeContentTab
  ) {
    const revealIndex = selectedPosts.findIndex(
      (post) => `${post?.id || ""}` === revealState.postId
    );
    if (revealIndex >= 0) {
      const requiredVisibleCount = Math.max(
        getPublicPostsPageSize(),
        revealIndex + 1
      );
      if (requiredVisibleCount > getPublicPostsVisibleCount()) {
        setPublicPostsVisibleCount(requiredVisibleCount);
      }
    }
  }
  renderPublicProfileContentRail(contentRailEl, selectedPosts, {
    activeTab: activeContentTab,
    displayName,
    handle,
    userId,
    workoutLogsByPost,
    likesByPost,
    commentsByPost,
    tr,
  });

  renderProfileStatsGrid(statsGridEl, userPosts, tr);
  renderProfileQuickStats(quickStatsEl, userPosts, tr);
  const metrics = buildProfileMetrics(userPosts, getWorkoutLogsByPost());
  renderPublicProfileSpotlight(spotlightEl, metrics, profile, tr);

  renderProfileMetaStat(postsEl, tr.profilePosts || "Posts", userPosts.length);
  renderProfileMetaStat(
    streakEl,
    tr.profileStreak || "Streak",
    `${metrics.streak}${tr.profileStreakUnit || ""}`
  );

  const counts = await loadFollowCountsCached(userId, { force: forceCounts });
  const isFollowing = getFollowingIds().has(userId);
  const canMessage = !!currentUser && currentUser.id !== userId;
  const smartMessageStarter = buildPublicProfileMessageStarter({
    viewerProfile: currentProfile,
    targetProfile: profile,
    posts,
    workoutLogsByPost,
    tr,
  });
  renderProfileMetaStat(
    followingEl,
    tr.profileFollowing || "Following",
    counts.following
  );
  renderProfileMetaStat(
    followersEl,
    tr.profileFollowers || "Followers",
    counts.followers
  );
  const badges = buildProfileBadges(metrics, profile, counts.followers, tr);
  renderProfileBadges(badgesEl, badges);
  const pinnedPostId = getPinnedPostIdForUser(userId);
  const pinnedPost = userPosts.find(
    (post) => `${post?.id || ""}` === pinnedPostId
  );
  renderPinnedPostPreview(pinnedEl, pinnedPost, tr);

  followButtons.forEach((followBtn) => {
    if (!currentUser || currentUser.id === userId) {
      followBtn.classList.add("hidden");
      followBtn.classList.remove("is-entry-highlight", "is-following");
      followBtn.removeAttribute("aria-pressed");
      return;
    }
    followBtn.classList.remove("hidden");
    followBtn.textContent = isFollowing ? tr.unfollow || "Following" : tr.follow || "Follow";
    followBtn.classList.toggle("is-following", isFollowing);
    followBtn.classList.toggle(
      "is-entry-highlight",
      !!currentPublicProfileEntryContext &&
        currentPublicProfileEntryContext.source === "notification" &&
        currentPublicProfileEntryContext.notificationType === "follow" &&
        !isFollowing
    );
    followBtn.setAttribute("aria-pressed", isFollowing ? "true" : "false");
  });
  messageButtons.forEach((messageBtn) => {
    messageBtn.classList.toggle("hidden", !canMessage);
    messageBtn.disabled = !canMessage;
    messageBtn.dataset.actorName = displayName || "";
    messageBtn.dataset.actorHandle = handle || "";
    messageBtn.dataset.prefillMessage = smartMessageStarter || "";
    messageBtn.classList.toggle(
      "is-entry-highlight",
      !!currentPublicProfileEntryContext &&
        currentPublicProfileEntryContext.source === "notification" &&
        currentPublicProfileEntryContext.notificationType === "follow" &&
        canMessage
    );
    if (canMessage) {
      messageBtn.textContent = tr.message || "Message";
      messageBtn.setAttribute(
        "aria-label",
        `${tr.message || "Message"} ${displayName}`
      );
    } else {
      messageBtn.removeAttribute("aria-label");
    }
  });
  shareButtons.forEach((shareBtn) => {
    shareBtn.textContent = tr.shareProfile || tr.share || "Share";
    shareBtn.setAttribute(
      "aria-label",
      `${tr.shareProfile || tr.share || "Share"} ${displayName}`
    );
  });
  renderPublicProfileEntryContext(currentPublicProfileEntryContext, {
    canMessage,
    isFollowing,
    tr,
  });

  const list = $("public-profile-posts-list");
  const moreWrap = $("public-posts-more");
  const moreHint = $("public-posts-hint");
  const moreBtn = $("btn-public-posts-more");
  const gallerySection = $("public-profile-gallery-section");
  if (list) {
    list.classList.toggle("hidden", activeContentTab === "media");
    list.innerHTML = "";
    list.dataset.detailSource = "public-profile";
    list.dataset.profileUserId = `${userId || ""}`;
    list.dataset.profileName = displayName || "";
    list.dataset.profileHandle = handle || "";
    list.dataset.profileTab = activeContentTab || "posts";
    if (!selectedPosts.length && activeContentTab !== "media") {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent =
        activeContentTab === "workouts"
          ? tr.profileWorkoutEmpty || "No workout posts yet."
          : tr.emptyFeed || "No posts.";
      list.appendChild(empty);
    } else if (activeContentTab !== "media") {
      const visiblePosts = selectedPosts.slice(0, getPublicPostsVisibleCount());
      visiblePosts.forEach((post) => {
        const logs = workoutLogsByPost.get(post.id) || [];
        const detailEntryContext = buildPublicProfileDetailEntryContext({
          userId,
          displayName,
          handle,
          tab: activeContentTab || "posts",
        });
        const dmStarterMessage = buildPublicProfilePostMessageStarter(post, logs, tr);
        const likeCount = Number(likesByPost.get(post.id) || 0);
        const postComments = commentsByPost.get(post.id) || [];
        const commentCount = Number(postComments.length || 0);
        const setCount = logs.reduce(
          (sum, item) => sum + ((item?.sets || []).length || 0),
          0
        );
        const headlineText = buildProfilePostHeadline(post, logs, tr);
        const previewText = buildProfilePostPreview(post, logs, tr);
        const isPinnedPost = `${post?.id || ""}` === pinnedPostId;
        const isLatestPost = `${selectedPosts?.[0]?.id || ""}` === `${post?.id || ""}`;
        const postKind = getPublicProfilePostKind(post, logs);
        const clone = document.createElement("div");
        clone.className = "post-card public-profile-post-card";
        clone.classList.add(`is-${postKind}`);
        clone.setAttribute("data-post-id", post.id);
        clone.dataset.detailSource = "public-profile";
        clone.dataset.profileUserId = detailEntryContext.userId || "";
        clone.dataset.profileName = detailEntryContext.actorName || "";
        clone.dataset.profileHandle = detailEntryContext.actorHandle || "";
        clone.dataset.profileTab = detailEntryContext.tab || "posts";
        const shell = document.createElement("div");
        shell.className = "public-profile-post-shell";
        const copy = document.createElement("div");
        copy.className = "public-profile-post-copy";
        const titleRow = document.createElement("div");
        titleRow.className = "public-profile-post-top";
        const title = document.createElement("div");
        title.className = "post-sub";
        title.textContent = formatDateDisplay(post.date || post.created_at || "");
        titleRow.appendChild(title);

        const badgeRow = document.createElement("div");
        badgeRow.className = "public-profile-post-badges";
        if (isPinnedPost) {
          const pinnedBadge = document.createElement("span");
          pinnedBadge.className = "public-profile-post-badge is-pinned";
          pinnedBadge.textContent = tr.postPinnedBadge || tr.pinned || "Pinned";
          badgeRow.appendChild(pinnedBadge);
        }
        if (isLatestPost) {
          const latestBadge = document.createElement("span");
          latestBadge.className = "public-profile-post-badge is-latest";
          latestBadge.textContent = tr.profileSpotlightLatest || "Latest post";
          badgeRow.appendChild(latestBadge);
        }
        if (post.visibility === "private") {
          const privateBadge = document.createElement("span");
          privateBadge.className = "public-profile-post-badge is-private";
          privateBadge.textContent = tr.privateOnly || "Private";
          badgeRow.appendChild(privateBadge);
        }
        if (post.media_url) {
          const mediaBadge = document.createElement("span");
          mediaBadge.className = "public-profile-post-badge";
          mediaBadge.textContent =
            post.media_type === "video"
              ? tr.mediaVideoLabel || "VIDEO"
              : tr.mediaPhotoLabel || "PHOTO";
          badgeRow.appendChild(mediaBadge);
        }
        if (logs.length) {
          const workoutBadge = document.createElement("span");
          workoutBadge.className = "public-profile-post-badge is-workout";
          workoutBadge.textContent = `${logs.length}${tr.workoutExerciseCountLabel || "種目"}`;
          badgeRow.appendChild(workoutBadge);
        }
        if (badgeRow.childNodes.length) {
          titleRow.appendChild(badgeRow);
        }
        const contextRow = document.createElement("div");
        contextRow.className = "public-profile-post-context";
        const primaryContext = document.createElement("span");
        primaryContext.className = "public-profile-post-context-chip";
        primaryContext.textContent = logs.length
          ? tr.profileTabWorkouts || "Workouts"
          : post.media_type === "video"
            ? tr.mediaVideoLabel || "VIDEO"
            : post.media_url
              ? tr.mediaPhotoLabel || "PHOTO"
              : tr.profileTabPosts || "Posts";
        contextRow.appendChild(primaryContext);
        if (post.bodyweight !== null && post.bodyweight !== undefined && post.bodyweight !== "") {
          const weightContext = document.createElement("span");
          weightContext.className = "public-profile-post-context-chip is-bodyweight";
          weightContext.textContent = `${tr.weight || "Weight"} · ${formatWeight(post.bodyweight)}`;
          contextRow.appendChild(weightContext);
        }

        const headline = document.createElement("div");
        headline.className = "public-profile-post-title";
        headline.textContent = headlineText;

        const body = document.createElement("div");
        body.className = "post-body public-profile-post-preview";
        body.textContent = previewText;

        const summary = document.createElement("div");
        summary.className = "public-profile-post-summary";
        [
          logs.length
            ? {
                icon: "🏋",
                text: `${logs.length}${tr.workoutExerciseCountLabel || "種目"}`,
              }
            : null,
          setCount
            ? {
                icon: "◎",
                text: `${setCount}${tr.workoutSetCountLabel || "セット"}`,
              }
            : null,
          likeCount
            ? {
                icon: "♡",
                text: formatCompactNumber(likeCount),
              }
            : null,
          commentCount
            ? {
                icon: "💬",
                text: formatCompactNumber(commentCount),
              }
            : null,
        ]
          .filter(Boolean)
          .slice(0, 4)
          .forEach((item) => {
            const chip = document.createElement("span");
            chip.className = "public-profile-post-summary-chip";
            const icon = document.createElement("span");
            icon.className = "public-profile-post-summary-icon";
            icon.textContent = item.icon;
            const text = document.createElement("span");
            text.className = "public-profile-post-summary-text";
            text.textContent = item.text;
            chip.append(icon, text);
            summary.appendChild(chip);
          });

        const footer = document.createElement("div");
        footer.className = "public-profile-post-footer";
        if (summary.childNodes.length) {
          footer.appendChild(summary);
        }
        const openHint = document.createElement("span");
        openHint.className = `public-profile-post-open is-${postKind}`;
        const openLabel = document.createElement("span");
        openLabel.className = "public-profile-post-open-label";
        openLabel.textContent = getPublicProfilePostCtaLabel(post, logs, tr);
        const openArrow = document.createElement("span");
        openArrow.className = "public-profile-post-open-arrow";
        openArrow.setAttribute("aria-hidden", "true");
        openArrow.textContent = "↗";
        openHint.append(openLabel, openArrow);

        copy.appendChild(titleRow);
        if (contextRow.childNodes.length) {
          copy.appendChild(contextRow);
        }
        copy.appendChild(headline);
        copy.appendChild(body);
        const discussionTarget = getPublicProfileLatestDiscussionTarget(
          post,
          postComments,
          currentUser,
          tr
        );
        const discussionPreview = buildPublicProfileDiscussionPreview(post, postComments, {
          currentUser,
          entryContext: detailEntryContext,
          tr,
        });
        if (discussionPreview) {
          copy.appendChild(discussionPreview);
        }
        const footerActions = document.createElement("div");
        footerActions.className = "public-profile-post-footer-actions";
        if (canMessage) {
          const messageBtn = document.createElement("button");
          messageBtn.type = "button";
          messageBtn.className = "public-profile-post-message";
          messageBtn.textContent = tr.message || "Message";
          messageBtn.setAttribute(
            "aria-label",
            `${tr.message || "Message"} ${displayName || handle || ""}`.trim()
          );
          messageBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            await openDmConversation(userId, {
              profile,
              entryContext: {
                source: "public_profile",
                partnerId: userId,
                actorName: displayName || "",
                actorHandle: handle || "",
                postId: `${post?.id || ""}`,
                postLabel: headlineText,
                previewText: previewText,
                prefillMessage: dmStarterMessage,
              },
            });
          });
          footerActions.appendChild(messageBtn);
        }
        if (discussionTarget) {
          const discussionBtn = document.createElement("button");
          discussionBtn.type = "button";
          discussionBtn.className = "public-profile-post-discuss";
          if (discussionTarget.canQuickReply) {
            discussionBtn.classList.add("is-reply");
          }
          discussionBtn.textContent = discussionTarget.canQuickReply
            ? tr.commentReply || "Reply"
            : tr.feedOpenDiscussion || "Open discussion";
          discussionBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            openPostDetail(`${post.id}`, {
              entryContext: detailEntryContext,
              focusComments: true,
              focusCommentId: discussionTarget.latestCommentId,
              focusCommentActorId: discussionTarget.latestCommentActorId,
              focusCommentCreatedAt: discussionTarget.latestComment?.created_at || "",
              replyToCommentId: discussionTarget.canQuickReply
                ? discussionTarget.latestCommentId
                : "",
              replyToCommentActorId: discussionTarget.canQuickReply
                ? discussionTarget.latestCommentActorId
                : "",
              replyToCommentCreatedAt: discussionTarget.canQuickReply
                ? discussionTarget.latestComment?.created_at || ""
                : "",
            });
          });
          footerActions.appendChild(discussionBtn);
        }
        footerActions.appendChild(openHint);
        footer.appendChild(footerActions);
        copy.appendChild(footer);
        shell.appendChild(copy);
        if (post.media_url) {
          const thumb = document.createElement("div");
          thumb.className = "public-profile-post-thumb";
          const mediaLabel = document.createElement("span");
          mediaLabel.className = "public-profile-post-thumb-badge";
          mediaLabel.textContent =
            post.media_type === "video"
              ? tr.mediaVideoLabel || "VIDEO"
              : tr.mediaPhotoLabel || "PHOTO";
          thumb.appendChild(mediaLabel);
          if (post.media_type === "video") {
            const video = document.createElement("video");
            video.src = post.media_url;
            video.muted = true;
            video.playsInline = true;
            video.preload = "metadata";
            thumb.appendChild(video);
          } else {
            const img = document.createElement("img");
            img.src = post.media_url;
            img.alt = displayName || handleText;
            img.loading = "lazy";
            img.decoding = "async";
            img.referrerPolicy = "no-referrer";
            thumb.appendChild(img);
          }
          shell.appendChild(thumb);
        }
        clone.appendChild(shell);
        list.appendChild(clone);
      });
    }
  }

  if (moreWrap && moreBtn && moreHint) {
    const remaining = Math.max(0, selectedPosts.length - getPublicPostsVisibleCount());
    const shouldHideMore = activeContentTab === "media" || remaining === 0;
    moreWrap.classList.toggle("hidden", shouldHideMore);
    moreHint.textContent = remaining
      ? (tr.feedMoreHint || "あと{count}件").replace("{count}", remaining)
      : "";
    moreBtn.textContent = tr.feedMore || "もっと見る";
    if (!moreBtn.dataset.bound) {
      moreBtn.dataset.bound = "true";
      moreBtn.addEventListener("click", () => {
        setPublicPostsVisibleCount(getPublicPostsVisibleCount() + getPublicPostsPageSize());
        openPublicProfile(userId);
      });
    }
  }

  const gallerySignature = `${userId}|${mediaPosts.length}|${
    mediaPosts[0]?.id || ""
  }|${mediaPosts[mediaPosts.length - 1]?.id || ""}`;
  if (!isSamePublicProfile || publicProfileGallerySignature !== gallerySignature) {
    setCurrentGalleryPosts(mediaPosts);
    setGalleryPage(1);
    publicProfileGallerySignature = gallerySignature;
  }
  if (gallerySection) {
    gallerySection.classList.toggle("hidden", activeContentTab !== "media");
  }
  const galleryEl = $("public-profile-gallery");
  if (galleryEl) {
    galleryEl.dataset.detailSource = "public-profile";
    galleryEl.dataset.profileUserId = `${userId || ""}`;
    galleryEl.dataset.profileName = displayName || "";
    galleryEl.dataset.profileHandle = handle || "";
    galleryEl.dataset.profileTab = "media";
  }
  if (revealState && revealState.tab === "media") {
    const revealIndex = mediaPosts.findIndex(
      (post) => `${post?.id || ""}` === revealState.postId
    );
    if (revealIndex >= 0) {
      const galleryPageSize = 9;
      setGalleryPage(Math.floor(revealIndex / galleryPageSize) + 1);
    }
  }
  renderGalleryPage();

  if (revealState) {
    requestAnimationFrame(() => {
      revealPublicProfilePostCard(revealState);
      pendingPublicProfileReveal = null;
    });
  }

  if (
    (document?.body?.dataset?.page || "") !== "public-profile"
  ) {
    setActivePage("public-profile");
  }
  if (window.location.hash !== `#profile=${userId}`) {
    window.location.hash = `profile=${userId}`;
  }
}
