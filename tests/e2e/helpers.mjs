import { expect } from "@playwright/test";

const NAVIGATION_SELECTORS = {
  account: "#nav-account:visible, #mini-nav-account:visible",
  feed: "#nav-feed:visible, #mini-nav-feed:visible",
  messages: "#nav-messages:visible, #mini-nav-messages:visible",
  notifications: "#nav-notifications:visible, #mini-nav-notifications:visible",
};

export async function openPage(page, target) {
  const selector = NAVIGATION_SELECTORS[target];
  if (!selector) throw new Error(`Unknown navigation target: ${target}`);
  await page.locator(selector).first().click();
  await expect(page.locator(`.page-view[data-page="${target}"].is-active`)).toBeVisible();
}

export async function login(page, account) {
  await page.goto("/?e2e=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("header")).toBeVisible();
  await openPage(page, "account");
  await page.locator("#btn-auth-open-form").click();
  await page.locator("#auth-email").fill(account.email);
  await page.locator("#auth-password").fill(account.password);
  await page.locator("#btn-auth").click();
  await expect(page.locator("#auth-signed-in")).toBeVisible({ timeout: 30_000 });
}

export async function runAsAuthenticatedSupabase(page, operation, payload) {
  return page.evaluate(
    async ({ operationName, operationPayload }) => {
      const { supabase } = await import("/supabaseClient.js");
      if (operationName === "delete-post") {
        const { error } = await supabase
          .from("posts")
          .delete()
          .eq("id", operationPayload.id);
        return error ? { ok: false, message: error.message } : { ok: true };
      }
      if (operationName === "delete-dm") {
        const { error } = await supabase
          .from("direct_messages")
          .delete()
          .eq("body", operationPayload.body);
        return error ? { ok: false, message: error.message } : { ok: true };
      }
      return { ok: false, message: `Unknown operation: ${operationName}` };
    },
    { operationName: operation, operationPayload: payload }
  );
}
