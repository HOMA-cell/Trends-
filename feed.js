import {
  supabase,
  SUPABASE_CONFIG_SOURCE,
  clearStoredSupabaseConfig,
} from "./supabaseClient.js";
import { t } from "./i18n.js";
import {
  $,
  showToast,
  renderAvatar,
  formatHandle,
  formatDateDisplay,
  formatWeight,
  toDateKey,
  computeStreak,
} from "./utils.js";

let feedContext = {
  getCurrentUser: () => null,
  getCurrentLang: () => "ja",
  getSettings: () => ({}),
  getAllPosts: () => [],
  setAllPosts: () => {},
  getWorkoutLogsByPost: () => new Map(),
  getCommentsByPost: () => new Map(),
  getCommentsExpanded: () => new Set(),
  getCommentsLoading: () => new Set(),
  isCommentsEnabled: () => true,
  loadCommentsForPost: async () => [],
  submitComment: async () => {},
  toggleComments: () => {},
  createNotification: async () => {},
  deletePost: async () => {},
  getProfile: async () => null,
  getProfilesForUsers: async () => new Map(),
  toggleFollowForUser: async () => {},
  loadFollowStats: async () => {},
  getFollowingIds: () => new Set(),
  getLikedPostIds: () => new Set(),
  setLikedPostIds: () => {},
  getLikesByPost: () => new Map(),
  setLikesByPost: () => {},
  getLikesEnabled: () => true,
  setLikesEnabled: () => {},
  loadWorkoutLogs: async () => {},
  updateProfileSummary: () => {},
  renderWorkoutHistory: () => {},
  renderTrainingSummary: () => {},
  renderPrList: () => {},
  renderInsights: () => {},
  renderOnboardingChecklist: () => {},
  setActivePage: () => {},
  openDmShareComposer: () => {},
  onFeedLayoutChange: null,
  openPostModal: () => {},
};

export function setFeedContext(next = {}) {
  feedContext = { ...feedContext, ...next };
}

const getCurrentUser = () => feedContext.getCurrentUser?.();
const getCurrentLang = () => feedContext.getCurrentLang?.() || "ja";
const getSettings = () => feedContext.getSettings?.() || {};
const getAllPosts = () => feedContext.getAllPosts?.() || [];
const setAllPosts = (posts) => feedContext.setAllPosts?.(posts);
const getWorkoutLogsByPost = () => feedContext.getWorkoutLogsByPost?.() || new Map();
const getCommentsByPost = () => feedContext.getCommentsByPost?.() || new Map();
const getCommentsLoading = () => feedContext.getCommentsLoading?.() || new Set();
const isCommentsEnabled = () => !!feedContext.isCommentsEnabled?.();
const loadCommentsForPost = (...args) => feedContext.loadCommentsForPost?.(...args);
const submitComment = (...args) => feedContext.submitComment?.(...args);
const createNotification = (...args) => feedContext.createNotification?.(...args);
const deletePost = (...args) => feedContext.deletePost?.(...args);
const getProfilesForUsers = (...args) =>
  feedContext.getProfilesForUsers?.(...args) || new Map();
const toggleFollowForUser = (...args) => feedContext.toggleFollowForUser?.(...args);
const loadFollowStats = (...args) => feedContext.loadFollowStats?.(...args);
const getFollowingIds = () => feedContext.getFollowingIds?.() || new Set();
const getLikedPostIds = () => feedContext.getLikedPostIds?.() || new Set();
const getLikesByPost = () => feedContext.getLikesByPost?.() || new Map();
const openDmShareComposer = (...args) => feedContext.openDmShareComposer?.(...args);
const getLikesEnabled = () => feedContext.getLikesEnabled?.() ?? true;
const setLikesEnabled = (value) => feedContext.setLikesEnabled?.(value);
const loadWorkoutLogs = (...args) => feedContext.loadWorkoutLogs?.(...args);
const updateProfileSummary = () => feedContext.updateProfileSummary?.();
const renderWorkoutHistory = () => feedContext.renderWorkoutHistory?.();
const renderTrainingSummary = () => feedContext.renderTrainingSummary?.();
const renderPrList = () => feedContext.renderPrList?.();
const renderInsights = () => feedContext.renderInsights?.();
const renderOnboardingChecklist = () => feedContext.renderOnboardingChecklist?.();
const setActivePage = (page) => feedContext.setActivePage?.(page);
const openPostModal = (...args) => feedContext.openPostModal?.(...args);

let currentFilter = "foryou";
let filterMedia = false;
let filterWorkout = false;
let sortOrder = "newest";
let forYouTuning = "balanced";
let feedLayout = "list";
let feedViewMode = "feed";
let isFeedLoading = false;
let feedError = "";
let feedErrorCode = "";
let feedDemoMode = false;
let feedDemoLastAutoRetryAt = 0;
let feedPageSize = 8;
let feedVisibleCount = 8;
let feedLastLoadedAt = null;
let feedLoadingGeneration = 0;
let currentDetailPostId = null;
let feedRenderToken = 0;
let feedLoadPromise = null;
let feedNotice = "";
let feedNoticeTone = "";
let feedNoticeTimer = null;
let deferredVideoObserver = null;
let shortsCardObserver = null;
let shortsObserverRoot = null;
let activeShortsPostId = "";
let feedMoreObserver = null;
let feedAutoLoadingMore = false;
let feedLastAutoLoadAt = 0;
let feedMoreLoading = false;
let detailCommentsFocusRequested = false;
let detailCommentsFocusTimer = 0;
let feedIsOnline =
  typeof navigator === "undefined" ? true : navigator.onLine !== false;
let feedNetworkListenersBound = false;
let feedNetworkBackoffUntil = 0;
let feedNetworkBackoffLoaded = false;
let feedVisibilityListenerBound = false;
let feedPullListenersBound = false;
let feedPullActive = false;
let feedPullStartY = 0;
let feedPullDistance = 0;
let feedPullLastTriggeredAt = 0;
let likeOfflineQueue = [];
let likeOfflineQueueLoaded = false;
let likeOfflineQueueFlushing = false;
let feedQueryCache = {
  queryKey: "",
  postsRef: null,
  workoutLogsRef: null,
  gridCandidates: [],
};
let feedBaseCandidatesCache = {
  baseKey: "",
  postsRef: null,
  workoutLogsRef: null,
  sortedPosts: [],
};
const postSearchHaystackCache = new Map();
let secondaryRenderScheduled = false;
let secondaryRenderLastRunAt = 0;
let secondaryRenderCooldownTimer = null;
const pendingLikePostIds = new Set();
let feedRenderScheduled = false;
let feedScheduledRenderToken = 0;
let feedRenderPendingWhileHidden = false;
let feedSearchInputTimer = null;
let feedLastCommittedSearch = "";
let feedMoreAnchorTop = null;
let feedMoreAnchorScrollY = null;
let feedMoreLastTrigger = "manual";
let feedWindowUpdateRaf = 0;
let feedWindowListenersBound = false;
let feedChunkRendering = false;
let feedWindowLastRunAt = 0;
let feedWindowLastRunY = 0;
let feedWindowingEnabled = false;
const feedWindowedCards = new Map();
let feedKeyboardShortcutsBound = false;
let feedDetailKeyboardBound = false;
let feedCommentKeyboardBound = false;
let feedCardActionDelegationBound = false;
let feedAdvancedDismissBound = false;
let feedCommentSheetBound = false;
let feedPageSizeResizeBound = false;
let feedPageSizeResizeTimer = null;
const commentFocusRequests = new Map();
const commentReplyRequests = new Map();
const feedAdaptiveChunkSize = new Map();
const feedImageHydrationQueue = [];
let feedImageHydrationActive = 0;
const feedProfileCache = new Map();
const feedProfileQueueUserIds = new Set();
let feedProfileHydrationInFlight = false;
let feedProfileHydrationTimer = null;
const feedLikesLoadedPostIds = new Set();
const feedMetaQueuePostIds = new Set();
let feedMetaHydrationInFlight = false;
const warmedImageUrlSet = new Set();
const warmedImageUrlQueue = [];
const FEED_CACHE_KEY = "trends_feed_cache_v1";
const FEED_SAVED_POSTS_KEY = "trends_saved_posts_v1";
const FEED_HIDDEN_POSTS_KEY = "trends_hidden_posts_v1";
const FEED_MUTED_USERS_KEY = "trends_muted_users_v1";
const FEED_MUTED_TERMS_KEY = "trends_muted_terms_v1";
const FEED_FOLLOWED_TOPICS_KEY = "trends_followed_topics_v1";
const FEED_SEEN_POSTS_KEY = "trends_seen_posts_v1";
const FEED_REPOST_STATE_KEY = "trends_repost_state_v1";
const FEED_PINNED_POSTS_KEY = "trends_profile_pinned_post_v1";
const SHORTS_SOUND_ENABLED_KEY = "trends_shorts_sound_enabled_v1";
const LIKES_OFFLINE_QUEUE_KEY = "trends_likes_offline_queue_v1";
const FEED_NETWORK_BACKOFF_KEY = "trends_feed_network_backoff_until_v1";
const FEED_UI_STATE_KEY = "trends_feed_ui_state_v1";
const FEED_FILTERS = ["foryou", "all", "following", "mine", "saved", "public"];
const FEED_VIEW_MODES = ["feed", "shorts"];
const FEED_POST_SELECT_FIELDS =
  "id,user_id,date,created_at,visibility,note,caption,bodyweight,media_url,media_type";
const FEED_PROFILE_SELECT_FIELDS =
  "id,handle,display_name,avatar_url,accent_color";
const PERF_DEBUG_KEY = "trends_perf_debug";
const MODAL_ANIM_MS = 200;
const FEED_PULL_THRESHOLD = 70;
const FEED_PULL_MAX = 128;
const FEED_PULL_COOLDOWN_MS = 1600;
const FEED_SEARCH_DEBOUNCE_MS = 220;
const FEED_WINDOW_MIN_ITEMS = 22;
const FEED_WINDOW_MIN_ITEMS_MOBILE = 16;
const FEED_WINDOW_MIN_ITEMS_MOBILE_LITE = 12;
const FEED_WINDOW_MARGIN_PX = 820;
const FEED_WINDOW_RUN_INTERVAL_MS = 110;
const FEED_WINDOW_MIN_SCROLL_DELTA_PX = 28;
const FEED_WINDOW_SCAN_LIMIT_DESKTOP = 120;
const FEED_WINDOW_SCAN_LIMIT_MOBILE = 28;
const FEED_WINDOW_MUTATION_BUDGET_DESKTOP = 20;
const FEED_WINDOW_MUTATION_BUDGET_MOBILE = 4;
const FEED_CACHE_POST_LIMIT = 240;
const FEED_CACHE_TEXT_LIMIT = 600;
const FEED_CACHE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const FEED_NETWORK_POST_LIMIT = 260;
const FEED_MEDIA_OBSERVER_MARGIN = "420px 0px";
const FEED_MEDIA_VIDEO_PARK_MARGIN_PX = 1500;
const FEED_IMAGE_HYDRATE_CONCURRENCY = 3;
const FEED_WARMED_IMAGE_LIMIT = 320;
const FEED_SEARCH_CACHE_LIMIT = 2400;
const FEED_SEARCH_CACHE_LIMIT_MOBILE = 1200;
const FEED_SEARCH_TEXT_LIMIT = 280;
const FEED_SEARCH_LOG_LIMIT = 8;
const FEED_CHUNK_TARGET_MS_DESKTOP = 8;
const FEED_CHUNK_TARGET_MS_MOBILE = 6;
const FEED_CHUNK_HARD_MAX_MS_MOBILE = 12;
const FEED_CHUNK_HARD_MAX_MS = 16;
const FEED_META_BATCH_SIZE = 40;
const FEED_META_PRELOAD_MULTIPLIER = 5;
const FEED_NETWORK_BACKOFF_MS = 120000;
const FEED_DEMO_AUTO_RETRY_COOLDOWN_MS = 12000;
const FEED_PROFILE_BATCH_SIZE = 120;
const FEED_PROFILE_CACHE_LIMIT = 1400;
const FEED_PROFILE_HYDRATION_DELAY_MS = 90;
const FEED_SECONDARY_RENDER_COOLDOWN_MS = 1100;
const FEED_DISCOVERY_POST_SCAN_LIMIT = 180;
const FEED_DISCOVERY_TAG_LIMIT = 8;
const FEED_DISCOVERY_USER_LIMIT = 8;
const FEED_SEEN_POSTS_LIMIT = 2000;
const FEED_CAPTION_TRIM_LIMIT = 140;
const shortsVisibilityRatios = new Map();
let shortsSoundEnabled = false;
const commentReplyTargets = new Map();
const commentReplyFocusRequests = new Set();
const expandedCommentThreads = new Set();
const shortsPlaybackCueTimers = new WeakMap();
const shortsMediaTapTimers = new WeakMap();
const shortsHoldStates = new WeakMap();
const SHORTS_HOLD_PAUSE_DELAY_MS = 180;
const SHORTS_HOLD_SUPPRESS_TAP_MS = 280;
const FEED_CAPTION_TAG_LIMIT = 5;
const ADS_SETTINGS_KEY = "trends_ads_config_v1";
const ADSENSE_SCRIPT_BASE =
  "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
const FEED_AD_MIN_INTERVAL = 4;
const FEED_AD_MAX_INTERVAL = 20;
const FEED_AD_MIN_START_AT = 2;
const FEED_AD_MAX_START_AT = 40;
const FEED_AD_MAX_COUNT = 8;
let feedUiStateLoaded = false;
let feedDiscoveryExpanded = false;
let feedStatsExpanded = false;
let activeCommentPostId = "";
let seenPostsObserver = null;
let adSenseScriptClient = "";
let adSenseScriptLoading = false;
let adSenseScriptLoaded = false;

shortsSoundEnabled = loadShortsSoundPreference();

function emitFeedViewModeChanged() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent("trends-feed-view-mode-changed", {
        detail: { mode: feedViewMode },
      })
    );
  } catch {
    // ignore custom event failures
  }
}

function clampNumber(value, min, max, fallback) {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      return Math.min(max, Math.max(min, Math.round(num)));
    }
function normalizeAdsClientId(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (/^ca-pub-\d{10,24}$/i.test(raw)) return raw;
      if (/^\d{10,24}$/.test(raw)) return `ca-pub-${raw}`;
      return raw;
    }
function normalizeAdsSlotId(value) {
      return String(value || "")
        .trim()
        .replace(/[^\d]/g, "")
        .slice(0, 20);
    }
function normalizeFeedAdsSettings(payload = {}, fallback = {}) {
      return {
        enabled:
          payload.enabled === undefined
            ? fallback.enabled !== false
            : payload.enabled !== false,
        client: normalizeAdsClientId(
          payload.client === undefined ? fallback.client : payload.client
        ),
        feedSlot: normalizeAdsSlotId(
          payload.feedSlot === undefined ? fallback.feedSlot : payload.feedSlot
        ),
        testMode:
          payload.testMode === undefined
            ? fallback.testMode !== false
            : payload.testMode !== false,
        feedInterval: clampNumber(
          payload.feedInterval === undefined
            ? fallback.feedInterval
            : payload.feedInterval,
          FEED_AD_MIN_INTERVAL,
          FEED_AD_MAX_INTERVAL,
          8
        ),
        feedStartAt: clampNumber(
          payload.feedStartAt === undefined
            ? fallback.feedStartAt
            : payload.feedStartAt,
          FEED_AD_MIN_START_AT,
          FEED_AD_MAX_START_AT,
          4
        ),
        feedMaxAds: clampNumber(
          payload.feedMaxAds === undefined ? fallback.feedMaxAds : payload.feedMaxAds,
          0,
          FEED_AD_MAX_COUNT,
          3
        ),
      };
    }
function getRuntimeFeedAdsSettings() {
      const defaults = normalizeFeedAdsSettings(
        typeof window !== "undefined" ? window.__TRENDS_ADS__ || {} : {},
        {}
      );
      try {
        const stored = JSON.parse(localStorage.getItem(ADS_SETTINGS_KEY) || "{}");
        return normalizeFeedAdsSettings(stored, defaults);
      } catch {
        return defaults;
      }
    }
function isFeedAdsConfigured(settings) {
      return !!(
        settings &&
        settings.enabled !== false &&
        settings.client &&
        settings.feedSlot
      );
    }
function ensureAdSenseScript(settings) {
      if (typeof document === "undefined") return;
      if (!isFeedAdsConfigured(settings)) return;
      const client = settings.client;
      if (!client || adSenseScriptClient === client && adSenseScriptLoaded) return;
      if (adSenseScriptLoading && adSenseScriptClient === client) return;
      if (adSenseScriptLoaded && adSenseScriptClient && adSenseScriptClient !== client) {
        return;
      }
      let scriptEl = document.querySelector("script[data-adsense-loader='trends']");
      if (!scriptEl) {
        scriptEl = document.createElement("script");
        scriptEl.async = true;
        scriptEl.crossOrigin = "anonymous";
        scriptEl.dataset.adsenseLoader = "trends";
        document.head.appendChild(scriptEl);
      }
      scriptEl.src = `${ADSENSE_SCRIPT_BASE}?client=${encodeURIComponent(client)}`;
      adSenseScriptClient = client;
      adSenseScriptLoading = true;
      scriptEl.onload = () => {
        adSenseScriptLoading = false;
        adSenseScriptLoaded = true;
      };
      scriptEl.onerror = () => {
        adSenseScriptLoading = false;
      };
    }
function requestFeedAdRender(insEl) {
      if (!insEl || typeof window === "undefined") return;
      if (insEl.dataset.adRendered === "true") return;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        insEl.dataset.adRendered = "true";
      } catch {
        // ignore ad render errors (ad blocker / not loaded)
      }
    }
function shouldInsertFeedAdBeforePost({
      postIndex,
      insertedCount,
      visibleCount,
      settings,
      enabled,
    }) {
      if (!enabled || !isFeedAdsConfigured(settings)) return false;
      if (postIndex < settings.feedStartAt) return false;
      if (postIndex >= visibleCount) return false;
      if (insertedCount >= settings.feedMaxAds) return false;
      return (postIndex - settings.feedStartAt) % settings.feedInterval === 0;
    }
function createFeedAdCard(settings, tr) {
      const card = document.createElement("div");
      card.className = "feed-ad-card";
      card.setAttribute("data-ad-kind", "in-feed");
      const label = document.createElement("div");
      label.className = "feed-ad-label";
      label.textContent = tr.feedSponsoredLabel || "Sponsored";
      card.appendChild(label);

      const body = document.createElement("div");
      body.className = "feed-ad-body";
      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.setAttribute("data-ad-client", settings.client);
      ins.setAttribute("data-ad-slot", settings.feedSlot);
      ins.setAttribute("data-ad-format", "fluid");
      ins.setAttribute("data-full-width-responsive", "true");
      if (settings.testMode !== false) {
        ins.setAttribute("data-adtest", "on");
      }
      body.appendChild(ins);
      card.appendChild(body);

      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          requestFeedAdRender(ins);
        });
      } else {
        setTimeout(() => {
          requestFeedAdRender(ins);
        }, 0);
      }
      return card;
    }
const openBackdrop = (backdrop) => {
      if (!backdrop) return;
      if (backdrop._closeTimer) {
        clearTimeout(backdrop._closeTimer);
        backdrop._closeTimer = null;
      }
      backdrop.classList.remove("hidden");
      requestAnimationFrame(() => {
        backdrop.classList.add("is-open");
      });
    };
const closeBackdrop = (backdrop) => {
      if (!backdrop) return;
      backdrop.classList.remove("is-open");
      if (backdrop._closeTimer) {
        clearTimeout(backdrop._closeTimer);
      }
      backdrop._closeTimer = setTimeout(() => {
        backdrop.classList.add("hidden");
      }, MODAL_ANIM_MS);
    };
function getPostHashValue(postId) {
      const normalized = `${postId || ""}`.trim();
      if (!normalized) return "";
      return `#post=${encodeURIComponent(normalized)}`;
    }
function setPostHash(postId) {
      if (typeof window === "undefined") return;
      const nextHash = getPostHashValue(postId);
      if (!nextHash) return;
      if (window.location.hash === nextHash) return;
      window.location.hash = nextHash;
    }
function clearPostHash(postId = "") {
      if (typeof window === "undefined") return;
      const hash = window.location.hash || "";
      if (!hash.startsWith("#post=")) return;
      if (postId) {
        const expectedHash = getPostHashValue(postId);
        if (hash !== expectedHash) return;
      }
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
function hydrateDeferredVideo(videoEl) {
      if (!videoEl) return;
      if (videoEl.dataset.deferredLoaded === "true") {
        if (videoEl.dataset.parked === "true") {
          videoEl.preload = "metadata";
          delete videoEl.dataset.parked;
        }
        return;
      }
      const src = videoEl.dataset.src;
      if (!src) return;
      videoEl.preload = "metadata";
      videoEl.src = src;
      videoEl.dataset.deferredLoaded = "true";
      delete videoEl.dataset.src;
      videoEl.classList.remove("video-deferred");
    }
function hydrateDeferredImage(imgEl) {
      if (!imgEl) return;
      if (imgEl.dataset.deferredLoaded === "true") return;
      const src = imgEl.dataset.src;
      if (!src) return;
      imgEl.src = src;
      imgEl.dataset.deferredLoaded = "true";
      delete imgEl.dataset.src;
      delete imgEl.dataset.hydrationQueued;
      imgEl.classList.remove("image-deferred");
      rememberWarmedImageUrl(src);
    }
function rememberWarmedImageUrl(url) {
      if (!url) return;
      if (warmedImageUrlSet.has(url)) return;
      warmedImageUrlSet.add(url);
      warmedImageUrlQueue.push(url);
      while (warmedImageUrlQueue.length > FEED_WARMED_IMAGE_LIMIT) {
        const oldest = warmedImageUrlQueue.shift();
        if (!oldest) continue;
        warmedImageUrlSet.delete(oldest);
      }
    }
function flushImageHydrationQueue() {
      const concurrency = getFeedImageHydrationConcurrency();
      while (
        feedImageHydrationActive < concurrency &&
        feedImageHydrationQueue.length
      ) {
        const imgEl = feedImageHydrationQueue.shift();
        if (!imgEl || !imgEl.isConnected || imgEl.dataset.deferredLoaded === "true") {
          continue;
        }
        feedImageHydrationActive += 1;
        requestAnimationFrame(() => {
          try {
            hydrateDeferredImage(imgEl);
          } finally {
            feedImageHydrationActive = Math.max(0, feedImageHydrationActive - 1);
            flushImageHydrationQueue();
          }
        });
      }
    }
function queueImageHydration(imgEl) {
      if (!imgEl || imgEl.dataset.deferredLoaded === "true") return;
      if (imgEl.dataset.hydrationQueued === "true") return;
      imgEl.dataset.hydrationQueued = "true";
      feedImageHydrationQueue.push(imgEl);
      flushImageHydrationQueue();
    }
function prefersReducedMotion() {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
      }
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
function isLiteEffectsEnabled() {
      const settings = getSettings();
      return !!settings?.liteEffects;
    }
function isSaveDataEnabled() {
      if (isLiteEffectsEnabled()) return true;
      if (typeof navigator === "undefined") return false;
      return !!navigator.connection?.saveData;
    }
function isCompactViewport() {
      if (typeof window === "undefined") return false;
      return (window.innerWidth || 1024) <= 700;
    }
function getFeedViewportTier() {
      if (typeof window === "undefined") return "desktop";
      const width = window.innerWidth || 1024;
      if (width <= 700) return "mobile";
      if (width <= 980) return "tablet";
      return "desktop";
    }
function parseHttpUrl(rawUrl) {
      const source = `${rawUrl || ""}`.trim();
      if (!source || !/^https?:\/\//i.test(source)) return null;
      try {
        return new URL(source);
      } catch {
        return null;
      }
    }
function buildFeedTransformedImageUrl(rawUrl, options = {}) {
      const source = `${rawUrl || ""}`.trim();
      if (!source) return "";
      const url = parseHttpUrl(source);
      if (!url) return source;
      const host = `${url.hostname || ""}`.toLowerCase();
      const isSupabaseStorage =
        host.includes("supabase.co") &&
        url.pathname.includes("/storage/v1/object/");
      if (!isSupabaseStorage) return source;
      const width = Number(options.width || 0);
      const quality = Number(options.quality || 0);
      if (width > 0) {
        url.searchParams.set("width", `${Math.max(120, Math.round(width))}`);
      }
      if (quality > 0) {
        const clamped = Math.max(35, Math.min(85, Math.round(quality)));
        url.searchParams.set("quality", `${clamped}`);
      }
      if (!/\.gif(\?|#|$)/i.test(source)) {
        url.searchParams.set("format", "webp");
      }
      return url.toString();
    }
function getFeedImageDelivery(rawUrl, options = {}) {
      const source = `${rawUrl || ""}`.trim();
      if (!source) return { src: "", srcSet: "", sizes: "" };
      const layout = options.layout === "grid" ? "grid" : "list";
      const shorts = options.shorts === true;
      const compact = isCompactViewport();
      const lowPower = isLiteEffectsEnabled() || isSaveDataEnabled();
      const viewportWidth =
        typeof window === "undefined" ? 1024 : Math.max(320, window.innerWidth || 1024);
      let cssWidth = 320;
      if (shorts) {
        cssWidth = Math.min(viewportWidth, 560);
      } else if (layout === "grid") {
        const gutter = compact ? 28 : 44;
        cssWidth = Math.max(160, Math.floor((viewportWidth - gutter) / 2));
      } else {
        cssWidth = compact
          ? Math.max(220, viewportWidth - 40)
          : Math.min(760, Math.max(320, viewportWidth - 110));
      }
      const dprRaw = typeof window === "undefined" ? 1 : Number(window.devicePixelRatio || 1);
      const dprCap = lowPower ? 1.5 : 2;
      const dpr = Math.max(1, Math.min(dprCap, dprRaw));
      const width1x = Math.max(160, Math.round(cssWidth));
      const width2x = Math.max(width1x, Math.round(cssWidth * dpr));
      const quality = lowPower ? 50 : compact ? 60 : 68;
      const src = buildFeedTransformedImageUrl(source, {
        width: width1x,
        quality,
      });
      const src2x = buildFeedTransformedImageUrl(source, {
        width: width2x,
        quality,
      });
      const srcSet = src2x && src2x !== src ? `${src} 1x, ${src2x} 2x` : "";
      const sizes = shorts
        ? "100vw"
        : layout === "grid"
        ? "(max-width: 700px) 48vw, (max-width: 980px) 32vw, 280px"
        : "(max-width: 700px) 100vw, 760px";
      return {
        src: src || source,
        srcSet,
        sizes,
      };
    }
function getFeedImageHydrationConcurrency() {
      if (isLiteEffectsEnabled()) return 1;
      if (isSaveDataEnabled()) return 1;
      if (isCompactViewport()) return 1;
      return FEED_IMAGE_HYDRATE_CONCURRENCY;
    }
function getFeedMediaObserverMargin() {
      if (isLiteEffectsEnabled()) return "120px 0px";
      if (isSaveDataEnabled()) return "180px 0px";
      if (isCompactViewport()) return "260px 0px";
      return FEED_MEDIA_OBSERVER_MARGIN;
    }
function shouldUseFeedEntryAnimation() {
      if (isLiteEffectsEnabled()) return false;
      if (prefersReducedMotion()) return false;
      if (isCompactViewport()) return false;
      if (isSaveDataEnabled()) return false;
      return true;
    }
function parkDeferredVideo(videoEl) {
      if (!videoEl) return;
      if (videoEl.dataset.deferredLoaded !== "true") return;
      if (!videoEl.paused) {
        try {
          videoEl.pause();
        } catch {
          // ignore pause errors
        }
      }
      videoEl.preload = "none";
      videoEl.dataset.parked = "true";
    }
function ensureDeferredVideoObserver() {
      if (deferredVideoObserver) {
        return deferredVideoObserver;
      }
      if (typeof IntersectionObserver === "undefined") {
        return null;
      }
      deferredVideoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const mediaEl = entry.target;
            if (!mediaEl) return;
            if (mediaEl.tagName === "VIDEO") {
              if (entry.isIntersecting) {
                hydrateDeferredVideo(mediaEl);
                return;
              }
              if (!mediaEl.paused) {
                try {
                  mediaEl.pause();
                } catch {
                  // ignore pause errors
                }
              }
              if (feedLayout !== "grid") return;
              const rect = entry.boundingClientRect;
              const vh = typeof window === "undefined" ? 800 : window.innerHeight || 800;
              const isFarAway =
                rect.bottom < -FEED_MEDIA_VIDEO_PARK_MARGIN_PX ||
                rect.top > vh + FEED_MEDIA_VIDEO_PARK_MARGIN_PX;
              if (isFarAway) {
                parkDeferredVideo(mediaEl);
              }
              return;
            }
            if (mediaEl.tagName === "IMG") {
              if (!entry.isIntersecting) return;
              queueImageHydration(mediaEl);
              deferredVideoObserver?.unobserve(mediaEl);
            }
          });
        },
        {
          root: null,
          rootMargin: getFeedMediaObserverMargin(),
          threshold: 0.01,
        }
      );
      return deferredVideoObserver;
    }
function observeDeferredVideo(videoEl) {
      if (!videoEl) return;
      const observer = ensureDeferredVideoObserver();
      if (!observer) {
        hydrateDeferredVideo(videoEl);
        return;
      }
      observer.observe(videoEl);
    }
function observeDeferredImage(imgEl) {
      if (!imgEl) return;
      const observer = ensureDeferredVideoObserver();
      if (!observer) {
        queueImageHydration(imgEl);
        return;
      }
      observer.observe(imgEl);
    }
function isEditableTarget(target) {
      if (!target || typeof target.closest !== "function") return false;
      return !!target.closest(
        "input, textarea, select, [contenteditable=''], [contenteditable='true']"
      );
    }
function resetDeferredVideoObserver() {
      if (!deferredVideoObserver) return;
      deferredVideoObserver.disconnect();
      deferredVideoObserver = null;
    }
function mountMediaSkeleton(mediaWrap) {
      if (!mediaWrap) return;
      if (mediaWrap.querySelector(".media-skeleton")) return;
      mediaWrap.classList.add("is-loading");
      const skeleton = document.createElement("div");
      skeleton.className = "media-skeleton skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      mediaWrap.appendChild(skeleton);
    }
function clearMediaSkeleton(mediaWrap) {
      if (!mediaWrap) return;
      mediaWrap.classList.remove("is-loading");
      const skeleton = mediaWrap.querySelector(".media-skeleton");
      if (skeleton) {
        skeleton.remove();
      }
    }
function loadShortsSoundPreference() {
      if (typeof localStorage === "undefined") return false;
      try {
        return localStorage.getItem(SHORTS_SOUND_ENABLED_KEY) === "true";
      } catch {
        return false;
      }
    }
function persistShortsSoundPreference() {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(
          SHORTS_SOUND_ENABLED_KEY,
          shortsSoundEnabled ? "true" : "false"
        );
      } catch {
        // ignore localStorage write failures
      }
    }
function getShortsVideoForCard(card) {
      return card?.querySelector?.(".shorts-media video") || null;
    }
function getShortsButtonForCard(card, action) {
      if (!card || !action) return null;
      return card.querySelector(`button[data-post-action="${action}"]`);
    }
function getShortsInteractiveSurface(card) {
      return card?.querySelector?.(".shorts-media.is-interactive") || null;
    }
function getShortsPlaybackCue(card) {
      return card?.querySelector?.(".shorts-center-cue") || null;
    }
function getShortsActiveProgressFill(card) {
      return card?.querySelector?.(
        ".shorts-progress-segment.is-active .shorts-progress-segment-fill"
      ) || null;
    }
function updateShortsPlaybackProgress(card, videoEl = null) {
      const fill = getShortsActiveProgressFill(card);
      if (!fill) return;
      const targetVideo = videoEl || getShortsVideoForCard(card);
      if (
        !targetVideo ||
        !Number.isFinite(targetVideo.duration) ||
        targetVideo.duration <= 0
      ) {
        fill.style.opacity = "0";
        fill.style.transform = "scaleX(0)";
        return;
      }
      const nextRatio = Math.max(
        0,
        Math.min(1, (targetVideo.currentTime || 0) / targetVideo.duration)
      );
      fill.style.opacity = "1";
      fill.style.transform = `scaleX(${nextRatio.toFixed(4)})`;
    }
function triggerShortsCue(card, kind = "play") {
      const cue = getShortsPlaybackCue(card);
      if (!cue) return;
      const icon = cue.querySelector(".shorts-center-cue-icon");
      const label = cue.querySelector(".shorts-center-cue-label");
      if (!icon || !label) return;
      const tr = t[getCurrentLang()] || t.ja;
      let cueIcon = "▶";
      let cueLabel = tr.shortsTapPlay || "Tap to play";
      let tone = kind;
      if (kind === "pause") {
        cueIcon = "❚❚";
        cueLabel = tr.shortsTapPause || "Tap to pause";
      } else if (kind === "sound-on") {
        cueIcon = "♪";
        cueLabel = tr.shortsSoundOn || "Sound on";
        tone = "sound";
      } else if (kind === "sound-off") {
        cueIcon = "🔇";
        cueLabel = tr.shortsSoundOff || "Sound off";
        tone = "sound";
      } else if (kind === "like") {
        cueIcon = "❤";
        cueLabel = tr.like || "Like";
        tone = "like";
      }
      cue.dataset.state = tone;
      icon.textContent = cueIcon;
      label.textContent = cueLabel;
      cue.classList.remove("is-visible");
      void cue.offsetWidth;
      cue.classList.add("is-visible");
      const prevTimer = shortsPlaybackCueTimers.get(card);
      if (prevTimer) {
        clearTimeout(prevTimer);
      }
      const timer = setTimeout(() => {
        cue.classList.remove("is-visible");
      }, 760);
      shortsPlaybackCueTimers.set(card, timer);
    }
function clearShortsHoldState(card, { resume = false } = {}) {
      if (!card) return;
      const state = shortsHoldStates.get(card);
      if (!state) return;
      if (state.timer) {
        clearTimeout(state.timer);
      }
      card.classList.remove("is-press-paused");
      if (resume && state.holdActivated && state.wasPlaying && state.videoEl) {
        hydrateDeferredVideo(state.videoEl);
        const playPromise = state.videoEl.play?.();
        if (playPromise?.catch) {
          playPromise.catch(() => {
            card.classList.add("is-paused");
            syncShortsPlayButton(card, state.videoEl);
          });
        }
      }
      if (resume && state.holdActivated) {
        card.dataset.shortsSuppressTapUntil = `${Date.now() + SHORTS_HOLD_SUPPRESS_TAP_MS}`;
      }
      shortsHoldStates.delete(card);
      syncShortsPlayButton(card, state.videoEl);
      updateShortsPlaybackProgress(card, state.videoEl);
    }
function bindShortsMediaInteractions(card, mediaWrap, videoEl, post) {
      if (!card || !mediaWrap || !videoEl || !post) return;
      mediaWrap.classList.add("is-interactive");
      mediaWrap.tabIndex = 0;
      mediaWrap.setAttribute("role", "button");
      mediaWrap.setAttribute("aria-keyshortcuts", "Enter Space");
      const queueTapToggle = () => {
        const timer = shortsMediaTapTimers.get(card);
        if (timer) {
          clearTimeout(timer);
        }
        const nextTimer = setTimeout(() => {
          shortsMediaTapTimers.delete(card);
          toggleShortsPlayback(card, { showCue: true });
        }, 190);
        shortsMediaTapTimers.set(card, nextTimer);
      };
      mediaWrap.addEventListener("click", (event) => {
        if (event.target?.closest?.("button, a, summary")) return;
        const suppressUntil = Number(card.dataset.shortsSuppressTapUntil || 0);
        if (suppressUntil > Date.now()) return;
        if (`${card.getAttribute("data-post-id") || ""}` !== activeShortsPostId) return;
        if (event.detail > 1) return;
        queueTapToggle();
      });
      mediaWrap.addEventListener("dblclick", (event) => {
        event.preventDefault();
        const pending = shortsMediaTapTimers.get(card);
        if (pending) {
          clearTimeout(pending);
          shortsMediaTapTimers.delete(card);
        }
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const likeState = getLikeUiState(post.id, getLikedPostIds());
        if (likeState?.isLiked) {
          triggerShortsCue(card, "like");
          return;
        }
        toggleLikeForPost(post)
          .then(() => {
            triggerShortsCue(card, "like");
          })
          .catch((error) => {
            console.error("shorts double tap like failed", error);
          });
      });
      mediaWrap.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleShortsPlayback(card, { showCue: true });
      });
      mediaWrap.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (`${card.getAttribute("data-post-id") || ""}` !== activeShortsPostId) return;
        const pendingTap = shortsMediaTapTimers.get(card);
        if (pendingTap) {
          clearTimeout(pendingTap);
          shortsMediaTapTimers.delete(card);
        }
        clearShortsHoldState(card);
        const wasPlaying = !videoEl.paused;
        const holdState = {
          pointerId: event.pointerId,
          videoEl,
          wasPlaying,
          holdActivated: false,
          timer: setTimeout(() => {
            if (!wasPlaying) return;
            try {
              videoEl.pause?.();
            } catch {
              // ignore pause errors
            }
            holdState.holdActivated = true;
            card.classList.add("is-press-paused");
            syncShortsPlayButton(card, videoEl);
            updateShortsPlaybackProgress(card, videoEl);
            triggerShortsCue(card, "pause");
          }, SHORTS_HOLD_PAUSE_DELAY_MS),
        };
        shortsHoldStates.set(card, holdState);
      });
      const releaseHold = (event, { resume = true } = {}) => {
        const state = shortsHoldStates.get(card);
        if (!state) return;
        if (
          event?.pointerId !== undefined &&
          state.pointerId !== undefined &&
          state.pointerId !== event.pointerId
        ) {
          return;
        }
        clearShortsHoldState(card, { resume });
      };
      mediaWrap.addEventListener("pointerup", (event) => releaseHold(event, { resume: true }));
      mediaWrap.addEventListener("pointercancel", (event) =>
        releaseHold(event, { resume: false })
      );
      mediaWrap.addEventListener("pointerleave", (event) => {
        const state = shortsHoldStates.get(card);
        if (!state) return;
        if (state.holdActivated) {
          releaseHold(event, { resume: true });
          return;
        }
        clearShortsHoldState(card, { resume: false });
      });
    }
