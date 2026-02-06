
    const SETTINGS_KEY = "trends_settings_v1";
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
export function loadSettings() {
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
export function saveSettings(next, options = {}) {
export function updateWeightLabels() {
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
export function updateHeightLabel() {
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
export function updateSettingsExpandLabel() {
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
export function populateSettingsUI() {
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
export function updateExtraSectionsVisibility() {
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
      ["profile-details", "profile-edit-advanced", "summary-details"].forEach(
        (key) => setCollapsibleOpen(key, showExtraSections)
      );
    }
export function toggleSettingsSections() {
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
export function setupSettingsUI() {
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
export function applySettings() {
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
        currentFilter = settings.defaultFilter;
        updateFilterButtons();
      }
      if (settings.feedLayout) {
        feedLayout = settings.feedLayout;
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
export function updateSettingsSummary() {
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
export function applySettingsPreset(preset) {
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
      if (preset === "balanced") {
        saveSettings({
          compactMode: false,
          showExtraSections: false,
          showFeedStats: true,
          showProfileStats: true,
          showBodyweight: true,
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
export function updatePresetActive(preset) {
      const cards = document.querySelectorAll("[data-preset]");
      cards.forEach((card) => {
        const value = card.getAttribute("data-preset");
        card.classList.toggle("is-active", value === preset);
      });
    }
export function detectPresetFromSettings() {
      const isMinimal =
        settings.compactMode &&
        !settings.showExtraSections &&
        !settings.showFeedStats &&
        !settings.showBodyweight;
      if (isMinimal) return "minimal";

      const isFull =
        !settings.compactMode &&
        settings.showExtraSections &&
        settings.showFeedStats &&
        settings.showBodyweight;
      if (isFull) return "full";

      return "balanced";
    }
