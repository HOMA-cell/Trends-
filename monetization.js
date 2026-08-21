import { supabase } from "./supabaseClient.js";

const DEFAULT_FLAGS = Object.freeze({
  pro_preview: {
    enabled: true,
    rolloutPercent: 100,
    config: { billing_enabled: false },
  },
  pro_membership: {
    enabled: false,
    rolloutPercent: 0,
    config: { billing_enabled: false },
  },
  sponsor_ads: {
    enabled: false,
    rolloutPercent: 0,
    config: {
      feed_start_at: 6,
      feed_interval: 12,
      feed_max_ads: 2,
      session_max_ads: 2,
      personalized: false,
    },
  },
  external_ads: {
    enabled: false,
    rolloutPercent: 0,
    config: { personalized: false },
  },
  gym_directory: { enabled: false, rolloutPercent: 0, config: {} },
  gym_reviews: { enabled: false, rolloutPercent: 0, config: {} },
  gym_claims: { enabled: false, rolloutPercent: 0, config: {} },
  coach_directory: { enabled: false, rolloutPercent: 0, config: {} },
  coach_inquiries: { enabled: false, rolloutPercent: 0, config: {} },
});

const state = {
  flags: new Map(Object.entries(DEFAULT_FLAGS)),
  campaigns: [],
  entitlements: new Set(),
  publicLoaded: false,
  entitlementsLoaded: false,
};

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeConfig(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeFlag(row = {}, fallback = {}) {
  return {
    enabled: row.enabled === true,
    rolloutPercent: clampInteger(
      row.rollout_percent ?? row.rolloutPercent,
      0,
      100,
      fallback.rolloutPercent || 0
    ),
    config: {
      ...normalizeConfig(fallback.config),
      ...normalizeConfig(row.config),
    },
  };
}

function normalizeCampaign(row = {}) {
  const destination = String(row.destination_url || "").trim();
  const isSafeDestination =
    destination.startsWith("#") || /^https:\/\//i.test(destination);
  if (!row.id || !row.slug || !isSafeDestination) return null;
  return {
    id: String(row.id),
    slug: String(row.slug),
    kind: row.campaign_kind === "house" ? "house" : "sponsored",
    sponsorName: String(row.sponsor_name || "").trim(),
    disclosureJa: String(row.disclosure_ja || "広告・PR").trim(),
    disclosureEn: String(row.disclosure_en || "Sponsored").trim(),
    headlineJa: String(row.headline_ja || "").trim(),
    headlineEn: String(row.headline_en || "").trim(),
    bodyJa: String(row.body_ja || "").trim(),
    bodyEn: String(row.body_en || "").trim(),
    ctaJa: String(row.cta_ja || "").trim(),
    ctaEn: String(row.cta_en || "").trim(),
    destination,
    imageUrl: /^https:\/\//i.test(String(row.image_url || "").trim())
      ? String(row.image_url).trim()
      : "",
    priority: Number(row.priority || 0),
  };
}

function isMissingMonetizationTable(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /app_feature_flags|sponsor_campaigns|user_entitlements/i.test(message) &&
      /not find|does not exist|schema cache/i.test(message)
  );
}

function dispatchStateChanged() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }
  window.dispatchEvent(new CustomEvent("trends-monetization-changed"));
}