function syncShortsSoundButton(card) {
      const button = getShortsButtonForCard(card, "toggle-shorts-sound");
      if (!button) return;
      const tr = t[getCurrentLang()] || t.ja;
      const isMuted = !shortsSoundEnabled;
      button.classList.toggle("is-active", !isMuted);
      button.textContent = isMuted ? "🔇" : "♪";
      button.setAttribute(
        "aria-label",
        isMuted
          ? tr.shortsUnmute || "Turn sound on"
          : tr.shortsMute || "Mute"
      );
      button.title = isMuted
        ? tr.shortsSoundOff || "Sound off"
        : tr.shortsSoundOn || "Sound on";
    }
function syncShortsPlayButton(card, videoEl = null) {
      const tr = t[getCurrentLang()] || t.ja;
      const targetVideo = videoEl || getShortsVideoForCard(card);
      const isPlaying = !!targetVideo && !targetVideo.paused;
      const button = getShortsButtonForCard(card, "toggle-shorts-play");
      if (button) {
        button.classList.toggle("is-active", isPlaying);
        button.textContent = isPlaying ? "❚❚" : "▶";
        button.setAttribute(
          "aria-label",
          isPlaying
            ? tr.shortsPause || "Pause short"
            : tr.shortsPlay || "Play short"
        );
        button.title = isPlaying
          ? tr.shortsTapPause || "Tap to pause"
          : tr.shortsTapPlay || "Tap to play";
      }
      const surface = getShortsInteractiveSurface(card);
      if (surface) {
        surface.setAttribute(
          "aria-label",
          isPlaying
            ? tr.shortsTapPause || "Tap to pause"
            : tr.shortsTapPlay || "Tap to play"
        );
        surface.setAttribute(
          "title",
          isPlaying
            ? tr.shortsTapPause || "Tap to pause"
            : tr.shortsTapPlay || "Tap to play"
        );
      }
      updateShortsPlaybackProgress(card, targetVideo);
    }
function syncShortsCardVideo(card, { shouldPlay = false } = {}) {
      if (!card) return;
      const pendingTap = shortsMediaTapTimers.get(card);
      if (pendingTap) {
        clearTimeout(pendingTap);
        shortsMediaTapTimers.delete(card);
      }
      clearShortsHoldState(card);
      const videoEl = getShortsVideoForCard(card);
      if (!videoEl) {
        updateShortsPlaybackProgress(card, null);
        return;
      }
      videoEl.muted = !shortsSoundEnabled;
      videoEl.defaultMuted = !shortsSoundEnabled;
      card.classList.toggle("is-muted", !shortsSoundEnabled);
      if (shouldPlay) {
        hydrateDeferredVideo(videoEl);
        const playPromise = videoEl.play?.();
        if (playPromise?.catch) {
          playPromise.catch(() => {
            card.classList.add("is-paused");
            syncShortsPlayButton(card, videoEl);
          });
        }
      } else {
        try {
          videoEl.pause?.();
        } catch {
          // ignore pause errors
        }
      }
      card.classList.toggle("is-paused", !!videoEl.paused);
      syncShortsPlayButton(card, videoEl);
      syncShortsSoundButton(card);
    }
function syncAllShortsCards(root = shortsObserverRoot) {
      if (!root) return;
      root.querySelectorAll(".shorts-card").forEach((card) => {
        syncShortsCardVideo(card, {
          shouldPlay: `${card.getAttribute("data-post-id") || ""}` === activeShortsPostId,
        });
      });
    }
function setActiveShortsCard(nextCard, root = shortsObserverRoot) {
      const nextId = `${nextCard?.getAttribute?.("data-post-id") || ""}`;
      if (activeShortsPostId === nextId) {
        if (nextCard) {
          nextCard.classList.add("is-active");
          syncShortsCardVideo(nextCard, { shouldPlay: true });
        }
        return;
      }
      activeShortsPostId = nextId;
      const cards = root?.querySelectorAll?.(".shorts-card") || [];
      cards.forEach((card) => {
        const isActive = `${card.getAttribute("data-post-id") || ""}` === nextId;
        card.classList.toggle("is-active", isActive);
        syncShortsCardVideo(card, { shouldPlay: isActive });
      });
    }
function refreshActiveShortsCard(root = shortsObserverRoot) {
      if (!root) return;
      let bestCard = null;
      let bestRatio = 0;
      root.querySelectorAll(".shorts-card").forEach((card) => {
        const postId = `${card.getAttribute("data-post-id") || ""}`;
        const ratio = Number(shortsVisibilityRatios.get(postId) || 0);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestCard = card;
        }
      });
      if (!bestCard) {
        bestCard = root.querySelector(".shorts-card");
      }
      if (bestRatio < 0.4 && root.querySelector(".shorts-card.is-active")) {
        return;
      }
      setActiveShortsCard(bestCard, root);
    }
function resetShortsCardObserver() {
      if (shortsCardObserver) {
        shortsCardObserver.disconnect();
        shortsCardObserver = null;
      }
      shortsObserverRoot = null;
      activeShortsPostId = "";
      shortsVisibilityRatios.clear();
    }
function ensureShortsCardObserver(root) {
      if (!root) return null;
      if (shortsCardObserver && shortsObserverRoot === root) {
        return shortsCardObserver;
      }
      resetShortsCardObserver();
      if (typeof IntersectionObserver === "undefined") {
        return null;
      }
      shortsObserverRoot = root;
      shortsCardObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const card = entry.target;
            const postId = `${card?.getAttribute?.("data-post-id") || ""}`;
            if (!postId) return;
            shortsVisibilityRatios.set(postId, entry.isIntersecting ? entry.intersectionRatio : 0);
          });
          refreshActiveShortsCard(root);
        },
        {
          root,
          threshold: [0.25, 0.5, 0.72, 0.9],
        }
      );
      return shortsCardObserver;
    }
function observeShortsCard(card, root) {
      if (!card) return;
      const observer = ensureShortsCardObserver(root);
      if (!observer) {
        return;
      }
      observer.observe(card);
    }
function toggleShortsSoundPreference() {
      shortsSoundEnabled = !shortsSoundEnabled;
      persistShortsSoundPreference();
      syncAllShortsCards();
      const activeCard =
        shortsObserverRoot?.querySelector?.(
          `.shorts-card[data-post-id="${activeShortsPostId || ""}"]`
        ) || shortsObserverRoot?.querySelector?.(".shorts-card.is-active");
      if (activeCard) {
        triggerShortsCue(activeCard, shortsSoundEnabled ? "sound-on" : "sound-off");
      }
      const tr = t[getCurrentLang()] || t.ja;
      showToast(
        shortsSoundEnabled
          ? tr.shortsSoundOn || "Sound on"
          : tr.shortsSoundOff || "Sound off",
        "info"
      );
    }
function toggleShortsPlayback(card, { showCue = false } = {}) {
      const videoEl = getShortsVideoForCard(card);
      if (!videoEl) return;
      hydrateDeferredVideo(videoEl);
      let nextCue = "pause";
      if (videoEl.paused) {
        nextCue = "play";
        const playPromise = videoEl.play?.();
        if (playPromise?.catch) {
          playPromise.catch(() => {
            card.classList.add("is-paused");
            syncShortsPlayButton(card, videoEl);
          });
        }
      } else {
        try {
          videoEl.pause?.();
        } catch {
          // ignore pause errors
        }
      }
      card.classList.toggle("is-paused", !!videoEl.paused);
      syncShortsPlayButton(card, videoEl);
      if (showCue) {
        triggerShortsCue(card, nextCue);
      }
    }
function ensureFeedMoreObserver() {
      if (feedMoreObserver) {
        return feedMoreObserver;
      }
      if (typeof IntersectionObserver === "undefined") {
        return null;
      }
      feedMoreObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const btn = entry.target;
            const wrap = btn?.closest?.("#feed-more-wrap");
            if (!btn || !wrap || wrap.classList.contains("hidden")) return;
            const now = Date.now();
            if (feedAutoLoadingMore || now - feedLastAutoLoadAt < 700) return;
            feedAutoLoadingMore = true;
            feedLastAutoLoadAt = now;
            btn.click();
            setTimeout(() => {
              feedAutoLoadingMore = false;
            }, 120);
          });
        },
        {
          root: null,
          rootMargin: "280px 0px",
          threshold: 0.01,
        }
      );
      return feedMoreObserver;
    }
function observeFeedMoreButton(btn, shouldObserve) {
      if (!btn) return;
      const observer = ensureFeedMoreObserver();
      if (!observer) return;
      observer.unobserve(btn);
      if (shouldObserve) {
        observer.observe(btn);
      }
    }
function invalidateFeedQueryCache() {
      feedQueryCache = {
        queryKey: "",
        postsRef: null,
        workoutLogsRef: null,
        gridCandidates: [],
      };
      feedBaseCandidatesCache = {
        baseKey: "",
        postsRef: null,
        workoutLogsRef: null,
        sortedPosts: [],
      };
    }
function toSearchChunk(value, limit = FEED_SEARCH_TEXT_LIMIT) {
      if (value === null || value === undefined) return "";
      const text = String(value).trim();
      if (!text) return "";
      if (text.length <= limit) return text;
      return text.slice(0, limit);
    }
function getFeedSearchCacheLimit() {
      return isCompactViewport() ? FEED_SEARCH_CACHE_LIMIT_MOBILE : FEED_SEARCH_CACHE_LIMIT;
    }
function getFeedSearchDebounceMs() {
      if (isLiteEffectsEnabled()) return Math.max(120, FEED_SEARCH_DEBOUNCE_MS + 90);
      if (isSaveDataEnabled()) return Math.max(120, FEED_SEARCH_DEBOUNCE_MS + 60);
      if (isCompactViewport()) return FEED_SEARCH_DEBOUNCE_MS + 30;
      return FEED_SEARCH_DEBOUNCE_MS;
    }
function getPostSearchHaystack(post, workoutLogsMap) {
      if (!post) return "";
      const logs = workoutLogsMap.get(post.id) || [];
      const cached = postSearchHaystackCache.get(post.id);
      if (cached && cached.postRef === post && cached.logsRef === logs) {
        return cached.haystack;
      }
      const logText = logs
        .slice(0, FEED_SEARCH_LOG_LIMIT)
        .map((exercise) =>
          `${toSearchChunk(exercise.exercise)} ${toSearchChunk(exercise.note)}`
        )
        .join(" ");
      const haystack = [
        toSearchChunk(post.note),
        toSearchChunk(post.caption),
        post.bodyweight,
        toSearchChunk(post.profile?.handle),
        toSearchChunk(post.profile?.display_name),
        logText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      postSearchHaystackCache.set(post.id, {
        postRef: post,
        logsRef: logs,
        haystack,
      });
      const cacheLimit = getFeedSearchCacheLimit();
      while (postSearchHaystackCache.size > cacheLimit) {
        const oldestKey = postSearchHaystackCache.keys().next().value;
        if (oldestKey === undefined) break;
        postSearchHaystackCache.delete(oldestKey);
      }
      return haystack;
    }
function isPerfDebugEnabled() {
      try {
        return localStorage.getItem(PERF_DEBUG_KEY) === "true";
      } catch {
        return false;
      }
    }
function renderFeedPerfPanel(payload = null) {
      const el = $("feed-perf");
      if (!el) return;
      const enabled = isPerfDebugEnabled();
      el.classList.toggle("hidden", !enabled);
      if (!enabled) {
        el.textContent = "";
        return;
      }
      if (!payload) {
        el.textContent = "";
        return;
      }
      if (payload.type === "loading") {
        el.textContent = payload.message || "render loading";
        return;
      }
      const parts = [
        `render ${payload.durationMs.toFixed(1)}ms`,
        `total ${payload.totalCount}`,
        `visible ${payload.visibleCount}`,
        `mode ${payload.mode}`,
        `query ${payload.queryCacheHit ? "hit" : "miss"}`,
      ];
      if (typeof payload.pageSize === "number") {
        parts.push(`page ${payload.pageSize}`);
      }
      if (typeof payload.detachedCount === "number") {
        parts.push(`windowed ${payload.detachedCount}`);
      }
      el.textContent = parts.join(" | ");
    }
function getOnlineState() {
      return typeof navigator === "undefined" ? true : navigator.onLine !== false;
    }
function isLikelyTransientNetworkError(error) {
      if (!error) return false;
      if (!getOnlineState()) return true;
      const status = `${error.status || ""}`.toLowerCase();
      const code = `${error.code || ""}`.toLowerCase();
      const message = `${error.message || error.details || error.hint || error}`
        .toLowerCase()
        .trim();
      if (status === "0") return true;
      if (code.startsWith("08")) return true;
      return (
        message.includes("failed to fetch") ||
        message.includes("network") ||
        message.includes("connection") ||
        message.includes("timeout")
      );
    }
function classifyFeedConnectionIssue(error = null, fallbackMessage = "") {
      const status = Number(error?.status || 0);
      const codeText = `${error?.code || ""}`.toLowerCase().trim();
      const nameText = `${error?.name || ""}`.toLowerCase().trim();
      const messageText = `${error?.message || error?.details || error?.hint || fallbackMessage || ""}`
        .toLowerCase()
        .trim();
      if (nameText === "aborterror" || messageText.includes("timeout")) {
        return "timeout";
      }
      if ([401, 403].includes(status)) {
        return "auth";
      }
      if (status === 404) {
        return "notfound";
      }
      if (
        codeText.includes("err_name_not_resolved") ||
        messageText.includes("err_name_not_resolved") ||
        messageText.includes("name not resolved") ||
        messageText.includes("could not resolve") ||
        messageText.includes("enotfound") ||
        messageText.includes("dns")
      ) {
        return "dns";
      }
      if (
        messageText.includes("invalid api key") ||
        messageText.includes("apikey") ||
        messageText.includes("jwt")
      ) {
        return "auth";
      }
      return "network";
    }
function formatFeedConnectionError(code, tr = {}) {
      switch (code) {
        case "dns":
          return (
            tr.feedConnectionErrorDns ||
            "Could not resolve Supabase hostname. Verify your Project URL."
          );
        case "timeout":
          return tr.feedConnectionErrorTimeout || "Supabase connection timed out.";
        case "auth":
          return (
            tr.feedConnectionErrorAuth ||
            "Supabase authentication failed. Verify your anon key."
          );
        case "notfound":
          return (
            tr.feedConnectionErrorNotFound ||
            "Supabase endpoint was not found. Verify your Project URL."
          );
        default:
          return tr.feedConnectionErrorNetwork || "Failed to connect to Supabase.";
      }
    }
function isSupabaseConnectivityIssue(message, tr = {}) {
      const text = String(message || "").toLowerCase().trim();
      if (!text) return false;
      const localized = String(tr.authNetworkError || "")
        .toLowerCase()
        .trim();
      const markers = [
        localized,
        "supabase",
        "failed to fetch",
        "network",
        "connection",
        "connect",
        "err_name_not_resolved",
        "could not resolve",
        "dns",
        "接続",
      ].filter(Boolean);
      return markers.some((marker) => text.includes(marker));
    }
function createDemoFeedPosts() {
      const now = Date.now();
      const toIsoHoursAgo = (hoursAgo = 0) =>
        new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
      return [
        {
          id: "demo-post-1",
          user_id: "demo-user-1",
          date: toIsoHoursAgo(2),
          created_at: toIsoHoursAgo(2),
          visibility: "public",
          caption:
            "肩の日。OHP 5x5 + lateral raise。フォーム優先で追い込みました。",
          log: "OHP 5x5 / Lateral raise 4x15 / Face pull 3x20",
          weight: 72.4,
          media_url: "",
          profile: {
            id: "demo-user-1",
            handle: "hiro_demo",
            display_name: "Hiro",
            bio: "Strength + physique",
            avatar_url: "",
          },
        },
        {
          id: "demo-post-2",
          user_id: "demo-user-2",
          date: toIsoHoursAgo(19),
          created_at: toIsoHoursAgo(19),
          visibility: "public",
          caption:
            "脚トレ。スクワットの深さを調整して膝の違和感なし。次回は+2.5kg。",
          log: "Back squat 5x5 / Leg press 4x12 / RDL 4x8",
          weight: 61.2,
          media_url: "",
          profile: {
            id: "demo-user-2",
            handle: "mika_lifts",
            display_name: "Mika",
            bio: "Hypertrophy focus",
            avatar_url: "",
          },
        },
        {
          id: "demo-post-3",
          user_id: "demo-user-3",
          date: toIsoHoursAgo(31),
          created_at: toIsoHoursAgo(31),
          visibility: "public",
          caption:
            "背中の日。懸垂の可動域を意識。体重は維持しつつ出力を上げる週。",
          log: "Pull-up 6x6 / Row 4x10 / Lat pull 4x12",
          weight: 79.8,
          media_url: "",
          profile: {
            id: "demo-user-3",
            handle: "ken_train",
            display_name: "Ken",
            bio: "Powerbuilding",
            avatar_url: "",
          },
        },
      ];
    }
function getFeedNetworkBackoffRemainingMs() {
      return Math.max(0, feedNetworkBackoffUntil - Date.now());
    }
function loadFeedNetworkBackoff() {
      if (feedNetworkBackoffLoaded) return;
      feedNetworkBackoffLoaded = true;
      try {
        const raw = localStorage.getItem(FEED_NETWORK_BACKOFF_KEY);
        const parsed = Number.parseInt(raw || "0", 10);
        if (Number.isFinite(parsed) && parsed > Date.now()) {
          feedNetworkBackoffUntil = parsed;
        }
      } catch {
        // ignore localStorage read failures
      }
    }
function persistFeedNetworkBackoff() {
      try {
        if (feedNetworkBackoffUntil > Date.now()) {
          localStorage.setItem(
            FEED_NETWORK_BACKOFF_KEY,
            String(feedNetworkBackoffUntil)
          );
        } else {
          localStorage.removeItem(FEED_NETWORK_BACKOFF_KEY);
        }
      } catch {
        // ignore localStorage write failures
      }
    }
function clearFeedNetworkBackoff() {
      feedNetworkBackoffUntil = 0;
      persistFeedNetworkBackoff();
    }
function setFeedNetworkBackoff() {
      feedNetworkBackoffUntil = Date.now() + FEED_NETWORK_BACKOFF_MS;
      persistFeedNetworkBackoff();
    }
function isAllowedFeedFilter(filter) {
      return FEED_FILTERS.includes(`${filter || ""}`);
    }
function isAllowedForYouTuning(value) {
      return ["fresh", "balanced", "viral"].includes(`${value || ""}`);
    }
function isAllowedFeedViewMode(value) {
      return FEED_VIEW_MODES.includes(`${value || ""}`);
    }
function getSavedPostIdsSet() {
      try {
        const raw = localStorage.getItem(FEED_SAVED_POSTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return new Set();
        return new Set(
          parsed
            .map((id) => `${id || ""}`.trim())
            .filter(Boolean)
            .slice(0, 1200)
        );
      } catch {
        return new Set();
      }
    }
function setSavedPostIdsSet(savedSet) {
      try {
        const next = Array.from(savedSet || [])
          .map((id) => `${id || ""}`.trim())
          .filter(Boolean)
          .slice(0, 1200);
        localStorage.setItem(FEED_SAVED_POSTS_KEY, JSON.stringify(next));
      } catch {
        // ignore localStorage write failures
      }
    }
function toggleSavedPostId(postId) {
      const id = `${postId || ""}`.trim();
      if (!id) return false;
      const savedSet = getSavedPostIdsSet();
      let isSaved = false;
      if (savedSet.has(id)) {
        savedSet.delete(id);
      } else {
        savedSet.add(id);
        isSaved = true;
      }
      setSavedPostIdsSet(savedSet);
      return isSaved;
    }
function getHiddenPostIdsSet() {
      try {
        const raw = localStorage.getItem(FEED_HIDDEN_POSTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return new Set();
        return new Set(
          parsed
            .map((id) => `${id || ""}`.trim())
            .filter(Boolean)
            .slice(0, FEED_SEEN_POSTS_LIMIT)
        );
      } catch {
        return new Set();
      }
    }
function setHiddenPostIdsSet(hiddenSet) {
      try {
        const next = Array.from(hiddenSet || [])
          .map((id) => `${id || ""}`.trim())
          .filter(Boolean)
          .slice(0, FEED_SEEN_POSTS_LIMIT);
        localStorage.setItem(FEED_HIDDEN_POSTS_KEY, JSON.stringify(next));
      } catch {
        // ignore localStorage write failures
      }
    }
function hidePostId(postId) {
      const id = `${postId || ""}`.trim();
      if (!id) return false;
      const hidden = getHiddenPostIdsSet();
      if (hidden.has(id)) return false;
      hidden.add(id);
      setHiddenPostIdsSet(hidden);
      return true;
    }
function clearHiddenPostIds() {
      try {
        localStorage.removeItem(FEED_HIDDEN_POSTS_KEY);
      } catch {
        // ignore localStorage write failures
      }
    }
function getMutedUserIdsSet() {
      try {
        const raw = localStorage.getItem(FEED_MUTED_USERS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return new Set();
        return new Set(
          parsed
            .map((id) => `${id || ""}`.trim())
            .filter(Boolean)
            .slice(0, FEED_SEEN_POSTS_LIMIT)
        );
      } catch {
        return new Set();
      }
    }
function setMutedUserIdsSet(userSet) {
      try {
        const next = Array.from(userSet || [])
          .map((id) => `${id || ""}`.trim())
          .filter(Boolean)
          .slice(0, FEED_SEEN_POSTS_LIMIT);
        localStorage.setItem(FEED_MUTED_USERS_KEY, JSON.stringify(next));
      } catch {
        // ignore localStorage write failures
      }
    }
function toggleMutedUserId(userId) {
      const uid = `${userId || ""}`.trim();
      if (!uid) return false;
      const mutedSet = getMutedUserIdsSet();
      let isMuted = false;
      if (mutedSet.has(uid)) {
        mutedSet.delete(uid);
      } else {
        mutedSet.add(uid);
        isMuted = true;
      }
      setMutedUserIdsSet(mutedSet);
      return isMuted;
    }
function clearMutedUserIds() {
      try {
        localStorage.removeItem(FEED_MUTED_USERS_KEY);
      } catch {
        // ignore localStorage write failures
      }
    }
function normalizeMutedTerm(term) {
      return `${term || ""}`
        .trim()
        .toLowerCase()
        .replace(/^#+/g, "")
        .slice(0, 32);
    }
function normalizeTopicTerm(term) {
      return normalizeMutedTerm(term);
    }
function getMutedTermsSet() {
      try {
        const raw = localStorage.getItem(FEED_MUTED_TERMS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return new Set();
        const normalized = parsed
          .map((term) => normalizeMutedTerm(term))
          .filter(Boolean)
          .slice(0, 120);
        return new Set(normalized);
      } catch {
        return new Set();
      }
    }
function setMutedTermsSet(termSet) {
      try {
        const next = Array.from(termSet || [])
          .map((term) => normalizeMutedTerm(term))
          .filter(Boolean)
          .slice(0, 120);
        localStorage.setItem(FEED_MUTED_TERMS_KEY, JSON.stringify(next));
      } catch {
        // ignore localStorage write failures
      }
    }
function toggleMutedTerm(term) {
      const normalized = normalizeMutedTerm(term);
      if (!normalized) return { active: false, term: "" };
      const termSet = getMutedTermsSet();
      let active = false;
      if (termSet.has(normalized)) {
        termSet.delete(normalized);
      } else {
        termSet.add(normalized);
        active = true;
      }
      setMutedTermsSet(termSet);
      return { active, term: normalized };
    }
function clearMutedTerms() {
      try {
        localStorage.removeItem(FEED_MUTED_TERMS_KEY);
      } catch {
        // ignore localStorage write failures
      }
    }
function getMuteTermCandidateForPost(post) {
      const text = `${post?.note || post?.caption || ""}`;
      const hashtagMatch = text.match(/#([^\s#]{2,24})/u);
      if (hashtagMatch?.[1]) {
        return normalizeMutedTerm(hashtagMatch[1]);
      }
      const alphaMatch = text.match(/\b([a-zA-Z][a-zA-Z0-9_-]{2,20})\b/);
      if (alphaMatch?.[1]) {
        return normalizeMutedTerm(alphaMatch[1]);
      }
      const jpMatch = text.match(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,12})/u);
      if (jpMatch?.[1]) {
        return normalizeMutedTerm(jpMatch[1]);
      }
      return "";
    }
function isPostMutedByTerms(post, mutedTermsSet, workoutLogsMap) {
      if (!post || !mutedTermsSet || mutedTermsSet.size === 0) return false;
      const haystack = getPostSearchHaystack(post, workoutLogsMap);
      if (!haystack) return false;
      return Array.from(mutedTermsSet).some((term) => {
        const normalized = normalizeMutedTerm(term);
        if (!normalized) return false;
        return haystack.includes(normalized) || haystack.includes(`#${normalized}`);
      });
    }
function getFollowedTopicsSet() {
      try {
        const raw = localStorage.getItem(FEED_FOLLOWED_TOPICS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return new Set();
        const normalized = parsed
          .map((term) => normalizeTopicTerm(term))
          .filter(Boolean)
          .slice(0, 120);
        return new Set(normalized);
      } catch {
        return new Set();
      }
    }
function setFollowedTopicsSet(topicSet) {
      try {
        const next = Array.from(topicSet || [])
          .map((term) => normalizeTopicTerm(term))
          .filter(Boolean)
          .slice(0, 120);
        localStorage.setItem(FEED_FOLLOWED_TOPICS_KEY, JSON.stringify(next));
      } catch {
        // ignore localStorage write failures
      }
    }
function toggleFollowedTopic(term) {
      const normalized = normalizeTopicTerm(term);
      if (!normalized) return { active: false, term: "" };
      const topicSet = getFollowedTopicsSet();
      let active = false;
      if (topicSet.has(normalized)) {
        topicSet.delete(normalized);
      } else {
        topicSet.add(normalized);
        active = true;
      }
      setFollowedTopicsSet(topicSet);
      return { active, term: normalized };
    }
function getPostTopicTerms(post, workoutLogsMap = null) {
      if (!post) return [];
      const text = `${post?.note || ""} ${post?.caption || ""}`.trim();
      const hashtags = parseHashtagsFromText(text).slice(0, 8);
      if (hashtags.length) return Array.from(new Set(hashtags.map(normalizeTopicTerm).filter(Boolean)));
      const fallback = getMuteTermCandidateForPost(post);
      if (fallback) return [normalizeTopicTerm(fallback)].filter(Boolean);
      if (workoutLogsMap && typeof workoutLogsMap.get === "function") {
        const logs = workoutLogsMap.get(post?.id) || [];
        const lift = `${logs?.[0]?.exercise || ""}`.trim();
        if (lift) return [normalizeTopicTerm(lift)].filter(Boolean);
      }
      return [];
    }
function getPinnedPostsByUserMap() {
      try {
        const raw = localStorage.getItem(FEED_PINNED_POSTS_KEY);
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
function setPinnedPostsByUserMap(mapByUser = {}) {
      try {
        const normalized = {};
        Object.entries(mapByUser || {}).forEach(([userId, postId]) => {
          const uid = `${userId || ""}`.trim();
          const pid = `${postId || ""}`.trim();
          if (!uid || !pid) return;
          normalized[uid] = pid;
        });
        localStorage.setItem(FEED_PINNED_POSTS_KEY, JSON.stringify(normalized));
      } catch {
        // ignore localStorage write failures
      }
    }
function getPinnedPostIdForUser(userId) {
      const uid = `${userId || ""}`.trim();
      if (!uid) return "";
      const mapByUser = getPinnedPostsByUserMap();
      return `${mapByUser[uid] || ""}`.trim();
    }
function isPinnedPostForUser(postId, userId) {
      const pid = `${postId || ""}`.trim();
      if (!pid) return false;
      return getPinnedPostIdForUser(userId) === pid;
    }
function togglePinnedPostForUser(postId, userId) {
      const pid = `${postId || ""}`.trim();
      const uid = `${userId || ""}`.trim();
      if (!pid || !uid) {
        return { isPinned: false, postId: "" };
      }
      const mapByUser = getPinnedPostsByUserMap();
      const currentPinned = `${mapByUser[uid] || ""}`.trim();
      if (currentPinned === pid) {
        delete mapByUser[uid];
        setPinnedPostsByUserMap(mapByUser);
        return { isPinned: false, postId: "" };
      }
      mapByUser[uid] = pid;
      setPinnedPostsByUserMap(mapByUser);
      return { isPinned: true, postId: pid };
    }
function getRepostState() {
      try {
        const raw = localStorage.getItem(FEED_REPOST_STATE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const byUser = parsed?.byUser && typeof parsed.byUser === "object"
          ? parsed.byUser
          : {};
        return { byUser };
      } catch {
        return { byUser: {} };
      }
    }
function setRepostState(state) {
      try {
        const byUser =
          state?.byUser && typeof state.byUser === "object"
            ? state.byUser
            : {};
        localStorage.setItem(
          FEED_REPOST_STATE_KEY,
          JSON.stringify({ byUser })
        );
      } catch {
        // ignore localStorage write failures
      }
    }
function getRepostedPostIdsForUser(userId, repostState = null) {
      const id = `${userId || ""}`.trim();
      if (!id) return new Set();
      const source = repostState || getRepostState();
      const list = Array.isArray(source?.byUser?.[id]) ? source.byUser[id] : [];
      return new Set(
        list
          .map((item) => `${item || ""}`.trim())
          .filter(Boolean)
          .slice(-FEED_SEEN_POSTS_LIMIT)
      );
    }
function buildRepostCountMap(repostState = null) {
      const source = repostState || getRepostState();
      const map = new Map();
      const byUser =
        source?.byUser && typeof source.byUser === "object" ? source.byUser : {};
      Object.values(byUser).forEach((list) => {
        if (!Array.isArray(list)) return;
        list.forEach((postId) => {
          const id = `${postId || ""}`.trim();
          if (!id) return;
          map.set(id, (map.get(id) || 0) + 1);
        });
      });
      return map;
    }
function toggleRepostForUser(postId, userId) {
      const pid = `${postId || ""}`.trim();
      const uid = `${userId || ""}`.trim();
      if (!pid || !uid) {
        return { isReposted: false, count: 0 };
      }
      const state = getRepostState();
      const current = getRepostedPostIdsForUser(uid, state);
      let isReposted = false;
      if (current.has(pid)) {
        current.delete(pid);
      } else {
        current.add(pid);
        isReposted = true;
      }
      state.byUser[uid] = Array.from(current).slice(-FEED_SEEN_POSTS_LIMIT);
      setRepostState(state);
      const repostCount = buildRepostCountMap(state).get(pid) || 0;
      return { isReposted, count: repostCount };
    }
function getSeenPostIdsSet() {
      try {
        const raw = localStorage.getItem(FEED_SEEN_POSTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return new Set();
        return new Set(
          parsed
            .map((id) => `${id || ""}`.trim())
            .filter(Boolean)
            .slice(-FEED_SEEN_POSTS_LIMIT)
        );
      } catch {
        return new Set();
      }
    }
function setSeenPostIdsSet(seenSet) {
      try {
        const next = Array.from(seenSet || [])
          .map((id) => `${id || ""}`.trim())
          .filter(Boolean)
          .slice(-FEED_SEEN_POSTS_LIMIT);
        localStorage.setItem(FEED_SEEN_POSTS_KEY, JSON.stringify(next));
      } catch {
        // ignore localStorage write failures
      }
    }
function markPostAsSeen(postId) {
      const id = `${postId || ""}`.trim();
      if (!id) return false;
      const seenSet = getSeenPostIdsSet();
      if (seenSet.has(id)) return false;
      seenSet.add(id);
      setSeenPostIdsSet(seenSet);
      return true;
    }
function ensureSeenPostsObserver() {
      if (seenPostsObserver) return seenPostsObserver;
      if (typeof IntersectionObserver === "undefined") return null;
      seenPostsObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry?.isIntersecting || entry.intersectionRatio < 0.58) return;
            const card = entry.target;
            const postId = `${card?.getAttribute?.("data-post-id") || ""}`.trim();
            if (!postId) return;
            const changed = markPostAsSeen(postId);
            if (changed) {
              card.classList.add("post-card-seen");
            }
            seenPostsObserver?.unobserve(card);
          });
        },
        {
          root: null,
          rootMargin: "0px",
          threshold: [0.58],
        }
      );
      return seenPostsObserver;
    }
function observeSeenPostCard(card, isSeen) {
      if (!card || isSeen) return;
      const observer = ensureSeenPostsObserver();
      if (!observer) return;
      observer.observe(card);
    }
function resetSeenPostsObserver() {
      if (!seenPostsObserver) return;
      seenPostsObserver.disconnect();
    }
function getPostTimestamp(post) {
      return new Date(post?.date || post?.created_at || 0).getTime() || 0;
    }
function getForYouScore(post, options = {}) {
      const nowMs = options.nowMs || Date.now();
      const currentUserId = `${options.currentUserId || ""}`;
      const followingIds = options.followingIds || new Set();
      const followedTopics = options.followedTopics || new Set();
      const tuning = isAllowedForYouTuning(options.forYouTuning)
        ? options.forYouTuning
        : "balanced";
      const likesByPost = options.likesByPost || new Map();
      const commentsByPost = options.commentsByPost || new Map();
      const workoutLogsByPost = options.workoutLogsByPost || new Map();
      const repostCountsByPost = options.repostCountsByPost || new Map();

      const ageMs = Math.max(0, nowMs - getPostTimestamp(post));
      const recency = Math.exp(-ageMs / (36 * 60 * 60 * 1000));
      const likeCount = Math.max(0, Number(likesByPost.get(post.id) || 0));
      const commentCount = Math.max(
        0,
        Number((commentsByPost.get(post.id) || []).length || 0)
      );
      const workoutCount = Math.max(
        0,
        Number((workoutLogsByPost.get(post.id) || []).length || 0)
      );
      const repostCount = Math.max(
        0,
        Number(repostCountsByPost.get(post.id) || 0)
      );
      const hasMedia = !!post?.media_url;
      const isFollowing = followingIds.has(`${post?.user_id || ""}`);
      const isOwn = !!currentUserId && `${post?.user_id || ""}` === currentUserId;
      const topicTerms = getPostTopicTerms(post, workoutLogsByPost);
      const hasTopicMatch = topicTerms.some((term) => followedTopics.has(term));
      const modeWeights = {
        fresh: {
          recency: 6.2,
          like: 0.17,
          comment: 0.25,
          workout: 0.14,
          repost: 0.15,
          media: 0.45,
          following: 0.42,
          topic: 0.85,
        },
        balanced: {
          recency: 4.6,
          like: 0.24,
          comment: 0.35,
          workout: 0.16,
          repost: 0.22,
          media: 0.8,
          following: 0.55,
          topic: 1.05,
        },
        viral: {
          recency: 2.8,
          like: 0.33,
          comment: 0.48,
          workout: 0.17,
          repost: 0.36,
          media: 1.05,
          following: 0.38,
          topic: 0.92,
        },
      };
      const weights = modeWeights[tuning] || modeWeights.balanced;

      let score = 0;
      score += recency * weights.recency;
      score += Math.min(24, likeCount) * weights.like;
      score += Math.min(12, commentCount) * weights.comment;
      score += Math.min(10, workoutCount) * weights.workout;
      score += Math.min(18, repostCount) * weights.repost;
      score += hasMedia ? weights.media : 0;
      score += isFollowing ? weights.following : 0;
      score += hasTopicMatch ? weights.topic : 0;
      score += isOwn ? -0.25 : 0;
      return score;
    }
function rankForYouPosts(posts = [], options = {}) {
      const source = Array.isArray(posts) ? posts : [];
      if (!source.length) return [];
      const nowMs = Date.now();
      const sortOrderValue = options.sortOrder === "oldest" ? "oldest" : "newest";
      return source
        .slice()
        .sort((a, b) => {
          const scoreDiff =
            getForYouScore(b, { ...options, nowMs }) -
            getForYouScore(a, { ...options, nowMs });
          if (Math.abs(scoreDiff) > 0.001) {
            return scoreDiff;
          }
          const aTime = getPostTimestamp(a);
          const bTime = getPostTimestamp(b);
          if (sortOrderValue === "oldest") {
            return aTime - bTime;
          }
          return bTime - aTime;
        });
    }
function parseHashtagsFromText(text) {
      const raw = `${text || ""}`;
      if (!raw) return [];
      const tokens = raw.match(/#[^\s#]{2,32}/g) || [];
      return tokens
        .map((token) =>
          token
            .replace(/^#+/, "")
            .replace(/[.,!?;:)\]'"`]+$/g, "")
            .toLowerCase()
        )
        .filter(Boolean);
    }
function getCaptionHashtags(text, limit = FEED_CAPTION_TAG_LIMIT) {
      const safeLimit = Math.max(0, Number(limit) || FEED_CAPTION_TAG_LIMIT);
      if (safeLimit <= 0) return [];
      const hashtags = parseHashtagsFromText(text).map((tag) =>
        normalizeTopicTerm(tag)
      );
      return Array.from(new Set(hashtags.filter(Boolean))).slice(0, safeLimit);
    }
function buildTrendingHashtags(posts = []) {
      const counts = new Map();
      const source = Array.isArray(posts) ? posts.slice(0, FEED_DISCOVERY_POST_SCAN_LIMIT) : [];
      source.forEach((post, index) => {
        const tags = Array.from(new Set(getPostTopicTerms(post)));
        if (!tags.length) return;
        const postTime = getPostTimestamp(post);
        const ageMs = Math.max(0, Date.now() - postTime);
        const freshnessBoost = Math.exp(-ageMs / (48 * 60 * 60 * 1000));
        const userId = `${post?.user_id || ""}`.trim();
        tags.forEach((tag) => {
          const current = counts.get(tag) || {
            usage: 0,
            score: 0,
            users: new Set(),
            latestTs: 0,
          };
          current.usage += 1;
          current.score += 1 + freshnessBoost * 1.6;
          if (userId) {
            current.users.add(userId);
          }
          if (postTime > current.latestTs) {
            current.latestTs = postTime;
          }
          counts.set(tag, current);
        });
      });
      return Array.from(counts.entries())
        .sort((a, b) => {
          const aUsers = a[1].users?.size || 0;
          const bUsers = b[1].users?.size || 0;
          const aScore = a[1].score + aUsers * 1.25 + Math.min(4, a[1].usage) * 0.35;
          const bScore = b[1].score + bUsers * 1.25 + Math.min(4, b[1].usage) * 0.35;
          if (Math.abs(bScore - aScore) > 0.0001) {
            return bScore - aScore;
          }
          return (b[1].latestTs || 0) - (a[1].latestTs || 0);
        })
        .slice(0, FEED_DISCOVERY_TAG_LIMIT)
        .map(([tag]) => tag);
    }
function buildSuggestedUsers(posts = [], options = {}) {
      const currentUserId = `${options.currentUserId || ""}`;
      const followingIds = options.followingIds || new Set();
      const source = Array.isArray(posts) ? posts.slice(0, FEED_DISCOVERY_POST_SCAN_LIMIT) : [];
      const bucket = new Map();
      source.forEach((post, index) => {
        const userId = `${post?.user_id || ""}`.trim();
        if (!userId) return;
        if (userId === currentUserId) return;
        if (followingIds.has(userId)) return;
        const item = bucket.get(userId) || {
          userId,
          score: 0,
          postCount: 0,
          profile: post?.profile || null,
        };
        item.postCount += 1;
        if (!item.profile && post?.profile) {
          item.profile = post.profile;
        }
        const recencyBonus = 1 + (source.length - index) / Math.max(1, source.length);
        item.score += recencyBonus + (post?.media_url ? 0.55 : 0);
        bucket.set(userId, item);
      });
      return Array.from(bucket.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, FEED_DISCOVERY_USER_LIMIT);
    }
function loadFeedUiState() {
      if (feedUiStateLoaded) return;
      feedUiStateLoaded = true;
      try {
        const raw = localStorage.getItem(FEED_UI_STATE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const nextFilter = String(parsed?.currentFilter || "");
        const nextSort = String(parsed?.sortOrder || "");
        const nextTuning = String(parsed?.forYouTuning || "");
        const nextViewMode = String(parsed?.feedViewMode || "");
        const nextSearch = String(parsed?.search || "").trim().toLowerCase();
        if (isAllowedFeedFilter(nextFilter)) {
          currentFilter = nextFilter;
        }
        if (["newest", "oldest"].includes(nextSort)) {
          sortOrder = nextSort;
        }
        if (isAllowedForYouTuning(nextTuning)) {
          forYouTuning = nextTuning;
        }
        if (isAllowedFeedViewMode(nextViewMode)) {
          feedViewMode = nextViewMode;
        }
        if (typeof parsed?.filterMedia === "boolean") {
          filterMedia = parsed.filterMedia;
        }
        if (typeof parsed?.filterWorkout === "boolean") {
          filterWorkout = parsed.filterWorkout;
        }
        // Keep Feed clean on every launch.
        feedDiscoveryExpanded = false;
        feedStatsExpanded = false;
        feedLastCommittedSearch = nextSearch.slice(0, 120);
      } catch {
        // ignore persisted feed UI parse failures
      }
    }
function persistFeedUiState() {
      try {
        const payload = {
          currentFilter: isAllowedFeedFilter(currentFilter) ? currentFilter : "all",
          sortOrder: sortOrder === "oldest" ? "oldest" : "newest",
          forYouTuning: isAllowedForYouTuning(forYouTuning)
            ? forYouTuning
            : "balanced",
          feedViewMode: isAllowedFeedViewMode(feedViewMode) ? feedViewMode : "feed",
          filterMedia: !!filterMedia,
          filterWorkout: !!filterWorkout,
          discoveryExpanded: !!feedDiscoveryExpanded,
          statsExpanded: !!feedStatsExpanded,
          search: String(feedLastCommittedSearch || "").slice(0, 120),
        };
        localStorage.setItem(FEED_UI_STATE_KEY, JSON.stringify(payload));
      } catch {
        // ignore persisted feed UI write failures
      }
    }
function loadLikeOfflineQueue() {
      if (likeOfflineQueueLoaded) return;
      likeOfflineQueueLoaded = true;
      try {
        const raw = localStorage.getItem(LIKES_OFFLINE_QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        likeOfflineQueue = Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn("load like offline queue failed", error);
        likeOfflineQueue = [];
      }
    }
function saveLikeOfflineQueue() {
      try {
        localStorage.setItem(
          LIKES_OFFLINE_QUEUE_KEY,
          JSON.stringify(Array.isArray(likeOfflineQueue) ? likeOfflineQueue : [])
        );
      } catch (error) {
        console.warn("save like offline queue failed", error);
      }
    }
function getLikeOfflineQueueKey(action) {
      return `${action?.userId || ""}:${action?.postId || ""}`;
    }
function upsertLikeOfflineQueueAction(action) {
      if (!action?.postId || !action?.userId) return;
      loadLikeOfflineQueue();
      const key = getLikeOfflineQueueKey(action);
      const idx = likeOfflineQueue.findIndex(
        (item) => getLikeOfflineQueueKey(item) === key
      );
      if (idx >= 0) {
        likeOfflineQueue[idx] = { ...likeOfflineQueue[idx], ...action };
      } else {
        likeOfflineQueue.push(action);
      }
      saveLikeOfflineQueue();
    }
async function flushLikeOfflineQueue(options = {}) {
      loadLikeOfflineQueue();
      if (!likeOfflineQueue.length) return 0;
      if (likeOfflineQueueFlushing) return 0;
      const currentUser = getCurrentUser();
      if (!currentUser?.id) return 0;
      if (!getOnlineState()) return 0;
      const tr = t[getCurrentLang()] || t.ja;
      const silent = !!options.silent;
      likeOfflineQueueFlushing = true;
      let synced = 0;
      try {
        for (let idx = 0; idx < likeOfflineQueue.length; ) {
          const action = likeOfflineQueue[idx];
          if (!action || action.userId !== currentUser.id || !action.postId) {
            idx += 1;
            continue;
          }
          try {
            if (action.desiredLiked) {
              const { error } = await supabase.from("post_likes").insert({
                post_id: action.postId,
                user_id: action.userId,
              });
              if (error && error.code !== "23505") {
                throw error;
              }
              if (
                !error &&
                action.targetUserId &&
                action.targetUserId !== action.userId
              ) {
                await createNotification({
                  userId: action.targetUserId,
                  actorId: action.userId,
                  type: "like",
                  postId: action.postId,
                });
              }
            } else {
              const { error } = await supabase
                .from("post_likes")
                .delete()
                .eq("post_id", action.postId)
                .eq("user_id", action.userId);
              if (error) throw error;
            }
            likeOfflineQueue.splice(idx, 1);
            saveLikeOfflineQueue();
            synced += 1;
          } catch (error) {
            if (isLikelyTransientNetworkError(error)) {
              break;
            }
            console.error("flush like queue error:", error);
            likeOfflineQueue.splice(idx, 1);
            saveLikeOfflineQueue();
          }
        }
      } finally {
        likeOfflineQueueFlushing = false;
      }
      if (synced > 0) {
        scheduleRenderFeed();
        if (!silent) {
          setFeedNotice(
            tr.offlineSyncDone || "オフライン操作を同期しました。",
            "success",
            1800
          );
        }
      }
      return synced;
    }
function applyQueuedLikeState() {
      loadLikeOfflineQueue();
      if (!likeOfflineQueue.length) return;
      const currentUser = getCurrentUser();
      if (!currentUser?.id) return;
      const likedPostIds = getLikedPostIds();
      const likesByPost = getLikesByPost();
      likeOfflineQueue.forEach((action) => {
        if (!action || action.userId !== currentUser.id || !action.postId) return;
        const currentlyLiked = likedPostIds.has(action.postId);
        const currentCount = likesByPost.get(action.postId) || 0;
        if (action.desiredLiked) {
          if (!currentlyLiked) {
            likedPostIds.add(action.postId);
            likesByPost.set(action.postId, currentCount + 1);
          }
          return;
        }
        if (currentlyLiked) {
          likedPostIds.delete(action.postId);
          likesByPost.set(action.postId, Math.max(0, currentCount - 1));
        }
      });
    }
function clampFeedPostsForCache(posts = []) {
      if (!Array.isArray(posts) || !posts.length) return [];
      return posts.slice(0, FEED_CACHE_POST_LIMIT).map((post) => {
        if (!post || typeof post !== "object") return null;
        const note = String(post.note || "");
        const caption = String(post.caption || "");
        const safeProfile =
          post.profile && typeof post.profile === "object"
            ? {
                id: post.profile.id || post.user_id || null,
                handle: post.profile.handle || post.profile.username || "",
                display_name: post.profile.display_name || "",
                avatar_url: post.profile.avatar_url || "",
                accent_color: post.profile.accent_color || "",
              }
            : null;
        return {
          id: post.id || null,
          user_id: post.user_id || null,
          created_at: post.created_at || null,
          date: post.date || post.created_at || null,
          visibility: post.visibility || "public",
          media_url: post.media_url || "",
          media_type: post.media_type || "",
          bodyweight:
            post.bodyweight === null || post.bodyweight === undefined
              ? null
              : post.bodyweight,
          note:
            note.length > FEED_CACHE_TEXT_LIMIT
              ? `${note.slice(0, FEED_CACHE_TEXT_LIMIT)}…`
              : note,
          caption:
            caption.length > FEED_CACHE_TEXT_LIMIT
              ? `${caption.slice(0, FEED_CACHE_TEXT_LIMIT)}…`
              : caption,
          profile: safeProfile,
        };
      }).filter(Boolean);
    }
function saveFeedCache(posts = []) {
      try {
        const payload = {
          saved_at: Date.now(),
          posts: clampFeedPostsForCache(posts),
        };
        localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn("saveFeedCache failed", error);
      }
    }
function loadFeedCache() {
      try {
        const raw = localStorage.getItem(FEED_CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.posts)) return [];
        const savedAt = Number(parsed?.saved_at || 0);
        if (savedAt > 0 && Date.now() - savedAt > FEED_CACHE_MAX_AGE_MS) {
          localStorage.removeItem(FEED_CACHE_KEY);
          return [];
        }
        return clampFeedPostsForCache(parsed.posts);
      } catch (error) {
        console.warn("loadFeedCache failed", error);
        return [];
      }
    }
function getActivePage() {
      if (typeof document === "undefined") return "feed";
      return (
        document.body?.dataset?.page ||
        document.querySelector(".page-view.is-active")?.dataset.page ||
        "feed"
      );
    }
function isFeedPageActive() {
      return getActivePage() === "feed";
    }
function scheduleRenderFeed() {
      if (!isFeedPageActive()) {
        if (!feedRenderPendingWhileHidden) {
          feedRenderPendingWhileHidden = true;
        }
        return;
      }
      if (feedRenderScheduled) return;
      feedRenderScheduled = true;
      const token = ++feedScheduledRenderToken;
      const run = () => {
        if (token !== feedScheduledRenderToken) return;
        feedRenderScheduled = false;
        feedRenderPendingWhileHidden = false;
        renderFeed({ forcePageRender: true });
      };
      if (
        isLiteEffectsEnabled() &&
        typeof window !== "undefined" &&
        typeof window.requestIdleCallback === "function"
      ) {
        window.requestIdleCallback(
          () => {
            run();
          },
          { timeout: 42 }
        );
        return;
      }
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        window.requestAnimationFrame(run);
        return;
      }
      setTimeout(run, 0);
    }
function getRecommendedFeedPageSize() {
      const viewportWidth =
        typeof window === "undefined" ? 1024 : window.innerWidth || 1024;
      const compact = viewportWidth <= 700;
      const medium = viewportWidth <= 980;
      const lite = isLiteEffectsEnabled();
      if (feedLayout === "grid") {
        if (compact) return lite ? 4 : 5;
        return medium ? (lite ? 6 : 8) : lite ? 8 : 10;
      }
      if (compact) return lite ? 3 : 4;
      return medium ? (lite ? 5 : 6) : lite ? 7 : 8;
    }
function syncFeedPageSize(options = {}) {
      const nextSize = getRecommendedFeedPageSize();
      if (feedPageSize === nextSize) return false;
      feedPageSize = nextSize;
      if (options.resetVisible) {
        feedVisibleCount = nextSize;
      } else {
        feedVisibleCount = Math.max(feedVisibleCount, nextSize);
      }
      return true;
    }
function getFeedChunkProfileKey(layout = "list", compactViewport = false) {
      const mode = `${layout === "grid" ? "grid" : "list"}:${
        compactViewport ? "mobile" : "desktop"
      }`;
      return isSaveDataEnabled() ? `${mode}:save` : mode;
    }
function getFeedChunkBounds(layout = "list", compactViewport = false) {
      const lowPower = isSaveDataEnabled() || isLiteEffectsEnabled();
      if (layout === "grid") {
        if (compactViewport) {
          return lowPower
            ? { min: 1, max: 3, defaultSize: 2 }
            : { min: 2, max: 5, defaultSize: 3 };
        }
        return lowPower
          ? { min: 2, max: 6, defaultSize: 4 }
          : { min: 4, max: 10, defaultSize: 8 };
      }
      if (compactViewport) {
        return lowPower
          ? { min: 1, max: 2, defaultSize: 1 }
          : { min: 1, max: 3, defaultSize: 2 };
      }
      return lowPower
        ? { min: 2, max: 4, defaultSize: 3 }
        : { min: 3, max: 7, defaultSize: 5 };
    }
function getAdaptiveFeedChunkSize(layout = "list", compactViewport = false) {
      const key = getFeedChunkProfileKey(layout, compactViewport);
      const bounds = getFeedChunkBounds(layout, compactViewport);
      const cached = Number(feedAdaptiveChunkSize.get(key));
      if (Number.isFinite(cached)) {
        return Math.max(bounds.min, Math.min(bounds.max, Math.round(cached)));
      }
      feedAdaptiveChunkSize.set(key, bounds.defaultSize);
      return bounds.defaultSize;
    }
function tuneAdaptiveFeedChunkSize(
      layout = "list",
      compactViewport = false,
      chunkDurationMs = 0,
      renderedCount = 0
    ) {
      if (renderedCount <= 0 || !Number.isFinite(chunkDurationMs)) return;
      const key = getFeedChunkProfileKey(layout, compactViewport);
      const bounds = getFeedChunkBounds(layout, compactViewport);
      const current = getAdaptiveFeedChunkSize(layout, compactViewport);
      let targetMs = compactViewport
        ? FEED_CHUNK_TARGET_MS_MOBILE
        : FEED_CHUNK_TARGET_MS_DESKTOP;
      if (isLiteEffectsEnabled()) {
        targetMs = Math.max(4, targetMs - 2);
      }
      const hardMaxMs = compactViewport
        ? FEED_CHUNK_HARD_MAX_MS_MOBILE
        : FEED_CHUNK_HARD_MAX_MS;
      const slowThreshold = compactViewport ? targetMs * 1.22 : targetMs * 1.35;
      const fastThreshold = compactViewport ? targetMs * 0.58 : targetMs * 0.52;
      let next = current;
      if (chunkDurationMs > hardMaxMs) {
        next = current - 1;
      } else if (chunkDurationMs > slowThreshold) {
        next = current - 1;
      } else if (chunkDurationMs < fastThreshold && renderedCount >= current) {
        next = current + 1;
      }
      next = Math.max(bounds.min, Math.min(bounds.max, Math.round(next)));
      if (next !== current) {
        feedAdaptiveChunkSize.set(key, next);
      }
    }
function getPostById(postId) {
      if (!postId) return null;
      const posts = getAllPosts();
      if (!Array.isArray(posts) || !posts.length) return null;
      return posts.find((post) => `${post?.id || ""}` === `${postId}`) || null;
    }
function compactFeedProfile(profile) {
      if (!profile || typeof profile !== "object") return null;
      return {
        id: profile.id || null,
        handle: profile.handle || profile.username || "",
        display_name: profile.display_name || "",
        avatar_url: profile.avatar_url || "",
        accent_color: profile.accent_color || "",
      };
    }
function rememberFeedProfile(userId, profile) {
      const id = `${userId || ""}`.trim();
      if (!id) return;
      if (feedProfileCache.has(id)) {
        feedProfileCache.delete(id);
      }
      feedProfileCache.set(id, profile || null);
      while (feedProfileCache.size > FEED_PROFILE_CACHE_LIMIT) {
        const oldest = feedProfileCache.keys().next().value;
        if (oldest === undefined) break;
        feedProfileCache.delete(oldest);
      }
    }
function getFeedProfileBatchSize() {
      if (isSaveDataEnabled()) return Math.max(24, Math.floor(FEED_PROFILE_BATCH_SIZE / 3));
      if (isCompactViewport()) return Math.max(40, Math.floor(FEED_PROFILE_BATCH_SIZE / 2));
      return FEED_PROFILE_BATCH_SIZE;
    }
function getFeedProfilePreloadPostCount() {
      return Math.max(20, feedPageSize * 3);
    }
async function loadFeedProfilesForUsers(userIds = []) {
      const ids = Array.from(
        new Set(
          (Array.isArray(userIds) ? userIds : [])
            .map((id) => `${id || ""}`.trim())
            .filter(Boolean)
        )
      );
      const result = new Map();
      if (!ids.length) return result;

      const missingIds = [];
      ids.forEach((id) => {
        if (feedProfileCache.has(id)) {
          result.set(id, feedProfileCache.get(id));
          return;
        }
        missingIds.push(id);
      });

      if (!missingIds.length) {
        return result;
      }

      if (!supabase) {
        missingIds.forEach((id) => result.set(id, null));
        return result;
      }

      const fetchedIds = new Set();
      for (let i = 0; i < missingIds.length; i += FEED_PROFILE_BATCH_SIZE) {
        const batchIds = missingIds.slice(i, i + FEED_PROFILE_BATCH_SIZE);
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select(FEED_PROFILE_SELECT_FIELDS)
            .in("id", batchIds);
          if (error) {
            throw error;
          }
          (data || []).forEach((profile) => {
            if (!profile?.id) return;
            const compact = compactFeedProfile(profile);
            rememberFeedProfile(profile.id, compact);
            result.set(profile.id, compact);
            fetchedIds.add(profile.id);
          });
        } catch (error) {
          console.error("loadFeedProfilesForUsers error", error);
          try {
            const fallbackMap = await getProfilesForUsers(batchIds);
            batchIds.forEach((id) => {
              const compact = compactFeedProfile(fallbackMap?.get?.(id) || null);
              rememberFeedProfile(id, compact);
              result.set(id, compact);
              if (compact) fetchedIds.add(id);
            });
          } catch (fallbackError) {
            console.error("loadFeedProfilesForUsers fallback error", fallbackError);
          }
        }
      }

      missingIds.forEach((id) => {
        if (result.has(id)) return;
        const value = fetchedIds.has(id) ? result.get(id) || null : null;
        rememberFeedProfile(id, value);
        result.set(id, value);
      });

      return result;
    }
function queueFeedProfileHydration(userIds = []) {
      if (!Array.isArray(userIds) || !userIds.length) return;
      userIds.forEach((userId) => {
        const id = `${userId || ""}`.trim();
        if (!id) return;
        if (feedProfileCache.has(id)) return;
        if (feedProfileQueueUserIds.has(id)) return;
        feedProfileQueueUserIds.add(id);
      });
      if (!feedProfileQueueUserIds.size) return;
      if (feedProfileHydrationInFlight) return;
      if (feedProfileHydrationTimer) return;
      feedProfileHydrationTimer = setTimeout(() => {
        feedProfileHydrationTimer = null;
        flushFeedProfileHydrationQueue();
      }, FEED_PROFILE_HYDRATION_DELAY_MS);
    }
async function flushFeedProfileHydrationQueue() {
      if (feedProfileHydrationTimer) {
        clearTimeout(feedProfileHydrationTimer);
        feedProfileHydrationTimer = null;
      }
      if (feedProfileHydrationInFlight) return;
      if (!feedProfileQueueUserIds.size) return;
      if (!getOnlineState()) return;
      const posts = getAllPosts();
      if (!Array.isArray(posts) || !posts.length) return;
      const pendingByUserId = new Map();
      posts.forEach((post, index) => {
        if (!post || post.profile) return;
        const userId = `${post.user_id || ""}`.trim();
        if (!userId) return;
        const list = pendingByUserId.get(userId) || [];
        list.push(index);
        pendingByUserId.set(userId, list);
      });
      if (!pendingByUserId.size) {
        feedProfileQueueUserIds.clear();
        return;
      }
      feedProfileHydrationInFlight = true;
      let changed = false;
      let nextPosts = posts;
      try {
        while (feedProfileQueueUserIds.size) {
          const batch = Array.from(feedProfileQueueUserIds).slice(
            0,
            getFeedProfileBatchSize()
          );
          batch.forEach((id) => feedProfileQueueUserIds.delete(id));
          if (!batch.length) continue;

          const profileMap = await loadFeedProfilesForUsers(batch);
          batch.forEach((userId) => {
            if (!profileMap.has(userId)) return;
            const postIndexes = pendingByUserId.get(userId);
            if (!postIndexes?.length) return;
            if (!changed) {
              nextPosts = nextPosts.slice();
            }
            const profile = profileMap.get(userId) || null;
            postIndexes.forEach((postIndex) => {
              const post = nextPosts[postIndex];
              if (!post || post.profile) return;
              nextPosts[postIndex] = {
                ...post,
                profile,
              };
              changed = true;
            });
            pendingByUserId.delete(userId);
          });
          if (!pendingByUserId.size) {
            feedProfileQueueUserIds.clear();
            break;
          }
        }
      } catch (error) {
        console.error("flushFeedProfileHydrationQueue error", error);
      } finally {
        feedProfileHydrationInFlight = false;
      }

      if (changed) {
        setAllPosts(nextPosts);
        invalidateFeedQueryCache();
        postSearchHaystackCache.clear();
        scheduleRenderFeed();
        scheduleSecondaryRenders();
      }
      if (feedProfileQueueUserIds.size) {
        if (!feedProfileHydrationTimer) {
          feedProfileHydrationTimer = setTimeout(() => {
            feedProfileHydrationTimer = null;
            flushFeedProfileHydrationQueue();
          }, FEED_PROFILE_HYDRATION_DELAY_MS);
        }
      }
    }
function getFeedMetadataPreloadCount() {
      const multiplier = isCompactViewport() || isSaveDataEnabled()
        ? Math.max(2, FEED_META_PRELOAD_MULTIPLIER - 2)
        : FEED_META_PRELOAD_MULTIPLIER;
      return Math.max(18, feedPageSize * multiplier);
    }
function getFeedMetadataBatchSize() {
      if (isSaveDataEnabled()) return Math.max(10, Math.floor(FEED_META_BATCH_SIZE / 4));
      if (isCompactViewport()) return Math.max(14, Math.floor(FEED_META_BATCH_SIZE / 2));
      return FEED_META_BATCH_SIZE;
    }
function queueFeedMetadataForPosts(postIds = []) {
      if (!Array.isArray(postIds) || !postIds.length) return;
      if (!getOnlineState()) return;
      if (!supabase) return;
      postIds.forEach((postId) => {
        const id = `${postId || ""}`.trim();
        if (!id) return;
        if (feedLikesLoadedPostIds.has(id)) return;
        if (feedMetaQueuePostIds.has(id)) return;
        feedMetaQueuePostIds.add(id);
      });
      flushFeedMetadataQueue();
    }
async function flushFeedMetadataQueue() {
      if (feedMetaHydrationInFlight) return;
      if (!feedMetaQueuePostIds.size) return;
      if (!getOnlineState()) return;
      feedMetaHydrationInFlight = true;
      try {
        while (feedMetaQueuePostIds.size) {
          const batch = Array.from(feedMetaQueuePostIds).slice(0, getFeedMetadataBatchSize());
          batch.forEach((postId) => feedMetaQueuePostIds.delete(postId));
          if (!batch.length) continue;
          try {
            await Promise.all([
              loadWorkoutLogs(batch, { append: true }),
              loadLikes(batch, { append: true }),
            ]);
          } catch (error) {
            console.error("feed metadata hydration error", error);
          }
        }
      } finally {
        feedMetaHydrationInFlight = false;
      }
      scheduleRenderFeed();
      scheduleSecondaryRenders();
    }
function getCommentSheetBackdrop() {
      return $("comment-sheet-backdrop");
    }
function getCommentSheetBody() {
      return $("comment-sheet-body");
    }
function isShortsStylePost(post) {
      return Boolean(post && post.media_type === "video");
    }
function syncCommentSheetContextClasses(post = null) {
      const backdrop = getCommentSheetBackdrop();
      const body = getCommentSheetBody();
      const panel = backdrop?.querySelector(".comment-sheet-panel");
      const isShortsContext = isShortsStylePost(post);
      if (backdrop) {
        backdrop.classList.toggle("is-shorts-context", isShortsContext);
      }
      if (panel) {
        panel.classList.toggle("is-shorts-context", isShortsContext);
      }
      if (body) {
        body.classList.toggle("is-shorts-context", isShortsContext);
      }
    }
function isCommentSheetOpenForPost(postId) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return false;
      const backdrop = getCommentSheetBackdrop();
      if (!backdrop) return false;
      return (
        activeCommentPostId === normalizedPostId &&
        !backdrop.classList.contains("hidden")
      );
    }
function getCommentReplyTarget(postId) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return null;
      return commentReplyTargets.get(normalizedPostId) || null;
    }
function getCommentFocusRequest(postId) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return null;
      return commentFocusRequests.get(normalizedPostId) || null;
    }
function setCommentFocusRequest(postId, request = {}) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return;
      const next = {
        commentId: `${request.commentId || ""}`.trim(),
        actorId: `${request.actorId || ""}`.trim(),
        createdAt: `${request.createdAt || ""}`.trim(),
      };
      if (!next.commentId && !next.actorId) {
        commentFocusRequests.delete(normalizedPostId);
        return;
      }
      commentFocusRequests.set(normalizedPostId, next);
    }
function clearCommentFocusRequest(postId) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return;
      commentFocusRequests.delete(normalizedPostId);
    }
function getCommentReplyRequest(postId) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return null;
      return commentReplyRequests.get(normalizedPostId) || null;
    }
