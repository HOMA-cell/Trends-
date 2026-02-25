import { supabase } from "./supabaseClient.js";
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
const getCommentsExpanded = () => feedContext.getCommentsExpanded?.() || new Set();
const getCommentsLoading = () => feedContext.getCommentsLoading?.() || new Set();
const isCommentsEnabled = () => !!feedContext.isCommentsEnabled?.();
const loadCommentsForPost = (...args) => feedContext.loadCommentsForPost?.(...args);
const submitComment = (...args) => feedContext.submitComment?.(...args);
const toggleComments = (...args) => feedContext.toggleComments?.(...args);
const createNotification = (...args) => feedContext.createNotification?.(...args);
const deletePost = (...args) => feedContext.deletePost?.(...args);
const getProfile = (...args) => feedContext.getProfile?.(...args);
const getProfilesForUsers = (...args) =>
  feedContext.getProfilesForUsers?.(...args) || new Map();
const toggleFollowForUser = (...args) => feedContext.toggleFollowForUser?.(...args);
const loadFollowStats = (...args) => feedContext.loadFollowStats?.(...args);
const getFollowingIds = () => feedContext.getFollowingIds?.() || new Set();
const getLikedPostIds = () => feedContext.getLikedPostIds?.() || new Set();
const getLikesByPost = () => feedContext.getLikesByPost?.() || new Map();
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
const openPostModal = () => feedContext.openPostModal?.();

let currentFilter = "all";
let filterMedia = false;
let filterWorkout = false;
let sortOrder = "newest";
let feedLayout = "list";
let isFeedLoading = false;
let feedError = "";
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
let feedMoreObserver = null;
let feedAutoLoadingMore = false;
let feedLastAutoLoadAt = 0;
let feedMoreLoading = false;
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
const postSearchHaystackCache = new Map();
let secondaryRenderScheduled = false;
const pendingLikePostIds = new Set();
let feedRenderScheduled = false;
let feedScheduledRenderToken = 0;
let feedSearchInputTimer = null;
let feedLastCommittedSearch = "";
let feedMoreAnchorTop = null;
let feedWindowUpdateRaf = 0;
let feedWindowListenersBound = false;
let feedChunkRendering = false;
const feedWindowedCards = new Map();
let feedKeyboardShortcutsBound = false;
let feedCardActionDelegationBound = false;
let feedPageSizeResizeBound = false;
let feedPageSizeResizeTimer = null;
const feedImageHydrationQueue = [];
let feedImageHydrationActive = 0;
const feedLikesLoadedPostIds = new Set();
const feedMetaQueuePostIds = new Set();
let feedMetaHydrationInFlight = false;
const warmedImageUrlSet = new Set();
const warmedImageUrlQueue = [];
const FEED_CACHE_KEY = "trends_feed_cache_v1";
const LIKES_OFFLINE_QUEUE_KEY = "trends_likes_offline_queue_v1";
const FEED_NETWORK_BACKOFF_KEY = "trends_feed_network_backoff_until_v1";
const PERF_DEBUG_KEY = "trends_perf_debug";
const MODAL_ANIM_MS = 200;
const FEED_PULL_THRESHOLD = 70;
const FEED_PULL_MAX = 128;
const FEED_PULL_COOLDOWN_MS = 1600;
const FEED_SEARCH_DEBOUNCE_MS = 220;
const FEED_WINDOW_MIN_ITEMS = 22;
const FEED_WINDOW_MARGIN_PX = 820;
const FEED_MEDIA_OBSERVER_MARGIN = "560px 0px";
const FEED_MEDIA_VIDEO_PARK_MARGIN_PX = 1500;
const FEED_IMAGE_HYDRATE_CONCURRENCY = 3;
const FEED_WARMED_IMAGE_LIMIT = 320;
const FEED_SEARCH_CACHE_LIMIT = 2400;
const FEED_META_BATCH_SIZE = 40;
const FEED_META_PRELOAD_MULTIPLIER = 5;
const FEED_NETWORK_BACKOFF_MS = 120000;
const FEED_DEMO_AUTO_RETRY_COOLDOWN_MS = 12000;
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
      while (
        feedImageHydrationActive < FEED_IMAGE_HYDRATE_CONCURRENCY &&
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
          rootMargin: FEED_MEDIA_OBSERVER_MARGIN,
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
    }