function getRolloutBucket(key, userId) {
  const input = `${key}:${userId}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function getFeatureFlag(key) {
  return state.flags.get(String(key || "")) || {
    enabled: false,
    rolloutPercent: 0,
    config: {},
  };
}

export function isFeatureEnabled(key, userId = "") {
  const flag = getFeatureFlag(key);
  if (!flag.enabled || flag.rolloutPercent <= 0) return false;
  if (flag.rolloutPercent >= 100) return true;
  const identity = String(userId || "").trim();
  if (!identity) return false;
  return getRolloutBucket(key, identity) < flag.rolloutPercent;
}

export function getFeedSponsorSettings(userId = "") {
  const flag = getFeatureFlag("sponsor_ads");
  const config = normalizeConfig(flag.config);
  return {
    enabled: isFeatureEnabled("sponsor_ads", userId),
    feedStartAt: clampInteger(config.feed_start_at, 5, 40, 6),
    feedInterval: clampInteger(config.feed_interval, 8, 40, 12),
    feedMaxAds: clampInteger(config.feed_max_ads, 0, 2, 2),
    sessionMaxAds: clampInteger(config.session_max_ads, 0, 2, 2),
    personalized: false,
  };
}

export function getActiveSponsorCampaign(lang = "ja", userId = "") {
  if (!isFeatureEnabled("sponsor_ads", userId)) return null;
  const campaign = state.campaigns[0];
  if (!campaign) return null;
  const isJapanese = lang === "ja";
  return {
    ...campaign,
    disclosure: isJapanese ? campaign.disclosureJa : campaign.disclosureEn,
    headline: isJapanese ? campaign.headlineJa : campaign.headlineEn,
    body: isJapanese ? campaign.bodyJa : campaign.bodyEn,
    cta: isJapanese ? campaign.ctaJa : campaign.ctaEn,
  };
}

export function hasActiveEntitlement(key) {
  return state.entitlements.has(String(key || ""));
}

export function shouldSuppressAds() {
  return hasActiveEntitlement("ad_free") || hasActiveEntitlement("pro");
}

export async function loadPublicMonetizationState() {
  const [flagsResult, campaignsResult] = await Promise.all([
    supabase
      .from("app_feature_flags")
      .select("key, enabled, rollout_percent, config")
      .eq("is_public", true),
    supabase
      .from("sponsor_campaigns")
      .select(
        "id, slug, campaign_kind, sponsor_name, disclosure_ja, disclosure_en, headline_ja, headline_en, body_ja, body_en, cta_ja, cta_en, destination_url, image_url, priority"
      )
      .eq("placement", "feed")
      .order("priority", { ascending: false })
      .order("starts_at", { ascending: false })
      .limit(8),
  ]);

  if (!flagsResult.error) {
    const nextFlags = new Map(Object.entries(DEFAULT_FLAGS));
    (flagsResult.data || []).forEach((row) => {
      const key = String(row?.key || "");
      if (!key) return;
      nextFlags.set(key, normalizeFlag(row, nextFlags.get(key)));
    });
    state.flags = nextFlags;
  } else if (!isMissingMonetizationTable(flagsResult.error)) {
    console.warn("feature flags unavailable", flagsResult.error);
  }

  if (!campaignsResult.error) {
    state.campaigns = (campaignsResult.data || [])
      .map(normalizeCampaign)
      .filter(Boolean)
      .sort((a, b) => b.priority - a.priority);
  } else if (!isMissingMonetizationTable(campaignsResult.error)) {
    console.warn("sponsor campaigns unavailable", campaignsResult.error);
  }

  state.publicLoaded = true;
  dispatchStateChanged();
  return {
    flagsLoaded: !flagsResult.error,
    campaignsLoaded: !campaignsResult.error,
  };
}

export async function loadUserEntitlements(userId = "") {
  const normalizedUserId = String(userId || "").trim();
  state.entitlements = new Set();
  state.entitlementsLoaded = false;
  if (!normalizedUserId) {
    dispatchStateChanged();
    return [];
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("entitlement_key, status, starts_at, expires_at")
    .eq("user_id", normalizedUserId)
    .in("status", ["active", "trialing", "grace_period"])
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (error) {
    if (!isMissingMonetizationTable(error)) {
      console.warn("entitlements unavailable", error);
    }
    dispatchStateChanged();
    return [];
  }

  state.entitlements = new Set(
    (data || []).map((row) => String(row?.entitlement_key || "")).filter(Boolean)
  );
  state.entitlementsLoaded = true;
  dispatchStateChanged();
  return Array.from(state.entitlements);
}

export function getMonetizationDiagnostics() {
  return {
    publicLoaded: state.publicLoaded,
    entitlementsLoaded: state.entitlementsLoaded,
    enabledFeatures: Array.from(state.flags.entries())
      .filter(([, flag]) => flag.enabled && flag.rolloutPercent > 0)
      .map(([key]) => key),
    campaignCount: state.campaigns.length,
    entitlementCount: state.entitlements.size,
  };
}