function setCommentReplyRequest(postId, request = {}) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return;
      const next = {
        commentId: `${request.commentId || ""}`.trim(),
        actorId: `${request.actorId || ""}`.trim(),
        createdAt: `${request.createdAt || ""}`.trim(),
      };
      if (!next.commentId && !next.actorId) {
        commentReplyRequests.delete(normalizedPostId);
        return;
      }
      commentReplyRequests.set(normalizedPostId, next);
    }
function clearCommentReplyRequest(postId) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return;
      commentReplyRequests.delete(normalizedPostId);
    }
function getCommentThreadKey(postId, commentId) {
      const normalizedPostId = `${postId || ""}`.trim();
      const normalizedCommentId = `${commentId || ""}`.trim();
      if (!normalizedPostId || !normalizedCommentId) return "";
      return `${normalizedPostId}:${normalizedCommentId}`;
    }
function isCommentThreadExpanded(postId, commentId) {
      return expandedCommentThreads.has(getCommentThreadKey(postId, commentId));
    }
function setCommentThreadExpanded(postId, commentId, expanded) {
      const key = getCommentThreadKey(postId, commentId);
      if (!key) return;
      if (expanded) {
        expandedCommentThreads.add(key);
      } else {
        expandedCommentThreads.delete(key);
      }
      refreshFeedPostComments(postId);
    }
function clearCommentReplyTarget(postId, { refresh = true } = {}) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return;
      commentReplyTargets.delete(normalizedPostId);
      commentReplyFocusRequests.delete(normalizedPostId);
      if (refresh) {
        refreshFeedPostComments(normalizedPostId);
      }
    }
function focusCommentComposer(postId) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId || typeof window === "undefined") return;
      window.requestAnimationFrame(() => {
        const selector = `.post-card[data-post-id="${normalizedPostId}"] .comment-form-input`;
        const activeInput =
          (activeCommentPostId === normalizedPostId
            ? getCommentSheetBody()?.querySelector?.(".comment-form-input")
            : null) ||
          document.querySelector(selector) ||
          $("detail-comments")?.querySelector?.(".comment-form-input");
        activeInput?.focus?.({ preventScroll: false });
        if (activeInput && typeof activeInput.setSelectionRange === "function") {
          const end = `${activeInput.value || ""}`.length;
          activeInput.setSelectionRange(end, end);
        }
      });
    }
function buildCommentReplyTarget(comment) {
      if (!comment) return null;
      const rawHandle =
        comment.profile?.handle ||
        comment.profile?.username ||
        "user";
      const handleText = formatHandle(rawHandle) || "@user";
      const displayName =
        `${comment.profile?.display_name || ""}`.trim() || handleText;
      return {
        commentId: `${comment.id || ""}`,
        userId: `${comment.user_id || ""}`,
        handle: handleText,
        displayName,
        preview: getCaptionPreviewText(comment.body || "") || handleText,
      };
    }
function assignCommentReplyTarget(
      postId,
      comment,
      { refresh = true, requestFocus = true } = {}
    ) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId || !comment) return;
      const nextTarget = buildCommentReplyTarget(comment);
      if (!nextTarget) return;
      commentReplyTargets.set(normalizedPostId, nextTarget);
      clearCommentReplyRequest(normalizedPostId);
      if (requestFocus) {
        commentReplyFocusRequests.add(normalizedPostId);
      }
      if (refresh) {
        refreshFeedPostComments(normalizedPostId);
      }
    }
function setCommentReplyTarget(postId, comment) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId || !comment) return;
      assignCommentReplyTarget(normalizedPostId, comment, {
        refresh: true,
        requestFocus: true,
      });
      focusCommentComposer(normalizedPostId);
    }
function closeCommentSheet() {
      const previousPostId = activeCommentPostId;
      activeCommentPostId = "";
      if (previousPostId) {
        clearCommentFocusRequest(previousPostId);
        clearCommentReplyRequest(previousPostId);
      }
      syncCommentSheetContextClasses(null);
      const backdrop = getCommentSheetBackdrop();
      if (backdrop) {
        closeBackdrop(backdrop);
      }
      if (previousPostId) {
        refreshFeedPostComments(previousPostId);
      }
    }
function renderCommentSheetForPost(postId) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return;
      const post = getPostById(normalizedPostId);
      const bodyRoot = getCommentSheetBody();
      const titleEl = $("comment-sheet-title");
      const subtitleEl = $("comment-sheet-subtitle");
      if (!bodyRoot) return;
      bodyRoot.innerHTML = "";
      if (!post) return;
      syncCommentSheetContextClasses(post);
      const tr = t[getCurrentLang()] || t.ja;
      const currentUser = getCurrentUser();
      const commentsByPost = getCommentsByPost();
      const commentsLoading = getCommentsLoading();
      const commentsEnabled = isCommentsEnabled();
      const comments = commentsByPost.get(post.id) || [];
      const focusRequest = getCommentFocusRequest(post.id);
      const focusCommentId = resolveCommentFocusId(comments, focusRequest);
      const replyRequest = getCommentReplyRequest(post.id);
      const replyComment = resolveCommentByRequest(comments, replyRequest);
      if (replyComment) {
        assignCommentReplyTarget(post.id, replyComment, {
          refresh: false,
          requestFocus: true,
        });
      }
      if (titleEl) {
        const commentsTitle = tr.comments || "Comments";
        titleEl.textContent = comments.length
          ? `${commentsTitle} (${comments.length})`
          : commentsTitle;
      }
      if (subtitleEl) {
        subtitleEl.textContent = getCommentSheetSubtitle(post, tr);
      }
      const context = buildCommentSheetContext(post, tr, {
        commentCount: comments.length,
        comments,
      });
      if (context) {
        context.classList.toggle("is-shorts-context", isShortsStylePost(post));
        bodyRoot.appendChild(context);
      }
      const section = buildFeedCommentSection(
        post,
        tr,
        currentUser,
        commentsByPost,
        commentsLoading,
        commentsEnabled,
        {
          showQuickReplies: true,
          focusCommentId,
        }
      );
      if (section) {
        section.classList.add("comment-sheet-content");
        section.classList.toggle("is-shorts-context", isShortsStylePost(post));
        bodyRoot.appendChild(section);
      }
      if (focusCommentId && typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          jumpToRenderedComment(focusCommentId, { surface: "sheet" });
          clearCommentFocusRequest(post.id);
        });
      }
    }
function openCommentSheet(postId, options = {}) {
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return;
      const post = getPostById(normalizedPostId);
      if (!post) return;
      setCommentFocusRequest(normalizedPostId, {
        commentId: options.focusCommentId,
        actorId: options.focusCommentActorId,
        createdAt: options.focusCommentCreatedAt,
      });
      setCommentReplyRequest(normalizedPostId, {
        commentId: options.replyToCommentId,
        actorId: options.replyToCommentActorId,
        createdAt: options.replyToCommentCreatedAt,
      });
      const previousPostId = activeCommentPostId;
      activeCommentPostId = normalizedPostId;
      if (previousPostId && previousPostId !== normalizedPostId) {
        clearCommentFocusRequest(previousPostId);
        clearCommentReplyRequest(previousPostId);
        refreshFeedPostComments(previousPostId);
      }
      renderCommentSheetForPost(normalizedPostId);
      const backdrop = getCommentSheetBackdrop();
      if (backdrop) {
        openBackdrop(backdrop);
      }
      refreshFeedPostComments(normalizedPostId);
      if (isCommentsEnabled()) {
        loadCommentsForPost(normalizedPostId).finally(() => {
          refreshFeedPostComments(normalizedPostId);
        });
      }
    }
function ensureCommentSheetBindings() {
      if (feedCommentSheetBound || typeof document === "undefined") return;
      const backdrop = getCommentSheetBackdrop();
      const closeBtn = $("btn-comment-sheet-close");
      if (!backdrop) return;
      feedCommentSheetBound = true;
      if (closeBtn && closeBtn.dataset.bound !== "true") {
        closeBtn.dataset.bound = "true";
        closeBtn.addEventListener("click", () => {
          closeCommentSheet();
        });
      }
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) {
          closeCommentSheet();
        }
      });
      document.addEventListener("click", (event) => {
        const trigger = event.target?.closest?.("[data-page-target]");
        if (!trigger) return;
        const nextPage = `${trigger.getAttribute("data-page-target") || ""}`;
        if (nextPage && nextPage !== "feed" && activeCommentPostId) {
          closeCommentSheet();
        }
      });
      if (!feedCommentKeyboardBound && typeof window !== "undefined") {
        feedCommentKeyboardBound = true;
        window.addEventListener("keydown", (event) => {
          if (event.defaultPrevented || event.isComposing) return;
          if (event.key !== "Escape") return;
          if (!activeCommentPostId) return;
          event.preventDefault();
          closeCommentSheet();
        });
    }
}

function focusPostDetailComments() {
      const commentsEl = $("detail-comments");
      const commentsTitle = $("detail-comments-title");
      const section = commentsTitle?.closest?.(".detail-section") || commentsEl?.closest?.(".detail-section");
      const target = commentsTitle || commentsEl;
      if (!target || !section) return;
      section.classList.add("is-focus-target");
      if (typeof window !== "undefined") {
        if (detailCommentsFocusTimer) {
          window.clearTimeout(detailCommentsFocusTimer);
        }
        detailCommentsFocusTimer = window.setTimeout(() => {
          section.classList.remove("is-focus-target");
          detailCommentsFocusTimer = 0;
        }, 2200);
        window.requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          const composerField = commentsEl?.querySelector?.("textarea, input");
          composerField?.focus?.({ preventScroll: true });
        });
      }
      detailCommentsFocusRequested = false;
    }
