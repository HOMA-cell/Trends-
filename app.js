import {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_CONFIG_SOURCE,
  saveStoredSupabaseConfig,
  clearStoredSupabaseConfig,
} from "./supabaseClient.js";
import { t } from "./i18n.js";
import {
  $,
  setButtonLoading,
  showToast,
  formatHandle,
  normalizeExerciseName,
  toDateKey,
  formatDateDisplay,
  formatDateTimeDisplay,
  formatNumber,
  convertWeightValue,
  convertHeightValue,
  toKg,
  formatWeight,
  formatVolume,
  setUtilsContext,
} from "./utils.js";
import {
  setFeedContext,
  setFeedState,
  setupFeedControls,
  setupFollowButtons,
  setupPostDetailModal,
  updateFilterButtons,
  loadFeed,
  renderFeed,
  refreshFeedPostComments,
} from "./feed.js";
import {
  setProfileContext,
  updateProfileSummary,
  setupProfileLinks,
  openPublicProfile,
  applyProfileTheme,
  applyProfileBanner,
  getProfileDisplayName,
} from "./profile.js";
import { createCommentSync } from "./commentSync.js";
import { createProfileEditState } from "./profileEditState.js";
import {
  createSettingsController,
  defaultSettings,
} from "./settings.js";

    // ---- 状態 ----
    let currentUser = null;
    let currentProfile = null;
    let allPosts = [];
    let userPostsCache = {
      postsRef: null,
      userId: "",
      posts: [],
      postIds: new Set(),
      sortedByDateDesc: [],
    };
    let showExtraSections = false;
    let currentLang = "ja";
    let currentMediaFile = null;
    let currentMediaPreviewUrl = null;
    let draftSaveTimer = null;
    let draftSaveBlockedUntil = 0;
    let postComposerAdvanced = false;
    let pendingAvatarFile = null;
    let pendingBannerFile = null;
    let profilePostCount = null;

    // ★ 追加：プロフィール用の投稿数とフォロー数
    let currentFollowersCount = 0;
    let currentFollowingCount = 0;

// ★ 追加：自分がフォローしている user_id の一覧
    let followingIds = new Set();

    let templates = [];
    let templatesEnabled = true;
    let commentsByPost = new Map();
    let commentsExpanded = new Set();
    let commentsLoading = new Set();
    let commentsEnabled = true;
    let openPostModal = null;
    let likesEnabled = true;
    let likesByPost = new Map();
    let likedPostIds = new Set();
    let workoutExercises = [];
    let workoutLogsByPost = new Map();
    let loadedWorkoutLogPostIds = new Set();
    let workoutLogsEnabled = true;
    let notifications = [];
    let notificationsEnabled = true;
    let currentPublicProfileId = null;
    let currentGalleryPosts = [];
    let galleryPage = 1;
    const galleryPageSize = 9;
    let publicPostsPageSize = 4;
    let publicPostsVisibleCount = 4;
    let exercisePRs = new Map();
    let prTrackingEnabled = true;
    let setActivePage = null;
    const collapsibleControllers = new Map();
    let collapsibleHeightRaf = 0;
    let collapsibleResizeBound = false;
    let profileEditCompact = true;
    let serviceWorkerSetupDone = false;
    let serviceWorkerControllerReloaded = false;
    let serviceWorkerVisibilityListenerBound = false;
    let serviceWorkerScriptUrl = "./sw.js";
    let serviceWorkerBuildVersion = "dev-local";
    let serviceWorkerBuildResolved = false;
    let authRetryBlockedUntil = 0;
    let supabaseConnectivityState = {
      ok: null,
      restStatus: 0,
      authStatus: 0,
      timedOut: false,
      error: null,
      checkedAt: 0,
      retryAfter: 0,
    };
    let appBuildMetaLoaded = false;
    let appBuildMeta = {
      version: "dev-local",
      builtAt: null,
    };
    let runtimeIssues = [];
    let runtimeIssueCaptureBound = false;

    const POST_DRAFT_KEY = "trends_post_draft_v1";
    const POST_COMPOSER_ADVANCED_KEY = "trends_post_composer_advanced_v1";
    const PROFILE_EDIT_DRAFT_KEY = "trends_profile_edit_draft_v1";
    const PERF_DEBUG_KEY = "trends_perf_debug";
    const PROFILE_EDIT_COMPACT_KEY = "trends_profile_edit_compact_v1";
    const BUILD_META_URL = "./build-meta.json";
    const DEFAULT_LIVE_SITE_URL = "https://homa-cell.github.io/Trends-/";
    const GITHUB_MAIN_COMMIT_API_URL =
      "https://api.github.com/repos/HOMA-cell/Trends-/commits/main";
    const SUPABASE_CONNECTIVITY_CACHE_KEY = "trends_supabase_connectivity_v1";
    const RUNTIME_ISSUES_KEY = "trends_runtime_issues_v1";
    const RUNTIME_ISSUES_LIMIT = 20;
    const SUPABASE_CONNECTIVITY_TTL_MS = 15000;
    const SUPABASE_CONNECTIVITY_RETRY_MS = 120000;
    const FILE_LIMITS = {
      avatar: 5 * 1024 * 1024,
      banner: 8 * 1024 * 1024,
      postImage: 12 * 1024 * 1024,
      postVideo: 50 * 1024 * 1024,
    };
    const ALLOWED_IMAGE_TYPES = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
    const ALLOWED_VIDEO_TYPES = new Set([
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ]);
    let settings = { ...defaultSettings };
    const PROFILE_EDIT_COLLAPSIBLE_KEYS = [
      "profile-edit-identity",
      "profile-edit-training",
      "profile-edit-media",
      "profile-edit-links",
    ];
    const PROFILE_EDIT_TRACKED_FIELD_IDS = [
      "profile-display",
      "profile-handle",
      "profile-bio-input",
      "profile-avatar-url",
      "profile-banner-url",
      "profile-location",
      "profile-height",
      "profile-experience",
      "profile-goal",
      "profile-gym",
      "profile-split",
      "profile-favorite",
      "profile-instagram",
      "profile-tiktok",
      "profile-youtube",
      "profile-website",
      "profile-accent",
    ];
    const commentSync = createCommentSync({
      supabase,
      translations: t,
      getCurrentUser: () => currentUser,
      getCurrentProfile: () => currentProfile,
      getCurrentLang: () => currentLang,
      getCommentsByPost: () => commentsByPost,
      renderFeed: () => renderFeed(),
      createNotification: (payload) => createNotification(payload),
      showToast: (message, tone) => showToast(message, tone),
    });
    const profileEditState = createProfileEditState({
      $,
      translations: t,
      getCurrentLang: () => currentLang,
      getCurrentUser: () => currentUser,
      trackedFieldIds: PROFILE_EDIT_TRACKED_FIELD_IDS,
      draftKeyBase: PROFILE_EDIT_DRAFT_KEY,
      getPendingAvatarFile: () => pendingAvatarFile,
      getPendingBannerFile: () => pendingBannerFile,
    });
    const settingsController = createSettingsController({
      $,
      translations: t,
      getSettings: () => settings,
      setSettings: (next) => {
        settings = next;
      },
      getCurrentLang: () => currentLang,
      setCurrentLang: (next) => {
        currentLang = next;
      },
      getShowExtraSections: () => showExtraSections,
      setShowExtraSections: (next) => {
        showExtraSections = !!next;
      },
      setCollapsibleOpen: (key, open, options) =>
        setCollapsibleOpen(key, open, options),
      setFeedState: (next) => setFeedState(next),
      updateFilterButtons: () => updateFilterButtons(),
      convertWeightValue,
      convertHeightValue,
      formatNumber,
      getWorkoutExercises: () => workoutExercises,
      renderWorkoutRows: () => {
        if (typeof renderWorkoutRows === "function") {
          renderWorkoutRows();
        }
      },
      applyTranslations: () => applyTranslations(),
      updateCollapsibleLabels: () => updateCollapsibleLabels(),
      renderFeed: () => renderFeed(),
      updateProfileSummary: () => updateProfileSummary(),
      renderWorkoutHistory: () => renderWorkoutHistory(),
      renderTrainingSummary: () => renderTrainingSummary(),
      renderPrList: () => renderPrList(),
      renderInsights: () => renderInsights(),
      renderOnboardingChecklist: () => renderOnboardingChecklist(),
      renderNotifications: () => renderNotifications(),
      getCurrentPublicProfileId: () => currentPublicProfileId,
      openPublicProfile: (userId) => openPublicProfile(userId),
      showToast: (message, tone) => showToast(message, tone),
    });

function formatFileSizeMb(bytes) {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
function getSafeFileExtension(file) {
      const name = file?.name || "";
      const parts = name.split(".");
      const raw = parts.length > 1 ? parts.pop().toLowerCase() : "";
      if (raw && /^[a-z0-9]+$/.test(raw)) return raw;
      const fromType = (file?.type || "").split("/")[1] || "";
      const safe = fromType.toLowerCase().replace(/[^a-z0-9]/g, "");
      return safe || "bin";
    }
function getFileValidationError(file, kind) {
      if (!file) return null;
      const lang = currentLang === "en" ? "en" : "ja";
      const isImage = ALLOWED_IMAGE_TYPES.has(file.type);
      const isVideo = ALLOWED_VIDEO_TYPES.has(file.type);
      if (kind === "avatar" || kind === "banner") {
        if (!isImage) {
          return lang === "ja"
            ? "画像ファイル（jpg/png/webp/gif）を選択してください。"
            : "Please choose an image file (jpg/png/webp/gif).";
        }
        const limit = kind === "avatar" ? FILE_LIMITS.avatar : FILE_LIMITS.banner;
        if (file.size > limit) {
          return lang === "ja"
            ? `ファイルサイズが大きすぎます（上限 ${formatFileSizeMb(limit)}）。`
            : `File is too large (max ${formatFileSizeMb(limit)}).`;
        }
        return null;
      }
      if (kind === "post") {
        if (!isImage && !isVideo) {
          return lang === "ja"
            ? "画像または動画ファイル（mp4/mov/webm）を選択してください。"
            : "Please choose an image or video file (mp4/mov/webm).";
        }
        const limit = isVideo ? FILE_LIMITS.postVideo : FILE_LIMITS.postImage;
        if (file.size > limit) {
          return lang === "ja"
            ? `ファイルサイズが大きすぎます（上限 ${formatFileSizeMb(limit)}）。`
            : `File is too large (max ${formatFileSizeMb(limit)}).`;
        }
      }
      return null;
    }
function loadSettings() {
      return settingsController.loadSettings();
    }
function saveSettings(next, options = {}) {
      return settingsController.saveSettings(next, options);
    }
function updateSettingsExpandLabel() {
      return settingsController.updateSettingsExpandLabel();
    }
function updateExtraSectionsVisibility() {
      return settingsController.updateExtraSectionsVisibility();
    }
function setupSettingsUI() {
      return settingsController.setupSettingsUI();
    }
function applySettings() {
      return settingsController.applySettings();
    }
function applySettingsPreset(preset) {
      return settingsController.applySettingsPreset(preset);
    }




    // ── フォロー数 / フォロワー数を取得 ─────────────────
async function getFollowCounts(userId) {
  if (!userId) return { following: 0, followers: 0 };

  const [followingRes, followerRes] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { head: true, count: "exact" })
      .eq("follower_id", userId),
    supabase
      .from("follows")
      .select("*", { head: true, count: "exact" })
      .eq("following_id", userId),
  ]);

  if (followingRes.error) {
    console.error("Error fetching following count:", followingRes.error);
  }
  if (followerRes.error) {
    console.error("Error fetching follower count:", followerRes.error);
  }

  return {
    following: followingRes.count ?? 0,
    followers: followerRes.count ?? 0,
  };
}


  // ----- ユーザーのプロフィール自動作成 -----
// プロフィールを取得（なければ自動作成）する
async function ensureProfileForUser(user) {
  if (!user) return;

  const userId = user.id;
  const defaultHandle =
    user.user_metadata?.handle ||
    (user.email ? user.email.split("@")[0] : "user");
  const defaultDisplay =
    user.user_metadata?.display_name || user.user_metadata?.name || defaultHandle;

  // 既存プロフィールを探す
  let { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("fetch profile error:", error);
    currentProfile = null;
    return;
  }

  // なかったら作る
  if (!data) {
    const { data: insertData, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        handle: defaultHandle,
        display_name: defaultDisplay,
        accent_color: "#e4572e",
      })
      .select()
      .single();

    if (insertError) {
      console.error("insert profile error:", insertError);
      currentProfile = null;
      return;
    }

    currentProfile = insertData;
  } else {
    currentProfile = data;
  }

  if (currentProfile) {
    profileCache.set(userId, currentProfile);
  }
}
// ログイン中ユーザーのフォロー数／フォロワー数を読み込む
  async function loadFollowStats() {
    if (!currentUser) {
      currentFollowingCount = null;
      currentFollowersCount = null;
      followingIds = new Set();
      return;
    }

    // 自分がフォローしている人
    const { data: following, error: err1 } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", currentUser.id);

    if (err1) {
      console.error("loadFollowStats following error:", err1);
      currentFollowingCount = null;
    } else {
      currentFollowingCount = following.length;
      followingIds = new Set(following.map((r) => r.following_id));
    }

    // 自分をフォローしている人
    const { count: followerCount, error: err2 } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", currentUser.id);

    if (err2) {
      console.error("loadFollowStats followers error:", err2);
      currentFollowersCount = null;
    } else {
      currentFollowersCount = followerCount ?? 0;
    }
  }

