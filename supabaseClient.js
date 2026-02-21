import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm";

const DEFAULT_SUPABASE_URL = "https://sfuroqxcljlkbthblqva.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmdXJvcXhjbGpsa2J0aGJscXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxOTE0MTQsImV4cCI6MjA4MDc2NzQxNH0.v1qrjQgkPg3hPjIVCsKg3unwM0lvPGXkw8DvVm8YlRI";

export const SUPABASE_CONFIG_STORAGE_URL_KEY = "trends_supabase_url";
export const SUPABASE_CONFIG_STORAGE_ANON_KEY = "trends_supabase_anon_key";

function hasLocalStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function normalizeSupabaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function readStoredSupabaseConfig() {
  if (!hasLocalStorage()) return null;
  try {
    const url = normalizeSupabaseUrl(
      localStorage.getItem(SUPABASE_CONFIG_STORAGE_URL_KEY) || ""
    );
    const anonKey = String(
      localStorage.getItem(SUPABASE_CONFIG_STORAGE_ANON_KEY) || ""
    ).trim();
    if (!url || !anonKey) return null;
    return { url, anonKey };
  } catch {
    return null;
  }
}

export function getStoredSupabaseConfig() {
  return readStoredSupabaseConfig();
}

export function saveStoredSupabaseConfig({ url = "", anonKey = "" } = {}) {
  if (!hasLocalStorage()) {
    return { url: "", anonKey: "" };
  }
  const normalizedUrl = normalizeSupabaseUrl(url);
  const normalizedAnonKey = String(anonKey || "").trim();
  if (!normalizedUrl || !normalizedAnonKey) {
    throw new Error("Supabase config is incomplete.");
  }
  localStorage.setItem(SUPABASE_CONFIG_STORAGE_URL_KEY, normalizedUrl);
  localStorage.setItem(SUPABASE_CONFIG_STORAGE_ANON_KEY, normalizedAnonKey);
  return { url: normalizedUrl, anonKey: normalizedAnonKey };
}

export function clearStoredSupabaseConfig() {
  if (!hasLocalStorage()) return;
  localStorage.removeItem(SUPABASE_CONFIG_STORAGE_URL_KEY);
  localStorage.removeItem(SUPABASE_CONFIG_STORAGE_ANON_KEY);
}

const storedConfig = readStoredSupabaseConfig();

export const SUPABASE_URL = storedConfig?.url || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = storedConfig?.anonKey || DEFAULT_SUPABASE_ANON_KEY;
export const SUPABASE_CONFIG_SOURCE = storedConfig ? "local" : "default";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
