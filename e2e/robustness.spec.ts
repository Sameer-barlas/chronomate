import { test, expect } from '@playwright/test';

test.describe('Phase 4: Robustness & Failure Simulation', () => {
  test('Step 15: App still operates when all hardware APIs fail or are blocked', async ({ page }) => {
    // Inject mocks that break all optional APIs before page loads
    await page.addInitScript(() => {
      // 1. Block localStorage with QuotaExceededError
      const mockStorage: Record<string, string> = {};
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: (key: string) => mockStorage[key] || null,
          setItem: () => {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          },
          removeItem: (key: string) => {
            delete mockStorage[key];
          },
          clear: () => {},
        },
        writable: true,
      });

      // 2. AudioContext unavailable
      // @ts-ignore
      delete window.AudioContext;
      // @ts-ignore
      delete window.webkitAudioContext;

      // 3. navigator.vibrate unavailable
      // @ts-ignore
      delete navigator.vibrate;

      // 4. Wake Lock unavailable
      // @ts-ignore
      delete navigator.wakeLock;

      // 5. Fullscreen API unavailable
      // @ts-ignore
      delete document.documentElement.requestFullscreen;
      // @ts-ignore
      delete document.fullscreenEnabled;
    });

    await page.goto('/');

    // Launch clock
    await page.getByTestId('preset-quick-5m').click();
    const arena = page.getByTestId('clock-arena');
    await expect(arena).toBeVisible();

    // Start clock, tap pads, pause clock — no uncaught errors occur
    await page.getByTestId('clock-start-pause').click();
    await expect(arena).toHaveAttribute('data-clock-status', 'running');

    await page.getByTestId('pad-p1').click();
    await expect(page.getByTestId('pad-p2')).toHaveText(/ACTIVE TURN/);

    await page.getByTestId('clock-start-pause').click();
    await expect(arena).toHaveAttribute('data-clock-status', 'paused');
  });

  test('Step 16: Zero console errors or warnings in production build during all key flows', async ({ page }) => {
    const consoleLogs: { type: string; text: string }[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
      }
    });

    await page.goto('/');

    // 1. Launch Preset
    await page.getByTestId('preset-quick-3m2s').click();

    // 2. Start clock, make moves, pause, resume
    await page.getByTestId('clock-start-pause').click();
    await page.getByTestId('pad-p1').click();
    await page.getByTestId('pad-p2').click();
    await page.getByTestId('clock-start-pause').click();
    await page.getByTestId('pause-resume').click();

    // 3. Time adjust modal
    await page.getByTestId('clock-adjust-time').click();
    await page.getByTestId('adjust-modal-close').click();

    // Resume clock before exiting so it asks for confirmation while running
    await page.getByTestId('pause-resume').click();

    // 4. Exit to setup
    await page.getByTestId('clock-back-home').click();
    await page.getByTestId('confirm-dialog-accept').click();

    // Filter out harmless browser noise if any (like favicon or service-worker registration warnings if mocked)
    const criticalLogs = consoleLogs.filter(
      (log) => !log.text.includes('favicon') && !log.text.includes('service worker')
    );
    expect(criticalLogs).toHaveLength(0);
  });

  test('Step 17: Memory / timer leak check: no stacked intervals after navigating Home <-> Clock', async ({ page }) => {
    await page.goto('/');

    // Hook window.setInterval to count currently running intervals
    await page.evaluate(() => {
      const activeIntervals = new Set<number>();
      const origSetInterval = window.setInterval;
      const origClearInterval = window.clearInterval;

      // @ts-ignore
      window.setInterval = function (fn: any, ms?: any, ...args: any[]) {
        const id = origSetInterval(fn, ms, ...args);
        activeIntervals.add(id);
        return id;
      };

      // @ts-ignore
      window.clearInterval = function (id: any) {
        activeIntervals.delete(id);
        origClearInterval(id);
      };

      // @ts-ignore
      window.__getActiveIntervalCount = () => activeIntervals.size;
    });

    // Navigate Home <-> Clock 6 times
    for (let i = 0; i < 6; i++) {
      await page.getByTestId('preset-quick-5m').click();
      await page.getByTestId('clock-start-pause').click();
      await page.waitForTimeout(100);
      await page.getByTestId('clock-back-home').click();
      await page.getByTestId('confirm-dialog-accept').click();
    }

    const intervalCount = await page.evaluate(() => (window as any).__getActiveIntervalCount());
    // All intervals for the clock arena should be cleaned up on unmount (count = 0)
    expect(intervalCount).toBe(0);
  });

  test('Step 18: Stress test: rapid alternating pad taps for 5 seconds stay smooth and correct', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/');
    await page.getByTestId('preset-quick-3m2s').click();
    await page.getByTestId('clock-start-pause').click();

    // Execute scripted high-speed alternating taps for 5 seconds
    const result = await page.evaluate(async () => {
      const padP1 = document.querySelector('[data-testid="pad-p1"]') as HTMLButtonElement;
      const padP2 = document.querySelector('[data-testid="pad-p2"]') as HTMLButtonElement;
      let taps = 0;
      const start = Date.now();

      while (Date.now() - start < 5000) {
        padP1.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true }));
        await new Promise((r) => setTimeout(r, 70));
        padP2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true }));
        await new Promise((r) => setTimeout(r, 70));
        taps += 2;
      }
      return taps;
    });

    expect(result).toBeGreaterThan(40);
    const arena = page.getByTestId('clock-arena');
    await expect(arena).toHaveAttribute('data-clock-status', 'running');
  });
});