function setupFeedCardActionDelegation() {
      if (feedCardActionDelegationBound) return;
      feedCardActionDelegationBound = true;
      const feedList = $("feed-list");
      if (!feedList) return;
      feedList.addEventListener("click", async (event) => {
        const actionBtn = event.target?.closest?.("button[data-post-action]");
        if (!actionBtn) return;
        const card = actionBtn.closest(".post-card[data-post-id]");
        const postId = card?.getAttribute("data-post-id") || "";
        if (!postId) return;
        const action = actionBtn.dataset.postAction || "";
        if (!action) return;
        event.preventDefault();
        if (action === "toggle-comments") {
          if (isCommentSheetOpenForPost(postId)) {
            closeCommentSheet();
            return;
          }
          openCommentSheet(postId);
          return;
        }
        const post = getPostById(postId);
        if (!post) return;
        if (action === "toggle-like") {
          await toggleLikeForPost(post);
          return;
        }
        if (action === "toggle-shorts-sound") {
          toggleShortsSoundPreference();
          return;
        }
        if (action === "toggle-shorts-play") {
          toggleShortsPlayback(card, { showCue: true });
          return;
        }
        if (action === "toggle-save") {
          const isSaved = toggleSavedPostId(post.id);
          const tr = t[getCurrentLang()] || t.ja;
          showToast(
            isSaved
              ? tr.saved || "Saved"
              : tr.unsave || "Removed from saved",
            "success"
          );
          scheduleRenderFeed();
          return;
        }
        if (action === "toggle-pin") {
          const currentUser = getCurrentUser();
          const tr = t[getCurrentLang()] || t.ja;
          if (!currentUser?.id || `${post.user_id || ""}` !== `${currentUser.id || ""}`) {
            return;
          }
          const result = togglePinnedPostForUser(post.id, currentUser.id);
          showToast(
            result.isPinned
              ? tr.pinPostSet || "Pinned to profile."
              : tr.pinPostRemoved || "Pin removed.",
            "success"
          );
          scheduleRenderFeed();
          updateProfileSummary();
          return;
        }
        if (action === "toggle-repost") {
          const currentUser = getCurrentUser();
          const tr = t[getCurrentLang()] || t.ja;
          if (!currentUser?.id) {
            showToast(
              tr.repostLoginRequired || "Log in to repost posts.",
              "warning"
            );
            return;
          }
          const result = toggleRepostForUser(post.id, currentUser.id);
          showToast(
            result.isReposted
              ? tr.repostedToast || "Reposted."
              : tr.repostRemovedToast || "Repost removed.",
            "success"
          );
          scheduleRenderFeed();
          return;
        }
        if (action === "quote-post") {
          const currentUser = getCurrentUser();
          const tr = t[getCurrentLang()] || t.ja;
          if (!currentUser?.id) {
            showToast(
              tr.quoteLoginRequired || "Log in to quote posts.",
              "warning"
            );
            return;
          }
          const rawHandle =
            post?.profile?.handle || post?.profile?.username || "user";
          const handleText = formatHandle(rawHandle) || "@user";
          const rawText = `${post?.note || post?.caption || ""}`.trim();
          const clipped = rawText ? rawText.slice(0, 120) : "";
          const quoteSeed = clipped
            ? `${tr.quotePrefix || "QT"} ${handleText}: ${clipped}`
            : `${tr.quotePrefix || "QT"} ${handleText}`;
          openPostModal({
            quotePostId: post.id,
            quoteSeed,
          });
          showToast(
            tr.quoteReadyToast || "Quote draft is ready.",
            "info"
          );
          return;
        }
        if (action === "hide-post") {
          const tr = t[getCurrentLang()] || t.ja;
          if (hidePostId(post.id)) {
            showToast(
              tr.feedHiddenPost || "Post hidden from your feed.",
              "success"
            );
            resetFeedPagination();
            scheduleRenderFeed();
          }
          return;
        }
        if (action === "toggle-mute-user") {
          const tr = t[getCurrentLang()] || t.ja;
          const userId = `${post?.user_id || ""}`.trim();
          const currentUserId = `${getCurrentUser()?.id || ""}`.trim();
          if (!userId || userId === currentUserId) return;
          const isMuted = toggleMutedUserId(userId);
          showToast(
            isMuted
              ? tr.feedMutedSet || "User muted."
              : tr.feedMutedRemoved || "User unmuted.",
            "success"
          );
          resetFeedPagination();
          scheduleRenderFeed();
          return;
        }
        if (action === "toggle-mute-term") {
          const tr = t[getCurrentLang()] || t.ja;
          const fallbackTerm = getMuteTermCandidateForPost(post);
          const requestedTerm = `${actionBtn.getAttribute("data-mute-term") || ""}`.trim();
          const targetTerm = normalizeMutedTerm(requestedTerm || fallbackTerm);
          if (!targetTerm) {
            showToast(tr.feedMuteTermMissing || "No keyword to mute.", "warning");
            return;
          }
          const result = toggleMutedTerm(targetTerm);
          showToast(
            result.active
              ? `${tr.feedMutedTermSet || "Muted keyword"}: #${result.term}`
              : `${tr.feedMutedTermRemoved || "Keyword unmuted"}: #${result.term}`,
            "success"
          );
          resetFeedPagination();
          scheduleRenderFeed();
          return;
        }
        if (action === "share-post") {
          const tr = t[getCurrentLang()] || t.ja;
          const origin =
            typeof window !== "undefined" ? window.location.origin : "";
          const path =
            typeof window !== "undefined" ? window.location.pathname : "";
          const shareUrl = `${origin}${path}#post=${post.id}`;
          const shareTextRaw = `${post?.note || post?.caption || ""}`.trim();
          const shareTitle = shareTextRaw
            ? shareTextRaw.slice(0, 80)
            : post?.profile?.display_name ||
              formatHandle(post?.profile?.handle || "") ||
              tr.dmSharePreviewFallback ||
              tr.detailTitle ||
              "Trends post";
          const sharePayload = {
            title: shareTitle,
            text: shareTextRaw ? shareTextRaw.slice(0, 160) : "",
            url: shareUrl,
            postId: post.id,
          };
          try {
            if (getCurrentUser()) {
              openDmShareComposer(sharePayload);
              return;
            }
            if (
              typeof navigator !== "undefined" &&
              typeof navigator.share === "function"
            ) {
              await navigator.share(sharePayload);
              showToast(tr.feedShared || "Shared.", "success");
              return;
            }
            if (
              typeof navigator !== "undefined" &&
              navigator.clipboard &&
              typeof navigator.clipboard.writeText === "function"
            ) {
              await navigator.clipboard.writeText(shareUrl);
              showToast(tr.feedLinkCopied || "Link copied.", "success");
            } else {
              showToast(shareUrl, "info");
            }
          } catch (error) {
            if (error?.name === "AbortError") {
              return;
            }
            console.error("share post failed", error);
            showToast(shareUrl, "info");
          }
          return;
        }
        if (action === "delete-post") {
          await deletePost(post.id);
        }
      });
    }
function clearFeedMoreGhostCards(container = null) {
      const root = container || $("feed-list");
      if (!root) return;
      root
        .querySelectorAll(".feed-more-ghost")
        .forEach((node) => node.remove());
    }
function appendFeedMoreGhostCards(container = null, count = 2) {
      const root = container || $("feed-list");
      if (!root) return;
      clearFeedMoreGhostCards(root);
      const safeCount = Math.max(1, Math.min(4, Number(count) || 2));
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < safeCount; i += 1) {
        const ghost = document.createElement("div");
        ghost.className = "post-card skeleton feed-skeleton feed-more-ghost";
        ghost.setAttribute("aria-hidden", "true");
        fragment.appendChild(ghost);
      }
      root.appendChild(fragment);
    }
function captureFeedMoreAnchor(moreWrap) {
      if (!moreWrap || typeof window === "undefined") {
        feedMoreAnchorTop = null;
        feedMoreAnchorScrollY = null;
        return;
      }
      feedMoreAnchorTop = moreWrap.getBoundingClientRect().top;
      feedMoreAnchorScrollY = window.scrollY || window.pageYOffset || 0;
    }
function resolveFeedScrollBehavior(preferredBehavior = "auto") {
      if (preferredBehavior !== "smooth") return "auto";
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return "smooth";
      }
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
    }
function restoreFeedMoreAnchor(moreWrap, preferredBehavior = "auto") {
      if (
        feedMoreAnchorTop === null ||
        feedMoreAnchorScrollY === null ||
        !moreWrap ||
        typeof window === "undefined"
      ) {
        feedMoreAnchorTop = null;
        feedMoreAnchorScrollY = null;
        return;
      }
      const nextTop = moreWrap.getBoundingClientRect().top;
      const delta = nextTop - feedMoreAnchorTop;
      const previousScrollY = feedMoreAnchorScrollY;
      feedMoreAnchorTop = null;
      feedMoreAnchorScrollY = null;
      if (!Number.isFinite(delta) || Math.abs(delta) < 1) return;
      const compactViewport = (window.innerWidth || 1024) <= 700;
      const liteEffects = isLiteEffectsEnabled();
      const behavior =
        compactViewport || liteEffects || Math.abs(delta) > 720
          ? "auto"
          : resolveFeedScrollBehavior(preferredBehavior);
      const currentY = window.scrollY || window.pageYOffset || previousScrollY;
      const doc = document?.documentElement || null;
      const maxTop = Math.max(
        0,
        (doc?.scrollHeight || 0) - (window.innerHeight || 0)
      );
      const targetTop = Math.min(
        maxTop,
        Math.max(0, currentY + delta)
      );
      const applyScroll = () => {
        window.scrollTo({
          top: targetTop,
          left: 0,
          behavior,
        });
      };
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(applyScroll);
        });
        return;
      }
      applyScroll();
    }
function getFeedWindowMinItems() {
      if (typeof window === "undefined") return FEED_WINDOW_MIN_ITEMS;
      const width = window.innerWidth || 1024;
      if (width <= 700) {
        const lowPower = isLiteEffectsEnabled() || isSaveDataEnabled();
        return lowPower
          ? FEED_WINDOW_MIN_ITEMS_MOBILE_LITE
          : FEED_WINDOW_MIN_ITEMS_MOBILE;
      }
      if (width <= 980) {
        return Math.max(24, FEED_WINDOW_MIN_ITEMS);
      }
      return FEED_WINDOW_MIN_ITEMS;
    }
function isFeedWindowingAllowed() {
      if (typeof window === "undefined") return true;
      const width = window.innerWidth || 1024;
      if (width > 700) return true;
      if (width <= 360) return false;
      const settings = getSettings();
      if (settings?.mobileFeedWindowing === false) return false;
      return true;
    }
function getFeedWindowRuntimeSettings() {
      if (typeof window === "undefined") {
        return {
          marginPx: FEED_WINDOW_MARGIN_PX,
          runIntervalMs: FEED_WINDOW_RUN_INTERVAL_MS,
          minScrollDeltaPx: FEED_WINDOW_MIN_SCROLL_DELTA_PX,
          scanLimit: FEED_WINDOW_SCAN_LIMIT_DESKTOP,
          mutationBudget: FEED_WINDOW_MUTATION_BUDGET_DESKTOP,
        };
      }
      const width = window.innerWidth || 1024;
      const mobile = width <= 700;
      const compact = width <= 980;
      const lowPower = isLiteEffectsEnabled() || isSaveDataEnabled();
      return {
        marginPx: mobile
          ? lowPower ? 260 : 320
          : compact
          ? lowPower ? 560 : 640
          : lowPower
          ? 760
          : FEED_WINDOW_MARGIN_PX,
        runIntervalMs: mobile
          ? lowPower ? 320 : 240
          : lowPower
          ? 150
          : FEED_WINDOW_RUN_INTERVAL_MS,
        minScrollDeltaPx: mobile
          ? lowPower ? 120 : 92
          : lowPower
          ? 36
          : FEED_WINDOW_MIN_SCROLL_DELTA_PX,
        scanLimit: mobile
          ? lowPower
            ? Math.max(14, FEED_WINDOW_SCAN_LIMIT_MOBILE - 8)
            : FEED_WINDOW_SCAN_LIMIT_MOBILE
          : FEED_WINDOW_SCAN_LIMIT_DESKTOP,
        mutationBudget: mobile
          ? lowPower
            ? Math.max(2, FEED_WINDOW_MUTATION_BUDGET_MOBILE - 1)
            : FEED_WINDOW_MUTATION_BUDGET_MOBILE
          : lowPower
          ? Math.max(10, FEED_WINDOW_MUTATION_BUDGET_DESKTOP - 4)
          : FEED_WINDOW_MUTATION_BUDGET_DESKTOP,
      };
    }
function isNearFeedViewport(el, marginPx = FEED_WINDOW_MARGIN_PX) {
      if (!el || typeof window === "undefined") return true;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return (
        rect.bottom >= -marginPx &&
        rect.top <= vh + marginPx
      );
    }
function restoreWindowedFeedCard(placeholder) {
      if (!placeholder) return false;
      const postId = placeholder.getAttribute("data-post-id");
      if (!postId) return false;
      const card = feedWindowedCards.get(postId);
      if (!card) return false;
      placeholder.replaceWith(card);
      feedWindowedCards.delete(postId);
      return true;
    }
function restoreAllWindowedFeedCards(container) {
      if (!container) return;
      const placeholders = container.querySelectorAll(
        ".feed-window-placeholder[data-post-id]"
      );
      placeholders.forEach((placeholder) => {
        restoreWindowedFeedCard(placeholder);
      });
      feedWindowedCards.clear();
    }
function detachFeedCard(card) {
      if (!card) return false;
      const postId = card.getAttribute("data-post-id");
      if (!postId || feedWindowedCards.has(postId)) return false;
      const rect = card.getBoundingClientRect();
      const height = Math.max(120, Math.round(rect.height || card.offsetHeight || 220));
      const placeholder = document.createElement("div");
      placeholder.className = "feed-window-placeholder";
      placeholder.setAttribute("data-post-id", postId);
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.style.height = `${height}px`;
      feedWindowedCards.set(postId, card);
      card.replaceWith(placeholder);
      return true;
    }
function runFeedWindowing() {
      const container = $("feed-list");
      if (!container) {
        feedWindowedCards.clear();
        return;
      }
      if (!isFeedWindowingAllowed()) {
        if (feedWindowedCards.size) {
          restoreAllWindowedFeedCards(container);
        }
        return;
      }
      const activePage =
        typeof document === "undefined"
          ? "feed"
          : document.body?.dataset?.page ||
            document.querySelector(".page-view.is-active")?.dataset.page ||
            "";
      if (activePage !== "feed") {
        if (feedWindowedCards.size) {
          restoreAllWindowedFeedCards(container);
        }
        return;
      }
      if (feedChunkRendering) {
        return;
      }
      if (feedLayout !== "list" || isFeedLoading) {
        restoreAllWindowedFeedCards(container);
        return;
      }
      const runtime = getFeedWindowRuntimeSettings();
      const cards = container.querySelectorAll(".post-card[data-post-id]");
      const placeholders = container.querySelectorAll(
        ".feed-window-placeholder[data-post-id]"
      );
      if (cards.length + placeholders.length < getFeedWindowMinItems()) {
        restoreAllWindowedFeedCards(container);
        return;
      }

      let mutationCount = 0;
      let scanCount = 0;
      for (const placeholder of placeholders) {
        if (
          scanCount >= runtime.scanLimit ||
          mutationCount >= runtime.mutationBudget
        ) {
          break;
        }
        scanCount += 1;
        if (isNearFeedViewport(placeholder, runtime.marginPx)) {
          if (restoreWindowedFeedCard(placeholder)) {
            mutationCount += 1;
          }
        }
      }

      const activeEl =
        typeof document !== "undefined" ? document.activeElement : null;
      const liveCards = container.querySelectorAll(".post-card[data-post-id]");
      scanCount = 0;
      for (const card of liveCards) {
        if (
          scanCount >= runtime.scanLimit ||
          mutationCount >= runtime.mutationBudget
        ) {
          break;
        }
        scanCount += 1;
        if (isNearFeedViewport(card, runtime.marginPx)) continue;
        if (activeEl && card.contains(activeEl)) continue;
        if (detachFeedCard(card)) {
          mutationCount += 1;
        }
      }
      feedWindowLastRunAt = Date.now();
      feedWindowLastRunY =
        typeof window === "undefined" ? 0 : window.scrollY || window.pageYOffset || 0;
    }
function scheduleFeedWindowingUpdate(force = false) {
      if (typeof window === "undefined") return;
      if (!force && !feedWindowingEnabled) return;
      if (force) {
        if (feedWindowUpdateRaf) {
          cancelAnimationFrame(feedWindowUpdateRaf);
          feedWindowUpdateRaf = 0;
        }
        feedWindowLastRunAt = 0;
        feedWindowLastRunY = window.scrollY || window.pageYOffset || 0;
        runFeedWindowing();
        return;
      }
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const now = Date.now();
      const runtime = getFeedWindowRuntimeSettings();
      const sinceLastRun = now - feedWindowLastRunAt;
      const moved = Math.abs(scrollY - feedWindowLastRunY);
      if (
        feedWindowLastRunAt > 0 &&
        sinceLastRun < runtime.runIntervalMs &&
        moved < runtime.minScrollDeltaPx
      ) {
        return;
      }
      if (feedWindowUpdateRaf) return;
      feedWindowUpdateRaf = requestAnimationFrame(() => {
        feedWindowUpdateRaf = 0;
        runFeedWindowing();
      });
    }
function setupFeedWindowingListeners() {
      if (feedWindowListenersBound || typeof window === "undefined") return;
      feedWindowListenersBound = true;
      window.addEventListener("scroll", () => scheduleFeedWindowingUpdate(), {
        passive: true,
      });
      window.addEventListener("resize", () => scheduleFeedWindowingUpdate(), {
        passive: true,
      });
    }
function syncFeedWindowing(shouldEnable = false) {
      const container = $("feed-list");
      if (!container) return;
      const allowWindowing = isFeedWindowingAllowed();
      feedWindowingEnabled = !!shouldEnable && allowWindowing;
      if (!shouldEnable) {
        if (feedWindowUpdateRaf) {
          cancelAnimationFrame(feedWindowUpdateRaf);
          feedWindowUpdateRaf = 0;
        }
        feedWindowLastRunAt = 0;
        feedWindowLastRunY = 0;
        restoreAllWindowedFeedCards(container);
        return;
      }
      if (!allowWindowing) {
        restoreAllWindowedFeedCards(container);
        return;
      }
      setupFeedWindowingListeners();
      scheduleFeedWindowingUpdate(true);
    }
function isAccountPageActive() {
      return getActivePage() === "account";
    }
function setFeedNotice(message = "", tone = "", autoClearMs = 0) {
      feedNotice = message || "";
      feedNoticeTone = tone || "";
      if (feedNoticeTimer) {
        clearTimeout(feedNoticeTimer);
        feedNoticeTimer = null;
      }
      if (autoClearMs > 0 && feedNotice) {
        feedNoticeTimer = setTimeout(() => {
          feedNotice = "";
          feedNoticeTone = "";
          scheduleRenderFeed();
        }, autoClearMs);
      }
    }
function ensureFeedPullIndicator() {
      let el = $("feed-pull-indicator");
      if (el) return el;
      const feedList = $("feed-list");
      if (!feedList || !feedList.parentElement) return null;
      el = document.createElement("div");
      el.id = "feed-pull-indicator";
      el.className = "feed-pull-indicator";
      el.setAttribute("aria-live", "polite");
      el.style.height = "0px";
      feedList.parentElement.insertBefore(el, feedList);
      return el;
    }
function setFeedPullIndicator(distance = 0, mode = "hint") {
      const indicator = ensureFeedPullIndicator();
      if (!indicator) return;
      const tr = t[getCurrentLang()] || t.ja;
      const clamped = Math.max(0, Math.min(FEED_PULL_MAX, distance));
      const height = Math.round(Math.min(56, 16 + clamped * 0.42));
      indicator.classList.add("is-visible");
      indicator.classList.toggle("is-ready", mode === "ready");
      indicator.classList.toggle("is-loading", mode === "loading");
      indicator.style.height = `${height}px`;
      if (mode === "loading") {
        indicator.textContent =
          tr.feedPullLoading || tr.feedRefreshing || "フィードを更新中...";
      } else if (mode === "ready") {
        indicator.textContent = tr.feedPullRelease || "離して更新";
      } else {
        indicator.textContent = tr.feedPullHint || "下に引いて更新";
      }
    }
function resetFeedPullIndicator(immediate = false) {
      const indicator = $("feed-pull-indicator");
      if (!indicator) return;
      indicator.classList.remove("is-ready", "is-loading");
      indicator.style.height = "0px";
      if (immediate) {
        indicator.classList.remove("is-visible");
        return;
      }
      setTimeout(() => {
        if (indicator.classList.contains("is-loading")) return;
        indicator.classList.remove("is-visible");
      }, 180);
    }
function scheduleSecondaryRenders(options = {}) {
      const force = !!options.force;
      if (!force && !isAccountPageActive()) {
        return;
      }
      const now = Date.now();
      if (!force && secondaryRenderLastRunAt > 0) {
        const elapsed = now - secondaryRenderLastRunAt;
        if (elapsed < FEED_SECONDARY_RENDER_COOLDOWN_MS) {
          if (!secondaryRenderCooldownTimer) {
            secondaryRenderCooldownTimer = setTimeout(() => {
              secondaryRenderCooldownTimer = null;
              scheduleSecondaryRenders({ force: true });
            }, FEED_SECONDARY_RENDER_COOLDOWN_MS - elapsed);
          }
          return;
        }
      }
      if (secondaryRenderScheduled) return;
      secondaryRenderScheduled = true;
      const run = () => {
        secondaryRenderScheduled = false;
        secondaryRenderLastRunAt = Date.now();
        updateProfileSummary();
        renderWorkoutHistory();
        renderTrainingSummary();
        renderPrList();
        renderInsights();
        renderOnboardingChecklist();
      };
      if (
        typeof window !== "undefined" &&
        typeof window.requestIdleCallback === "function"
      ) {
        window.requestIdleCallback(run, { timeout: 450 });
        return;
      }
      setTimeout(run, 0);
    }
export function resetFeedPagination() {
      syncFeedPageSize({ resetVisible: true });
      feedVisibleCount = feedPageSize;
    }
function applyFeedSearchTerm(term = "") {
      const normalized = `${term || ""}`.trim();
      const searchInput = $("feed-search");
      if (searchInput) {
        searchInput.value = normalized;
      }
      const clearBtn = $("btn-feed-clear");
      if (clearBtn) {
        const hasValue = !!normalized;
        clearBtn.classList.toggle("hidden", !hasValue);
        clearBtn.disabled = !hasValue;
      }
      feedLastCommittedSearch = normalized.toLowerCase();
      persistFeedUiState();
      resetFeedPagination();
      scheduleRenderFeed();
    }
export function setFeedState(next = {}) {
      const previousViewMode = feedViewMode;
      let shouldPersistUi = false;
      if (typeof next.currentFilter === "string") {
        currentFilter = isAllowedFeedFilter(next.currentFilter)
          ? next.currentFilter
          : "all";
        shouldPersistUi = true;
      }
      if (typeof next.feedLayout === "string") {
        feedLayout = next.feedLayout;
      }
      if (typeof next.feedViewMode === "string") {
        feedViewMode = isAllowedFeedViewMode(next.feedViewMode)
          ? next.feedViewMode
          : "feed";
        shouldPersistUi = true;
      }
      if (typeof next.filterMedia === "boolean") {
        filterMedia = next.filterMedia;
        shouldPersistUi = true;
      }
      if (typeof next.filterWorkout === "boolean") {
        filterWorkout = next.filterWorkout;
        shouldPersistUi = true;
      }
      if (typeof next.sortOrder === "string") {
        sortOrder = next.sortOrder;
        shouldPersistUi = true;
      }
      if (typeof next.forYouTuning === "string") {
        forYouTuning = isAllowedForYouTuning(next.forYouTuning)
          ? next.forYouTuning
          : "balanced";
        shouldPersistUi = true;
      }
      if (typeof next.isFeedLoading === "boolean") {
        isFeedLoading = next.isFeedLoading;
      }
      if (typeof next.feedError === "string") {
        feedError = next.feedError;
        if (!feedError) {
          feedErrorCode = "";
        }
      }
      if (typeof next.feedErrorCode === "string") {
        feedErrorCode = next.feedErrorCode;
      }
      syncFeedPageSize();
      if (shouldPersistUi) {
        persistFeedUiState();
      }
      if (previousViewMode !== feedViewMode) {
        emitFeedViewModeChanged();
      }
    }
export function getFeedViewMode() {
      return feedViewMode;
    }
export function setupFeedControls() {
      loadFeedUiState();
      ensureCommentSheetBindings();
      feedIsOnline = getOnlineState();
      setupFeedCardActionDelegation();
      syncFeedPageSize({ resetVisible: true });
      const applyFilter = (nextFilter) => {
        currentFilter = isAllowedFeedFilter(nextFilter) ? nextFilter : "all";
        persistFeedUiState();
        resetFeedPagination();
        updateFilterButtons();
        scheduleRenderFeed();
      };
      const requireLoginForFilter = (nextFilter, fallbackKey, fallbackText) => {
        const currentUser = getCurrentUser();
        if (currentUser) {
          applyFilter(nextFilter);
          return;
        }
        const tr = t[getCurrentLang()] || t.ja;
        showToast(tr[fallbackKey] || fallbackText, "warning");
        applyFilter("foryou");
      };
      const filterForYou = $("filter-foryou");
      if (filterForYou) {
        filterForYou.addEventListener("click", () => {
          applyFilter("foryou");
        });
      }
      const filterAll = $("filter-all");
      if (filterAll) {
        filterAll.addEventListener("click", () => {
          applyFilter("all");
        });
      }
      const filterFollowing = $("filter-following");
      if (filterFollowing) {
        filterFollowing.addEventListener("click", () => {
          requireLoginForFilter(
            "following",
            "followingFilterLogin",
            "Log in to see posts from users you follow."
          );
        });
      }
      const filterMine = $("filter-mine");
      if (filterMine) {
        filterMine.addEventListener("click", () => {
          requireLoginForFilter(
            "mine",
            "mineFilterLogin",
            "Log in to see only your posts."
          );
        });
      }
      const filterShorts = $("filter-shorts");
      const toggleFeedShortsMode = () => {
        feedViewMode = feedViewMode === "shorts" ? "feed" : "shorts";
        persistFeedUiState();
        emitFeedViewModeChanged();
        resetFeedPagination();
        updateFilterButtons();
        scheduleRenderFeed();
      };
      if (filterShorts && filterShorts.dataset.bound !== "true") {
        filterShorts.dataset.bound = "true";
        filterShorts.addEventListener("click", () => {
          toggleFeedShortsMode();
        });
      }
      const filterSaved = $("filter-saved");
      if (filterSaved) {
        filterSaved.addEventListener("click", () => {
          applyFilter("saved");
        });
      }
      const applyForYouTuning = (nextTuning) => {
        const normalized = isAllowedForYouTuning(nextTuning)
          ? nextTuning
          : "balanced";
        if (forYouTuning === normalized) return;
        forYouTuning = normalized;
        persistFeedUiState();
        resetFeedPagination();
        updateFilterButtons();
        scheduleRenderFeed();
        const tr = t[getCurrentLang()] || t.ja;
        const labelMap = {
          fresh: tr.feedTuneFresh || "Fresh",
          balanced: tr.feedTuneBalanced || "Balanced",
          viral: tr.feedTuneViral || "Viral",
        };
        showToast(
          (tr.feedTuneApplied || "Feed tuning: {mode}").replace(
            "{mode}",
            labelMap[normalized] || labelMap.balanced
          ),
          "success"
        );
      };
      const rankFreshBtn = $("rank-fresh");
      if (rankFreshBtn) {
        rankFreshBtn.addEventListener("click", () => {
          applyForYouTuning("fresh");
        });
      }
      const rankBalancedBtn = $("rank-balanced");
      if (rankBalancedBtn) {
        rankBalancedBtn.addEventListener("click", () => {
          applyForYouTuning("balanced");
        });
      }
      const rankViralBtn = $("rank-viral");
      if (rankViralBtn) {
        rankViralBtn.addEventListener("click", () => {
          applyForYouTuning("viral");
        });
      }
      const filterPublic = $("filter-public");
      if (filterPublic) {
        filterPublic.addEventListener("click", () => {
          applyFilter("public");
        });
      }
      const filterMediaBtn = $("filter-media");
      if (filterMediaBtn) {
        filterMediaBtn.addEventListener("click", () => {
          filterMedia = !filterMedia;
          persistFeedUiState();
          resetFeedPagination();
          updateFilterButtons();
          scheduleRenderFeed();
        });
      }
      const filterWorkoutBtn = $("filter-workout");
      if (filterWorkoutBtn) {
        filterWorkoutBtn.addEventListener("click", () => {
          filterWorkout = !filterWorkout;
          persistFeedUiState();
          resetFeedPagination();
          updateFilterButtons();
          scheduleRenderFeed();
        });
      }
      const trendingTagsWrap = $("feed-trending-tags");
      if (trendingTagsWrap && trendingTagsWrap.dataset.bound !== "true") {
        trendingTagsWrap.dataset.bound = "true";
        trendingTagsWrap.addEventListener("click", (event) => {
          const btn = event.target.closest("button[data-trending-tag]");
          if (!btn) return;
          const tag = `${btn.getAttribute("data-trending-tag") || ""}`.trim();
          if (!tag) return;
          applyFeedSearchTerm(`#${tag}`);
        });
      }
      const topicFollowWrap = $("feed-follow-topic-tags");
      if (topicFollowWrap && topicFollowWrap.dataset.bound !== "true") {
        topicFollowWrap.dataset.bound = "true";
        topicFollowWrap.addEventListener("click", (event) => {
          const btn = event.target.closest("button[data-follow-topic]");
          if (!btn) return;
          const term = normalizeTopicTerm(btn.getAttribute("data-follow-topic"));
          if (!term) return;
          const result = toggleFollowedTopic(term);
          const tr = t[getCurrentLang()] || t.ja;
          showToast(
            result.active
              ? tr.feedTopicFollowedToast || "Topic followed."
              : tr.feedTopicUnfollowedToast || "Topic unfollowed.",
            "success"
          );
          resetFeedPagination();
          scheduleRenderFeed();
        });
      }
      const followedTopicsWrap = $("feed-followed-topics");
      if (followedTopicsWrap && followedTopicsWrap.dataset.bound !== "true") {
        followedTopicsWrap.dataset.bound = "true";
        followedTopicsWrap.addEventListener("click", (event) => {
          const btn = event.target.closest("button[data-followed-topic]");
          if (!btn) return;
          const term = normalizeTopicTerm(btn.getAttribute("data-followed-topic"));
          if (!term) return;
          const nextSearch = `#${term}`;
          const currentSearch = $("feed-search")?.value?.trim().toLowerCase() || "";
          if (currentSearch !== nextSearch.toLowerCase()) {
            applyFeedSearchTerm(nextSearch);
            return;
          }
          toggleFollowedTopic(term);
          resetFeedPagination();
          scheduleRenderFeed();
        });
      }
      const feedList = $("feed-list");
      if (feedList && feedList.dataset.searchTagBound !== "true") {
        feedList.dataset.searchTagBound = "true";
        feedList.addEventListener("click", (event) => {
          const btn = event.target.closest("button[data-feed-search-tag]");
          if (!btn) return;
          const tag = normalizeTopicTerm(btn.getAttribute("data-feed-search-tag"));
          if (!tag) return;
          applyFeedSearchTerm(`#${tag}`);
        });
      }
      const suggestedUsersWrap = $("feed-suggested-users");
      if (suggestedUsersWrap && suggestedUsersWrap.dataset.bound !== "true") {
        suggestedUsersWrap.dataset.bound = "true";
        suggestedUsersWrap.addEventListener("click", async (event) => {
          const profileBtn = event.target.closest("button[data-suggest-profile]");
          if (profileBtn) {
            setActivePage("account");
            return;
          }
          const followBtn = event.target.closest("button[data-suggest-follow]");
          if (!followBtn) return;
          if (followBtn.classList.contains("is-loading")) return;
          const currentUser = getCurrentUser();
          if (!currentUser) {
            const tr = t[getCurrentLang()] || t.ja;
            showToast(
              tr.followingFilterLogin ||
                "Log in to follow users and personalize your feed.",
              "warning"
            );
            return;
          }
          const targetUserId = `${followBtn.getAttribute("data-user-id") || ""}`.trim();
          if (!targetUserId || targetUserId === currentUser.id) return;
          followBtn.classList.add("is-loading");
          followBtn.disabled = true;
          try {
            await toggleFollowForUser(targetUserId);
            refreshFeedFollowButtonsForUser(targetUserId);
            await loadFollowStats();
            updateProfileSummary();
            scheduleRenderFeed();
          } catch (error) {
            console.error("suggested follow toggle failed", error);
          } finally {
            followBtn.classList.remove("is-loading");
            followBtn.disabled = false;
          }
        });
      }
      const restoreHiddenBtn = $("btn-feed-restore-hidden");
      if (restoreHiddenBtn && restoreHiddenBtn.dataset.bound !== "true") {
        restoreHiddenBtn.dataset.bound = "true";
        restoreHiddenBtn.addEventListener("click", () => {
          clearHiddenPostIds();
          const tr = t[getCurrentLang()] || t.ja;
          showToast(
            tr.feedHiddenRestoreDone || "Hidden posts restored.",
            "success"
          );
          resetFeedPagination();
          scheduleRenderFeed();
        });
      }
      const restoreMutedBtn = $("btn-feed-restore-muted");
      if (restoreMutedBtn && restoreMutedBtn.dataset.bound !== "true") {
        restoreMutedBtn.dataset.bound = "true";
        restoreMutedBtn.addEventListener("click", () => {
          clearMutedUserIds();
          const tr = t[getCurrentLang()] || t.ja;
          showToast(
            tr.feedMutedRestoreDone || "Muted users restored.",
            "success"
          );
          resetFeedPagination();
          scheduleRenderFeed();
        });
      }
      const restoreMutedTermsBtn = $("btn-feed-restore-muted-terms");
      if (restoreMutedTermsBtn && restoreMutedTermsBtn.dataset.bound !== "true") {
        restoreMutedTermsBtn.dataset.bound = "true";
        restoreMutedTermsBtn.addEventListener("click", () => {
          clearMutedTerms();
          const tr = t[getCurrentLang()] || t.ja;
          showToast(
            tr.feedMutedTermsRestoreDone || "Muted words restored.",
            "success"
          );
          resetFeedPagination();
          scheduleRenderFeed();
        });
      }
      const mutedTermsWrap = $("feed-muted-terms");
      if (mutedTermsWrap && mutedTermsWrap.dataset.bound !== "true") {
        mutedTermsWrap.dataset.bound = "true";
        mutedTermsWrap.addEventListener("click", (event) => {
          const btn = event.target.closest("button[data-muted-term-remove]");
          if (!btn) return;
          const term = normalizeMutedTerm(btn.getAttribute("data-muted-term-remove"));
          if (!term) return;
          toggleMutedTerm(term);
          resetFeedPagination();
          scheduleRenderFeed();
        });
      }

      const searchInput = $("feed-search");
      const clearSearchBtn = $("btn-feed-clear");
      const syncSearchClearButton = () => {
        if (!clearSearchBtn || !searchInput) return;
        const hasValue = !!searchInput.value?.trim();
        clearSearchBtn.classList.toggle("hidden", !hasValue);
        clearSearchBtn.disabled = !hasValue;
        clearSearchBtn.setAttribute("aria-hidden", hasValue ? "false" : "true");
      };
      if (searchInput && searchInput.dataset.bound !== "true") {
        searchInput.dataset.bound = "true";
        if (feedLastCommittedSearch) {
          searchInput.value = feedLastCommittedSearch;
        }
        const commitSearch = () => {
          const nextSearch = searchInput.value?.trim().toLowerCase() || "";
          if (nextSearch === feedLastCommittedSearch) return;
          feedLastCommittedSearch = nextSearch;
          persistFeedUiState();
          resetFeedPagination();
          scheduleRenderFeed();
          syncSearchClearButton();
        };
        feedLastCommittedSearch = searchInput.value?.trim().toLowerCase() || "";
        syncSearchClearButton();
        searchInput.addEventListener("input", () => {
          if (feedSearchInputTimer) {
            clearTimeout(feedSearchInputTimer);
          }
          feedSearchInputTimer = setTimeout(() => {
            feedSearchInputTimer = null;
            commitSearch();
          }, getFeedSearchDebounceMs());
          syncSearchClearButton();
        });
        searchInput.addEventListener("blur", () => {
          if (!feedSearchInputTimer) return;
          clearTimeout(feedSearchInputTimer);
          feedSearchInputTimer = null;
          commitSearch();
        });
        searchInput.addEventListener("keydown", (event) => {
          if (event.isComposing) return;
          if (event.key === "Enter") {
            if (feedSearchInputTimer) {
              clearTimeout(feedSearchInputTimer);
              feedSearchInputTimer = null;
            }
            commitSearch();
            return;
          }
          if (event.key !== "Escape") return;
          if (!searchInput.value) return;
          event.preventDefault();
          searchInput.value = "";
          if (feedSearchInputTimer) {
            clearTimeout(feedSearchInputTimer);
            feedSearchInputTimer = null;
          }
          commitSearch();
          syncSearchClearButton();
        });
      }
      if (clearSearchBtn && clearSearchBtn.dataset.bound !== "true") {
        clearSearchBtn.dataset.bound = "true";
        clearSearchBtn.addEventListener("click", () => {
          if (!searchInput) return;
          if (!searchInput.value?.trim()) return;
          searchInput.value = "";
          if (feedSearchInputTimer) {
            clearTimeout(feedSearchInputTimer);
            feedSearchInputTimer = null;
          }
          feedLastCommittedSearch = "";
          persistFeedUiState();
          resetFeedPagination();
          scheduleRenderFeed();
          syncSearchClearButton();
          searchInput.focus();
        });
      }

      const sortSelect = $("feed-sort");
      if (sortSelect) {
        sortSelect.addEventListener("change", () => {
          sortOrder = sortSelect.value || "newest";
          persistFeedUiState();
          resetFeedPagination();
          scheduleRenderFeed();
        });
        sortSelect.value = sortOrder;
      }

      const feedAdvanced = $("feed-advanced");
      const feedOptionsBtn = $("btn-feed-options");
      const closeFeedAdvancedMenu = () => {
        if (!feedAdvanced || !feedOptionsBtn) return;
        feedAdvanced.classList.remove("is-open");
        feedOptionsBtn.classList.remove("is-active");
        feedOptionsBtn.setAttribute("aria-expanded", "false");
      };
      if (feedOptionsBtn && feedAdvanced && !feedOptionsBtn.dataset.bound) {
        feedOptionsBtn.dataset.bound = "true";
        feedOptionsBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const isOpen = feedAdvanced.classList.toggle("is-open");
          feedOptionsBtn.classList.toggle("is-active", isOpen);
          feedOptionsBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        });
      }
      if (
        !feedAdvancedDismissBound &&
        typeof document !== "undefined" &&
        feedAdvanced &&
        feedOptionsBtn
      ) {
        feedAdvancedDismissBound = true;
        document.addEventListener("click", (event) => {
          if (!feedAdvanced.classList.contains("is-open")) return;
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (feedAdvanced.contains(target) || feedOptionsBtn.contains(target)) return;
          closeFeedAdvancedMenu();
        });
        document.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") return;
          if (!feedAdvanced.classList.contains("is-open")) return;
          closeFeedAdvancedMenu();
        });
      }
      const discoveryToggleBtn = $("btn-feed-discovery-toggle");
      if (discoveryToggleBtn && discoveryToggleBtn.dataset.bound !== "true") {
        discoveryToggleBtn.dataset.bound = "true";
        discoveryToggleBtn.addEventListener("click", () => {
          feedDiscoveryExpanded = !feedDiscoveryExpanded;
          persistFeedUiState();
          scheduleRenderFeed();
        });
      }
      const feedStatsToggleBtn = $("btn-feed-stats-toggle");
      if (feedStatsToggleBtn && feedStatsToggleBtn.dataset.bound !== "true") {
        feedStatsToggleBtn.dataset.bound = "true";
        feedStatsToggleBtn.addEventListener("click", () => {
          feedStatsExpanded = !feedStatsExpanded;
          persistFeedUiState();
          scheduleRenderFeed();
        });
      }

      const runFeedSoftRefresh = async () => {
        if (isFeedLoading || feedLoadPromise) return false;
        if (!getOnlineState()) {
          const tr = t[getCurrentLang()] || t.ja;
          feedIsOnline = false;
          setFeedNotice(
            tr.feedOfflineNotice || "Offline. Latest posts cannot be fetched.",
            "warning",
            2600
          );
          scheduleRenderFeed();
          return false;
        }
        await loadFeed({ softRefresh: true, forceNetwork: true });
        return true;
      };

      const maybeAutoRecoverFromDemoMode = async () => {
        if (!feedDemoMode) return false;
        if (!getOnlineState()) return false;
        if (isFeedLoading || feedLoadPromise) return false;
        const now = Date.now();
        if (now - feedDemoLastAutoRetryAt < FEED_DEMO_AUTO_RETRY_COOLDOWN_MS) {
          return false;
        }
        feedDemoLastAutoRetryAt = now;
        try {
          await loadFeed({ softRefresh: true, forceNetwork: true });
          return true;
        } catch {
          return false;
        }
      };

      const refreshBtn = $("btn-feed-refresh");
      if (refreshBtn && refreshBtn.dataset.bound !== "true") {
        refreshBtn.dataset.bound = "true";
        refreshBtn.addEventListener("click", async () => {
          if (refreshBtn.classList.contains("is-loading")) return;
          refreshBtn.classList.add("is-loading");
          refreshBtn.disabled = true;
          try {
            await runFeedSoftRefresh();
          } finally {
            refreshBtn.classList.remove("is-loading");
            refreshBtn.disabled = false;
          }
        });
      }

      const layoutBtn = $("btn-feed-layout");
      if (layoutBtn && layoutBtn.dataset.bound !== "true") {
        layoutBtn.dataset.bound = "true";
        layoutBtn.addEventListener("click", () => {
          const next = feedLayout === "grid" ? "list" : "grid";
          const settings = getSettings();
          if (settings && typeof settings === "object") {
            feedLayout = next;
            if (feedContext.onFeedLayoutChange) {
              feedContext.onFeedLayoutChange(next);
            }
          }
          syncFeedPageSize({ resetVisible: true });
          scheduleRenderFeed();
        });
      }
      const shortsModeBtn = $("btn-feed-shorts-mode");
      if (shortsModeBtn && shortsModeBtn.dataset.bound !== "true") {
        shortsModeBtn.dataset.bound = "true";
        shortsModeBtn.addEventListener("click", () => {
          toggleFeedShortsMode();
        });
      }
      if (!feedPageSizeResizeBound && typeof window !== "undefined") {
        feedPageSizeResizeBound = true;
        window.addEventListener(
          "resize",
          () => {
            if (feedPageSizeResizeTimer) {
              clearTimeout(feedPageSizeResizeTimer);
            }
            feedPageSizeResizeTimer = setTimeout(() => {
              feedPageSizeResizeTimer = null;
              if (syncFeedPageSize()) {
                scheduleRenderFeed();
              }
            }, 120);
          },
          { passive: true }
        );
      }
      if (!feedKeyboardShortcutsBound && typeof window !== "undefined") {
        feedKeyboardShortcutsBound = true;
        window.addEventListener("keydown", (event) => {
          if (event.defaultPrevented || event.isComposing) return;
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const target = event.target;
          const activePage =
            document.querySelector(".page-view.is-active")?.dataset.page || "";
          if (activePage !== "feed") return;
          if (event.key === "/" && !isEditableTarget(target)) {
            const liveSearch = $("feed-search");
            if (!liveSearch) return;
            event.preventDefault();
            liveSearch.focus();
            liveSearch.select();
            return;
          }
          if (event.key.toLowerCase() === "g" && !isEditableTarget(target)) {
            const liveLayoutBtn = $("btn-feed-layout");
            if (!liveLayoutBtn) return;
            event.preventDefault();
            liveLayoutBtn.click();
            return;
          }
          if (event.key.toLowerCase() === "v" && !isEditableTarget(target)) {
            const liveShortsBtn = $("btn-feed-shorts-mode");
            if (!liveShortsBtn) return;
            event.preventDefault();
            liveShortsBtn.click();
          }
        });
      }

      const retryBtn = $("btn-feed-retry");
      if (retryBtn && retryBtn.dataset.bound !== "true") {
        retryBtn.dataset.bound = "true";
        retryBtn.addEventListener("click", async () => {
          if (retryBtn.classList.contains("is-loading")) return;
          retryBtn.classList.add("is-loading");
          retryBtn.disabled = true;
          try {
            await loadFeed({ softRefresh: true, forceNetwork: true });
          } finally {
            retryBtn.classList.remove("is-loading");
            retryBtn.disabled = false;
          }
        });
      }

      if (!feedPullListenersBound && typeof window !== "undefined") {
        const touchCapable =
          "ontouchstart" in window ||
          (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
        if (touchCapable) {
          feedPullListenersBound = true;
          ensureFeedPullIndicator();

          const canStartPull = (target) => {
            if (!target || !(target instanceof Element)) return false;
            const activePage =
              document.querySelector(".page-view.is-active")?.dataset.page || "";
            if (activePage !== "feed") return false;
            if ((window.scrollY || window.pageYOffset || 0) > 2) return false;
            if (isFeedLoading || feedLoadPromise) return false;
            const feedList = $("feed-list");
            if (!feedList || !feedList.contains(target)) return false;
            if (target.closest("button, a, input, textarea, select, video")) return false;
            return true;
          };

          const cancelPullGesture = (immediate = false) => {
            feedPullActive = false;
            feedPullDistance = 0;
            const indicator = $("feed-pull-indicator");
            if (indicator?.classList.contains("is-loading")) return;
            resetFeedPullIndicator(immediate);
          };

          window.addEventListener(
            "touchstart",
            (event) => {
              const touch = event.touches?.[0];
              if (!touch) return;
              if (!canStartPull(event.target)) {
                cancelPullGesture(true);
                return;
              }
              feedPullActive = true;
              feedPullStartY = touch.clientY;
              feedPullDistance = 0;
            },
            { passive: true }
          );

          window.addEventListener(
            "touchmove",
            (event) => {
              if (!feedPullActive) return;
              const touch = event.touches?.[0];
              if (!touch) return;
              if ((window.scrollY || window.pageYOffset || 0) > 2) {
                cancelPullGesture(true);
                return;
              }
              const delta = touch.clientY - feedPullStartY;
              if (delta <= 0) {
                cancelPullGesture(true);
                return;
              }
              if (delta < 8) {
                return;
              }
              feedPullDistance = Math.min(FEED_PULL_MAX, delta * 0.62);
              const mode = feedPullDistance >= FEED_PULL_THRESHOLD ? "ready" : "hint";
              setFeedPullIndicator(feedPullDistance, mode);
              if (event.cancelable) {
                event.preventDefault();
              }
            },
            { passive: false }
          );

          window.addEventListener(
            "touchend",
            async () => {
              if (!feedPullActive) return;
              const pulledDistance = feedPullDistance;
              feedPullActive = false;
              feedPullDistance = 0;
              if (pulledDistance < FEED_PULL_THRESHOLD) {
                resetFeedPullIndicator(false);
                return;
              }
              const now = Date.now();
              if (now - feedPullLastTriggeredAt < FEED_PULL_COOLDOWN_MS) {
                resetFeedPullIndicator(false);
                return;
              }
              feedPullLastTriggeredAt = now;
              setFeedPullIndicator(FEED_PULL_THRESHOLD, "loading");
              await runFeedSoftRefresh();
              setTimeout(() => {
                resetFeedPullIndicator(false);
              }, 220);
            },
            { passive: true }
          );

          window.addEventListener(
            "touchcancel",
            () => {
              cancelPullGesture(false);
            },
            { passive: true }
          );
        }
      }

      if (!feedNetworkListenersBound && typeof window !== "undefined") {
        feedNetworkListenersBound = true;
        window.addEventListener("online", async () => {
          feedIsOnline = true;
          const tr = t[getCurrentLang()] || t.ja;
          setFeedNotice(
            tr.feedBackOnline || "Back online. You can refresh now.",
            "success",
            2200
          );
          scheduleRenderFeed();
          try {
            await flushLikeOfflineQueue();
          } catch (error) {
            console.error("flush like queue on reconnect failed", error);
          }
          maybeAutoRecoverFromDemoMode().catch(() => {});
        });
        window.addEventListener("offline", () => {
          feedIsOnline = false;
          const tr = t[getCurrentLang()] || t.ja;
          setFeedNotice(
            tr.feedOfflineNotice || "Offline. Latest posts cannot be fetched.",
            "warning",
            2600
          );
          scheduleRenderFeed();
        });
      }
      if (
        !feedVisibilityListenerBound &&
        typeof document !== "undefined" &&
        typeof document.addEventListener === "function"
      ) {
        feedVisibilityListenerBound = true;
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") return;
          if (isFeedLoading || feedLoadPromise) return;
          if (!getOnlineState()) return;
          if (feedDemoMode) {
            maybeAutoRecoverFromDemoMode().catch(() => {});
            return;
          }
          const staleMs = 2 * 60 * 1000;
          const now = Date.now();
          if (!feedLastLoadedAt || now - feedLastLoadedAt < staleMs) return;
          loadFeed({ softRefresh: true });
        });
      }

      updateFilterButtons();
      if (getOnlineState()) {
        flushLikeOfflineQueue({ silent: true }).catch((error) => {
          console.error("flush like queue on setup failed", error);
        });
      }
    }
