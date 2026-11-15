import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUICK_PRESETS,
  MatchConfig,
  ClockState,
  createInitialClockState,
  startClock,
  pressClockPad,
  tickClock,
  tickClockAt,
  pauseClock,
  resumeClock,
  togglePauseClock,
  resetClock,
  adjustPlayerTime,
  formatClockTime,
  validateCustomConfig,
  computeTimeMs,
  sanitizePlayerName,
  serializeMatchForStorage,
  restoreMatchFromStorage,
} from './chessClockEngine';

test('Quick presets include 5 min, 10 min, 15 min, and 30 min Norman shortcuts', () => {
  const labels = QUICK_PRESETS.map((p) => p.label);
  assert.ok(labels.includes('5 min'));
  assert.ok(labels.includes('10 min'));
  assert.ok(labels.includes('15 min'));
  assert.ok(labels.includes('30 min'));
});

test('Fischer increment is added once per move, strictly only to the player who just moved', () => {
  const blitz3m2s = QUICK_PRESETS.find((p) => p.id === 'quick-3m2s')!;
  let state = createInitialClockState(blitz3m2s);

  // Start clock with White (p1)
  state = startClock(state, 'p1', 1000);
  assert.equal(state.status, 'running');
  assert.equal(state.activePlayer, 'p1');
  assert.equal(state.p1Moves, 0);
  assert.equal(state.p2Moves, 0);

  // Inactive player (p2) tapping while p1 is active does nothing: no increment, no turn change
  const afterInactive = pressClockPad(state, 'p2', 3000);
  assert.equal(afterInactive.activePlayer, 'p1');
  assert.equal(afterInactive.p2TimeMs, 180_000);
  assert.equal(afterInactive.p1Moves, 0);
  assert.equal(afterInactive.p2Moves, 0);

  // P1 moves after 4s (at t=5000): P1 gets +2000ms increment, P2 receives zero increment and retains 180,000ms
  state = pressClockPad(state, 'p1', 5000);
  assert.equal(state.activePlayer, 'p2');
  assert.equal(state.p1Moves, 1);
  assert.equal(state.p2Moves, 0);
  assert.equal(state.p1TimeMs, 178_000); // 180s - 4s + 2s = 178s
  assert.equal(state.p2TimeMs, 180_000); // untouched!

  // Now P1 (now inactive) taps during P2 turn: ignored
  const afterP1Inactive = pressClockPad(state, 'p1', 6000);
  assert.equal(afterP1Inactive.activePlayer, 'p2');
  assert.equal(afterP1Inactive.p1TimeMs, 178_000);
  assert.equal(afterP1Inactive.p1Moves, 1);

  // P2 moves after 3s (at t=8000): P2 gets +2000ms increment, P1 receives zero increment
  state = pressClockPad(state, 'p2', 8000);
  assert.equal(state.activePlayer, 'p1');
  assert.equal(state.p1Moves, 1);
  assert.equal(state.p2Moves, 1);
  assert.equal(state.p1TimeMs, 178_000); // unchanged
  assert.equal(state.p2TimeMs, 179_000); // 180s - 3s + 2s = 179s
});

test('Different starting times for each player (Asymmetric Time Odds)', () => {
  const asymConfig: MatchConfig = {
    id: 'asym-test',
    label: '2m vs 5m',
    category: 'Custom',
    isAsymmetric: true,
    p1: { name: 'Player 1', minutes: 2, seconds: 0, incrementSeconds: 1 },
    p2: { name: 'Player 2', minutes: 5, seconds: 30, incrementSeconds: 3 },
  };

  let state = createInitialClockState(asymConfig);
  assert.equal(state.p1TimeMs, 120_000);
  assert.equal(state.p2TimeMs, 330_000);
  assert.equal(state.p1InitialMs, 120_000);
  assert.equal(state.p2InitialMs, 330_000);
  assert.equal(state.p1IncrementMs, 1000);
  assert.equal(state.p2IncrementMs, 3000);

  // Start with P1
  state = startClock(state, 'p1', 10_000);

  // Advance 10s on P1's turn
  state = tickClockAt(state, 20_000);
  assert.equal(state.p1TimeMs, 110_000);
  assert.equal(state.p2TimeMs, 330_000); // P2 unchanged

  // P1 ends move, gets +1s
  state = pressClockPad(state, 'p1', 20_000);
  assert.equal(state.p1TimeMs, 111_000);
  assert.equal(state.p2TimeMs, 330_000);
  assert.equal(state.activePlayer, 'p2');

  // Advance 20s on P2's turn
  state = tickClockAt(state, 40_000);
  assert.equal(state.p1TimeMs, 111_000); // P1 unchanged
  assert.equal(state.p2TimeMs, 310_000);

  // P2 ends move, gets +3s
  state = pressClockPad(state, 'p2', 40_000);
  assert.equal(state.p1TimeMs, 111_000);
  assert.equal(state.p2TimeMs, 313_000);
  assert.equal(state.activePlayer, 'p1');
});

