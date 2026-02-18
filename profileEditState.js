export function createProfileEditState(options = {}) {
  const {
    $,
    translations = {},
    getCurrentLang = () => "ja",
    getCurrentUser = () => null,
    trackedFieldIds = [],
    draftKeyBase = "trends_profile_edit_draft_v1",
    getPendingAvatarFile = () => null,
    getPendingBannerFile = () => null,
  } = options;

  let baseline = "";
  let dirty = false;
  let draftSaveTimer = null;
  let unloadGuardBound = false;
  let shortcutBound = false;

  function getDraftKey(userId = getCurrentUser?.()?.id) {
    if (!userId) return "";
    return `${draftKeyBase}:${userId}`;
  }

  function buildSnapshot() {
    const snapshot = {};
    trackedFieldIds.forEach((id) => {
      const el = typeof $ === "function" ? $(id) : null;
      snapshot[id] = el ? `${el.value ?? ""}` : "";
    });
    const avatarFile = getPendingAvatarFile?.();
    const bannerFile = getPendingBannerFile?.();
    snapshot.pendingAvatarFile = avatarFile
      ? `${avatarFile.name}:${avatarFile.size}`
      : "";
    snapshot.pendingBannerFile = bannerFile
      ? `${bannerFile.name}:${bannerFile.size}`
      : "";
    return snapshot;
  }

  function buildDraftPayload() {
    const fields = {};
    trackedFieldIds.forEach((id) => {
      const el = typeof $ === "function" ? $(id) : null;
      fields[id] = el ? `${el.value ?? ""}` : "";
    });
    return {
      version: 1,
      userId: getCurrentUser?.()?.id || "",
      fields,
      savedAt: Date.now(),
    };
  }

  function loadDraft(userId = getCurrentUser?.()?.id) {
    const key = getDraftKey(userId);
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.userId !== userId || typeof parsed.fields !== "object") {
        return null;
      }
      return parsed;
    } catch (error) {
      console.warn("profile draft load failed", error);
      return null;
    }
  }

  function clearDraft(userId = getCurrentUser?.()?.id) {
    const key = getDraftKey(userId);
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn("profile draft clear failed", error);
    }
  }

  function cancelDraftSave() {
    if (!draftSaveTimer) return;
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }

  function saveDraftNow() {
    cancelDraftSave();
    const user = getCurrentUser?.();
    if (!user?.id) return;
    const currentSnapshot = JSON.stringify(buildSnapshot());
    if (!baseline || currentSnapshot === baseline) {
      clearDraft(user.id);
      return;
    }
    const key = getDraftKey(user.id);
    if (!key) return;
    const payload = buildDraftPayload();
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      console.warn("profile draft save failed", error);
    }
  }

  function scheduleDraftSave(delayMs = 280) {
    const user = getCurrentUser?.();
    if (!user?.id) return;
    cancelDraftSave();
    draftSaveTimer = setTimeout(() => {
      saveDraftNow();
    }, delayMs);
  }

  function refreshDirtyState() {
    const user = getCurrentUser?.();
    if (!user?.id) {
      dirty = false;
      return dirty;
    }
    dirty = JSON.stringify(buildSnapshot()) !== baseline;
    return dirty;
  }

  function captureBaseline() {
    baseline = JSON.stringify(buildSnapshot());
    dirty = false;
    return baseline;
  }

  function isDirty() {
    return !!dirty;
  }

  function applyDraftIfAvailable(userId = getCurrentUser?.()?.id) {
    if (!userId) return false;
    const draft = loadDraft(userId);
    if (!draft?.fields) return false;
    let restored = false;
    trackedFieldIds.forEach((id) => {
      const el = typeof $ === "function" ? $(id) : null;
      if (!el) return;
      const next = `${draft.fields[id] ?? ""}`;
      if (`${el.value ?? ""}` === next) return;
      el.value = next;
      restored = true;
    });
    if (!restored) {
      clearDraft(userId);
      return false;
    }
    refreshDirtyState();
    return true;
  }

  function confirmDiscardChanges(message = "") {
    if (!dirty) return true;
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return window.confirm(message);
    }
    return false;
  }

  function setupUnloadGuard() {
    if (unloadGuardBound || typeof window === "undefined") return;
    unloadGuardBound = true;
    window.addEventListener("beforeunload", (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function setupSaveShortcut(options = {}) {
    if (shortcutBound || typeof window === "undefined") return;
    shortcutBound = true;
    const isEnabled =
      typeof options.isEnabled === "function" ? options.isEnabled : () => true;
    const onSave = typeof options.onSave === "function" ? options.onSave : () => {};
    window.addEventListener("keydown", (event) => {
      const isSaveKey =
        (event.metaKey || event.ctrlKey) &&
        (event.key === "s" || event.key === "S");
      if (!isSaveKey) return;
      if (!isEnabled()) return;
      event.preventDefault();
      onSave();
    });
  }

  function getDraftRestoredMessage() {
    const lang = getCurrentLang?.() || "ja";
    const tr = translations[lang] || translations.ja || {};
    return tr.profileDraftRestored || "プロフィール下書きを復元しました。";
  }

  function resetState() {
    cancelDraftSave();
    baseline = "";
    dirty = false;
  }

  return {
    buildSnapshot,
    loadDraft,
    clearDraft,
    saveDraftNow,
    scheduleDraftSave,
    cancelDraftSave,
    refreshDirtyState,
    captureBaseline,
    isDirty,
    applyDraftIfAvailable,
    confirmDiscardChanges,
    setupUnloadGuard,
    setupSaveShortcut,
    getDraftRestoredMessage,
    resetState,
  };
}
