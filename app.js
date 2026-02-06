import { supabase } from "./supabaseClient.js";
import { t } from "./i18n.js";
import {
  $,
  setButtonLoading,
  showToast,
  renderAvatar,
  normalizeUrl,
  normalizeHandleUrl,
  formatHandle,
  normalizeExerciseName,
  toDateKey,
  parseDateValue,
  formatDateDisplay,
  formatDateTimeDisplay,
  formatNumber,
  convertWeightValue,
  convertHeightValue,
  toKg,
  fromKg,
  formatWeight,
  formatHeight,
  formatVolume,
  computeStreak,
  computeWorkoutStats,
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
  resetFeedPagination,
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

    // ---- 状態 ----
    let currentUser = null;
    let currentProfile = null;
    let allPosts = [];
    let showExtraSections = false;
    let currentLang = "ja";
    let currentMediaFile = null;
    let currentMediaPreviewUrl = null;
    let draftSaveTimer = null;
    let draftSaveBlockedUntil = 0;
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

    const SETTINGS_KEY = "trends_settings_v1";
    const POST_DRAFT_KEY = "trends_post_draft_v1";
    const defaultSettings = {
      compactMode: false,
      showExtraSections: false,
      showFeedStats: true,
      defaultFilter: "all",
      feedLayout: "list",
      defaultVisibility: "public",
      showEmail: true,
      showProfileStats: true,
      showBodyweight: true,
      notifications: {
        like: true,
        comment: true,
        follow: true,
      },
      language: "ja",
      dateFormat: "auto",
      weightUnit: "kg",
      heightUnit: "cm",
    };
    let settings = { ...defaultSettings };
function loadSettings() {
      let stored = {};
      try {
        stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      } catch {
        stored = {};
      }

      const legacyExtra = localStorage.getItem("trends_show_extra_sections");
      const merged = {
        ...defaultSettings,
        ...stored,
        notifications: {
          ...defaultSettings.notifications,
          ...(stored.notifications || {}),
        },
      };
      if (legacyExtra !== null && stored.showExtraSections === undefined) {
        merged.showExtraSections = legacyExtra === "true";
      }
      if (!["all", "mine"].includes(merged.defaultFilter)) {
        merged.defaultFilter = "all";
      }
      if (!["list", "grid"].includes(merged.feedLayout)) {
        merged.feedLayout = "list";
      }
      if (!["public", "private"].includes(merged.defaultVisibility)) {
        merged.defaultVisibility = "public";
      }
      if (!["ja", "en"].includes(merged.language)) {
        merged.language = "ja";
      }
      if (!["auto", "ymd", "mdy"].includes(merged.dateFormat)) {
        merged.dateFormat = "auto";
      }
      if (!["kg", "lb"].includes(merged.weightUnit)) {
        merged.weightUnit = "kg";
      }
      if (!["cm", "in"].includes(merged.heightUnit)) {
        merged.heightUnit = "cm";
      }

      settings = merged;
      showExtraSections = !!settings.showExtraSections;
      if (settings.language) {
        currentLang = settings.language;
      }
      return settings;
    }
function saveSettings(next, options = {}) {
      settings = {
        ...settings,
        ...next,
        notifications: {
          ...settings.notifications,
          ...(next.notifications || {}),
        },
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      localStorage.removeItem("trends_show_extra_sections");
      showExtraSections = !!settings.showExtraSections;
      if (!options.skipApply) {
        applySettings();
      }
    }
function updateWeightLabels() {
      const tr = t[currentLang] || t.ja;
      const unit = settings.weightUnit === "lb" ? "lb" : "kg";
      const label = $("label-weight");
      if (label) {
        label.textContent = `${tr.weight || "Bodyweight"} (${unit})`;
      }
      const input = $("post-weight");
      if (input) {
        input.placeholder = settings.weightUnit === "lb" ? "170" : "77.4";
      }
    }
function updateHeightLabel() {
      const tr = t[currentLang] || t.ja;
      const unit = settings.heightUnit === "in" ? "in" : "cm";
      const label = $("profile-height-label");
      if (label) {
        label.textContent = `${tr.profileHeight || "Height"} (${unit})`;
      }
      const input = $("profile-height");
      if (input) {
        input.placeholder = settings.heightUnit === "in" ? "66" : "170";
      }
    }
function updateSettingsExpandLabel() {
      const btn = $("btn-settings-expand");
      if (!btn) return;
      const tr = t[currentLang] || t.ja;
      const keys = [
        "settings-preferences",
        "settings-privacy",
        "settings-notifications",
        "settings-language",
        "settings-data",
        "settings-templates",
        "settings-tips",
      ];
      const allOpen = keys.every((key) => {
        const wrapper = document.querySelector(`[data-collapsible="${key}"]`);
        const content = wrapper?.querySelector("[data-collapsible-content]");
        return content?.classList.contains("is-open");
      });
      btn.textContent = allOpen
        ? tr.settingsCollapse || "Collapse"
        : tr.settingsExpand || "Expand all";
      btn.setAttribute("aria-expanded", allOpen ? "true" : "false");
    }
function populateSettingsUI() {
      const setChecked = (id, value) => {
        const el = $(id);
        if (el) el.checked = !!value;
      };
      const setValue = (id, value) => {
        const el = $(id);
        if (el && value !== undefined && value !== null) {
          el.value = value;
        }
      };
      setChecked("settings-compact", settings.compactMode);
      setChecked("settings-show-extra", settings.showExtraSections);
      setChecked("settings-show-feed-stats", settings.showFeedStats);
      setChecked("settings-show-email", settings.showEmail);
      setChecked("settings-show-profile-stats", settings.showProfileStats);
      setChecked("settings-show-bodyweight", settings.showBodyweight);
      setChecked("settings-notify-like", settings.notifications?.like);
      setChecked("settings-notify-comment", settings.notifications?.comment);
      setChecked("settings-notify-follow", settings.notifications?.follow);
      setValue("settings-default-filter", settings.defaultFilter);
      setValue("settings-feed-layout", settings.feedLayout || "list");
      setValue("settings-default-visibility", settings.defaultVisibility);
      setValue("settings-language", settings.language);
      setValue("settings-date-format", settings.dateFormat);
      setValue("settings-weight-unit", settings.weightUnit);
      setValue("settings-height-unit", settings.heightUnit);
      updateSettingsExpandLabel();
    }
function updateExtraSectionsVisibility() {
      const tr = t[currentLang] || t.ja;
      const btn = $("btn-toggle-sections");
      const label = showExtraSections
        ? tr.hideExtraSections || "Hide sections"
        : tr.showMoreSections || "Show more sections";
      if (btn) {
        btn.textContent = label;
      }
      document.querySelectorAll(".extra-section").forEach((el) => {
        el.classList.toggle("hidden", !showExtraSections);
      });
      [
        "profile-details",
        "profile-edit-identity",
        "profile-edit-training",
        "profile-edit-media",
        "profile-edit-links",
        "summary-details",
      ].forEach((key) => setCollapsibleOpen(key, showExtraSections));
    }
function toggleSettingsSections() {
      const keys = [
        "settings-preferences",
        "settings-privacy",
        "settings-notifications",
        "settings-language",
        "settings-data",
        "settings-templates",
        "settings-tips",
      ];
      const shouldOpen = keys.some((key) => {
        const wrapper = document.querySelector(`[data-collapsible="${key}"]`);
        const content = wrapper?.querySelector("[data-collapsible-content]");
        return !content?.classList.contains("is-open");
      });
      keys.forEach((key) => setCollapsibleOpen(key, shouldOpen));
      updateSettingsExpandLabel();
    }
function setupSettingsUI() {
      const bindToggle = (id, handler) => {
        const el = $(id);
        if (!el || el.dataset.bound === "true") return;
        el.dataset.bound = "true";
        el.addEventListener("change", () => handler(el.checked));
      };
      const bindSelect = (id, handler) => {
        const el = $(id);
        if (!el || el.dataset.bound === "true") return;
        el.dataset.bound = "true";
        el.addEventListener("change", () => handler(el.value));
      };

      bindToggle("settings-compact", (value) =>
        saveSettings({ compactMode: value })
      );
      bindToggle("settings-show-extra", (value) =>
        saveSettings({ showExtraSections: value })
      );
      bindToggle("settings-show-feed-stats", (value) =>
        saveSettings({ showFeedStats: value })
      );
      bindSelect("settings-default-filter", (value) =>
        saveSettings({ defaultFilter: value })
      );
      bindSelect("settings-default-visibility", (value) =>
        saveSettings({ defaultVisibility: value })
      );
      bindToggle("settings-show-email", (value) =>
        saveSettings({ showEmail: value })
      );
      bindToggle("settings-show-profile-stats", (value) =>
        saveSettings({ showProfileStats: value })
      );
      bindToggle("settings-show-bodyweight", (value) =>
        saveSettings({ showBodyweight: value })
      );
      bindToggle("settings-notify-like", (value) =>
        saveSettings({ notifications: { like: value } })
      );
      bindToggle("settings-notify-comment", (value) =>
        saveSettings({ notifications: { comment: value } })
      );
      bindToggle("settings-notify-follow", (value) =>
        saveSettings({ notifications: { follow: value } })
      );
      bindSelect("settings-language", (value) =>
        saveSettings({ language: value })
      );
      bindSelect("settings-date-format", (value) =>
        saveSettings({ dateFormat: value })
      );
      bindSelect("settings-feed-layout", (value) =>
        saveSettings({ feedLayout: value })
      );
      bindSelect("settings-weight-unit", (value) =>
        saveSettings({ weightUnit: value })
      );
      bindSelect("settings-height-unit", (value) =>
        saveSettings({ heightUnit: value })
      );

      const expandBtn = $("btn-settings-expand");
      if (expandBtn && expandBtn.dataset.bound !== "true") {
        expandBtn.dataset.bound = "true";
        expandBtn.addEventListener("click", toggleSettingsSections);
      }

      const quickCards = document.querySelectorAll("[data-preset]");
      quickCards.forEach((card) => {
        if (card.dataset.bound === "true") return;
        card.dataset.bound = "true";
        card.addEventListener("click", () => {
          const preset = card.getAttribute("data-preset");
          if (!preset) return;
          applySettingsPreset(preset);
          showToast(
            t[currentLang]?.settingsPresetApplied || "Preset applied.",
            "success"
          );
        });
      });
    }
function applySettings() {
      const prev = applySettings.prev || {};
      const prevWeightUnit = prev.weightUnit || settings.weightUnit;
      const prevHeightUnit = prev.heightUnit || settings.heightUnit;
      const weightUnitChanged = prevWeightUnit !== settings.weightUnit;
      const heightUnitChanged = prevHeightUnit !== settings.heightUnit;
      const languageChanged =
        !applySettings.prev || settings.language !== currentLang;

      document.body.classList.toggle("compact-mode", settings.compactMode);

      const feedStats = $("feed-stat-grid");
      if (feedStats) {
        feedStats.classList.toggle("hidden", !settings.showFeedStats);
      }

      const emailEl = $("profile-email");
      if (emailEl) {
        emailEl.classList.toggle("hidden", !settings.showEmail);
      }
      const profileMeta = $("profile-meta");
      if (profileMeta) {
        profileMeta.classList.toggle("hidden", !settings.showProfileStats);
      }
      const publicMeta = $("public-profile-meta");
      if (publicMeta) {
        publicMeta.classList.toggle("hidden", !settings.showProfileStats);
      }

      showExtraSections = !!settings.showExtraSections;
      updateExtraSectionsVisibility();

      if (settings.defaultFilter) {
        setFeedState({ currentFilter: settings.defaultFilter });
        updateFilterButtons();
      }
      if (settings.feedLayout) {
        setFeedState({ feedLayout: settings.feedLayout });
      }

      const visibilitySelect = $("post-visibility");
      if (visibilitySelect && settings.defaultVisibility) {
        visibilitySelect.value = settings.defaultVisibility;
      }

      if (settings.language && settings.language !== currentLang) {
        currentLang = settings.language;
      }

      if (weightUnitChanged) {
        const weightInput = $("post-weight");
        if (weightInput && weightInput.value) {
          const converted = convertWeightValue(
            weightInput.value,
            prevWeightUnit,
            settings.weightUnit
          );
          if (converted !== null) {
            weightInput.value = formatNumber(converted, 1);
          }
        }
        workoutExercises.forEach((exercise) => {
          exercise.sets.forEach((setItem) => {
            if (
              setItem.weight !== null &&
              setItem.weight !== undefined &&
              setItem.weight !== ""
            ) {
              const converted = convertWeightValue(
                setItem.weight,
                prevWeightUnit,
                settings.weightUnit
              );
              if (converted !== null) {
                setItem.weight = formatNumber(converted, 1);
              }
            }
          });
        });
        if (typeof renderWorkoutRows === "function") {
          renderWorkoutRows();
        }
      }

      if (heightUnitChanged) {
        const heightInput = $("profile-height");
        if (heightInput && heightInput.value) {
          const converted = convertHeightValue(
            heightInput.value,
            prevHeightUnit,
            settings.heightUnit
          );
          if (converted !== null) {
            heightInput.value = formatNumber(converted, 1);
          }
        }
      }

      const langSelect = $("lang-select");
      if (langSelect) langSelect.value = currentLang;
      const settingsLang = $("settings-language");
      if (settingsLang) settingsLang.value = currentLang;

      if (languageChanged) {
        applyTranslations();
      } else if (typeof updateCollapsibleLabels === "function") {
        updateCollapsibleLabels();
      }

      updateWeightLabels();
      updateHeightLabel();
      updateSettingsExpandLabel();
      populateSettingsUI();
      updateSettingsSummary();
      updatePresetActive(detectPresetFromSettings());

      renderFeed();
      updateProfileSummary();
      renderWorkoutHistory();
      renderTrainingSummary();
      renderPrList();
      renderInsights();
      renderOnboardingChecklist();
      renderNotifications();
      if (currentPublicProfileId) {
        openPublicProfile(currentPublicProfileId);
      }

      applySettings.prev = { ...settings };
    }
function updateSettingsSummary() {
      const summary = $("settings-summary");
      if (!summary) return;
      const tr = t[currentLang] || t.ja;
      const formatMap = {
        auto: tr.settingsDateFormatAuto || "Auto",
        ymd: tr.settingsDateFormatYmd || "YYYY/MM/DD",
        mdy: tr.settingsDateFormatMdy || "MM/DD/YYYY",
      };
      const items = [
        {
          label: tr.settingsSummaryLanguage || "Language",
          value: settings.language === "ja" ? "日本語" : "English",
        },
        {
          label: tr.settingsSummaryDate || "Date",
          value: formatMap[settings.dateFormat] || formatMap.auto,
        },
        {
          label: tr.settingsSummaryWeight || "Weight",
          value: settings.weightUnit === "lb" ? "lb" : "kg",
        },
        {
          label: tr.settingsSummaryHeight || "Height",
          value: settings.heightUnit === "in" ? "in" : "cm",
        },
        {
          label: tr.settingsSummaryFilter || "Default feed",
          value:
            settings.defaultFilter === "mine"
              ? tr.mine || "Mine"
              : tr.all || "All",
        },
        {
          label: tr.settingsFeedLayoutTitle || "Feed layout",
          value:
            settings.feedLayout === "grid"
              ? tr.feedLayoutGrid || "Grid"
              : tr.feedLayoutList || "List",
        },
      ];
      summary.innerHTML = "";
      items.forEach((item) => {
        const pill = document.createElement("div");
        pill.className = "settings-summary-pill";
        const label = document.createElement("span");
        label.className = "settings-summary-label";
        label.textContent = item.label;
        const value = document.createElement("span");
        value.className = "settings-summary-value";
        value.textContent = item.value;
        pill.appendChild(label);
        pill.appendChild(value);
        summary.appendChild(pill);
      });
    }
function applySettingsPreset(preset) {
      if (preset === "minimal") {
        saveSettings({
          compactMode: true,
          showExtraSections: false,
          showFeedStats: false,
          showProfileStats: true,
          showBodyweight: false,
          notifications: { like: true, comment: true, follow: true },
        });
        updatePresetActive("minimal");
        return;
      }
      if (preset === "recommended") {
        saveSettings({
          compactMode: false,
          showExtraSections: false,
          showFeedStats: true,
          showProfileStats: true,
          showBodyweight: true,
          notifications: { like: true, comment: true, follow: true },
        });
        updatePresetActive("recommended");
        return;
      }
      if (preset === "balanced") {
        saveSettings({
          compactMode: false,
          showExtraSections: false,
          showFeedStats: true,
          showProfileStats: true,
          showBodyweight: false,
          notifications: { like: true, comment: true, follow: true },
        });
        updatePresetActive("balanced");
        return;
      }
      if (preset === "full") {
        saveSettings({
          compactMode: false,
          showExtraSections: true,
          showFeedStats: true,
          showProfileStats: true,
          showBodyweight: true,
          notifications: { like: true, comment: true, follow: true },
        });
        updatePresetActive("full");
      }
    }
function updatePresetActive(preset) {
      const cards = document.querySelectorAll("[data-preset]");
      cards.forEach((card) => {
        const value = card.getAttribute("data-preset");
        card.classList.toggle("is-active", value === preset);
      });
    }
function detectPresetFromSettings() {
      const matches = (target) =>
        settings.compactMode === target.compactMode &&
        settings.showExtraSections === target.showExtraSections &&
        settings.showFeedStats === target.showFeedStats &&
        settings.showBodyweight === target.showBodyweight;

      if (
        matches({
          compactMode: true,
          showExtraSections: false,
          showFeedStats: false,
          showBodyweight: false,
        })
      ) {
        return "minimal";
      }

      if (
        matches({
          compactMode: false,
          showExtraSections: true,
          showFeedStats: true,
          showBodyweight: true,
        })
      ) {
        return "full";
      }

      if (
        matches({
          compactMode: false,
          showExtraSections: false,
          showFeedStats: true,
          showBodyweight: true,
        })
      ) {
        return "recommended";
      }

      if (
        matches({
          compactMode: false,
          showExtraSections: false,
          showFeedStats: true,
          showBodyweight: false,
        })
      ) {
        return "balanced";
      }

      return "balanced";
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
    const { data: followers, error: err2 } = await supabase
      .from("follows")
      .select("id")
      .eq("following_id", currentUser.id);

    if (err2) {
      console.error("loadFollowStats followers error:", err2);
      currentFollowersCount = null;
    } else {
      currentFollowersCount = followers.length;
    }
  }

// ログイン中ユーザーの投稿数を読み込む
async function loadProfilePostCount() {
  if (!currentUser) {
    profilePostCount = null;
    return;
  }

  const { data, error } = await supabase
    .from("posts")
    .select("id")
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("loadProfilePostCount error:", error);
    profilePostCount = null;
    return;
  }

  profilePostCount = data.length;
}



    // ---- プロフィール用キャッシュ ----
    const profileCache = new Map();

    async function getProfile(userId) {
  if (!userId) return null;
  if (profileCache.has(userId)) {
    return profileCache.get(userId);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, handle, created_at, display_name, bio, avatar_url, banner_url, location, height_cm, experience_level, training_goal, gym, training_split, favorite_lifts, instagram, tiktok, youtube, website, accent_color"
    )
    .eq("id", userId)
    .maybeSingle(); // 1件 or null

  if (error) {
    console.error("getProfile error", error);
    return null;
  }

  if (data) {
    profileCache.set(userId, data);
  }
  return data;
}



    

    // ---- i18n ----
    





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

        const applyState = (next) => {
          isOpen = next;
          content.classList.toggle("is-open", isOpen);
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
        };

        btn.addEventListener("click", () => applyState(!isOpen));
        applyState(isOpen);
        if (key) {
          collapsibleControllers.set(key, applyState);
        }
      });
    }

    function updateCollapsibleLabels() {
      document.querySelectorAll("[data-collapsible]").forEach((wrapper) => {
        const content = wrapper.querySelector("[data-collapsible-content]");
        const btn = wrapper.querySelector("[data-collapsible-btn]");
        if (!content || !btn) return;
        updateCollapsibleButton(btn, content.classList.contains("is-open"));
      });
    }

    function setCollapsibleOpen(key, isOpen) {
      if (!key || !collapsibleControllers.has(key)) return;
      const applyState = collapsibleControllers.get(key);
      if (typeof applyState === "function") {
        applyState(isOpen);
      }
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

     async function init() {
      loadSettings();
      setupLanguageSwitcher();
      setupAuthUI();
      setupProfileEditor();
      setupPostForm();
      setupTemplates();
      setupMediaModal();
      setupNotifications();
      setupOnboardingActions();
      setupFeedControls();
      setupPageTabs();
      setupMiniHeader();
      setupPostDetailModal();
      setupCollapsibles();
      setupSettingsUI();
      setupExtraSectionsToggle();
      setupDebug();
      setupFollowButtons();
      setupProfileLinks();
      applySettings();
      await restoreSession();
      await loadFeed();
      handleHashRoute();
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



    function resetPublicProfilePagination() {
      publicPostsVisibleCount = publicPostsPageSize;
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
      if (!currentUser || !Array.isArray(allPosts)) return [];
      return allPosts.filter((post) => post.user_id === currentUser.id);
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
      setText("login-required", "pleaseLogin");

      // Feed
      setText("feed-title", "feed");
      setText("btn-feed-refresh", "feedRefresh");
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
      setText("settings-show-extra-title", "settingsShowExtraTitle");
      setText("settings-show-extra-desc", "settingsShowExtraDesc");
      setText("settings-show-feed-stats-title", "settingsShowFeedStatsTitle");
      setText("settings-show-feed-stats-desc", "settingsShowFeedStatsDesc");
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
      setText("btn-export-data", "settingsExportData");
      setText("btn-reset-settings", "settingsReset");

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
      if (typeof updateCollapsibleLabels === "function") {
        updateCollapsibleLabels();
      }
      if (typeof setupExtraSectionsToggle === "function") {
        setupExtraSectionsToggle();
      }
      if (typeof openPublicProfile === "function" && currentPublicProfileId) {
        openPublicProfile(currentPublicProfileId);
      }
    }

      // ------------------ Auth ------------------
    function setupAuthUI() {
      $("btn-auth").addEventListener("click", handleAuthSubmit);
      $("btn-logout").addEventListener("click", handleLogout);
    }

    function setupProfileEditor() {
      const fileInput = $("profile-avatar-file");
      if (fileInput) {
        fileInput.addEventListener("change", (e) => {
          pendingAvatarFile = e.target.files?.[0] || null;
        });
      }
      const bannerInput = $("profile-banner-file");
      if (bannerInput) {
        bannerInput.addEventListener("change", (e) => {
          pendingBannerFile = e.target.files?.[0] || null;
        });
      }
      const accentInput = $("profile-accent");
      if (accentInput) {
        accentInput.addEventListener("input", () => {
          const card = $("profile-section");
          if (card) {
            applyProfileTheme(card, { accent_color: accentInput.value });
          }
        });
      }
      const bannerUrlInput = $("profile-banner-url");
      if (bannerUrlInput) {
        bannerUrlInput.addEventListener("input", () => {
          const banner = $("profile-banner");
          applyProfileBanner(banner, { banner_url: bannerUrlInput.value });
        });
      }

      const saveBtn = $("btn-save-profile");
      if (saveBtn) {
        saveBtn.addEventListener("click", handleSaveProfile);
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
      if (status) status.textContent = "";

      if (!currentUser) {
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
    }

    async function handleSaveProfile() {
      if (!currentUser) {
        showToast("ログインしてください。", "warning");
        return;
      }

      const tr = t[currentLang] || t.ja;
      const status = $("profile-edit-status");
      const saveBtn = $("btn-save-profile");
      if (status) status.textContent = "";
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

        if (pendingAvatarFile) {
          const ext = pendingAvatarFile.name.split(".").pop();
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
          const ext = pendingBannerFile.name.split(".").pop();
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
      }
    }

    async function handleAuthSubmit() {
      const email = $("auth-email").value.trim();
      const password = $("auth-password").value.trim();
      const authBtn = $("btn-auth");

      if (!email || !password) {
        showToast("Email と Password を入力してください。", "warning");
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
          console.error("Auth error:", error);
          showToast("ログイン / サインアップに失敗しました。", "error");
          return;
        }

        if (data && data.user) {
          user = data.user;
        }

        if (!user) {
          showToast("ログインに失敗しました。", "error");
          return;
        }

        // ログイン成功
        currentUser = user;

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

        showToast("ログインしました！", "success");
      } finally {
        setButtonLoading(authBtn, false);
      }
    }



    async function handleLogout() {
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
    }

    async function restoreSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("restoreSession error:", error);
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

  // ユーザーのプロフィールと投稿数を読み込み
  await ensureProfileForUser(currentUser);
  await loadProfilePostCount();
  await loadFollowStats();
  await loadExercisePRs();
  await loadTemplates();
  await loadNotifications();

  updateProfileSummary();
  updateAuthUIState();
  populateProfileEditor();
}



    function setupPageTabs() {
      const tabs = document.querySelectorAll("[data-page-target]");
      const views = document.querySelectorAll(".page-view");
      if (!tabs.length || !views.length) return;

      const setPage = (page) => {
        views.forEach((view) => {
          view.classList.toggle("is-active", view.dataset.page === page);
        });
        tabs.forEach((tab) => {
          const target = tab.getAttribute("data-page-target");
          tab.classList.toggle("is-active", target === page);
        });
      };
      setActivePage = setPage;

      const initialPage =
        document.querySelector(".page-view.is-active")?.dataset.page ||
        tabs[0].getAttribute("data-page-target") ||
        "feed";
      setPage(initialPage);

      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const targetPage = tab.getAttribute("data-page-target");
          if (!targetPage) return;
          setPage(targetPage);
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
    }

    function setupMiniHeader() {
      const miniHeader = $("mini-header");
      const miniPost = $("mini-btn-post");
      const miniTop = $("mini-btn-top");
      const progressBar = $("mini-progress-bar");
      if (!miniHeader) return;

      const onScroll = () => {
        const isVisible = window.scrollY > 120;
        miniHeader.classList.toggle("is-visible", isVisible);
        if (progressBar) {
          const doc = document.documentElement;
          const total = doc.scrollHeight - doc.clientHeight;
          const percent = total > 0 ? (window.scrollY / total) * 100 : 0;
          progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();

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
          window.scrollTo({ top: 0, behavior: "smooth" });
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
      const hasExercises = workoutExercises.some(
        (exercise) =>
          (exercise.name && exercise.name.trim().length > 0) ||
          (exercise.note && exercise.note.trim().length > 0) ||
          (exercise.sets || []).some(
            (setItem) => String(setItem.reps || "").trim() || String(setItem.weight || "").trim()
          )
      );
      return Boolean(caption || weight || hasExercises || currentMediaFile);
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
      const mediaInput = $("post-media");
      const removeMediaBtn = $("btn-remove-media");
      if (mediaInput) {
        mediaInput.addEventListener("change", (e) => {
          const file = e.target.files?.[0];
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

      $("btn-submit").addEventListener("click", handleSubmitPost);
      $("btn-reset").addEventListener("click", () => {
        resetPostForm();
        clearPostDraft();
        const tr = t[currentLang] || t.ja;
        setDraftStatus(tr.draftCleared || "下書きを削除しました");
      });
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

    async function loadWorkoutLogs(postIds) {
      workoutLogsByPost = new Map();
      if (!workoutLogsEnabled) return;
      if (!postIds.length) return;

      const { data, error } = await supabase
        .from("workout_sets")
        .select(
          "post_id, exercise, set_index, reps, weight, rest_seconds, exercise_note, pr_type"
        )
        .in("post_id", postIds);

      if (error) {
        console.error("loadWorkoutLogs error:", error);
        workoutLogsEnabled = false;
        renderWorkoutRows();
        return;
      }

      (data || []).forEach((log) => {
        const existing = workoutLogsByPost.get(log.post_id) || [];
        let exercise = existing.find((ex) => ex.exercise === log.exercise);
        if (!exercise) {
          exercise = {
            exercise: log.exercise,
            rest_seconds: log.rest_seconds,
            note: log.exercise_note || "",
            sets: [],
          };
          existing.push(exercise);
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
        workoutLogsByPost.set(log.post_id, existing);
      });

      workoutLogsByPost.forEach((exercises, postId) => {
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
        const enriched = await Promise.all(
          (data || []).map(async (item) => {
            const actor = await getProfile(item.actor_id);
            return { ...item, actor };
          })
        );
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

      const userPosts = getUserPosts().sort((a, b) => {
        const aDate = new Date(a.date || a.created_at || 0).getTime();
        const bDate = new Date(b.date || b.created_at || 0).getTime();
        return bDate - aDate;
      });

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
      const hasWorkout = Array.from(workoutLogsByPost.keys()).some((postId) =>
        userPosts.find((post) => post.id === postId)
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
          const ext = currentMediaFile.name.split(".").pop();
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
      if (!postId || !commentsEnabled) return [];
      if (commentsByPost.has(postId)) {
        return commentsByPost.get(postId);
      }

      commentsLoading.add(postId);
      renderFeed();

      const { data, error } = await supabase
        .from("comments")
        .select("id, post_id, user_id, body, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      commentsLoading.delete(postId);

      if (error) {
        console.error("loadComments error:", error);
        commentsEnabled = false;
        return [];
      }

      const withProfiles = await Promise.all(
        (data || []).map(async (comment) => {
          const profile = await getProfile(comment.user_id);
          return { ...comment, profile };
        })
      );
      commentsByPost.set(postId, withProfiles);
      return withProfiles;
    }

    function toggleComments(postId) {
      if (commentsExpanded.has(postId)) {
        commentsExpanded.delete(postId);
        renderFeed();
        return;
      }
      commentsExpanded.add(postId);
      if (!commentsByPost.has(postId)) {
        loadCommentsForPost(postId).then(() => renderFeed());
      } else {
        renderFeed();
      }
    }

    async function submitComment(post, inputEl) {
      const postId = post?.id;
      if (!currentUser) {
        showToast("ログインしてください。", "warning");
        return;
      }
      if (!commentsEnabled) return;
      const body = inputEl.value.trim();
      if (!body) return;

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
        console.error("comment insert error:", error);
        commentsEnabled = false;
        showToast("コメントの投稿に失敗しました。", "error");
        return;
      }

      const profile = currentProfile || (await getProfile(currentUser.id));
      const next = commentsByPost.get(postId) || [];
      next.push({ ...data, profile });
      commentsByPost.set(postId, next);
      inputEl.value = "";
      await createNotification({
        userId: post.user_id,
        actorId: currentUser.id,
        type: "comment",
        postId: postId,
      });
      renderFeed();
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

    // ------------------ Debug ------------------
    function setupDebug() {
      const statusEl = $("settings-data-status");
      const setStatus = (message) => {
        if (!statusEl) return;
        statusEl.textContent = message;
        setTimeout(() => {
          statusEl.textContent = "";
        }, 2500);
      };

      const clearBtn = $("btn-clear-cache");
      if (clearBtn && clearBtn.dataset.bound !== "true") {
        clearBtn.dataset.bound = "true";
        clearBtn.addEventListener("click", () => {
          localStorage.removeItem("trends_likes");
          setStatus(t[currentLang].cacheCleared || "Cache cleared.");
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
          settings = {
            ...defaultSettings,
            notifications: { ...defaultSettings.notifications },
          };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          localStorage.removeItem("trends_show_extra_sections");
          showExtraSections = settings.showExtraSections;
          applySettings();
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