test('Pause and resume neither gain nor lose a single millisecond across multiple cycles', () => {
  const rapid10m = QUICK_PRESETS.find((p) => p.id === 'quick-10m')!;
  let state = createInitialClockState(rapid10m);
  state = startClock(state, 'p1', 10_000);

  // Run for 12,345ms then pause
  state = pauseClock(state, 22_345);
  assert.equal(state.status, 'paused');
  assert.equal(state.p1TimeMs, 600_000 - 12_345);

  // While paused for 60 seconds, ticking does nothing
  state = tickClockAt(state, 82_345);
  assert.equal(state.p1TimeMs, 600_000 - 12_345);

  // While paused, pad taps do nothing
  const duringPauseTap = pressClockPad(state, 'p1', 83_000);
  assert.equal(duringPauseTap.status, 'paused');
  assert.equal(duringPauseTap.p1TimeMs, 600_000 - 12_345);

  // Resume at t=90,000 and run for 7,655ms (total active time = exactly 20,000ms)
  state = resumeClock(state, 90_000);
  assert.equal(state.status, 'running');
  state = tickClockAt(state, 97_655);
  assert.equal(state.p1TimeMs, 580_000); // 600,000 - 20,000 = 580,000 exact!

  // Toggle pause test
  state = togglePauseClock(state, 97_655);
  assert.equal(state.status, 'paused');
  assert.equal(state.p1TimeMs, 580_000);

  state = togglePauseClock(state, 120_000);
  assert.equal(state.status, 'running');
  state = tickClockAt(state, 121_000);
  assert.equal(state.p1TimeMs, 579_000);
});

test('Flag at exactly 0: no negative time, exactly one flag event, nothing runs afterwards', () => {
  const bullet1m = QUICK_PRESETS.find((p) => p.id === 'quick-1m')!;
  let state = createInitialClockState(bullet1m);
  const startTs = 1000;
  state = startClock(state, 'p1', startTs);

  // Tick to exactly when remaining time hits 0: 60,000ms after start
  state = tickClockAt(state, startTs + 60_000);
  assert.equal(state.status, 'flagged');
  assert.equal(state.p1TimeMs, 0);
  assert.equal(state.flaggedPlayer, 'p1');
  assert.equal(state.winner, 'p2');

  // Even if evaluated at a later time (e.g. 10 seconds later), time NEVER goes negative
  state = tickClockAt(state, startTs + 70_000);
  assert.equal(state.status, 'flagged');
  assert.equal(state.p1TimeMs, 0);
  assert.equal(state.p2TimeMs, 60_000);

  // Further pad presses do nothing
  const afterTapP1 = pressClockPad(state, 'p1', startTs + 71_000);
  assert.equal(afterTapP1.status, 'flagged');
  assert.equal(afterTapP1.p1TimeMs, 0);

  const afterTapP2 = pressClockPad(state, 'p2', startTs + 72_000);
  assert.equal(afterTapP2.status, 'flagged');
  assert.equal(afterTapP2.p2TimeMs, 60_000);

  // Pause / resume do nothing on flagged match
  const afterPause = pauseClock(state, startTs + 73_000);
  assert.equal(afterPause.status, 'flagged');

  const afterResume = resumeClock(state, startTs + 74_000);
  assert.equal(afterResume.status, 'flagged');

  // Ticking delta does nothing
  const afterDelta = tickClock(state, 5000);
  assert.equal(afterDelta.status, 'flagged');
  assert.equal(afterDelta.p1TimeMs, 0);
});

test('100 rapid alternating taps keep counters and times correct', () => {
  const blitz3m2s = QUICK_PRESETS.find((p) => p.id === 'quick-3m2s')!;
  let state = createInitialClockState(blitz3m2s);
  let now = 1_000_000;

  // Start with P1
  state = startClock(state, 'p1', now);

  // 100 rapid alternating moves: 50 by P1, 50 by P2. Each move takes 150ms.
  // Increment is 2000ms per move.
  // Net time change per move: -150ms + 2000ms = +1850ms per player per move.
  for (let i = 0; i < 100; i++) {
    const active = state.activePlayer!;
    now += 150;
    state = pressClockPad(state, active, now);
  }

  assert.equal(state.p1Moves, 50);
  assert.equal(state.p2Moves, 50);
  assert.equal(state.activePlayer, 'p1'); // After 100 moves, turn returns to P1
  assert.equal(state.status, 'running');

  // P1 started at 180,000ms; had 50 turns of 150ms elapsed (-7,500ms) and 50 increments of 2000ms (+100,000ms)
  const expectedP1 = 180_000 - 50 * 150 + 50 * 2000;
  // P2 started at 180,000ms; had 50 turns of 150ms elapsed (-7,500ms) and 50 increments of 2000ms (+100,000ms)
  const expectedP2 = 180_000 - 50 * 150 + 50 * 2000;

  assert.equal(state.p1TimeMs, expectedP1);
  assert.equal(state.p2TimeMs, expectedP2);
});

