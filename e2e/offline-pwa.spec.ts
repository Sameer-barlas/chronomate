import { test, expect } from '@playwright/test';

test.describe('Phase 5: Offline, PWA & Rendering Optimization', () => {
  test('Step 20: Offline functionality with service worker precache & valid manifest', async ({ page, context }) => {
    page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
    page.on('requestfailed', (req) =>
      console.log('FAILED URL:', req.url(), req.failure()?.errorText)
    );

    // 1. Check web manifest
    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe('ChronoMate Chess Clock');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i: any) => i.purpose === 'maskable')).toBeTruthy();

    // 2. Load page to register service worker
    await page.goto('/');

    // Wait until service worker is activated and controlling
    const swStatus = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      // Wait for cache keys to confirm assets are precached
      const cache = await caches.open('chronomate-shell-v3');
      const keys = await cache.keys();
      return {
        active: Boolean(reg.active),
        cacheKeyCount: keys.length,
        urls: keys.map((k) => k.url),
      };
    });
    console.log('SW Status before offline:', swStatus);

    // 3. Go offline
    await context.setOffline(true);

    // 4. Reload page while completely offline
    await page.reload();

    // 5. Verify app loads and operates 100% offline
    await expect(page.getByRole('heading', { name: 'Physical Chess Clock in Your Pocket' })).toBeVisible();

    // Launch clock offline
    await page.getByTestId('preset-quick-5m').click();
    await expect(page.getByTestId('clock-arena')).toBeVisible();

    // Reset online state for subsequent tests
    await context.setOffline(false);
  });

  test('Step 21: Update flow: fresh deploys update immediately via network-first navigation', async ({ page }) => {
    // 1. Visit app
    await page.goto('/');
    const title = await page.title();
    expect(title).toBe('ChronoMate Chess Clock');

    // 2. Mock a new build deployment returning updated title/content over network
    await page.route('/', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const updatedBody = body.replace(
        '<title>ChronoMate Chess Clock</title>',
        '<title>ChronoMate Chess Clock v2</title>'
      );
      await route.fulfill({
        response,
        body: updatedBody,
        headers: {
          ...response.headers(),
          'content-type': 'text/html',
        },
      });
    });

    // 3. Returning user refreshes
    await page.reload();

    // 4. Verify user gets new version without stale cache lock
    const updatedTitle = await page.title();
    expect(updatedTitle).toBe('ChronoMate Chess Clock v2');
  });

  test('Step 22: Minimal re-renders: only active clock text updates on tick', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('preset-quick-5m').click();

    // Track DOM mutations on the inactive pad
    await page.evaluate(() => {
      const p2TimeEl = document.querySelector('[data-testid="p2-time"]');
      let mutationCount = 0;
      if (p2TimeEl) {
        const obs = new MutationObserver(() => {
          mutationCount++;
        });
        obs.observe(p2TimeEl, { characterData: true, subtree: true, childList: true });
      }
      // @ts-ignore
      window.__getP2MutationCount = () => mutationCount;
    });

    // Start clock (P1 is active, P2 is inactive)
    await page.getByTestId('clock-start-pause').click();
    await page.waitForTimeout(1500);

    // While P1's clock is ticking, P2's time node should have zero DOM mutations!
    const p2Mutations = await page.evaluate(() => (window as any).__getP2MutationCount());
    expect(p2Mutations).toBe(0);
  });
});
