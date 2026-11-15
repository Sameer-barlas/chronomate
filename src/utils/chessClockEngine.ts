export type PlayerId = 'p1' | 'p2';

export type ClockStatus = 'idle' | 'running' | 'paused' | 'flagged';

export interface PlayerTimeConfig {
  name: string;
  minutes: number;
  seconds: number;
  incrementSeconds: number;
}

export interface MatchConfig {
  id: string;
  label: string;
  category: 'Bullet' | 'Blitz' | 'Rapid' | 'Classical' | 'Custom';
  isAsymmetric: boolean;
  p1: PlayerTimeConfig;
  p2: PlayerTimeConfig;
}

export interface ClockState {
  status: ClockStatus;
  activePlayer: PlayerId | null;
  flaggedPlayer: PlayerId | null;
  winner: PlayerId | null;
  p1TimeMs: number;
  p2TimeMs: number;
  p1InitialMs: number;
  p2InitialMs: number;
  p1IncrementMs: number;
  p2IncrementMs: number;
  p1Moves: number;
  p2Moves: number;
  p1Name: string;
  p2Name: string;
  label: string;
  category: MatchConfig['category'];
  elapsedMatchMs: number;
  // Timestamp-anchored fields for zero-drift timing
  turnStartedAtMs: number | null;
  activeTurnInitialRemainingMs: number;
  elapsedBeforeTurnMs: number;
  lastTapAtMs: number | null;
  lastTappedPad: PlayerId | null;
}

export interface FormattedClockTime {
  main: string;
  tenths: string | null;
  isLowTime: boolean;
  isCriticalTime: boolean;
}

export interface MatchHistoryRecord {
  id: string;
  playedAt: string;
  label: string;
  p1Name: string;
  p2Name: string;
  p1RemainingMs: number;
  p2RemainingMs: number;
  totalMoves: number;
  outcome: string;
}

export const SAME_PAD_DEBOUNCE_MS = 65;
export const MAX_NAME_LENGTH = 16;
export const MAX_TOTAL_TIME_MS = 3 * 60 * 60 * 1000; // 3 hours (180 minutes)
export const MIN_TOTAL_TIME_MS = 1000; // 1 second

export const QUICK_PRESETS: MatchConfig[] = [
  {
    id: 'quick-5m',
    label: '5 min',
    category: 'Blitz',
    isAsymmetric: false,
    p1: { name: 'Player 1 (White)', minutes: 5, seconds: 0, incrementSeconds: 0 },
    p2: { name: 'Player 2 (Black)', minutes: 5, seconds: 0, incrementSeconds: 0 },
  },
  {
    id: 'quick-10m',
    label: '10 min',
    category: 'Rapid',
    isAsymmetric: false,
    p1: { name: 'Player 1 (White)', minutes: 10, seconds: 0, incrementSeconds: 0 },
    p2: { name: 'Player 2 (Black)', minutes: 10, seconds: 0, incrementSeconds: 0 },
  },
  {
    id: 'quick-15m',
    label: '15 min',
    category: 'Rapid',
    isAsymmetric: false,
    p1: { name: 'Player 1 (White)', minutes: 15, seconds: 0, incrementSeconds: 0 },
    p2: { name: 'Player 2 (Black)', minutes: 15, seconds: 0, incrementSeconds: 0 },
  },
  {
    id: 'quick-30m',
    label: '30 min',
    category: 'Classical',
    isAsymmetric: false,
    p1: { name: 'Player 1 (White)', minutes: 30, seconds: 0, incrementSeconds: 0 },
    p2: { name: 'Player 2 (Black)', minutes: 30, seconds: 0, incrementSeconds: 0 },
  },
  {
    id: 'quick-3m2s',
    label: '3 | 2',
    category: 'Blitz',
    isAsymmetric: false,
    p1: { name: 'Player 1 (White)', minutes: 3, seconds: 0, incrementSeconds: 2 },
    p2: { name: 'Player 2 (Black)', minutes: 3, seconds: 0, incrementSeconds: 2 },
  },
  {
    id: 'quick-1m',
    label: '1 min',
    category: 'Bullet',
    isAsymmetric: false,
    p1: { name: 'Player 1 (White)', minutes: 1, seconds: 0, incrementSeconds: 0 },
    p2: { name: 'Player 2 (Black)', minutes: 1, seconds: 0, incrementSeconds: 0 },
  },
  {
    id: 'quick-15m10s',
    label: '15 | 10',
    category: 'Rapid',
    isAsymmetric: false,
    p1: { name: 'Player 1 (White)', minutes: 15, seconds: 0, incrementSeconds: 10 },
    p2: { name: 'Player 2 (Black)', minutes: 15, seconds: 0, incrementSeconds: 10 },
  },
  {
    id: 'quick-5m3s',
    label: '5 | 3',
    category: 'Blitz',
    isAsymmetric: false,
    p1: { name: 'Player 1 (White)', minutes: 5, seconds: 0, incrementSeconds: 3 },
    p2: { name: 'Player 2 (Black)', minutes: 5, seconds: 0, incrementSeconds: 3 },
  },
];