// ログイン中ユーザーの投稿数を読み込む
async function loadProfilePostCount() {
  if (!currentUser) {
    profilePostCount = null;
    return;
  }

  const { count, error } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("loadProfilePostCount error:", error);
    profilePostCount = null;
    return;
  }

  profilePostCount = count ?? 0;
}



    // ---- プロフィール用キャッシュ ----
    const profileCache = new Map();
    const PROFILE_SELECT_FIELDS =
      "id, handle, created_at, display_name, bio, avatar_url, banner_url, location, height_cm, experience_level, training_goal, gym, training_split, favorite_lifts, instagram, tiktok, youtube, website, accent_color";

    async function loadProfilesForUsers(userIds = []) {
      const ids = Array.from(
        new Set(
          (Array.isArray(userIds) ? userIds : [])
            .map((id) => `${id || ""}`.trim())
            .filter(Boolean)
        )
      );
      const result = new Map();
      if (!ids.length) return result;
      if (!supabase) return result;

      const missingIds = ids.filter((id) => !profileCache.has(id));
      if (missingIds.length) {
        const fetchedIds = new Set();
        const checkedIds = new Set();
        const batchSize = 100;
        for (let i = 0; i < missingIds.length; i += batchSize) {
          const batchIds = missingIds.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from("profiles")
            .select(PROFILE_SELECT_FIELDS)
            .in("id", batchIds);

          if (error) {
            console.error("loadProfilesForUsers error", error);
            continue;
          }
          batchIds.forEach((id) => checkedIds.add(id));
          (data || []).forEach((profile) => {
            if (!profile?.id) return;
            profileCache.set(profile.id, profile);
            fetchedIds.add(profile.id);
          });
        }
        checkedIds.forEach((id) => {
          if (!fetchedIds.has(id)) {
            profileCache.set(id, null);
          }
        });
      }

      ids.forEach((id) => {
        result.set(id, profileCache.has(id) ? profileCache.get(id) : null);
      });
      return result;
    }

    async function getProfile(userId) {
      if (!userId) return null;
      const id = `${userId}`.trim();
      if (!id) return null;
      if (profileCache.has(id)) {
        return profileCache.get(id);
      }
      const map = await loadProfilesForUsers([id]);
      return map.get(id) || null;
    }



    

    // ---- i18n ----
    





    function queueCollapsibleHeightRefresh() {
      if (typeof window === "undefined") return;
      if (collapsibleHeightRaf) {
        cancelAnimationFrame(collapsibleHeightRaf);
      }
      collapsibleHeightRaf = requestAnimationFrame(() => {
        collapsibleHeightRaf = 0;
        document.querySelectorAll(".collapsible-content.is-open").forEach((content) => {
          if (content.style.maxHeight === "none") return;
          content.style.maxHeight = `${content.scrollHeight}px`;
        });
      });
    }

    function applyCollapsibleContentState(content, isOpen, options = {}) {
      if (!content) return;
      const immediate = !!options.immediate;
      if (isOpen) {
        content.classList.add("is-open");
        content.setAttribute("aria-hidden", "false");
        if (content._collapseTransitionEndHandler) {
          content.removeEventListener(
            "transitionend",
            content._collapseTransitionEndHandler
          );
        }
        const onTransitionEnd = (event) => {
          if (event.propertyName !== "max-height") return;
          if (content.classList.contains("is-open")) {
            content.style.maxHeight = "none";
          }
          content.removeEventListener("transitionend", onTransitionEnd);
          content._collapseTransitionEndHandler = null;
        };
        content._collapseTransitionEndHandler = onTransitionEnd;
        content.addEventListener("transitionend", onTransitionEnd);
        content.style.maxHeight = `${content.scrollHeight}px`;
        if (immediate) {
          content.style.maxHeight = "none";
          content.removeEventListener("transitionend", onTransitionEnd);
          content._collapseTransitionEndHandler = null;
          return;
        }
        if (!immediate) {
          requestAnimationFrame(() => {
            if (content.classList.contains("is-open")) {
              content.style.maxHeight = `${content.scrollHeight}px`;
            }
          });
        }
        return;
      }

      if (content._collapseTransitionEndHandler) {
        content.removeEventListener(
          "transitionend",
          content._collapseTransitionEndHandler
        );
        content._collapseTransitionEndHandler = null;
      }
      const collapse = () => {
        content.classList.remove("is-open");
        content.style.maxHeight = "0px";
        content.setAttribute("aria-hidden", "true");
      };
      if (immediate) {
        collapse();
        return;
      }
      content.style.maxHeight = `${content.scrollHeight}px`;
      requestAnimationFrame(collapse);
    }

    function updateCollapsibleButton(btn, isOpen) {
      if (!btn) return;
      const tr = t[currentLang] || t.ja;
      const openLabel = btn.dataset.openLabelKey
        ? tr[btn.dataset.openLabelKey]
        : tr.showLess || "Hide";
      const closedLabel = btn.dataset.closedLabelKey
        ? tr[btn.dataset.closedLabelKey]
        : tr.showMore || "Show more";
      btn.textContent = isOpen ? openLabel : closedLabel;
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    function setupCollapsibles() {
      collapsibleControllers.clear();
      document.querySelectorAll("[data-collapsible]").forEach((wrapper) => {
        const content = wrapper.querySelector("[data-collapsible-content]");
        const btn = wrapper.querySelector("[data-collapsible-btn]");
        if (!content || !btn) return;
        const key = wrapper.dataset.collapsible || "";
        const stored = key
          ? localStorage.getItem(`trends_collapse_${key}`)
          : null;
        let isOpen =
          stored === "open"
            ? true
            : stored === "closed"
            ? false
            : wrapper.dataset.defaultOpen === "true";

        const applyState = (next, options = {}) => {
          isOpen = !!next;
          applyCollapsibleContentState(content, isOpen, options);
          updateCollapsibleButton(btn, isOpen);
          if (key) {
            localStorage.setItem(
              `trends_collapse_${key}`,
              isOpen ? "open" : "closed"
            );
          }
          if (key && key.startsWith("settings-")) {
            if (typeof updateSettingsExpandLabel === "function") {
              updateSettingsExpandLabel();
            }
          }
          if (key && key.startsWith("profile-edit-")) {
            if (typeof updateProfileEditAdvancedToggleLabel === "function") {
              updateProfileEditAdvancedToggleLabel();
            }
          }
          queueCollapsibleHeightRefresh();
        };

        btn.addEventListener("click", () => applyState(!isOpen));
        applyState(isOpen, { immediate: true });
        if (key) {
          collapsibleControllers.set(key, applyState);
        }
      });
      if (!collapsibleResizeBound && typeof window !== "undefined") {
        collapsibleResizeBound = true;
        window.addEventListener("resize", queueCollapsibleHeightRefresh, {
          passive: true,
        });
      }
      queueCollapsibleHeightRefresh();
    }

    function updateCollapsibleLabels() {
      document.querySelectorAll("[data-collapsible]").forEach((wrapper) => {
        const content = wrapper.querySelector("[data-collapsible-content]");
        const btn = wrapper.querySelector("[data-collapsible-btn]");
        if (!content || !btn) return;
        updateCollapsibleButton(btn, content.classList.contains("is-open"));
      });
      queueCollapsibleHeightRefresh();
    }

    function setCollapsibleOpen(key, isOpen) {
      if (!key || !collapsibleControllers.has(key)) return;
      const applyState = collapsibleControllers.get(key);
      if (typeof applyState === "function") {
        applyState(isOpen);
      }
    }

    function isCollapsibleOpenByKey(key) {
      const wrapper = document.querySelector(`[data-collapsible="${key}"]`);
      const content = wrapper?.querySelector("[data-collapsible-content]");
      return !!content?.classList.contains("is-open");
    }

    function areProfileEditGroupsOpen() {
      return PROFILE_EDIT_COLLAPSIBLE_KEYS.every((key) => isCollapsibleOpenByKey(key));
    }

    function setProfileEditGroupsOpen(isOpen) {
      PROFILE_EDIT_COLLAPSIBLE_KEYS.forEach((key) => {
        setCollapsibleOpen(key, isOpen);
      });
      updateProfileEditAdvancedToggleLabel();
    }

    function loadProfileEditCompactPreference() {
      try {
        const stored = localStorage.getItem(PROFILE_EDIT_COMPACT_KEY);
        if (stored === "0") {
          profileEditCompact = false;
          return;
        }
        if (stored === "1") {
          profileEditCompact = true;
          return;
        }
      } catch (error) {
        console.warn("profile edit compact preference load failed", error);
      }
      profileEditCompact = true;
    }

    function updateProfileEditCompactToggleLabel() {
      const btn = $("btn-profile-edit-compact");
      if (!btn) return;
      const tr = t[currentLang] || t.ja;
      btn.textContent = profileEditCompact
        ? tr.profileEditShowAdvanced || "項目を増やす"
        : tr.profileEditShowBasic || "項目を減らす";
      btn.setAttribute("aria-pressed", profileEditCompact ? "false" : "true");
    }

    function applyProfileEditCompactMode() {
      const section = $("profile-edit-section");
      if (!section) return;
      section.classList.toggle("profile-edit-compact", profileEditCompact);
      if (profileEditCompact) {
        setProfileEditGroupsOpen(false);
      }
      updateProfileEditCompactToggleLabel();
      queueCollapsibleHeightRefresh();
    }

    function updateProfileEditAdvancedToggleLabel() {
      const btn = $("btn-profile-edit-toggle-advanced");
      if (!btn) return;
      const tr = t[currentLang] || t.ja;
      if (profileEditCompact) {
        btn.textContent = tr.profileEditExpandAll || "詳細をまとめて表示";
        return;
      }
      btn.textContent = areProfileEditGroupsOpen()
        ? tr.profileEditCollapseAll || "詳細を閉じる"
        : tr.profileEditExpandAll || "詳細をまとめて表示";
    }

    function setupProfileEditAdvancedToggle() {
      const advancedBtn = $("btn-profile-edit-toggle-advanced");
      if (advancedBtn && advancedBtn.dataset.bound !== "true") {
        advancedBtn.dataset.bound = "true";
        advancedBtn.addEventListener("click", () => {
          setProfileEditGroupsOpen(!areProfileEditGroupsOpen());
        });
      }
      const compactBtn = $("btn-profile-edit-compact");
      if (compactBtn && compactBtn.dataset.bound !== "true") {
        compactBtn.dataset.bound = "true";
        compactBtn.addEventListener("click", () => {
          profileEditCompact = !profileEditCompact;
          try {
            localStorage.setItem(
              PROFILE_EDIT_COMPACT_KEY,
              profileEditCompact ? "1" : "0"
            );
          } catch (error) {
            console.warn("profile edit compact preference save failed", error);
          }
          applyProfileEditCompactMode();
          updateProfileEditAdvancedToggleLabel();
        });
      }
      const activePage =
        document.querySelector(".page-view.is-active")?.dataset.page || "";
      collapseProfileEditGroupsOnMobile(activePage);
      applyProfileEditCompactMode();
      updateProfileEditAdvancedToggleLabel();
    }

    function collapseProfileEditGroupsOnMobile(page = "") {
      if (page !== "account") return;
      if (profileEditCompact) {
        PROFILE_EDIT_COLLAPSIBLE_KEYS.forEach((key) => setCollapsibleOpen(key, false));
        updateProfileEditAdvancedToggleLabel();
        return;
      }
      if (window.innerWidth > 700) return;
      PROFILE_EDIT_COLLAPSIBLE_KEYS.forEach((key) => setCollapsibleOpen(key, false));
      updateProfileEditAdvancedToggleLabel();
    }

    function setupExtraSectionsToggle() {
      const btn = $("btn-toggle-sections");
      if (!btn) return;
      if (btn.dataset.bound !== "true") {
        btn.dataset.bound = "true";
        btn.addEventListener("click", () => {
          saveSettings({ showExtraSections: !showExtraSections });
        });
      }
      updateExtraSectionsVisibility();
    }














    // ================== 初期化 ==================
    window.addEventListener("DOMContentLoaded", init);
    window.addEventListener("hashchange", handleHashRoute);

    function sanitizeBuildVersion(value) {
      const raw = String(value || "").trim();
      const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "-");
      return safe || "dev-local";
    }

    function getSupabaseHostLabelFromUrl(url) {
      try {
        return new URL(String(url || "")).host;
      } catch {
        return String(url || "");
      }
    }

    function getSupabaseHostLabel() {
      return getSupabaseHostLabelFromUrl(SUPABASE_URL);
    }

    function normalizeSiteBaseUrl(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      try {
        const parsed = new URL(raw);
        return `${parsed.origin}${parsed.pathname.replace(/\/?$/, "/")}`;
      } catch {
        return "";
      }
    }

    function getLiveSiteUrl() {
      if (typeof window !== "undefined") {
        const { origin, hostname, pathname } = window.location;
        if (hostname === "homa-cell.github.io" && pathname.startsWith("/Trends-/")) {
          return normalizeSiteBaseUrl(`${origin}/Trends-/`) || DEFAULT_LIVE_SITE_URL;
        }
      }
      return DEFAULT_LIVE_SITE_URL;
    }

    function getLiveBuildMetaUrl() {
      return `${getLiveSiteUrl()}build-meta.json`;
    }

    function isLikelyCommitVersion(value) {
      const raw = String(value || "").trim();
      return /^[a-f0-9]{7,40}$/i.test(raw);
    }

    async function fetchGitHubMainCommitShortSha() {
      const response = await fetch(`${GITHUB_MAIN_COMMIT_API_URL}?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
        },
      });
      if (!response.ok) {
        throw new Error(`GitHub API HTTP ${response.status}`);
      }
      const payload = await response.json();
      const sha = String(payload?.sha || "").trim();
      if (!sha) {
        throw new Error("GitHub API missing sha");
      }
      return sha.slice(0, 12);
    }

    function normalizeSupabaseUrlInput(raw) {
      const value = String(raw || "").trim();
      if (!value) return "";
      const withProtocol = /^https?:\/\//i.test(value)
        ? value
        : `https://${value}`;
      try {
        const parsed = new URL(withProtocol);
        if (!/^https:$/i.test(parsed.protocol)) return "";
        return parsed.origin.replace(/\/$/, "");
      } catch {
        return "";
      }
    }

    function looksLikeSupabaseHost(url) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return host.endsWith(".supabase.co");
      } catch {
        return false;
      }
    }

    function looksLikeSupabaseAnonKey(value) {
      const raw = String(value || "").trim();
      if (!raw) return false;
      const parts = raw.split(".");
      return parts.length === 3 && raw.length >= 80;
    }

    function getKeyFingerprint(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const head = raw.slice(0, 6);
      const tail = raw.slice(-4);
      return `${head}...${tail} (${raw.length})`;
    }

    function isLikelyFetchError(error) {
      const message = String(error?.message || "");
      const name = String(error?.name || "");
      return (
        /failed to fetch/i.test(message) ||
        /networkerror/i.test(message) ||
        /fetcherror/i.test(name)
      );
    }

    function formatConnectionStatusMessage(
      result,
      tr = t[currentLang] || t.ja,
      hostOverride = ""
    ) {
      if (!result || result.ok === null) return "";
      const issueCode = getConnectivityIssueCode(result);
      const issueHint = getConnectivityIssueHint(issueCode, tr);
      if (result.ok) {
        return `${
          tr.settingsConnectionOk || "Connection is healthy."
        } (REST ${result.restStatus}, Auth ${result.authStatus})`;
      }
      const host = hostOverride || getSupabaseHostLabel();
      if (result.timedOut) {
        const base = `${
          tr.settingsConnectionTimeout || "Connection check timed out."
        } (${host})`;
        return issueHint ? `${base} ${issueHint}` : base;
      }
      if (result.restStatus || result.authStatus) {
        const base = `${
          tr.settingsConnectionFailed || "Connection check failed."
        } (REST ${result.restStatus || "-"}, Auth ${result.authStatus || "-"})`;
        return issueHint ? `${base} ${issueHint}` : base;
      }
      const base = `${tr.authNetworkError || "Cannot connect to Supabase."} (${host})`;
      return issueHint ? `${base} ${issueHint}` : base;
    }

    function getConnectivityIssueCode(result = supabaseConnectivityState) {
      if (!result || result.ok !== false) return "";
      if (result.timedOut) return "timeout";
      const restStatus = Number(result.restStatus || 0);
      const authStatus = Number(result.authStatus || 0);
      if ([401, 403].includes(restStatus) || [401, 403].includes(authStatus)) {
        return "auth";
      }
      if (restStatus === 404 || authStatus === 404) {
        return "notfound";
      }
      const errorText = `${result?.error?.message || result?.error?.details || result?.error?.hint || result?.error || ""}`
        .toLowerCase()
        .trim();
      if (
        errorText.includes("err_name_not_resolved") ||
        errorText.includes("name not resolved") ||
        errorText.includes("could not resolve") ||
        errorText.includes("enotfound") ||
        errorText.includes("dns")
      ) {
        return "dns";
      }
      if (
        errorText.includes("invalid api key") ||
        errorText.includes("jwt") ||
        errorText.includes("apikey")
      ) {
        return "auth";
      }
      return "network";
    }

    function getConnectivityIssueHint(code = "", tr = t[currentLang] || t.ja) {
      switch (code) {
        case "dns":
          return (
            tr.settingsConnectionHintDns ||
            "Project URL host could not be resolved. Re-check your project URL."
          );
        case "timeout":
          return (
            tr.settingsConnectionHintTimeout ||
            "Connection timed out. Retry after checking your network."
          );
        case "auth":
          return (
            tr.settingsConnectionHintAuth ||
            "Auth failed. Verify your anon key."
          );
        case "notfound":
          return (
            tr.settingsConnectionHintNotFound ||
            "Supabase endpoint was not found. Verify your project URL."
          );
        case "network":
          return (
            tr.settingsConnectionHintNetwork ||
            "Network request failed. Check your connection and endpoint."
          );
        default:
          return "";
      }
    }

    function isLocalSupabaseOverrideFailure(result = supabaseConnectivityState) {
      return SUPABASE_CONFIG_SOURCE === "local" && result?.ok === false;
    }

    function openSupabaseSettings() {
      if (typeof setActivePage === "function") {
        setActivePage("settings");
      } else {
        const tab = document.querySelector("[data-page-target='settings']");
        if (tab instanceof HTMLElement) {
          tab.click();
        }
      }
      const targetInput = document.getElementById("settings-supabase-url");
      if (targetInput) {
        setTimeout(() => {
          targetInput.focus();
          targetInput.select();
        }, 120);
      }
    }

    function resetSupabaseConfigToDefaultAndReload() {
      clearStoredSupabaseConfig();
      window.location.reload();
    }

    function renderAuthNetworkStatus(result = supabaseConnectivityState) {
      const el = $("auth-network-status");
      const actions = $("auth-network-actions");
      const resetBtn = $("btn-auth-reset-connection");
      if (!el) return;
      if (!result || result.ok === null) {
        el.textContent = "";
        el.classList.remove("feed-status-error", "feed-status-success", "feed-status-warning");
        if (actions) actions.classList.add("hidden");
        if (resetBtn) resetBtn.classList.add("hidden");
        return;
      }
      const tr = t[currentLang] || t.ja;
      const localOverrideFailure = isLocalSupabaseOverrideFailure(result);
      const baseMessage = formatConnectionStatusMessage(result, tr);
      el.textContent = localOverrideFailure
        ? `${baseMessage} ${tr.authLocalOverrideHint || ""}`.trim()
        : baseMessage;
      el.classList.remove("feed-status-error", "feed-status-success", "feed-status-warning");
      if (result.ok) {
        el.classList.add("feed-status-success");
      } else if (localOverrideFailure) {
        el.classList.add("feed-status-warning");
      } else {
        el.classList.add("feed-status-error");
      }
      if (actions) {
        actions.classList.toggle("hidden", result.ok);
      }
      if (resetBtn) {
        resetBtn.classList.toggle("hidden", !localOverrideFailure);
      }
    }

    function renderConnectivitySummary(result = supabaseConnectivityState) {
      const el = $("settings-connection-diagnostic");
      if (!el) return;
      const tr = t[currentLang] || t.ja;
      if (!result || result.ok === null) {
        el.textContent =
          tr.settingsConnectionSummaryNone || "No connection check yet.";
        return;
      }
      const checkedAtText =
        Number(result.checkedAt || 0) > 0
          ? formatDateTimeDisplay(new Date(result.checkedAt).toISOString())
          : "";
      const checkedLabel = checkedAtText
        ? `${tr.settingsConnectionSummaryCheckedAt || "Checked"}: ${checkedAtText}`
        : "";
      const sourceLabel =
        SUPABASE_CONFIG_SOURCE === "local"
          ? tr.settingsSupabaseSourceLocalShort || "local"
          : tr.settingsSupabaseSourceDefaultShort || "default";
      const parts = [
        formatConnectionStatusMessage(result, tr),
        `host: ${getSupabaseHostLabel()}`,
        `source: ${sourceLabel}`,
      ];
      if (checkedLabel) {
        parts.push(checkedLabel);
      }
      el.textContent = parts.join(" | ");
    }

    function normalizeConnectivityState(next = {}, fallback = {}) {
      return {
        ok:
          typeof next.ok === "boolean"
            ? next.ok
            : typeof fallback.ok === "boolean"
            ? fallback.ok
            : null,
        restStatus:
          Number.isFinite(next.restStatus) && next.restStatus >= 0
            ? next.restStatus
            : Number.isFinite(fallback.restStatus)
            ? fallback.restStatus
            : 0,
        authStatus:
          Number.isFinite(next.authStatus) && next.authStatus >= 0
            ? next.authStatus
            : Number.isFinite(fallback.authStatus)
            ? fallback.authStatus
            : 0,
        timedOut:
          typeof next.timedOut === "boolean"
            ? next.timedOut
            : !!fallback.timedOut,
        error: next.error || fallback.error || null,
        checkedAt:
          Number.isFinite(next.checkedAt) && next.checkedAt > 0
            ? next.checkedAt
            : Number.isFinite(fallback.checkedAt)
            ? fallback.checkedAt
            : 0,
        retryAfter:
          Number.isFinite(next.retryAfter) && next.retryAfter >= 0
            ? next.retryAfter
            : Number.isFinite(fallback.retryAfter)
            ? fallback.retryAfter
            : 0,
      };
    }

    function persistSupabaseConnectivityState() {
      try {
        const payload = {
          ok: supabaseConnectivityState.ok,
          restStatus: supabaseConnectivityState.restStatus || 0,
          authStatus: supabaseConnectivityState.authStatus || 0,
          timedOut: !!supabaseConnectivityState.timedOut,
          checkedAt: supabaseConnectivityState.checkedAt || 0,
          retryAfter: supabaseConnectivityState.retryAfter || 0,
        };
        localStorage.setItem(
          SUPABASE_CONNECTIVITY_CACHE_KEY,
          JSON.stringify(payload)
        );
      } catch {
        // ignore localStorage write failures
      }
    }

    function loadSupabaseConnectivityState() {
      try {
        const raw = localStorage.getItem(SUPABASE_CONNECTIVITY_CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        supabaseConnectivityState = normalizeConnectivityState(parsed);
      } catch {
        // ignore localStorage parse/read failures
      }
    }

    function setSupabaseConnectivityState(next = {}) {
      supabaseConnectivityState = normalizeConnectivityState(
        next,
        supabaseConnectivityState
      );
      persistSupabaseConnectivityState();
      renderAuthNetworkStatus(supabaseConnectivityState);
      renderConnectivitySummary(supabaseConnectivityState);
      return { ...supabaseConnectivityState };
    }

    function persistRuntimeIssues() {
      try {
        localStorage.setItem(RUNTIME_ISSUES_KEY, JSON.stringify(runtimeIssues));
      } catch {
        // ignore localStorage write failures
      }
    }

    function loadRuntimeIssues() {
      try {
        const raw = localStorage.getItem(RUNTIME_ISSUES_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        runtimeIssues = parsed
          .filter((entry) => entry && typeof entry === "object")
          .slice(0, RUNTIME_ISSUES_LIMIT);
      } catch {
        runtimeIssues = [];
      }
    }

    function pushRuntimeIssue(entry = {}) {
      const next = {
        ts: new Date().toISOString(),
        type: String(entry.type || "runtime"),
        message: String(entry.message || "").slice(0, 500),
        source: String(entry.source || "").slice(0, 500),
        stack: String(entry.stack || "").slice(0, 4000),
        count: 1,
      };
      if (!next.message && !next.source) return;
      const prev = runtimeIssues[0];
      if (
        prev &&
        prev.type === next.type &&
        prev.message === next.message &&
        prev.source === next.source &&
        prev.stack === next.stack
      ) {
        runtimeIssues[0] = {
          ...prev,
          ts: next.ts,
          count: Number(prev.count || 1) + 1,
        };
        persistRuntimeIssues();
        return;
      }
      runtimeIssues = [next, ...runtimeIssues].slice(0, RUNTIME_ISSUES_LIMIT);
      persistRuntimeIssues();
    }

    function clearRuntimeIssues() {
      runtimeIssues = [];
      try {
        localStorage.removeItem(RUNTIME_ISSUES_KEY);
      } catch {
        // ignore localStorage write failures
      }
    }

    function setupRuntimeIssueCapture() {
      if (runtimeIssueCaptureBound) return;
      runtimeIssueCaptureBound = true;
      if (typeof window === "undefined") return;
      loadRuntimeIssues();
      window.addEventListener("error", (event) => {
        const message = event?.message || "Unhandled error";
        const source =
          event?.filename && event?.lineno
            ? `${event.filename}:${event.lineno}:${event.colno || 0}`
            : event?.filename || "";
        const stack = event?.error?.stack || "";
        pushRuntimeIssue({
          type: "window.error",
          message,
          source,
          stack,
        });
      });
      window.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        const message =
          reason?.message ||
          (typeof reason === "string" ? reason : "Unhandled rejection");
        const stack = reason?.stack || "";
        pushRuntimeIssue({
          type: "unhandledrejection",
          message,
          source: "",
          stack,
        });
      });
    }

    async function runSupabaseConnectionProbe(options = {}) {
      const { url = SUPABASE_URL, anonKey = SUPABASE_ANON_KEY, timeoutMs = 8000 } = options;
      const authHeaders = { apikey: anonKey };
      const restHeaders = {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      };
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId =
        controller && typeof setTimeout === "function"
          ? setTimeout(() => controller.abort(), timeoutMs)
          : null;

      try {
        const requestOptions = (headers) => ({
          method: "GET",
          headers,
          cache: "no-store",
          ...(controller ? { signal: controller.signal } : {}),
        });
        const [restRes, authRes] = await Promise.all([
          fetch(`${url}/rest/v1/`, requestOptions(restHeaders)),
          fetch(`${url}/auth/v1/health`, requestOptions(authHeaders)),
        ]);
        const restReachable = restRes.status >= 200 && restRes.status < 500;
        const authReachable = authRes.status >= 200 && authRes.status < 500;
        const ok = restReachable && authReachable;
        return {
          ok,
          restStatus: restRes.status,
          authStatus: authRes.status,
          timedOut: false,
          error: null,
          checkedAt: Date.now(),
          retryAfter: ok ? 0 : Date.now() + SUPABASE_CONNECTIVITY_RETRY_MS,
        };
      } catch (error) {
        const timedOut = error?.name === "AbortError";
        return {
          ok: false,
          restStatus: 0,
          authStatus: 0,
          timedOut,
          error,
          checkedAt: Date.now(),
          retryAfter: Date.now() + SUPABASE_CONNECTIVITY_RETRY_MS,
        };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    async function runSupabaseConnectionTest(options = {}) {
      const { force = false, timeoutMs = 8000 } = options;
      const now = Date.now();
      if (!force) {
        if (
          supabaseConnectivityState.ok === false &&
          now < (supabaseConnectivityState.retryAfter || 0)
        ) {
          return { ...supabaseConnectivityState };
        }
        if (
          supabaseConnectivityState.checkedAt > 0 &&
          now - supabaseConnectivityState.checkedAt < SUPABASE_CONNECTIVITY_TTL_MS
        ) {
          return { ...supabaseConnectivityState };
        }
      }

      const next = await runSupabaseConnectionProbe({ timeoutMs });
      return setSupabaseConnectivityState(next);
    }

    function normalizeBuildMeta(meta = {}) {
      const version = sanitizeBuildVersion(
        meta?.version || meta?.build || meta?.commit || meta?.sha || "dev-local"
      );
      const builtAtRaw =
        typeof meta?.built_at === "string"
          ? meta.built_at
          : typeof meta?.builtAt === "string"
          ? meta.builtAt
          : "";
      const builtAt = builtAtRaw && !Number.isNaN(Date.parse(builtAtRaw))
        ? builtAtRaw
        : null;
      return { version, builtAt };
    }

    function renderBuildMeta() {
      const tr = t[currentLang] || t.ja;
      const versionLabelEl = $("settings-build-version-label");
      const builtAtLabelEl = $("settings-build-time-label");
      const versionValueEl = $("settings-build-version");
      const builtAtValueEl = $("settings-build-time");
      if (versionLabelEl) {
        versionLabelEl.textContent =
          tr.settingsBuildVersionLabel || "App build";
      }
      if (builtAtLabelEl) {
        builtAtLabelEl.textContent =
          tr.settingsBuildBuiltAtLabel || "Built at";
      }
      if (versionValueEl) {
        versionValueEl.textContent =
          appBuildMeta.version || tr.settingsBuildUnknown || "Unknown";
      }
      if (builtAtValueEl) {
        builtAtValueEl.textContent = appBuildMeta.builtAt
          ? formatDateTimeDisplay(appBuildMeta.builtAt)
          : tr.settingsBuildUnknown || "Unknown";
      }
    }

    async function loadBuildMeta(forceRefresh = false) {
      if (appBuildMetaLoaded && !forceRefresh) {
        renderBuildMeta();
        return appBuildMeta;
      }
      let nextMeta = { ...appBuildMeta };
      try {
        const response = await fetch(`${BUILD_META_URL}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const meta = await response.json();
          nextMeta = normalizeBuildMeta(meta);
        }
      } catch {
        // Keep fallback metadata when file/network is unavailable.
      }
      appBuildMeta = nextMeta;
      appBuildMetaLoaded = true;
      serviceWorkerBuildVersion = appBuildMeta.version || "dev-local";
      serviceWorkerScriptUrl = `./sw.js?v=${encodeURIComponent(
        serviceWorkerBuildVersion
      )}`;
      serviceWorkerBuildResolved = true;
      renderBuildMeta();
      return appBuildMeta;
    }

    async function resolveServiceWorkerScriptUrl(forceRefresh = false) {
      if (serviceWorkerBuildResolved && !forceRefresh) {
        return serviceWorkerScriptUrl;
      }
      await loadBuildMeta(forceRefresh);
      return serviceWorkerScriptUrl;
    }

    function isLocalPreviewHost() {
      if (typeof window === "undefined") return false;
      const hostname = window.location.hostname || "";
      return hostname === "localhost" || hostname === "127.0.0.1";
    }

    async function disableLocalServiceWorkerCaches() {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((registration) => registration.unregister())
          );
        } catch {
          // ignore unregister failures in local preview
        }
      }
      if (typeof caches === "undefined") return;
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith("trends-shell-"))
            .map((key) => caches.delete(key))
        );
      } catch {
        // ignore cache cleanup failures in local preview
      }
    }

    function setupServiceWorker() {
      if (serviceWorkerSetupDone) return;
      serviceWorkerSetupDone = true;
      if (typeof window === "undefined" || typeof navigator === "undefined") return;
      if (!("serviceWorker" in navigator)) return;
      if (isLocalPreviewHost()) {
        disableLocalServiceWorkerCaches().catch(() => {});
        return;
      }
      if (window.location.protocol !== "https:") return;

      const tr = () => t[currentLang] || t.ja;
      const activateWaitingWorker = (registration) => {
        const waiting = registration?.waiting;
        if (!waiting) return false;
        waiting.postMessage({ type: "SKIP_WAITING" });
        showToast(tr().appUpdateReady || "App updated. Reloading…", "success");
        return true;
      };

      resolveServiceWorkerScriptUrl()
        .then((scriptUrl) =>
          navigator.serviceWorker.register(scriptUrl, { updateViaCache: "none" })
        )
        .then((registration) => {
          if (!registration) return;

          if (!serviceWorkerControllerReloaded) {
            navigator.serviceWorker.addEventListener("controllerchange", () => {
              if (serviceWorkerControllerReloaded) return;
              serviceWorkerControllerReloaded = true;
              window.location.reload();
            });
          }

          if (!serviceWorkerVisibilityListenerBound) {
            serviceWorkerVisibilityListenerBound = true;
            document.addEventListener("visibilitychange", () => {
              if (document.visibilityState !== "visible") return;
              registration.update().catch(() => {});
            });
          }

          activateWaitingWorker(registration);
          registration.update().catch(() => {});
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                activateWaitingWorker(registration);
              }
            });
          });
        })
        .catch((error) => {
          console.warn("service worker registration failed", error);
        });
    }

    function scheduleIdleTask(task, options = {}) {
      const timeout = Number(options.timeout || 1000);
      if (
        typeof window !== "undefined" &&
        typeof window.requestIdleCallback === "function"
      ) {
        window.requestIdleCallback(task, { timeout });
        return;
      }
      setTimeout(() => {
        task({
          didTimeout: true,
          timeRemaining: () => 0,
        });
      }, 32);
    }

    function runDeferredSetupTasks() {
      const tasks = [
        () => setupProfileEditor(),
        () => setupTemplates(),
        () => setupMediaModal(),
        () => setupNotifications(),
        () => setupOnboardingActions(),
        () => setupCollapsibles(),
        () => loadProfileEditCompactPreference(),
        () => setupProfileEditAdvancedToggle(),
        () => setupProfileEditUnloadGuard(),
        () => setupProfileEditShortcuts(),
        () => setupSettingsUI(),
        () => setupExtraSectionsToggle(),
        () => setupDebug(),
        () => setupFollowButtons(),
      ];
      return new Promise((resolve) => {
        let index = 0;
        const runChunk = (deadline) => {
          let guard = 0;
          while (index < tasks.length) {
            const hasBudget =
              !deadline ||
              deadline.didTimeout ||
              (typeof deadline.timeRemaining === "function" &&
                deadline.timeRemaining() > 6) ||
              guard < 2;
            if (!hasBudget) break;
            const task = tasks[index];
            index += 1;
            guard += 1;
            try {
              task();
            } catch (error) {
              console.error("deferred setup task failed", error);
            }
          }
          if (index >= tasks.length) {
            resolve();
            return;
          }
          scheduleIdleTask(runChunk, { timeout: 1200 });
        };
        scheduleIdleTask(runChunk, { timeout: 700 });
      });
    }

    async function init() {
      setupRuntimeIssueCapture();
      loadSupabaseConnectivityState();
      loadSettings();
      loadBuildMeta();
      setupServiceWorker();
      commentSync.loadQueue();
      commentSync.setupOnlineSync();
      setupLanguageSwitcher();
      setupAuthUI();
      setupPostForm();
      setupFeedControls();
      setupPageTabs();
      setupMiniHeader();
      setupPostDetailModal();
      setupProfileLinks();
      applySettings();
      const deferredSetupPromise = runDeferredSetupTasks();
      await restoreSession();
      await loadFeed();
      await commentSync.flushQueue({ silent: true });
      handleHashRoute();
      await deferredSetupPromise;
    }
    

    // ------------------ 言語切り替え ------------------
    function setupLanguageSwitcher() {
      const select = $("lang-select");
      if (!select) return;
      select.value = currentLang;
      if (select.dataset.bound !== "true") {
        select.dataset.bound = "true";
        select.addEventListener("change", () => {
          saveSettings({ language: select.value });
        });
      }
      applyTranslations();
    }

    function handleHashRoute() {
      const hash = window.location.hash || "";
      if (hash.startsWith("#profile=")) {
        const userId = hash.replace("#profile=", "");
        if (userId) {
          openPublicProfile(userId);
          return;
        }
      }
      currentPublicProfileId = null;
      if (typeof setActivePage === "function") {
        setActivePage("feed");
      }
    }
    const KG_TO_LB = 2.2046226218;
    const CM_TO_IN = 0.3937007874;

    setUtilsContext({
      getCurrentLang: () => currentLang,
      getSettings: () => settings,
      getWorkoutLogsByPost: () => workoutLogsByPost,
      KG_TO_LB,
      CM_TO_IN,
    });

    setFeedContext({
      getCurrentUser: () => currentUser,
      getCurrentLang: () => currentLang,
      getSettings: () => settings,
      getAllPosts: () => allPosts,
      setAllPosts: (posts) => {
        allPosts = posts;
      },
      getWorkoutLogsByPost: () => workoutLogsByPost,
      loadWorkoutLogs,
      getCommentsByPost: () => commentsByPost,
      getCommentsExpanded: () => commentsExpanded,
      getCommentsLoading: () => commentsLoading,
      isCommentsEnabled: () => commentsEnabled,
      loadCommentsForPost,
      submitComment,
      toggleComments,
      createNotification,
      deletePost,
      getProfile,
      getProfilesForUsers: loadProfilesForUsers,
      toggleFollowForUser,
      loadFollowStats,
      getFollowingIds: () => followingIds,
      getLikedPostIds: () => likedPostIds,
      setLikedPostIds: (set) => {
        likedPostIds = set;
      },
      getLikesByPost: () => likesByPost,
      setLikesByPost: (map) => {
        likesByPost = map;
      },
      getLikesEnabled: () => likesEnabled,
      setLikesEnabled: (value) => {
        likesEnabled = value;
      },
      updateProfileSummary,
      renderWorkoutHistory,
      renderTrainingSummary,
      renderPrList,
      renderInsights,
      renderOnboardingChecklist,
      openPostModal: () => {
        if (typeof openPostModal === "function") {
          openPostModal();
        }
      },
      setActivePage: (page) => {
        if (typeof setActivePage === "function") {
          setActivePage(page);
        }
      },
      onFeedLayoutChange: (next) => saveSettings({ feedLayout: next }),
    });

    setProfileContext({
      getCurrentUser: () => currentUser,
      getCurrentLang: () => currentLang,
      getCurrentProfile: () => currentProfile,
      setCurrentProfile: (profile) => {
        currentProfile = profile;
      },
      getSettings: () => settings,
      getAllPosts: () => allPosts,
      getUserPosts,
      getProfilePostCount: () => profilePostCount || 0,
      getFollowingCount: () => currentFollowingCount || 0,
      getFollowersCount: () => currentFollowersCount || 0,
      getFollowingIds: () => followingIds,
      getCurrentPublicProfileId: () => currentPublicProfileId,
      setCurrentPublicProfileId: (id) => {
        currentPublicProfileId = id;
      },
      getPublicPostsVisibleCount: () => publicPostsVisibleCount,
      setPublicPostsVisibleCount: (count) => {
        publicPostsVisibleCount = count;
      },
      getPublicPostsPageSize: () => publicPostsPageSize,
      setCurrentGalleryPosts: (posts) => {
        currentGalleryPosts = posts;
      },
      getGalleryPage: () => galleryPage,
      setGalleryPage: (page) => {
        galleryPage = page;
      },
      renderGalleryPage,
      getProfile,
      getFollowCounts,
      setActivePage: (page) => {
        if (typeof setActivePage === "function") {
          setActivePage(page);
        }
      },
      toggleFollowForUser,
      loadFollowStats,
    });











    function getUserPosts() {
      const userId = `${currentUser?.id || ""}`.trim();
      if (!userId || !Array.isArray(allPosts) || !allPosts.length) {
        userPostsCache = {
          postsRef: null,
          userId: "",
          posts: [],
          postIds: new Set(),
          sortedByDateDesc: [],
        };
        return [];
      }
      if (userPostsCache.postsRef === allPosts && userPostsCache.userId === userId) {
        return userPostsCache.posts;
      }
      const posts = [];
      const postIds = new Set();
      allPosts.forEach((post) => {
        if (!post || post.user_id !== userId) return;
        posts.push(post);
        if (post.id) postIds.add(post.id);
      });
      userPostsCache = {
        postsRef: allPosts,
        userId,
        posts,
        postIds,
        sortedByDateDesc: [],
      };
      return posts;
    }

    function getUserPostIds() {
      getUserPosts();
      return userPostsCache.postIds;
    }

    function getUserPostsSortedByDateDesc() {
      const posts = getUserPosts();
      if (!posts.length) return [];
      if (
        userPostsCache.sortedByDateDesc.length &&
        userPostsCache.sortedByDateDesc.length === posts.length
      ) {
        return userPostsCache.sortedByDateDesc;
      }
      const sorted = posts.slice().sort((a, b) => {
        const aDate = new Date(a.date || a.created_at || 0).getTime();
        const bDate = new Date(b.date || b.created_at || 0).getTime();
        return bDate - aDate;
      });
      userPostsCache.sortedByDateDesc = sorted;
      return sorted;
    }



    function applyTranslations() {
      const tr = t[currentLang] || t.ja;

      // 要素が無いときは何もしない安全版セット関数
      const setText = (id, key) => {
        const el = $(id); // = document.getElementById(id)
        if (el && tr[key] !== undefined) {
          el.textContent = tr[key];
        }
      };

      const setPlaceholder = (id, key) => {
        const el = $(id);
        if (el && tr[key] !== undefined) {
          el.placeholder = tr[key];
        }
      };

      // タイトル
      setText("app-title", "appTitle");
      setText("app-sub", "appSub");
      setText("btn-open-post", "newPost");
      setText("mini-header-title", "appTitle");
      setText("nav-feed", "navFeed");
      setText("nav-account", "navAccount");
      setText("nav-settings", "navSettings");
      setText("mini-nav-feed", "navFeed");
      setText("mini-nav-account", "navAccount");
      setText("mini-nav-settings", "navSettings");
      setText("mini-btn-top", "backToTop");
      setText("mini-btn-post", "newPost");

      // 新規投稿まわり（要素がなければ自動的にスキップされる）
      setText("new-post-title", "newPost");
      setText("post-section-basic", "postSectionBasic");
      setText("post-section-media", "postSectionMedia");
      setText("post-section-workout", "postSectionWorkout");
      setText("post-section-caption", "postSectionCaption");
      setText("post-section-template", "postSectionTemplate");
      setText("post-section-visibility", "postSectionVisibility");
      setText("label-date", "date");
      setText("label-weight", "weight");
      setText("label-media", "media");
      setText("label-log", "workoutLogTitle");
      setText("label-caption", "caption");
      setText("label-template", "templateSelect");
      setText("label-visibility", "visibility");
      setText("visibility-public", "public");
      setText("visibility-private", "private");
      setText("btn-submit", "submit");
      setText("btn-reset", "reset");
      setText("btn-clear-draft", "draftClear");
      setText("draft-hint", "draftHint");
      setText("btn-remove-media", "mediaRemove");
      setText("btn-post-toggle-advanced", "postShowAdvanced");
      setText("post-composer-hint", "postSimpleHint");
      setText("login-required", "pleaseLogin");

      // Feed
      setText("feed-title", "feed");
      setText("btn-feed-refresh", "feedRefresh");
      setText("btn-feed-clear", "feedClear");
      setText("btn-feed-retry", "feedRetry");
      setText("btn-feed-options", "feedOptions");
      setText("btn-feed-layout", "feedLayoutGrid");
      setText("filter-all", "all");
      setText("filter-mine", "mine");
      setText("filter-public", "publicOnly");
      setText("filter-media", "filterMedia");
      setText("filter-workout", "filterWorkout");
      setText("sort-newest", "sortNewest");
      setText("sort-oldest", "sortOldest");
      setText("stat-today-label", "statTodayLabel");
      setText("stat-streak-label", "statStreakLabel");
      setText("stat-total-label", "statTotalLabel");
      setPlaceholder("feed-search", "searchPlaceholder");

      // アカウント / Tips / Debug
      setText("account-title", "account");
      setText("btn-auth", "loginSignup");
      setText("btn-logout", "logout");
      setText("btn-auth-open-settings", "authOpenConnectionSettings");
      setText("btn-auth-reset-connection", "authResetConnection");

      setText("settings-title", "settingsTitle");
      setText("settings-sub", "settingsSub");
      setText("btn-settings-expand", "settingsExpand");
      setText("btn-settings-recommended", "settingsPresetRecommended");
      setText("btn-settings-minimal", "settingsPresetMinimal");
      setText("btn-settings-full", "settingsPresetFull");
      setText("preset-recommended-title", "presetRecommendedTitle");
      setText("preset-recommended-desc", "presetRecommendedDesc");
      setText("preset-minimal-title", "presetMinimalTitle");
      setText("preset-minimal-desc", "presetMinimalDesc");
      setText("preset-balanced-title", "presetBalancedTitle");
      setText("preset-balanced-desc", "presetBalancedDesc");
      setText("preset-full-title", "presetFullTitle");
      setText("preset-full-desc", "presetFullDesc");
      setText("preset-badge-recommended", "presetBadge");
      setText("preset-badge-minimal", "presetBadge");
      setText("preset-badge-balanced", "presetBadge");
      setText("preset-badge-full", "presetBadge");
      setText("settings-group-basics", "settingsGroupBasics");
      setText("settings-group-social", "settingsGroupSocial");
      setText("settings-group-tools", "settingsGroupTools");
      setText("detail-workout-title", "detailWorkoutTitle");
      setText("detail-comments-title", "detailCommentsTitle");
      setText("settings-preferences-title", "settingsPreferencesTitle");
      setText("settings-preferences-sub", "settingsPreferencesSub");
      setText("settings-compact-title", "settingsCompactTitle");
      setText("settings-compact-desc", "settingsCompactDesc");
      setText("settings-lite-effects-title", "settingsLiteEffectsTitle");
      setText("settings-lite-effects-desc", "settingsLiteEffectsDesc");
      setText("settings-show-extra-title", "settingsShowExtraTitle");
      setText("settings-show-extra-desc", "settingsShowExtraDesc");
      setText("settings-show-feed-stats-title", "settingsShowFeedStatsTitle");
      setText("settings-show-feed-stats-desc", "settingsShowFeedStatsDesc");
      setText("settings-feed-auto-load-title", "settingsFeedAutoLoadTitle");
      setText("settings-feed-auto-load-desc", "settingsFeedAutoLoadDesc");
      setText("settings-default-filter-title", "settingsDefaultFilterTitle");
      setText("settings-default-filter-desc", "settingsDefaultFilterDesc");
      setText("settings-default-filter-all", "all");
      setText("settings-default-filter-mine", "mine");
      setText("settings-feed-layout-title", "settingsFeedLayoutTitle");
      setText("settings-feed-layout-desc", "settingsFeedLayoutDesc");
      setText("settings-feed-layout-list", "feedLayoutList");
      setText("settings-feed-layout-grid", "feedLayoutGrid");
      setText("settings-default-visibility-title", "settingsDefaultVisibilityTitle");
      setText("settings-default-visibility-desc", "settingsDefaultVisibilityDesc");
      setText("settings-default-visibility-public", "public");
      setText("settings-default-visibility-private", "private");
      setText("settings-privacy-title", "settingsPrivacyTitle");
      setText("settings-privacy-sub", "settingsPrivacySub");
      setText("settings-show-email-title", "settingsShowEmailTitle");
      setText("settings-show-email-desc", "settingsShowEmailDesc");
      setText("settings-show-profile-stats-title", "settingsShowProfileStatsTitle");
      setText("settings-show-profile-stats-desc", "settingsShowProfileStatsDesc");
      setText("settings-show-bodyweight-title", "settingsShowBodyweightTitle");
      setText("settings-show-bodyweight-desc", "settingsShowBodyweightDesc");
      setText("settings-notifications-title", "settingsNotificationsTitle");
      setText("settings-notifications-sub", "settingsNotificationsSub");
      setText("settings-notify-like-title", "settingsNotifyLikeTitle");
      setText("settings-notify-like-desc", "settingsNotifyLikeDesc");
      setText("settings-notify-comment-title", "settingsNotifyCommentTitle");
      setText("settings-notify-comment-desc", "settingsNotifyCommentDesc");
      setText("settings-notify-follow-title", "settingsNotifyFollowTitle");
      setText("settings-notify-follow-desc", "settingsNotifyFollowDesc");
      setText("btn-settings-mark-read", "notificationsMarkRead");
      setText("settings-notifications-note", "settingsNotificationsNote");
      setText("settings-language-title", "settingsLanguageTitle");
      setText("settings-language-sub", "settingsLanguageSub");
      setText("settings-language-label", "settingsLanguageLabel");
      setText("settings-language-desc", "settingsLanguageDesc");
      setText("settings-date-format-label", "settingsDateFormatLabel");
      setText("settings-date-format-desc", "settingsDateFormatDesc");
      setText("settings-date-format-auto", "settingsDateFormatAuto");
      setText("settings-date-format-ymd", "settingsDateFormatYmd");
      setText("settings-date-format-mdy", "settingsDateFormatMdy");
      setText("settings-weight-unit-label", "settingsWeightUnitLabel");
      setText("settings-weight-unit-desc", "settingsWeightUnitDesc");
      setText("settings-height-unit-label", "settingsHeightUnitLabel");
      setText("settings-height-unit-desc", "settingsHeightUnitDesc");
      setText("settings-data-title", "settingsDataTitle");
      setText("settings-data-sub", "settingsDataSub");
      setText("settings-supabase-title", "settingsSupabaseTitle");
      setText("settings-supabase-url-label", "settingsSupabaseUrlLabel");
      setText("settings-supabase-key-label", "settingsSupabaseKeyLabel");
      setText("btn-supabase-test", "settingsSupabaseTest");
      setText("btn-supabase-save", "settingsSupabaseSave");
      setText("btn-supabase-reset", "settingsSupabaseReset");
      setPlaceholder("settings-supabase-url", "settingsSupabaseUrlLabel");
      setPlaceholder("settings-supabase-key", "settingsSupabaseKeyLabel");
      const supabaseSourceEl = $("settings-supabase-source");
      if (supabaseSourceEl) {
        const sourceText =
          SUPABASE_CONFIG_SOURCE === "local"
            ? tr.settingsSupabaseSourceLocal ||
              "Current source: local override from this browser"
            : tr.settingsSupabaseSourceDefault ||
              "Current source: built-in default from app code";
        supabaseSourceEl.textContent = `${sourceText} (${getSupabaseHostLabel()})`;
      }
      setText("settings-build-version-label", "settingsBuildVersionLabel");
      setText("settings-build-time-label", "settingsBuildBuiltAtLabel");
      setText("btn-export-data", "settingsExportData");
      setText("btn-force-update", "forceAppUpdate");
      setText("btn-connection-test", "settingsConnectionTest");
      setText("btn-live-check", "settingsLiveCheck");
      setText("btn-open-live-site", "settingsOpenLiveSite");
      setText("btn-copy-diagnostics", "settingsCopyDiagnostics");
      setText("btn-download-diagnostics", "settingsDownloadDiagnostics");
      setText("btn-clear-diagnostics", "settingsClearDiagnostics");
      setText("btn-reset-settings", "settingsReset");
      setText("btn-toggle-perf-debug", "perfDebugEnable");

      setText("tips-title", "tipsTitle");
      setText("tip1", "tip1");
      setText("tip2", "tip2");
      setText("tip3", "tip3");
      setText("templates-title", "templatesTitle");
      setText("templates-sub", "templatesSub");
      setText("template-name-label", "templateName");
      setText("template-body-label", "templateBody");
      setText("btn-save-template", "templateSave");
      setText("btn-add-exercise", "workoutAddExercise");
      setText("rest-timer-label", "workoutRestLabel");
      setText("btn-rest-stop", "workoutRestStop");
      setText("notifications-title", "notificationsTitle");
      setText("notifications-sub", "notificationsSub");
      setText("btn-refresh-notifications", "notificationsRefresh");
      setText("btn-mark-all-read", "notificationsMarkRead");
      setText("public-profile-title", "publicProfile");
      setText("btn-back-to-feed", "back");
      setText("btn-share-profile", "shareProfile");
      setText("history-title", "workoutHistoryTitle");
      setText("history-sub", "workoutHistorySub");
      setText("gallery-title", "galleryTitle");
      setText("btn-gallery-prev", "galleryPrev");
      setText("btn-gallery-next", "galleryNext");

      setText("debug-title", "debugTitle");
      setText("btn-clear-cache", "clearCache");
      setText("profile-title", "profileTitle");
      setText("profile-facts-title", "profileFactsTitle");
      setText("profile-highlights-title", "profileHighlightsTitle");
      setText("profile-links-title", "profileLinksTitle");
      setText("public-profile-facts-title", "profileFactsTitle");
      setText("public-profile-highlights-title", "profileHighlightsTitle");
      setText("public-profile-links-title", "profileLinksTitle");
      setText("profile-edit-title", "profileEditTitle");
      setText("profile-edit-sub", "profileEditSub");
      setText("profile-edit-basics-title", "profileEditBasicsTitle");
      setText("profile-edit-identity-title", "profileEditIdentityTitle");
      setText("profile-edit-training-title", "profileEditTrainingTitle");
      setText("profile-edit-media-title", "profileEditMediaTitle");
      setText("profile-edit-links-title", "profileEditLinksTitle");
      setText("btn-profile-edit-compact", "profileEditShowAdvanced");
      setText("btn-profile-edit-toggle-advanced", "profileEditExpandAll");
      setText("profile-edit-compact-hint", "profileEditCompactHint");
      setText("profile-display-label", "profileDisplayName");
      setText("profile-handle-label", "profileHandle");
      setText("profile-bio-label", "profileBio");
      setText("profile-avatar-label", "profileAvatar");
      setText("profile-avatar-upload-label", "profileAvatarUpload");
      setText("profile-banner-label", "profileBanner");
      setText("profile-banner-upload-label", "profileBannerUpload");
      setText("profile-location-label", "profileLocation");
      setText("profile-height-label", "profileHeight");
      setText("profile-experience-label", "profileExperience");
      setText("profile-goal-label", "profileGoal");
      setText("profile-gym-label", "profileGym");
      setText("profile-split-label", "profileSplit");
      setText("profile-favorite-label", "profileFavoriteLifts");
      setText("profile-instagram-label", "profileInstagram");
      setText("profile-tiktok-label", "profileTiktok");
      setText("profile-youtube-label", "profileYouTube");
      setText("profile-website-label", "profileWebsite");
      setText("profile-accent-label", "profileAccent");
      setText("profile-edit-dirty", "profileUnsaved");
      setText("btn-reset-profile", "profileReset");
      setText("btn-save-profile", "profileSave");
      setPlaceholder("profile-display", "profileDisplayPlaceholder");
      setPlaceholder("profile-handle", "profileHandlePlaceholder");
      setPlaceholder("profile-bio-input", "profileBioPlaceholder");
      setPlaceholder("profile-avatar-url", "profileAvatarPlaceholder");
      setPlaceholder("profile-banner-url", "profileBannerPlaceholder");
      setPlaceholder("profile-location", "profileLocationPlaceholder");
      setPlaceholder("profile-goal", "profileGoalPlaceholder");
      setPlaceholder("profile-gym", "profileGymPlaceholder");
      setPlaceholder("profile-split", "profileSplitPlaceholder");
      setPlaceholder("profile-favorite", "profileFavoritePlaceholder");
      setPlaceholder("profile-instagram", "profileInstagramPlaceholder");
      setPlaceholder("profile-tiktok", "profileTiktokPlaceholder");
      setPlaceholder("profile-youtube", "profileYouTubePlaceholder");
      setPlaceholder("profile-website", "profileWebsitePlaceholder");
      setText("summary-title", "summaryTitle");
      setText("summary-sub", "summarySub");
      setText("summary-workouts-label", "summaryWorkouts");
      setText("summary-volume-label", "summaryVolume");
      setText("summary-exercises-label", "summaryExercises");
      setText("summary-prs-label", "summaryPrs");
      setText("summary-sets-label", "summarySets");
      setText("summary-reps-label", "summaryReps");
      setText("summary-avg-reps-label", "summaryAvgReps");
      setText("summary-weight-label", "summaryLatestWeight");
      setText("summary-activity-title", "summaryActivity");
      setText("summary-top-title", "summaryTopExercises");
      setText("pr-title", "prTitle");
      setText("pr-sub", "prSub");
      setText("onboarding-title", "onboardingTitle");
      setText("onboarding-sub", "onboardingSub");
      setText("btn-onboarding-post", "onboardingActionPost");
      setText("btn-onboarding-profile", "onboardingActionProfile");
      setText("insights-title", "insightsTitle");
      setText("insights-sub", "insightsSub");

      if (typeof populateExperienceOptions === "function") {
        populateExperienceOptions();
      }
      if (typeof populateTemplateSelect === "function") {
        populateTemplateSelect();
      }
      if (typeof renderTemplateList === "function") {
        renderTemplateList();
      }
      if (typeof renderNotifications === "function") {
        renderNotifications();
      }
      if (typeof renderWorkoutRows === "function") {
        renderWorkoutRows();
      }
      if (typeof renderWorkoutHistory === "function") {
        renderWorkoutHistory();
      }
      if (typeof renderTrainingSummary === "function") {
        renderTrainingSummary();
      }
      if (typeof renderPrList === "function") {
        renderPrList();
      }
      if (typeof renderInsights === "function") {
        renderInsights();
      }
      if (typeof renderOnboardingChecklist === "function") {
        renderOnboardingChecklist();
      }
      if (typeof renderPostComposerMode === "function") {
        renderPostComposerMode();
      }
      if (typeof updateCollapsibleLabels === "function") {
        updateCollapsibleLabels();
      }
      if (typeof updateProfileEditAdvancedToggleLabel === "function") {
        updateProfileEditAdvancedToggleLabel();
      }
      if (typeof updateProfileEditCompactToggleLabel === "function") {
        updateProfileEditCompactToggleLabel();
      }
      if (typeof updateProfileEditDirtyUI === "function") {
        updateProfileEditDirtyUI();
      }
      if (typeof setupExtraSectionsToggle === "function") {
        setupExtraSectionsToggle();
      }
      if (typeof setupDebug === "function") {
        setupDebug();
      }
      if (typeof renderBuildMeta === "function") {
        renderBuildMeta();
      }
      if (typeof openPublicProfile === "function" && currentPublicProfileId) {
        openPublicProfile(currentPublicProfileId);
      }
    }

      // ------------------ Auth ------------------
    function setupAuthUI() {
      const authBtn = $("btn-auth");
      const logoutBtn = $("btn-logout");
      const openSettingsBtn = $("btn-auth-open-settings");
      const resetConnectionBtn = $("btn-auth-reset-connection");
      if (authBtn && authBtn.dataset.bound !== "true") {
        authBtn.dataset.bound = "true";
        authBtn.addEventListener("click", handleAuthSubmit);
      }
      if (logoutBtn && logoutBtn.dataset.bound !== "true") {
        logoutBtn.dataset.bound = "true";
        logoutBtn.addEventListener("click", handleLogout);
      }
      if (openSettingsBtn && openSettingsBtn.dataset.bound !== "true") {
        openSettingsBtn.dataset.bound = "true";
        openSettingsBtn.addEventListener("click", () => {
          openSupabaseSettings();
        });
      }
      if (resetConnectionBtn && resetConnectionBtn.dataset.bound !== "true") {
        resetConnectionBtn.dataset.bound = "true";
        resetConnectionBtn.addEventListener("click", () => {
          resetSupabaseConfigToDefaultAndReload();
        });
      }
    }

    function scheduleProfileEditDraftSave() {
      profileEditState.scheduleDraftSave(280);
    }

    function applyProfileEditDraftIfAvailable() {
      if (!currentUser) return false;
      const restored = profileEditState.applyDraftIfAvailable(currentUser.id);
      if (!restored) return false;
      refreshProfileEditDirtyState();
      const status = $("profile-edit-status");
      if (status) {
        status.textContent = profileEditState.getDraftRestoredMessage();
      }
      return true;
    }

    function updateProfileEditDirtyUI() {
      const tr = t[currentLang] || t.ja;
      const section = $("profile-edit-section");
      const dirtyBadge = $("profile-edit-dirty");
      const saveBtn = $("btn-save-profile");
      const resetBtn = $("btn-reset-profile");
      const isDirty = profileEditState.isDirty();

      if (section) {
        section.classList.toggle("is-dirty", isDirty);
      }
      if (dirtyBadge) {
        dirtyBadge.textContent =
          tr.profileUnsaved || "未保存の変更があります。";
        dirtyBadge.classList.toggle("hidden", !isDirty);
      }
      if (resetBtn) {
        resetBtn.disabled = !currentUser || !isDirty;
      }
      if (saveBtn && !saveBtn.classList.contains("is-loading")) {
        saveBtn.disabled = !currentUser || !isDirty;
      }
    }

    function refreshProfileEditDirtyState() {
      profileEditState.refreshDirtyState();
      updateProfileEditDirtyUI();
    }

    function captureProfileEditBaseline() {
      profileEditState.captureBaseline();
      updateProfileEditDirtyUI();
    }

    function handleResetProfileEditor() {
      const tr = t[currentLang] || t.ja;
      if (!currentUser) return;
      if (!profileEditState.isDirty()) {
        showToast(tr.profileNoChanges || "変更はありません。", "warning");
        return;
      }
      profileEditState.cancelDraftSave();
      profileEditState.clearDraft(currentUser.id);
      populateProfileEditor();
      const status = $("profile-edit-status");
      if (status) status.textContent = "";
      showToast(
        tr.profileResetDone || "編集内容を元に戻しました。",
        "success"
      );
    }

    function confirmDiscardProfileChanges() {
      if (!profileEditState.isDirty()) return true;
      const tr = t[currentLang] || t.ja;
      return profileEditState.confirmDiscardChanges(
        tr.profileLeaveConfirm || "未保存の変更があります。ページを移動しますか？"
      );
    }

    function setupProfileEditUnloadGuard() {
      profileEditState.setupUnloadGuard();
    }

    function setupProfileEditShortcuts() {
      profileEditState.setupSaveShortcut({
        isEnabled: () => {
          const activePage =
            document.querySelector(".page-view.is-active")?.dataset.page || "";
          return activePage === "account" && !!currentUser && profileEditState.isDirty();
        },
        onSave: () => {
          handleSaveProfile();
        },
      });
    }

    function setupProfileEditor() {
      const fileInput = $("profile-avatar-file");
      if (fileInput) {
        fileInput.addEventListener("change", (e) => {
          const file = e.target.files?.[0] || null;
          const error = getFileValidationError(file, "avatar");
          if (error) {
            pendingAvatarFile = null;
            e.target.value = "";
            showToast(error, "warning");
            return;
          }
          pendingAvatarFile = file;
          refreshProfileEditDirtyState();
          scheduleProfileEditDraftSave();
        });
      }
      const bannerInput = $("profile-banner-file");
      if (bannerInput) {
        bannerInput.addEventListener("change", (e) => {
          const file = e.target.files?.[0] || null;
          const error = getFileValidationError(file, "banner");
          if (error) {
            pendingBannerFile = null;
            e.target.value = "";
            showToast(error, "warning");
            return;
          }
          pendingBannerFile = file;
          refreshProfileEditDirtyState();
          scheduleProfileEditDraftSave();
        });
      }
      const accentInput = $("profile-accent");
      if (accentInput) {
        accentInput.addEventListener("input", () => {
          const card = $("profile-section");
          if (card) {
            applyProfileTheme(card, { accent_color: accentInput.value });
          }
          refreshProfileEditDirtyState();
          scheduleProfileEditDraftSave();
        });
      }
      const bannerUrlInput = $("profile-banner-url");
      if (bannerUrlInput) {
        bannerUrlInput.addEventListener("input", () => {
          const banner = $("profile-banner");
          applyProfileBanner(banner, { banner_url: bannerUrlInput.value });
          refreshProfileEditDirtyState();
          scheduleProfileEditDraftSave();
        });
      }

      const editSection = $("profile-edit-section");
      if (editSection && editSection.dataset.dirtyBound !== "true") {
        editSection.dataset.dirtyBound = "true";
        const onProfileInput = (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          if (!target.closest("#profile-edit-section")) return;
          if (target.id === "profile-avatar-file" || target.id === "profile-banner-file") {
            return;
          }
          if (target.matches("input, textarea, select")) {
            refreshProfileEditDirtyState();
            scheduleProfileEditDraftSave();
          }
        };
        editSection.addEventListener("input", onProfileInput);
        editSection.addEventListener("change", onProfileInput);
      }

      const saveBtn = $("btn-save-profile");
      if (saveBtn) {
        saveBtn.addEventListener("click", handleSaveProfile);
      }
      const resetBtn = $("btn-reset-profile");
      if (resetBtn) {
        resetBtn.addEventListener("click", handleResetProfileEditor);
      }

      populateProfileEditor();
    }

    function populateExperienceOptions() {
      const select = $("profile-experience");
      if (!select) return;
      const tr = t[currentLang] || t.ja;
      const options = [
        { value: "", label: "-" },
        { value: "beginner", label: tr.experienceBeginner || "Beginner" },
        { value: "intermediate", label: tr.experienceIntermediate || "Intermediate" },
        { value: "advanced", label: tr.experienceAdvanced || "Advanced" },
        { value: "pro", label: tr.experiencePro || "Competitive" },
      ];
      select.innerHTML = "";
      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      });
    }

    function populateProfileEditor() {
      const displayEl = $("profile-display");
      const handleEl = $("profile-handle");
      const bioEl = $("profile-bio-input");
      const avatarUrlEl = $("profile-avatar-url");
      const avatarFileEl = $("profile-avatar-file");
      const bannerUrlEl = $("profile-banner-url");
      const bannerFileEl = $("profile-banner-file");
      const locationEl = $("profile-location");
      const heightEl = $("profile-height");
      const experienceEl = $("profile-experience");
      const goalEl = $("profile-goal");
      const gymEl = $("profile-gym");
      const splitEl = $("profile-split");
      const favoriteEl = $("profile-favorite");
      const instagramEl = $("profile-instagram");
      const tiktokEl = $("profile-tiktok");
      const youtubeEl = $("profile-youtube");
      const websiteEl = $("profile-website");
      const accentEl = $("profile-accent");
      const status = $("profile-edit-status");
      const saveBtn = $("btn-save-profile");
      const resetBtn = $("btn-reset-profile");
      const disabled = !currentUser;

      if (displayEl) displayEl.disabled = disabled;
      if (handleEl) handleEl.disabled = disabled;
      if (bioEl) bioEl.disabled = disabled;
      if (avatarUrlEl) avatarUrlEl.disabled = disabled;
      if (avatarFileEl) avatarFileEl.disabled = disabled;
      if (bannerUrlEl) bannerUrlEl.disabled = disabled;
      if (bannerFileEl) bannerFileEl.disabled = disabled;
      if (locationEl) locationEl.disabled = disabled;
      if (heightEl) heightEl.disabled = disabled;
      if (experienceEl) experienceEl.disabled = disabled;
      if (goalEl) goalEl.disabled = disabled;
      if (gymEl) gymEl.disabled = disabled;
      if (splitEl) splitEl.disabled = disabled;
      if (favoriteEl) favoriteEl.disabled = disabled;
      if (instagramEl) instagramEl.disabled = disabled;
      if (tiktokEl) tiktokEl.disabled = disabled;
      if (youtubeEl) youtubeEl.disabled = disabled;
      if (websiteEl) websiteEl.disabled = disabled;
      if (accentEl) accentEl.disabled = disabled;
      if (saveBtn && !saveBtn.classList.contains("is-loading")) saveBtn.disabled = disabled;
      if (resetBtn) resetBtn.disabled = true;
      if (status) status.textContent = "";

      if (!currentUser) {
        profileEditState.cancelDraftSave();
        if (displayEl) displayEl.value = "";
        if (handleEl) handleEl.value = "";
        if (bioEl) bioEl.value = "";
        if (avatarUrlEl) avatarUrlEl.value = "";
        if (avatarFileEl) avatarFileEl.value = "";
        if (bannerUrlEl) bannerUrlEl.value = "";
        if (bannerFileEl) bannerFileEl.value = "";
        if (locationEl) locationEl.value = "";
        if (heightEl) heightEl.value = "";
        if (experienceEl) experienceEl.value = "";
        if (goalEl) goalEl.value = "";
        if (gymEl) gymEl.value = "";
        if (splitEl) splitEl.value = "";
        if (favoriteEl) favoriteEl.value = "";
        if (instagramEl) instagramEl.value = "";
        if (tiktokEl) tiktokEl.value = "";
        if (youtubeEl) youtubeEl.value = "";
        if (websiteEl) websiteEl.value = "";
        if (accentEl) accentEl.value = "#e4572e";
        pendingAvatarFile = null;
        pendingBannerFile = null;
        captureProfileEditBaseline();
        return;
      }

      populateExperienceOptions();
      if (displayEl) displayEl.value = currentProfile?.display_name || "";
      if (handleEl) handleEl.value = currentProfile?.handle || "";
      if (bioEl) bioEl.value = currentProfile?.bio || "";
      if (avatarUrlEl) avatarUrlEl.value = currentProfile?.avatar_url || "";
      if (avatarFileEl) avatarFileEl.value = "";
      if (bannerUrlEl) bannerUrlEl.value = currentProfile?.banner_url || "";
      if (bannerFileEl) bannerFileEl.value = "";
      if (locationEl) locationEl.value = currentProfile?.location || "";
      if (heightEl) {
        if (currentProfile?.height_cm !== null && currentProfile?.height_cm !== undefined && currentProfile?.height_cm !== "") {
          const converted = convertHeightValue(
            currentProfile.height_cm,
            "cm",
            settings.heightUnit
          );
          heightEl.value = converted !== null ? formatNumber(converted, 1) : "";
        } else {
          heightEl.value = "";
        }
      }
      if (experienceEl) experienceEl.value = currentProfile?.experience_level || "";
      if (goalEl) goalEl.value = currentProfile?.training_goal || "";
      if (gymEl) gymEl.value = currentProfile?.gym || "";
      if (splitEl) splitEl.value = currentProfile?.training_split || "";
      if (favoriteEl) favoriteEl.value = currentProfile?.favorite_lifts || "";
      if (instagramEl) instagramEl.value = currentProfile?.instagram || "";
      if (tiktokEl) tiktokEl.value = currentProfile?.tiktok || "";
      if (youtubeEl) youtubeEl.value = currentProfile?.youtube || "";
      if (websiteEl) websiteEl.value = currentProfile?.website || "";
      if (accentEl) accentEl.value = currentProfile?.accent_color || "#e4572e";
      pendingAvatarFile = null;
      pendingBannerFile = null;
      captureProfileEditBaseline();
      applyProfileEditDraftIfAvailable();
    }

    async function handleSaveProfile() {
      if (!currentUser) {
        showToast("ログインしてください。", "warning");
        return;
      }

      const tr = t[currentLang] || t.ja;
      const status = $("profile-edit-status");
      const saveBtn = $("btn-save-profile");
      if (saveBtn?.classList.contains("is-loading")) {
        return;
      }
      if (status) status.textContent = "";
      refreshProfileEditDirtyState();
      if (!profileEditState.isDirty()) {
        showToast(tr.profileNoChanges || "変更はありません。", "warning");
        updateProfileEditDirtyUI();
        return;
      }
      setButtonLoading(saveBtn, true, "Saving...");

      try {
        const displayEl = $("profile-display");
        const handleEl = $("profile-handle");
        const bioEl = $("profile-bio-input");
        const avatarUrlEl = $("profile-avatar-url");
        const avatarFileEl = $("profile-avatar-file");
        const bannerUrlEl = $("profile-banner-url");
        const bannerFileEl = $("profile-banner-file");
        const locationEl = $("profile-location");
        const heightEl = $("profile-height");
        const experienceEl = $("profile-experience");
        const goalEl = $("profile-goal");
        const gymEl = $("profile-gym");
        const splitEl = $("profile-split");
        const favoriteEl = $("profile-favorite");
        const instagramEl = $("profile-instagram");
        const tiktokEl = $("profile-tiktok");
        const youtubeEl = $("profile-youtube");
        const websiteEl = $("profile-website");
        const accentEl = $("profile-accent");

        const displayName = displayEl?.value.trim() || null;
        let handle = handleEl?.value.trim() || "";
        if (handle.startsWith("@")) {
          handle = handle.slice(1);
        }
        if (!handle) {
          handle =
            currentProfile?.handle ||
            (currentUser.email ? currentUser.email.split("@")[0] : "user");
        }

        const bio = bioEl?.value.trim() || null;
        let avatarUrl = avatarUrlEl?.value.trim() || null;
        let bannerUrl = bannerUrlEl?.value.trim() || null;
        const location = locationEl?.value.trim() || null;
        const heightRaw = heightEl?.value ? Number(heightEl.value) : null;
        const heightValue =
          heightRaw !== null && heightRaw !== undefined
            ? convertHeightValue(heightRaw, settings.heightUnit, "cm")
            : null;
        const experience = experienceEl?.value || null;
        const goal = goalEl?.value.trim() || null;
        const gym = gymEl?.value.trim() || null;
        const split = splitEl?.value.trim() || null;
        const favorite = favoriteEl?.value.trim() || null;
        const instagram = instagramEl?.value.trim() || null;
        const tiktok = tiktokEl?.value.trim() || null;
        const youtube = youtubeEl?.value.trim() || null;
        const website = websiteEl?.value.trim() || null;
        const accent = accentEl?.value || "#e4572e";

        const avatarValidationError = getFileValidationError(pendingAvatarFile, "avatar");
        if (avatarValidationError) {
          if (status) status.textContent = avatarValidationError;
          showToast(avatarValidationError, "warning");
          return;
        }
        const bannerValidationError = getFileValidationError(pendingBannerFile, "banner");
        if (bannerValidationError) {
          if (status) status.textContent = bannerValidationError;
          showToast(bannerValidationError, "warning");
          return;
        }

        if (pendingAvatarFile) {
          const ext = getSafeFileExtension(pendingAvatarFile);
          const path = `public/${currentUser.id}/${Date.now()}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from("avatars")
            .upload(path, pendingAvatarFile, { upsert: true });

          if (uploadErr) {
            console.error("avatar upload error:", uploadErr);
            if (status) status.textContent = uploadErr.message;
            showToast(uploadErr.message, "error");
            return;
          }

          const { data: publicData } = supabase.storage
            .from("avatars")
            .getPublicUrl(path);
          avatarUrl = publicData?.publicUrl || avatarUrl;
          if (avatarUrlEl) avatarUrlEl.value = avatarUrl || "";
        }

        if (pendingBannerFile) {
          const ext = getSafeFileExtension(pendingBannerFile);
          const path = `public/${currentUser.id}/banner_${Date.now()}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from("avatars")
            .upload(path, pendingBannerFile, { upsert: true });

          if (uploadErr) {
            console.error("banner upload error:", uploadErr);
            if (status) status.textContent = uploadErr.message;
            showToast(uploadErr.message, "error");
            return;
          }

          const { data: publicData } = supabase.storage
            .from("avatars")
            .getPublicUrl(path);
          bannerUrl = publicData?.publicUrl || bannerUrl;
          if (bannerUrlEl) bannerUrlEl.value = bannerUrl || "";
        }

        const { data, error } = await supabase
          .from("profiles")
          .update({
          display_name: displayName,
          handle: handle || null,
          bio,
          avatar_url: avatarUrl,
          banner_url: bannerUrl,
          location,
          height_cm: Number.isFinite(heightValue) ? heightValue : null,
          experience_level: experience,
          training_goal: goal,
          gym,
          training_split: split,
          favorite_lifts: favorite,
          instagram,
          tiktok,
          youtube,
          website,
          accent_color: accent,
        })
        .eq("id", currentUser.id)
        .select(
          "id, handle, created_at, display_name, bio, avatar_url, banner_url, location, height_cm, experience_level, training_goal, gym, training_split, favorite_lifts, instagram, tiktok, youtube, website, accent_color"
        )
        .single();

        if (error || !data) {
          console.error("profile update error:", error);
          if (status) {
            status.textContent =
              tr.profileSaveError || "Failed to update profile.";
          }
          showToast(tr.profileSaveError || "Failed to update profile.", "error");
          return;
        }

        currentProfile = data;
        profileCache.set(currentUser.id, data);
        if (Array.isArray(allPosts)) {
          allPosts = allPosts.map((post) =>
            post.user_id === currentUser.id ? { ...post, profile: data } : post
          );
        }
        if (avatarFileEl) avatarFileEl.value = "";
        if (bannerFileEl) bannerFileEl.value = "";
        pendingAvatarFile = null;
        pendingBannerFile = null;
        profileEditState.cancelDraftSave();
        profileEditState.clearDraft(currentUser.id);
        updateAuthUIState();
        updateProfileSummary();
        populateProfileEditor();
        renderFeed();
        renderWorkoutHistory();
        renderTrainingSummary();
        renderInsights();
        renderOnboardingChecklist();
        if (currentPublicProfileId === currentUser.id) {
          openPublicProfile(currentUser.id);
        }
        if (status) {
          status.textContent = tr.profileSaveSuccess || "Profile updated.";
        }
        showToast(tr.profileSaveSuccess || "Profile updated.", "success");
      } finally {
        setButtonLoading(saveBtn, false);
        updateProfileEditDirtyUI();
      }
    }

    async function handleAuthSubmit() {
      const email = $("auth-email").value.trim();
      const password = $("auth-password").value.trim();
      const authBtn = $("btn-auth");
      const tr = t[currentLang] || t.ja;
      const now = Date.now();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email || !password) {
        showToast(
          tr.authMissingCredentials || "Email と Password を入力してください。",
          "warning"
        );
        return;
      }

      if (!emailPattern.test(email)) {
        showToast(
          tr.authInvalidEmail || "メールアドレスの形式を確認してください。",
          "warning"
        );
        return;
      }

      if (now < authRetryBlockedUntil) {
        const seconds = Math.max(
          1,
          Math.ceil((authRetryBlockedUntil - now) / 1000)
        );
        showToast(
          `${
            tr.authRetryLater || "少し待ってから再試行してください。"
          } (${seconds}s)`,
          "warning"
        );
        return;
      }

      setButtonLoading(authBtn, true, "Logging in...");

      try {
        let user = null;

        // 1. ログインを試す
        let { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        // 2. 無効な認証情報なら、そのメールでサインアップを試す
        if (error && error.message === "Invalid login credentials") {
          ({ data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                handle: email.split("@")[0],
              },
            },
          }));
        }

        if (error) {
          if (isLikelyFetchError(error)) {
            authRetryBlockedUntil = Date.now() + 5000;
            setSupabaseConnectivityState({
              ok: false,
              restStatus: 0,
              authStatus: 0,
              timedOut: false,
              error,
              checkedAt: Date.now(),
              retryAfter: Date.now() + SUPABASE_CONNECTIVITY_RETRY_MS,
            });
            renderAuthNetworkStatus(supabaseConnectivityState);
            showToast(
              `${tr.authNetworkError || "Supabase に接続できません。"} (${getSupabaseHostLabel()})`,
              "error"
            );
          } else {
            console.warn("Auth error:", error);
            showToast(
              tr.authFailed || "ログイン / サインアップに失敗しました。",
              "error"
            );
          }
          return;
        }

        if (data && data.user) {
          user = data.user;
        }

        if (!user) {
          showToast(tr.authLoginFailed || "ログインに失敗しました。", "error");
          return;
        }

        // ログイン成功
        currentUser = user;
        setSupabaseConnectivityState({
          ok: true,
          timedOut: false,
          error: null,
          checkedAt: Date.now(),
          retryAfter: 0,
        });

        // プロフィールを自動作成＆取得
        await ensureProfileForUser(currentUser);

        // 投稿数も読み込む
        await loadProfilePostCount();

        await loadFollowStats();

        updateAuthUIState();
        populateProfileEditor();
        await loadExercisePRs();
        await loadTemplates();
        await loadNotifications();
        await loadFeed();
        await commentSync.flushQueue({ silent: true });

        showToast(tr.authLoginSuccess || "ログインしました！", "success");
      } finally {
        setButtonLoading(authBtn, false);
      }
    }



    async function handleLogout() {
      if (!confirmDiscardProfileChanges()) {
        return;
      }
      await supabase.auth.signOut();
      currentUser = null;
      currentProfile = null;
      profilePostCount = null;
      currentFollowingCount = 0;
      currentFollowersCount = 0;
      followingIds = new Set();
      profileCache.clear();
      templates = [];
      templatesEnabled = true;
      commentsByPost.clear();
      commentsExpanded.clear();
      commentsLoading.clear();
      commentSync.clearLoadedPosts();
      commentsEnabled = true;
      likesByPost = new Map();
      likedPostIds = new Set();
      likesEnabled = true;
      notifications = [];
      notificationsEnabled = true;
      workoutExercises = [];
      workoutLogsByPost = new Map();
      workoutLogsEnabled = true;
      stopRestTimer();
      currentPublicProfileId = null;
      exercisePRs = new Map();
      prTrackingEnabled = true;
      clearPostDraft();
      profileEditState.resetState();
      pendingAvatarFile = null;
      pendingBannerFile = null;
      setFeedState({ isFeedLoading: false, feedError: "" });
      updateAuthUIState();
      renderFeed();
      updateProfileSummary();
      populateProfileEditor();
      renderTemplateList();
      populateTemplateSelect();
      renderNotifications();
      renderWorkoutRows();
      renderWorkoutHistory();
      renderTrainingSummary();
      renderPrList();
      renderInsights();
      renderOnboardingChecklist();
      if (window.location.hash) {
        history.replaceState(null, "", window.location.pathname);
      }
    }

    function updateAuthUIState() {
      const loggedIn = !!currentUser;

      $("auth-email").disabled = loggedIn;
      $("auth-password").disabled = loggedIn;
      $("btn-auth").style.display = loggedIn ? "none" : "inline-flex";
      $("btn-logout").style.display = loggedIn ? "inline-flex" : "none";
      $("login-required").style.display = loggedIn ? "none" : "block";
      $("btn-submit").disabled = !loggedIn;
      const topPostBtn = $("btn-open-post");
      if (topPostBtn) topPostBtn.disabled = !loggedIn;
      const miniPostBtn = $("mini-btn-post");
      if (miniPostBtn) miniPostBtn.disabled = !loggedIn;
      const fab = $("fab-open-post");
      if (fab) fab.disabled = !loggedIn;

      const accountLabel = $("account-user");
      if (loggedIn && currentProfile) {
        const display = getProfileDisplayName(currentProfile, "user");
        const handle = currentProfile.handle ? formatHandle(currentProfile.handle) : "";
        accountLabel.textContent = handle ? `${display} ${handle}` : display;
      } else if (loggedIn && currentUser?.email) {
        accountLabel.textContent = currentUser.email;
      } else {
        accountLabel.textContent = "-";
      }
      renderAuthNetworkStatus();
    }

    async function restoreSession() {
      const now = Date.now();
      if (
        supabaseConnectivityState.ok === false &&
        now < (supabaseConnectivityState.retryAfter || 0)
      ) {
        currentUser = null;
        currentProfile = null;
        profilePostCount = null;
        updateProfileSummary();
        updateAuthUIState();
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (error) {
        if (isLikelyFetchError(error)) {
          setSupabaseConnectivityState({
            ok: false,
            restStatus: 0,
            authStatus: 0,
            timedOut: false,
            error,
            checkedAt: Date.now(),
            retryAfter: Date.now() + SUPABASE_CONNECTIVITY_RETRY_MS,
          });
        } else {
          console.warn("restoreSession error:", error);
        }
        currentUser = null;
        currentProfile = null;
        profilePostCount = null;
        updateProfileSummary();
        updateAuthUIState();
        return;
      }

      const session = data?.session;
      currentUser = session?.user || null;

      if (!currentUser) {
        currentProfile = null;
        profilePostCount = null;
        updateProfileSummary();
        updateAuthUIState();
        return;
      }

      setSupabaseConnectivityState({
        ok: true,
        timedOut: false,
        error: null,
        checkedAt: Date.now(),
        retryAfter: 0,
      });

      // ユーザーのプロフィールと投稿数を読み込み
      await ensureProfileForUser(currentUser);
      await loadProfilePostCount();
      await loadFollowStats();
      await loadExercisePRs();
      await loadTemplates();
      await loadNotifications();
      await commentSync.flushQueue({ silent: true });

      updateProfileSummary();
      updateAuthUIState();
      populateProfileEditor();
    }



    function setupPageTabs() {
      const tabs = document.querySelectorAll("[data-page-target]");
      const views = document.querySelectorAll(".page-view");
      if (!tabs.length || !views.length) return;

      const pageScrollMap = new Map();
      const getVisiblePage = () =>
        document.querySelector(".page-view.is-active")?.dataset.page || "";
      const rememberScroll = (page) => {
        if (!page) return;
        pageScrollMap.set(page, Math.max(0, window.scrollY || window.pageYOffset || 0));
      };
      const restoreScroll = (page, behavior = "auto") => {
        const top = pageScrollMap.has(page) ? pageScrollMap.get(page) : 0;
        requestAnimationFrame(() => {
          window.scrollTo({ top, behavior });
        });
      };

      const setPage = (page, options = {}) => {
        const prevPage = getVisiblePage();
        if (
          prevPage &&
          prevPage !== page &&
          prevPage === "account" &&
          !options.skipUnsavedConfirm
        ) {
          if (!confirmDiscardProfileChanges()) {
            updateProfileEditDirtyUI();
            return false;
          }
        }
        if (prevPage && prevPage !== page) {
          rememberScroll(prevPage);
        }
        views.forEach((view) => {
          view.classList.toggle("is-active", view.dataset.page === page);
        });
        tabs.forEach((tab) => {
          const target = tab.getAttribute("data-page-target");
          tab.classList.toggle("is-active", target === page);
        });
        if (document?.body) {
          document.body.dataset.page = page;
        }
        collapseProfileEditGroupsOnMobile(page);
        if (page === "account") {
          applyProfileEditCompactMode();
          updateProfileEditAdvancedToggleLabel();
          updateProfileSummary();
          renderWorkoutHistory();
          renderTrainingSummary();
          renderPrList();
          renderInsights();
          renderOnboardingChecklist();
        }
        queueCollapsibleHeightRefresh();
        if (options.restoreScroll !== false) {
          restoreScroll(page, options.scrollBehavior || "auto");
        }
        if (page === "feed" && prevPage !== "feed") {
          requestAnimationFrame(() => {
            renderFeed({ forcePageRender: true });
          });
        }
        return true;
      };
      setActivePage = setPage;

      const initialPage =
        document.querySelector(".page-view.is-active")?.dataset.page ||
        tabs[0].getAttribute("data-page-target") ||
        "feed";
      setPage(initialPage, { restoreScroll: false });
      pageScrollMap.set(initialPage, 0);

      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const targetPage = tab.getAttribute("data-page-target");
          if (!targetPage) return;
          setPage(targetPage, { scrollBehavior: "smooth" });
        });
      });
    }

    function setupMiniHeader() {
      const miniHeader = $("mini-header");
      const miniPost = $("mini-btn-post");
      const miniTop = $("mini-btn-top");
      const progressBar = $("mini-progress-bar");
      if (!miniHeader) return;

      let miniHeaderScrollRaf = 0;
      let miniHeaderLastVisible = null;
      let miniHeaderLastProgress = -1;
      const isFeedPageActive = () =>
        (document.body?.dataset?.page ||
          document.querySelector(".page-view.is-active")?.dataset.page ||
          "feed") === "feed";
      const applyScrollUi = () => {
        miniHeaderScrollRaf = 0;
        const feedPageActive = isFeedPageActive();
        const liteMode = !!settings?.liteEffects;
        const revealOffset = liteMode ? 180 : 120;
        const isVisible = feedPageActive && window.scrollY > revealOffset;
        if (miniHeaderLastVisible !== isVisible) {
          miniHeader.classList.toggle("is-visible", isVisible);
          miniHeaderLastVisible = isVisible;
        }
        if (progressBar) {
          const allowProgress =
            feedPageActive &&
            (window.innerWidth || 1024) > 700 &&
            !liteMode;
          if (!allowProgress) {
            if (miniHeaderLastProgress !== 0) {
              progressBar.style.width = "0%";
              miniHeaderLastProgress = 0;
            }
            return;
          }
          const doc = document.documentElement;
          const total = doc.scrollHeight - doc.clientHeight;
          const percent = Math.min(
            100,
            Math.max(0, total > 0 ? (window.scrollY / total) * 100 : 0)
          );
          if (Math.abs(percent - miniHeaderLastProgress) >= 1.5) {
            progressBar.style.width = `${percent}%`;
            miniHeaderLastProgress = percent;
          }
        }
      };
      const onScroll = () => {
        if (miniHeaderScrollRaf) return;
        miniHeaderScrollRaf = requestAnimationFrame(applyScrollUi);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      applyScrollUi();

      if (miniPost && miniPost.dataset.bound !== "true") {
        miniPost.dataset.bound = "true";
        miniPost.addEventListener("click", () => {
          if (typeof openPostModal === "function") {
            openPostModal();
          }
        });
      }

      if (miniTop && miniTop.dataset.bound !== "true") {
        miniTop.dataset.bound = "true";
        miniTop.addEventListener("click", () => {
          const reduceMotion =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const behavior =
            settings?.liteEffects || reduceMotion ? "auto" : "smooth";
          window.scrollTo({ top: 0, behavior });
        });
      }
    }



    
    
    // ------------------ 投稿フォーム（モーダル） ------------------
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

    function setDraftStatus(message = "", active = false) {
      const el = $("draft-status");
      if (!el) return;
      el.textContent = message;
      el.classList.toggle("is-active", Boolean(message) && active);
    }

    function renderMediaPreview(file, note = "") {
      const preview = $("post-media-preview");
      const body = $("post-media-preview-body");
      const noteEl = $("post-media-preview-note");
      if (!preview || !body || !noteEl) return;

      if (currentMediaPreviewUrl) {
        URL.revokeObjectURL(currentMediaPreviewUrl);
        currentMediaPreviewUrl = null;
      }
      body.innerHTML = "";

      if (file) {
        const url = URL.createObjectURL(file);
        currentMediaPreviewUrl = url;
        if (file.type.startsWith("video")) {
          const video = document.createElement("video");
          video.src = url;
          video.controls = true;
          body.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.src = url;
          img.alt = "preview";
          body.appendChild(img);
        }
        noteEl.textContent = file.name || note || "";
        preview.classList.remove("hidden");
        return;
      }

      if (note) {
        noteEl.textContent = note;
        preview.classList.remove("hidden");
      } else {
        preview.classList.add("hidden");
        noteEl.textContent = "";
      }
    }

    function clearMediaSelection() {
      const mediaInput = $("post-media");
      if (mediaInput) {
        mediaInput.value = "";
      }
      currentMediaFile = null;
      renderMediaPreview(null);
    }

    function buildPostDraft() {
      const date = $("post-date")?.value || "";
      const weight = $("post-weight")?.value || "";
      const caption = $("post-caption")?.value || "";
      const visibility = $("post-visibility")?.value || "public";
      const templateId = $("post-template")?.value || "";
      const exercises = workoutExercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name || "",
        note: exercise.note || "",
        restSeconds: exercise.restSeconds || 90,
        sets: (exercise.sets || []).map((setItem) => ({
          id: setItem.id,
          reps: setItem.reps || "",
          weight: setItem.weight || "",
        })),
      }));
      return {
        date,
        weight,
        caption,
        visibility,
        templateId,
        exercises,
        mediaName: currentMediaFile?.name || "",
      };
    }

    function hasPostInputs() {
      const caption = $("post-caption")?.value?.trim() || "";
      const weight = $("post-weight")?.value || "";
      const hasExercises = hasWorkoutInputs();
      return Boolean(caption || weight || hasExercises || currentMediaFile);
    }

    function hasWorkoutInputs() {
      return workoutExercises.some(
        (exercise) =>
          (exercise.name && exercise.name.trim().length > 0) ||
          (exercise.note && exercise.note.trim().length > 0) ||
          (exercise.sets || []).some(
            (setItem) => String(setItem.reps || "").trim() || String(setItem.weight || "").trim()
          )
      );
    }

    function hasAdvancedPostInputs() {
      const weight = String($("post-weight")?.value || "").trim();
      const templateId = String($("post-template")?.value || "").trim();
      const visibility = String($("post-visibility")?.value || "public").trim();
      const defaultVisibility = String(settings.defaultVisibility || "public").trim();
      const date = String($("post-date")?.value || "").trim();
      const today = new Date().toISOString().slice(0, 10);
      return Boolean(
        weight ||
          templateId ||
          hasWorkoutInputs() ||
          (visibility && visibility !== defaultVisibility) ||
          (date && date !== today)
      );
    }

    function persistPostComposerMode() {
      try {
        localStorage.setItem(
          POST_COMPOSER_ADVANCED_KEY,
          postComposerAdvanced ? "true" : "false"
        );
      } catch {
        // ignore localStorage write failures
      }
    }

    function loadPostComposerModePreference() {
      try {
        const raw = localStorage.getItem(POST_COMPOSER_ADVANCED_KEY);
        postComposerAdvanced = raw === "true";
      } catch {
        postComposerAdvanced = false;
      }
    }

    function renderPostComposerMode() {
      const panel = document.querySelector("#post-modal-backdrop .modal-panel");
      if (panel) {
        panel.classList.toggle("post-composer-advanced", postComposerAdvanced);
      }
      const tr = t[currentLang] || t.ja;
      const toggleBtn = $("btn-post-toggle-advanced");
      if (toggleBtn) {
        toggleBtn.textContent = postComposerAdvanced
          ? tr.postShowSimple || "項目を減らす"
          : tr.postShowAdvanced || "項目を増やす";
      }
      const hint = $("post-composer-hint");
      if (hint) {
        hint.textContent = postComposerAdvanced
          ? tr.postAdvancedHint ||
            "詳細投稿: 体重・ワークアウト・公開範囲まで編集できます。"
          : tr.postSimpleHint ||
            "クイック投稿: キャプション・メディア中心";
      }
    }

    function setPostComposerMode(advanced, options = {}) {
      postComposerAdvanced = !!advanced;
      if (options.persist !== false) {
        persistPostComposerMode();
      }
      renderPostComposerMode();
    }

    function savePostDraft() {
      if (!currentUser) return;
      if (!hasPostInputs()) {
        localStorage.removeItem(POST_DRAFT_KEY);
        setDraftStatus("");
        return;
      }
      const draft = buildPostDraft();
      localStorage.setItem(POST_DRAFT_KEY, JSON.stringify(draft));
      const tr = t[currentLang] || t.ja;
      setDraftStatus(tr.draftSaved || "下書き保存済み", true);
    }

    function queueDraftSave() {
      if (!currentUser) return;
      if (Date.now() < draftSaveBlockedUntil) return;
      if (draftSaveTimer) {
        clearTimeout(draftSaveTimer);
      }
      draftSaveTimer = setTimeout(savePostDraft, 400);
    }

    function loadPostDraft() {
      try {
        const raw = localStorage.getItem(POST_DRAFT_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    function applyPostDraft(draft) {
      if (!draft) return;
      const dateEl = $("post-date");
      const weightEl = $("post-weight");
      const captionEl = $("post-caption");
      const visibilityEl = $("post-visibility");
      const templateEl = $("post-template");
      if (dateEl && draft.date) dateEl.value = draft.date;
      if (weightEl) weightEl.value = draft.weight || "";
      if (captionEl) captionEl.value = draft.caption || "";
      if (visibilityEl) visibilityEl.value = draft.visibility || "public";
      if (templateEl && draft.templateId) {
        const exists = Array.from(templateEl.options || []).some(
          (opt) => opt.value === draft.templateId
        );
        templateEl.value = exists ? draft.templateId : "";
      }

      if (Array.isArray(draft.exercises) && draft.exercises.length) {
        workoutExercises = draft.exercises.map((exercise) => ({
          id: exercise.id || `ex_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          name: exercise.name || "",
          note: exercise.note || "",
          restSeconds: exercise.restSeconds || 90,
          sets: (exercise.sets && exercise.sets.length
            ? exercise.sets
            : [
                {
                  id: `set_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                  reps: "",
                  weight: "",
                },
              ]
          ).map((setItem) => ({
            id: setItem.id || `set_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            reps: setItem.reps || "",
            weight: setItem.weight || "",
          })),
        }));
      } else {
        workoutExercises = [];
        addExercise();
      }
      renderWorkoutRows();

      if (draft.mediaName && !currentMediaFile) {
        const tr = t[currentLang] || t.ja;
        renderMediaPreview(null, (tr.mediaDraftNote || "前回のファイル") + `: ${draft.mediaName}`);
      }
    }

    function clearPostDraft() {
      draftSaveBlockedUntil = Date.now() + 800;
      if (draftSaveTimer) {
        clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
      }
      localStorage.removeItem(POST_DRAFT_KEY);
      renderMediaPreview(null);
      const tr = t[currentLang] || t.ja;
      setDraftStatus(tr.draftCleared || "下書きを削除しました", false);
    }
    
    function setupPostForm() {
      loadPostComposerModePreference();
      renderPostComposerMode();

      const toggleComposerBtn = $("btn-post-toggle-advanced");
      if (toggleComposerBtn && toggleComposerBtn.dataset.bound !== "true") {
        toggleComposerBtn.dataset.bound = "true";
        toggleComposerBtn.addEventListener("click", () => {
          setPostComposerMode(!postComposerAdvanced);
        });
      }

      const mediaInput = $("post-media");
      const removeMediaBtn = $("btn-remove-media");
      if (mediaInput) {
        mediaInput.addEventListener("change", (e) => {
          const file = e.target.files?.[0];
          const error = getFileValidationError(file, "post");
          if (error) {
            currentMediaFile = null;
            e.target.value = "";
            renderMediaPreview(null);
            showToast(error, "warning");
            return;
          }
          currentMediaFile = file || null;
          renderMediaPreview(currentMediaFile);
          queueDraftSave();
        });
      }
      if (removeMediaBtn && removeMediaBtn.dataset.bound !== "true") {
        removeMediaBtn.dataset.bound = "true";
        removeMediaBtn.addEventListener("click", () => {
          clearMediaSelection();
          queueDraftSave();
        });
      }

      const templateSelect = $("post-template");
      if (templateSelect) {
        templateSelect.addEventListener("change", () => {
          const templateId = templateSelect.value;
          if (!templateId) {
            queueDraftSave();
            return;
          }
          const template = templates.find((item) => item.id === templateId);
          if (template) {
            applyTemplateToPost(template);
            queueDraftSave();
          }
        });
      }
      setupLogBuilder();

      const submitBtn = $("btn-submit");
      if (submitBtn) {
        submitBtn.addEventListener("click", handleSubmitPost);
      }
      const resetBtn = $("btn-reset");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          resetPostForm();
          clearPostDraft();
          const tr = t[currentLang] || t.ja;
          setDraftStatus(tr.draftCleared || "下書きを削除しました");
        });
      }
      const clearDraftBtn = $("btn-clear-draft");
      if (clearDraftBtn && clearDraftBtn.dataset.bound !== "true") {
        clearDraftBtn.dataset.bound = "true";
        clearDraftBtn.addEventListener("click", () => {
          clearPostDraft();
          resetPostForm();
        });
      }

      const draftFields = [
        $("post-date"),
        $("post-weight"),
        $("post-caption"),
        $("post-visibility"),
      ];
      draftFields.forEach((field) => {
        if (!field || field.dataset.bound === "true") return;
        field.dataset.bound = "true";
        field.addEventListener("input", () => queueDraftSave());
        field.addEventListener("change", () => queueDraftSave());
      });

      $("post-date").valueAsDate = new Date();
      const visibilitySelect = $("post-visibility");
      if (visibilitySelect) {
        visibilitySelect.value = settings.defaultVisibility || "public";
      }

      // モーダル開閉
      const fab = $("fab-open-post");
      const topBtn = $("btn-open-post");
      const backdrop = $("post-modal-backdrop");
      const closeBtn = $("btn-post-close");

      const openModal = () => {
        if (!currentUser) {
          showToast("投稿するにはログインが必要です。", "warning");
          return;
        }
        renderPostComposerMode();
        setDraftStatus("");
        const draft = loadPostDraft();
        const tr = t[currentLang] || t.ja;
        if (draft && !hasPostInputs()) {
          applyPostDraft(draft);
          setDraftStatus(tr.draftRestored || "下書きを復元しました", true);
        } else if (draft && hasPostInputs()) {
          const ok = window.confirm(
            tr.draftRestoreConfirm || "保存済みの下書きを復元しますか？"
          );
          if (ok) {
            applyPostDraft(draft);
            setDraftStatus(tr.draftRestored || "下書きを復元しました", true);
          }
        }
        if (hasAdvancedPostInputs()) {
          setPostComposerMode(true, { persist: false });
        }
        openBackdrop(backdrop);
      };
      const closeModal = () => {
        closeBackdrop(backdrop);
      };
      openPostModal = openModal;

      if (fab) fab.addEventListener("click", openModal);
      if (topBtn) topBtn.addEventListener("click", openModal);
      if (closeBtn) closeBtn.addEventListener("click", closeModal);
      if (backdrop) {
        backdrop.addEventListener("click", (e) => {
          if (e.target === backdrop) {
            closeModal();
          }
        });
      }
    }

    function setupMediaModal() {
      const backdrop = $("media-modal-backdrop");
      const closeBtn = $("btn-media-close");
      if (!backdrop) return;
      const close = () => {
        closeBackdrop(backdrop);
        const body = $("media-modal-body");
        if (body) {
          setTimeout(() => {
            body.innerHTML = "";
          }, MODAL_ANIM_MS);
        }
      };
      if (closeBtn) closeBtn.addEventListener("click", close);
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close();
      });
    }

    function openMediaModal(url, type = "image") {
      const backdrop = $("media-modal-backdrop");
      const body = $("media-modal-body");
      if (!backdrop || !body) return;
      body.innerHTML = "";
      if (type === "video") {
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        body.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "media";
        body.appendChild(img);
      }
      openBackdrop(backdrop);
    }

    function setupTemplates() {
      const saveBtn = $("btn-save-template");
      if (saveBtn) {
        saveBtn.addEventListener("click", handleSaveTemplate);
      }
      renderTemplateList();
      populateTemplateSelect();
      renderOnboardingChecklist();
    }

    function setupNotifications() {
      const refreshBtn = $("btn-refresh-notifications");
      const markAllBtn = $("btn-mark-all-read");
      const settingsMarkBtn = $("btn-settings-mark-read");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", () => loadNotifications());
      }
      if (markAllBtn) {
        markAllBtn.addEventListener("click", () => markAllNotificationsRead());
      }
      if (settingsMarkBtn) {
        settingsMarkBtn.addEventListener("click", () => markAllNotificationsRead());
      }
      renderNotifications();
    }

    function setupOnboardingActions() {
      const postBtn = $("btn-onboarding-post");
      const profileBtn = $("btn-onboarding-profile");
      if (postBtn && postBtn.dataset.bound !== "true") {
        postBtn.dataset.bound = "true";
        postBtn.addEventListener("click", () => {
          if (!currentUser) {
            const tr = t[currentLang] || t.ja;
            showToast(tr.pleaseLogin || "ログインしてください。", "warning");
            if (typeof setActivePage === "function") {
              setActivePage("account");
            }
            return;
          }
          if (typeof openPostModal === "function") {
            openPostModal();
          }
        });
      }
      if (profileBtn && profileBtn.dataset.bound !== "true") {
        profileBtn.dataset.bound = "true";
        profileBtn.addEventListener("click", () => {
          if (typeof setActivePage === "function") {
            setActivePage("account");
          }
          const editSection = $("profile-edit-section");
          if (editSection) {
            editSection.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }
    }


    function setupLogBuilder() {
      const addBtn = $("btn-add-exercise");
      const stopBtn = $("btn-rest-stop");
      if (addBtn) {
        addBtn.addEventListener("click", () => addExercise());
      }
      if (stopBtn) {
        stopBtn.addEventListener("click", () => stopRestTimer());
      }
      stopRestTimer();
      if (!workoutExercises.length) {
        addExercise();
      } else {
        renderWorkoutRows();
      }
    }

    function populateTemplateSelect() {
      const select = $("post-template");
      if (!select) return;
      const tr = t[currentLang] || t.ja;
      select.innerHTML = "";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = tr.templateSelect || "Select a template";
      select.appendChild(placeholder);

      templates.forEach((template) => {
        const option = document.createElement("option");
        option.value = template.id;
        option.textContent = template.name || "Template";
        select.appendChild(option);
      });

      select.disabled = !currentUser || !templatesEnabled || templates.length === 0;
    }

    function renderTemplateList() {
      const list = $("template-list");
      const status = $("template-status");
      const nameInput = $("template-name");
      const bodyInput = $("template-body");
      const saveBtn = $("btn-save-template");
      if (!list || !status) return;

      const tr = t[currentLang] || t.ja;
      list.innerHTML = "";
      status.textContent = "";

      const disableForm = !currentUser || !templatesEnabled;
      if (nameInput) nameInput.disabled = disableForm;
      if (bodyInput) bodyInput.disabled = disableForm;
      if (saveBtn) saveBtn.disabled = disableForm;

      if (!currentUser) {
        status.textContent = tr.templateLoginRequired || "Log in to use templates.";
        return;
      }
      if (!templatesEnabled) {
        status.textContent = tr.templateUnavailable || "Templates are unavailable.";
        return;
      }
      if (!templates.length) {
        status.textContent = tr.templateEmpty || "No templates yet.";
        return;
      }

      templates.forEach((template) => {
        const item = document.createElement("div");
        item.className = "template-item";

        const title = document.createElement("div");
        title.className = "template-title";
        title.textContent = template.name || "Template";

        const body = document.createElement("div");
        body.className = "post-caption";
        body.textContent = template.body || "";

        const actions = document.createElement("div");
        actions.className = "template-actions";

        const useBtn = document.createElement("button");
        useBtn.className = "btn btn-ghost";
        useBtn.textContent = tr.templateUse || "Use";
        useBtn.addEventListener("click", () => applyTemplateToPost(template, true));

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-danger";
        deleteBtn.textContent = tr.templateDelete || "Delete";
        deleteBtn.addEventListener("click", () => deleteTemplate(template.id));

        actions.appendChild(useBtn);
        actions.appendChild(deleteBtn);

        item.appendChild(title);
        item.appendChild(body);
        item.appendChild(actions);
        list.appendChild(item);
      });
    }

    async function loadTemplates() {
      templates = [];
      templatesEnabled = true;
      if (!currentUser) {
        renderTemplateList();
        populateTemplateSelect();
        return;
      }

      const { data, error } = await supabase
        .from("workout_templates")
        .select("id, name, body, created_at")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("loadTemplates error:", error);
        templatesEnabled = false;
      } else {
        templates = data || [];
      }

      renderTemplateList();
      populateTemplateSelect();
    }

    async function handleSaveTemplate() {
      if (!currentUser) {
        showToast("ログインしてください。", "warning");
        return;
      }
      if (!templatesEnabled) return;

      const nameEl = $("template-name");
      const bodyEl = $("template-body");
      const name = nameEl?.value.trim();
      const body = bodyEl?.value.trim();

      if (!name || !body) {
        showToast("テンプレ名と内容を入力してください。", "warning");
        return;
      }

      const { error } = await supabase
        .from("workout_templates")
        .insert({
          user_id: currentUser.id,
          name,
          body,
        });

      if (error) {
        console.error("template insert error:", error);
        templatesEnabled = false;
        showToast("テンプレートの保存に失敗しました。", "error");
        renderTemplateList();
        populateTemplateSelect();
        return;
      }

      if (nameEl) nameEl.value = "";
      if (bodyEl) bodyEl.value = "";
      await loadTemplates();
      showToast("テンプレートを保存しました。", "success");
    }

    async function deleteTemplate(templateId) {
      if (!currentUser || !templateId) return;
      const ok = window.confirm("このテンプレートを削除しますか？");
      if (!ok) return;

      const { error } = await supabase
        .from("workout_templates")
        .delete()
        .eq("id", templateId)
        .eq("user_id", currentUser.id);

      if (error) {
        console.error("template delete error:", error);
        showToast("削除に失敗しました。", "error");
        return;
      }

      templates = templates.filter((template) => template.id !== templateId);
      renderTemplateList();
      populateTemplateSelect();
      showToast("テンプレートを削除しました。", "success");
    }

    function applyTemplateToPost(template, openModal = false) {
      if (!template) return;
      const captionEl = $("post-caption");
      if (captionEl) {
        const hasText = captionEl.value.trim().length > 0;
        if (hasText) {
          const ok = window.confirm("キャプションをテンプレートで置き換えますか？");
          if (!ok) return;
        }
        captionEl.value = template.body || "";
      }
      const select = $("post-template");
      if (select) select.value = template.id;
      queueDraftSave();
      if (openModal && typeof openPostModal === "function") {
        openPostModal();
      }
    }

    let restTimerInterval = null;
    let restTimerRemaining = 0;

    function formatRestTime(seconds) {
      const safe = Math.max(0, Number(seconds) || 0);
      const mins = String(Math.floor(safe / 60)).padStart(2, "0");
      const secs = String(safe % 60).padStart(2, "0");
      return `${mins}:${secs}`;
    }

    function updateRestDisplay() {
      const display = $("rest-timer-display");
      if (display) {
        display.textContent = formatRestTime(restTimerRemaining);
      }
    }

    function stopRestTimer() {
      if (restTimerInterval) {
        clearInterval(restTimerInterval);
        restTimerInterval = null;
      }
      restTimerRemaining = 0;
      updateRestDisplay();
    }

    function startRestTimer(seconds) {
      const duration = Number(seconds) || 0;
      if (duration <= 0) return;
      restTimerRemaining = duration;
      updateRestDisplay();
      if (restTimerInterval) clearInterval(restTimerInterval);
      restTimerInterval = setInterval(() => {
        restTimerRemaining -= 1;
        if (restTimerRemaining <= 0) {
          stopRestTimer();
          return;
        }
        updateRestDisplay();
      }, 1000);
    }

    function createExercise(initial = {}) {
      return {
        id: `ex_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: initial.name || "",
        note: initial.note || "",
        restSeconds: initial.restSeconds || 90,
        sets: initial.sets?.length
          ? initial.sets
          : [
              {
                id: `set_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                reps: "",
                weight: "",
              },
            ],
      };
    }

    function addExercise(initial = {}) {
      workoutExercises.push(createExercise(initial));
      renderWorkoutRows();
      queueDraftSave();
    }

    function removeExercise(exerciseId) {
      workoutExercises = workoutExercises.filter((ex) => ex.id !== exerciseId);
      if (!workoutExercises.length) {
        workoutExercises.push(createExercise());
      }
      renderWorkoutRows();
      queueDraftSave();
    }

    function addSet(exerciseId) {
      const exercise = workoutExercises.find((ex) => ex.id === exerciseId);
      if (!exercise) return;
      exercise.sets.push({
        id: `set_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        reps: "",
        weight: "",
      });
      renderWorkoutRows();
      queueDraftSave();
    }

    function removeSet(exerciseId, setId) {
      const exercise = workoutExercises.find((ex) => ex.id === exerciseId);
      if (!exercise) return;
      exercise.sets = exercise.sets.filter((set) => set.id !== setId);
      if (!exercise.sets.length) {
        exercise.sets.push({
          id: `set_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          reps: "",
          weight: "",
        });
      }
      renderWorkoutRows();
      queueDraftSave();
    }

    function updateExerciseField(exerciseId, key, value) {
      const exercise = workoutExercises.find((ex) => ex.id === exerciseId);
      if (!exercise) return;
      exercise[key] = value;
      queueDraftSave();
    }

    function updateSetField(exerciseId, setId, key, value) {
      const exercise = workoutExercises.find((ex) => ex.id === exerciseId);
      if (!exercise) return;
      const setItem = exercise.sets.find((set) => set.id === setId);
      if (!setItem) return;
      setItem[key] = value;
      queueDraftSave();
    }

    function renderWorkoutRows() {
      const container = $("workout-exercises");
      const status = $("log-status");
      const addBtn = $("btn-add-exercise");
      const stopBtn = $("btn-rest-stop");
      if (!container) return;

      container.innerHTML = "";

      if (!workoutLogsEnabled) {
        if (status) {
          const tr = t[currentLang] || t.ja;
          status.textContent = tr.workoutUnavailable || "Workout logs unavailable.";
        }
        if (addBtn) addBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
        return;
      }

      if (status) status.textContent = "";
      if (addBtn) addBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = false;

      workoutExercises.forEach((exercise, index) => {
        const card = document.createElement("div");
        card.className = "exercise-card";

        const header = document.createElement("div");
        header.className = "exercise-header";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = `Exercise ${index + 1}`;
        nameInput.value = exercise.name;
        nameInput.addEventListener("input", (e) =>
          updateExerciseField(exercise.id, "name", e.target.value)
        );

        const restInput = document.createElement("input");
        restInput.type = "number";
        restInput.placeholder =
          (t[currentLang] || t.ja).workoutRestInput || "Rest (sec)";
        restInput.value = exercise.restSeconds;
        restInput.addEventListener("input", (e) =>
          updateExerciseField(exercise.id, "restSeconds", Number(e.target.value))
        );

        const restBtn = document.createElement("button");
        restBtn.className = "btn btn-ghost";
        restBtn.textContent = (t[currentLang] || t.ja).workoutRestStart || "Start";
        restBtn.addEventListener("click", () =>
          startRestTimer(exercise.restSeconds)
        );

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-danger";
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => removeExercise(exercise.id));

        header.appendChild(nameInput);
        header.appendChild(restInput);
        header.appendChild(restBtn);
        header.appendChild(removeBtn);

        const noteInput = document.createElement("textarea");
        noteInput.className = "exercise-note";
        noteInput.placeholder =
          (t[currentLang] || t.ja).workoutNotePlaceholder || "Notes";
        noteInput.value = exercise.note || "";
        noteInput.addEventListener("input", (e) =>
          updateExerciseField(exercise.id, "note", e.target.value)
        );

        const prInfo = document.createElement("div");
        prInfo.className = "exercise-pr";
        const updatePRInfo = () => {
          const text = getExercisePRText(nameInput.value);
          prInfo.textContent = text;
          prInfo.style.display = text ? "block" : "none";
        };
        updatePRInfo();
        nameInput.addEventListener("blur", updatePRInfo);

        const setList = document.createElement("div");
        setList.className = "set-list";
        exercise.sets.forEach((setItem, setIndex) => {
          const row = document.createElement("div");
          row.className = "set-row";

          const repsInput = document.createElement("input");
          repsInput.type = "number";
          repsInput.placeholder = `Reps ${setIndex + 1}`;
          repsInput.value = setItem.reps;
          repsInput.addEventListener("input", (e) =>
            updateSetField(exercise.id, setItem.id, "reps", e.target.value)
          );

          const weightInput = document.createElement("input");
          weightInput.type = "number";
          weightInput.placeholder = settings.weightUnit === "lb" ? "lb" : "kg";
          weightInput.value = setItem.weight;
          weightInput.addEventListener("input", (e) =>
            updateSetField(exercise.id, setItem.id, "weight", e.target.value)
          );

          const removeSetBtn = document.createElement("button");
          removeSetBtn.className = "btn btn-ghost";
          removeSetBtn.textContent = "×";
          removeSetBtn.addEventListener("click", () =>
            removeSet(exercise.id, setItem.id)
          );

          row.appendChild(repsInput);
          row.appendChild(weightInput);
          row.appendChild(removeSetBtn);
          setList.appendChild(row);
        });

        const addSetBtn = document.createElement("button");
        addSetBtn.className = "btn btn-ghost";
        addSetBtn.textContent = (t[currentLang] || t.ja).workoutAddSet || "Add set";
        addSetBtn.addEventListener("click", () => addSet(exercise.id));

        card.appendChild(header);
        card.appendChild(noteInput);
        card.appendChild(prInfo);
        card.appendChild(setList);
        card.appendChild(addSetBtn);
        container.appendChild(card);
      });
    }

    function collectWorkoutLogs() {
      const rows = [];
      workoutExercises.forEach((exercise) => {
        const name = exercise.name.trim();
        if (!name) return;
        exercise.sets.forEach((setItem, index) => {
          const reps = setItem.reps ? Number(setItem.reps) : null;
          if (!reps) return;
          const weight = setItem.weight ? toKg(Number(setItem.weight)) : null;
          rows.push({
            exercise: name,
            set_index: index + 1,
            reps,
            weight,
            rest_seconds: exercise.restSeconds ? Number(exercise.restSeconds) : null,
            exercise_note: exercise.note?.trim() || null,
          });
        });
      });
      return rows;
    }

    async function loadWorkoutLogs(postIds, options = {}) {
      const append = !!options.append;
      if (!append) {
        workoutLogsByPost = new Map();
        loadedWorkoutLogPostIds = new Set();
      }
      if (!workoutLogsEnabled) return;
      const targetIds = Array.from(
        new Set(
          (Array.isArray(postIds) ? postIds : [])
            .map((id) => `${id || ""}`.trim())
            .filter(Boolean)
        )
      );
      if (!targetIds.length) return;
      const queryIds = append
        ? targetIds.filter((postId) => !loadedWorkoutLogPostIds.has(postId))
        : targetIds;
      if (!queryIds.length) return;

      const { data, error } = await supabase
        .from("workout_sets")
        .select(
          "post_id, exercise, set_index, reps, weight, rest_seconds, exercise_note, pr_type"
        )
        .in("post_id", queryIds);

      if (error) {
        console.error("loadWorkoutLogs error:", error);
        if (!append) {
          workoutLogsEnabled = false;
          renderWorkoutRows();
        }
        return;
      }

      const exerciseLookupByPost = new Map();
      const touchedPostIds = new Set();
      (data || []).forEach((log) => {
        const postId = `${log?.post_id || ""}`.trim();
        if (!postId) return;
        touchedPostIds.add(postId);

        const existing = workoutLogsByPost.get(postId) || [];
        if (!workoutLogsByPost.has(postId)) {
          workoutLogsByPost.set(postId, existing);
        }

        let exerciseLookup = exerciseLookupByPost.get(postId);
        if (!exerciseLookup) {
          exerciseLookup = new Map();
          existing.forEach((exercise) => {
            if (!exercise?.exercise) return;
            exerciseLookup.set(exercise.exercise, exercise);
          });
          exerciseLookupByPost.set(postId, exerciseLookup);
        }

        const exerciseName = log.exercise || "";
        let exercise = exerciseLookup.get(exerciseName);
        if (!exercise) {
          exercise = {
            exercise: exerciseName,
            rest_seconds: log.rest_seconds,
            note: log.exercise_note || "",
            sets: [],
          };
          existing.push(exercise);
          exerciseLookup.set(exerciseName, exercise);
        }
        if (!exercise.note && log.exercise_note) {
          exercise.note = log.exercise_note;
        }
        exercise.sets.push({
          set_index: log.set_index,
          reps: log.reps,
          weight: log.weight,
          pr_type: log.pr_type,
        });
      });

      queryIds.forEach((postId) => loadedWorkoutLogPostIds.add(postId));
      touchedPostIds.forEach((postId) => {
        const exercises = workoutLogsByPost.get(postId) || [];
        exercises.forEach((exercise) => {
          exercise.sets.sort((a, b) => (a.set_index || 0) - (b.set_index || 0));
        });
        workoutLogsByPost.set(postId, exercises);
      });
    }

    async function loadNotifications() {
      notifications = [];
      notificationsEnabled = true;
      if (!currentUser) {
        renderNotifications();
        return;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, actor_id, type, post_id, created_at, read_at")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("loadNotifications error:", error);
        notificationsEnabled = false;
      } else {
        const actorMap = await loadProfilesForUsers(
          (data || []).map((item) => item.actor_id)
        );
        const enriched = (data || []).map((item) => ({
          ...item,
          actor: actorMap.get(item.actor_id) || null,
        }));
        notifications = enriched;
      }
      renderNotifications();
    }

    function renderNotifications() {
      const list = $("notification-list");
      const status = $("notification-status");
      if (!list || !status) return;
      const tr = t[currentLang] || t.ja;

      list.innerHTML = "";
      status.textContent = "";

      if (!currentUser) {
        status.textContent =
          tr.notificationsLoginRequired || "Log in to see notifications.";
        return;
      }
      if (!notificationsEnabled) {
        status.textContent =
          tr.notificationsUnavailable || "Notifications unavailable.";
        return;
      }
      if (!notifications.length) {
        status.textContent = tr.notificationsEmpty || "No notifications.";
        return;
      }

      const filtered = notifications.filter((note) => {
        const flag = settings.notifications?.[note.type];
        if (flag === undefined) return true;
        return flag;
      });

      if (!filtered.length) {
        status.textContent =
          tr.notificationsFiltered || "Notifications are hidden.";
        return;
      }

      filtered.forEach((note) => {
        const item = document.createElement("div");
        item.className = `notification-item${note.read_at ? "" : " unread"}`;

        let actorName =
          note.actor?.handle ||
          note.actor?.display_name ||
          note.actor?.username ||
          "user";
        if (!actorName.startsWith("@")) {
          actorName = `@${actorName}`;
        }
        const actionText =
          note.type === "comment"
            ? tr.notificationActionComment || "commented on your post"
            : note.type === "follow"
            ? tr.notificationActionFollow || "followed you"
            : note.type === "like"
            ? tr.notificationActionLike || "liked your post"
            : "updated";

        const text = document.createElement("div");
        text.textContent = `${actorName} ${actionText}`;

        const meta = document.createElement("div");
        meta.className = "notification-meta";
        meta.textContent = note.created_at
          ? formatDateTimeDisplay(note.created_at)
          : "";

        const actions = document.createElement("div");
        actions.className = "notification-actions";

        if (!note.read_at) {
          const markBtn = document.createElement("button");
          markBtn.className = "btn btn-ghost";
          markBtn.textContent = tr.notificationRead || "Mark read";
          markBtn.addEventListener("click", () => markNotificationRead(note.id));
          actions.appendChild(markBtn);
        }

        if (note.post_id) {
          const viewBtn = document.createElement("button");
          viewBtn.className = "btn btn-ghost";
          viewBtn.textContent = tr.notificationViewPost || "View post";
          viewBtn.addEventListener("click", () => {
            if (typeof setActivePage === "function") {
              setActivePage("feed");
              const el = document.querySelector(`[data-post-id="${note.post_id}"]`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          });
          actions.appendChild(viewBtn);
        }

        item.appendChild(text);
        item.appendChild(meta);
        if (actions.childNodes.length) item.appendChild(actions);
        list.appendChild(item);
      });
    }


    function getExercisePRText(name) {
      if (!prTrackingEnabled) return "";
      const key = normalizeExerciseName(name);
      if (!key || !exercisePRs.has(key)) return "";
      const pr = exercisePRs.get(key);
      const tr = t[currentLang] || t.ja;
      const weightText =
        pr.best_weight !== null && pr.best_weight !== undefined
          ? formatWeight(pr.best_weight)
          : "-";
      const repsText =
        pr.best_reps !== null && pr.best_reps !== undefined
          ? `${pr.best_reps} reps`
          : "-";
      return `${tr.workoutPrCurrent || "Current PR"}: ${weightText} / ${repsText}`;
    }

    async function loadExercisePRs() {
      exercisePRs = new Map();
      prTrackingEnabled = true;
      if (!currentUser) return;

      const { data, error } = await supabase
        .from("exercise_prs")
        .select("exercise, best_weight, best_reps, updated_at")
        .eq("user_id", currentUser.id);

      if (error) {
        console.error("loadExercisePRs error:", error);
        prTrackingEnabled = false;
        return;
      }

      (data || []).forEach((row) => {
        const key = normalizeExerciseName(row.exercise);
        if (!key) return;
        exercisePRs.set(key, {
          name: row.exercise,
          best_weight: row.best_weight,
          best_reps: row.best_reps,
          updated_at: row.updated_at,
        });
      });
      if (typeof renderWorkoutRows === "function") {
        renderWorkoutRows();
      }
      if (typeof renderPrList === "function") {
        renderPrList();
      }
      if (typeof renderTrainingSummary === "function") {
        renderTrainingSummary();
      }
      if (typeof renderOnboardingChecklist === "function") {
        renderOnboardingChecklist();
      }
    }

    function computePRUpdates(logs) {
      if (!prTrackingEnabled || !currentUser) {
        return { logs, updates: [] };
      }

      const grouped = new Map();
      const updatedLogs = logs.map((log) => ({ ...log }));

      updatedLogs.forEach((log, index) => {
        const key = normalizeExerciseName(log.exercise);
        if (!key) return;
        if (!grouped.has(key)) {
          grouped.set(key, { name: log.exercise, indices: [] });
        }
        grouped.get(key).indices.push(index);
      });

      const updates = [];

      grouped.forEach((group, key) => {
        const indices = group.indices;
        const logsForExercise = indices.map((idx) => updatedLogs[idx]);
        const weights = logsForExercise
          .filter(
            (log) =>
              log.weight !== null &&
              log.weight !== undefined &&
              log.weight !== ""
          )
          .map((log) => Number(log.weight))
          .filter((value) => !Number.isNaN(value));
        const reps = logsForExercise
          .filter(
            (log) => log.reps !== null && log.reps !== undefined && log.reps !== ""
          )
          .map((log) => Number(log.reps))
          .filter((value) => !Number.isNaN(value));

        const maxWeight = weights.length ? Math.max(...weights) : null;
        const maxReps = reps.length ? Math.max(...reps) : null;

        const current = exercisePRs.get(key) || {
          best_weight: null,
          best_reps: null,
        };

        const weightPR =
          maxWeight !== null &&
          (current.best_weight === null || maxWeight > current.best_weight);
        const repsPR =
          maxReps !== null &&
          (current.best_reps === null || maxReps > current.best_reps);

        if (weightPR || repsPR) {
          updates.push({
            user_id: currentUser.id,
            exercise: group.name,
            best_weight: weightPR ? maxWeight : current.best_weight,
            best_reps: repsPR ? maxReps : current.best_reps,
          });
        }

        indices.forEach((idx) => {
          const log = updatedLogs[idx];
          let prType = null;
          if (weightPR && log.weight !== null && Number(log.weight) === maxWeight) {
            prType = "weight";
          }
          if (repsPR && log.reps !== null && Number(log.reps) === maxReps) {
            prType = prType ? "both" : "reps";
          }
          if (prType) {
            log.pr_type = prType;
          }
        });
      });

      return { logs: updatedLogs, updates };
    }

    async function upsertExercisePRs(updates) {
      if (!updates.length || !prTrackingEnabled) return;
      const { error } = await supabase
        .from("exercise_prs")
        .upsert(updates, { onConflict: "user_id,exercise" });
      if (error) {
        console.error("upsertExercisePRs error:", error);
        prTrackingEnabled = false;
        return;
      }
      updates.forEach((update) => {
        const key = normalizeExerciseName(update.exercise);
        if (!key) return;
        exercisePRs.set(key, {
          name: update.exercise,
          best_weight: update.best_weight,
          best_reps: update.best_reps,
          updated_at: new Date().toISOString(),
        });
      });
    }

    function renderGalleryPage() {
      const gallery = $("public-profile-gallery");
      const status = $("public-profile-gallery-status");
      const pageEl = $("gallery-page");
      const prevBtn = $("btn-gallery-prev");
      const nextBtn = $("btn-gallery-next");
      if (!gallery || !status || !pageEl || !prevBtn || !nextBtn) return;
      const tr = t[currentLang] || t.ja;

      gallery.innerHTML = "";
      status.textContent = "";

      if (!currentGalleryPosts.length) {
        status.textContent = tr.galleryEmpty || "No media yet.";
        pageEl.textContent = "";
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
      }

      const totalPages = Math.max(
        1,
        Math.ceil(currentGalleryPosts.length / galleryPageSize)
      );
      galleryPage = Math.min(Math.max(1, galleryPage), totalPages);

      const start = (galleryPage - 1) * galleryPageSize;
      const pagePosts = currentGalleryPosts.slice(
        start,
        start + galleryPageSize
      );

      pagePosts.forEach((post) => {
        const item = document.createElement("div");
        item.className = "gallery-item";
        if (post.media_type === "video") {
          const video = document.createElement("video");
          video.src = post.media_url;
          video.muted = true;
          item.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.src = post.media_url;
          img.alt = "progress";
          item.appendChild(img);
        }
        item.addEventListener("click", () =>
          openMediaModal(post.media_url, post.media_type)
        );
        gallery.appendChild(item);
      });

      pageEl.textContent = `${galleryPage} / ${totalPages}`;
      prevBtn.disabled = galleryPage <= 1;
      nextBtn.disabled = galleryPage >= totalPages;
    }

    function renderWorkoutHistory() {
      const list = $("history-list");
      const status = $("history-status");
      if (!list || !status) return;
      const tr = t[currentLang] || t.ja;

      list.innerHTML = "";
      status.textContent = "";

      if (!currentUser) {
        status.textContent =
          tr.workoutHistoryLoginRequired || "Log in to see history.";
        return;
      }
      if (!workoutLogsEnabled) {
        status.textContent = tr.workoutUnavailable || "Workout logs unavailable.";
        return;
      }

      const userPosts = getUserPostsSortedByDateDesc();

      const historyItems = userPosts
        .filter((post) => workoutLogsByPost.has(post.id))
        .slice(0, 5);

      if (!historyItems.length) {
        status.textContent = tr.workoutHistoryEmpty || "No history yet.";
        return;
      }

      historyItems.forEach((post) => {
        const logs = workoutLogsByPost.get(post.id) || [];
        const item = document.createElement("div");
        item.className = "notification-item";

        const title = document.createElement("div");
        title.textContent = formatDateDisplay(post.date || post.created_at || Date.now());

        const summary = document.createElement("div");
        summary.className = "notification-meta";
        summary.textContent = logs
          .map((exercise) => `${exercise.exercise} (${exercise.sets.length} sets)`)
          .join(" · ");

        item.appendChild(title);
        item.appendChild(summary);
        list.appendChild(item);
      });
    }

    function isWithinLastDays(value, days = 7) {
      if (!value) return false;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return false;
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date();
      start.setDate(end.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    }


    function renderTrainingSummary() {
      const workoutsEl = $("summary-workouts");
      const volumeEl = $("summary-volume");
      const exercisesEl = $("summary-exercises");
      const prsEl = $("summary-prs");
      const setsEl = $("summary-sets");
      const repsEl = $("summary-reps");
      const avgRepsEl = $("summary-avg-reps");
      const weightEl = $("summary-weight");
      const status = $("summary-status");
      const chartEl = $("summary-chart");
      const topListEl = $("summary-toplist");
      if (!workoutsEl || !volumeEl || !exercisesEl || !prsEl || !status) return;

      const tr = t[currentLang] || t.ja;
      const resetValues = () => {
        workoutsEl.textContent = "-";
        volumeEl.textContent = "-";
        exercisesEl.textContent = "-";
        prsEl.textContent = "-";
        if (setsEl) setsEl.textContent = "-";
        if (repsEl) repsEl.textContent = "-";
        if (avgRepsEl) avgRepsEl.textContent = "-";
        if (weightEl) weightEl.textContent = "-";
        if (chartEl) chartEl.innerHTML = "";
        if (topListEl) topListEl.innerHTML = "";
      };

      status.textContent = "";

      if (!currentUser) {
        resetValues();
        status.textContent =
          tr.summaryLoginRequired || "Log in to see your summary.";
        return;
      }
      if (!workoutLogsEnabled) {
        resetValues();
        status.textContent =
          tr.workoutUnavailable || "Workout logs are not available yet.";
        return;
      }

      const userPosts = getUserPosts();
      const recentPosts = userPosts.filter((post) =>
        isWithinLastDays(post.date || post.created_at, 7)
      );
      const workoutPosts = recentPosts.filter((post) =>
        workoutLogsByPost.has(post.id)
      );

      let totalVolume = 0;
      let prCount = 0;
      const exerciseSet = new Set();
      const exerciseVolume = new Map();
      let totalSets = 0;
      let totalReps = 0;

      workoutPosts.forEach((post) => {
        const logs = workoutLogsByPost.get(post.id) || [];
        logs.forEach((exercise) => {
          if (exercise.exercise) {
            exerciseSet.add(normalizeExerciseName(exercise.exercise));
          }
          (exercise.sets || []).forEach((set) => {
            const reps = Number(set.reps) || 0;
            const weight = Number(set.weight) || 0;
            totalVolume += reps * weight;
            if (set.pr_type) prCount += 1;
            if (reps > 0) {
              totalReps += reps;
            }
            totalSets += 1;
          });
          if (exercise.exercise) {
            const key = normalizeExerciseName(exercise.exercise);
            const volume = (exercise.sets || []).reduce((sum, set) => {
              const reps = Number(set.reps) || 0;
              const weight = Number(set.weight) || 0;
              return sum + reps * weight;
            }, 0);
            const current = exerciseVolume.get(key) || {
              name: exercise.exercise,
              volume: 0,
            };
            current.volume += volume;
            if (!current.name && exercise.exercise) {
              current.name = exercise.exercise;
            }
            exerciseVolume.set(key, current);
          }
        });
      });

      workoutsEl.textContent = `${workoutPosts.length}`;
      volumeEl.textContent = formatVolume(totalVolume);
      exercisesEl.textContent = `${exerciseSet.size}`;
      prsEl.textContent = `${prCount}`;
      if (setsEl) {
        const unit = tr.summarySetsUnit ? ` ${tr.summarySetsUnit}` : "";
        setsEl.textContent = `${totalSets}${unit}`;
      }
      if (repsEl) {
        const unit = tr.summaryRepsUnit ? ` ${tr.summaryRepsUnit}` : "";
        repsEl.textContent = `${totalReps}${unit}`;
      }
      if (avgRepsEl) {
        const unit = tr.summaryAvgRepsUnit ? ` ${tr.summaryAvgRepsUnit}` : "";
        avgRepsEl.textContent = totalSets
          ? `${(totalReps / totalSets).toFixed(1)}${unit}`
          : "-";
      }

      if (weightEl) {
        const latestWeightPost = userPosts
          .filter(
            (post) =>
              post.bodyweight !== null &&
              post.bodyweight !== undefined &&
              post.bodyweight !== ""
          )
          .sort((a, b) => {
            const aTime = new Date(a.date || a.created_at || 0).getTime();
            const bTime = new Date(b.date || b.created_at || 0).getTime();
            return bTime - aTime;
          })[0];
        if (!settings.showBodyweight) {
          weightEl.textContent = "-";
        } else {
          weightEl.textContent = latestWeightPost
            ? formatWeight(latestWeightPost.bodyweight)
            : "-";
        }
      }

      if (chartEl) {
        chartEl.innerHTML = "";
        const end = new Date();
        end.setHours(0, 0, 0, 0);
        const start = new Date(end);
        start.setDate(end.getDate() - 6);
        const dayFormatter = new Intl.DateTimeFormat(
          currentLang === "ja" ? "ja-JP" : "en-US",
          { weekday: "short" }
        );
        const counts = [];
        for (let i = 0; i < 7; i += 1) {
          const day = new Date(start);
          day.setDate(start.getDate() + i);
          const key = toDateKey(day);
          const count = workoutPosts.filter(
            (post) => toDateKey(post.date || post.created_at) === key
          ).length;
          counts.push({ day, count });
        }
        const maxCount = Math.max(1, ...counts.map((c) => c.count));
        counts.forEach((entry) => {
          const bar = document.createElement("div");
          bar.className = "summary-bar";

          const track = document.createElement("div");
          track.className = "summary-bar-track";

          const fill = document.createElement("div");
          fill.className = "summary-bar-fill";
          fill.style.height = `${Math.round((entry.count / maxCount) * 100)}%`;
          track.appendChild(fill);

          const label = document.createElement("div");
          label.className = "summary-bar-label";
          label.textContent = dayFormatter.format(entry.day);

          const countLabel = document.createElement("div");
          countLabel.className = "summary-bar-label";
          countLabel.textContent = `${entry.count}`;

          bar.appendChild(track);
          bar.appendChild(label);
          bar.appendChild(countLabel);
          chartEl.appendChild(bar);
        });
      }

      if (topListEl) {
        topListEl.innerHTML = "";
        const sorted = Array.from(exerciseVolume.values())
          .map((entry) => ({
            name: entry.name,
            volume: entry.volume,
          }))
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 3);

        if (!sorted.length) {
          const empty = document.createElement("div");
          empty.className = "template-status";
          empty.textContent = tr.summaryEmpty || "No data yet.";
          topListEl.appendChild(empty);
        } else {
          sorted.forEach((item) => {
            const row = document.createElement("div");
            row.className = "notification-item";
            const title = document.createElement("div");
            title.textContent = item.name || "Exercise";
            const meta = document.createElement("div");
            meta.className = "notification-meta";
            meta.textContent = formatVolume(item.volume);
            row.appendChild(title);
            row.appendChild(meta);
            topListEl.appendChild(row);
          });
        }
      }

      if (!workoutPosts.length) {
        status.textContent = tr.summaryEmpty || "No data yet.";
      }
    }

    function renderInsights() {
      const grid = $("insights-grid");
      const status = $("insights-status");
      if (!grid || !status) return;
      const tr = t[currentLang] || t.ja;
      grid.innerHTML = "";
      status.textContent = "";

      if (!currentUser) {
        status.textContent =
          tr.summaryLoginRequired || "Log in to see your summary.";
        return;
      }
      if (!workoutLogsEnabled) {
        status.textContent =
          tr.workoutUnavailable || "Workout logs are not available yet.";
        return;
      }

      const userPosts = getUserPosts();
      const recentPosts = userPosts.filter((post) =>
        isWithinLastDays(post.date || post.created_at, 7)
      );
      const workoutPosts = recentPosts.filter((post) =>
        workoutLogsByPost.has(post.id)
      );

      if (!workoutPosts.length) {
        status.textContent = tr.summaryEmpty || "No data yet.";
        return;
      }

      const dayMap = new Map();
      const exerciseCount = new Map();
      const prHighlights = [];

      workoutPosts.forEach((post) => {
        const key = toDateKey(post.date || post.created_at);
        if (!key) return;
        const logs = workoutLogsByPost.get(post.id) || [];
        let dayVolume = 0;
        logs.forEach((exercise) => {
          const nameKey = normalizeExerciseName(exercise.exercise);
          if (nameKey) {
            const current = exerciseCount.get(nameKey) || {
              name: exercise.exercise,
              count: 0,
            };
            current.count += (exercise.sets || []).length;
            if (!current.name && exercise.exercise) {
              current.name = exercise.exercise;
            }
            exerciseCount.set(nameKey, current);
          }
          (exercise.sets || []).forEach((set) => {
            const reps = Number(set.reps) || 0;
            const weight = Number(set.weight) || 0;
            dayVolume += reps * weight;
            if (set.pr_type) {
              prHighlights.push({
                exercise: exercise.exercise,
                pr_type: set.pr_type,
                weight,
                reps,
                date: post.date || post.created_at,
              });
            }
          });
        });
        const current = dayMap.get(key) || { count: 0, volume: 0 };
        current.count += 1;
        current.volume += dayVolume;
        dayMap.set(key, current);
      });

      const activeDays = dayMap.size;
      const bestDayEntry = Array.from(dayMap.entries()).sort(
        (a, b) => b[1].count - a[1].count
      )[0];
      const volumeDayEntry = Array.from(dayMap.entries()).sort(
        (a, b) => b[1].volume - a[1].volume
      )[0];
      const topExerciseEntry = Array.from(exerciseCount.values()).sort(
        (a, b) => b.count - a.count
      )[0];

      const dayFormatter = new Intl.DateTimeFormat(
        currentLang === "ja" ? "ja-JP" : "en-US",
        { weekday: "short" }
      );
      const formatDay = (key) => {
        if (!key) return "-";
        const date = new Date(key);
        if (Number.isNaN(date.getTime())) return key;
        return dayFormatter.format(date);
      };

      const prHighlight = prHighlights.sort((a, b) => {
        const aWeight = a.weight || 0;
        const bWeight = b.weight || 0;
        if (bWeight !== aWeight) return bWeight - aWeight;
        return (b.reps || 0) - (a.reps || 0);
      })[0];
      const prTypeLabel = (type) => {
        if (!type) return "";
        if (type === "weight") return tr.prWeight || "Weight PR";
        if (type === "reps") return tr.prReps || "Rep PR";
        return tr.prLabel || "PR";
      };
      const formatPrDetail = (entry) => {
        if (!entry) return "";
        const parts = [];
        if (entry.weight) parts.push(formatWeight(entry.weight));
        if (entry.reps) parts.push(`${entry.reps} reps`);
        return parts.join(" / ");
      };

      const insights = [
        {
          label: tr.insightConsistency || "Active days",
          value: `${activeDays}/7`,
        },
        {
          label: tr.insightBestDay || "Most posts day",
          value: bestDayEntry
            ? `${formatDay(bestDayEntry[0])} (${bestDayEntry[1].count})`
            : "-",
        },
        {
          label: tr.insightVolumeDay || "Highest volume day",
          value: volumeDayEntry
            ? `${formatDay(volumeDayEntry[0])} ${formatVolume(
                volumeDayEntry[1].volume
              )}`
            : "-",
        },
        {
          label: tr.insightTopExercise || "Top exercise",
          value: topExerciseEntry ? `${topExerciseEntry.name}` : "-",
        },
        {
          label: tr.insightPrHighlight || "PR highlight",
          value: prHighlight
            ? `${prHighlight.exercise} (${prTypeLabel(prHighlight.pr_type)})${
                formatPrDetail(prHighlight)
                  ? ` ${formatPrDetail(prHighlight)}`
                  : ""
              }`
            : "-",
        },
      ];

      insights.forEach((insight) => {
        const item = document.createElement("div");
        item.className = "insight-item";
        const label = document.createElement("div");
        label.className = "insight-label";
        label.textContent = insight.label;
        const value = document.createElement("div");
        value.className = "insight-value";
        value.textContent = insight.value;
        item.appendChild(label);
        item.appendChild(value);
        grid.appendChild(item);
      });
    }

    function renderOnboardingChecklist() {
      const list = $("checklist");
      const status = $("onboarding-status");
      const bar = $("onboarding-bar");
      const meta = $("onboarding-meta");
      if (!list || !status) return;
      const tr = t[currentLang] || t.ja;
      list.innerHTML = "";
      status.textContent = "";
      if (bar) bar.style.width = "0%";
      if (meta) meta.textContent = "0/0";

      if (!currentUser) {
        status.textContent =
          tr.summaryLoginRequired || "Log in to get started.";
        return;
      }

      const userPosts = getUserPosts();
      const userPostIds = getUserPostIds();
      const hasWorkout = Array.from(workoutLogsByPost.keys()).some((postId) =>
        userPostIds.has(postId)
      );
      const hasMedia = userPosts.some((post) => post.media_url);

      const items = [
        {
          label: tr.checklistProfile || "Fill out your profile",
          done: Boolean(currentProfile?.display_name && currentProfile?.bio),
        },
        {
          label: tr.checklistAvatar || "Add an avatar",
          done: Boolean(currentProfile?.avatar_url),
        },
        {
          label: tr.checklistFirstPost || "Make your first post",
          done: userPosts.length > 0,
        },
        {
          label: tr.checklistFirstWorkout || "Post a workout log",
          done: hasWorkout,
        },
        {
          label: tr.checklistFirstMedia || "Upload a photo/video",
          done: hasMedia,
        },
        {
          label: tr.checklistTemplate || "Create a template",
          done: templates.length > 0,
        },
        {
          label: tr.checklistPR || "Record a PR",
          done: exercisePRs.size > 0,
        },
      ];

      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = `check-item${item.done ? " done" : ""}`;
        const dot = document.createElement("div");
        dot.className = "check-dot";
        const text = document.createElement("div");
        text.textContent = item.label;
        row.appendChild(dot);
        row.appendChild(text);
        list.appendChild(row);
      });

      const doneCount = items.filter((item) => item.done).length;
      const totalCount = items.length || 1;
      const percent = Math.round((doneCount / totalCount) * 100);
      if (bar) bar.style.width = `${percent}%`;
      if (meta) {
        const progressText =
          tr.onboardingProgress || "{done}/{total} 完了";
        meta.textContent = progressText
          .replace("{done}", `${doneCount}`)
          .replace("{total}", `${totalCount}`);
      }

      if (items.every((item) => item.done)) {
        status.textContent = tr.onboardingComplete || "All set!";
      }
    }

    function renderPrList() {
      const list = $("pr-list");
      const status = $("pr-status");
      if (!list || !status) return;
      const tr = t[currentLang] || t.ja;

      list.innerHTML = "";
      status.textContent = "";

      if (!currentUser) {
        status.textContent =
          tr.summaryLoginRequired || "Log in to see your summary.";
        return;
      }
      if (!prTrackingEnabled) {
        status.textContent = tr.prUnavailable || "PRs are not available yet.";
        return;
      }
      if (!exercisePRs.size) {
        status.textContent = tr.prEmpty || "No PRs yet.";
        return;
      }

      const entries = Array.from(exercisePRs.values())
        .map((pr) => ({
          name: pr.name || "Exercise",
          best_weight: pr.best_weight,
          best_reps: pr.best_reps,
          updated_at: pr.updated_at,
        }))
        .sort((a, b) => {
          const weightDiff = (b.best_weight || 0) - (a.best_weight || 0);
          if (weightDiff !== 0) return weightDiff;
          const repsDiff = (b.best_reps || 0) - (a.best_reps || 0);
          if (repsDiff !== 0) return repsDiff;
          return (b.updated_at || "").localeCompare(a.updated_at || "");
        })
        .slice(0, 8);

      entries.forEach((pr) => {
        const item = document.createElement("div");
        item.className = "notification-item";

        const title = document.createElement("div");
        title.textContent = pr.name;

        const meta = document.createElement("div");
        meta.className = "notification-meta";
        const weightText =
          pr.best_weight !== null && pr.best_weight !== undefined
            ? formatWeight(pr.best_weight)
            : "-";
        const repsText =
          pr.best_reps !== null && pr.best_reps !== undefined
            ? `${pr.best_reps} reps`
            : "-";
        meta.textContent = `${weightText} / ${repsText}`;

        item.appendChild(title);
        item.appendChild(meta);
        list.appendChild(item);
      });
    }

    async function markNotificationRead(notificationId) {
      if (!currentUser || !notificationId) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("user_id", currentUser.id);

      if (error) {
        console.error("markNotificationRead error:", error);
        return;
      }
      notifications = notifications.map((note) =>
        note.id === notificationId
          ? { ...note, read_at: new Date().toISOString() }
          : note
      );
      renderNotifications();
    }

    async function markAllNotificationsRead() {
      if (!currentUser || !notifications.length) return;
      const unreadIds = notifications.filter((note) => !note.read_at).map((note) => note.id);
      if (!unreadIds.length) return;

      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds)
        .eq("user_id", currentUser.id);

      if (error) {
        console.error("markAllNotificationsRead error:", error);
        return;
      }
      notifications = notifications.map((note) => ({
        ...note,
        read_at: note.read_at || new Date().toISOString(),
      }));
      renderNotifications();
    }

    async function createNotification({ userId, actorId, type, postId }) {
      if (!notificationsEnabled) return;
      if (!userId || !actorId || userId === actorId) return;
      const { error } = await supabase.from("notifications").insert({
        user_id: userId,
        actor_id: actorId,
        type,
        post_id: postId || null,
      });
      if (error) {
        console.error("createNotification error:", error);
        notificationsEnabled = false;
      }
    }

    async function toggleFollowForUser(targetUserId) {
      if (!currentUser || !targetUserId || targetUserId === currentUser.id) return;
      const isFollowing = followingIds.has(targetUserId);

      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", targetUserId);
        if (error) {
          console.error("unfollow error:", error);
          showToast("フォロー解除に失敗しました。", "error");
          return;
        }
        followingIds.delete(targetUserId);
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({
            follower_id: currentUser.id,
            following_id: targetUserId,
          });
        if (error) {
          console.error("follow error:", error);
          showToast("フォローに失敗しました。", "error");
          return;
        }
        followingIds.add(targetUserId);
        await createNotification({
          userId: targetUserId,
          actorId: currentUser.id,
          type: "follow",
        });
      }
    }



    function resetPostForm() {
      draftSaveBlockedUntil = Date.now() + 800;
      if (draftSaveTimer) {
        clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
      }
      $("post-date").valueAsDate = new Date();
      $("post-weight").value = "";
      $("post-caption").value = "";
      $("post-visibility").value = settings.defaultVisibility || "public";
      const mediaInput = $("post-media");
      if (mediaInput) mediaInput.value = "";
      const templateSelect = $("post-template");
      if (templateSelect) templateSelect.value = "";
      currentMediaFile = null;
      renderMediaPreview(null);
      workoutExercises = [];
      addExercise();
      stopRestTimer();
    }

    async function handleSubmitPost() {
      if (!currentUser) {
        showToast("ログインしてください。", "warning");
        return;
      }

      const submitBtn = $("btn-submit");
      setButtonLoading(submitBtn, true, "Posting...");

      const date = $("post-date").value;
      const weight = $("post-weight").value;
      const caption = $("post-caption").value.trim();
      const visibility = $("post-visibility").value;

      try {
        if (!date && !caption && !currentMediaFile) {
          showToast("何かしら入力してください。", "warning");
          return;
        }

        let mediaUrl = null;
        let mediaType = null;

        if (currentMediaFile) {
          const mediaValidationError = getFileValidationError(currentMediaFile, "post");
          if (mediaValidationError) {
            showToast(mediaValidationError, "warning");
            return;
          }
          const ext = getSafeFileExtension(currentMediaFile);
          const path = `public/${currentUser.id}/${Date.now()}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from("post-media")
            .upload(path, currentMediaFile);

          if (uploadErr) {
            showToast(
              "画像アップロードに失敗しました: " + uploadErr.message,
              "error"
            );
            return;
          }

          const { data: publicData } = supabase.storage
            .from("post-media")
            .getPublicUrl(path);

          mediaUrl = publicData.publicUrl;
          mediaType = currentMediaFile.type.startsWith("video")
            ? "video"
            : "image";
        }

        const bodyweightValue = weight ? toKg(Number(weight)) : null;
        const payload = {
          user_id: currentUser.id,
          date: date || null,
          bodyweight: bodyweightValue,
          note: caption || null,
          media_url: mediaUrl,
          media_type: mediaType,
          visibility,
        };

        const { data: insertedPost, error } = await supabase
          .from("posts")
          .insert(payload)
          .select("id")
          .single();

        if (error || !insertedPost) {
          showToast("投稿エラー: " + (error?.message || "unknown"), "error");
          console.error(error);
          return;
        }

        const workoutLogs = collectWorkoutLogs();
        const prResult = computePRUpdates(workoutLogs);
        const logsWithPr = prResult.logs;
        if (workoutLogsEnabled && logsWithPr.length) {
          const { error: logError } = await supabase
            .from("workout_sets")
            .insert(
              logsWithPr.map((log) => ({
                post_id: insertedPost.id,
                user_id: currentUser.id,
                exercise: log.exercise,
                set_index: log.set_index,
                reps: log.reps,
                weight: log.weight,
                rest_seconds: log.rest_seconds,
                exercise_note: log.exercise_note,
                pr_type: log.pr_type || null,
              }))
            );
          if (logError) {
            console.error("workout log insert error:", logError);
            workoutLogsEnabled = false;
            renderWorkoutRows();
          } else {
            await upsertExercisePRs(prResult.updates);
          }
        }

        resetPostForm();
        clearPostDraft();
        const backdrop = $("post-modal-backdrop");
        if (backdrop) backdrop.classList.add("hidden");
        await loadFeed();
        showToast("投稿しました！", "success");
      } finally {
        setButtonLoading(submitBtn, false);
      }
    }

    // ------------------ Feed & フィルタ ------------------









    async function loadCommentsForPost(postId) {
      if (!postId || !commentsEnabled) return commentsByPost.get(postId) || [];
      if (commentSync.isPostLoaded(postId)) {
        return commentsByPost.get(postId) || [];
      }
      if (!commentSync.isOnline()) {
        return commentsByPost.get(postId) || [];
      }

      commentsLoading.add(postId);
      refreshFeedPostComments(postId);

      const { data, error } = await supabase
        .from("comments")
        .select("id, post_id, user_id, body, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      commentsLoading.delete(postId);
      refreshFeedPostComments(postId);

      if (error) {
        console.error("loadComments error:", error);
        if (commentSync.isLikelyTransientNetworkError(error)) {
          return commentsByPost.get(postId) || [];
        }
        commentsEnabled = false;
        refreshFeedPostComments(postId);
        return commentsByPost.get(postId) || [];
      }

      const profileMap = await loadProfilesForUsers(
        (data || []).map((comment) => comment.user_id)
      );
      const withProfiles = (data || []).map((comment) => ({
        ...comment,
        profile: profileMap.get(comment.user_id) || null,
      }));
      const merged = commentSync.mergePendingComments(postId, withProfiles);
      commentsByPost.set(postId, merged);
      commentSync.markPostLoaded(postId);
      refreshFeedPostComments(postId);
      return merged;
    }

    function toggleComments(postId) {
      if (commentsExpanded.has(postId)) {
        commentsExpanded.delete(postId);
        refreshFeedPostComments(postId);
        return;
      }
      commentsExpanded.add(postId);
      refreshFeedPostComments(postId);
      if (!commentSync.isPostLoaded(postId) && commentsEnabled) {
        loadCommentsForPost(postId).finally(() => {
          refreshFeedPostComments(postId);
        });
      }
    }

    async function submitComment(post, inputEl) {
      const postId = post?.id;
      if (!postId) return;
      if (!currentUser) {
        showToast("ログインしてください。", "warning");
        return;
      }
      if (!commentsEnabled) return;
      const body = inputEl.value.trim();
      if (!body) return;
      const tr = t[currentLang] || t.ja;

      let profile = currentProfile || null;
      if (!profile && currentUser?.id) {
        try {
          profile = await getProfile(currentUser.id);
        } catch (profileError) {
          console.error("load comment profile error:", profileError);
        }
      }

      const queueComment = () => {
        commentSync.enqueueOfflineComment({
          postId,
          body,
          targetUserId: post.user_id,
          profile,
        });
        inputEl.value = "";
        refreshFeedPostComments(postId);
        showToast(
          tr.commentQueued ||
            "オフラインのため、コメントを保存しました。オンライン時に送信します。",
          "info"
        );
      };

      if (!commentSync.isOnline()) {
        queueComment();
        return;
      }

      const { data, error } = await supabase
        .from("comments")
        .insert({
          post_id: postId,
          user_id: currentUser.id,
          body,
        })
        .select("id, post_id, user_id, body, created_at")
        .single();

      if (error) {
        if (commentSync.isLikelyTransientNetworkError(error)) {
          queueComment();
          return;
        }
        console.error("comment insert error:", error);
        commentsEnabled = false;
        refreshFeedPostComments(postId);
        showToast("コメントの投稿に失敗しました。", "error");
        return;
      }

      const next = commentsByPost.get(postId) || [];
      next.push({ ...data, profile: profile || null });
      commentsByPost.set(postId, commentSync.sortCommentsByCreatedAt(next));
      inputEl.value = "";
      refreshFeedPostComments(postId);
      await createNotification({
        userId: post.user_id,
        actorId: currentUser.id,
        type: "comment",
        postId: postId,
      });
    }

  // カード描画
  

        

    
    async function deletePost(id) {
      const ok = window.confirm("この投稿を削除しますか？");
      if (!ok) return;
      const { error } = await supabase.from("posts").delete().eq("id", id);
      if (error) {
        showToast("削除エラー: " + error.message, "error");
        return;
      }
      await loadFeed();
    }

    async function clearLocalRuntimeCaches() {
      localStorage.removeItem("trends_likes");
      localStorage.removeItem("trends_feed_cache_v1");
      localStorage.removeItem("trends_likes_offline_queue_v1");
      commentSync.clearQueue();
      profileEditState.clearDraft(currentUser?.id);
      if (typeof caches !== "undefined") {
        try {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((key) => key.startsWith("trends-shell-"))
              .map((key) => caches.delete(key))
          );
        } catch (error) {
          console.warn("cache storage clear failed", error);
        }
      }
    }

    async function getServiceWorkerRegistration() {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return null;
      }
      try {
        const scoped = await navigator.serviceWorker.getRegistration("./");
        if (scoped) return scoped;
      } catch {
        // ignore
      }
      try {
        return await navigator.serviceWorker.getRegistration();
      } catch {
        return null;
      }
    }

    async function refreshAppVersion() {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return false;
      }
      if (isLocalPreviewHost()) {
        return false;
      }
      let registration = await getServiceWorkerRegistration();
      try {
        const scriptUrl = await resolveServiceWorkerScriptUrl(true);
        registration = await navigator.serviceWorker.register(scriptUrl, {
          updateViaCache: "none",
        });
      } catch (error) {
        console.warn("service worker registration refresh failed", error);
      }
      if (!registration) return false;
      try {
        await registration.update();
      } catch (error) {
        console.warn("service worker update check failed", error);
      }
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return true;
      }
      return false;
    }

    // ------------------ Debug ------------------
    function setupDebug() {
      const statusEl = $("settings-data-status");
      const setStatus = (message, durationMs = 2500) => {
        if (!statusEl) return;
        statusEl.textContent = message;
        setTimeout(() => {
          statusEl.textContent = "";
        }, durationMs);
      };
      const liveStatusEl = $("settings-live-status");
      const setLiveStatus = (message = "") => {
        if (!liveStatusEl) return;
        liveStatusEl.textContent = message;
      };
      const renderSupabaseSourceStatus = () => {
        const sourceEl = $("settings-supabase-source");
        if (!sourceEl) return;
        const tr = t[currentLang] || t.ja;
        const sourceText =
          SUPABASE_CONFIG_SOURCE === "local"
            ? tr.settingsSupabaseSourceLocal ||
              "Current source: local override from this browser"
            : tr.settingsSupabaseSourceDefault ||
              "Current source: built-in default from app code";
        sourceEl.textContent = `${sourceText} (${getSupabaseHostLabel()})`;
      };
      const fillSupabaseConfigInputs = () => {
        const urlInput = $("settings-supabase-url");
        const keyInput = $("settings-supabase-key");
        if (urlInput) urlInput.value = SUPABASE_URL || "";
        if (keyInput) keyInput.value = SUPABASE_ANON_KEY || "";
      };
      const setInlineButtonLoading = (button, loading) => {
        if (!button) return;
        button.classList.toggle("is-loading", !!loading);
        button.disabled = !!loading;
      };
      const toIsoMaybe = (value) => {
        const num = Number(value || 0);
        if (!Number.isFinite(num) || num <= 0) return null;
        try {
          return new Date(num).toISOString();
        } catch {
          return null;
        }
      };
      const buildDiagnosticsPayload = () => {
        const connectivityError =
          supabaseConnectivityState?.error?.message ||
          String(supabaseConnectivityState?.error || "");
        const issueCode = getConnectivityIssueCode(supabaseConnectivityState);
        const issueHint = getConnectivityIssueHint(
          issueCode,
          t[currentLang] || t.ja
        );
        return {
          generated_at: new Date().toISOString(),
          app: {
            build_version: appBuildMeta.version || "dev-local",
            build_time: appBuildMeta.builtAt || null,
            location: typeof window !== "undefined" ? window.location.href : "",
            lang: currentLang,
          },
          supabase: {
            host: getSupabaseHostLabel(),
            source: SUPABASE_CONFIG_SOURCE,
            anon_key_fingerprint: getKeyFingerprint(SUPABASE_ANON_KEY),
            connectivity: {
              ok: supabaseConnectivityState.ok,
              rest_status: supabaseConnectivityState.restStatus || 0,
              auth_status: supabaseConnectivityState.authStatus || 0,
              issue_code: issueCode || null,
              issue_hint: issueHint || null,
              timed_out: !!supabaseConnectivityState.timedOut,
              checked_at: toIsoMaybe(supabaseConnectivityState.checkedAt),
              retry_after: toIsoMaybe(supabaseConnectivityState.retryAfter),
              error: connectivityError || null,
            },
          },
          runtime: {
            online:
              typeof navigator === "undefined" ? true : navigator.onLine !== false,
            user_agent:
              typeof navigator === "undefined" ? "" : navigator.userAgent,
            current_user_id: currentUser?.id || null,
            current_profile_id: currentProfile?.id || null,
            posts_count: Array.isArray(allPosts) ? allPosts.length : 0,
            runtime_issues_count: Array.isArray(runtimeIssues)
              ? runtimeIssues.length
              : 0,
          },
          runtime_issues: Array.isArray(runtimeIssues) ? runtimeIssues : [],
          settings,
        };
      };
      const copyDiagnosticsToClipboard = async () => {
        const payload = buildDiagnosticsPayload();
        const text = JSON.stringify(payload, null, 2);
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === "function"
        ) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.select();
        let ok = false;
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        textarea.remove();
        return ok;
      };
      const readDraftSupabaseConfig = () => {
        const tr = t[currentLang] || t.ja;
        const urlInput = $("settings-supabase-url");
        const keyInput = $("settings-supabase-key");
        const nextUrl = normalizeSupabaseUrlInput(urlInput?.value || "");
        const nextKey = String(keyInput?.value || "").trim();
        if (!nextUrl || !looksLikeSupabaseHost(nextUrl)) {
          setStatus(
            tr.settingsSupabaseInvalidUrl ||
              "Invalid Supabase URL. Use https://<project-ref>.supabase.co",
            5000
          );
          return null;
        }
        if (!nextKey) {
          setStatus(
            tr.settingsSupabaseMissingKey || "Please enter the anon key.",
            4200
          );
          return null;
        }
        if (!looksLikeSupabaseAnonKey(nextKey)) {
          setStatus(
            tr.settingsSupabaseInvalidKey ||
              "Anon key format looks invalid. Paste the full anon key from Supabase settings.",
            5200
          );
          return null;
        }
        return { url: nextUrl, anonKey: nextKey };
      };
      const checkLiveDeployStatus = async () => {
        const tr = t[currentLang] || t.ja;
        const localVersion = appBuildMeta.version || "dev-local";
        const localBuiltAt = appBuildMeta.builtAt
          ? formatDateTimeDisplay(appBuildMeta.builtAt)
          : tr.settingsBuildUnknown || "Unknown";
        const checkingMessage =
          tr.settingsLiveChecking || "Checking live deployment...";
        setStatus(checkingMessage, 5200);
        setLiveStatus(checkingMessage);
        try {
          const localOrigin =
            typeof window !== "undefined" ? window.location.origin : "";
          let liveOrigin = "";
          try {
            liveOrigin = new URL(getLiveSiteUrl()).origin;
          } catch {
            liveOrigin = "";
          }
          const canDirectCompare =
            !!localOrigin && !!liveOrigin && localOrigin === liveOrigin;
          if (!canDirectCompare) {
            const remoteSha = await fetchGitHubMainCommitShortSha();
            const hasComparableLocal = isLikelyCommitVersion(localVersion);
            const isMatch =
              hasComparableLocal &&
              localVersion.toLowerCase() === remoteSha.toLowerCase();
            const summary = isMatch
              ? tr.settingsLiveRepoMatch ||
                "Current build ID matches the latest GitHub main commit."
              : tr.settingsLiveRepoMismatch ||
                "Current build ID differs from latest GitHub main commit.";
            const modeHint =
              tr.settingsLiveCrossOriginHint ||
              "Running outside the live host, so checked latest GitHub main commit.";
            setStatus(summary, 7000);
            setLiveStatus(
              `${modeHint} ${summary} (local=${localVersion}, main=${remoteSha}, local built: ${localBuiltAt})`
            );
            return;
          }
          const liveUrl = getLiveBuildMetaUrl();
          const response = await fetch(`${liveUrl}?t=${Date.now()}`, {
            cache: "no-store",
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const liveMetaRaw = await response.json();
          const liveMeta = normalizeBuildMeta(liveMetaRaw);
          const liveVersion = liveMeta.version || "unknown";
          const liveBuiltAt = liveMeta.builtAt
            ? formatDateTimeDisplay(liveMeta.builtAt)
            : tr.settingsBuildUnknown || "Unknown";
          const sameVersion = liveVersion === localVersion;
          const message = sameVersion
            ? `${tr.settingsLiveUpToDate || "Live site is up to date."} (${liveVersion})`
            : `${tr.settingsLiveOutdated || "Live site version differs from this app."} local=${localVersion}, live=${liveVersion}`;
          const detail = `${message} | local built: ${localBuiltAt} | live built: ${liveBuiltAt}`;
          setLiveStatus(detail);
          setStatus(message, 7000);
          return;
        } catch (error) {
          const detail = String(error?.message || error || "").slice(0, 180);
          const message =
            tr.settingsLiveUnavailable || "Could not check live deployment.";
          const full = detail ? `${message} (${detail})` : message;
          setLiveStatus(full);
          setStatus(full, 7000);
        }
      };
      const testDraftSupabaseConfig = async (config) => {
        const tr = t[currentLang] || t.ja;
        setStatus(
          tr.settingsSupabaseTesting || "Checking this URL/key...",
          6000
        );
        const result = await runSupabaseConnectionProbe({
          url: config.url,
          anonKey: config.anonKey,
          timeoutMs: 8000,
        });
        const hostLabel = getSupabaseHostLabelFromUrl(config.url);
        if (result.ok) {
          const okMessage =
            tr.settingsSupabaseTestOk ||
            "This URL/key can reach Supabase.";
          setStatus(`${okMessage} (${hostLabel})`, 6500);
          return { ok: true, result };
        }
        const failedMessage =
          tr.settingsSupabaseTestFailed ||
          "This URL/key could not reach Supabase.";
        const detail = formatConnectionStatusMessage(result, tr, hostLabel);
        setStatus(`${failedMessage} ${detail}`, 8000);
        return { ok: false, result };
      };
      fillSupabaseConfigInputs();
      renderSupabaseSourceStatus();
      renderConnectivitySummary();
      setLiveStatus(
        (t[currentLang] || t.ja).settingsLiveStatusHint ||
          "Use \"Check live deployment\" to compare local and live versions."
      );
      const isPerfDebugEnabled = () => {
        try {
          return localStorage.getItem(PERF_DEBUG_KEY) === "true";
        } catch {
          return false;
        }
      };
      const setPerfDebugEnabled = (next) => {
        try {
          localStorage.setItem(PERF_DEBUG_KEY, next ? "true" : "false");
        } catch {
          // ignore localStorage write failure
        }
      };
      const perfBtn = $("btn-toggle-perf-debug");
      const updatePerfDebugButton = () => {
        if (!perfBtn) return;
        const tr = t[currentLang] || t.ja;
        const enabled = isPerfDebugEnabled();
        perfBtn.textContent = enabled
          ? tr.perfDebugDisable || "Disable render perf"
          : tr.perfDebugEnable || "Enable render perf";
        perfBtn.classList.toggle("is-active", enabled);
      };
      updatePerfDebugButton();

      if (perfBtn && perfBtn.dataset.bound !== "true") {
        perfBtn.dataset.bound = "true";
        perfBtn.addEventListener("click", () => {
          const tr = t[currentLang] || t.ja;
          const next = !isPerfDebugEnabled();
          setPerfDebugEnabled(next);
          updatePerfDebugButton();
          renderFeed();
          setStatus(
            next
              ? tr.perfDebugEnabledMsg || "Render performance panel enabled."
              : tr.perfDebugDisabledMsg || "Render performance panel disabled."
          );
        });
      }

      const clearBtn = $("btn-clear-cache");
      if (clearBtn && clearBtn.dataset.bound !== "true") {
        clearBtn.dataset.bound = "true";
        clearBtn.addEventListener("click", async () => {
          if (clearBtn.classList.contains("is-loading")) return;
          clearBtn.classList.add("is-loading");
          clearBtn.disabled = true;
          try {
            await clearLocalRuntimeCaches();
            setStatus(t[currentLang].cacheCleared || "Cache cleared.");
            renderFeed();
          } finally {
            clearBtn.classList.remove("is-loading");
            clearBtn.disabled = false;
          }
        });
      }

      const forceUpdateBtn = $("btn-force-update");
      if (forceUpdateBtn && forceUpdateBtn.dataset.bound !== "true") {
        forceUpdateBtn.dataset.bound = "true";
        forceUpdateBtn.addEventListener("click", async () => {
          if (forceUpdateBtn.classList.contains("is-loading")) return;
          forceUpdateBtn.classList.add("is-loading");
          forceUpdateBtn.disabled = true;
          try {
            await clearLocalRuntimeCaches();
            const hasWaitingWorker = await refreshAppVersion();
            const tr = t[currentLang] || t.ja;
            setStatus(
              hasWaitingWorker
                ? tr.appUpdateReloading || "Updating app and reloading..."
                : tr.appUpdateReady || "App updated. Reloading…"
            );
            setTimeout(() => {
              window.location.reload();
            }, 300);
          } finally {
            forceUpdateBtn.classList.remove("is-loading");
            forceUpdateBtn.disabled = false;
          }
        });
      }

      const connectionBtn = $("btn-connection-test");
      if (connectionBtn && connectionBtn.dataset.bound !== "true") {
        connectionBtn.dataset.bound = "true";
        connectionBtn.addEventListener("click", async () => {
          if (connectionBtn.classList.contains("is-loading")) return;
          connectionBtn.classList.add("is-loading");
          connectionBtn.disabled = true;
          const tr = t[currentLang] || t.ja;
          try {
            setStatus(
              tr.settingsConnectionChecking || "Checking connection...",
              6000
            );
            const result = await runSupabaseConnectionTest({ force: true });
            renderAuthNetworkStatus(result);
            const message = formatConnectionStatusMessage(result, tr);
            setStatus(message, 7000);
          } finally {
            connectionBtn.classList.remove("is-loading");
            connectionBtn.disabled = false;
          }
        });
      }

      const liveCheckBtn = $("btn-live-check");
      if (liveCheckBtn && liveCheckBtn.dataset.bound !== "true") {
        liveCheckBtn.dataset.bound = "true";
        liveCheckBtn.addEventListener("click", async () => {
          if (liveCheckBtn.classList.contains("is-loading")) return;
          setInlineButtonLoading(liveCheckBtn, true);
          try {
            await checkLiveDeployStatus();
          } finally {
            setInlineButtonLoading(liveCheckBtn, false);
          }
        });
      }

      const openLiveSiteBtn = $("btn-open-live-site");
      if (openLiveSiteBtn && openLiveSiteBtn.dataset.bound !== "true") {
        openLiveSiteBtn.dataset.bound = "true";
        openLiveSiteBtn.addEventListener("click", () => {
          const tr = t[currentLang] || t.ja;
          const url = getLiveSiteUrl();
          window.open(url, "_blank", "noopener,noreferrer");
          setStatus(
            tr.settingsLiveOpenDone || "Opened live site in a new tab.",
            2600
          );
        });
      }

      const copyDiagnosticsBtn = $("btn-copy-diagnostics");
      if (copyDiagnosticsBtn && copyDiagnosticsBtn.dataset.bound !== "true") {
        copyDiagnosticsBtn.dataset.bound = "true";
        copyDiagnosticsBtn.addEventListener("click", async () => {
          const tr = t[currentLang] || t.ja;
          setInlineButtonLoading(copyDiagnosticsBtn, true);
          try {
            const copied = await copyDiagnosticsToClipboard();
            if (copied) {
              setStatus(
                tr.settingsDiagnosticsCopied || "Diagnostics copied.",
                2600
              );
            } else {
              setStatus(
                tr.settingsDiagnosticsCopyFailed ||
                  "Failed to copy diagnostics.",
                4000
              );
            }
          } catch {
            setStatus(
              tr.settingsDiagnosticsCopyFailed ||
                "Failed to copy diagnostics.",
              4000
            );
          } finally {
            setInlineButtonLoading(copyDiagnosticsBtn, false);
          }
        });
      }

      const downloadDiagnosticsBtn = $("btn-download-diagnostics");
      if (
        downloadDiagnosticsBtn &&
        downloadDiagnosticsBtn.dataset.bound !== "true"
      ) {
        downloadDiagnosticsBtn.dataset.bound = "true";
        downloadDiagnosticsBtn.addEventListener("click", () => {
          const tr = t[currentLang] || t.ja;
          const payload = buildDiagnosticsPayload();
          const stamp = new Date();
          const y = stamp.getFullYear();
          const m = String(stamp.getMonth() + 1).padStart(2, "0");
          const d = String(stamp.getDate()).padStart(2, "0");
          const hh = String(stamp.getHours()).padStart(2, "0");
          const mm = String(stamp.getMinutes()).padStart(2, "0");
          const fileName = `trends-diagnostics-${y}${m}${d}-${hh}${mm}.json`;
          const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          setStatus(
            tr.settingsDiagnosticsDownloaded ||
              "Downloaded diagnostics JSON.",
            2600
          );
        });
      }

      const clearDiagnosticsBtn = $("btn-clear-diagnostics");
      if (clearDiagnosticsBtn && clearDiagnosticsBtn.dataset.bound !== "true") {
        clearDiagnosticsBtn.dataset.bound = "true";
        clearDiagnosticsBtn.addEventListener("click", () => {
          const tr = t[currentLang] || t.ja;
          clearRuntimeIssues();
          setStatus(
            tr.settingsDiagnosticsCleared || "Runtime diagnostics were cleared.",
            2600
          );
        });
      }

      const supabaseTestBtn = $("btn-supabase-test");
      if (supabaseTestBtn && supabaseTestBtn.dataset.bound !== "true") {
        supabaseTestBtn.dataset.bound = "true";
        supabaseTestBtn.addEventListener("click", async () => {
          const config = readDraftSupabaseConfig();
          if (!config) return;
          setInlineButtonLoading(supabaseTestBtn, true);
          try {
            await testDraftSupabaseConfig(config);
          } finally {
            setInlineButtonLoading(supabaseTestBtn, false);
          }
        });
      }

      const supabaseSaveBtn = $("btn-supabase-save");
      if (supabaseSaveBtn && supabaseSaveBtn.dataset.bound !== "true") {
        supabaseSaveBtn.dataset.bound = "true";
        supabaseSaveBtn.addEventListener("click", async () => {
          const tr = t[currentLang] || t.ja;
          const config = readDraftSupabaseConfig();
          if (!config) return;
          setInlineButtonLoading(supabaseSaveBtn, true);
          try {
            const tested = await testDraftSupabaseConfig(config);
            if (!tested.ok) return;
            saveStoredSupabaseConfig(config);
            setStatus(
              tr.settingsSupabaseSaved ||
                "Saved Supabase endpoint. Reloading the app now.",
              2600
            );
            setTimeout(() => {
              window.location.reload();
            }, 320);
          } catch {
            setStatus(
              tr.settingsSupabaseInvalidUrl ||
                "Invalid Supabase URL. Use https://<project-ref>.supabase.co",
              5000
            );
          } finally {
            setInlineButtonLoading(supabaseSaveBtn, false);
          }
        });
      }

      const supabaseResetBtn = $("btn-supabase-reset");
      if (supabaseResetBtn && supabaseResetBtn.dataset.bound !== "true") {
        supabaseResetBtn.dataset.bound = "true";
        supabaseResetBtn.addEventListener("click", () => {
          const tr = t[currentLang] || t.ja;
          setStatus(
            tr.settingsSupabaseResetDone ||
              "Reverted Supabase endpoint to default. Reloading the app now.",
            2600
          );
          setTimeout(resetSupabaseConfigToDefaultAndReload, 320);
        });
      }

      const exportBtn = $("btn-export-data");
      if (exportBtn && exportBtn.dataset.bound !== "true") {
        exportBtn.dataset.bound = "true";
        exportBtn.addEventListener("click", () => {
          const exportData = {
            exported_at: new Date().toISOString(),
            settings,
            profile: currentProfile,
            posts: allPosts,
            templates,
            workout_logs: Object.fromEntries(
              Array.from(workoutLogsByPost.entries())
            ),
          };
          const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          const stamp = new Date();
          const y = stamp.getFullYear();
          const m = String(stamp.getMonth() + 1).padStart(2, "0");
          const d = String(stamp.getDate()).padStart(2, "0");
          link.href = url;
          link.download = `trends-export-${y}${m}${d}.json`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          setStatus(t[currentLang].settingsDataExported || "Exported.");
        });
      }

      const resetBtn = $("btn-reset-settings");
      if (resetBtn && resetBtn.dataset.bound !== "true") {
        resetBtn.dataset.bound = "true";
        resetBtn.addEventListener("click", () => {
          const tr = t[currentLang] || t.ja;
          const ok = window.confirm(
            tr.settingsResetConfirm || "Reset settings to defaults?"
          );
          if (!ok) return;
          settingsController.resetToDefaults();
          setStatus(t[currentLang].settingsResetDone || "Settings reset.");
        });
      }

      const presetRecommended = $("btn-settings-recommended");
      if (presetRecommended && presetRecommended.dataset.bound !== "true") {
        presetRecommended.dataset.bound = "true";
        presetRecommended.addEventListener("click", () => {
          applySettingsPreset("recommended");
          setStatus(t[currentLang].settingsPresetApplied || "Preset applied.");
        });
      }

      const presetMinimal = $("btn-settings-minimal");
      if (presetMinimal && presetMinimal.dataset.bound !== "true") {
        presetMinimal.dataset.bound = "true";
        presetMinimal.addEventListener("click", () => {
          applySettingsPreset("minimal");
          setStatus(t[currentLang].settingsPresetApplied || "Preset applied.");
        });
      }

      const presetFull = $("btn-settings-full");
      if (presetFull && presetFull.dataset.bound !== "true") {
        presetFull.dataset.bound = "true";
        presetFull.addEventListener("click", () => {
          applySettingsPreset("full");
          setStatus(t[currentLang].settingsPresetApplied || "Preset applied.");
        });
      }
    }
