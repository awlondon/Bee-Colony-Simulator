import { expect, test } from '@playwright/test';

test('tutorial advances with the player and facts appear once', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });

  const card = page.locator('#h-tutorial');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Welcome, beekeeper');
  await expect(card).toContainText('1/10');

  // A fact about the colony appears on its own, with the "Did you know?" label.
  await expect(page.locator('.toast.fact').first()).toContainText('Did you know?', { timeout: 10_000 });

  // Orbiting with the mouse completes step one.
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(700, 420, { steps: 6 });
  await page.mouse.up();
  await expect(card).toContainText('Meet your colony', { timeout: 10_000 });
  await expect(card).toContainText('2/10');

  // Progress is remembered across a reload.
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  await expect(page.locator('#h-tutorial')).toContainText('2/10');
  // The colony fact was already seen, so it is not repeated.
  await page.waitForTimeout(2500);
  await expect(page.locator('.toast.fact', { hasText: 'superorganism' })).toHaveCount(0);

  // Skipping hides the card for good; the help button brings it back.
  await page.locator('[data-tut="skip"]').click();
  await expect(page.locator('#h-tutorial')).toBeHidden();
  await page.locator('#h-help').click();
  await expect(page.locator('#h-tutorial')).toContainText('1/10');

  expect(problems).toEqual([]);
});