test('Restore from saved state after a refresh comes back PAUSED with correct times', () => {
  const rapid10m = QUICK_PRESETS.find((p) => p.id === 'quick-10m')!;
  let state = createInitialClockState(rapid10m);
  state = startClock(state, 'p1', 100_000);
  state = pressClockPad(state, 'p1', 115_000); // P1 spent 15s, P2's turn now

  // Save occurs at t=140,000 (25s into P2's turn)
  const serialized = serializeMatchForStorage(state, 140_000);
  assert.ok(serialized);

  // Browser refresh restores match from serialized string
  const restored = restoreMatchFromStorage(serialized);
  assert.ok(restored);
  assert.equal(restored.status, 'paused');
  assert.equal(restored.activePlayer, 'p2');
  assert.equal(restored.p1TimeMs, 585_000); // 600,000 - 15,000
  assert.equal(restored.p2TimeMs, 575_000); // 600,000 - 25,000
  assert.equal(restored.p1Moves, 1);
  assert.equal(restored.p2Moves, 0);

  // Restoring already paused match preserves paused status
  const pausedState = pauseClock(state, 140_000);
  const pausedSerialized = serializeMatchForStorage(pausedState, 150_000);
  const restoredPaused = restoreMatchFromStorage(pausedSerialized);
  assert.ok(restoredPaused);
  assert.equal(restoredPaused.status, 'paused');

  // Corrupted / invalid storage inputs return null safely without throwing
  assert.equal(restoreMatchFromStorage(null), null);
  assert.equal(restoreMatchFromStorage(''), null);
  assert.equal(restoreMatchFromStorage('{ bad json'), null);
  assert.equal(restoreMatchFromStorage(JSON.stringify({ version: 2, state: {} })), null);
  assert.equal(restoreMatchFromStorage(JSON.stringify({ version: 1, state: { p1TimeMs: 'bad' } })), null);
  assert.equal(restoreMatchFromStorage(JSON.stringify({ version: 1, state: { p1TimeMs: NaN, p2TimeMs: 100 } })), null);
});

