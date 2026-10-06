import { expect, test } from '@playwright/test';

test('menu, new colony with a scenario, unlocks and resume after reload', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  const startTime = await page.evaluate(() => window.__game!.world.state.clock.totalMinutes);

  // The menu opens with the button and pauses the game.
  await page.locator('#h-menu').click();
  await expect(page.locator('.menu')).toBeVisible();
  await page.waitForTimeout(600);
  const paused1 = await page.evaluate(() => window.__game!.world.state.clock.totalMinutes);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__game!.world.state.clock.totalMinutes)).toBe(paused1);
  expect(paused1).toBeGreaterThanOrEqual(startTime);

  // Locked content shows how to earn it and cannot be picked.
  const locked = page.locator('[data-pick="scenario:hardWinter"]');
  await expect(locked).toContainText('Locked');
  await locked.click({ force: true });
  await expect(locked).not.toHaveClass(/sel/);

  // Escape closes it, and the game runs again.
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__game!.world.state.clock.totalMinutes)).toBeGreaterThan(paused1);

  // Earn an unlock; it appears in the menu and is remembered.
  await page.evaluate(() => {
    const g = window.__game!;
    g.world.state.stats.daysSurvived = 13;
  });
  await expect.poll(() => page.evaluate(() => window.__game!.profile.isUnlocked('strain:carniolan')), { timeout: 20_000 }).toBe(true);

  // Start a new Dry Summer colony with Carniolan bees.
  await page.locator('#h-menu').click();
  const carn = page.locator('[data-pick="strain:carniolan"]');
  await expect(carn).not.toHaveClass(/locked/);
  await carn.click();
  const dry = page.locator('[data-pick="scenario:drySummer"]');
  await expect(dry).not.toHaveClass(/locked/);
  await dry.click();
  await page.locator('[data-menu="new"]').click();
  await expect(page.locator('.menu')).toBeHidden();
  const w = await page.evaluate(() => {
    const s = window.__game!.world.state;
    return { scenario: s.unlocks.scenario, strain: s.unlocks.strain, season: s.clock.season, days: s.stats.daysSurvived, nectar: s.mods.nectarScale };
  });
  expect(w).toEqual({ scenario: 'drySummer', strain: 'carniolan', season: 'summer', days: 0, nectar: 0.55 });
  await page.waitForTimeout(1500); // the new meadow renders without errors

  // Reloading resumes the same colony instead of starting over.
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  expect(await page.evaluate(() => window.__game!.resumed)).toBe(true);
  expect(await page.evaluate(() => window.__game!.world.state.unlocks.scenario)).toBe('drySummer');

  expect(problems).toEqual([]);
});

test('a collapsed colony opens the menu and is not resumed', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  await page.evaluate(() => {
    const g = window.__game!;
    g.saveNow();
    g.world.state.colony.adults.workers = 10; // below the survival threshold
  });
  await expect(page.locator('.menu .banner')).toContainText('collapsed', { timeout: 20_000 });
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  expect(await page.evaluate(() => window.__game!.resumed)).toBe(false);
});
