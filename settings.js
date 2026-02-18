export const SETTINGS_KEY = "trends_settings_v1";

export const defaultSettings = {
  compactMode: false,
  showExtraSections: false,
  showFeedStats: true,
  feedAutoLoadMore: true,
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

const PRESET_TARGETS = {
  minimal: {
    compactMode: true,
    showExtraSections: false,
    showFeedStats: false,
    feedAutoLoadMore: false,
    showProfileStats: true,
    showBodyweight: false,
  },
  recommended: {
    compactMode: false,
    showExtraSections: false,
    showFeedStats: true,
    feedAutoLoadMore: true,
    showProfileStats: true,
    showBodyweight: true,
  },
  balanced: {
    compactMode: false,
    showExtraSections: false,
    showFeedStats: true,
    feedAutoLoadMore: true,
    showProfileStats: true,
    showBodyweight: false,
  },
  full: {
    compactMode: false,
    showExtraSections: true,
    showFeedStats: true,
    feedAutoLoadMore: true,
    showProfileStats: true,
    showBodyweight: true,
  },
};

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
  if (!["all", "mine"].includes(merged.defaultFilter)) {
    merged.defaultFilter = "all";
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

  function toggleSettingsSections() {
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
    const prevWeightUnit = prev.weightUnit || current.weightUnit;
    const prevHeightUnit = prev.heightUnit || current.heightUnit;
    const weightUnitChanged = prevWeightUnit !== current.weightUnit;
    const heightUnitChanged = prevHeightUnit !== current.heightUnit;
    const languageChanged = !applyPrev || current.language !== getCurrentLang();

    document.body.classList.toggle("compact-mode", current.compactMode);

    const feedStats = $("feed-stat-grid");
    if (feedStats) {
      feedStats.classList.toggle("hidden", !current.showFeedStats);
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

    setShowExtraSections(!!current.showExtraSections);
    updateExtraSectionsVisibility();

    if (current.defaultFilter) {
      setFeedState({ currentFilter: current.defaultFilter });
      updateFilterButtons();
    }

    if (current.feedLayout) {
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

    const currentPublicProfileId = getCurrentPublicProfileId();
    if (currentPublicProfileId) {
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
        value:
          current.defaultFilter === "mine"
            ? currentTr.mine || "Mine"
            : currentTr.all || "All",
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
