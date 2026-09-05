import { expect, test } from "@playwright/test";
import { login, openPage, runAsAuthenticatedSupabase } from "./helpers.mjs";

const env = (name) => `${process.env[name] || ""}`.trim();
const accountA = {
  email: env("E2E_USER_A_EMAIL"),
  password: env("E2E_USER_A_PASSWORD"),
  handle: env("E2E_USER_A_HANDLE").replace(/^@/, ""),
};
const accountB = {
  email: env("E2E_USER_B_EMAIL"),
  password: env("E2E_USER_B_PASSWORD"),
  handle: env("E2E_USER_B_HANDLE").replace(/^@/, ""),
};
const missingSecrets = [
  ["E2E_USER_A_EMAIL", accountA.email],
  ["E2E_USER_A_PASSWORD", accountA.password],
  ["E2E_USER_A_HANDLE", accountA.handle],
  ["E2E_USER_B_EMAIL", accountB.email],
  ["E2E_USER_B_PASSWORD", accountB.password],
  ["E2E_USER_B_HANDLE", accountB.handle],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

test.skip(
  missingSecrets.length > 0,
  `Authenticated E2E secrets are missing: ${missingSecrets.join(", ")}`
);

test("post, like, comment, follow, and DM work across two accounts", async ({ browser }) => {
  expect(accountA.email).not.toBe(accountB.email);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const postCaption = `Trends E2E post ${runId}`;
  const commentBody = `Trends E2E comment ${runId}`;
  const dmBody = `Trends E2E DM ${runId}`;
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  let postId = "";
  let followButton = null;
  let originalFollowState = "false";

  try {
    await login(pageA, accountA);
    await openPage(pageA, "feed");
    await pageA.locator("#btn-open-post").click();
    await expect(pageA.locator("#post-modal-backdrop")).toBeVisible();
    await pageA.locator("#post-caption").fill(postCaption);
    await pageA.locator("#btn-submit").click();
    await expect(pageA.locator("#post-modal-backdrop")).toBeHidden({ timeout: 30_000 });

    const postCardA = pageA.locator(".post-card[data-post-id]").filter({ hasText: postCaption }).first();
    await expect(postCardA).toBeVisible({ timeout: 30_000 });
    postId = (await postCardA.getAttribute("data-post-id")) || "";
    expect(postId).not.toBe("");

    await login(pageB, accountB);
    await openPage(pageB, "feed");
    const postCardB = pageB.locator(`.post-card[data-post-id="${postId}"]`);
    await expect(postCardB).toBeVisible({ timeout: 30_000 });

    const likeButton = postCardB.locator('button[data-post-action="toggle-like"]');
    const initialLikeState = (await likeButton.getAttribute("aria-pressed")) || "false";
    await likeButton.click();
    await expect(likeButton).not.toHaveAttribute("aria-pressed", initialLikeState);

    await postCardB.locator('button[data-post-action="toggle-comments"]').click();
    await expect(pageB.locator("#comment-sheet-backdrop")).toBeVisible();
    await pageB.locator("#comment-sheet-body .comment-form-input").fill(commentBody);
    await pageB.locator("#comment-sheet-body .comment-submit-btn").click();
    await expect(pageB.locator("#comment-sheet-body")).toContainText(commentBody, {
      timeout: 30_000,
    });
    await pageB.locator("#btn-comment-sheet-close").click();

    followButton = postCardB.locator("button.btn-follow");
    originalFollowState = (await followButton.getAttribute("aria-pressed")) || "false";
    await followButton.click();
    await expect(followButton).not.toHaveAttribute("aria-pressed", originalFollowState);
    await followButton.click();
    await expect(followButton).toHaveAttribute("aria-pressed", originalFollowState);

    await openPage(pageB, "messages");
    await pageB.locator("#btn-dm-compose").click();
    await expect(pageB.locator("#dm-compose-modal")).toBeVisible();
    await pageB.locator("#dm-compose-search").fill(accountA.handle);
    const partner = pageB
      .locator("button[data-dm-compose-id]")
      .filter({ hasText: accountA.handle })
      .first();
    await expect(partner).toBeVisible({ timeout: 20_000 });
    await partner.click();
    await expect(pageB.locator("#dm-input")).toBeEnabled();
    await pageB.locator("#dm-input").fill(dmBody);
    await pageB.locator("#btn-dm-send").click();
    await expect(pageB.locator("#dm-message-list")).toContainText(dmBody, {
      timeout: 30_000,
    });
  } finally {
    if (followButton && originalFollowState) {
      const currentFollowState = await followButton.getAttribute("aria-pressed").catch(() => null);
      if (currentFollowState && currentFollowState !== originalFollowState) {
        await followButton.click().catch(() => {});
      }
    }
    if (dmBody && !pageB.isClosed()) {
      const result = await runAsAuthenticatedSupabase(pageB, "delete-dm", {
        body: dmBody,
      }).catch((error) => ({ ok: false, message: error.message }));
      expect(result.ok, `DM cleanup failed: ${result.message || "unknown error"}`).toBeTruthy();
    }
    if (postId && !pageA.isClosed()) {
      const result = await runAsAuthenticatedSupabase(pageA, "delete-post", {
        id: postId,
      }).catch((error) => ({ ok: false, message: error.message }));
      expect(result.ok, `Post cleanup failed: ${result.message || "unknown error"}`).toBeTruthy();
    }
    await contextA.close();
    await contextB.close();
  }
});