function getPostSearchHaystack(post, workoutLogsMap) {
      if (!post) return "";
      const logs = workoutLogsMap.get(post.id) || [];
      const cached = postSearchHaystackCache.get(post.id);
      if (cached && cached.postRef === post && cached.logsRef === logs) {
        return cached.haystack;
      }
      const logText = logs
        .map((exercise) => `${exercise.exercise || ""} ${exercise.note || ""}`)
        .join(" ");
      const haystack = [
        post.note,
        post.caption,
        post.bodyweight,
        post.profile?.handle,
        post.profile?.display_name,
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
      while (postSearchHaystackCache.size > FEED_SEARCH_CACHE_LIMIT) {
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
function saveFeedCache(posts = []) {
      try {
        const payload = {
          saved_at: Date.now(),
          posts: Array.isArray(posts) ? posts : [],
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
        return parsed.posts;
      } catch (error) {
        console.warn("loadFeedCache failed", error);
        return [];
      }
    }
function scheduleRenderFeed() {
      if (feedRenderScheduled) return;
      feedRenderScheduled = true;
      const token = ++feedScheduledRenderToken;
      const run = () => {
        if (token !== feedScheduledRenderToken) return;
        feedRenderScheduled = false;
        renderFeed();
      };
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
      if (feedLayout === "grid") {
        return compact ? 8 : 12;
      }
      return compact ? 6 : 8;
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
function getPostById(postId) {
      if (!postId) return null;
      const posts = getAllPosts();
      if (!Array.isArray(posts) || !posts.length) return null;
      return posts.find((post) => `${post?.id || ""}` === `${postId}`) || null;
    }
function getFeedMetadataPreloadCount() {
      return Math.max(24, feedPageSize * FEED_META_PRELOAD_MULTIPLIER);
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
          const batch = Array.from(feedMetaQueuePostIds).slice(0, FEED_META_BATCH_SIZE);
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
          toggleComments(postId);
          return;
        }
        const post = getPostById(postId);
        if (!post) return;
        if (action === "toggle-like") {
          await toggleLikeForPost(post);
          return;
        }
        if (action === "delete-post") {
          await deletePost(post.id);
        }
      });
    }
function captureFeedMoreAnchor(moreWrap) {
      if (!moreWrap || typeof window === "undefined") {
        feedMoreAnchorTop = null;
        return;
      }
      feedMoreAnchorTop = moreWrap.getBoundingClientRect().top;
    }
function restoreFeedMoreAnchor(moreWrap) {
      if (
        feedMoreAnchorTop === null ||
        !moreWrap ||
        typeof window === "undefined"
      ) {
        feedMoreAnchorTop = null;
        return;
      }
      const nextTop = moreWrap.getBoundingClientRect().top;
      const delta = nextTop - feedMoreAnchorTop;
      feedMoreAnchorTop = null;
      if (!Number.isFinite(delta) || Math.abs(delta) < 1) return;
      window.scrollBy({
        top: delta,
        left: 0,
        behavior: "auto",
      });
    }
function isNearFeedViewport(el) {
      if (!el || typeof window === "undefined") return true;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return (
        rect.bottom >= -FEED_WINDOW_MARGIN_PX &&
        rect.top <= vh + FEED_WINDOW_MARGIN_PX
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
      if (feedChunkRendering) {
        return;
      }
      if (feedLayout !== "list" || isFeedLoading) {
        restoreAllWindowedFeedCards(container);
        return;
      }
      const cards = container.querySelectorAll(".post-card[data-post-id]");
      const placeholders = container.querySelectorAll(
        ".feed-window-placeholder[data-post-id]"
      );
      if (cards.length + placeholders.length < FEED_WINDOW_MIN_ITEMS) {
        restoreAllWindowedFeedCards(container);
        return;
      }

      placeholders.forEach((placeholder) => {
        if (isNearFeedViewport(placeholder)) {
          restoreWindowedFeedCard(placeholder);
        }
      });

      const activeEl =
        typeof document !== "undefined" ? document.activeElement : null;
      const liveCards = container.querySelectorAll(".post-card[data-post-id]");
      liveCards.forEach((card) => {
        if (isNearFeedViewport(card)) return;
        if (activeEl && card.contains(activeEl)) return;
        detachFeedCard(card);
      });
    }
function scheduleFeedWindowingUpdate(force = false) {
      if (typeof window === "undefined") return;
      if (force) {
        if (feedWindowUpdateRaf) {
          cancelAnimationFrame(feedWindowUpdateRaf);
          feedWindowUpdateRaf = 0;
        }
        runFeedWindowing();
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
      if (!shouldEnable) {
        restoreAllWindowedFeedCards(container);
        return;
      }
      setupFeedWindowingListeners();
      scheduleFeedWindowingUpdate(true);
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
function scheduleSecondaryRenders() {
      if (secondaryRenderScheduled) return;
      secondaryRenderScheduled = true;
      const run = () => {
        secondaryRenderScheduled = false;
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
export function setFeedState(next = {}) {
      if (typeof next.currentFilter === "string") {
        currentFilter = next.currentFilter;
      }
      if (typeof next.feedLayout === "string") {
        feedLayout = next.feedLayout;
      }
      if (typeof next.filterMedia === "boolean") {
        filterMedia = next.filterMedia;
      }
      if (typeof next.filterWorkout === "boolean") {
        filterWorkout = next.filterWorkout;
      }
      if (typeof next.sortOrder === "string") {
        sortOrder = next.sortOrder;
      }
      if (typeof next.isFeedLoading === "boolean") {
        isFeedLoading = next.isFeedLoading;
      }
      if (typeof next.feedError === "string") {
        feedError = next.feedError;
      }
      syncFeedPageSize();
    }
export function setupFeedControls() {
      feedIsOnline = getOnlineState();
      setupFeedCardActionDelegation();
      syncFeedPageSize({ resetVisible: true });
      const filterAll = $("filter-all");
      if (filterAll) {
        filterAll.addEventListener("click", () => {
          currentFilter = "all";
          resetFeedPagination();
          updateFilterButtons();
          scheduleRenderFeed();
        });
      }
      const filterMine = $("filter-mine");
      if (filterMine) {
        filterMine.addEventListener("click", () => {
          const currentUser = getCurrentUser();
          const currentLang = getCurrentLang();
          if (!currentUser) {
            const tr = t[currentLang] || t.ja;
            showToast(
              tr.mineFilterLogin || "Log in to see only your posts.",
              "warning"
            );
            currentFilter = "all";
          } else {
            currentFilter = "mine";
          }
          resetFeedPagination();
          updateFilterButtons();
          scheduleRenderFeed();
        });
      }
      const filterPublic = $("filter-public");
      if (filterPublic) {
        filterPublic.addEventListener("click", () => {
          currentFilter = "public";
          resetFeedPagination();
          updateFilterButtons();
          scheduleRenderFeed();
        });
      }
      const filterMediaBtn = $("filter-media");
      if (filterMediaBtn) {
        filterMediaBtn.addEventListener("click", () => {
          filterMedia = !filterMedia;
          resetFeedPagination();
          updateFilterButtons();
          scheduleRenderFeed();
        });
      }
      const filterWorkoutBtn = $("filter-workout");
      if (filterWorkoutBtn) {
        filterWorkoutBtn.addEventListener("click", () => {
          filterWorkout = !filterWorkout;
          resetFeedPagination();
          updateFilterButtons();
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
        const commitSearch = () => {
          const nextSearch = searchInput.value?.trim().toLowerCase() || "";
          if (nextSearch === feedLastCommittedSearch) return;
          feedLastCommittedSearch = nextSearch;
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
          }, FEED_SEARCH_DEBOUNCE_MS);
          syncSearchClearButton();
        });
        searchInput.addEventListener("keydown", (event) => {
          if (event.isComposing || event.key !== "Escape") return;
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
          resetFeedPagination();
          scheduleRenderFeed();
        });
        sortSelect.value = sortOrder;
      }

      const feedAdvanced = $("feed-advanced");
      const feedOptionsBtn = $("btn-feed-options");
      if (feedOptionsBtn && feedAdvanced && !feedOptionsBtn.dataset.bound) {
        feedOptionsBtn.dataset.bound = "true";
        feedOptionsBtn.addEventListener("click", () => {
          const isOpen = feedAdvanced.classList.toggle("is-open");
          feedOptionsBtn.classList.toggle("is-active", isOpen);
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
      const buttons = ["filter-all", "filter-mine"];
      buttons.forEach((id) => {
        const el = $(id);
        if (!el) return;
        el.classList.toggle("chip-active", id === "filter-" + currentFilter);
      });
      const mediaBtn = $("filter-media");
      const workoutBtn = $("filter-workout");
      if (mediaBtn) mediaBtn.classList.toggle("chip-active", filterMedia);
      if (workoutBtn) workoutBtn.classList.toggle("chip-active", filterWorkout);
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
      renderFeed();

      if (!forceNetwork) {
        const backoffRemainingMs = getFeedNetworkBackoffRemainingMs();
        if (backoffRemainingMs > 0) {
          isFeedLoading = false;
          const hasVisiblePosts = Array.isArray(getAllPosts()) && getAllPosts().length > 0;
          feedError = hasVisiblePosts
            ? ""
            : tr.authNetworkError || "Cannot connect to Supabase.";
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
        feedError = "Supabase not initialized.";
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
            .select("*")
            .order("date", { ascending: false });

          if (error) {
            if (!isLikelyTransientNetworkError(error)) {
              const fallback = await supabase
                .from("posts")
                .select("*")
                .order("created_at", { ascending: false });
              if (!fallback.error) {
                data = fallback.data;
                error = null;
              }
            }
          }

          if (error) {
            const isTransientNetwork = isLikelyTransientNetworkError(error);
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
            feedError = isTransientNetwork
              ? tr.authNetworkError || "Cannot connect to Supabase."
              : error.message || "Failed to load feed.";
            isFeedLoading = false;
            setFeedNotice("", "");
            renderFeed();
            return;
          }

          feedDemoMode = false;
          clearFeedNetworkBackoff();

          const safeData = Array.isArray(data) ? data : [];
          let profileMap = null;
          try {
            profileMap = await getProfilesForUsers(
              safeData.map((post) => post.user_id)
            );
          } catch (profileBatchError) {
            console.error("loadFeed profile batch error", profileBatchError);
          }
          const postsWithProfile = await Promise.all(
            safeData.map(async (post) => {
              if (profileMap && typeof profileMap.get === "function") {
                return {
                  ...post,
                  profile: profileMap.get(post.user_id) || null,
                };
              }
              const profile = await getProfile(post.user_id);
              return { ...post, profile };
            })
          );

          if (requestGeneration !== feedLoadingGeneration) {
            return;
          }

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
                initialMetaIds.length + FEED_META_BATCH_SIZE
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
    const retryBtn = $("btn-feed-retry");
    const moreWrap = $("feed-more-wrap");
    const moreHint = $("feed-more-hint");
    const moreBtn = $("btn-feed-more");
    const layoutBtn = $("btn-feed-layout");
    if (!container) return;
    feedChunkRendering = false;
    feedScheduledRenderToken += 1;
    feedRenderScheduled = false;
    const appendOnly = !!options.appendOnly;
    if (!appendOnly) {
      if (feedWindowUpdateRaf) {
        cancelAnimationFrame(feedWindowUpdateRaf);
        feedWindowUpdateRaf = 0;
      }
      restoreAllWindowedFeedCards(container);
      feedMoreAnchorTop = null;
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
    const commentsExpanded = getCommentsExpanded();
    const commentsLoading = getCommentsLoading();
    const commentsEnabled = isCommentsEnabled();
    const autoLoadMoreEnabled = settings.feedAutoLoadMore !== false;
    const followingIds = getFollowingIds();
    const tr = t[currentLang] || t.ja;
    const pullIndicator = $("feed-pull-indicator");
    if (
      pullIndicator &&
      !pullIndicator.classList.contains("is-loading") &&
      !pullIndicator.classList.contains("is-ready")
    ) {
      pullIndicator.textContent = tr.feedPullHint || "下に引いて更新";
    }
    const searchValue = $("feed-search")?.value?.trim().toLowerCase() || "";
    const allowedFilters = ["all", "mine"];
    if (!allowedFilters.includes(currentFilter)) {
      currentFilter = "all";
    }
    if (currentFilter === "mine" && !currentUser) {
      currentFilter = "all";
    }
    updateFilterButtons();

    const updateRetryButton = (show = false) => {
      if (!retryBtn) return;
      retryBtn.classList.toggle("hidden", !show);
      if (!show) {
        retryBtn.classList.remove("is-loading");
        retryBtn.disabled = false;
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

    const canSeePost = (post) => {
      if (post.visibility === "private") {
        return currentUser && post.user_id === currentUser.id;
      }
      return true;
    };

    const matchesFilter = (post) => {
      if (currentFilter === "mine") {
        return currentUser && post.user_id === currentUser.id;
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

    const firstPostId = Array.isArray(allPosts) && allPosts.length ? allPosts[0]?.id || "" : "";
    const lastPostId = Array.isArray(allPosts) && allPosts.length
      ? allPosts[allPosts.length - 1]?.id || ""
      : "";
    const queryKey = [
      currentUser?.id || "",
      currentFilter,
      filterMedia ? "1" : "0",
      filterWorkout ? "1" : "0",
      sortOrder,
      feedLayout,
      searchValue,
      Array.isArray(allPosts) ? allPosts.length : 0,
      firstPostId,
      lastPostId,
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
      const visiblePosts = Array.isArray(allPosts)
        ? allPosts.filter((post) => {
            if (!canSeePost(post) || !matchesFilter(post) || !matchesSearch(post)) {
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
      const sortedPosts = visiblePosts.slice().sort((a, b) => {
        const aTime = new Date(a.date || a.created_at || 0).getTime();
        const bTime = new Date(b.date || b.created_at || 0).getTime();
        if (sortOrder === "oldest") {
          return aTime - bTime;
        }
        return bTime - aTime;
      });
      gridCandidates = feedLayout === "grid"
        ? sortedPosts.filter((post) => post.media_url)
        : sortedPosts;
      feedQueryCache = {
        queryKey,
        postsRef: allPosts,
        workoutLogsRef: workoutLogsByPost,
        gridCandidates,
      };
    }

    container.classList.toggle("grid-view", feedLayout === "grid");
    if (layoutBtn) {
      const label =
        feedLayout === "grid"
          ? tr.feedLayoutList || "List"
          : tr.feedLayoutGrid || "Grid";
      layoutBtn.textContent = label;
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
        container.innerHTML = "";
        delete container.dataset.feedSignature;
        feedWindowedCards.clear();
        if (moreWrap) moreWrap.classList.add("hidden");
        const skeletonCount = 3;
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
      feedLayout,
      currentFilter,
      filterMedia ? "1" : "0",
      filterWorkout ? "1" : "0",
      sortOrder,
      searchValue,
      currentUser?.id || "",
      String(gridCandidates.length),
      gridCandidates[0]?.id || "",
      gridCandidates[gridCandidates.length - 1]?.id || "",
    ].join("|");
    const existingCount = container.querySelectorAll(
      ".post-card[data-post-id], .feed-window-placeholder[data-post-id]"
    ).length;
    const canAppend =
      appendOnly &&
      container.dataset.feedSignature === renderSignature &&
      existingCount > 0 &&
      existingCount < visibleSlice.length;
    const renderMode = canAppend ? "append" : "full";

    if (!gridCandidates.length) {
      feedChunkRendering = false;
      clearFeedMoreLoadingState();
      resetDeferredVideoObserver();
      container.innerHTML = "";
      delete container.dataset.feedSignature;
      syncFeedWindowing(false);
      if (moreWrap) moreWrap.classList.add("hidden");
      const empty = document.createElement("div");
      empty.className = "empty-state";

      const title = document.createElement("div");
      title.className = "empty-title";
      title.textContent =
        tr.feedEmptyTitle || tr.emptyFeed || "表示する投稿がありません。";

      const hasConnectionIssue = isSupabaseConnectivityIssue(feedError, tr);
      const desc = document.createElement("div");
      desc.className = "empty-desc";
      desc.textContent = hasConnectionIssue
        ? tr.feedEmptyConnectionHint ||
          "Supabase 接続に失敗しています。設定で Project URL / Anon key を確認してください。"
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

    if (!canAppend) {
      clearFeedMoreLoadingState();
      resetDeferredVideoObserver();
      container.innerHTML = "";
      if (moreWrap) moreWrap.classList.add("hidden");
    }
    container.dataset.feedSignature = renderSignature;

    const localLikedIds = getLikedIds();
    const shouldAnimateEntry = canAppend;
    const createPostCard = (post) => {
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

      const header = document.createElement("div");
      header.className = "post-header";

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
      const nameSpan = document.createElement("span");
      nameSpan.className = "profile-link";
      nameSpan.setAttribute("data-user-id", post.user_id);
      const handleBare = handleText.replace("@", "");
      if (displayName && displayName.toLowerCase() !== handleBare.toLowerCase()) {
        nameSpan.textContent = displayName;
        userRow.appendChild(nameSpan);

        const handleSpan = document.createElement("span");
        handleSpan.className = "handle profile-link";
        handleSpan.setAttribute("data-user-id", post.user_id);
        handleSpan.textContent = handleText;
        userRow.appendChild(handleSpan);
      } else {
        nameSpan.textContent = handleText;
        userRow.appendChild(nameSpan);
      }

      const subRow = document.createElement("div");
      subRow.className = "post-sub";
      const dateText = formatPostDate(post);
      const relativeText = formatRelative(post.date || post.created_at);
      const visibilityText =
        post.visibility === "private"
          ? tr.private || "Private"
          : tr.public || "Public";
      subRow.textContent = [relativeText || dateText, visibilityText]
        .filter(Boolean)
        .join(" · ");

      meta.appendChild(userRow);
      meta.appendChild(subRow);

      const actions = document.createElement("div");
      actions.className = "post-actions";

      const likeBtn = document.createElement("button");
      likeBtn.className = "chip chip-like";
      likeBtn.dataset.postAction = "toggle-like";
      const likeState = getLikeUiState(post.id, localLikedIds);
      applyLikeButtonState(likeBtn, likeState, tr);
      actions.appendChild(likeBtn);

      const commentBtn = document.createElement("button");
      commentBtn.className = "chip chip-log";
      commentBtn.dataset.postAction = "toggle-comments";
      const commentCount = commentsByPost.get(post.id)?.length || 0;
      if (commentsExpanded.has(post.id)) {
        commentBtn.textContent = tr.commentsHide || "Hide";
      } else if (commentCount) {
        commentBtn.textContent = `${tr.comments || "Comments"} (${commentCount})`;
      } else {
        commentBtn.textContent = tr.commentsShow || "View comments";
      }
      actions.appendChild(commentBtn);

      if (currentUser && post.user_id !== currentUser.id) {
        const followBtn = document.createElement("button");
        followBtn.className = "chip chip-log btn-follow";
        followBtn.setAttribute("data-user-id", post.user_id);
        const isFollowing = followingIds.has(post.user_id);
        followBtn.textContent = isFollowing ? tr.unfollow || "Following" : tr.follow || "Follow";
        followBtn.classList.toggle("is-following", isFollowing);
        followBtn.setAttribute("aria-pressed", isFollowing ? "true" : "false");
        actions.appendChild(followBtn);
      }

      if (currentUser && post.user_id === currentUser.id) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "chip chip-delete";
        deleteBtn.dataset.postAction = "delete-post";
        deleteBtn.textContent = tr.delete || "Delete";
        actions.appendChild(deleteBtn);
      }

      header.appendChild(avatar);
      header.appendChild(meta);
      header.appendChild(actions);

      card.appendChild(header);

      if (post.media_url) {
        const mediaWrap = document.createElement("div");
        mediaWrap.className = "post-media";
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
          video.preload = "none";
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
          img.loading = "lazy";
          img.decoding = "async";
          img.fetchPriority = feedLayout === "grid" ? "low" : "auto";
          img.referrerPolicy = "no-referrer";
          img.alt = "post media";
          img.classList.add("image-deferred");
          img.addEventListener("load", () => {
            clearMediaSkeleton(mediaWrap);
          }, { once: true });
          img.addEventListener("error", renderMediaFallback, { once: true });
          if (warmedImageUrlSet.has(post.media_url)) {
            img.src = post.media_url;
            img.dataset.deferredLoaded = "true";
            img.classList.remove("image-deferred");
          } else {
            img.dataset.src = post.media_url;
            observeDeferredImage(img);
          }
          mediaWrap.appendChild(img);
        }
        card.appendChild(mediaWrap);
      }

      const body = document.createElement("div");
      body.className = "post-body";

      if (
        settings.showBodyweight &&
        post.bodyweight !== null &&
        post.bodyweight !== undefined &&
        post.bodyweight !== ""
      ) {
        const weight = document.createElement("div");
        weight.className = "post-weight";
        weight.textContent = `${tr.weight || "Weight"}: ${formatWeight(
          post.bodyweight
        )}`;
        body.appendChild(weight);
      }

      if (post.note || post.caption) {
        const caption = document.createElement("div");
        caption.className = "post-caption";
        const text = post.note || post.caption;
        const trimmed = text ? text.toString().trim() : "";
        if (trimmed.length > 140) {
          caption.textContent = `${trimmed.slice(0, 140)}…`;
        } else {
          caption.textContent = trimmed;
        }
        body.appendChild(caption);
      }

      if (body.childNodes.length) {
        card.appendChild(body);
      }

      const logs = workoutLogsByPost.get(post.id) || [];
      if (logs.length) {
        const logWrap = document.createElement("div");
        logWrap.className = "post-body";
        const logTitle = document.createElement("div");
        logTitle.className = "post-weight";
        logTitle.textContent = tr.workoutLogTitle || "Workout log";
        logWrap.appendChild(logTitle);
        const getPrLabel = (type) => {
          if (!type) return "";
          if (type === "weight") return tr.prWeight || "Weight PR";
          if (type === "reps") return tr.prReps || "Rep PR";
          return tr.prLabel || "PR";
        };
        const visibleLogs = logs.slice(0, 2);
        visibleLogs.forEach((exercise) => {
          const row = document.createElement("div");
          row.className = "post-sub";
          const setsText = (exercise.sets || [])
            .map((set) => {
              const weightText = set.weight ? `@${formatWeight(set.weight)}` : "";
              const prLabel = getPrLabel(set.pr_type);
              const prSuffix = prLabel ? ` (${prLabel})` : "";
              return `${set.set_index || ""} ${set.reps}reps ${weightText}${prSuffix}`.trim();
            })
            .join(", ");
          row.textContent = `${exercise.exercise}: ${setsText}`;
          logWrap.appendChild(row);
          if (exercise.note) {
            const note = document.createElement("div");
            note.className = "post-sub";
            note.textContent = `${tr.workoutNoteLabel || "Note"}: ${exercise.note}`;
            logWrap.appendChild(note);
          }
        });
        if (logs.length > 2) {
          const more = document.createElement("div");
          more.className = "post-sub";
          more.textContent = (tr.workoutMore || "ほか{count}件").replace(
            "{count}",
            `${logs.length - 2}`
          );
          logWrap.appendChild(more);
        }
        card.appendChild(logWrap);
      }

      if (commentsExpanded.has(post.id)) {
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
            comments.forEach((comment) => {
              const item = document.createElement("div");
              item.className = "comment-item";
              if (comment.pending) {
                item.classList.add("is-pending");
              }

              const avatarEl = document.createElement("div");
              avatarEl.className = "avatar";
              const commentHandle =
                comment.profile?.handle ||
                comment.profile?.username ||
                "user";
              const commentHandleText = formatHandle(commentHandle) || "@user";
              const commentDisplay = comment.profile?.display_name || "";
              const commentInitial = (commentDisplay || commentHandleText || "U")
                .replace("@", "")
                .charAt(0)
                .toUpperCase();
              renderAvatar(avatarEl, comment.profile, commentInitial);

              const bodyWrap = document.createElement("div");
              bodyWrap.className = "comment-body";

              const bodyText = document.createElement("div");
              bodyText.textContent = comment.body;

              const meta = document.createElement("div");
              meta.className = "comment-meta";
              const metaName = commentHandleText;
              const metaDate = comment.pending
                ? tr.commentPending || "送信待ち"
                : comment.created_at
                  ? formatDateDisplay(comment.created_at)
                  : "";
              meta.textContent = [metaName, metaDate].filter(Boolean).join(" · ");

              bodyWrap.appendChild(bodyText);
              bodyWrap.appendChild(meta);

              item.appendChild(avatarEl);
              item.appendChild(bodyWrap);
              commentSection.appendChild(item);
            });
          }
        }

        if (currentUser && commentsEnabled) {
          const form = document.createElement("div");
          form.className = "comment-form";

          const input = document.createElement("textarea");
          input.placeholder = tr.commentPlaceholder || "Add a comment";

          const send = document.createElement("button");
          send.className = "btn btn-primary";
          send.textContent = tr.commentAdd || "Post";
          send.addEventListener("click", async () => {
            if (send.classList.contains("is-loading")) return;
            send.classList.add("is-loading");
            send.disabled = true;
            try {
              await submitComment(post, input);
            } finally {
              send.classList.remove("is-loading");
              send.disabled = false;
            }
          });
          input.addEventListener("keydown", (event) => {
            if (event.isComposing) return;
            if (!((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
              return;
            }
            event.preventDefault();
            send.click();
          });

          form.appendChild(input);
          form.appendChild(send);
          commentSection.appendChild(form);
        }

        card.appendChild(commentSection);
      }

      return card;
    };

    let index = canAppend ? existingCount : 0;
    const viewportWidth =
      typeof window === "undefined" ? 1024 : window.innerWidth || 1024;
    const compactViewport = viewportWidth <= 700;
    const batchSize = feedLayout === "grid"
      ? compactViewport
        ? 4
        : 8
      : compactViewport
        ? 3
        : 5;
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
        if (hasMore && appendOnly && autoLoadMoreEnabled) {
          const autoHint = tr.feedAutoLoadHint || "スクロールで自動読み込み";
          moreHint.textContent = `${baseHint} · ${autoHint}`;
        } else {
          moreHint.textContent = baseHint;
        }
        moreBtn.textContent = tr.feedMore || "もっと見る";
        if (!moreBtn.dataset.bound) {
          moreBtn.dataset.bound = "true";
          moreBtn.addEventListener("click", () => {
            if (feedMoreLoading) return;
            captureFeedMoreAnchor(moreWrap);
            feedMoreLoading = true;
            moreBtn.classList.add("is-loading");
            moreBtn.disabled = true;
            moreBtn.textContent = tr.feedMoreLoading || tr.loading || "読み込み中...";
            moreWrap.classList.add("is-loading");
            feedVisibleCount += feedPageSize;
            renderFeed({ appendOnly: true });
          });
        }
        observeFeedMoreButton(moreBtn, hasMore && appendOnly && autoLoadMoreEnabled);
        if (hasMore) {
          if (moreWrap.parentElement !== container) {
            container.appendChild(moreWrap);
          }
          if (appendOnly) {
            restoreFeedMoreAnchor(moreWrap);
          }
        } else if (moreWrap.parentElement === container) {
          moreWrap.remove();
          feedMoreAnchorTop = null;
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
        feedLayout === "list" && visibleSlice.length >= FEED_WINDOW_MIN_ITEMS;
      syncFeedWindowing(shouldWindow);
    };

    const renderChunk = () => {
      if (renderToken !== feedRenderToken) return;
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + batchSize, visibleSlice.length);
      for (; index < end; index += 1) {
        fragment.appendChild(createPostCard(visibleSlice[index]));
      }
      container.appendChild(fragment);
      if (index < visibleSlice.length) {
        requestAnimationFrame(renderChunk);
      } else {
        finalizeMore();
      }
    };

    feedChunkRendering = true;
    requestAnimationFrame(renderChunk);
    return;
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

          // プロフィール側のフォロー数も更新
          await loadFollowStats();
          updateProfileSummary();
          scheduleRenderFeed();
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
function applyLikeButtonState(likeBtn, state, tr) {
      if (!likeBtn || !state) return;
      likeBtn.classList.toggle("chip-like-on", state.isLiked);
      likeBtn.classList.toggle("is-loading", state.isLoading);
      likeBtn.disabled = !!state.isLoading;
      likeBtn.setAttribute("aria-pressed", state.isLiked ? "true" : "false");
      likeBtn.setAttribute("aria-busy", state.isLoading ? "true" : "false");
      likeBtn.textContent = `${tr.like || "Like"}${state.likeCount ? ` (${state.likeCount})` : ""}`;
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
          closeBackdrop(backdrop);
        });
      }
      if (backdrop && backdrop.dataset.bound !== "true") {
        backdrop.dataset.bound = "true";
        backdrop.addEventListener("click", (event) => {
          if (event.target === backdrop) {
            closeBackdrop(backdrop);
          }
        });
      }
    }
export function openPostDetail(postId) {
      const backdrop = $("detail-modal-backdrop");
      if (!backdrop) return;
      currentDetailPostId = postId;
      renderPostDetail();
      openBackdrop(backdrop);
      const commentsByPost = getCommentsByPost();
      const commentsEnabled = isCommentsEnabled();
      if (!commentsByPost.has(postId) && commentsEnabled) {
        loadCommentsForPost(postId).then(() => renderPostDetail());
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
          caption.textContent = post.note || post.caption || "";
          body.appendChild(caption);
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
        const list = document.createElement("div");
        list.className = "comment-list";
        const comments = commentsByPost.get(post.id) || [];
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
          comments.forEach((comment) => {
            const row = document.createElement("div");
            row.className = "comment-item";
            if (comment.pending) {
              row.classList.add("is-pending");
            }
            const avatar = document.createElement("div");
            avatar.className = "avatar";
            renderAvatar(
              avatar,
              comment.profile,
              (comment.profile?.display_name ||
                comment.profile?.handle ||
                "U")
                .charAt(0)
                .toUpperCase()
            );
            const text = document.createElement("div");
            const name = document.createElement("div");
            name.className = "comment-name";
            name.textContent =
              comment.profile?.display_name ||
              formatHandle(comment.profile?.handle || "user");
            if (comment.pending) {
              name.textContent = `${name.textContent} · ${tr.commentPending || "送信待ち"}`;
            }
            const body = document.createElement("div");
            body.className = "comment-body";
            body.textContent = comment.body || "";
            text.appendChild(name);
            text.appendChild(body);
            row.appendChild(avatar);
            row.appendChild(text);
            list.appendChild(row);
          });
          commentsEl.appendChild(list);
        }

        if (currentUser && commentsEnabled) {
          const inputWrap = document.createElement("div");
          inputWrap.className = "detail-comment-input";
          const input = document.createElement("input");
          input.type = "text";
          input.placeholder = tr.commentPlaceholder || "コメントを書く";
          const btn = document.createElement("button");
          btn.className = "btn btn-primary btn-xs";
          btn.textContent = tr.commentSubmit || "送信";
          btn.addEventListener("click", async () => {
            if (btn.classList.contains("is-loading")) return;
            btn.classList.add("is-loading");
            btn.disabled = true;
            try {
              await submitComment(post, input);
            } finally {
              btn.classList.remove("is-loading");
              btn.disabled = false;
            }
          });
          input.addEventListener("keydown", (event) => {
            if (event.isComposing) return;
            if (event.key !== "Enter") return;
            event.preventDefault();
            btn.click();
          });
          inputWrap.appendChild(input);
          inputWrap.appendChild(btn);
          commentsEl.appendChild(inputWrap);
        }
      }
    }