export function sanitizePlayerName(raw: string, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

export function computeTimeMs(minutes: number, seconds: number): number {
  const safeMin = Math.max(0, Math.floor(Number.isFinite(minutes) ? minutes : 0));
  const safeSec = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return Math.min(MAX_TOTAL_TIME_MS, (safeMin * 60 + safeSec) * 1000);
}

export function inferCategory(minutes: number, incrementSeconds: number): MatchConfig['category'] {
  const safeMin = Number.isFinite(minutes) ? minutes : 0;
  const safeInc = Number.isFinite(incrementSeconds) ? incrementSeconds : 0;
  const estimatedTotalMinutes = safeMin + (safeInc * 40) / 60;
  if (estimatedTotalMinutes < 3) return 'Bullet';
  if (estimatedTotalMinutes < 10) return 'Blitz';
  if (estimatedTotalMinutes < 30) return 'Rapid';
  return 'Classical';
}

export function validateCustomConfig(input: {
  p1Name: string;
  p2Name: string;
  isAsymmetric: boolean;
  p1Minutes: number;
  p1Seconds: number;
  p1Increment: number;
  p2Minutes: number;
  p2Seconds: number;
  p2Increment: number;
}): { valid: boolean; error?: string; config?: MatchConfig } {
  const rawP1Name = typeof input.p1Name === 'string' ? input.p1Name.trim() : '';
  const rawP2Name = typeof input.p2Name === 'string' ? input.p2Name.trim() : '';

  if (rawP1Name.length > MAX_NAME_LENGTH || rawP2Name.length > MAX_NAME_LENGTH) {
    return {
      valid: false,
      error: `Player names must be ${MAX_NAME_LENGTH} characters or fewer.`,
    };
  }

  const p1Min = Number(input.p1Minutes);
  const p1Sec = Number(input.p1Seconds);
  const p1Inc = Number(input.p1Increment);

  const p2Min = input.isAsymmetric ? Number(input.p2Minutes) : p1Min;
  const p2Sec = input.isAsymmetric ? Number(input.p2Seconds) : p1Sec;
  const p2Inc = input.isAsymmetric ? Number(input.p2Increment) : p1Inc;

  if (
    !Number.isFinite(p1Min) ||
    !Number.isFinite(p1Sec) ||
    !Number.isFinite(p1Inc) ||
    !Number.isFinite(p2Min) ||
    !Number.isFinite(p2Sec) ||
    !Number.isFinite(p2Inc)
  ) {
    return { valid: false, error: 'All time fields must be valid numbers.' };
  }

  const ip1Min = Math.floor(p1Min);
  const ip1Sec = Math.floor(p1Sec);
  const ip1Inc = Math.floor(p1Inc);
  const ip2Min = Math.floor(p2Min);
  const ip2Sec = Math.floor(p2Sec);
  const ip2Inc = Math.floor(p2Inc);

  if (ip1Min < 0 || ip1Sec < 0 || ip1Inc < 0 || ip2Min < 0 || ip2Sec < 0 || ip2Inc < 0) {
    return { valid: false, error: 'Time values cannot be negative.' };
  }

  if (ip1Sec > 59 || ip2Sec > 59) {
    return { valid: false, error: 'Seconds must be between 0 and 59.' };
  }

  if (ip1Inc > 60 || ip2Inc > 60) {
    return { valid: false, error: 'Increment must be between 0 and 60 seconds.' };
  }

  const p1RawMs = (ip1Min * 60 + ip1Sec) * 1000;
  const p2RawMs = (ip2Min * 60 + ip2Sec) * 1000;

  if (p1RawMs < MIN_TOTAL_TIME_MS || p2RawMs < MIN_TOTAL_TIME_MS) {
    return { valid: false, error: 'Each player must start with at least 1 second on the clock.' };
  }

  if (p1RawMs > MAX_TOTAL_TIME_MS || p2RawMs > MAX_TOTAL_TIME_MS) {
    return { valid: false, error: 'Maximum initial time is 3 hours (180 minutes) per player.' };
  }

  const cleanP1Name = sanitizePlayerName(rawP1Name, 'Player 1 (White)');
  const cleanP2Name = sanitizePlayerName(rawP2Name, 'Player 2 (Black)');

  const formatSide = (m: number, s: number, inc: number) => {
    const base = s > 0 ? `${m}m ${s}s` : `${m} min`;
    return inc > 0 ? `${base} +${inc}s` : base;
  };

  const label = input.isAsymmetric
    ? `${formatSide(ip1Min, ip1Sec, ip1Inc)} vs ${formatSide(ip2Min, ip2Sec, ip2Inc)}`
    : formatSide(ip1Min, ip1Sec, ip1Inc);

  const category = input.isAsymmetric ? 'Custom' : inferCategory(ip1Min + ip1Sec / 60, ip1Inc);

  return {
    valid: true,
    config: {
      id: `custom-${Date.now()}`,
      label,
      category,
      isAsymmetric: input.isAsymmetric,
      p1: {
        name: cleanP1Name,
        minutes: ip1Min,
        seconds: ip1Sec,
        incrementSeconds: ip1Inc,
      },
      p2: {
        name: cleanP2Name,
        minutes: ip2Min,
        seconds: ip2Sec,
        incrementSeconds: ip2Inc,
      },
    },
  };
}

export function createInitialClockState(config: MatchConfig): ClockState {
  const p1Ms = Math.max(
    MIN_TOTAL_TIME_MS,
    Math.min(MAX_TOTAL_TIME_MS, computeTimeMs(config.p1?.minutes, config.p1?.seconds))
  );
  const p2Ms = Math.max(
    MIN_TOTAL_TIME_MS,
    Math.min(MAX_TOTAL_TIME_MS, computeTimeMs(config.p2?.minutes, config.p2?.seconds))
  );

  const safeP1Inc = Number.isFinite(config.p1?.incrementSeconds) ? Math.floor(config.p1.incrementSeconds) : 0;
  const safeP2Inc = Number.isFinite(config.p2?.incrementSeconds) ? Math.floor(config.p2.incrementSeconds) : 0;

  return {
    status: 'idle',
    activePlayer: null,
    flaggedPlayer: null,
    winner: null,
    p1TimeMs: p1Ms,
    p2TimeMs: p2Ms,
    p1InitialMs: p1Ms,
    p2InitialMs: p2Ms,
    p1IncrementMs: Math.max(0, Math.min(60_000, safeP1Inc * 1000)),
    p2IncrementMs: Math.max(0, Math.min(60_000, safeP2Inc * 1000)),
    p1Moves: 0,
    p2Moves: 0,
    p1Name: sanitizePlayerName(config.p1?.name, 'Player 1 (White)'),
    p2Name: sanitizePlayerName(config.p2?.name, 'Player 2 (Black)'),
    label: config.label || 'Clock Match',
    category: config.category || 'Rapid',
    elapsedMatchMs: 0,
    turnStartedAtMs: null,
    activeTurnInitialRemainingMs: p1Ms,
    elapsedBeforeTurnMs: 0,
    lastTapAtMs: null,
    lastTappedPad: null,
  };
}

/**
 * Computes exact remaining time from wall-clock/monotonic timestamp without mutating or drifting.
 */
export function getEffectiveClockState(
  state: ClockState,
  nowMs: number = Date.now()
): ClockState {
  if (
    state.status !== 'running' ||
    !state.activePlayer ||
    state.turnStartedAtMs === null
  ) {
    return state;
  }

  const effectiveNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const elapsedTurnMs = Math.max(0, effectiveNow - state.turnStartedAtMs);
  const nextRemainingMs = state.activeTurnInitialRemainingMs - elapsedTurnMs;

  if (state.activePlayer === 'p1') {
    if (nextRemainingMs <= 0) {
      return {
        ...state,
        status: 'flagged',
        p1TimeMs: 0,
        flaggedPlayer: 'p1',
        winner: 'p2',
        turnStartedAtMs: null,
        activeTurnInitialRemainingMs: 0,
        elapsedMatchMs: state.elapsedBeforeTurnMs + state.activeTurnInitialRemainingMs,
      };
    }
    return {
      ...state,
      p1TimeMs: nextRemainingMs,
      elapsedMatchMs: state.elapsedBeforeTurnMs + elapsedTurnMs,
    };
  } else {
    if (nextRemainingMs <= 0) {
      return {
        ...state,
        status: 'flagged',
        p2TimeMs: 0,
        flaggedPlayer: 'p2',
        winner: 'p1',
        turnStartedAtMs: null,
        activeTurnInitialRemainingMs: 0,
        elapsedMatchMs: state.elapsedBeforeTurnMs + state.activeTurnInitialRemainingMs,
      };
    }
    return {
      ...state,
      p2TimeMs: nextRemainingMs,
      elapsedMatchMs: state.elapsedBeforeTurnMs + elapsedTurnMs,
    };
  }
}

export function startClock(
  state: ClockState,
  startingPlayer: PlayerId = 'p1',
  nowMs: number = Date.now()
): ClockState {
  if (state.status !== 'idle') return state;
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const initialRemaining = startingPlayer === 'p1' ? state.p1TimeMs : state.p2TimeMs;
  return {
    ...state,
    status: 'running',
    activePlayer: startingPlayer,
    turnStartedAtMs: safeNow,
    activeTurnInitialRemainingMs: initialRemaining,
    elapsedBeforeTurnMs: state.elapsedMatchMs,
  };
}

/**
 * Timestamp-anchored pad press handler:
 * - Ignores taps when paused or flagged.
 * - Ignores taps on the inactive player's pad while running.
 * - Debounces accidental double-taps (< 65ms) on the SAME pad without delaying rapid alternating moves.
 * - Settles exact timestamp elapsed time before applying Fischer increment and switching turn.
 */
export function pressClockPad(
  state: ClockState,
  pressedBy: PlayerId,
  nowMs?: number
): ClockState {
  if (state.status === 'flagged' || state.status === 'paused') {
    return state;
  }

  const effectiveNow =
    nowMs !== undefined && Number.isFinite(nowMs)
      ? nowMs
      : state.turnStartedAtMs !== null
      ? Math.max(Date.now(), state.turnStartedAtMs)
      : Date.now();

  // Guard against accidental same-pad double-tap within 65ms
  if (
    state.lastTappedPad === pressedBy &&
    state.lastTapAtMs !== null &&
    effectiveNow >= state.lastTapAtMs &&
    effectiveNow - state.lastTapAtMs < SAME_PAD_DEBOUNCE_MS
  ) {
    return state;
  }

  if (state.status === 'idle') {
    if (pressedBy === 'p2') {
      return {
        ...state,
        status: 'running',
        activePlayer: 'p1',
        turnStartedAtMs: effectiveNow,
        activeTurnInitialRemainingMs: state.p1TimeMs,
        elapsedBeforeTurnMs: 0,
        lastTapAtMs: effectiveNow,
        lastTappedPad: 'p2',
      };
    }
    const nextP1Time = Math.min(MAX_TOTAL_TIME_MS, state.p1TimeMs + state.p1IncrementMs);
    return {
      ...state,
      status: 'running',
      activePlayer: 'p2',
      p1Moves: 1,
      p1TimeMs: nextP1Time,
      turnStartedAtMs: effectiveNow,
      activeTurnInitialRemainingMs: state.p2TimeMs,
      elapsedBeforeTurnMs: 0,
      lastTapAtMs: effectiveNow,
      lastTappedPad: 'p1',
    };
  }

  // Running state: ignore taps on the inactive player's pad
  if (state.activePlayer !== pressedBy) {
    return state;
  }

  // Settle exact elapsed time for the active turn using timestamp
  const settled = getEffectiveClockState(state, effectiveNow);
  if (settled.status === 'flagged') {
    return settled;
  }

  if (pressedBy === 'p1') {
    const newP1Time = Math.min(MAX_TOTAL_TIME_MS, settled.p1TimeMs + settled.p1IncrementMs);
    return {
      ...settled,
      activePlayer: 'p2',
      p1Moves: settled.p1Moves + 1,
      p1TimeMs: newP1Time,
      turnStartedAtMs: effectiveNow,
      activeTurnInitialRemainingMs: settled.p2TimeMs,
      elapsedBeforeTurnMs: settled.elapsedMatchMs,
      lastTapAtMs: effectiveNow,
      lastTappedPad: 'p1',
    };
  } else {
    const newP2Time = Math.min(MAX_TOTAL_TIME_MS, settled.p2TimeMs + settled.p2IncrementMs);
    return {
      ...settled,
      activePlayer: 'p1',
      p2Moves: settled.p2Moves + 1,
      p2TimeMs: newP2Time,
      turnStartedAtMs: effectiveNow,
      activeTurnInitialRemainingMs: settled.p1TimeMs,
      elapsedBeforeTurnMs: settled.elapsedMatchMs,
      lastTapAtMs: effectiveNow,
      lastTappedPad: 'p2',
    };
  }
}

export function tickClockAt(state: ClockState, nowMs: number = Date.now()): ClockState {
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  return getEffectiveClockState(state, safeNow);
}

/**
 * Advances the clock by deltaMs from its current timestamp anchor.
 */
export function tickClock(state: ClockState, deltaMs: number): ClockState {
  if (state.status !== 'running' || !state.activePlayer || !Number.isFinite(deltaMs) || deltaMs <= 0) {
    return state;
  }
  const baseTs = state.turnStartedAtMs ?? 0;
  const nextTs = baseTs + Math.max(0, deltaMs);
  const settled = getEffectiveClockState(
    {
      ...state,
      turnStartedAtMs: baseTs,
    },
    nextTs
  );
  if (settled.status === 'flagged') {
    return settled;
  }
  return {
    ...settled,
    turnStartedAtMs: nextTs,
    activeTurnInitialRemainingMs:
      settled.activePlayer === 'p1' ? settled.p1TimeMs : settled.p2TimeMs,
    elapsedBeforeTurnMs: settled.elapsedMatchMs,
  };
}

export function pauseClock(state: ClockState, nowMs?: number): ClockState {
  if (state.status !== 'running') return state;
  const effectiveNow =
    nowMs !== undefined ? nowMs : state.turnStartedAtMs ?? Date.now();
  const settled = getEffectiveClockState(state, effectiveNow);
  if (settled.status === 'flagged') {
    return settled;
  }
  return {
    ...settled,
    status: 'paused',
    turnStartedAtMs: null,
    activeTurnInitialRemainingMs:
      settled.activePlayer === 'p1' ? settled.p1TimeMs : settled.p2TimeMs,
    elapsedBeforeTurnMs: settled.elapsedMatchMs,
  };
}

export function resumeClock(state: ClockState, nowMs: number = Date.now()): ClockState {
  if (state.status !== 'paused' || !state.activePlayer) return state;
  const remaining =
    state.activePlayer === 'p1' ? state.p1TimeMs : state.p2TimeMs;
  return {
    ...state,
    status: 'running',
    turnStartedAtMs: nowMs,
    activeTurnInitialRemainingMs: remaining,
    elapsedBeforeTurnMs: state.elapsedMatchMs,
  };
}

export function togglePauseClock(state: ClockState, nowMs: number = Date.now()): ClockState {
  if (state.status === 'running') return pauseClock(state, nowMs);
  if (state.status === 'paused') return resumeClock(state, nowMs);
  if (state.status === 'idle') return startClock(state, 'p1', nowMs);
  return state;
}

export function resetClock(state: ClockState): ClockState {
  return {
    ...state,
    status: 'idle',
    activePlayer: null,
    flaggedPlayer: null,
    winner: null,
    p1TimeMs: state.p1InitialMs,
    p2TimeMs: state.p2InitialMs,
    p1Moves: 0,
    p2Moves: 0,
    elapsedMatchMs: 0,
    turnStartedAtMs: null,
    activeTurnInitialRemainingMs: state.p1InitialMs,
    elapsedBeforeTurnMs: 0,
    lastTapAtMs: null,
    lastTappedPad: null,
  };
}

export function adjustPlayerTime(
  state: ClockState,
  player: PlayerId,
  newTimeMs: number,
  nowMs: number = Date.now()
): ClockState {
  if (!Number.isFinite(newTimeMs)) return state;
  const clampedMs = Math.max(
    MIN_TOTAL_TIME_MS,
    Math.min(MAX_TOTAL_TIME_MS, Math.floor(newTimeMs))
  );

  const nextStatus: ClockStatus =
    state.status === 'flagged' ? 'paused' : state.status;

  if (player === 'p1') {
    const isCurrentTurn = state.activePlayer === 'p1';
    return {
      ...state,
      p1TimeMs: clampedMs,
      status: nextStatus,
      flaggedPlayer: state.flaggedPlayer === 'p1' ? null : state.flaggedPlayer,
      winner: state.flaggedPlayer === 'p1' ? null : state.winner,
      turnStartedAtMs: nextStatus === 'running' && isCurrentTurn ? nowMs : state.turnStartedAtMs,
      activeTurnInitialRemainingMs: isCurrentTurn ? clampedMs : state.activeTurnInitialRemainingMs,
    };
  }
  const isCurrentTurn = state.activePlayer === 'p2';
  return {
    ...state,
    p2TimeMs: clampedMs,
    status: nextStatus,
    flaggedPlayer: state.flaggedPlayer === 'p2' ? null : state.flaggedPlayer,
    winner: state.flaggedPlayer === 'p2' ? null : state.winner,
    turnStartedAtMs: nextStatus === 'running' && isCurrentTurn ? nowMs : state.turnStartedAtMs,
    activeTurnInitialRemainingMs: isCurrentTurn ? clampedMs : state.activeTurnInitialRemainingMs,
  };
}

/**
 * Formats milliseconds into tabular display strings.
 * Tenths of a second (.0 - .9) are shown ONLY when remaining time is strictly under 10 seconds (< 10,000 ms).
 */
export function formatClockTime(ms: number): FormattedClockTime {
  const clamped = Math.max(0, Number.isFinite(ms) ? ms : 0);
  const isLowTime = clamped > 0 && clamped < 10_000;
  const isCriticalTime = clamped > 0 && clamped <= 5_000;

  if (clamped === 0) {
    return {
      main: '0:00',
      tenths: '.0',
      isLowTime: false,
      isCriticalTime: false,
    };
  }

  // Strictly under 10 seconds: show tenths of a second
  if (clamped < 10_000) {
    const totalTenths = Math.min(99, Math.ceil(clamped / 100));
    const wholeSeconds = Math.floor(totalTenths / 10);
    const tenthsDigit = totalTenths % 10;
    return {
      main: `0:${wholeSeconds.toString().padStart(2, '0')}`,
      tenths: `.${tenthsDigit}`,
      isLowTime,
      isCriticalTime,
    };
  }

  // 10 seconds or above: whole seconds only
  const totalSeconds = Math.ceil(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return {
      main: `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      tenths: null,
      isLowTime: false,
      isCriticalTime: false,
    };
  }

  return {
    main: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    tenths: null,
    isLowTime: false,
    isCriticalTime: false,
  };
}

export interface PersistedMatchSnapshot {
  version: 1;
  savedAtMs: number;
  state: ClockState;
}

export function serializeMatchForStorage(
  state: ClockState,
  nowMs: number = Date.now()
): string | null {
  if (state.status === 'idle' && state.p1Moves === 0 && state.p2Moves === 0) {
    return null;
  }
  const settled = getEffectiveClockState(state, nowMs);
  const payload: PersistedMatchSnapshot = {
    version: 1,
    savedAtMs: nowMs,
    state: settled,
  };
  return JSON.stringify(payload);
}

/**
 * Restores a mid-game session after a page refresh into a safe PAUSED state
 * with exact remaining times preserved.
 */
export function restoreMatchFromStorage(
  rawJson: string | null
): ClockState | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as PersistedMatchSnapshot;
    if (!parsed || parsed.version !== 1 || !parsed.state) return null;
    const s = parsed.state;
    if (
      typeof s.p1TimeMs !== 'number' ||
      typeof s.p2TimeMs !== 'number' ||
      !Number.isFinite(s.p1TimeMs) ||
      !Number.isFinite(s.p2TimeMs) ||
      !['idle', 'running', 'paused', 'flagged'].includes(s.status)
    ) {
      return null;
    }

    // Settle up to the moment the snapshot was saved, then place running games into PAUSED state
    const settledAtSave =
      s.status === 'running' && typeof parsed.savedAtMs === 'number' && Number.isFinite(parsed.savedAtMs)
        ? getEffectiveClockState(s, parsed.savedAtMs)
        : s;

    if (settledAtSave.status === 'running') {
      return {
        ...settledAtSave,
        status: 'paused',
        turnStartedAtMs: null,
        activeTurnInitialRemainingMs:
          settledAtSave.activePlayer === 'p1'
            ? settledAtSave.p1TimeMs
            : settledAtSave.p2TimeMs,
        elapsedBeforeTurnMs: settledAtSave.elapsedMatchMs,
      };
    }

    return {
      ...settledAtSave,
      turnStartedAtMs: null,
    };
  } catch {
    return null;
  }
}
