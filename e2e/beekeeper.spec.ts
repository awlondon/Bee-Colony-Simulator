import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';

/** Project a world position to canvas pixels using the live camera. */
async function screenOf(page: import('@playwright/test').Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([wx, wy, wz]) => {
      const g = window.__game!;
      const cam = g.renderer.rig.camera;
      cam.updateMatrixWorld();
      const v = cam.position.clone().set(wx, wy, wz).project(cam);
      const c = g.canvasEl;
      return { x: ((v.x + 1) / 2) * c.clientWidth, y: ((1 - v.y) / 2) * c.clientHeight };
    },
    [x, y, z],
  );
}

test('the beekeeper tends the hive, bees crowd round, and guards defend when it goes wrong', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60_000 });
  // Pause so the test, not the frame rate, decides how far the simulation goes.
  await page.evaluate(() => {
    const g = window.__game!;
    g.setSpeed(0);
    const s = g.world.state;
    s.flags.noThreats = true;
    s.beekeeper.nextChoreAt = s.clock.totalMinutes;
  });

  // Smoking: step the sim until the beekeeper starts puffing smoke at the entrance.
  const reached = await page.evaluate(() => {
    const g = window.__game!;
    const k = g.world.state.beekeeper;
    for (let i = 0; i < 30 * 120 && k.activity !== 'smoking'; i++) g.world.step();
    g.human.focusOn(k.pos.x - 1, k.pos.z, 8);
    return k.activity;
  });
  expect(reached).toBe('smoking');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/beekeeper-smoking.png` });
  await expect(page.locator('#c-keeper')).toHaveText('smoking the hive');

  // Working at the open hive: the lid is up and bees gather round.
  const crowd = await page.evaluate(() => {
    const g = window.__game!;
    const w = g.world;
    const k = w.state.beekeeper;
    for (let i = 0; i < 30 * 120 && !(k.activity === 'working' && k.chore === 'tendHive'); i++) w.step();
    w.advanceMinutes(6); // long enough for bees to gather, short of the 10 minute visit
    g.human.focusOn(k.pos.x - 0.5, k.pos.z, 6.5);
    return { lid: k.lidOpen, curious: w.state.bees.filter((b) => b.state === 'investigate').length, stings: w.state.stats.stingsTaken };
  });
  expect(crowd.lid).toBe(true);
  expect(crowd.curious).toBeGreaterThan(3);
  expect(crowd.stings).toBe(0); // careful and smoked: no stings
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/beekeeper-working.png` });
  await expect(page.locator('#c-keeper')).toHaveText('tending the hive');

  // Click the beekeeper to select them; the panel offers the policy switch.
  await page.evaluate(() => {
    const g = window.__game!;
    const k = g.world.state.beekeeper;
    g.human.focusOn(k.pos.x, k.pos.z, 14);
  });
  await page.waitForTimeout(800);
  const kp = await page.evaluate(() => {
    const k = window.__game!.world.state.beekeeper;
    return { x: k.pos.x, y: k.pos.y + 1.0, z: k.pos.z };
  });
  const sp = await screenOf(page, kp.x, kp.y, kp.z);
  await page.mouse.click(sp.x, sp.y);
  await expect(page.locator('#s-body')).toContainText('The beekeeper', { timeout: 10_000 });
  await expect(page.locator('#s-body')).toContainText('full suit');
  await page.locator('#s-actions button', { hasText: 'Careful' }).click();
  await expect.poll(() => page.evaluate(() => window.__game!.world.state.beekeeper.policy)).toBe('hurried');
  await expect(page.locator('#c-policy button')).toContainText('Hurried');

  // Open the hive without smoke on an angry colony: the guards go for the beekeeper.
  const fight = await page.evaluate(() => {
    const g = window.__game!;
    const w = g.world;
    const s = w.state;
    s.beekeeper.nextChoreAt = s.clock.totalMinutes + 9999;
    s.beekeeper.suit = 'veil';
    s.beekeeper.pos = { x: s.colony.hivePos.x + 1.2, y: s.beekeeper.pos.y, z: s.colony.hivePos.z + 2.4 };
    s.beekeeper.prevPos = { ...s.beekeeper.pos };
    s.colony.smokedUntil = -1;
    s.colony.alert = 0.95;
    w.advanceMinutes(2);
    g.human.focusOn(s.beekeeper.pos.x, s.beekeeper.pos.z, 9);
    return { attackers: s.beekeeper.attackers, stings: s.stats.stingsTaken };
  });
  expect(fight.attackers).toBeGreaterThan(2);
  await page.waitForTimeout(1200);
  await expect(page.locator('.alert', { hasText: 'stinging the beekeeper' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/beekeeper-attacked.png` });

  expect(problems).toEqual([]);
});