export function updateFilterButtons() {
      const buttons = [
        "filter-foryou",
        "filter-all",
        "filter-following",
        "filter-mine",
        "filter-saved",
        "filter-public",
      ];
      buttons.forEach((id) => {
        const el = $(id);
        if (!el) return;
        el.classList.toggle("chip-active", id === "filter-" + currentFilter);
      });
      const mediaBtn = $("filter-media");
      const workoutBtn = $("filter-workout");
      if (mediaBtn) mediaBtn.classList.toggle("chip-active", filterMedia);
      if (workoutBtn) workoutBtn.classList.toggle("chip-active", filterWorkout);
      const shortsModeBtn = $("btn-feed-shorts-mode");
      if (shortsModeBtn) {
        shortsModeBtn.classList.toggle("is-active", feedViewMode === "shorts");
      }
      const shortsFilterBtn = $("filter-shorts");
      if (shortsFilterBtn) {
        const shortsActive = feedViewMode === "shorts";
        shortsFilterBtn.classList.toggle("chip-active", shortsActive);
        shortsFilterBtn.setAttribute("aria-pressed", shortsActive ? "true" : "false");
      }
      const tuningButtons = [
        ["rank-fresh", "fresh"],
        ["rank-balanced", "balanced"],
        ["rank-viral", "viral"],
      ];
      const canTune = currentFilter === "foryou";
      tuningButtons.forEach(([id, mode]) => {
        const el = $(id);
        if (!el) return;
        el.classList.toggle("chip-active", forYouTuning === mode);
        el.disabled = !canTune;
        el.setAttribute("aria-disabled", canTune ? "false" : "true");
      });
      const tuningWrap = $("feed-rank-controls");
      if (tuningWrap) {
        tuningWrap.classList.toggle("is-disabled", !canTune);
      }
    }
export async function loadFeed(options = {}) {
      if (feedLoadPromise) {
        return feedLoadPromise;
      }
      loadFeedNetworkBackoff();

      const requestGeneration = ++feedLoadingGeneration;
      const softRefresh = !!options.softRefresh && getAllPosts().length > 0;
      const forceNetwork = !!options.forceNetwork;
      const tr = t[getCurrentLang()] || t.ja;
      feedIsOnline = getOnlineState();
      loadLikeOfflineQueue();

      if (!feedIsOnline) {
        isFeedLoading = false;
        feedError = "";
        const cachedPosts = loadFeedCache();
        if (!getAllPosts().length && cachedPosts.length) {
          setAllPosts(cachedPosts);
          invalidateFeedQueryCache();
          postSearchHaystackCache.clear();
          updateFeedStats(cachedPosts);
        }
        setFeedNotice(
          tr.feedOfflineNotice || "Offline. Latest posts cannot be fetched.",
          "warning",
          2600
        );
        renderFeed();
        return;
      }

      if (!softRefresh && !getAllPosts().length) {
        const cachedPosts = loadFeedCache();
        if (cachedPosts.length) {
          feedDemoMode = false;
          setAllPosts(cachedPosts);
          invalidateFeedQueryCache();
          postSearchHaystackCache.clear();
          resetFeedPagination();
          updateFeedStats(cachedPosts);
        }
      }

      if (softRefresh) {
        setFeedNotice(tr.feedRefreshing || "更新中...", "loading");
      } else {
        setFeedNotice("", "");
        isFeedLoading = true;
      }
      feedError = "";
      feedErrorCode = "";
      renderFeed();

      if (!forceNetwork) {
        const backoffRemainingMs = getFeedNetworkBackoffRemainingMs();
        if (backoffRemainingMs > 0) {
          isFeedLoading = false;
          const hasVisiblePosts = Array.isArray(getAllPosts()) && getAllPosts().length > 0;
          feedError = hasVisiblePosts
            ? ""
            : formatFeedConnectionError("network", tr);
          feedErrorCode = hasVisiblePosts ? "" : "network";
          const waitSeconds = Math.max(1, Math.ceil(backoffRemainingMs / 1000));
          setFeedNotice(
            `${tr.feedCachedNotice || "Network issue. Showing last saved feed."} (${waitSeconds}s)`,
            "warning",
            2200
          );
          renderFeed();
          return;
        }
      } else {
        clearFeedNetworkBackoff();
      }

      if (!supabase) {
        feedErrorCode = "network";
        feedError = formatFeedConnectionError(feedErrorCode, tr);
        isFeedLoading = false;
        setFeedNotice("", "");
        renderFeed();
        return;
      }

      feedLoadPromise = (async () => {
        try {
          if (feedIsOnline) {
            flushLikeOfflineQueue({ silent: true }).catch((error) => {
              console.error("flush like queue before loading feed failed", error);
            });
          }
          let { data, error } = await supabase
            .from("posts")
            .select(FEED_POST_SELECT_FIELDS)
            .order("date", { ascending: false })
            .limit(FEED_NETWORK_POST_LIMIT);

          if (error) {
            if (!isLikelyTransientNetworkError(error)) {
              const fallback = await supabase
                .from("posts")
                .select(FEED_POST_SELECT_FIELDS)
                .order("created_at", { ascending: false })
                .limit(FEED_NETWORK_POST_LIMIT);
              if (!fallback.error) {
                data = fallback.data;
                error = null;
              }
            }
          }

          if (error) {
            const isTransientNetwork = isLikelyTransientNetworkError(error);
            const issueCode = classifyFeedConnectionIssue(error);
            if (isTransientNetwork) {
              setFeedNetworkBackoff();
            } else {
              console.error("loadFeed error", error);
            }
            const cachedPosts = loadFeedCache();
            if (cachedPosts.length) {
              feedDemoMode = false;
              setAllPosts(cachedPosts);
              invalidateFeedQueryCache();
              postSearchHaystackCache.clear();
              feedLastLoadedAt = Date.now();
              resetFeedPagination();
              updateFeedStats(cachedPosts);
              isFeedLoading = false;
              const message =
                tr.feedCachedNotice ||
                "Network issue. Showing last saved feed.";
              setFeedNotice(message, "warning", 2800);
              renderFeed();
              scheduleSecondaryRenders();
              showToast(message, "warning");
              return;
            }
            feedErrorCode = issueCode;
            feedError = isTransientNetwork
              ? formatFeedConnectionError(issueCode, tr)
              : error.message || formatFeedConnectionError(issueCode, tr);
            isFeedLoading = false;
            setFeedNotice("", "");
            renderFeed();
            return;
          }

          feedDemoMode = false;
          feedErrorCode = "";
          clearFeedNetworkBackoff();

          const safeData = Array.isArray(data) ? data : [];
          const initialProfilePostCount = Math.min(
            safeData.length,
            getFeedProfilePreloadPostCount()
          );
          const initialProfileUserIds = Array.from(
            new Set(
              safeData
                .slice(0, initialProfilePostCount)
                .map((post) => `${post?.user_id || ""}`.trim())
                .filter(Boolean)
            )
          );
          let profileMap = null;
          try {
            profileMap = await loadFeedProfilesForUsers(
              initialProfileUserIds
            );
          } catch (profileBatchError) {
            console.error("loadFeed profile batch error", profileBatchError);
          }
          const postsWithProfile = safeData.map((post) => ({
            ...post,
            profile:
              profileMap && typeof profileMap.get === "function"
                ? profileMap.get(post.user_id) || null
                : null,
          }));

          if (requestGeneration !== feedLoadingGeneration) {
            return;
          }
          feedProfileQueueUserIds.clear();
          queueFeedProfileHydration(
            safeData
              .map((post) => `${post?.user_id || ""}`.trim())
              .filter(
                (userId) =>
                  userId &&
                  (!profileMap || typeof profileMap.get !== "function" || !profileMap.has(userId))
              )
          );

          const postIds = postsWithProfile.map((post) => post.id).filter(Boolean);
          const initialMetaIds = postIds.slice(0, getFeedMetadataPreloadCount());
          feedMetaQueuePostIds.clear();
          await Promise.all([
            loadWorkoutLogs(initialMetaIds, { append: false }),
            loadLikes(initialMetaIds, { append: false }),
          ]);
          if (postIds.length > initialMetaIds.length) {
            queueFeedMetadataForPosts(
              postIds.slice(
                initialMetaIds.length,
                initialMetaIds.length + getFeedMetadataBatchSize()
              )
            );
          }

          setAllPosts(postsWithProfile);
          invalidateFeedQueryCache();
          postSearchHaystackCache.clear();
          saveFeedCache(postsWithProfile);
          feedLastLoadedAt = Date.now();
          resetFeedPagination();
          updateFeedStats(postsWithProfile);
          isFeedLoading = false;
          if (softRefresh) {
            setFeedNotice(tr.feedRefreshDone || "更新しました。", "success", 1400);
          } else {
            setFeedNotice("", "");
          }
          renderFeed();
          scheduleSecondaryRenders();
        } finally {
          feedLoadPromise = null;
        }
      })();

      return feedLoadPromise;
    }
