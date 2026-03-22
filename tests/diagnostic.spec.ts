import { test, expect } from "@playwright/test";

test("diagnose live site — find working routes", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Try the root
  await page.goto("https://cascade.behmn.com/", { timeout: 30000 });
  await page.waitForTimeout(5000);
  const rootHtml = await page.locator("#root").innerHTML().catch(() => "NO #root");
  console.log(`\n=== / ===`);
  console.log(`#root length: ${rootHtml.length}`);
  console.log(`#root snippet: ${rootHtml.substring(0, 200)}`);
  consoleMessages.forEach((m) => console.log(m));
  consoleMessages.length = 0;

  // Try /admin
  await page.goto("https://cascade.behmn.com/admin", { timeout: 30000 });
  await page.waitForTimeout(5000);
  const adminHtml = await page.locator("#root").innerHTML().catch(() => "NO #root");
  console.log(`\n=== /admin ===`);
  console.log(`#root length: ${adminHtml.length}`);
  console.log(`#root snippet: ${adminHtml.substring(0, 300)}`);
  consoleMessages.forEach((m) => console.log(m));
  consoleMessages.length = 0;

  // Try /admin/dashboard
  await page.goto("https://cascade.behmn.com/admin/dashboard", { timeout: 30000 });
  await page.waitForTimeout(5000);
  const dashHtml = await page.locator("#root").innerHTML().catch(() => "NO #root");
  console.log(`\n=== /admin/dashboard ===`);
  console.log(`#root length: ${dashHtml.length}`);
  console.log(`#root snippet: ${dashHtml.substring(0, 300)}`);
  consoleMessages.forEach((m) => console.log(m));

  // Take final screenshot
  await page.screenshot({ path: "test-results/route-diagnostic.png", fullPage: true });

  expect(true).toBeTruthy();
});
