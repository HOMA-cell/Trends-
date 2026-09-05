import { expect, test } from "@playwright/test";
import { openPage } from "./helpers.mjs";

test("public shell and primary navigation render without JavaScript errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/?e2e=1", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/Trends/);
  await expect(page.locator("#app-title")).toHaveText("Trends");

  await openPage(page, "messages");
  await expect(page.locator("#dm-login-required")).toBeVisible();

  await openPage(page, "notifications");
  await openPage(page, "account");
  await expect(page.locator("#btn-auth-open-form")).toBeVisible();

  await openPage(page, "feed");
  await expect(page.locator("#feed-list")).toBeVisible();
  expect(pageErrors, `Unexpected page errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

for (const route of ["privacy.html", "terms.html", "contact.html"]) {
  test(`${route} is published`, async ({ page }) => {
    const response = await page.goto(`/${route}`, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).not.toBeEmpty();
  });
}