export function renderFeed(options = {}) {
    const container = document.getElementById("feed-list");
    const status = $("feed-status");
    const refreshBtn = $("btn-feed-refresh");
    const retryBtn = $("btn-feed-retry");
    const moreWrap = $("feed-more-wrap");
    const moreHint = $("feed-more-hint");
    const moreBtn = $("btn-feed-more");
    const layoutBtn = $("btn-feed-layout");
    const shortsModeBtn = $("btn-feed-shorts-mode");
    const feedOptionsBtn = $("btn-feed-options");
    const feedAdvanced = $("feed-advanced");
    const statGrid = $("feed-stat-grid");
    const statsToggleBtn = $("btn-feed-stats-toggle");
    const discoveryToggleBtn = $("btn-feed-discovery-toggle");
    if (!container) return;
    const forcePageRender = !!options.forcePageRender;
    if (!forcePageRender && !isFeedPageActive()) {
      if (!feedRenderPendingWhileHidden) {
        feedRenderPendingWhileHidden = true;
      }
      return;
    }
    if (feedRenderPendingWhileHidden) {
      feedRenderPendingWhileHidden = false;
    }
    feedChunkRendering = false;
    feedScheduledRenderToken += 1;
    feedRenderScheduled = false;
    const appendOnly = !!options.appendOnly;
    if (!appendOnly) {
      if (feedWindowUpdateRaf) {
        cancelAnimationFrame(feedWindowUpdateRaf);
        feedWindowUpdateRaf = 0;
      }
      resetSeenPostsObserver();
      restoreAllWindowedFeedCards(container);
      feedMoreAnchorTop = null;
      feedMoreAnchorScrollY = null;
      feedMoreLastTrigger = "manual";
    }
    const renderToken = ++feedRenderToken;
    const clearFeedMoreLoadingState = () => {
      feedMoreLoading = false;
      if (moreBtn) {
        moreBtn.classList.remove("is-loading");
        moreBtn.disabled = false;
      }
      if (moreWrap) {
        moreWrap.classList.remove("is-loading");
      }
      clearFeedMoreGhostCards(container);
    };

    const perfNow = () =>
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const renderStartedAt = perfNow();

    const currentUser = getCurrentUser();
    const currentLang = getCurrentLang();
    const settings = getSettings();
    const allPosts = getAllPosts();
    const workoutLogsByPost = getWorkoutLogsByPost();
    const commentsByPost = getCommentsByPost();
    const autoLoadMoreEnabled = settings.feedAutoLoadMore !== false;
    const followingIds = getFollowingIds();
    const tr = t[currentLang] || t.ja;
    const isShortsMode = feedViewMode === "shorts";
    const adsSettings = getRuntimeFeedAdsSettings();
    const feedAdsEnabled =
      !isShortsMode && feedLayout === "list" && isFeedAdsConfigured(adsSettings);
    if (feedAdsEnabled) {
      ensureAdSenseScript(adsSettings);
    }
    const pullIndicator = $("feed-pull-indicator");
    if (
      pullIndicator &&
      !pullIndicator.classList.contains("is-loading") &&
      !pullIndicator.classList.contains("is-ready")
    ) {
      pullIndicator.textContent = tr.feedPullHint || "下に引いて更新";
    }
    const searchValue = $("feed-search")?.value?.trim().toLowerCase() || "";
    const savedPostIds = getSavedPostIdsSet();
    const hiddenPostIds = getHiddenPostIdsSet();
    const mutedUserIds = getMutedUserIdsSet();
    const mutedTerms = getMutedTermsSet();
    const followedTopics = getFollowedTopicsSet();
    const seenPostIds = getSeenPostIdsSet();
    const repostState = getRepostState();
    const repostCountsByPost = buildRepostCountMap(repostState);
    const currentPinnedPostId = getPinnedPostIdForUser(currentUser?.id);
    const currentUserRepostedIds = getRepostedPostIdsForUser(
      currentUser?.id,
      repostState
    );
    const compactFilterViewport = isCompactViewport();
    const viewportTier = getFeedViewportTier();
    const allowedFilters = FEED_FILTERS;
    let normalizedFilter = currentFilter;
    if (!allowedFilters.includes(currentFilter)) {
      normalizedFilter = "all";
    }
    if (
      (normalizedFilter === "mine" || normalizedFilter === "following") &&
      !currentUser
    ) {
      normalizedFilter = "foryou";
    }
    if (normalizedFilter !== currentFilter) {
      currentFilter = normalizedFilter;
      persistFeedUiState();
    }
    updateFilterButtons();
    const forYouBtn = $("filter-foryou");
    if (forYouBtn) forYouBtn.classList.remove("hidden");
    const followingBtn = $("filter-following");
    if (followingBtn) followingBtn.classList.remove("hidden");
    const savedBtn = $("filter-saved");
    if (savedBtn) savedBtn.classList.toggle("hidden", compactFilterViewport);
    const publicBtn = $("filter-public");
    if (publicBtn) publicBtn.classList.toggle("hidden", compactFilterViewport);
    const shortsFilterBtn = $("filter-shorts");
    if (shortsFilterBtn) {
      shortsFilterBtn.classList.remove("hidden");
    }
    const restoreHiddenBtn = $("btn-feed-restore-hidden");
    const restoreMutedBtn = $("btn-feed-restore-muted");
    const restoreMutedTermsBtn = $("btn-feed-restore-muted-terms");
    const mutedTermsWrap = $("feed-muted-terms");
    const advancedToolsGroup = document.querySelector(".feed-advanced-group-tools");
    if (restoreHiddenBtn) {
      const hasHidden = hiddenPostIds.size > 0;
      restoreHiddenBtn.classList.toggle("hidden", !hasHidden);
    }
    if (restoreMutedBtn) {
      const hasMuted = mutedUserIds.size > 0;
      restoreMutedBtn.classList.toggle("hidden", !hasMuted);
    }
    if (restoreMutedTermsBtn) {
      const hasMutedTerms = mutedTerms.size > 0;
      restoreMutedTermsBtn.classList.toggle("hidden", !hasMutedTerms);
    }
    if (mutedTermsWrap) {
      mutedTermsWrap.innerHTML = "";
      const previewTerms = Array.from(mutedTerms).slice(0, 8);
      mutedTermsWrap.classList.toggle("hidden", previewTerms.length === 0);
      previewTerms.forEach((term) => {
        const btn = document.createElement("button");
        btn.className = "chip chip-muted-term-pill";
        btn.type = "button";
        btn.setAttribute("data-muted-term-remove", term);
        btn.textContent = `#${term}`;
        mutedTermsWrap.appendChild(btn);
      });
      if (advancedToolsGroup) {
        const hasManageActions =
          hiddenPostIds.size > 0 ||
          mutedUserIds.size > 0 ||
          previewTerms.length > 0 ||
          !(retryBtn?.classList.contains("hidden"));
        advancedToolsGroup.classList.toggle("hidden", !hasManageActions);
      }
    }

    const updateRetryButton = (show = false) => {
      if (!retryBtn) return;
      retryBtn.classList.toggle("hidden", !show);
      if (!show) {
        retryBtn.classList.remove("is-loading");
        retryBtn.disabled = false;
      }
      if (advancedToolsGroup) {
        const hasManageActions =
          show ||
          hiddenPostIds.size > 0 ||
          mutedUserIds.size > 0 ||
          Array.from(mutedTerms).length > 0;
        advancedToolsGroup.classList.toggle("hidden", !hasManageActions);
      }
    };

    const formatPostDate = (post) => {
      const value = post.date || post.created_at;
      if (!value) return "";
      return formatDateDisplay(value);
    };
    const formatRelative = (value) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins < 1) return tr.feedJustNow || "たった今";
      if (diffMins < 60) return (tr.feedMinutesAgo || "{count}分前").replace("{count}", diffMins);
      const diffHours = Math.round(diffMins / 60);
      if (diffHours < 24) return (tr.feedHoursAgo || "{count}時間前").replace("{count}", diffHours);
      const diffDays = Math.round(diffHours / 24);
      return (tr.feedDaysAgo || "{count}日前").replace("{count}", diffDays);
    };
    const getForYouReasonLabel = (post) => {
      if (currentFilter !== "foryou") return "";
      const userId = `${post?.user_id || ""}`;
      const topicTerms = getPostTopicTerms(post, workoutLogsByPost);
      if (topicTerms.some((term) => followedTopics.has(term))) {
        return tr.feedReasonTopic || "Topic match";
      }
      if (followingIds.has(userId)) {
        return tr.feedReasonFollowing || "Following";
      }
      const likeCount = Number(getLikesByPost().get(post.id) || 0);
      const commentCount = Number((commentsByPost.get(post.id) || []).length || 0);
      const repostCount = Number(repostCountsByPost.get(`${post.id || ""}`) || 0);
      if (forYouTuning === "viral" && likeCount + commentCount + repostCount >= 3) {
        return tr.feedReasonViral || "Viral";
      }
      if (likeCount >= 5 || commentCount >= 3 || repostCount >= 2) {
        return tr.feedReasonPopular || "Popular";
      }
      if (forYouTuning === "fresh") {
        return tr.feedReasonFresh || "Fresh";
      }
      if (post?.media_url) {
        return tr.feedReasonMedia || "With media";
      }
      return tr.feedReasonRecent || "Recent";
    };
    const prioritizePinnedPosts = (posts = []) => {
      if (!Array.isArray(posts) || !posts.length) return [];
      if (!currentUser?.id || !currentPinnedPostId) return posts;
      if (!["mine", "saved"].includes(currentFilter)) return posts;
      let pinnedPost = null;
      const rest = [];
      posts.forEach((post) => {
        if (!post) return;
        if (
          `${post.id || ""}` === currentPinnedPostId &&
          `${post.user_id || ""}` === `${currentUser.id || ""}`
        ) {
          if (!pinnedPost) pinnedPost = post;
          return;
        }
        rest.push(post);
      });
      if (!pinnedPost) return posts;
      return [pinnedPost, ...rest];
    };

    const canSeePost = (post) => {
      if (post.visibility === "private") {
        return currentUser && post.user_id === currentUser.id;
      }
      return true;
    };

    const matchesFilter = (post) => {
      if (currentFilter === "foryou") {
        return true;
      }
      if (currentFilter === "mine") {
        return currentUser && post.user_id === currentUser.id;
      }
      if (currentFilter === "following") {
        if (!currentUser) return false;
        return post.user_id === currentUser.id || followingIds.has(post.user_id);
      }
      if (currentFilter === "saved") {
        return savedPostIds.has(`${post?.id || ""}`);
      }
      if (currentFilter === "public") {
        return post.visibility !== "private";
      }
      return true;
    };

    const matchesSearch = (post) => {
      if (!searchValue) return true;
      const haystack = getPostSearchHaystack(post, workoutLogsByPost);
      return haystack.includes(searchValue);
    };
    const isVideoPost = (post) => {
      if (!post?.media_url) return false;
      const mediaType = `${post?.media_type || ""}`.trim().toLowerCase();
      if (mediaType === "video") return true;
      return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(`${post.media_url}`);
    };
    renderFeedDiscoverySections({
      allPosts,
      currentFilter,
      discoveryExpanded: !isShortsMode && feedDiscoveryExpanded,
      currentUser,
      followingIds,
      savedPostIds,
      hiddenPostIds,
      mutedUserIds,
      mutedTerms,
      followedTopics,
      searchValue,
      tr,
    });
    const canShowStatsFromSettings = settings.showFeedStats !== false;
    const canShowStats =
      !isShortsMode && canShowStatsFromSettings && !isCompactViewport();
    if (statGrid) {
      statGrid.classList.toggle("hidden", !canShowStats || !feedStatsExpanded);
    }
    if (feedAdvanced) {
      feedAdvanced.classList.remove("hidden");
    }
    if (feedOptionsBtn) {
      const filterMenuLabel = tr.feedFilterMenu || "フィルタ";
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "⋯";
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = filterMenuLabel;
      feedOptionsBtn.replaceChildren(icon, sr);
      feedOptionsBtn.setAttribute("aria-label", filterMenuLabel);
      feedOptionsBtn.setAttribute("title", filterMenuLabel);
      feedOptionsBtn.classList.remove("hidden");
      feedOptionsBtn.classList.add("is-icon-btn");
    }
    if (refreshBtn) {
      const refreshLabel = tr.feedRefresh || "更新";
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "↻";
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = refreshLabel;
      refreshBtn.replaceChildren(icon, sr);
      refreshBtn.setAttribute("aria-label", refreshLabel);
      refreshBtn.setAttribute("title", refreshLabel);
      refreshBtn.classList.add("is-icon-btn");
    }
    if (shortsModeBtn) {
      const shortsLabel = isShortsMode
        ? tr.feedModeFeed || "通常"
        : tr.feedModeShorts || "ショート";
      shortsModeBtn.textContent = shortsLabel;
      shortsModeBtn.setAttribute("aria-pressed", isShortsMode ? "true" : "false");
    }
    if (statsToggleBtn) {
      statsToggleBtn.classList.toggle("hidden", !canShowStats);
      statsToggleBtn.disabled = !canShowStats;
      if (canShowStats) {
        statsToggleBtn.textContent = tr.feedStatsCompact || "統計";
        statsToggleBtn.setAttribute(
          "aria-label",
          feedStatsExpanded
            ? tr.feedStatsHide || "統計を隠す"
            : tr.feedStatsShow || "統計を表示"
        );
      }
      statsToggleBtn.classList.toggle("is-active", canShowStats && feedStatsExpanded);
      statsToggleBtn.setAttribute(
        "aria-expanded",
        canShowStats && feedStatsExpanded ? "true" : "false"
      );
    }
    if (discoveryToggleBtn) {
      const canShowDiscovery =
        !isShortsMode && ["foryou", "all", "following"].includes(currentFilter);
      discoveryToggleBtn.classList.toggle("hidden", !canShowDiscovery);
      discoveryToggleBtn.disabled = !canShowDiscovery;
      if (canShowDiscovery) {
        discoveryToggleBtn.textContent = tr.feedDiscoveryCompact || "発見";
        discoveryToggleBtn.setAttribute(
          "aria-label",
          feedDiscoveryExpanded
            ? tr.feedDiscoveryHide || "発見を閉じる"
            : tr.feedDiscoveryShow || "発見を表示"
        );
      }
      discoveryToggleBtn.classList.toggle("is-active", canShowDiscovery && feedDiscoveryExpanded);
      discoveryToggleBtn.setAttribute(
        "aria-expanded",
        canShowDiscovery && feedDiscoveryExpanded ? "true" : "false"
      );
    }
    const rankControls = $("feed-rank-controls");
    if (rankControls) {
      rankControls.classList.toggle("hidden", compactFilterViewport);
    }
    const secondaryFilters = document.querySelector(".feed-secondary-filters");
    if (secondaryFilters) {
      secondaryFilters.classList.toggle("hidden", compactFilterViewport);
    }

    const firstPostId = Array.isArray(allPosts) && allPosts.length ? allPosts[0]?.id || "" : "";
    const lastPostId = Array.isArray(allPosts) && allPosts.length
      ? allPosts[allPosts.length - 1]?.id || ""
      : "";
    const queryKey = [
      currentUser?.id || "",
      currentFilter,
      forYouTuning,
      feedViewMode,
      filterMedia ? "1" : "0",
      filterWorkout ? "1" : "0",
      sortOrder,
      feedLayout,
      searchValue,
      Array.isArray(allPosts) ? allPosts.length : 0,
      firstPostId,
      lastPostId,
      Array.from(followingIds).sort().slice(0, 120).join(","),
      Array.from(savedPostIds).sort().slice(0, 120).join(","),
      Array.from(hiddenPostIds).sort().slice(0, 120).join(","),
      Array.from(mutedUserIds).sort().slice(0, 120).join(","),
      Array.from(mutedTerms).sort().slice(0, 120).join(","),
      Array.from(followedTopics).sort().slice(0, 120).join(","),
      Array.from(currentUserRepostedIds).sort().slice(0, 120).join(","),
      currentPinnedPostId,
    ].join("|");
    const baseQueryKey = [
      currentUser?.id || "",
      currentFilter,
      forYouTuning,
      feedViewMode,
      filterMedia ? "1" : "0",
      filterWorkout ? "1" : "0",
      sortOrder,
      Array.isArray(allPosts) ? allPosts.length : 0,
      firstPostId,
      lastPostId,
      Array.from(followingIds).sort().slice(0, 120).join(","),
      Array.from(savedPostIds).sort().slice(0, 120).join(","),
      Array.from(hiddenPostIds).sort().slice(0, 120).join(","),
      Array.from(mutedUserIds).sort().slice(0, 120).join(","),
      Array.from(mutedTerms).sort().slice(0, 120).join(","),
      Array.from(followedTopics).sort().slice(0, 120).join(","),
      Array.from(currentUserRepostedIds).sort().slice(0, 120).join(","),
      currentPinnedPostId,
    ].join("|");
    let gridCandidates = [];
    const canUseQueryCache =
      feedQueryCache.queryKey === queryKey &&
      feedQueryCache.postsRef === allPosts &&
      feedQueryCache.workoutLogsRef === workoutLogsByPost;
    const queryCacheHit = canUseQueryCache;
    if (canUseQueryCache) {
      gridCandidates = feedQueryCache.gridCandidates;
    } else {
      let sortedBasePosts = [];
      const canUseBaseCache =
        feedBaseCandidatesCache.baseKey === baseQueryKey &&
        feedBaseCandidatesCache.postsRef === allPosts &&
        feedBaseCandidatesCache.workoutLogsRef === workoutLogsByPost;
      if (canUseBaseCache) {
        sortedBasePosts = feedBaseCandidatesCache.sortedPosts;
      } else {
        const visiblePosts = Array.isArray(allPosts)
          ? allPosts.filter((post) => {
              if (!canSeePost(post) || !matchesFilter(post)) {
                return false;
              }
              if (hiddenPostIds.has(`${post?.id || ""}`)) {
                return false;
              }
              const postUserId = `${post?.user_id || ""}`.trim();
              const viewerId = `${currentUser?.id || ""}`.trim();
              if (postUserId && postUserId !== viewerId && mutedUserIds.has(postUserId)) {
                return false;
              }
              if (isPostMutedByTerms(post, mutedTerms, workoutLogsByPost)) {
                return false;
              }
              if (filterMedia && !post.media_url) {
                return false;
              }
              if (filterWorkout && !(workoutLogsByPost.get(post.id) || []).length) {
                return false;
              }
              return true;
            })
          : [];
        if (currentFilter === "foryou") {
          sortedBasePosts = rankForYouPosts(visiblePosts, {
            currentUserId: currentUser?.id || "",
            followingIds,
            followedTopics,
            forYouTuning,
            likesByPost: getLikesByPost(),
            commentsByPost,
            workoutLogsByPost,
            repostCountsByPost,
            sortOrder,
          });
        } else {
          sortedBasePosts = visiblePosts.slice().sort((a, b) => {
            const aTime = new Date(a.date || a.created_at || 0).getTime();
            const bTime = new Date(b.date || b.created_at || 0).getTime();
            if (sortOrder === "oldest") {
              return aTime - bTime;
            }
            return bTime - aTime;
          });
        }
        sortedBasePosts = prioritizePinnedPosts(sortedBasePosts);
        feedBaseCandidatesCache = {
          baseKey: baseQueryKey,
          postsRef: allPosts,
          workoutLogsRef: workoutLogsByPost,
          sortedPosts: sortedBasePosts,
        };
      }
      const searchedPosts = searchValue
        ? sortedBasePosts.filter((post) => matchesSearch(post))
        : sortedBasePosts;
      if (isShortsMode) {
        gridCandidates = searchedPosts.filter((post) => isVideoPost(post));
      } else {
        gridCandidates =
          feedLayout === "grid"
            ? searchedPosts.filter((post) => post.media_url)
            : searchedPosts;
      }
      feedQueryCache = {
        queryKey,
        postsRef: allPosts,
        workoutLogsRef: workoutLogsByPost,
        gridCandidates,
      };
    }

    const effectiveLayout = isShortsMode ? "list" : feedLayout;
    const feedCard = container.closest(".page-view[data-page='feed'] .card");
    if (feedCard) {
      feedCard.classList.toggle("is-shorts-mode", isShortsMode);
    }
    container.classList.toggle("shorts-view", isShortsMode);
    container.classList.toggle("grid-view", !isShortsMode && feedLayout === "grid");
    if (!isShortsMode) {
      resetShortsCardObserver();
    }
    if (layoutBtn) {
      const label =
        feedLayout === "grid"
          ? tr.feedLayoutList || "List"
          : tr.feedLayoutGrid || "Grid";
      layoutBtn.textContent = label;
      layoutBtn.classList.toggle("hidden", isShortsMode);
      layoutBtn.disabled = isShortsMode;
    }
    if (shortsModeBtn) {
      shortsModeBtn.classList.toggle("is-active", isShortsMode);
      shortsModeBtn.classList.toggle("hidden", compactFilterViewport);
      shortsModeBtn.textContent = compactFilterViewport
        ? isShortsMode
          ? tr.feedModeFeedCompact || "投稿"
          : tr.feedModeShortsCompact || "動画"
        : isShortsMode
          ? tr.feedModeFeed || "Feed"
          : tr.feedModeShorts || "Shorts";
      shortsModeBtn.setAttribute("aria-pressed", isShortsMode ? "true" : "false");
    }

    const resetStatusState = () => {
      if (!status) return;
      status.textContent = "";
      status.classList.remove(
        "feed-status-loading",
        "feed-status-success",
        "feed-status-warning",
        "feed-status-error"
      );
    };

    if (isFeedLoading) {
      feedChunkRendering = false;
      clearFeedMoreLoadingState();
      updateRetryButton(false);
      if (Array.isArray(allPosts) && allPosts.length > 0) {
        if (status) {
          resetStatusState();
          status.textContent = feedNotice || tr.feedRefreshing || "更新中...";
          status.classList.add("feed-status-loading");
        }
        renderFeedPerfPanel({
          type: "loading",
          message: tr.feedRefreshing || "Updating feed...",
        });
      } else {
        resetStatusState();
        if (status) {
          status.textContent = tr.feedRefreshing || "更新中...";
          status.classList.add("feed-status-loading");
        }
        resetDeferredVideoObserver();
        resetShortsCardObserver();
        container.innerHTML = "";
        delete container.dataset.feedSignature;
        feedWindowedCards.clear();
        if (moreWrap) moreWrap.classList.add("hidden");
        const skeletonCount = isCompactViewport() ? 2 : 3;
        for (let i = 0; i < skeletonCount; i += 1) {
          const skeleton = document.createElement("div");
          skeleton.className = "post-card skeleton feed-skeleton";
          container.appendChild(skeleton);
        }
        renderFeedPerfPanel({
          type: "loading",
          message: tr.feedRefreshing || "Updating feed...",
        });
      }
      return;
    }

    resetStatusState();
    if (status) {
      if (feedError) {
        status.textContent = feedError;
        status.classList.add("feed-status-error");
      } else if (feedDemoMode) {
        status.textContent =
          tr.feedDemoModeNotice ||
          "デモ表示中です。接続後に「再試行」で実データへ切り替えてください。";
        status.classList.add("feed-status-warning");
      } else if (feedNotice) {
        status.textContent = feedNotice;
        if (feedNoticeTone === "success") {
          status.classList.add("feed-status-success");
        } else if (feedNoticeTone === "warning") {
          status.classList.add("feed-status-warning");
        } else if (feedNoticeTone === "loading") {
          status.classList.add("feed-status-loading");
        }
      }
    }
    updateRetryButton(
      Boolean(feedError) ||
        (!feedIsOnline && !isFeedLoading) ||
        feedDemoMode
    );

    const visibleSlice = gridCandidates.slice(0, feedVisibleCount);
    queueFeedProfileHydration(
      visibleSlice
        .filter((post) => post && !post.profile)
        .map((post) => post.user_id)
    );
    const metaTargetCount = Math.min(
      gridCandidates.length,
      feedVisibleCount + feedPageSize * 2
    );
    if (metaTargetCount > 0) {
      const metaTargetIds = gridCandidates
        .slice(0, metaTargetCount)
        .map((post) => post.id)
        .filter(Boolean);
      queueFeedMetadataForPosts(metaTargetIds);
    }
    const renderSignature = [
      effectiveLayout,
      feedViewMode,
      viewportTier,
      currentFilter,
      forYouTuning,
      filterMedia ? "1" : "0",
      filterWorkout ? "1" : "0",
      sortOrder,
      searchValue,
      currentUser?.id || "",
      String(gridCandidates.length),
      gridCandidates[0]?.id || "",
      gridCandidates[gridCandidates.length - 1]?.id || "",
    ].join("|");
    const existingPostCards = Array.from(
      container.querySelectorAll(".post-card[data-post-id]")
    );
    const existingPostIds = existingPostCards.map(
      (card) => `${card.getAttribute("data-post-id") || ""}`
    );
    const nextPostIds = visibleSlice.map((post) => `${post?.id || ""}`);
    const hasWindowPlaceholders =
      container.querySelector(".feed-window-placeholder[data-post-id]") !== null;
    const existingCount = container.querySelectorAll(
      ".post-card[data-post-id], .feed-window-placeholder[data-post-id]"
    ).length;
    const canAppend =
      appendOnly &&
      container.dataset.feedSignature === renderSignature &&
      existingCount > 0 &&
      existingCount < visibleSlice.length;
    const canPatchCards =
      !canAppend &&
      !isShortsMode &&
      !feedAdsEnabled &&
      !hasWindowPlaceholders &&
      feedWindowedCards.size === 0 &&
      container.dataset.feedSignature === renderSignature &&
      existingPostIds.length > 0 &&
      existingPostIds.length === nextPostIds.length &&
      existingPostIds.every((postId, index) => postId === nextPostIds[index]);
    const existingAdCount = canAppend
      ? container.querySelectorAll(".feed-ad-card[data-ad-kind='in-feed']").length
      : 0;
    const renderMode = canAppend ? "append" : canPatchCards ? "patch" : "full";

    if (!gridCandidates.length) {
      feedChunkRendering = false;
      clearFeedMoreLoadingState();
      resetDeferredVideoObserver();
      resetShortsCardObserver();
      container.innerHTML = "";
      delete container.dataset.feedSignature;
      syncFeedWindowing(false);
      if (moreWrap) moreWrap.classList.add("hidden");
      const empty = document.createElement("div");
      empty.className = "empty-state";

      const title = document.createElement("div");
      title.className = "empty-title";
      const isSavedEmpty = currentFilter === "saved";
      const isFollowingEmpty = currentFilter === "following";
      title.textContent = isShortsMode
        ? tr.feedShortsEmptyTitle || "ショート動画がまだありません。"
        : isSavedEmpty
        ? tr.feedSavedEmptyTitle || "保存した投稿がありません。"
        : isFollowingEmpty
        ? tr.feedFollowingEmptyTitle || "フォロー中ユーザーの投稿がありません。"
        : tr.feedEmptyTitle || tr.emptyFeed || "表示する投稿がありません。";

      const hasConnectionIssue = isSupabaseConnectivityIssue(feedError, tr);
      const hasLocalConnectionOverrideIssue =
        hasConnectionIssue && SUPABASE_CONFIG_SOURCE === "local";
      const desc = document.createElement("div");
      desc.className = "empty-desc";
      desc.textContent = hasConnectionIssue
        ? hasLocalConnectionOverrideIssue
          ? tr.feedEmptyConnectionHintLocal ||
            "ローカル保存した接続先で失敗しています。デフォルト接続に戻すと復旧できる可能性があります。"
          : feedErrorCode === "dns"
          ? tr.feedEmptyConnectionHintDns ||
            "Supabase のホスト名を解決できません。Project URL を確認してください。"
          : feedErrorCode === "timeout"
          ? tr.feedEmptyConnectionHintTimeout ||
            "接続確認がタイムアウトしました。通信状態を確認して再試行してください。"
          : feedErrorCode === "auth"
          ? tr.feedEmptyConnectionHintAuth ||
            "認証に失敗しています。Anon key が正しいか確認してください。"
          : tr.feedEmptyConnectionHint ||
            "Supabase 接続に失敗しています。設定で Project URL / Anon key を確認してください。"
        : isShortsMode
        ? tr.feedShortsEmptyDesc ||
          "動画付き投稿をするとここに表示されます。"
        : isSavedEmpty
        ? tr.feedSavedEmptyDesc || "カード右上の保存ボタンで後で見返せます。"
        : isFollowingEmpty
        ? tr.feedFollowingEmptyDesc ||
          "おすすめユーザーをフォローしてフィードを充実させましょう。"
        : tr.feedEmptyDesc || "最初の投稿をしてみましょう。";

      const actions = document.createElement("div");
      actions.className = "empty-actions";

      const primary = document.createElement("button");
      primary.className = "btn btn-primary";
      if (hasConnectionIssue) {
        primary.textContent =
          tr.feedEmptyCtaFixConnection || "接続設定を開く";
        primary.addEventListener("click", () => {
          setActivePage("settings");
          const targetInput = document.getElementById("settings-supabase-url");
          if (targetInput) {
            setTimeout(() => {
              targetInput.focus();
              targetInput.select();
            }, 120);
          }
        });
      } else if (isSavedEmpty) {
        primary.textContent = tr.feedSavedEmptyCta || tr.all || "すべて";
        primary.addEventListener("click", () => {
          currentFilter = "all";
          persistFeedUiState();
          updateFilterButtons();
          renderFeed();
        });
      } else if (currentUser) {
        primary.textContent = tr.feedEmptyCtaPost || tr.newPost || "新規投稿";
        primary.addEventListener("click", () => {
          if (typeof openPostModal === "function") {
            openPostModal();
          }
        });
      } else {
        primary.textContent =
          tr.feedEmptyCtaLogin || tr.loginSignup || "ログインして始める";
        primary.addEventListener("click", () => {
          setActivePage("account");
        });
      }

      const secondary = document.createElement("button");
      secondary.className = "btn btn-ghost";
      if (hasConnectionIssue) {
        secondary.textContent = tr.feedRetry || "Retry";
        secondary.addEventListener("click", async () => {
          if (secondary.classList.contains("is-loading")) return;
          secondary.classList.add("is-loading");
          secondary.disabled = true;
          try {
            await loadFeed({ softRefresh: true, forceNetwork: true });
          } finally {
            secondary.classList.remove("is-loading");
            secondary.disabled = false;
          }
        });
      } else {
        secondary.textContent =
          tr.feedEmptyCtaProfile || "プロフィールを整える";
        secondary.addEventListener("click", () => {
          setActivePage("account");
        });
      }

      if (hasConnectionIssue) {
        const demo = document.createElement("button");
        demo.className = "btn btn-ghost";
        demo.textContent = tr.feedEmptyCtaDemo || "デモ投稿を表示";
        demo.addEventListener("click", () => {
          const demoPosts = createDemoFeedPosts();
          feedDemoMode = true;
          setAllPosts(demoPosts);
          invalidateFeedQueryCache();
          postSearchHaystackCache.clear();
          feedLastLoadedAt = Date.now();
          resetFeedPagination();
          updateFeedStats(demoPosts);
          feedError = "";
          setFeedNotice("", "");
          renderFeed();
        });
        actions.appendChild(demo);
        if (hasLocalConnectionOverrideIssue) {
          const resetConnection = document.createElement("button");
          resetConnection.className = "btn btn-ghost";
          resetConnection.textContent =
            tr.feedEmptyCtaResetConnection ||
            "デフォルト接続に戻して再読み込み";
          resetConnection.addEventListener("click", () => {
            clearStoredSupabaseConfig();
            window.location.reload();
          });
          actions.appendChild(resetConnection);
        }
      }

      actions.appendChild(primary);
      actions.appendChild(secondary);
      empty.appendChild(title);
      empty.appendChild(desc);
      empty.appendChild(actions);
      container.appendChild(empty);
      renderFeedPerfPanel({
        durationMs: perfNow() - renderStartedAt,
        totalCount: 0,
        visibleCount: 0,
        mode: "full",
        queryCacheHit,
      });
      return;
    }

    if (!canAppend && !canPatchCards) {
      clearFeedMoreLoadingState();
      resetDeferredVideoObserver();
      if (isShortsMode) {
        resetShortsCardObserver();
      }
      container.innerHTML = "";
      if (moreWrap) moreWrap.classList.add("hidden");
    }
    container.dataset.feedSignature = renderSignature;

    const localLikedIds = getLikedIds();
    const buildPostRenderKey = (post) => {
      if (!post) return "";
      const postId = `${post?.id || ""}`;
      const profile = post.profile || {};
      const logs = workoutLogsByPost.get(post.id) || [];
      const logsSignature = logs
        .map((item) => {
          const exercise = `${item?.exercise || ""}`;
          const setsCount = Array.isArray(item?.sets) ? item.sets.length : 0;
          return `${exercise}:${setsCount}`;
        })
        .join(",");
      const likeState = getLikeUiState(post.id, localLikedIds);
      const commentsCount = (commentsByPost.get(post.id) || []).length || 0;
      const saved = savedPostIds.has(postId) ? "1" : "0";
      const following =
        currentUser && post.user_id && post.user_id !== currentUser.id
          ? followingIds.has(post.user_id)
            ? "1"
            : "0"
          : "x";
      const seen = seenPostIds.has(postId) ? "1" : "0";
      const pinned = isPinnedPostForUser(post.id, post.user_id) ? "1" : "0";
      const commentSheetOpen = isCommentSheetOpenForPost(post.id) ? "1" : "0";
      const reason = getForYouReasonLabel(post) || "";
      return [
        currentLang,
        viewportTier,
        `${post?.id || ""}`,
        `${post?.user_id || ""}`,
        `${post?.visibility || ""}`,
        `${post?.date || ""}`,
        `${post?.created_at || ""}`,
        `${post?.updated_at || ""}`,
        `${post?.note || ""}`,
        `${post?.caption || ""}`,
        `${post?.media_url || ""}`,
        `${post?.media_type || ""}`,
        `${post?.bodyweight ?? ""}`,
        `${profile?.display_name || ""}`,
        `${profile?.handle || ""}`,
        `${profile?.username || ""}`,
        `${profile?.avatar_url || ""}`,
        logsSignature,
        `${likeState?.isLiked ? "1" : "0"}:${Number(likeState?.likeCount || 0)}:${likeState?.isLoading ? "1" : "0"}`,
        `${commentsCount}:${commentSheetOpen}`,
        saved,
        following,
        seen,
        pinned,
        reason,
      ].join("|");
    };
    const shouldAnimateEntry = canAppend && shouldUseFeedEntryAnimation();
    const createShortsCard = (post, feedIndex = 0) => {
      const card = document.createElement("article");
      card.className = "post-card shorts-card";
      if (shouldAnimateEntry) {
        card.classList.add("post-card-enter");
        requestAnimationFrame(() => {
          card.classList.add("is-ready");
        });
      }
      card.setAttribute("data-post-id", post.id);
      card.dataset.postRenderKey = buildPostRenderKey(post);
      const logs = workoutLogsByPost.get(post.id) || [];
      const isSeen = seenPostIds.has(`${post.id || ""}`);
      if (isSeen) {
        card.classList.add("post-card-seen");
      }

      const mediaWrap = document.createElement("div");
      mediaWrap.className = "post-media shorts-media";
      const isVideoMedia = isVideoPost(post);
      let shortsVideoEl = null;
      mountMediaSkeleton(mediaWrap);
      const renderMediaFallback = () => {
        clearMediaSkeleton(mediaWrap);
        mediaWrap.classList.add("is-error");
        mediaWrap.innerHTML = "";
        const fallback = document.createElement("div");
        fallback.className = "media-fallback";
        fallback.textContent = tr.mediaUnavailable || "Media unavailable";
        mediaWrap.appendChild(fallback);
      };
      const shortsImageDelivery = getFeedImageDelivery(post.media_url, {
        layout: "list",
        shorts: true,
      });
      const prioritizeMedia = !appendOnly && feedIndex < 2;
      if (isVideoMedia) {
        mediaWrap.classList.add("is-video");
        const video = document.createElement("video");
        video.preload = prioritizeMedia ? "metadata" : "none";
        video.controls = false;
        video.loop = true;
        video.muted = !shortsSoundEnabled;
        video.defaultMuted = !shortsSoundEnabled;
        video.playsInline = true;
        video.classList.add("video-deferred");
        video.dataset.src = post.media_url;
        video.addEventListener(
          "loadeddata",
          () => {
            clearMediaSkeleton(mediaWrap);
          },
          { once: true }
        );
        video.addEventListener("error", renderMediaFallback, { once: true });
        video.addEventListener("play", () => {
          card.classList.remove("is-paused");
          syncShortsPlayButton(card, video);
        });
        video.addEventListener("pause", () => {
          card.classList.add("is-paused");
          syncShortsPlayButton(card, video);
        });
        video.addEventListener("volumechange", () => {
          card.classList.toggle("is-muted", video.muted);
          syncShortsSoundButton(card);
        });
        observeDeferredVideo(video);
        shortsVideoEl = video;
        mediaWrap.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.loading = prioritizeMedia ? "eager" : "lazy";
        img.decoding = "async";
        img.fetchPriority = prioritizeMedia ? "high" : "auto";
        img.referrerPolicy = "no-referrer";
        img.alt = "short media";
        img.classList.add("image-deferred");
        if (shortsImageDelivery.srcSet) {
          img.srcset = shortsImageDelivery.srcSet;
        }
        if (shortsImageDelivery.sizes) {
          img.sizes = shortsImageDelivery.sizes;
        }
        img.addEventListener(
          "load",
          () => {
            clearMediaSkeleton(mediaWrap);
          },
          { once: true }
        );
        img.addEventListener("error", renderMediaFallback, { once: true });
        if (warmedImageUrlSet.has(shortsImageDelivery.src)) {
          img.src = shortsImageDelivery.src;
          img.dataset.deferredLoaded = "true";
          img.classList.remove("image-deferred");
        } else {
          img.dataset.src = shortsImageDelivery.src;
          observeDeferredImage(img);
        }
        mediaWrap.appendChild(img);
      }
      mediaWrap.addEventListener("dblclick", () => {
        if (!currentUser) return;
        const likeState = getLikeUiState(post.id, localLikedIds);
        if (likeState?.isLiked) return;
        toggleLikeForPost(post).catch((error) => {
          console.error("double tap like failed", error);
        });
      });
      card.appendChild(mediaWrap);

      const overlay = document.createElement("div");
      overlay.className = "shorts-overlay";
      const topBar = document.createElement("div");
      topBar.className = "shorts-topbar";
      const progress = document.createElement("div");
      progress.className = "shorts-progress";
      const progressTotal = Math.max(visibleSlice.length, 1);
      const progressIndex = Math.min(feedIndex + 1, progressTotal);
      const progressRail = document.createElement("div");
      progressRail.className = "shorts-progress-segments";
      const visibleSegmentCount = Math.min(progressTotal, 6);
      const activeOffset = Math.floor(visibleSegmentCount / 2);
      const segmentWindowStart = Math.max(
        0,
        Math.min(progressIndex - 1 - activeOffset, progressTotal - visibleSegmentCount)
      );
      for (let offset = 0; offset < visibleSegmentCount; offset += 1) {
        const absoluteIndex = segmentWindowStart + offset + 1;
        const segment = document.createElement("span");
        segment.className = "shorts-progress-segment";
        if (absoluteIndex < progressIndex) {
          segment.classList.add("is-complete");
        } else if (absoluteIndex === progressIndex) {
          segment.classList.add("is-active");
          const liveFill = document.createElement("span");
          liveFill.className = "shorts-progress-segment-fill";
          segment.appendChild(liveFill);
        }
        progressRail.appendChild(segment);
      }
      const progressLabel = document.createElement("span");
      progressLabel.className = "shorts-progress-count";
      progressLabel.textContent = `${progressIndex} / ${progressTotal}`;
      progress.append(progressRail, progressLabel);
      topBar.appendChild(progress);
      const topBadges = document.createElement("div");
      topBadges.className = "shorts-topbar-badges";
      if (isVideoMedia) {
        const playToggle = document.createElement("button");
        playToggle.type = "button";
        playToggle.className = "shorts-top-toggle";
        playToggle.dataset.postAction = "toggle-shorts-play";
        topBadges.appendChild(playToggle);

        const soundToggle = document.createElement("button");
        soundToggle.type = "button";
        soundToggle.className = "shorts-top-toggle";
        soundToggle.dataset.postAction = "toggle-shorts-sound";
        topBadges.appendChild(soundToggle);
      }
      const creatorRow = document.createElement("div");
      creatorRow.className = "shorts-creator-row";
      const displayName = post.profile?.display_name || "";
      const content = document.createElement("div");
      content.className = "shorts-copy shorts-copy-panel";
      const meta = document.createElement("div");
      meta.className = "shorts-meta";
      const rawHandle = post.profile?.handle || post.profile?.username || "user";
      const handleText = formatHandle(rawHandle) || "@user";
      const relativeText = formatRelative(post.date || post.created_at);
      const dateText = formatPostDate(post);
      const authorButton = document.createElement("button");
      authorButton.type = "button";
      authorButton.className = "shorts-author profile-link";
      authorButton.setAttribute("data-user-id", post.user_id || "");
      const authorAvatar = document.createElement("div");
      authorAvatar.className = "avatar shorts-author-avatar";
      const authorFallbackInitial = (displayName || handleText || "U")
        .replace("@", "")
        .charAt(0)
        .toUpperCase();
      renderAvatar(authorAvatar, post.profile, authorFallbackInitial);
      authorButton.appendChild(authorAvatar);
      const authorText = document.createElement("div");
      authorText.className = "shorts-author-text";
      const authorName = document.createElement("div");
      authorName.className = "shorts-author-name";
      const handleBare = handleText.replace("@", "").toLowerCase();
      const hasDistinctDisplayName =
        !!displayName && displayName.toLowerCase() !== handleBare;
      authorName.textContent = hasDistinctDisplayName ? displayName : handleText;
      authorText.appendChild(authorName);
      if (hasDistinctDisplayName) {
        const authorHandle = document.createElement("div");
        authorHandle.className = "shorts-author-handle";
        authorHandle.textContent = handleText;
        authorText.appendChild(authorHandle);
      }
      authorButton.appendChild(authorText);
      creatorRow.appendChild(authorButton);
      if (currentUser && post.user_id && post.user_id !== currentUser.id) {
        const followBtn = document.createElement("button");
        followBtn.className = "btn btn-follow shorts-follow-btn";
        followBtn.setAttribute("data-user-id", post.user_id);
        const isFollowing = followingIds.has(post.user_id);
        followBtn.textContent = isFollowing ? tr.unfollow || "Following" : tr.follow || "Follow";
        followBtn.classList.toggle("is-following", isFollowing);
        followBtn.setAttribute("aria-pressed", isFollowing ? "true" : "false");
        creatorRow.appendChild(followBtn);
      }
      content.appendChild(creatorRow);
      const shortsBadge = document.createElement("span");
      shortsBadge.className = "shorts-badge shorts-meta-chip";
      shortsBadge.textContent = tr.shortsBadge || "SHORTS";
      topBadges.appendChild(shortsBadge);
      const metaTime = document.createElement("span");
      metaTime.className = "shorts-meta-time";
      metaTime.textContent = relativeText || dateText;
      meta.appendChild(metaTime);
      if (post.visibility === "private") {
        const visibility = document.createElement("span");
        visibility.className = "shorts-meta-chip shorts-meta-visibility";
        visibility.textContent = tr.privateOnly || "Private";
        topBadges.appendChild(visibility);
      }
      const reasonLabel = getForYouReasonLabel(post);
      if (reasonLabel) {
        const reason = document.createElement("span");
        reason.className = "shorts-meta-chip shorts-reason";
        reason.textContent = reasonLabel;
        topBadges.appendChild(reason);
      }
      topBar.appendChild(topBadges);
      overlay.appendChild(topBar);
      if (isVideoMedia) {
        const playbackCue = document.createElement("div");
        playbackCue.className = "shorts-center-cue";
        playbackCue.setAttribute("aria-hidden", "true");
        const playbackCueIcon = document.createElement("span");
        playbackCueIcon.className = "shorts-center-cue-icon";
        playbackCueIcon.textContent = "▶";
        const playbackCueLabel = document.createElement("span");
        playbackCueLabel.className = "shorts-center-cue-label";
        playbackCueLabel.textContent = tr.shortsTapPlay || "Tap to play";
        playbackCue.append(playbackCueIcon, playbackCueLabel);
        card.appendChild(playbackCue);
      }
      content.appendChild(meta);

      const captionText = `${post.note || post.caption || ""}`.trim();
      if (captionText) {
        const { title: captionTitle, body: captionBody } = splitCaptionContent(captionText);
        const captionWrap = document.createElement("div");
        captionWrap.className = "shorts-caption-wrap";
        if (captionTitle) {
          const title = document.createElement("div");
          title.className = "shorts-caption-title";
          title.textContent = captionTitle;
          captionWrap.appendChild(title);
        }
        if (captionBody) {
          const caption = document.createElement("div");
          caption.className = "shorts-caption";
          caption.textContent = captionBody;
          captionWrap.appendChild(caption);
        }
        content.appendChild(captionWrap);
      }
      if (logs.length || post.bodyweight) {
        const stats = document.createElement("div");
        stats.className = "shorts-stats";
        if (logs.length) {
          const exerciseChip = document.createElement("span");
          exerciseChip.className = "shorts-stat-chip";
          exerciseChip.textContent = `${logs.length}${tr.workoutExerciseCountLabel || "種目"}`;
          stats.appendChild(exerciseChip);
          const setCount = logs.reduce(
            (sum, item) => sum + ((item?.sets || []).length || 0),
            0
          );
          if (setCount > 0) {
            const setChip = document.createElement("span");
            setChip.className = "shorts-stat-chip";
            setChip.textContent = `${setCount}${tr.workoutSetCountLabel || "セット"}`;
            stats.appendChild(setChip);
          }
        }
        if (
          settings.showBodyweight &&
          post.bodyweight !== null &&
          post.bodyweight !== undefined &&
          post.bodyweight !== ""
        ) {
          const weightChip = document.createElement("span");
          weightChip.className = "shorts-stat-chip";
          weightChip.textContent = `${tr.weight || "Weight"} ${formatWeight(post.bodyweight)}`;
          stats.appendChild(weightChip);
        }
        if (stats.childNodes.length) {
          content.appendChild(stats);
        }
      }
      const commentTeaser = buildShortsCommentTeaser(post, tr, commentsByPost);
      if (commentTeaser) {
        content.appendChild(commentTeaser);
      }
      const actions = document.createElement("div");
      actions.className = "shorts-actions";
      const appendShortAction = (button) => {
        if (!button) return;
        button.classList.add("shorts-action-btn");
        actions.appendChild(button);
      };

      const likeBtn = document.createElement("button");
      likeBtn.className =
        "chip chip-like chip-action reaction-btn reaction-like chip-compact shorts-action-btn";
      likeBtn.dataset.postAction = "toggle-like";
      const likeState = getLikeUiState(post.id, localLikedIds);
      applyLikeButtonState(likeBtn, likeState, tr);
      appendShortAction(likeBtn);

      const commentBtn = document.createElement("button");
      commentBtn.className =
        "chip chip-log chip-action reaction-btn reaction-comment chip-compact shorts-action-btn";
      commentBtn.dataset.postAction = "toggle-comments";
      updateCommentButtonState(commentBtn, post.id, tr, commentsByPost);
      appendShortAction(commentBtn);

      const shareBtn = document.createElement("button");
      shareBtn.className = "chip chip-log chip-action shorts-action-btn shorts-action-icon-only";
      shareBtn.dataset.postAction = "share-post";
      setActionButtonContent(shareBtn, {
        kind: "share",
        icon: "↗",
        label: "",
      });
      shareBtn.setAttribute("aria-label", tr.share || "Share");
      appendShortAction(shareBtn);

      const saveBtn = document.createElement("button");
      saveBtn.className =
        "chip chip-log chip-save chip-action shorts-action-btn shorts-action-icon-only";
      saveBtn.dataset.postAction = "toggle-save";
      const isSaved = savedPostIds.has(`${post.id || ""}`);
      setActionButtonContent(saveBtn, {
        kind: "save",
        icon: "🔖",
        label: "",
      });
      saveBtn.classList.toggle("chip-active", isSaved);
      saveBtn.setAttribute("aria-pressed", isSaved ? "true" : "false");
      saveBtn.setAttribute("aria-label", isSaved ? tr.saved || "Saved" : tr.save || "Save");
      appendShortAction(saveBtn);

      const bottomRail = document.createElement("div");
      bottomRail.className = "shorts-bottom";
      bottomRail.append(content, actions);
      overlay.appendChild(bottomRail);
      if (feedIndex === 0) {
        const swipeHint = document.createElement("div");
        swipeHint.className = "shorts-swipe-hint";
        swipeHint.textContent = tr.shortsSwipeHint || "Swipe up for next";
        overlay.appendChild(swipeHint);
      }
      card.appendChild(overlay);

      if (shortsVideoEl) {
        shortsVideoEl.addEventListener("loadedmetadata", () => {
          updateShortsPlaybackProgress(card, shortsVideoEl);
        });
        shortsVideoEl.addEventListener("durationchange", () => {
          updateShortsPlaybackProgress(card, shortsVideoEl);
        });
        shortsVideoEl.addEventListener("timeupdate", () => {
          updateShortsPlaybackProgress(card, shortsVideoEl);
        });
        shortsVideoEl.addEventListener("seeked", () => {
          updateShortsPlaybackProgress(card, shortsVideoEl);
        });
        card.classList.toggle("is-muted", shortsVideoEl.muted);
        card.classList.add("is-paused");
        syncShortsPlayButton(card, shortsVideoEl);
        syncShortsSoundButton(card);
        bindShortsMediaInteractions(card, mediaWrap, shortsVideoEl, post);
      } else {
        updateShortsPlaybackProgress(card, null);
      }

      observeSeenPostCard(card, isSeen);
      return card;
    };
    const createPostCard = (post, feedIndex = 0) => {
      const card = document.createElement("div");
      card.className = "post-card";
      if (shouldAnimateEntry) {
        card.classList.add("post-card-enter");
        requestAnimationFrame(() => {
          card.classList.add("is-ready");
        });
      }
      if (!post.media_url) {
        card.classList.add("no-media");
      }
      card.setAttribute("data-post-id", post.id);
      card.dataset.postRenderKey = buildPostRenderKey(post);
      const logs = workoutLogsByPost.get(post.id) || [];

      const header = document.createElement("div");
      header.className = "post-header";
      const headerActions = document.createElement("div");
      headerActions.className = "post-header-actions";

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      const rawHandle =
        post.profile?.handle ||
        post.profile?.username ||
        "user";
      const handleText = formatHandle(rawHandle) || "@user";
      const displayName = post.profile?.display_name || "";
      const fallbackInitial = (displayName || handleText || "U")
        .replace("@", "")
        .charAt(0)
        .toUpperCase();
      renderAvatar(avatar, post.profile, fallbackInitial);

      const meta = document.createElement("div");
      meta.className = "post-meta";

      const userRow = document.createElement("div");
      userRow.className = "post-user";
      const userMain = document.createElement("div");
      userMain.className = "post-user-main";
      const nameSpan = document.createElement("span");
      nameSpan.className = "profile-link";
      nameSpan.setAttribute("data-user-id", post.user_id);
      const handleBare = handleText.replace("@", "");
      if (displayName && displayName.toLowerCase() !== handleBare.toLowerCase()) {
        nameSpan.textContent = displayName;
      } else {
        nameSpan.textContent = handleText;
      }
      userMain.appendChild(nameSpan);
      const isSeen = seenPostIds.has(`${post.id || ""}`);
      const isPinnedByOwner =
        `${post.user_id || ""}` &&
        isPinnedPostForUser(post.id, post.user_id);
      userRow.appendChild(userMain);

      const subRow = document.createElement("div");
      subRow.className = "post-meta-line";
      if (displayName && displayName.toLowerCase() !== handleBare.toLowerCase()) {
        const handleSpan = document.createElement("span");
        handleSpan.className = "handle profile-link post-handle-inline";
        handleSpan.setAttribute("data-user-id", post.user_id);
        handleSpan.textContent = handleText;
        subRow.appendChild(handleSpan);
      }
      const relativeText = formatRelative(post.date || post.created_at);
      const timeSpan = document.createElement("span");
      timeSpan.className = "post-sub post-time";
      timeSpan.textContent =
        relativeText || formatPostDate(post);
      subRow.appendChild(timeSpan);

      if (post.visibility === "private") {
        const visibilityBadge = document.createElement("span");
        visibilityBadge.className = "post-visibility-badge is-private";
        visibilityBadge.textContent = tr.privateOnly || "Private";
        subRow.appendChild(visibilityBadge);
      }

      const reasonLabel = getForYouReasonLabel(post);
      if (isPinnedByOwner) {
        const pinBadge = document.createElement("span");
        pinBadge.className = "post-pin-badge";
        pinBadge.textContent = tr.postPinnedBadge || "Pinned";
        subRow.appendChild(pinBadge);
      }
      if (reasonLabel) {
        const reason = document.createElement("span");
        reason.className = "post-reason-badge";
        reason.textContent = reasonLabel;
        subRow.appendChild(reason);
      }
      meta.appendChild(userRow);
      meta.appendChild(subRow);

      const footer = document.createElement("div");
      footer.className = "post-footer";
      const primaryActions = document.createElement("div");
      primaryActions.className = "post-actions post-action-row post-action-row-primary";
      const secondaryActions = document.createElement("div");
      secondaryActions.className =
        "post-actions post-action-row post-action-row-secondary";
      const appendPrimaryAction = (button) => {
        if (!button) return;
        button.classList.add("chip-compact");
        primaryActions.appendChild(button);
      };
      const appendSecondaryAction = (button) => {
        if (!button) return;
        button.classList.add("chip-compact");
        secondaryActions.appendChild(button);
      };
      const likeBtn = document.createElement("button");
      likeBtn.className = "chip chip-like chip-action reaction-btn reaction-like";
      likeBtn.dataset.postAction = "toggle-like";
      const likeState = getLikeUiState(post.id, localLikedIds);
      applyLikeButtonState(likeBtn, likeState, tr);
      appendPrimaryAction(likeBtn);

      const commentBtn = document.createElement("button");
      commentBtn.className = "chip chip-log chip-action reaction-btn reaction-comment";
      commentBtn.dataset.postAction = "toggle-comments";
      updateCommentButtonState(commentBtn, post.id, tr, commentsByPost);
      appendPrimaryAction(commentBtn);

      const shareBtn = document.createElement("button");
      shareBtn.className = "chip chip-log chip-action";
      shareBtn.dataset.postAction = "share-post";
      setActionButtonContent(shareBtn, {
        kind: "share",
        icon: "↗",
        label: tr.share || "Share",
      });
      shareBtn.setAttribute("aria-label", tr.share || "Share");
      appendSecondaryAction(shareBtn);

      const saveBtn = document.createElement("button");
      saveBtn.className = "chip chip-log chip-save chip-action";
      saveBtn.dataset.postAction = "toggle-save";
      const isSaved = savedPostIds.has(`${post.id || ""}`);
      setActionButtonContent(saveBtn, {
        kind: "save",
        icon: "🔖",
        label: isSaved ? tr.saved || "Saved" : tr.save || "Save",
      });
      saveBtn.classList.toggle("chip-active", isSaved);
      saveBtn.setAttribute("aria-pressed", isSaved ? "true" : "false");
      saveBtn.setAttribute("aria-label", isSaved ? tr.saved || "Saved" : tr.save || "Save");
      appendSecondaryAction(saveBtn);

      if (currentUser && post.user_id === currentUser.id) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "chip chip-delete";
        deleteBtn.dataset.postAction = "delete-post";
        deleteBtn.textContent = tr.delete || "Delete";
        appendSecondaryAction(deleteBtn);
      }

      if (currentUser && post.user_id && post.user_id !== currentUser.id) {
        const followBtn = document.createElement("button");
        followBtn.className = "chip chip-log btn-follow post-follow-inline";
        followBtn.setAttribute("data-user-id", post.user_id);
        const isFollowing = followingIds.has(post.user_id);
        followBtn.textContent = isFollowing
          ? tr.unfollow || "Following"
          : tr.follow || "Follow";
        followBtn.classList.toggle("is-following", isFollowing);
        followBtn.setAttribute("aria-pressed", isFollowing ? "true" : "false");
        headerActions.appendChild(followBtn);
      }

      header.appendChild(avatar);
      header.appendChild(meta);

      if (secondaryActions.childNodes.length) {
        const secondaryWrap = document.createElement("details");
        secondaryWrap.className = "post-action-menu";
        const summary = document.createElement("summary");
        summary.className = "chip chip-log post-action-more";
        summary.textContent = "⋯";
        summary.setAttribute("aria-label", tr.feedOptions || "Details");
        secondaryWrap.appendChild(summary);
        const panel = document.createElement("div");
        panel.className = "post-action-menu-panel";
        panel.appendChild(secondaryActions);
        secondaryWrap.appendChild(panel);
        headerActions.appendChild(secondaryWrap);
      }

      if (headerActions.childNodes.length) {
        header.appendChild(headerActions);
      }

      card.appendChild(header);
      if (isSeen) {
        card.classList.add("post-card-seen");
      }

      const prioritizeMedia = !appendOnly && feedIndex < 2;
      if (post.media_url) {
        const mediaWrap = document.createElement("div");
        mediaWrap.className = "post-media";
        const postImageDelivery = getFeedImageDelivery(post.media_url, {
          layout: feedLayout,
          shorts: false,
        });
        mountMediaSkeleton(mediaWrap);
        const renderMediaFallback = () => {
          clearMediaSkeleton(mediaWrap);
          mediaWrap.classList.add("is-error");
          mediaWrap.innerHTML = "";
          const fallback = document.createElement("div");
          fallback.className = "media-fallback";
          fallback.textContent =
            tr.mediaUnavailable || "Media unavailable";
          mediaWrap.appendChild(fallback);
        };
        if (post.media_type === "video") {
          const video = document.createElement("video");
          video.preload = prioritizeMedia ? "metadata" : "none";
          video.controls = true;
          video.playsInline = true;
          video.classList.add("video-deferred");
          video.dataset.src = post.media_url;
          video.addEventListener("loadeddata", () => {
            clearMediaSkeleton(mediaWrap);
          }, { once: true });
          video.addEventListener("error", renderMediaFallback, { once: true });
          observeDeferredVideo(video);
          mediaWrap.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.loading = prioritizeMedia ? "eager" : "lazy";
          img.decoding = "async";
          img.fetchPriority = prioritizeMedia
            ? "high"
            : feedLayout === "grid"
              ? "low"
              : "auto";
          img.referrerPolicy = "no-referrer";
          img.alt = "post media";
          img.classList.add("image-deferred");
          if (postImageDelivery.srcSet) {
            img.srcset = postImageDelivery.srcSet;
          }
          if (postImageDelivery.sizes) {
            img.sizes = postImageDelivery.sizes;
          }
          img.addEventListener("load", () => {
            clearMediaSkeleton(mediaWrap);
          }, { once: true });
          img.addEventListener("error", renderMediaFallback, { once: true });
          if (warmedImageUrlSet.has(postImageDelivery.src)) {
            img.src = postImageDelivery.src;
            img.dataset.deferredLoaded = "true";
            img.classList.remove("image-deferred");
          } else {
            img.dataset.src = postImageDelivery.src;
            observeDeferredImage(img);
          }
          mediaWrap.appendChild(img);
        }
        const mediaMeta = document.createElement("div");
        mediaMeta.className = "post-media-meta";
        const mediaKind = document.createElement("span");
        mediaKind.className = `post-media-chip ${
          post.media_type === "video" ? "is-video" : "is-photo"
        }`;
        mediaKind.textContent =
          post.media_type === "video"
            ? tr.mediaVideoLabel || "Video"
            : tr.mediaPhotoLabel || "Photo";
        mediaMeta.appendChild(mediaKind);
        if (logs.length) {
          const workoutChip = document.createElement("span");
          workoutChip.className = "post-media-chip is-workout";
          workoutChip.textContent = tr.mediaWorkoutLabel || "Workout";
          mediaMeta.appendChild(workoutChip);
        }
        mediaWrap.appendChild(mediaMeta);
        mediaWrap.addEventListener("dblclick", () => {
          if (!currentUser) return;
          const likeState = getLikeUiState(post.id, localLikedIds);
          if (likeState?.isLiked) return;
          toggleLikeForPost(post).catch((error) => {
            console.error("double tap like failed", error);
          });
          const burst = document.createElement("div");
          burst.className = "post-like-burst";
          burst.textContent = "❤";
          mediaWrap.appendChild(burst);
          setTimeout(() => burst.remove(), 520);
        });
        card.appendChild(mediaWrap);
      }

      const body = document.createElement("div");
      body.className = "post-body";
      const contextChips = document.createElement("div");
      contextChips.className = "post-context-chips";
      let captionBlock = null;

      if (
        settings.showBodyweight &&
        post.bodyweight !== null &&
        post.bodyweight !== undefined &&
        post.bodyweight !== ""
      ) {
        const weight = document.createElement("div");
        weight.className = "post-context-chip";
        weight.textContent = `${tr.weight || "Weight"} · ${formatWeight(
          post.bodyweight
        )}`;
        contextChips.appendChild(weight);
      }

      if (post.note || post.caption) {
        const fullText = `${post.note || post.caption || ""}`.trim();
        captionBlock = createPostCaptionBlock(fullText, tr);
        if (captionBlock) {
          body.classList.add("has-caption");
        }
      }

      if (logs.length) {
        body.classList.add("has-workout-preview");
        const exerciseCount = logs.length;
        const setCount = logs.reduce(
          (sum, item) => sum + ((item?.sets || []).length || 0),
          0
        );
        const topWeight = logs.reduce((maxWeight, item) => {
          const sets = Array.isArray(item?.sets) ? item.sets : [];
          return sets.reduce((best, set) => {
            const weight = Number(set?.weight || 0);
            if (!Number.isFinite(weight) || weight <= 0) return best;
            return Math.max(best, weight);
          }, maxWeight);
        }, 0);
        const topNames = logs
          .map((item) => String(item?.exercise || "").trim())
          .filter(Boolean);
        const workoutPreview = document.createElement("div");
        workoutPreview.className = "post-workout-preview";
        const workoutHead = document.createElement("div");
        workoutHead.className = "post-workout-preview-head";
        const workoutKicker = document.createElement("div");
        workoutKicker.className = "post-workout-preview-kicker";
        workoutKicker.textContent = tr.mediaWorkoutLabel || "Workout";
        const workoutMeta = document.createElement("div");
        workoutMeta.className = "post-workout-preview-meta";
        workoutMeta.textContent = `${exerciseCount}${
          tr.workoutExerciseCountLabel || "種目"
        } · ${setCount}${tr.workoutSetCountLabel || "セット"}`;
        workoutHead.append(workoutKicker, workoutMeta);
        workoutPreview.appendChild(workoutHead);

        const workoutTitle = document.createElement("div");
        workoutTitle.className = "post-workout-preview-title";
        workoutTitle.textContent =
          topNames.slice(0, 2).join(" · ") || (tr.workoutLogTitle || "Workout log");
        if (topNames.length > 2) {
          const more = document.createElement("span");
          more.className = "post-workout-preview-title-more";
          more.textContent = `+${topNames.length - 2}`;
          workoutTitle.appendChild(more);
        }
        workoutPreview.appendChild(workoutTitle);

        const workoutStats = document.createElement("div");
        workoutStats.className = "post-workout-preview-stats";
        const statItems = [
          {
            value: `${exerciseCount}`,
            label: tr.workoutExerciseCountLabel || "種目",
          },
          {
            value: `${setCount}`,
            label: tr.workoutSetCountLabel || "セット",
          },
        ];
        if (topWeight > 0) {
          statItems.push({
            value: formatWeight(topWeight),
            label: tr.profileBestLift || "Best lift",
          });
        }
        statItems.forEach((item) => {
          const stat = document.createElement("div");
          stat.className = "post-workout-preview-stat";
          const value = document.createElement("span");
          value.className = "post-workout-preview-stat-value";
          value.textContent = item.value;
          const label = document.createElement("span");
          label.className = "post-workout-preview-stat-label";
          label.textContent = item.label;
          stat.append(value, label);
          workoutStats.appendChild(stat);
        });
        workoutPreview.appendChild(workoutStats);
        body.appendChild(workoutPreview);
      }

      if (captionBlock) {
        body.appendChild(captionBlock);
      }

      if (contextChips.childNodes.length) {
        body.appendChild(contextChips);
      }

      if (body.childNodes.length) {
        card.appendChild(body);
      }

      if (primaryActions.childNodes.length) {
        footer.appendChild(primaryActions);
      }
      if (footer.childNodes.length) {
        card.appendChild(footer);
      }

      observeSeenPostCard(card, isSeen);
      return card;
    };

    let index = canAppend ? existingCount : 0;
    let renderedAdCount = existingAdCount;
    const viewportWidth =
      typeof window === "undefined" ? 1024 : window.innerWidth || 1024;
    const compactViewport = viewportWidth <= 700;
    let batchSize = getAdaptiveFeedChunkSize(effectiveLayout, compactViewport);
    const scheduleNextChunk = (callback) => {
      if (typeof window === "undefined") {
        setTimeout(callback, 0);
        return;
      }
      if (
        compactViewport &&
        typeof window.requestIdleCallback === "function"
      ) {
        window.requestIdleCallback(
          () => {
            if (renderToken !== feedRenderToken) return;
            callback();
          },
          { timeout: 42 }
        );
        return;
      }
      requestAnimationFrame(callback);
    };
    const finalizeMore = () => {
      feedChunkRendering = false;
      clearFeedMoreLoadingState();
      if (moreWrap && moreBtn && moreHint) {
        const remaining = Math.max(0, gridCandidates.length - visibleSlice.length);
        const hasMore = remaining > 0;
        moreWrap.classList.toggle("hidden", !hasMore);
        const baseHint = hasMore
          ? (tr.feedMoreHint || "あと{count}件").replace("{count}", remaining)
          : "";
        if (hasMore && autoLoadMoreEnabled) {
          const autoHint = tr.feedAutoLoadHint || "スクロールで自動読み込み";
          moreHint.textContent = `${baseHint} · ${autoHint}`;
        } else {
          moreHint.textContent = baseHint;
        }
        moreBtn.textContent = isShortsMode
          ? tr.feedMoreShorts || "次のショート"
          : tr.feedMore || "もっと見る";
        if (!moreBtn.dataset.bound) {
          moreBtn.dataset.bound = "true";
          moreBtn.addEventListener("click", (event) => {
            if (feedMoreLoading) return;
            const triggeredByUser = !!event?.isTrusted;
            feedMoreLastTrigger = triggeredByUser ? "manual" : "auto";
            captureFeedMoreAnchor(moreWrap);
            feedMoreLoading = true;
            moreBtn.classList.add("is-loading");
            moreBtn.disabled = true;
            moreBtn.textContent = tr.feedMoreLoading || tr.loading || "読み込み中...";
            moreWrap.classList.add("is-loading");
            const ghostCount = isCompactViewport() ? 1 : 2;
            appendFeedMoreGhostCards(container, ghostCount);
            feedVisibleCount += feedPageSize;
            renderFeed({ appendOnly: true });
          });
        }
        observeFeedMoreButton(moreBtn, hasMore && autoLoadMoreEnabled);
        if (hasMore) {
          if (moreWrap.parentElement !== container) {
            container.appendChild(moreWrap);
          }
          if (appendOnly) {
            const restoreBehavior =
              feedMoreLastTrigger === "manual" ? "smooth" : "auto";
            restoreFeedMoreAnchor(moreWrap, restoreBehavior);
            feedMoreLastTrigger = "manual";
          }
        } else if (moreWrap.parentElement === container) {
          moreWrap.remove();
          feedMoreAnchorTop = null;
          feedMoreAnchorScrollY = null;
        }
      }
      renderFeedPerfPanel({
        durationMs: perfNow() - renderStartedAt,
        totalCount: gridCandidates.length,
        visibleCount: visibleSlice.length,
        mode: renderMode,
        queryCacheHit,
        pageSize: feedPageSize,
        detachedCount: feedWindowedCards.size,
      });
      const shouldWindow =
        isFeedWindowingAllowed() &&
        !isShortsMode &&
        effectiveLayout === "list" &&
        visibleSlice.length >= getFeedWindowMinItems();
      syncFeedWindowing(shouldWindow);
      if (isShortsMode) {
        refreshActiveShortsCard(container);
        syncAllShortsCards(container);
      }
    };

    if (canPatchCards) {
      let patchIndex = 0;
      for (; patchIndex < visibleSlice.length; patchIndex += 1) {
        const post = visibleSlice[patchIndex];
        const existingCard = existingPostCards[patchIndex];
        if (!existingCard) {
          container.appendChild(createPostCard(post, patchIndex));
          continue;
        }
        const nextRenderKey = buildPostRenderKey(post);
        if (existingCard.dataset.postRenderKey !== nextRenderKey) {
          const nextCard = createPostCard(post, patchIndex);
          container.replaceChild(nextCard, existingCard);
        } else {
          const isSeen = seenPostIds.has(`${post.id || ""}`);
          existingCard.classList.toggle("post-card-seen", isSeen);
          observeSeenPostCard(existingCard, isSeen);
        }
      }
      finalizeMore();
      return;
    }

    const renderChunk = () => {
      if (renderToken !== feedRenderToken) return;
      const chunkStartedAt = perfNow();
      const startIndex = index;
      const fragment = document.createDocumentFragment();
      const appendedShortsCards = [];
      const end = Math.min(index + batchSize, visibleSlice.length);
      const cardBuilder = isShortsMode ? createShortsCard : createPostCard;
      for (; index < end; index += 1) {
        if (
          !isShortsMode &&
          shouldInsertFeedAdBeforePost({
            postIndex: index,
            insertedCount: renderedAdCount,
            visibleCount: visibleSlice.length,
            settings: adsSettings,
            enabled: feedAdsEnabled,
          })
        ) {
          fragment.appendChild(createFeedAdCard(adsSettings, tr));
          renderedAdCount += 1;
        }
        const nextCard = cardBuilder(visibleSlice[index], index);
        fragment.appendChild(nextCard);
        if (isShortsMode) {
          appendedShortsCards.push(nextCard);
        }
      }
      container.appendChild(fragment);
      if (isShortsMode) {
        appendedShortsCards.forEach((card) => observeShortsCard(card, container));
        refreshActiveShortsCard(container);
      }
      tuneAdaptiveFeedChunkSize(
        effectiveLayout,
        compactViewport,
        perfNow() - chunkStartedAt,
        end - startIndex
      );
      batchSize = getAdaptiveFeedChunkSize(effectiveLayout, compactViewport);
      if (index < visibleSlice.length) {
        scheduleNextChunk(renderChunk);
      } else {
        finalizeMore();
      }
    };

    feedChunkRendering = true;
    scheduleNextChunk(renderChunk);
    return;
  }

