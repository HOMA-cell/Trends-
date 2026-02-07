import { supabase } from "./supabaseClient.js";
import { t } from "./i18n.js";
import {
  $,
  showToast,
  renderAvatar,
  formatHandle,
  formatDateDisplay,
  formatWeight,
  formatVolume,
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
const toggleFollowForUser = (...args) => feedContext.toggleFollowForUser?.(...args);
const loadFollowStats = (...args) => feedContext.loadFollowStats?.(...args);
const getFollowingIds = () => feedContext.getFollowingIds?.() || new Set();
const getLikedPostIds = () => feedContext.getLikedPostIds?.() || new Set();
const setLikedPostIds = (next) => feedContext.setLikedPostIds?.(next);
const getLikesByPost = () => feedContext.getLikesByPost?.() || new Map();
const setLikesByPost = (next) => feedContext.setLikesByPost?.(next);
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
let feedPageSize = 8;
let feedVisibleCount = 8;
let feedLastLoadedAt = null;
let currentDetailPostId = null;
let feedRenderToken = 0;
let feedLoadPromise = null;
let feedNotice = "";
let feedNoticeTone = "";
let feedNoticeTimer = null;
const FEED_CACHE_KEY = "trends_feed_cache_v1";
const MODAL_ANIM_MS = 200;
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
          renderFeed();
        }, autoClearMs);
      }
    }
export function resetFeedPagination() {
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
    }
