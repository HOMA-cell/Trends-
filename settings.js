export const SETTINGS_KEY = "trends_settings_v1";

export const defaultSettings = {
  compactMode: false,
  liteEffects: false,
  showExtraSections: false,
  showFeedStats: true,
  feedAutoLoadMore: true,
  defaultFilter: "foryou",
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

const SETTINGS_COLLAPSIBLE_KEYS = [
  "settings-preferences",
  "settings-privacy",
  "settings-notifications",
  "settings-language",
  "settings-data",
  "settings-templates",
  "settings-tips",
];

const EXTRA_SECTION_KEYS = [
  "profile-details",
  "profile-edit-identity",
  "profile-edit-training",
  "profile-edit-media",
  "profile-edit-links",
  "summary-details",
];

const PRESET_NOTIFICATIONS = {
  like: true,
  comment: true,
  follow: true,
};
const SIMPLE_SETTINGS_MODE = true;

const PRESET_TARGETS = {
  minimal: {
    compactMode: true,
    liteEffects: true,
    showExtraSections: false,
    showFeedStats: false,
    feedAutoLoadMore: false,
    showProfileStats: true,
    showBodyweight: false,
  },
  recommended: {
    compactMode: false,
    liteEffects: false,
    showExtraSections: false,
    showFeedStats: true,
    feedAutoLoadMore: true,
    showProfileStats: true,
    showBodyweight: true,
  },
  balanced: {
    compactMode: false,
    liteEffects: false,
    showExtraSections: false,
    showFeedStats: true,
    feedAutoLoadMore: true,
    showProfileStats: true,
    showBodyweight: false,
  },
  full: {
    compactMode: false,
    liteEffects: false,
    showExtraSections: true,
    showFeedStats: true,
    feedAutoLoadMore: true,
    showProfileStats: true,
    showBodyweight: true,
  },
};

function shouldEnableLiteEffectsByDefault() {
  if (typeof window === "undefined") return false;
  const width = window.innerWidth || 1024;
  if (width > 700) return false;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const connection =
    nav?.connection || nav?.mozConnection || nav?.webkitConnection || null;
  const saveData = !!connection?.saveData;
  const lowMemory =
    Number.isFinite(nav?.deviceMemory) && Number(nav.deviceMemory) <= 4;
  const lowCpu =
    Number.isFinite(nav?.hardwareConcurrency) &&
    Number(nav.hardwareConcurrency) <= 4;
  return saveData || lowMemory || lowCpu;
}

function mergeSettings(current, next) {
  return {
    ...current,
    ...next,
    notifications: {
      ...(current.notifications || {}),
      ...((next && next.notifications) || {}),
    },
  };
}

function normalizeSettings(settings) {
  const merged = mergeSettings(defaultSettings, settings || {});
  if (typeof merged.liteEffects !== "boolean") {
    merged.liteEffects = false;
  }
  if (!["foryou", "all", "following", "mine", "saved"].includes(merged.defaultFilter)) {
    merged.defaultFilter = "foryou";
  }
  if (!["list", "grid"].includes(merged.feedLayout)) {
    merged.feedLayout = "list";
  }
  if (typeof merged.feedAutoLoadMore !== "boolean") {
    merged.feedAutoLoadMore = true;
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
  return merged;
}

function asFn(value, fallback = () => {}) {
  return typeof value === "function" ? value : fallback;
}

export function createSettingsController(options) {
  const getSettings = asFn(options.getSettings, () => ({ ...defaultSettings }));
  const setSettings = asFn(options.setSettings);
  const getCurrentLang = asFn(options.getCurrentLang, () => "ja");
  const setCurrentLang = asFn(options.setCurrentLang);
  const getShowExtraSections = asFn(options.getShowExtraSections, () => false);
  const setShowExtraSections = asFn(options.setShowExtraSections);
  const setCollapsibleOpen = asFn(options.setCollapsibleOpen);
  const setFeedState = asFn(options.setFeedState);
  const updateFilterButtons = asFn(options.updateFilterButtons);
  const convertWeightValue = asFn(options.convertWeightValue, () => null);
  const convertHeightValue = asFn(options.convertHeightValue, () => null);
  const formatNumber = asFn(options.formatNumber, (value) => String(value));
  const getWorkoutExercises = asFn(options.getWorkoutExercises, () => []);
  const renderWorkoutRows = asFn(options.renderWorkoutRows);
  const applyTranslations = asFn(options.applyTranslations);
  const updateCollapsibleLabels = asFn(options.updateCollapsibleLabels);
  const renderFeed = asFn(options.renderFeed);
  const updateProfileSummary = asFn(options.updateProfileSummary);
  const renderWorkoutHistory = asFn(options.renderWorkoutHistory);
  const renderTrainingSummary = asFn(options.renderTrainingSummary);
  const renderPrList = asFn(options.renderPrList);
  const renderInsights = asFn(options.renderInsights);
  const renderOnboardingChecklist = asFn(options.renderOnboardingChecklist);
  const renderNotifications = asFn(options.renderNotifications);
  const getCurrentPublicProfileId = asFn(options.getCurrentPublicProfileId);
  const openPublicProfile = asFn(options.openPublicProfile);
  const showToast = asFn(options.showToast);

  const $ = asFn(options.$, () => null);
  const translations = options.translations || {};

  let applyPrev = null;
  let settingsAdvancedVisible = false;

  function tr() {
    return translations[getCurrentLang()] || translations.ja || {};
  }

  function saveSettings(next, saveOptions = {}) {
    const merged = normalizeSettings(mergeSettings(getSettings(), next || {}));
    setSettings(merged);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    localStorage.removeItem("trends_show_extra_sections");
    setShowExtraSections(!!merged.showExtraSections);
    if (!saveOptions.skipApply) {
      applySettings();
    }
    return merged;
  }

  function loadSettings() {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      stored = {};
    }

    const legacyExtra = localStorage.getItem("trends_show_extra_sections");
    const merged = normalizeSettings(stored);
    const hasLiteEffectsPreference =
      stored && typeof stored === "object"
        ? Object.prototype.hasOwnProperty.call(stored, "liteEffects")
        : false;
    if (!hasLiteEffectsPreference && shouldEnableLiteEffectsByDefault()) {
      merged.liteEffects = true;
    }
    if (legacyExtra !== null && stored.showExtraSections === undefined) {
      merged.showExtraSections = legacyExtra === "true";
    }

    setSettings(merged);
    setShowExtraSections(!!merged.showExtraSections);
    if (merged.language) {
      setCurrentLang(merged.language);
    }
    return merged;
  }

  function updateWeightLabels() {
    const current = getSettings();
    const unit = current.weightUnit === "lb" ? "lb" : "kg";
    const label = $("label-weight");
    if (label) {
      label.textContent = `${tr().weight || "Bodyweight"} (${unit})`;
    }
    const input = $("post-weight");
    if (input) {
      input.placeholder = current.weightUnit === "lb" ? "170" : "77.4";
    }
  }

  function updateHeightLabel() {
    const current = getSettings();
    const unit = current.heightUnit === "in" ? "in" : "cm";
    const label = $("profile-height-label");
    if (label) {
      label.textContent = `${tr().profileHeight || "Height"} (${unit})`;
    }
    const input = $("profile-height");
    if (input) {
      input.placeholder = current.heightUnit === "in" ? "66" : "170";
    }
  }

  function updateSettingsExpandLabel() {
    const btn = $("btn-settings-expand");
    if (!btn) return;
    if (SIMPLE_SETTINGS_MODE) {
      const showAdvanced =
        tr().settingsShowAdvanced || "Show advanced settings";
      const hideAdvanced =
        tr().settingsHideAdvanced || "Hide advanced settings";
      btn.textContent = settingsAdvancedVisible ? hideAdvanced : showAdvanced;
      btn.setAttribute(
        "aria-expanded",
        settingsAdvancedVisible ? "true" : "false"
      );
      return;
    }
    const allOpen = SETTINGS_COLLAPSIBLE_KEYS.every((key) => {
      const wrapper = document.querySelector(`[data-collapsible="${key}"]`);
      const content = wrapper?.querySelector("[data-collapsible-content]");
      return content?.classList.contains("is-open");
    });
    btn.textContent = allOpen
      ? tr().settingsCollapse || "Collapse"
      : tr().settingsExpand || "Expand all";
    btn.setAttribute("aria-expanded", allOpen ? "true" : "false");
  }

  function populateSettingsUI() {
    const current = getSettings();
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

    setChecked("settings-compact", current.compactMode);
    setChecked("settings-lite-effects", current.liteEffects);
    setChecked("settings-show-extra", current.showExtraSections);
    setChecked("settings-show-feed-stats", current.showFeedStats);
    setChecked("settings-feed-auto-load", current.feedAutoLoadMore);
    setChecked("settings-show-email", current.showEmail);
    setChecked("settings-show-profile-stats", current.showProfileStats);
    setChecked("settings-show-bodyweight", current.showBodyweight);
    setChecked("settings-notify-like", current.notifications?.like);
    setChecked("settings-notify-comment", current.notifications?.comment);
    setChecked("settings-notify-follow", current.notifications?.follow);

    setValue("settings-default-filter", current.defaultFilter);
    setValue("settings-feed-layout", current.feedLayout || "list");
    setValue("settings-default-visibility", current.defaultVisibility);
    setValue("settings-language", current.language);
    setValue("settings-date-format", current.dateFormat);
    setValue("settings-weight-unit", current.weightUnit);
    setValue("settings-height-unit", current.heightUnit);

    updateSettingsExpandLabel();
  }

  function updateExtraSectionsVisibility() {
    const shown = !!getShowExtraSections();
    const btn = $("btn-toggle-sections");
    const label = shown
      ? tr().hideExtraSections || "Hide sections"
      : tr().showMoreSections || "Show more sections";

    if (btn) {
      btn.textContent = label;
    }

    document.querySelectorAll(".extra-section").forEach((el) => {
      el.classList.toggle("hidden", !shown);
    });

    EXTRA_SECTION_KEYS.forEach((key) => setCollapsibleOpen(key, shown));
  }

  function setElHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", !!hidden);
  }

  function setSettingsItemHidden(controlId, hidden) {
    const control = $(controlId);
    const item = control?.closest(".settings-item");
    setElHidden(item, hidden);
  }

  function setSettingsHeroHidden(controlId, hidden) {
    const control = $(controlId);
    const item = control?.closest(".settings-hero-item");
    setElHidden(item, hidden);
  }

  function setSettingsCardHidden(collapsibleKey, hidden) {
    const card = document.querySelector(`[data-collapsible="${collapsibleKey}"]`);
    setElHidden(card, hidden);
  }

  function syncSettingsGroupVisibility() {
    document.querySelectorAll(".settings-group").forEach((group) => {
      const cards = Array.from(group.querySelectorAll(".card[data-collapsible]"));
      const hasVisibleCard = cards.some(
        (card) => !card.classList.contains("hidden")
      );
      setElHidden(group, !hasVisibleCard);
    });
  }

  function applySimpleSettingsLayout() {
    if (!SIMPLE_SETTINGS_MODE) return;
    const advanced = !!settingsAdvancedVisible;
    const settingsSub = $("settings-sub");
    if (settingsSub) {
      settingsSub.textContent =
        advanced
          ? tr().settingsSubAdvanced ||
            "Advanced controls are visible."
          : tr().settingsSubSimple ||
            "Only essential controls are shown.";
    }

    setElHidden($("settings-summary"), true);
    setElHidden($("settings-presets"), true);
    setElHidden($("settings-quick"), true);

    setSettingsHeroHidden("settings-compact", !advanced);
    setSettingsHeroHidden("settings-show-feed-stats", !advanced);
    setSettingsHeroHidden("settings-show-extra", !advanced);
    setSettingsHeroHidden("settings-lite-effects", false);

    setSettingsCardHidden("settings-preferences", false);
    setSettingsCardHidden("settings-notifications", false);
    setSettingsCardHidden("settings-language", false);
    setSettingsCardHidden("settings-privacy", !advanced);
    setSettingsCardHidden("settings-data", !advanced);
    setSettingsCardHidden("settings-templates", !advanced);
    setSettingsCardHidden("settings-tips", !advanced);

    setSettingsItemHidden("settings-default-filter", !advanced);
    setSettingsItemHidden("settings-feed-layout", !advanced);
    setSettingsItemHidden("settings-feed-auto-load", !advanced);
    setSettingsItemHidden("settings-default-visibility", false);
    setSettingsItemHidden("settings-language", false);
    setSettingsItemHidden("settings-date-format", !advanced);
    setSettingsItemHidden("settings-weight-unit", !advanced);
    setSettingsItemHidden("settings-height-unit", !advanced);
    setSettingsItemHidden("settings-show-email", !advanced);
    setSettingsItemHidden("settings-show-profile-stats", !advanced);
    setSettingsItemHidden("settings-show-bodyweight", !advanced);

    if (!advanced) {
      setCollapsibleOpen("settings-preferences", true);
      setCollapsibleOpen("settings-notifications", true);
      setCollapsibleOpen("settings-language", true);
      setCollapsibleOpen("settings-privacy", false);
      setCollapsibleOpen("settings-data", false);
      setCollapsibleOpen("settings-templates", false);
      setCollapsibleOpen("settings-tips", false);
    }
    syncSettingsGroupVisibility();
  }

  function toggleSettingsSections() {
    if (SIMPLE_SETTINGS_MODE) {
      settingsAdvancedVisible = !settingsAdvancedVisible;
      applySimpleSettingsLayout();
      updateSettingsExpandLabel();
      return;
    }
    const shouldOpen = SETTINGS_COLLAPSIBLE_KEYS.some((key) => {
      const wrapper = document.querySelector(`[data-collapsible="${key}"]`);
      const content = wrapper?.querySelector("[data-collapsible-content]");
      return !content?.classList.contains("is-open");
    });
    SETTINGS_COLLAPSIBLE_KEYS.forEach((key) => setCollapsibleOpen(key, shouldOpen));
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

    bindToggle("settings-compact", (value) => saveSettings({ compactMode: value }));
    bindToggle("settings-lite-effects", (value) =>
      saveSettings({ liteEffects: value })
    );
    bindToggle("settings-show-extra", (value) =>
      saveSettings({ showExtraSections: value })
    );
    bindToggle("settings-show-feed-stats", (value) =>
      saveSettings({ showFeedStats: value })
    );
    bindToggle("settings-feed-auto-load", (value) =>
      saveSettings({ feedAutoLoadMore: value })
    );
    bindSelect("settings-default-filter", (value) =>
      saveSettings({ defaultFilter: value })
    );
    bindSelect("settings-default-visibility", (value) =>
      saveSettings({ defaultVisibility: value })
    );
    bindToggle("settings-show-email", (value) => saveSettings({ showEmail: value }));
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
    bindSelect("settings-language", (value) => saveSettings({ language: value }));
    bindSelect("settings-date-format", (value) => saveSettings({ dateFormat: value }));
    bindSelect("settings-feed-layout", (value) => saveSettings({ feedLayout: value }));
    bindSelect("settings-weight-unit", (value) => saveSettings({ weightUnit: value }));
    bindSelect("settings-height-unit", (value) => saveSettings({ heightUnit: value }));

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
          tr().settingsPresetApplied || "Preset applied.",
          "success"
        );
      });
    });
  }

  function applySettings() {
    const current = getSettings();
    const prev = applyPrev || {};
    const isFirstApply = !applyPrev;
    const prevWeightUnit = prev.weightUnit || current.weightUnit;
    const prevHeightUnit = prev.heightUnit || current.heightUnit;
    const weightUnitChanged = prevWeightUnit !== current.weightUnit;
    const heightUnitChanged = prevHeightUnit !== current.heightUnit;
    const languageChanged = isFirstApply || current.language !== getCurrentLang();
    const dateFormatChanged = isFirstApply || prev.dateFormat !== current.dateFormat;
    const compactModeChanged = isFirstApply || prev.compactMode !== current.compactMode;
    const liteEffectsChanged =
      isFirstApply || prev.liteEffects !== current.liteEffects;
    const showFeedStatsChanged =
      isFirstApply || prev.showFeedStats !== current.showFeedStats;
    const defaultFilterChanged =
      isFirstApply || prev.defaultFilter !== current.defaultFilter;
    const feedLayoutChanged = isFirstApply || prev.feedLayout !== current.feedLayout;
    const feedAutoLoadChanged =
      isFirstApply || prev.feedAutoLoadMore !== current.feedAutoLoadMore;
    const showBodyweightChanged =
      isFirstApply || prev.showBodyweight !== current.showBodyweight;
    const showEmailChanged = isFirstApply || prev.showEmail !== current.showEmail;
    const showProfileStatsChanged =
      isFirstApply || prev.showProfileStats !== current.showProfileStats;
    const showExtraSectionsChanged =
      isFirstApply || prev.showExtraSections !== current.showExtraSections;
    const notificationsChanged =
      isFirstApply ||
      !!prev.notifications?.like !== !!current.notifications?.like ||
      !!prev.notifications?.comment !== !!current.notifications?.comment ||
      !!prev.notifications?.follow !== !!current.notifications?.follow;

    document.body.classList.toggle("compact-mode", current.compactMode);
    document.body.classList.toggle("lite-effects", !!current.liteEffects);
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.toggle(
        "lite-effects",
        !!current.liteEffects
      );
    }

    const feedStats = $("feed-stat-grid");
    if (feedStats) {
      if (!current.showFeedStats) {
        feedStats.classList.add("hidden");
      }
    }

    const emailEl = $("profile-email");
    if (emailEl) {
      emailEl.classList.toggle("hidden", !current.showEmail);
    }

    const profileMeta = $("profile-meta");
    if (profileMeta) {
      profileMeta.classList.toggle("hidden", !current.showProfileStats);
    }

    const publicMeta = $("public-profile-meta");
    if (publicMeta) {
      publicMeta.classList.toggle("hidden", !current.showProfileStats);
    }

    if (showExtraSectionsChanged || languageChanged) {
      setShowExtraSections(!!current.showExtraSections);
      updateExtraSectionsVisibility();
    }

    if (current.defaultFilter && defaultFilterChanged) {
      setFeedState({ currentFilter: current.defaultFilter });
      updateFilterButtons();
    }

    if (current.feedLayout && feedLayoutChanged) {
      setFeedState({ feedLayout: current.feedLayout });
    }

    const visibilitySelect = $("post-visibility");
    if (visibilitySelect && current.defaultVisibility) {
      visibilitySelect.value = current.defaultVisibility;
    }

    if (current.language && current.language !== getCurrentLang()) {
      setCurrentLang(current.language);
    }

    if (weightUnitChanged) {
      const weightInput = $("post-weight");
      if (weightInput && weightInput.value) {
        const converted = convertWeightValue(
          weightInput.value,
          prevWeightUnit,
          current.weightUnit
        );
        if (converted !== null) {
          weightInput.value = formatNumber(converted, 1);
        }
      }

      getWorkoutExercises().forEach((exercise) => {
        exercise.sets.forEach((setItem) => {
          if (
            setItem.weight !== null &&
            setItem.weight !== undefined &&
            setItem.weight !== ""
          ) {
            const converted = convertWeightValue(
              setItem.weight,
              prevWeightUnit,
              current.weightUnit
            );
            if (converted !== null) {
              setItem.weight = formatNumber(converted, 1);
            }
          }
        });
      });
      renderWorkoutRows();
    }

    if (heightUnitChanged) {
      const heightInput = $("profile-height");
      if (heightInput && heightInput.value) {
        const converted = convertHeightValue(
          heightInput.value,
          prevHeightUnit,
          current.heightUnit
        );
        if (converted !== null) {
          heightInput.value = formatNumber(converted, 1);
        }
      }
    }

    const langSelect = $("lang-select");
    if (langSelect) langSelect.value = getCurrentLang();
    const settingsLang = $("settings-language");
    if (settingsLang) settingsLang.value = getCurrentLang();

    if (languageChanged) {
      applyTranslations();
    } else {
      updateCollapsibleLabels();
    }

    updateWeightLabels();
    updateHeightLabel();
    applySimpleSettingsLayout();
    updateSettingsExpandLabel();
    populateSettingsUI();
    updateSettingsSummary();
    updatePresetActive(detectPresetFromSettings());

    const shouldRenderFeed =
      compactModeChanged ||
      liteEffectsChanged ||
      showFeedStatsChanged ||
      defaultFilterChanged ||
      feedLayoutChanged ||
      feedAutoLoadChanged ||
      showBodyweightChanged ||
      languageChanged ||
      dateFormatChanged ||
      weightUnitChanged;
    if (shouldRenderFeed) {
      renderFeed();
    }

    const shouldRenderProfileSummary =
      compactModeChanged ||
      showProfileStatsChanged ||
      showEmailChanged ||
      showBodyweightChanged ||
      languageChanged ||
      dateFormatChanged ||
      weightUnitChanged ||
      heightUnitChanged;
    if (shouldRenderProfileSummary) {
      updateProfileSummary();
    }

    const shouldRenderTrainingPanels =
      compactModeChanged ||
      showExtraSectionsChanged ||
      languageChanged ||
      dateFormatChanged ||
      weightUnitChanged;
    if (shouldRenderTrainingPanels) {
      renderWorkoutHistory();
      renderTrainingSummary();
      renderPrList();
      renderInsights();
      renderOnboardingChecklist();
    }

    if (notificationsChanged || languageChanged) {
      renderNotifications();
    }

    const currentPublicProfileId = getCurrentPublicProfileId();
    const shouldRefreshPublicProfile =
      isFirstApply ||
      languageChanged ||
      dateFormatChanged ||
      weightUnitChanged ||
      heightUnitChanged ||
      showProfileStatsChanged;
    if (currentPublicProfileId && shouldRefreshPublicProfile) {
      openPublicProfile(currentPublicProfileId);
    }

    applyPrev = { ...current };
    return current;
  }

  function updateSettingsSummary() {
    const summary = $("settings-summary");
    if (!summary) return;

    const current = getSettings();
    const currentTr = tr();
    const formatMap = {
      auto: currentTr.settingsDateFormatAuto || "Auto",
      ymd: currentTr.settingsDateFormatYmd || "YYYY/MM/DD",
      mdy: currentTr.settingsDateFormatMdy || "MM/DD/YYYY",
    };

    const items = [
      {
        label: currentTr.settingsSummaryLanguage || "Language",
        value: current.language === "ja" ? "日本語" : "English",
      },
      {
        label: currentTr.settingsSummaryDate || "Date",
        value: formatMap[current.dateFormat] || formatMap.auto,
      },
      {
        label: currentTr.settingsSummaryWeight || "Weight",
        value: current.weightUnit === "lb" ? "lb" : "kg",
      },
      {
        label: currentTr.settingsSummaryHeight || "Height",
        value: current.heightUnit === "in" ? "in" : "cm",
      },
      {
        label: currentTr.settingsSummaryFilter || "Default feed",
        value: (() => {
          if (current.defaultFilter === "foryou") {
            return currentTr.foryou || "For You";
          }
          if (current.defaultFilter === "following") {
            return currentTr.following || "Following";
          }
          if (current.defaultFilter === "mine") {
            return currentTr.mine || "Mine";
          }
          if (current.defaultFilter === "saved") {
            return currentTr.saved || "Saved";
          }
          return currentTr.all || "All";
        })(),
      },
      {
        label: currentTr.settingsSummaryRender || "Rendering",
        value: current.liteEffects
          ? currentTr.settingsLiteEffectsEnabled || "Lite"
          : currentTr.settingsLiteEffectsDisabled || "Standard",
      },
      {
        label: currentTr.settingsFeedLayoutTitle || "Feed layout",
        value:
          current.feedLayout === "grid"
            ? currentTr.feedLayoutGrid || "Grid"
            : currentTr.feedLayoutList || "List",
      },
      {
        label: currentTr.settingsFeedAutoLoadTitle || "Feed auto-load",
        value: current.feedAutoLoadMore !== false ? "ON" : "OFF",
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
    if (!PRESET_TARGETS[preset]) return;
    saveSettings({
      ...PRESET_TARGETS[preset],
      notifications: { ...PRESET_NOTIFICATIONS },
    });
    updatePresetActive(preset);
  }

  function updatePresetActive(preset) {
    const cards = document.querySelectorAll("[data-preset]");
    cards.forEach((card) => {
      const value = card.getAttribute("data-preset");
      card.classList.toggle("is-active", value === preset);
    });
  }

  function detectPresetFromSettings() {
    const current = getSettings();
    const matches = (target) =>
      current.compactMode === target.compactMode &&
      current.liteEffects === target.liteEffects &&
      current.showExtraSections === target.showExtraSections &&
      current.showFeedStats === target.showFeedStats &&
      current.feedAutoLoadMore === target.feedAutoLoadMore &&
      current.showBodyweight === target.showBodyweight;

    if (matches(PRESET_TARGETS.minimal)) return "minimal";
    if (matches(PRESET_TARGETS.full)) return "full";
    if (matches(PRESET_TARGETS.recommended)) return "recommended";
    if (matches(PRESET_TARGETS.balanced)) return "balanced";
    return "balanced";
  }

  function resetToDefaults() {
    return saveSettings({
      ...defaultSettings,
      notifications: { ...defaultSettings.notifications },
    });
  }

  function clearApplyCache() {
    applyPrev = null;
  }

  return {
    loadSettings,
    saveSettings,
    updateWeightLabels,
    updateHeightLabel,
    updateSettingsExpandLabel,
    populateSettingsUI,
    updateExtraSectionsVisibility,
    toggleSettingsSections,
    setupSettingsUI,
    applySettings,
    updateSettingsSummary,
    applySettingsPreset,
    updatePresetActive,
    detectPresetFromSettings,
    resetToDefaults,
    clearApplyCache,
    getSettings,
  };
}