function renderFeedDiscoverySections(payload = {}) {
  const discoveryRoot = $("feed-discovery");
  const trendingWrap = $("feed-trending-tags");
  const topicFollowWrap = $("feed-follow-topic-tags");
  const followedTopicsWrap = $("feed-followed-topics");
  const suggestedWrap = $("feed-suggested-users");
  if (!discoveryRoot && !trendingWrap && !topicFollowWrap && !followedTopicsWrap && !suggestedWrap) return;

  const currentFilterValue = `${payload.currentFilter || ""}`;
  const discoveryExpanded = payload.discoveryExpanded !== false;
  const shouldShow = ["foryou", "all", "following"].includes(currentFilterValue);
  if (discoveryRoot) {
    discoveryRoot.classList.toggle("hidden", !shouldShow || !discoveryExpanded);
  }
  if (!shouldShow || !discoveryExpanded) {
    if (trendingWrap) trendingWrap.innerHTML = "";
    if (topicFollowWrap) topicFollowWrap.innerHTML = "";
    if (followedTopicsWrap) followedTopicsWrap.innerHTML = "";
    if (suggestedWrap) suggestedWrap.innerHTML = "";
    return;
  }

  const tr = payload.tr || t[getCurrentLang()] || t.ja;
  const allPosts = Array.isArray(payload.allPosts) ? payload.allPosts : [];
  const currentUser = payload.currentUser || null;
  const currentUserId = `${currentUser?.id || ""}`;
  const followingIds =
    payload.followingIds instanceof Set ? payload.followingIds : new Set();
  const hiddenPostIds =
    payload.hiddenPostIds instanceof Set ? payload.hiddenPostIds : new Set();
  const mutedUserIds =
    payload.mutedUserIds instanceof Set ? payload.mutedUserIds : new Set();
  const mutedTerms =
    payload.mutedTerms instanceof Set ? payload.mutedTerms : new Set();
  const followedTopics =
    payload.followedTopics instanceof Set ? payload.followedTopics : new Set();
  const canViewPost = (post) => {
    if (!post) return false;
    if (post.visibility === "private") {
      return !!currentUserId && `${post.user_id || ""}` === currentUserId;
    }
    return true;
  };
  const visiblePosts = allPosts.filter((post) => canViewPost(post));
  const discoveryPosts = visiblePosts.filter(
    (post) =>
      !hiddenPostIds.has(`${post?.id || ""}`) &&
      !mutedUserIds.has(`${post?.user_id || ""}`) &&
      !isPostMutedByTerms(post, mutedTerms, getWorkoutLogsByPost())
  );

  if (trendingWrap) {
    const tags = buildTrendingHashtags(discoveryPosts);
    trendingWrap.innerHTML = "";
    if (!tags.length) {
      const emptyChip = document.createElement("span");
      emptyChip.className = "chip chip-muted";
      emptyChip.textContent = tr.feedNoTrending || "まだタグがありません";
      trendingWrap.appendChild(emptyChip);
    } else {
      tags.forEach((tag) => {
        const chip = document.createElement("button");
        chip.className = "chip chip-trending";
        chip.setAttribute("data-trending-tag", tag);
        chip.textContent = `#${tag}`;
        const active =
          payload.searchValue &&
          (payload.searchValue.includes(`#${tag}`) ||
            payload.searchValue.includes(tag));
        chip.classList.toggle("chip-active", !!active);
        trendingWrap.appendChild(chip);
      });
    }

    if (topicFollowWrap) {
      topicFollowWrap.innerHTML = "";
      const followTags = tags.slice(0, FEED_DISCOVERY_TAG_LIMIT);
      if (!followTags.length) {
        const emptyChip = document.createElement("span");
        emptyChip.className = "chip chip-muted";
        emptyChip.textContent = tr.feedNoTrending || "No trending tags yet";
        topicFollowWrap.appendChild(emptyChip);
      } else {
        followTags.forEach((tag) => {
          const normalized = normalizeTopicTerm(tag);
          const active = followedTopics.has(normalized);
          const chip = document.createElement("button");
          chip.className = "chip chip-topic-follow";
          chip.setAttribute("data-follow-topic", normalized);
          chip.textContent = active
            ? `${tr.feedTopicFollowing || "Following"} #${normalized}`
            : `${tr.feedTopicFollow || "Follow"} #${normalized}`;
          chip.classList.toggle("chip-active", active);
          chip.setAttribute("aria-pressed", active ? "true" : "false");
          topicFollowWrap.appendChild(chip);
        });
      }
    }
  } else if (topicFollowWrap) {
    topicFollowWrap.innerHTML = "";
  }

  if (followedTopicsWrap) {
    followedTopicsWrap.innerHTML = "";
    const followedList = Array.from(followedTopics).slice(0, 10);
    if (!followedList.length) {
      const emptyChip = document.createElement("span");
      emptyChip.className = "chip chip-muted";
      emptyChip.textContent =
        tr.feedNoFollowingTopics || "No followed topics yet";
      followedTopicsWrap.appendChild(emptyChip);
    } else {
      followedList.forEach((topic) => {
        const chip = document.createElement("button");
        chip.className = "chip chip-followed-topic";
        chip.setAttribute("data-followed-topic", topic);
        chip.textContent = `#${topic}`;
        const active =
          payload.searchValue &&
          (payload.searchValue.includes(`#${topic}`) ||
            payload.searchValue.includes(topic));
        chip.classList.toggle("chip-active", !!active);
        followedTopicsWrap.appendChild(chip);
      });
    }
  }

  if (suggestedWrap) {
    const suggestedUsers = buildSuggestedUsers(discoveryPosts, {
      currentUserId,
      followingIds,
    });
    suggestedWrap.innerHTML = "";
    if (!suggestedUsers.length) {
      const emptyChip = document.createElement("span");
      emptyChip.className = "chip chip-muted";
      emptyChip.textContent =
        tr.feedNoSuggestions || "おすすめユーザーはまだありません";
      suggestedWrap.appendChild(emptyChip);
      return;
    }
    suggestedUsers.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "feed-suggested-row";
      const profileBtn = document.createElement("button");
      profileBtn.className = "chip chip-suggest-profile";
      profileBtn.setAttribute("data-suggest-profile", entry.userId);
      const handle = formatHandle(entry.profile?.handle || "user");
      const displayName = entry.profile?.display_name || handle;
      profileBtn.textContent = `${displayName}`;
      row.appendChild(profileBtn);

      const followBtn = document.createElement("button");
      followBtn.className = "chip chip-suggest-follow";
      followBtn.setAttribute("data-suggest-follow", entry.userId);
      followBtn.setAttribute("data-user-id", entry.userId);
      followBtn.textContent = tr.follow || "Follow";
      row.appendChild(followBtn);
      suggestedWrap.appendChild(row);
    });
  }
}
function updateFeedStats(posts = []) {
  const statTodayEl = $("stat-today");
  const statStreakEl = $("stat-streak");
  const statTotalEl = $("stat-total");
  if (!statTodayEl && !statStreakEl && !statTotalEl) return;
  const dateKeys = new Set(
    posts.map((post) => toDateKey(post.date || post.created_at)).filter(Boolean)
  );
  const todayKey = toDateKey(new Date());
  const todayCount = todayKey
    ? posts.filter((post) => toDateKey(post.date || post.created_at) === todayKey)
        .length
    : 0;
  const streak = todayKey && dateKeys.has(todayKey) ? computeStreak(dateKeys) : 0;
  if (statTodayEl) statTodayEl.textContent = `${todayCount}`;
  if (statStreakEl) statStreakEl.textContent = `${streak}`;
  if (statTotalEl) statTotalEl.textContent = `${posts.length}`;
}
export function setupFollowButtons() {
      const feedList = $("#feed-list"); // 投稿一覧のコンテナIDに合わせて
      if (!feedList) return;
      if (feedList.dataset.followBound === "true") return;
      feedList.dataset.followBound = "true";

      feedList.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-follow");
        if (!btn) return;
        if (btn.classList.contains("is-loading")) return;

        const currentUser = getCurrentUser();
        if (!currentUser) {
          showToast("フォローするにはログインしてください。", "warning");
          return;
        }

        const targetUserId = btn.getAttribute("data-user-id");
        if (!targetUserId || targetUserId === currentUser.id) return;

        btn.classList.add("is-loading");
        btn.disabled = true;
        try {
          await toggleFollowForUser(targetUserId);
          refreshFeedFollowButtonsForUser(targetUserId);
          loadFollowStats()
            .then(() => {
              updateProfileSummary();
            })
            .catch((error) => {
              console.error("loadFollowStats after follow toggle failed", error);
            });
        } catch (error) {
          console.error("follow toggle failed", error);
        } finally {
          btn.classList.remove("is-loading");
          btn.disabled = false;
        }
      });
    }
export async function loadLikes(postIds, options = {}) {
      const likesByPost = getLikesByPost();
      const likedPostIds = getLikedPostIds();
      const append = !!options.append;
      if (!append) {
        likesByPost.clear();
        likedPostIds.clear();
        feedLikesLoadedPostIds.clear();
        setLikesEnabled(true);
      }
      if (!getLikesEnabled()) return;
      if (!supabase) return;
      const targetIds = Array.from(
        new Set(
          (Array.isArray(postIds) ? postIds : [])
            .map((id) => `${id || ""}`.trim())
            .filter(Boolean)
        )
      );
      if (!targetIds.length) return;
      const queryIds = append
        ? targetIds.filter((postId) => !feedLikesLoadedPostIds.has(postId))
        : targetIds;
      if (!queryIds.length) return;
      queryIds.forEach((postId) => {
        if (!likesByPost.has(postId)) {
          likesByPost.set(postId, 0);
        }
      });

      const { data, error } = await supabase
        .from("post_likes")
        .select("post_id, user_id")
        .in("post_id", queryIds);

      if (error) {
        console.error("loadLikes error:", error);
        if (!append) {
          setLikesEnabled(false);
          const localLikes = getLikedIds();
          localLikes.forEach((id) => likedPostIds.add(id));
        }
        return;
      }

      const currentUser = getCurrentUser();
      (data || []).forEach((like) => {
        likesByPost.set(like.post_id, (likesByPost.get(like.post_id) || 0) + 1);
        if (currentUser && like.user_id === currentUser.id) {
          likedPostIds.add(like.post_id);
        }
      });
      queryIds.forEach((postId) => feedLikesLoadedPostIds.add(postId));
      applyQueuedLikeState();
    }
function getLikeUiState(postId, localLikedIds = null) {
      const likesEnabled = getLikesEnabled();
      const likedPostIds = getLikedPostIds();
      const likesByPost = getLikesByPost();
      const fallbackLikedIds = Array.isArray(localLikedIds) ? localLikedIds : getLikedIds();
      const isLiked = likesEnabled ? likedPostIds.has(postId) : fallbackLikedIds.includes(postId);
      const likeCount = likesEnabled ? likesByPost.get(postId) || 0 : isLiked ? 1 : 0;
      return {
        isLiked,
        likeCount,
        isLoading: pendingLikePostIds.has(postId),
      };
    }
function setActionButtonContent(button, { kind = "", icon = "", label = "" } = {}) {
      if (!button) return;
      if (kind) {
        button.setAttribute("data-action-kind", kind);
      }
      const normalizedLabel = `${label || ""}`.trim();
      if (normalizedLabel) {
        button.setAttribute("data-action-label", normalizedLabel);
        button.setAttribute("aria-label", normalizedLabel);
        button.classList.remove("chip-icon-only");
      } else {
        button.removeAttribute("data-action-label");
        button.classList.add("chip-icon-only");
      }
      button.textContent = "";
      const iconEl = document.createElement("span");
      iconEl.className = "chip-icon";
      iconEl.textContent = icon;
      button.appendChild(iconEl);
      if (normalizedLabel) {
        const labelEl = document.createElement("span");
        labelEl.className = "chip-label";
        labelEl.textContent = normalizedLabel;
        button.appendChild(labelEl);
      }
    }
function applyLikeButtonState(likeBtn, state, tr) {
      if (!likeBtn || !state) return;
      likeBtn.classList.toggle("chip-like-on", state.isLiked);
      likeBtn.classList.toggle("is-loading", state.isLoading);
      likeBtn.disabled = !!state.isLoading;
      likeBtn.setAttribute("aria-pressed", state.isLiked ? "true" : "false");
      likeBtn.setAttribute("aria-busy", state.isLoading ? "true" : "false");
      const likeLabel = tr.like || "Like";
      if (likeBtn.classList.contains("chip-compact")) {
        const compactCount = Number.isFinite(Number(state.likeCount))
          ? Number(state.likeCount)
          : 0;
        const compactLabel = compactCount > 0 ? `${compactCount}` : "";
        setActionButtonContent(likeBtn, {
          kind: "like",
          icon: state.isLiked ? "♥" : "♡",
          label: compactLabel,
        });
        likeBtn.setAttribute(
          "aria-label",
          compactCount > 0 ? `${likeLabel} (${compactCount})` : likeLabel
        );
        return;
      }
      setActionButtonContent(likeBtn, {
        kind: "like",
        icon: state.isLiked ? "♥" : "♡",
        label: `${likeLabel}${state.likeCount ? ` (${state.likeCount})` : ""}`,
      });
    }
function updateLikeButtonsForPost(postId) {
      if (!postId) return;
      const tr = t[getCurrentLang()] || t.ja;
      const likeState = getLikeUiState(postId);
      const cards = document.querySelectorAll(".post-card[data-post-id]");
      cards.forEach((card) => {
        if (card.getAttribute("data-post-id") !== postId) return;
        const likeBtn = card.querySelector(".chip-like");
        applyLikeButtonState(likeBtn, likeState, tr);
      });
    }
function refreshFeedFollowButtonsForUser(targetUserId) {
      const userId = `${targetUserId || ""}`.trim();
      if (!userId) return 0;
      const tr = t[getCurrentLang()] || t.ja;
      const followingIds = getFollowingIds();
      const isFollowing = followingIds.has(userId);
      let updatedCount = 0;
      const buttons = document.querySelectorAll(".btn-follow[data-user-id]");
      buttons.forEach((btn) => {
        if (`${btn.getAttribute("data-user-id") || ""}` !== userId) return;
        btn.textContent = isFollowing ? tr.unfollow || "Following" : tr.follow || "Follow";
        btn.classList.toggle("is-following", isFollowing);
        btn.setAttribute("aria-pressed", isFollowing ? "true" : "false");
        updatedCount += 1;
      });
      const suggestButtons = document.querySelectorAll(
        ".chip-suggest-follow[data-user-id]"
      );
      suggestButtons.forEach((btn) => {
        if (`${btn.getAttribute("data-user-id") || ""}` !== userId) return;
        if (isFollowing) {
          btn.textContent = tr.unfollow || "Following";
          btn.classList.add("is-following");
          btn.setAttribute("aria-pressed", "true");
        } else {
          btn.textContent = tr.follow || "Follow";
          btn.classList.remove("is-following");
          btn.setAttribute("aria-pressed", "false");
        }
        updatedCount += 1;
      });
      return updatedCount;
    }
function updateCommentButtonState(commentBtn, postId, tr, commentsByPost) {
      if (!commentBtn || !postId) return;
      const commentCount = commentsByPost.get(postId)?.length || 0;
      const commentsLabel = tr.comments || "Comments";
      const isCompact = commentBtn.classList.contains("chip-compact");
      const compactCount = Math.max(0, Number(commentCount || 0));
      const compactLabel = compactCount > 0 ? `${compactCount}` : "";
      const isOpen = isCommentSheetOpenForPost(postId);
      commentBtn.classList.toggle("chip-active", !!isOpen);
      if (commentCount) {
        setActionButtonContent(commentBtn, {
          kind: "comments",
          icon: isOpen ? "🗨" : "💬",
          label: isCompact
            ? compactLabel
            : `${commentsLabel} (${commentCount})`,
        });
        if (isCompact) {
          commentBtn.setAttribute("aria-label", `${commentsLabel} (${compactCount})`);
        }
      } else {
        setActionButtonContent(commentBtn, {
          kind: "comments",
          icon: isOpen ? "🗨" : "💬",
          label: isCompact ? compactLabel : commentsLabel,
        });
        if (isCompact) {
          commentBtn.setAttribute("aria-label", commentsLabel);
        }
      }
    }
function splitCaptionContent(fullText = "") {
      const normalizedText = `${fullText || ""}`.replace(/\r/g, "").trim();
      if (!normalizedText) {
        return { title: "", body: "" };
      }
      const lines = normalizedText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length >= 2) {
        const firstLine = lines[0];
        const rest = lines.slice(1).join("\n").trim();
        if (firstLine.length >= 8 && firstLine.length <= 72 && rest.length >= 18) {
          return { title: firstLine, body: rest };
        }
      }
      const sentenceMatch = normalizedText.match(/^(.{8,68}?[.!?。！？])\s+(.+)$/u);
      if (sentenceMatch) {
        return {
          title: sentenceMatch[1].trim(),
          body: sentenceMatch[2].trim(),
        };
      }
      return { title: "", body: normalizedText };
    }
function getCaptionPreviewText(fullText = "") {
      if (fullText.length <= FEED_CAPTION_TRIM_LIMIT) {
        return fullText;
      }
      return `${fullText.slice(0, FEED_CAPTION_TRIM_LIMIT)}…`;
    }
function createPostCaptionBlock(fullText = "", tr = t[getCurrentLang()] || t.ja) {
      const { title, body } = splitCaptionContent(fullText);
      const normalizedText = `${body || ""}`.trim();
      if (!normalizedText && !title) return null;
      const previewText = getCaptionPreviewText(normalizedText);
      const isExpandable = previewText !== normalizedText;

      const wrap = document.createElement("div");
      wrap.className = "post-caption-block";

      if (title) {
        const titleEl = document.createElement("div");
        titleEl.className = "post-caption-title";
        titleEl.textContent = title;
        wrap.appendChild(titleEl);
      }

      const caption = document.createElement("div");
      caption.className = "post-caption";
      caption.setAttribute("data-caption-text", "true");
      caption.setAttribute("data-caption-full", normalizedText);
      caption.setAttribute("data-caption-preview", previewText);
      if (normalizedText) {
        wrap.appendChild(caption);
      }

      const applyExpandedState = (expanded) => {
        wrap.classList.toggle("is-expanded", expanded);
        if (!normalizedText) return;
        caption.textContent = expanded ? normalizedText : previewText;
      };

      applyExpandedState(false);

      if (normalizedText && isExpandable) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "chip chip-caption-toggle";
        const syncToggle = (expanded) => {
          toggle.textContent = expanded
            ? tr.showLess || "Hide"
            : tr.showMore || "Show more";
          toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        };
        syncToggle(false);
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const nextExpanded = !wrap.classList.contains("is-expanded");
          applyExpandedState(nextExpanded);
          syncToggle(nextExpanded);
        });
        wrap.appendChild(toggle);
      }

      return wrap;
    }
function buildViewerCommentProfile(user) {
      if (!user) return null;
      const rawHandle =
        user.user_metadata?.handle ||
        (user.email ? user.email.split("@")[0] : "user");
      const handle = `${rawHandle || "user"}`.trim() || "user";
      const displayName =
        user.user_metadata?.display_name ||
        user.user_metadata?.name ||
        handle;
      return {
        handle,
        display_name: displayName,
        avatar_url:
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          "",
      };
    }
function normalizeCommentHandle(value) {
      return `${value || ""}`.replace(/^@/, "").trim().toLowerCase();
    }
function parseCommentReplyPrefix(body = "") {
      const rawBody = `${body || ""}`;
      const trimmedBody = rawBody.trim();
      const replyMatch = trimmedBody.match(/^(@[\w.-]+)\s+([\s\S]+)$/);
      if (!replyMatch) return null;
      return {
        handle: replyMatch[1],
        normalizedHandle: normalizeCommentHandle(replyMatch[1]),
        bodyWithoutPrefix: replyMatch[2],
      };
    }
function buildCommentReplyLookup(comments = []) {
      const replyLookup = new Map();
      const latestCommentByHandle = new Map();
      comments.forEach((comment) => {
        if (!comment) return;
        const replyPrefix = parseCommentReplyPrefix(comment.body || "");
        if (replyPrefix) {
          const parentComment =
            latestCommentByHandle.get(replyPrefix.normalizedHandle) || null;
          const parentHandle = parentComment
            ? formatHandle(
                parentComment.profile?.handle ||
                  parentComment.profile?.username ||
                  "user"
              ) || replyPrefix.handle
            : replyPrefix.handle;
          const parentDisplayName = parentComment
            ? `${parentComment.profile?.display_name || ""}`.trim() || parentHandle
            : parentHandle;
          replyLookup.set(`${comment.id || ""}`, {
            ...replyPrefix,
            parentId: `${parentComment?.id || ""}`,
            parentDisplayName,
          });
        }
        const authorHandle =
          formatHandle(
            comment.profile?.handle ||
              comment.profile?.username ||
              "user"
          ) || "@user";
        latestCommentByHandle.set(normalizeCommentHandle(authorHandle), comment);
      });
      return replyLookup;
    }
function buildCommentReplyTree(comments = []) {
      const replyLookup = buildCommentReplyLookup(comments);
      const byId = new Map();
      const childrenByParentId = new Map();
      const roots = [];
      comments.forEach((comment) => {
        byId.set(`${comment?.id || ""}`, comment);
      });
      comments.forEach((comment) => {
        const commentId = `${comment?.id || ""}`;
        const replyMeta = replyLookup.get(commentId);
        const parentId =
          replyMeta?.parentId && byId.has(replyMeta.parentId)
            ? replyMeta.parentId
            : "";
        if (parentId) {
          const siblings = childrenByParentId.get(parentId) || [];
          siblings.push(comment);
          childrenByParentId.set(parentId, siblings);
        } else {
          roots.push(comment);
        }
      });
      return { replyLookup, childrenByParentId, roots };
    }
function resolveCommentFocusId(comments = [], request = null) {
      if (!request || !Array.isArray(comments) || !comments.length) return "";
      const explicitCommentId = `${request.commentId || ""}`.trim();
      if (explicitCommentId) {
        const directMatch = comments.find(
          (comment) => `${comment?.id || ""}`.trim() === explicitCommentId
        );
        if (directMatch) {
          return explicitCommentId;
        }
      }
      const actorId = `${request.actorId || ""}`.trim();
      if (!actorId) return "";
      const actorComments = comments.filter(
        (comment) => `${comment?.user_id || ""}`.trim() === actorId
      );
      if (!actorComments.length) return "";
      const targetTime = Date.parse(request.createdAt || "");
      if (!Number.isFinite(targetTime)) {
        return `${actorComments[actorComments.length - 1]?.id || ""}`.trim();
      }
      let bestComment = actorComments[0] || null;
      let bestDistance = Number.POSITIVE_INFINITY;
      actorComments.forEach((comment) => {
        const nextTime = Date.parse(comment?.created_at || "");
        const nextDistance = Number.isFinite(nextTime)
          ? Math.abs(nextTime - targetTime)
          : Number.POSITIVE_INFINITY;
        if (nextDistance < bestDistance) {
          bestDistance = nextDistance;
          bestComment = comment;
          return;
        }
        if (
          nextDistance === bestDistance &&
          `${comment?.created_at || ""}`.localeCompare(
            `${bestComment?.created_at || ""}`
          ) > 0
        ) {
          bestComment = comment;
        }
      });
      return `${bestComment?.id || ""}`.trim();
    }
function resolveCommentByRequest(comments = [], request = null) {
      const targetId = resolveCommentFocusId(comments, request);
      if (!targetId) return null;
      return (
        comments.find((comment) => `${comment?.id || ""}`.trim() === targetId) || null
      );
    }
function doesCommentThreadContain(childrenByParentId, rootId, targetId) {
      if (!rootId || !targetId) return false;
      const queue = [...(childrenByParentId.get(rootId) || [])];
      while (queue.length) {
        const next = queue.shift();
        const nextId = `${next?.id || ""}`;
        if (nextId === targetId) return true;
        queue.push(...(childrenByParentId.get(nextId) || []));
      }
      return false;
    }
function jumpToRenderedComment(commentId, options = {}) {
      const normalizedCommentId = `${commentId || ""}`.trim();
      if (!normalizedCommentId || typeof document === "undefined") return;
      const selector = `.comment-item[data-comment-id="${normalizedCommentId}"]`;
      const preferredSurface = `${options.surface || ""}`.trim();
      const target =
        (preferredSurface === "sheet"
          ? getCommentSheetBody()?.querySelector?.(selector)
          : null) ||
        (preferredSurface === "detail"
          ? $("detail-comments")?.querySelector?.(selector)
          : null) ||
        getCommentSheetBody()?.querySelector?.(selector) ||
        $("detail-comments")?.querySelector?.(selector) ||
        document.querySelector(selector);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("is-highlighted");
      window.setTimeout(() => {
        target.classList.remove("is-highlighted");
      }, 1400);
    }
