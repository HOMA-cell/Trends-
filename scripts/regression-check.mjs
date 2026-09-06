import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const feedSource = await readFile(new URL("../feed.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const mediaEditorSource = await readFile(
  new URL("../mediaEditor.js", import.meta.url),
  "utf8"
);
const mediaProcessingSource = await readFile(
  new URL("../mediaProcessing.js", import.meta.url),
  "utf8"
);
const mediaUploadSource = await readFile(
  new URL("../mediaUpload.js", import.meta.url),
  "utf8"
);
const serviceWorkerSource = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const contactSource = await readFile(new URL("../contact.html", import.meta.url), "utf8");
const betaMigrationSource = await readFile(
  new URL(
    "../supabase/migrations/20260901114459_beta_readiness_controls.sql",
    import.meta.url
  ),
  "utf8"
);
const failures = [];

if (/\bt\s*\(/.test(feedSource)) {
  failures.push("feed.js must index the i18n dictionary (t[lang]); t is not a function");
}

if (/invalidCredentials|無効な認証情報なら、そのメールでサインアップ/.test(appSource)) {
  failures.push("login failure must never fall through to automatic sign-up");
}

if (
  !/signingUp\s*\?\s*await supabase\.auth\.signUp/.test(appSource) ||
  !/await supabase\.auth\.signInWithPassword/.test(appSource)
) {
  failures.push("login and invite sign-up must remain explicit, separate actions");
}

if (
  !appSource.includes("const AUTH_PASSWORD_MIN_LENGTH = 12") ||
  !appSource.includes("isAcceptableNewPassword") ||
  !indexSource.includes('id="auth-password-requirements"') ||
  !indexSource.includes('id="recovery-password-requirements"')
) {
  failures.push("new and recovered passwords must retain the free-tier strength guard");
}

const prodCheckSource = await readFile(
  new URL("../scripts/prod-check.mjs", import.meta.url),
  "utf8"
);
if (
  !prodCheckSource.includes("/auth/v1/settings") ||
  !prodCheckSource.includes("mailer_autoconfirm") ||
  !prodCheckSource.includes("disable_signup")
) {
  failures.push("production checks must monitor Auth sign-up and email confirmation settings");
}

if (!indexSource.includes('id="feedback-modal-backdrop"')) {
  failures.push("the beta feedback entry and modal must remain available");
}

if (!feedSource.includes('targetType: "comment"')) {
  failures.push("comments must retain a report action");
}

if (
  !feedSource.includes("reaction-btn reaction-save") ||
  !feedSource.includes("appendPrimaryAction(saveBtn)") ||
  feedSource.includes("appendSecondaryAction(saveBtn)")
) {
  failures.push("save must remain a primary feed action beside like and comment");
}

if (
  !indexSource.includes('id="post-media-editor-backdrop"') ||
  !indexSource.includes('data-editor-aspect="portrait"') ||
  !indexSource.includes('id="post-video-cover-time"')
) {
  failures.push("the post composer must retain photo editing and video cover controls");
}

if (
  !appSource.includes("createPostMediaEditor") ||
  !appSource.includes("currentVideoThumbnailBlob ||") ||
  !mediaEditorSource.includes("canvasToBlob") ||
  !mediaEditorSource.includes("captureVideoFrame") ||
  !serviceWorkerSource.includes('"./mediaEditor.js"')
) {
  failures.push("edited photos and selected video covers must reach the upload flow");
}

if (
  !appSource.includes("uploadStorageObject") ||
  !appSource.includes("normalizePostImage") ||
  !appSource.includes("currentMediaUploadPath") ||
  !mediaUploadSource.includes("findPreviousUploads") ||
  !mediaUploadSource.includes("fingerprint:") ||
  !mediaUploadSource.includes("storage.supabase.co/storage/v1/upload/resumable") ||
  !mediaProcessingSource.includes("isHeicImageFile") ||
  !mediaProcessingSource.includes("hasValidPostMediaSignature") ||
  !indexSource.includes('id="post-upload-progress"') ||
  !serviceWorkerSource.includes('"./mediaProcessing.js"') ||
  !serviceWorkerSource.includes('"./mediaUpload.js"')
) {
  failures.push("post media uploads must remain resumable and HEIC-compatible");
}

if (/trends-app\.example/i.test(contactSource)) {
  failures.push("published support pages must not contain the placeholder contact domain");
}

if (
  !betaMigrationSource.includes("private.hook_restrict_beta_signups") ||
  !betaMigrationSource.includes("private.content_moderation") ||
  !betaMigrationSource.includes("public.beta_feedback")
) {
  failures.push("the beta readiness migration is missing required operational controls");
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`OK Regression checks - ${root}`);
}
