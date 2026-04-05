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
  };
}

function buildPublicProfileEntryLabel(context, tr) {
  if (!context) return "";
  if (context.source === "notification" && context.notificationType === "follow") {
    return tr.profileEntryFromFollow || "From follow notification";
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
  return actorDisplay || "";
}

function renderPublicProfileEntryContext(context, options = {}) {
  const wrap = $("public-profile-entry");
  const label = $("public-profile-entry-label");
  const text = $("public-profile-entry-text");
  if (!wrap || !label || !text) return;
  if (!context) {
    wrap.classList.add("hidden");
    wrap.setAttribute("aria-hidden", "true");
    label.textContent = "";
    text.textContent = "";
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
        openPublicProfile(userId);
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

  const shareBtn = $("btn-share-profile");
  if (shareBtn) {
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
  }

  const messageBtn = $("btn-public-message");
  if (messageBtn) {
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
          },
        });
      } finally {
        messageBtn.classList.remove("is-loading");
      }
    });
  }

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

  const followBtn = $("btn-public-follow");
  if (followBtn) {
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
  }
}

export async function openPublicProfile(userId, options = {}) {
  const currentLang = profileContext.getCurrentLang?.() || "ja";
  const tr = t[currentLang] || t.ja;
  if (!userId) return;
  const forceCounts = !!options.forceCounts;
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
  const spotlightEl = $("public-profile-spotlight");
  const joinedEl = $("public-profile-joined");
  const postsEl = $("public-profile-posts");
  const streakEl = $("public-profile-streak");
  const followingEl = $("public-profile-following");
  const followersEl = $("public-profile-followers");
  const followBtn = $("btn-public-follow");
  const messageBtn = $("btn-public-message");

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
  const activeContentTab = getPublicProfileContentTab();
  const selectedPosts =
    activeContentTab === "media"
      ? mediaPosts
      : activeContentTab === "workouts"
        ? workoutPosts
        : userPosts;

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

  if (followBtn) {
    if (!currentUser || currentUser.id === userId) {
      followBtn.style.display = "none";
      followBtn.classList.remove("is-entry-highlight");
    } else {
      followBtn.style.display = "inline-flex";
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
    }
  }
  if (messageBtn) {
    messageBtn.classList.toggle("hidden", !canMessage);
    messageBtn.disabled = !canMessage;
    messageBtn.dataset.actorName = displayName || "";
    messageBtn.dataset.actorHandle = handle || "";
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
  }
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
        const likeCount = Number(likesByPost.get(post.id) || 0);
        const commentCount = Number((commentsByPost.get(post.id) || []).length || 0);
        const setCount = logs.reduce(
          (sum, item) => sum + ((item?.sets || []).length || 0),
          0
        );
        const headlineText = buildProfilePostHeadline(post, logs, tr);
        const previewText = buildProfilePostPreview(post, logs, tr);
        const clone = document.createElement("div");
        clone.className = "post-card public-profile-post-card";
        clone.setAttribute("data-post-id", post.id);
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

        copy.appendChild(titleRow);
        copy.appendChild(headline);
        copy.appendChild(body);
        if (summary.childNodes.length) {
          copy.appendChild(summary);
        }
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
  renderGalleryPage();

  if (
    (document?.body?.dataset?.page || "") !== "public-profile"
  ) {
    setActivePage("public-profile");
  }
  if (window.location.hash !== `#profile=${userId}`) {
    window.location.hash = `profile=${userId}`;
  }
}