function buildCommentThreadList(post, comments, tr, options = {}) {
      const list = document.createElement("div");
      list.className = "comment-list";
      const { replyLookup, childrenByParentId, roots } = buildCommentReplyTree(comments);
      const replyTargetId = `${getCommentReplyTarget(post?.id)?.commentId || ""}`;
      const focusCommentId = `${options.focusCommentId || ""}`.trim();

      const renderNode = (comment) => {
        const fragment = document.createDocumentFragment();
        const commentId = `${comment?.id || ""}`;
        const children = childrenByParentId.get(commentId) || [];
        const item = buildCommentItemElement(comment, tr, {
          onReply: () => setCommentReplyTarget(post.id, comment),
          onJumpToParent: jumpToRenderedComment,
          replyMeta: replyLookup.get(commentId) || null,
        });
        if (item) {
          fragment.appendChild(item);
        }
        if (!children.length) return fragment;

        const thread = document.createElement("div");
        thread.className = "comment-thread";
        const shouldAutoExpand =
          children.length <= 1 ||
          replyTargetId === commentId ||
          focusCommentId === commentId ||
          doesCommentThreadContain(childrenByParentId, commentId, focusCommentId) ||
          doesCommentThreadContain(childrenByParentId, commentId, replyTargetId);
        const expanded = shouldAutoExpand || isCommentThreadExpanded(post.id, commentId);
        if (children.length > 1) {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "comment-thread-toggle";
          toggle.textContent = expanded
            ? tr.commentHideReplies || "Hide replies"
            : (tr.commentViewReplies || "View {count} replies").replace(
                "{count}",
                `${children.length}`
              );
          toggle.addEventListener("click", () => {
            setCommentThreadExpanded(post.id, commentId, !expanded);
          });
          thread.appendChild(toggle);
        }
        const replies = document.createElement("div");
        replies.className = "comment-thread-replies";
        if (!expanded) {
          replies.hidden = true;
        }
        children.forEach((child) => {
          replies.appendChild(renderNode(child));
        });
        thread.appendChild(replies);
        fragment.appendChild(thread);
        return fragment;
      };

      roots.forEach((comment) => {
        list.appendChild(renderNode(comment));
      });
      return list;
    }
function buildCommentItemElement(comment, tr, options = {}) {
      const { onReply = null, onJumpToParent = null, replyMeta = null } = options;
      if (!comment) return null;
      const item = document.createElement("div");
      item.className = "comment-item";
      item.dataset.commentId = `${comment.id || ""}`;
      if (comment.pending) {
        item.classList.add("is-pending");
      }
      if (replyMeta) {
        item.classList.add("is-reply");
      }

      const avatarEl = document.createElement("div");
      avatarEl.className = "avatar";
      const rawHandle =
        comment.profile?.handle ||
        comment.profile?.username ||
        "user";
      const handleText = formatHandle(rawHandle) || "@user";
      const displayName =
        `${comment.profile?.display_name || ""}`.trim() || handleText;
      const initial = (displayName || handleText || "U")
        .replace("@", "")
        .charAt(0)
        .toUpperCase();
      renderAvatar(avatarEl, comment.profile, initial);

      const content = document.createElement("div");
      content.className = "comment-content";

      const bubble = document.createElement("div");
      bubble.className = "comment-bubble";

      const header = document.createElement("div");
      header.className = "comment-header";

      const author = document.createElement("span");
      author.className = "comment-author";
      author.textContent = displayName;
      header.appendChild(author);

      if (displayName !== handleText) {
        const handle = document.createElement("span");
        handle.className = "comment-handle";
        handle.textContent = handleText;
        header.appendChild(handle);
      }

      const time = document.createElement("span");
      time.className = "comment-time";
      time.textContent = comment.pending
        ? tr.commentPending || "送信待ち"
        : comment.created_at
          ? formatDateDisplay(comment.created_at)
          : "";
      if (time.textContent) {
        header.appendChild(time);
      }

      const text = document.createElement("div");
      text.className = "comment-text";
      const rawBody = `${comment.body || ""}`;
      const parsedReply = replyMeta || parseCommentReplyPrefix(rawBody);
      if (parsedReply && parsedReply.parentDisplayName) {
        const replyContext = document.createElement(
          parsedReply.parentId && typeof onJumpToParent === "function"
            ? "button"
            : "div"
        );
        if (replyContext instanceof HTMLButtonElement) {
          replyContext.type = "button";
          replyContext.addEventListener("click", () => {
            onJumpToParent(parsedReply.parentId);
          });
        }
        replyContext.className = "comment-reply-context";
        replyContext.textContent = `${
          tr.commentReplyingTo || "Replying to"
        } ${parsedReply.parentDisplayName}`;
        bubble.appendChild(replyContext);
      }
      if (parsedReply) {
        const mention = document.createElement("span");
        mention.className = "comment-text-mention";
        mention.textContent = `${parsedReply.handle} `;
        const replyRest = document.createElement("span");
        replyRest.textContent = parsedReply.bodyWithoutPrefix;
        text.append(mention, replyRest);
      } else {
        text.textContent = rawBody;
      }

      bubble.appendChild(header);
      bubble.appendChild(text);
      content.appendChild(bubble);
      if (typeof onReply === "function") {
        const actions = document.createElement("div");
        actions.className = "comment-actions";
        const replyBtn = document.createElement("button");
        replyBtn.type = "button";
        replyBtn.className = "chip chip-ghost chip-comment-reply";
        replyBtn.textContent = tr.commentReply || "Reply";
        replyBtn.addEventListener("click", () => {
          onReply(comment);
        });
        actions.appendChild(replyBtn);
        content.appendChild(actions);
      }
      item.appendChild(avatarEl);
      item.appendChild(content);
      return item;
    }
function getCommentSheetSubtitle(post, tr) {
      if (!post) return tr.comments || "Comments";
      const rawHandle =
        post.profile?.handle ||
        post.profile?.username ||
        "user";
      const handleText = formatHandle(rawHandle) || "@user";
      const workoutLogCount = (getWorkoutLogsByPost().get(post.id) || []).length;
      if (isShortsStylePost(post)) {
        return `${handleText} · ${tr.mediaVideoLabel || "VIDEO"}`;
      }
      if (post.media_url && post.media_type === "video") {
        return `${handleText} · ${tr.mediaVideoLabel || "VIDEO"}`;
      }
      if (post.media_url) {
        return `${handleText} · ${tr.mediaPhotoLabel || "PHOTO"}`;
      }
      if (workoutLogCount > 0) {
        return `${handleText} · ${tr.workoutLogTitle || "Workout log"}`;
      }
      return handleText;
    }
function getCommentSheetPreviewFallback(post, tr) {
      if (!post) return tr.comments || "Comments";
      if (post.media_type === "video") {
        return tr.mediaVideoLabel || "VIDEO";
      }
      if (post.media_url) {
        return tr.mediaPhotoLabel || "PHOTO";
      }
      const workoutLogCount = (getWorkoutLogsByPost().get(post.id) || []).length;
      if (workoutLogCount > 0) {
        return tr.workoutLogTitle || "Workout log";
      }
      return tr.comments || "Comments";
    }
function getCommentQuickReplySuggestions(post) {
      const isJapanese = getCurrentLang() !== "en";
      if (post?.media_type === "video") {
        return isJapanese
          ? ["フォームいい", "強い", "🔥"]
          : ["Great form", "Strong", "🔥"];
      }
      if (post?.media_url) {
        return isJapanese
          ? ["仕上がってる", "ナイス", "👏"]
          : ["Looking sharp", "Nice", "👏"];
      }
      const workoutLogCount = (getWorkoutLogsByPost().get(post?.id) || []).length;
      if (workoutLogCount > 0) {
        return isJapanese
          ? ["重量やばい", "ナイスセット", "💪"]
          : ["Big lift", "Nice set", "💪"];
      }
      return isJapanese ? ["いいね", "すごい", "🔥"] : ["Nice", "So good", "🔥"];
    }
function buildCommentSheetContext(post, tr, options = {}) {
      if (!post) return null;
      const { commentCount = 0, comments = [] } = options;
      const rawHandle =
        post.profile?.handle ||
        post.profile?.username ||
        "user";
      const handleText = formatHandle(rawHandle) || "@user";
      const displayName =
        `${post.profile?.display_name || ""}`.trim() || handleText;
      const captionText = `${post.note || post.caption || ""}`.trim();
      const snippet = captionText
        ? getCaptionPreviewText(captionText)
        : getCommentSheetPreviewFallback(post, tr);
      const likeState = getLikeUiState(post.id);
      const dateText = formatDateDisplay(post.date || post.created_at || "");

      const wrap = document.createElement("div");
      wrap.className = "comment-sheet-context";

      const avatarEl = document.createElement("div");
      avatarEl.className = "avatar comment-sheet-context-avatar";
      const initial = (displayName || handleText || "U")
        .replace("@", "")
        .charAt(0)
        .toUpperCase();
      renderAvatar(avatarEl, post.profile, initial);
      wrap.appendChild(avatarEl);

      const body = document.createElement("div");
      body.className = "comment-sheet-context-body";
      const authorRow = document.createElement("div");
      authorRow.className = "comment-sheet-context-author";
      const nameEl = document.createElement("span");
      nameEl.className = "comment-sheet-context-name";
      nameEl.textContent = displayName;
      authorRow.appendChild(nameEl);
      if (displayName !== handleText) {
        const handleEl = document.createElement("span");
        handleEl.className = "comment-sheet-context-handle";
        handleEl.textContent = handleText;
        authorRow.appendChild(handleEl);
      }
      const metaChipRow = document.createElement("div");
      metaChipRow.className = "comment-sheet-context-meta";
      const timeChip = document.createElement("span");
      timeChip.className = "comment-sheet-context-chip";
      timeChip.textContent = dateText;
      metaChipRow.appendChild(timeChip);
      const commentChip = document.createElement("span");
      commentChip.className = "comment-sheet-context-chip";
      commentChip.textContent = `${commentCount} ${tr.comments || "Comments"}`;
      metaChipRow.appendChild(commentChip);
      if (Number(likeState?.likeCount || 0) > 0) {
        const likeChip = document.createElement("span");
        likeChip.className = "comment-sheet-context-chip";
        likeChip.textContent = `${likeState.likeCount} ${tr.like || "Like"}`;
        metaChipRow.appendChild(likeChip);
      }
      body.appendChild(authorRow);
      body.appendChild(metaChipRow);
      if (comments.length) {
        const recentProfiles = [];
        const seenUserIds = new Set();
        [...comments]
          .reverse()
          .forEach((comment) => {
            const userId = `${comment?.user_id || ""}`;
            if (!userId || seenUserIds.has(userId)) return;
            seenUserIds.add(userId);
            recentProfiles.push(comment.profile || { id: userId });
          });
        const visibleProfiles = recentProfiles.slice(0, 3);
        if (visibleProfiles.length) {
          const socialRow = document.createElement("div");
          socialRow.className = "comment-sheet-context-social";
          const stack = document.createElement("div");
          stack.className = "comment-sheet-context-stack";
          visibleProfiles.forEach((profile, index) => {
            const chipAvatar = document.createElement("div");
            chipAvatar.className = "avatar comment-sheet-context-stack-avatar";
            const stackHandle =
              profile?.handle ||
              profile?.username ||
              displayName ||
              "U";
            const stackLabel =
              `${profile?.display_name || ""}`.trim() ||
              formatHandle(stackHandle) ||
              displayName;
            renderAvatar(
              chipAvatar,
              profile,
              (stackLabel || "U").replace("@", "").charAt(0).toUpperCase()
            );
            chipAvatar.style.zIndex = `${visibleProfiles.length - index}`;
            stack.appendChild(chipAvatar);
          });
          socialRow.appendChild(stack);
          const socialText = document.createElement("div");
          socialText.className = "comment-sheet-context-social-text";
          socialText.textContent =
            commentCount > 1
              ? `${commentCount} ${tr.comments || "Comments"}`
              : `1 ${tr.comments || "Comments"}`;
          socialRow.appendChild(socialText);
          body.appendChild(socialRow);
        }
      }
      if (snippet) {
        const captionEl = document.createElement("div");
        captionEl.className = "comment-sheet-context-caption";
        captionEl.textContent = snippet;
        body.appendChild(captionEl);
      } else {
        const emptyEl = document.createElement("div");
        emptyEl.className = "comment-sheet-context-caption is-empty";
        emptyEl.textContent = getCommentSheetPreviewFallback(post, tr);
        body.appendChild(emptyEl);
      }
      wrap.appendChild(body);
      if (post.media_url) {
        const mediaEl = document.createElement("div");
        mediaEl.className = `comment-sheet-context-media${
          post.media_type === "video" ? " is-video" : ""
        }`;
        if (post.media_type === "video") {
          const videoBadge = document.createElement("span");
          videoBadge.className = "comment-sheet-context-media-badge";
          videoBadge.textContent = tr.mediaVideoLabel || "VIDEO";
          mediaEl.appendChild(videoBadge);
        } else {
          const image = document.createElement("img");
          const delivery = getFeedImageDelivery(post.media_url, {
            layout: "list",
            shorts: false,
          });
          image.src = delivery.src;
          if (delivery.srcSet) {
            image.srcset = delivery.srcSet;
          }
          if (delivery.sizes) {
            image.sizes = delivery.sizes;
          }
          image.alt = `${displayName}`;
          image.loading = "eager";
          image.decoding = "async";
          image.referrerPolicy = "no-referrer";
          mediaEl.appendChild(image);
        }
        wrap.appendChild(mediaEl);
      }
      return wrap;
    }
function buildShortsCommentTeaser(post, tr, commentsByPost) {
      if (!post) return null;
      const comments = commentsByPost.get(post.id) || [];
      const firstComment = comments[0] || null;
      const teaser = document.createElement("button");
      teaser.type = "button";
      teaser.className = "shorts-comment-teaser";
      teaser.dataset.postAction = "toggle-comments";
      teaser.setAttribute("aria-label", tr.commentsShow || tr.comments || "Comments");
      if (!comments.length) {
        teaser.classList.add("is-empty");
      }

      const teaserLabel = document.createElement("span");
      teaserLabel.className = "shorts-comment-teaser-label";
      teaserLabel.textContent = tr.comments || "Comments";

      const teaserText = document.createElement("span");
      teaserText.className = "shorts-comment-teaser-text";
      if (firstComment) {
        const rawHandle =
          firstComment.profile?.handle ||
          firstComment.profile?.username ||
          "user";
        const commentHandle = formatHandle(rawHandle) || "@user";
        const commentName =
          `${firstComment.profile?.display_name || ""}`.trim() || commentHandle;
        const commentPreview = getCaptionPreviewText(firstComment.body || "");
        teaserText.textContent = commentPreview
          ? `${commentName}: ${commentPreview}`
          : `${commentName}`;
      } else {
        teaserText.textContent =
          tr.commentEmpty || tr.commentPlaceholder || "Add a comment";
      }

      const teaserMeta = document.createElement("span");
      teaserMeta.className = "shorts-comment-teaser-meta";
      teaserMeta.textContent = comments.length
        ? `${comments.length}`
        : "→";

      teaser.append(teaserLabel, teaserText, teaserMeta);
      return teaser;
    }
function buildCommentComposer(post, tr, currentUser, options = {}) {
      if (!post || !currentUser) return null;
      const {
        compact = false,
        submitLabel,
        showQuickReplies = false,
        replyTarget = null,
        onClearReply = null,
      } = options;

      const form = document.createElement("div");
      form.className = compact
        ? "comment-form comment-form-inline"
        : "comment-form";
      if (!compact) {
        form.classList.add("comment-form-sheet");
      }
      if (replyTarget) {
        form.classList.add("has-reply-target");
      }

      const viewerProfile = buildViewerCommentProfile(currentUser);
      const avatar = document.createElement("div");
      avatar.className = "avatar comment-form-avatar";
      const viewerInitial = (
        viewerProfile?.display_name ||
        viewerProfile?.handle ||
        "U"
      )
        .replace("@", "")
        .charAt(0)
        .toUpperCase();
      renderAvatar(avatar, viewerProfile, viewerInitial);

      const body = document.createElement("div");
      body.className = "comment-form-body";
      if (replyTarget) {
        body.classList.add("has-reply-target");
      }

      const field = document.createElement(compact ? "input" : "textarea");
      field.className = compact
        ? "comment-form-input is-inline"
        : "comment-form-input";
      field.placeholder = tr.commentPlaceholder || "Add a comment";
      if (compact) {
        field.type = "text";
      }

      const main = document.createElement("div");
      main.className = "comment-form-main";

      const actions = document.createElement("div");
      actions.className = "comment-form-actions";

      const send = document.createElement("button");
      send.className = compact ? "btn btn-primary btn-xs" : "btn btn-primary";
      const sendLabel =
        submitLabel ||
        tr.commentAdd ||
        tr.commentSubmit ||
        "Post";
      send.textContent = sendLabel;
      send.setAttribute("aria-label", sendLabel);
      if (!compact) {
        send.classList.add("comment-submit-btn");
      }
      const syncSendState = () => {
        const hasValue = !!`${field.value || ""}`.trim();
        send.disabled = !hasValue || send.classList.contains("is-loading");
        send.classList.toggle("is-disabled", !hasValue);
      };
      send.addEventListener("click", async () => {
        if (!`${field.value || ""}`.trim()) return;
        if (send.classList.contains("is-loading")) return;
        send.classList.add("is-loading");
        syncSendState();
        try {
          await submitComment(post, field, {
            replyTarget,
          });
          if (!`${field.value || ""}`.trim() && typeof onClearReply === "function") {
            onClearReply();
          }
        } finally {
          send.classList.remove("is-loading");
          syncSendState();
        }
      });
      field.addEventListener("input", syncSendState);

      field.addEventListener("keydown", (event) => {
        if (event.isComposing) return;
        const isSubmitShortcut = compact
          ? event.key === "Enter"
          : (event.metaKey || event.ctrlKey) && event.key === "Enter";
        if (!isSubmitShortcut) return;
        event.preventDefault();
        send.click();
      });

      actions.appendChild(send);
      if (replyTarget) {
        const replyBar = document.createElement("div");
        replyBar.className = "comment-reply-bar";
        const replyCopy = document.createElement("div");
        replyCopy.className = "comment-reply-copy";
        const replyLabel = document.createElement("div");
        replyLabel.className = "comment-reply-label";
        replyLabel.textContent = tr.commentReplyingTo || "Replying to";
        const replyValue = document.createElement("div");
        replyValue.className = "comment-reply-value";
        replyValue.textContent = `${replyTarget.displayName} · ${replyTarget.preview}`;
        replyCopy.append(replyLabel, replyValue);
        const replyCancel = document.createElement("button");
        replyCancel.type = "button";
        replyCancel.className = "chip chip-ghost chip-comment-reply-cancel";
        replyCancel.textContent = tr.commentReplyCancel || "Cancel";
        replyCancel.addEventListener("click", () => {
          onClearReply?.();
          field.focus();
        });
        replyBar.append(replyCopy, replyCancel);
        body.appendChild(replyBar);
      }
      if (showQuickReplies) {
        const quickReplies = getCommentQuickReplySuggestions(post).filter(Boolean).slice(0, 3);
        if (quickReplies.length) {
          const quickRow = document.createElement("div");
          quickRow.className = "comment-quick-replies";
          quickReplies.forEach((reply) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "chip chip-ghost chip-comment-quick";
            chip.textContent = reply;
            chip.addEventListener("click", () => {
              const current = `${field.value || ""}`.trim();
              field.value = current ? `${current} ${reply}` : reply;
              syncSendState();
              field.focus();
              if (typeof field.setSelectionRange === "function") {
                const end = field.value.length;
                field.setSelectionRange(end, end);
              }
            });
            quickRow.appendChild(chip);
          });
          body.appendChild(quickRow);
        }
      }
      main.appendChild(field);
      main.appendChild(actions);
      body.appendChild(main);
      form.appendChild(avatar);
      form.appendChild(body);
      syncSendState();
      if (replyTarget && commentReplyFocusRequests.has(`${post.id || ""}`)) {
        commentReplyFocusRequests.delete(`${post.id || ""}`);
        window.requestAnimationFrame(() => {
          field.focus();
          if (typeof field.setSelectionRange === "function") {
            const end = `${field.value || ""}`.length;
            field.setSelectionRange(end, end);
          }
        });
      }
      return form;
    }
function buildFeedCommentSection(
      post,
      tr,
      currentUser,
      commentsByPost,
      commentsLoading,
      commentsEnabled,
      options = {}
    ) {
      if (!post) return null;
      const { showQuickReplies = false, focusCommentId = "" } = options;
      const commentSection = document.createElement("div");
      commentSection.className = "comment-section";

      if (!commentsEnabled) {
        const unavailable = document.createElement("div");
        unavailable.className = "empty";
        unavailable.textContent =
          tr.commentUnavailable || "Comments are not available.";
        commentSection.appendChild(unavailable);
      } else if (commentsLoading.has(post.id)) {
        const loading = document.createElement("div");
        loading.className = "empty";
        loading.textContent = tr.commentLoading || "Loading...";
        commentSection.appendChild(loading);
      } else {
        const comments = commentsByPost.get(post.id) || [];
        if (!comments.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = tr.commentEmpty || "No comments yet.";
          commentSection.appendChild(empty);
        } else {
          const list = buildCommentThreadList(post, comments, tr, { focusCommentId });
          commentSection.appendChild(list);
        }
      }

      if (currentUser && commentsEnabled) {
        const form = buildCommentComposer(post, tr, currentUser, {
          submitLabel: tr.commentAdd || "Post",
          showQuickReplies,
          replyTarget: getCommentReplyTarget(post.id),
          onClearReply: () => clearCommentReplyTarget(post.id),
        });
        if (form) {
          commentSection.appendChild(form);
        }
      }

      return commentSection;
    }
export function refreshFeedPostComments(postId) {
      if (!postId) return false;
      const post = getPostById(postId);
      if (!post) {
        if (activeCommentPostId === `${postId}`) {
          closeCommentSheet();
        }
        return false;
      }

      const tr = t[getCurrentLang()] || t.ja;
      const commentsByPost = getCommentsByPost();
      const selector = `.post-card[data-post-id="${postId}"]`;
      const cards = document.querySelectorAll(selector);
      cards.forEach((card) => {
        const commentBtn = card.querySelector(
          "button[data-post-action=\"toggle-comments\"]"
        );
        updateCommentButtonState(commentBtn, postId, tr, commentsByPost);
      });
      if (activeCommentPostId === `${postId}`) {
        renderCommentSheetForPost(postId);
      }
      return cards.length > 0 || activeCommentPostId === `${postId}`;
    }
export function getLikedIds() {
      try {
        return JSON.parse(localStorage.getItem("trends_likes") || "[]");
      } catch {
        return [];
      }
    }
export function setLikedIds(ids) {
      localStorage.setItem("trends_likes", JSON.stringify(ids));
    }
export async function toggleLikeForPost(post) {
      if (!post?.id) return;
      if (pendingLikePostIds.has(post.id)) return;
      const currentUser = getCurrentUser();
      const likedPostIds = getLikedPostIds();
      const likesByPost = getLikesByPost();
      const likesEnabled = getLikesEnabled();
      const tr = t[getCurrentLang()] || t.ja;
      if (!currentUser) {
        showToast("ログインしてください。", "warning");
        return;
      }

      if (!likesEnabled) {
        const liked = getLikedIds();
        const idx = liked.indexOf(post.id);
        if (idx >= 0) {
          liked.splice(idx, 1);
        } else {
          liked.push(post.id);
        }
        setLikedIds(liked);
        updateLikeButtonsForPost(post.id);
        return;
      }

      const wasLiked = likedPostIds.has(post.id);
      const desiredLiked = !wasLiked;
      const previousCount = likesByPost.get(post.id) || 0;
      let shouldNotify = false;
      const queuedAction = {
        postId: post.id,
        userId: currentUser.id,
        desiredLiked,
        targetUserId: post.user_id || null,
        updatedAt: new Date().toISOString(),
      };

      pendingLikePostIds.add(post.id);
      if (wasLiked) {
        likedPostIds.delete(post.id);
        likesByPost.set(post.id, Math.max(0, previousCount - 1));
      } else {
        likedPostIds.add(post.id);
        likesByPost.set(post.id, previousCount + 1);
      }
      updateLikeButtonsForPost(post.id);

      if (!getOnlineState()) {
        upsertLikeOfflineQueueAction(queuedAction);
        showToast(
          tr.likeQueued ||
            "オフラインのため、いいねを保存しました。オンライン時に同期します。",
          "info"
        );
        pendingLikePostIds.delete(post.id);
        updateLikeButtonsForPost(post.id);
        return;
      }

      try {
        if (wasLiked) {
          const { error } = await supabase
            .from("post_likes")
            .delete()
            .eq("post_id", post.id)
            .eq("user_id", currentUser.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("post_likes")
            .insert({
              post_id: post.id,
              user_id: currentUser.id,
            });
          if (error && error.code !== "23505") throw error;
          shouldNotify =
            !error &&
            post.user_id &&
            currentUser.id &&
            post.user_id !== currentUser.id;
        }
      } catch (error) {
        console.error("like toggle error:", error);
        if (isLikelyTransientNetworkError(error)) {
          upsertLikeOfflineQueueAction(queuedAction);
          showToast(
            tr.likeQueued ||
              "オフラインのため、いいねを保存しました。オンライン時に同期します。",
            "info"
          );
          return;
        }
        if (wasLiked) {
          likedPostIds.add(post.id);
        } else {
          likedPostIds.delete(post.id);
        }
        likesByPost.set(post.id, previousCount);
        showToast(tr.likeUpdateFailed || "いいねの更新に失敗しました。", "warning");
      } finally {
        pendingLikePostIds.delete(post.id);
        updateLikeButtonsForPost(post.id);
      }

      if (shouldNotify) {
        createNotification({
          userId: post.user_id,
          actorId: currentUser.id,
          type: "like",
          postId: post.id,
        }).catch((error) => {
          console.error("like notification error:", error);
        });
      }
    }
function isPostDetailOpen(backdrop = null) {
      const target = backdrop || $("detail-modal-backdrop");
      if (!target) return false;
      return !target.classList.contains("hidden");
    }
function getDetailNavigablePosts() {
      const currentUserId = `${getCurrentUser()?.id || ""}`.trim();
      return (getAllPosts() || []).filter((post) => {
        if (!post) return false;
        if (post.visibility === "private") {
          return !!currentUserId && `${post.user_id || ""}` === currentUserId;
        }
        return true;
      });
    }
function openAdjacentPostDetail(step = 1) {
      if (!currentDetailPostId) return false;
      const posts = getDetailNavigablePosts();
      if (!posts.length) return false;
      const index = posts.findIndex(
        (post) => `${post?.id || ""}` === `${currentDetailPostId || ""}`
      );
      if (index < 0) return false;
      const nextIndex = index + (step > 0 ? 1 : -1);
      if (nextIndex < 0 || nextIndex >= posts.length) return false;
      const targetPostId = `${posts[nextIndex]?.id || ""}`.trim();
      if (!targetPostId) return false;
      openPostDetail(targetPostId);
      return true;
    }
export function setupPostDetailModal() {
      const feedList = $("feed-list");
      const publicList = $("public-profile-posts-list");
      const backdrop = $("detail-modal-backdrop");
      const closeBtn = $("btn-detail-close");

      const openFromCard = (event) => {
        const target = event.target;
        if (
          target.closest("button") ||
          target.closest("a") ||
          target.closest("input") ||
          target.closest("textarea") ||
          target.closest("select") ||
          target.closest(".post-media")
        ) {
          return;
        }
        const card = target.closest(".post-card");
        if (!card) return;
        const postId = card.getAttribute("data-post-id");
        if (postId) {
          openPostDetail(postId);
        }
      };

      if (feedList && feedList.dataset.bound !== "true") {
        feedList.dataset.bound = "true";
        feedList.addEventListener("click", openFromCard);
      }
      if (publicList && publicList.dataset.bound !== "true") {
        publicList.dataset.bound = "true";
        publicList.addEventListener("click", openFromCard);
      }
      if (closeBtn && closeBtn.dataset.bound !== "true") {
        closeBtn.dataset.bound = "true";
        closeBtn.addEventListener("click", () => {
          closePostDetail();
        });
      }
      if (backdrop && backdrop.dataset.bound !== "true") {
        backdrop.dataset.bound = "true";
        backdrop.addEventListener("click", (event) => {
          if (event.target === backdrop) {
            closePostDetail();
          }
        });
      }
      if (backdrop && backdrop.dataset.searchTagBound !== "true") {
        backdrop.dataset.searchTagBound = "true";
        backdrop.addEventListener("click", (event) => {
          const btn = event.target.closest("button[data-feed-search-tag]");
          if (!btn) return;
          const tag = normalizeTopicTerm(btn.getAttribute("data-feed-search-tag"));
          if (!tag) return;
          applyFeedSearchTerm(`#${tag}`);
          closePostDetail();
        });
      }
      if (!feedDetailKeyboardBound && typeof window !== "undefined") {
        feedDetailKeyboardBound = true;
        window.addEventListener("keydown", (event) => {
          if (event.defaultPrevented || event.isComposing) return;
          if (!isPostDetailOpen(backdrop)) return;
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          if (isEditableTarget(event.target)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            closePostDetail();
            return;
          }
          if (event.key === "ArrowRight") {
            if (openAdjacentPostDetail(1)) {
              event.preventDefault();
            }
            return;
          }
          if (event.key === "ArrowLeft") {
            if (openAdjacentPostDetail(-1)) {
              event.preventDefault();
            }
          }
        });
      }
    }
export function closePostDetail(options = {}) {
      const backdrop = $("detail-modal-backdrop");
      if (backdrop) {
        closeBackdrop(backdrop);
      }
      const previousPostId = currentDetailPostId;
      currentDetailPostId = null;
      detailCommentsFocusRequested = false;
      if (previousPostId) {
        clearCommentFocusRequest(previousPostId);
        clearCommentReplyRequest(previousPostId);
      }
      if (options.syncHash !== false) {
        clearPostHash(previousPostId);
      }
    }
export function openPostDetail(postId, options = {}) {
      const backdrop = $("detail-modal-backdrop");
      if (!backdrop) return;
      if (activeCommentPostId) {
        closeCommentSheet();
      }
      const normalizedPostId = `${postId || ""}`.trim();
      if (!normalizedPostId) return;
      const hasPost = (getAllPosts() || []).some(
        (item) => `${item?.id || ""}` === normalizedPostId
      );
      if (!hasPost) return;
      setCommentFocusRequest(normalizedPostId, {
        commentId: options.focusCommentId,
        actorId: options.focusCommentActorId,
        createdAt: options.focusCommentCreatedAt,
      });
      setCommentReplyRequest(normalizedPostId, {
        commentId: options.replyToCommentId,
        actorId: options.replyToCommentActorId,
        createdAt: options.replyToCommentCreatedAt,
      });
      detailCommentsFocusRequested = !!options.focusComments;
      currentDetailPostId = normalizedPostId;
      renderPostDetail();
      openBackdrop(backdrop);
      if (options.syncHash !== false) {
        setPostHash(normalizedPostId);
      }
      const commentsByPost = getCommentsByPost();
      const commentsEnabled = isCommentsEnabled();
      if (!commentsByPost.has(normalizedPostId) && commentsEnabled) {
        loadCommentsForPost(normalizedPostId).then(() => renderPostDetail());
      }
      if (detailCommentsFocusRequested && !getCommentFocusRequest(normalizedPostId)) {
        focusPostDetailComments();
      }
    }
export function renderPostDetail() {
      const postId = currentDetailPostId;
      if (!postId) return;
      const post = (getAllPosts() || []).find((item) => `${item.id}` === `${postId}`);
      if (!post) return;

      const currentLang = getCurrentLang();
      const currentUser = getCurrentUser();
      const workoutLogsByPost = getWorkoutLogsByPost();
      const commentsByPost = getCommentsByPost();
      const commentsLoading = getCommentsLoading();
      const commentsEnabled = isCommentsEnabled();
      const tr = t[currentLang] || t.ja;
      const headerEl = $("detail-header");
      const mediaEl = $("detail-media");
      const bodyEl = $("detail-body");
      const workoutEl = $("detail-workout");
      const commentsEl = $("detail-comments");
      const titleEl = $("detail-title");

      if (titleEl) {
        titleEl.textContent = tr.detailTitle || "投稿詳細";
      }

      if (headerEl) {
        headerEl.innerHTML = "";
        const avatar = document.createElement("div");
        avatar.className = "avatar";
        const displayName =
          post.profile?.display_name || post.profile?.handle || "user";
        const initial = displayName.charAt(0).toUpperCase();
        renderAvatar(avatar, post.profile, initial);

        const meta = document.createElement("div");
        meta.className = "detail-meta";
        const name = document.createElement("div");
        name.className = "detail-title";
        name.textContent = displayName;
        const sub = document.createElement("div");
        sub.className = "detail-sub";
        sub.textContent = `${formatDateDisplay(
          post.date || post.created_at || Date.now()
        )} · ${post.visibility === "private" ? (tr.privateOnly || "Private") : (tr.public || "Public")}`;
        meta.appendChild(name);
        meta.appendChild(sub);

        headerEl.appendChild(avatar);
        headerEl.appendChild(meta);
      }

      if (mediaEl) {
        mediaEl.innerHTML = "";
        if (post.media_url) {
          const wrap = document.createElement("div");
          wrap.className = "post-media";
          mountMediaSkeleton(wrap);
          const renderMediaFallback = () => {
            clearMediaSkeleton(wrap);
            wrap.classList.add("is-error");
            wrap.innerHTML = "";
            const fallback = document.createElement("div");
            fallback.className = "media-fallback";
            fallback.textContent = tr.mediaUnavailable || "Media unavailable";
            wrap.appendChild(fallback);
          };
          if (post.media_type === "video") {
            const video = document.createElement("video");
            video.controls = true;
            video.playsInline = true;
            video.preload = "metadata";
            video.addEventListener(
              "loadeddata",
              () => {
                clearMediaSkeleton(wrap);
              },
              { once: true }
            );
            video.addEventListener("error", renderMediaFallback, { once: true });
            video.src = post.media_url;
            wrap.appendChild(video);
          } else {
            const img = document.createElement("img");
            img.loading = "lazy";
            img.decoding = "async";
            img.referrerPolicy = "no-referrer";
            img.alt = "media";
            img.addEventListener(
              "load",
              () => {
                clearMediaSkeleton(wrap);
              },
              { once: true }
            );
            img.addEventListener("error", renderMediaFallback, { once: true });
            img.src = post.media_url;
            wrap.appendChild(img);
          }
          mediaEl.appendChild(wrap);
        }
      }

      if (bodyEl) {
        bodyEl.innerHTML = "";
        const body = document.createElement("div");
        body.className = "post-body";
        if (post.bodyweight !== null && post.bodyweight !== undefined && post.bodyweight !== "") {
          const weight = document.createElement("div");
          weight.className = "post-weight";
          weight.textContent = `${tr.weight || "Bodyweight"}: ${formatWeight(
            post.bodyweight
          )}`;
          body.appendChild(weight);
        }
        if (post.note || post.caption) {
          const caption = document.createElement("div");
          caption.className = "post-caption";
          const captionText = `${post.note || post.caption || ""}`.trim();
          caption.textContent = captionText;
          body.appendChild(caption);
          const captionTags = getCaptionHashtags(captionText, FEED_CAPTION_TAG_LIMIT);
          if (captionTags.length) {
            const tagRow = document.createElement("div");
            tagRow.className = "post-caption-tags";
            captionTags.forEach((tag) => {
              const chip = document.createElement("button");
              chip.type = "button";
              chip.className = "chip chip-caption-tag";
              chip.setAttribute("data-feed-search-tag", tag);
              chip.textContent = `#${tag}`;
              tagRow.appendChild(chip);
            });
            body.appendChild(tagRow);
          }
        }
        bodyEl.appendChild(body);
      }

      if (workoutEl) {
        workoutEl.innerHTML = "";
        const logs = workoutLogsByPost.get(post.id) || [];
        if (!logs.length) {
          const empty = document.createElement("div");
          empty.className = "detail-sub";
          empty.textContent = tr.workoutEmpty || "ワークアウトログなし";
          workoutEl.appendChild(empty);
        } else {
          logs.forEach((exercise) => {
            const item = document.createElement("div");
            item.className = "detail-workout-item";
            const title = document.createElement("strong");
            title.textContent = exercise.exercise || "Exercise";
            item.appendChild(title);
            const sets = document.createElement("div");
            sets.className = "detail-sub";
            sets.textContent = (exercise.sets || [])
              .map((set) => {
                const reps = set.reps ? `${set.reps} reps` : "";
                const weight = set.weight ? formatWeight(set.weight) : "";
                return [weight, reps].filter(Boolean).join(" ");
              })
              .join(" · ");
            item.appendChild(sets);
            workoutEl.appendChild(item);
          });
        }
      }

      if (commentsEl) {
        commentsEl.innerHTML = "";
        const comments = commentsByPost.get(post.id) || [];
        const focusRequest = getCommentFocusRequest(post.id);
        const focusCommentId = resolveCommentFocusId(comments, focusRequest);
        const replyRequest = getCommentReplyRequest(post.id);
        const replyComment = resolveCommentByRequest(comments, replyRequest);
        if (replyComment) {
          assignCommentReplyTarget(post.id, replyComment, {
            refresh: false,
            requestFocus: true,
          });
        }
        if (!comments.length && !commentsLoading.has(post.id)) {
          const empty = document.createElement("div");
          empty.className = "detail-sub";
          empty.textContent = tr.commentEmpty || "コメントはまだありません。";
          commentsEl.appendChild(empty);
        } else if (commentsLoading.has(post.id)) {
          const loading = document.createElement("div");
          loading.className = "detail-sub";
          loading.textContent = tr.loading || "読み込み中...";
          commentsEl.appendChild(loading);
        } else {
          commentsEl.appendChild(
            buildCommentThreadList(post, comments, tr, { focusCommentId })
          );
        }

        if (currentUser && commentsEnabled) {
          const inputWrap = buildCommentComposer(post, tr, currentUser, {
            compact: true,
            submitLabel: tr.commentSubmit || "送信",
            replyTarget: getCommentReplyTarget(post.id),
            onClearReply: () => clearCommentReplyTarget(post.id),
          });
          if (inputWrap) {
            inputWrap.classList.add("detail-comment-input");
            commentsEl.appendChild(inputWrap);
          }
        }
      }
      if (detailCommentsFocusRequested && `${currentDetailPostId || ""}` === `${post.id || ""}`) {
        const focusCommentId = resolveCommentFocusId(
          commentsByPost.get(post.id) || [],
          getCommentFocusRequest(post.id)
        );
        if (focusCommentId && typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            jumpToRenderedComment(focusCommentId, { surface: "detail" });
            clearCommentFocusRequest(post.id);
          });
          detailCommentsFocusRequested = false;
        } else {
          focusPostDetailComments();
        }
      }
    }
