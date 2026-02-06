let utilsContext = {
  getCurrentLang: () => "ja",
  getSettings: () => ({ dateFormat: "auto", weightUnit: "kg", heightUnit: "cm" }),
  getWorkoutLogsByPost: () => new Map(),
  KG_TO_LB: 2.2046226218,
  CM_TO_IN: 0.3937007874,
};

export function setUtilsContext(next = {}) {
  utilsContext = { ...utilsContext, ...next };
}

function getSettings() {
  return utilsContext.getSettings ? utilsContext.getSettings() : {};
}

function getCurrentLang() {
  return utilsContext.getCurrentLang ? utilsContext.getCurrentLang() : "ja";
}

function getWorkoutLogsByPost() {
  return utilsContext.getWorkoutLogsByPost ? utilsContext.getWorkoutLogsByPost() : new Map();
}

function getKgToLb() {
  return utilsContext.KG_TO_LB ?? 2.2046226218;
}

function getCmToIn() {
  return utilsContext.CM_TO_IN ?? 0.3937007874;
}

export function $(id) {
  return document.getElementById(id);
}

export function setButtonLoading(btn, isLoading, loadingText = "Loading...") {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.label = btn.textContent;
    btn.textContent = loadingText;
    btn.classList.add("is-loading");
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }
}

export function showToast(message, type = "info", duration = 3000) {
  if (!message) return;
  const container = $("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast${type ? ` toast-${type}` : ""}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

export function renderAvatar(avatarEl, profile, fallbackText) {
  if (!avatarEl) return;
  avatarEl.innerHTML = "";
  const url = profile?.avatar_url;
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = profile?.handle || "avatar";
    img.onerror = () => {
      avatarEl.classList.remove("has-image");
      avatarEl.textContent = fallbackText || "?";
    };
    avatarEl.classList.add("has-image");
    avatarEl.appendChild(img);
  } else {
    avatarEl.classList.remove("has-image");
    avatarEl.textContent = fallbackText || "?";
  }
}

export function normalizeUrl(value) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
}

export function normalizeHandleUrl(base, value) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  const cleaned = value.replace("@", "").trim();
  if (!cleaned) return "";
  const separator = base.endsWith("@") || base.endsWith("/") ? "" : "/";
  return `${base}${separator}${cleaned}`;
}

export function formatHandle(value) {
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
}

export function normalizeExerciseName(name) {
  return (name || "").trim().toLowerCase();
}

export function toDateKey(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateDisplay(value) {
  const date = parseDateValue(value);
  if (!date) return "-";
  const settings = getSettings();
  const currentLang = getCurrentLang();
  const locale = currentLang === "ja" ? "ja-JP" : "en-US";
  const format = settings.dateFormat || "auto";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (format === "ymd") {
    return `${year}/${month}/${day}`;
  }
  if (format === "mdy") {
    return `${month}/${day}/${year}`;
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTimeDisplay(value) {
  const date = parseDateValue(value);
  if (!date) return "-";
  const currentLang = getCurrentLang();
  const locale = currentLang === "ja" ? "ja-JP" : "en-US";
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${formatDateDisplay(date)} ${time}`;
}

export function formatNumber(value, decimals = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(num);
}

export function convertWeightValue(value, fromUnit = "kg", toUnit = "kg") {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (fromUnit === toUnit) return num;
  const KG_TO_LB = getKgToLb();
  if (fromUnit === "lb" && toUnit === "kg") return num / KG_TO_LB;
  if (fromUnit === "kg" && toUnit === "lb") return num * KG_TO_LB;
  return num;
}

export function convertHeightValue(value, fromUnit = "cm", toUnit = "cm") {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (fromUnit === toUnit) return num;
  const CM_TO_IN = getCmToIn();
  if (fromUnit === "in" && toUnit === "cm") return num / CM_TO_IN;
  if (fromUnit === "cm" && toUnit === "in") return num * CM_TO_IN;
  return num;
}

export function toKg(value, unit) {
  const settings = getSettings();
  return convertWeightValue(value, unit || settings.weightUnit, "kg");
}

export function fromKg(value, unit) {
  const settings = getSettings();
  return convertWeightValue(value, "kg", unit || settings.weightUnit);
}

export function formatWeight(value, unitOverride) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  const settings = getSettings();
  const currentLang = getCurrentLang();
  const unit = unitOverride || settings.weightUnit || "kg";
  const KG_TO_LB = getKgToLb();
  const converted = unit === "lb" ? num * KG_TO_LB : num;
  const locale = currentLang === "ja" ? "ja-JP" : "en-US";
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(converted);
  return `${formatted} ${unit}`;
}

export function formatHeight(value, unitOverride) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  const settings = getSettings();
  const currentLang = getCurrentLang();
  const unit = unitOverride || settings.heightUnit || "cm";
  const CM_TO_IN = getCmToIn();
  const converted = unit === "in" ? num * CM_TO_IN : num;
  const locale = currentLang === "ja" ? "ja-JP" : "en-US";
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === "in" ? 1 : 0,
  }).format(converted);
  return `${formatted} ${unit}`;
}

export function formatVolume(value, unitOverride) {
  const settings = getSettings();
  const safe = Number.isFinite(value) ? value : 0;
  const converted = settings.weightUnit === "lb" ? safe * getKgToLb() : safe;
  const rounded = Math.round(converted);
  const unit = unitOverride || (settings.weightUnit === "lb" ? "lb" : "kg");
  return `${rounded.toLocaleString()} ${unit}`;
}

export function computeStreak(dateSet) {
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const key = toDateKey(cursor);
    if (!key || !dateSet.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function computeWorkoutStats(posts) {
  const stats = {
    workouts: 0,
    sets: 0,
    reps: 0,
    volume: 0,
    lastDate: null,
    bestSet: null,
  };
  const workoutLogsByPost = getWorkoutLogsByPost();
  (posts || []).forEach((post) => {
    const logs = workoutLogsByPost.get(post.id) || [];
    if (!logs.length) return;
    stats.workouts += 1;
    logs.forEach((exercise) => {
      (exercise.sets || []).forEach((set) => {
        const reps = Number(set.reps) || 0;
        const weight = Number(set.weight) || 0;
        stats.sets += 1;
        stats.reps += reps;
        stats.volume += reps * weight;
        if (!stats.bestSet || (weight || 0) > (stats.bestSet.weight || 0)) {
          stats.bestSet = {
            exercise: exercise.exercise || "",
            weight,
            reps,
          };
        }
      });
    });
    const postDate = post.date || post.created_at;
    if (postDate) {
      const postTime = new Date(postDate).getTime();
      if (!stats.lastDate || postTime > stats.lastDate) {
        stats.lastDate = postTime;
      }
    }
  });
  return stats;
}