test('Invalid input (NaN, negative, empty, huge values) never reaches the engine', () => {
  // Empty values
  const emptyValidation = validateCustomConfig({
    p1Name: '',
    p2Name: '',
    isAsymmetric: false,
    p1Minutes: NaN,
    p1Seconds: 0,
    p1Increment: 0,
    p2Minutes: 0,
    p2Seconds: 0,
    p2Increment: 0,
  });
  assert.equal(emptyValidation.valid, false);

  // Negative values
  const negativeValidation = validateCustomConfig({
    p1Name: 'Player 1',
    p2Name: 'Player 2',
    isAsymmetric: false,
    p1Minutes: -5,
    p1Seconds: 0,
    p1Increment: 0,
    p2Minutes: 0,
    p2Seconds: 0,
    p2Increment: 0,
  });
  assert.equal(negativeValidation.valid, false);

  // Huge values (> 180 min / 3 hours)
  const hugeValidation = validateCustomConfig({
    p1Name: 'Player 1',
    p2Name: 'Player 2',
    isAsymmetric: false,
    p1Minutes: 300,
    p1Seconds: 0,
    p1Increment: 0,
    p2Minutes: 0,
    p2Seconds: 0,
    p2Increment: 0,
  });
  assert.equal(hugeValidation.valid, false);

  // Huge increment (> 60s)
  const hugeIncValidation = validateCustomConfig({
    p1Name: 'Player 1',
    p2Name: 'Player 2',
    isAsymmetric: false,
    p1Minutes: 5,
    p1Seconds: 0,
    p1Increment: 120,
    p2Minutes: 0,
    p2Seconds: 0,
    p2Increment: 0,
  });
  assert.equal(hugeIncValidation.valid, false);

  // Invalid seconds (> 59s)
  const badSecValidation = validateCustomConfig({
    p1Name: 'Player 1',
    p2Name: 'Player 2',
    isAsymmetric: false,
    p1Minutes: 5,
    p1Seconds: 75,
    p1Increment: 0,
    p2Minutes: 0,
    p2Seconds: 0,
    p2Increment: 0,
  });
  assert.equal(badSecValidation.valid, false);

  // computeTimeMs safety against NaN and negative
  assert.equal(computeTimeMs(NaN, NaN), 0);
  assert.equal(computeTimeMs(-10, -5), 0);
  assert.equal(computeTimeMs(9999, 9999), 10_800_000); // capped at 3 hours

  // sanitizePlayerName safety
  assert.equal(sanitizePlayerName('   ', 'Fallback'), 'Fallback');
  assert.equal(sanitizePlayerName('A'.repeat(50), 'Fallback'), 'A'.repeat(16));
  assert.equal(sanitizePlayerName('\u0000\u0007Hello\u001F', 'Fallback'), 'Hello');

  // createInitialClockState defensive handling of malformed input
  const malformedConfig = {
    id: 'test',
    label: '',
    category: 'Blitz' as const,
    isAsymmetric: false,
    p1: { name: '', minutes: NaN, seconds: NaN, incrementSeconds: NaN },
    p2: { name: '', minutes: -1, seconds: -1, incrementSeconds: -1 },
  };
  const safeState = createInitialClockState(malformedConfig);
  assert.ok(Number.isFinite(safeState.p1TimeMs));
  assert.ok(Number.isFinite(safeState.p2TimeMs));
  assert.ok(Number.isFinite(safeState.p1IncrementMs));
  assert.ok(Number.isFinite(safeState.p2IncrementMs));
  assert.equal(safeState.p1IncrementMs, 0);
  assert.equal(safeState.p2IncrementMs, 0);
  assert.equal(safeState.p1TimeMs, 1000); // MIN_TOTAL_TIME_MS floor
  assert.equal(safeState.p2TimeMs, 1000);

  // adjustPlayerTime safety against NaN
  const adjusted = adjustPlayerTime(safeState, 'p1', NaN);
  assert.equal(adjusted.p1TimeMs, safeState.p1TimeMs); // untouched on NaN

  // adjustPlayerTime clamp against negative and huge
  const clampedLow = adjustPlayerTime(safeState, 'p1', -500);
  assert.equal(clampedLow.p1TimeMs, 1000);
  const clampedHigh = adjustPlayerTime(safeState, 'p1', 999_999_999);
  assert.equal(clampedHigh.p1TimeMs, 10_800_000);

  // tickClock safety against NaN and negative delta
  assert.equal(tickClock(safeState, NaN), safeState);
  assert.equal(tickClock(safeState, -100), safeState);

  // tickClockAt safety against NaN
  const tickNaN = tickClockAt(safeState, NaN);
  assert.ok(Number.isFinite(tickNaN.p1TimeMs));
});

test('formatClockTime shows tenths of a second ONLY when strictly under 10 seconds', () => {
  const at15s = formatClockTime(15_400);
  assert.equal(at15s.main, '0:16');
  assert.equal(at15s.tenths, null);
  assert.equal(at15s.isLowTime, false);

  const at10s = formatClockTime(10_000);
  assert.equal(at10s.main, '0:10');
  assert.equal(at10s.tenths, null);
  assert.equal(at10s.isLowTime, false);

  const at9s = formatClockTime(9_400);
  assert.equal(at9s.main, '0:09');
  assert.equal(at9s.tenths, '.4');
  assert.equal(at9s.isLowTime, true);

  const atZero = formatClockTime(0);
  assert.equal(atZero.main, '0:00');
  assert.equal(atZero.tenths, '.0');
  assert.equal(atZero.isLowTime, false);

  // Format over 1 hour
  const over1Hour = formatClockTime(3665_000); // 1h 1m 5s
  assert.equal(over1Hour.main, '1:01:05');
  assert.equal(over1Hour.tenths, null);
});

test('Reset clock restores original times, moves to 0, and status to idle', () => {
  const blitz3m2s = QUICK_PRESETS.find((p) => p.id === 'quick-3m2s')!;
  let state = createInitialClockState(blitz3m2s);
  state = startClock(state, 'p1', 1000);
  state = pressClockPad(state, 'p1', 5000);

  assert.equal(state.p1Moves, 1);
  assert.notEqual(state.p1TimeMs, state.p1InitialMs);

  state = resetClock(state);
  assert.equal(state.status, 'idle');
  assert.equal(state.activePlayer, null);
  assert.equal(state.p1Moves, 0);
  assert.equal(state.p2Moves, 0);
  assert.equal(state.p1TimeMs, state.p1InitialMs);
  assert.equal(state.p2TimeMs, state.p2InitialMs);
});