export function setupFeedControls() {
      const filterAll = $("filter-all");
      if (filterAll) {
        filterAll.addEventListener("click", () => {
          currentFilter = "all";
          resetFeedPagination();
          updateFilterButtons();
          renderFeed();
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
          renderFeed();
        });
      }
      const filterPublic = $("filter-public");
      if (filterPublic) {
        filterPublic.addEventListener("click", () => {
          currentFilter = "public";
          resetFeedPagination();
          updateFilterButtons();
          renderFeed();
        });
      }
      const filterMediaBtn = $("filter-media");
      if (filterMediaBtn) {
        filterMediaBtn.addEventListener("click", () => {
          filterMedia = !filterMedia;
          resetFeedPagination();
          updateFilterButtons();
          renderFeed();
        });
      }
      const filterWorkoutBtn = $("filter-workout");
      if (filterWorkoutBtn) {
        filterWorkoutBtn.addEventListener("click", () => {
          filterWorkout = !filterWorkout;
          resetFeedPagination();
          updateFilterButtons();
          renderFeed();
        });
      }

      const searchInput = $("feed-search");
      let searchTimer = null;
      if (searchInput) {
        searchInput.addEventListener("input", () => {
          if (searchTimer) {
            clearTimeout(searchTimer);
          }
          searchTimer = setTimeout(() => {
            resetFeedPagination();
            renderFeed();
          }, 180);
        });
      }

      const sortSelect = $("feed-sort");
      if (sortSelect) {
        sortSelect.addEventListener("change", () => {
          sortOrder = sortSelect.value || "newest";
          resetFeedPagination();
          renderFeed();
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

      const refreshBtn = $("btn-feed-refresh");
      if (refreshBtn && refreshBtn.dataset.bound !== "true") {
        refreshBtn.dataset.bound = "true";
        refreshBtn.addEventListener("click", async () => {
          if (refreshBtn.classList.contains("is-loading")) return;
          refreshBtn.classList.add("is-loading");
          refreshBtn.disabled = true;
          try {
            await loadFeed({ softRefresh: true });
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
          renderFeed();
        });
      }

      updateFilterButtons();
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

      const softRefresh = !!options.softRefresh && getAllPosts().length > 0;
      const tr = t[getCurrentLang()] || t.ja;
      if (softRefresh) {
        setFeedNotice(tr.feedRefreshing || "更新中...", "loading");
      } else {
        setFeedNotice("", "");
        isFeedLoading = true;
      }
      feedError = "";
      renderFeed();

      if (!supabase) {
        feedError = "Supabase not initialized.";
        isFeedLoading = false;
        setFeedNotice("", "");
        renderFeed();
        return;
      }

      feedLoadPromise = (async () => {
        try {
          let { data, error } = await supabase
            .from("posts")
            .select("*")
            .order("date", { ascending: false });

          if (error) {
            const fallback = await supabase
              .from("posts")
              .select("*")
              .order("created_at", { ascending: false });
            if (!fallback.error) {
              data = fallback.data;
              error = null;
            }
          }

          if (error) {
            console.error("loadFeed error", error);
            const cachedPosts = loadFeedCache();
            if (cachedPosts.length) {
              setAllPosts(cachedPosts);
              feedLastLoadedAt = Date.now();
              resetFeedPagination();
              updateFeedStats(cachedPosts);
              isFeedLoading = false;
              const message =
                tr.feedCachedNotice ||
                "Network issue. Showing last saved feed.";
              setFeedNotice(message, "warning", 2800);
              renderFeed();
              updateProfileSummary();
              renderWorkoutHistory();
              renderTrainingSummary();
              renderPrList();
              renderInsights();
              renderOnboardingChecklist();
              showToast(message, "warning");
              return;
            }
            feedError = error.message || "Failed to load feed.";
            isFeedLoading = false;
            setFeedNotice("", "");
            renderFeed();
            return;
          }

          const safeData = Array.isArray(data) ? data : [];
          const postsWithProfile = await Promise.all(
            safeData.map(async (post) => {
              const profile = await getProfile(post.user_id);
              return { ...post, profile };
            })
          );

          const postIds = postsWithProfile.map((post) => post.id).filter(Boolean);
          await loadWorkoutLogs(postIds);
          await loadLikes(postIds);

          setAllPosts(postsWithProfile);
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
          updateProfileSummary();
          renderWorkoutHistory();
          renderTrainingSummary();
          renderPrList();
          renderInsights();
          renderOnboardingChecklist();
        } finally {
          feedLoadPromise = null;
        }
      })();

      return feedLoadPromise;
    }
export function renderFeed() {
    const container = document.getElementById("feed-list");
    const status = $("feed-status");
    const moreWrap = $("feed-more-wrap");
    const moreHint = $("feed-more-hint");
    const moreBtn = $("btn-feed-more");
    const layoutBtn = $("btn-feed-layout");
    if (!container) return;
    const renderToken = ++feedRenderToken;

    const currentUser = getCurrentUser();
    const currentLang = getCurrentLang();
    const settings = getSettings();
    const allPosts = getAllPosts();
    const workoutLogsByPost = getWorkoutLogsByPost();
    const commentsByPost = getCommentsByPost();
    const commentsExpanded = getCommentsExpanded();
    const commentsLoading = getCommentsLoading();
    const commentsEnabled = isCommentsEnabled();
    const likedPostIds = getLikedPostIds();
    const likesByPost = getLikesByPost();
    const followingIds = getFollowingIds();
    const tr = t[currentLang] || t.ja;
    const searchValue = $("feed-search")?.value?.trim().toLowerCase() || "";
    const allowedFilters = ["all", "mine"];
    if (!allowedFilters.includes(currentFilter)) {
      currentFilter = "all";
    }
    if (currentFilter === "mine" && !currentUser) {
      currentFilter = "all";
    }
    updateFilterButtons();

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
      const logs = workoutLogsByPost.get(post.id) || [];
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
      return haystack.includes(searchValue);
    };

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

    container.innerHTML = "";
    if (status) {
      status.textContent = "";
      status.classList.remove(
        "feed-status-loading",
        "feed-status-success",
        "feed-status-warning",
        "feed-status-error"
      );
    }
    if (moreWrap) moreWrap.classList.add("hidden");

    container.classList.toggle("grid-view", feedLayout === "grid");
    if (layoutBtn) {
      const label =
        feedLayout === "grid"
          ? tr.feedLayoutList || "List"
          : tr.feedLayoutGrid || "Grid";
      layoutBtn.textContent = label;
    }

    if (isFeedLoading) {
      if (Array.isArray(allPosts) && allPosts.length > 0) {
        if (status) {
          status.textContent = feedNotice || tr.feedRefreshing || "更新中...";
          status.classList.add("feed-status-loading");
        }
      } else {
        const skeletonCount = 3;
        for (let i = 0; i < skeletonCount; i += 1) {
          const skeleton = document.createElement("div");
          skeleton.className = "post-card skeleton feed-skeleton";
          container.appendChild(skeleton);
        }
      }
      return;
    }

    if (status) {
      if (feedError) {
        status.textContent = feedError;
        status.classList.add("feed-status-error");
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

    const sortedPosts = visiblePosts.slice().sort((a, b) => {
      const aTime = new Date(a.date || a.created_at || 0).getTime();
      const bTime = new Date(b.date || b.created_at || 0).getTime();
      if (sortOrder === "oldest") {
        return aTime - bTime;
      }
      return bTime - aTime;
    });

    const gridCandidates = feedLayout === "grid"
      ? sortedPosts.filter((post) => post.media_url)
      : sortedPosts;

    if (!gridCandidates.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";

      const title = document.createElement("div");
      title.className = "empty-title";
      title.textContent =
        tr.feedEmptyTitle || tr.emptyFeed || "表示する投稿がありません。";

      const desc = document.createElement("div");
      desc.className = "empty-desc";
      desc.textContent =
        tr.feedEmptyDesc || "最初の投稿をしてみましょう。";

      const actions = document.createElement("div");
      actions.className = "empty-actions";

      const primary = document.createElement("button");
      primary.className = "btn btn-primary";
      if (currentUser) {
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
      secondary.textContent =
        tr.feedEmptyCtaProfile || "プロフィールを整える";
      secondary.addEventListener("click", () => {
        setActivePage("account");
      });

      actions.appendChild(primary);
      actions.appendChild(secondary);
      empty.appendChild(title);
      empty.appendChild(desc);
      empty.appendChild(actions);
      container.appendChild(empty);
      return;
    }

    const localLikedIds = getLikedIds();

    const visibleSlice = gridCandidates.slice(0, feedVisibleCount);
    const createPostCard = (post) => {
      const card = document.createElement("div");
      card.className = "post-card";
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
      const likesEnabled = getLikesEnabled();
      const isLiked = likesEnabled
        ? likedPostIds.has(post.id)
        : localLikedIds.includes(post.id);
      const likeCount = likesEnabled ? likesByPost.get(post.id) || 0 : isLiked ? 1 : 0;
      if (isLiked) {
        likeBtn.classList.add("chip-like-on");
      }
      likeBtn.textContent = `${tr.like || "Like"}${likeCount ? ` (${likeCount})` : ""}`;
      likeBtn.addEventListener("click", () => toggleLikeForPost(post));
      actions.appendChild(likeBtn);

      const commentBtn = document.createElement("button");
      commentBtn.className = "chip chip-log";
      const commentCount = commentsByPost.get(post.id)?.length || 0;
      if (commentsExpanded.has(post.id)) {
        commentBtn.textContent = tr.commentsHide || "Hide";
      } else if (commentCount) {
        commentBtn.textContent = `${tr.comments || "Comments"} (${commentCount})`;
      } else {
        commentBtn.textContent = tr.commentsShow || "View comments";
      }
      commentBtn.addEventListener("click", () => toggleComments(post.id));
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
        deleteBtn.textContent = tr.delete || "Delete";
        deleteBtn.addEventListener("click", () => deletePost(post.id));
        actions.appendChild(deleteBtn);
      }

      header.appendChild(avatar);
      header.appendChild(meta);
      header.appendChild(actions);

      card.appendChild(header);

      if (post.media_url) {
        const mediaWrap = document.createElement("div");
        mediaWrap.className = "post-media";
        if (post.media_type === "video") {
          const video = document.createElement("video");
          video.src = post.media_url;
          video.preload = "metadata";
          video.controls = true;
          mediaWrap.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.src = post.media_url;
          img.loading = "lazy";
          img.decoding = "async";
          img.alt = "post media";
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
              const metaDate = comment.created_at
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
          send.addEventListener("click", () => submitComment(post, input));

          form.appendChild(input);
          form.appendChild(send);
          commentSection.appendChild(form);
        }

        card.appendChild(commentSection);
      }

      return card;
    };

    let index = 0;
    const batchSize = feedLayout === "grid" ? 6 : 4;
    const finalizeMore = () => {
      if (moreWrap && moreBtn && moreHint) {
        const remaining = Math.max(0, gridCandidates.length - visibleSlice.length);
        const hasMore = remaining > 0;
        moreWrap.classList.toggle("hidden", !hasMore);
        moreHint.textContent = hasMore
          ? (tr.feedMoreHint || "あと{count}件").replace("{count}", remaining)
          : "";
        moreBtn.textContent = tr.feedMore || "もっと見る";
        if (!moreBtn.dataset.bound) {
          moreBtn.dataset.bound = "true";
          moreBtn.addEventListener("click", () => {
            const anchorTop = moreBtn.getBoundingClientRect().top;
            feedVisibleCount += feedPageSize;
            renderFeed();
            requestAnimationFrame(() => {
              const nextTop = moreBtn.getBoundingClientRect().top;
              const delta = nextTop - anchorTop;
              if (Math.abs(delta) > 1) {
                window.scrollBy({ top: delta, behavior: "auto" });
              }
            });
          });
        }
        if (hasMore) {
          if (moreWrap.parentElement !== container) {
            container.appendChild(moreWrap);
          }
        } else if (moreWrap.parentElement === container) {
          moreWrap.remove();
        }
      }
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
          renderFeed();
        } finally {
          btn.classList.remove("is-loading");
          btn.disabled = false;
        }
      });
    }
export async function loadLikes(postIds) {
      const likesByPost = getLikesByPost();
      const likedPostIds = getLikedPostIds();
      likesByPost.clear();
      likedPostIds.clear();
      setLikesEnabled(true);
      if (!postIds.length) return;

      const { data, error } = await supabase
        .from("post_likes")
        .select("post_id, user_id")
        .in("post_id", postIds);

      if (error) {
        console.error("loadLikes error:", error);
        setLikesEnabled(false);
        const localLikes = getLikedIds();
        localLikes.forEach((id) => likedPostIds.add(id));
        return;
      }

      const currentUser = getCurrentUser();
      (data || []).forEach((like) => {
        likesByPost.set(like.post_id, (likesByPost.get(like.post_id) || 0) + 1);
        if (currentUser && like.user_id === currentUser.id) {
          likedPostIds.add(like.post_id);
        }
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
      const currentUser = getCurrentUser();
      const likedPostIds = getLikedPostIds();
      const likesByPost = getLikesByPost();
      const likesEnabled = getLikesEnabled();
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
        renderFeed();
        return;
      }

      if (likedPostIds.has(post.id)) {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", currentUser.id);
        if (error) {
          console.error("like delete error:", error);
          return;
        }
        likedPostIds.delete(post.id);
        likesByPost.set(post.id, Math.max(0, (likesByPost.get(post.id) || 1) - 1));
      } else {
        const { error } = await supabase
          .from("post_likes")
          .insert({
            post_id: post.id,
            user_id: currentUser.id,
          });
        if (error) {
          console.error("like insert error:", error);
          return;
        }
        likedPostIds.add(post.id);
        likesByPost.set(post.id, (likesByPost.get(post.id) || 0) + 1);
        await createNotification({
          userId: post.user_id,
          actorId: currentUser.id,
          type: "like",
          postId: post.id,
        });
      }

      renderFeed();
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
      const settings = getSettings();
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
          if (post.media_type === "video") {
            const video = document.createElement("video");
            video.src = post.media_url;
            video.controls = true;
            wrap.appendChild(video);
          } else {
            const img = document.createElement("img");
            img.src = post.media_url;
            img.alt = "media";
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
          btn.addEventListener("click", () => submitComment(post, input));
          inputWrap.appendChild(input);
          inputWrap.appendChild(btn);
          commentsEl.appendChild(inputWrap);
        }
      }
    }
