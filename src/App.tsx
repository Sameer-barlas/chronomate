import React, { useEffect, useState, useCallback } from 'react';
import {
  Play,
  BookmarkPlus,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
} from './components/Icons';
import {
  QUICK_PRESETS,
  MatchConfig,
  ClockState,
  MatchHistoryRecord,
  MAX_NAME_LENGTH,
  createInitialClockState,
  startClock,
  validateCustomConfig,
  formatClockTime,
  serializeMatchForStorage,
  restoreMatchFromStorage,
} from './utils/chessClockEngine';
import { ClockArena } from './components/ClockArena';
import { PWAInstallButton } from './components/PWAInstallButton';
import { playClockSwitchClick } from './utils/soundEffects';

const SAVED_PRESETS_KEY = 'chronomate_saved_presets_v1';
const MATCH_HISTORY_KEY = 'chronomate_match_history_v1';
const ACTIVE_MATCH_KEY = 'chronomate_active_match_v1';
const ROTATION_PREF_KEY = 'chronomate_tabletop_rotated_v1';
const SOUND_PREF_KEY = 'chronomate_sound_enabled_v1';
const LAST_PRESET_ID_KEY = 'chronomate_last_preset_id_v1';

function safeGetStorage(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore private mode / quota errors
  }
}

export default function App() {
  const [savedCustomPresets, setSavedCustomPresets] = useState<MatchConfig[]>(() => {
    try {
      const raw = safeGetStorage(SAVED_PRESETS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [matchHistory, setMatchHistory] = useState<MatchHistoryRecord[]>(() => {
    try {
      const raw = safeGetStorage(MATCH_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Restore mid-game match if refreshed while active/paused
  const [initialRestoredMatch] = useState<ClockState | null>(() => {
    return restoreMatchFromStorage(safeGetStorage(ACTIVE_MATCH_KEY));
  });

  const [activeView, setActiveView] = useState<'setup' | 'clock'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('autostart') === '1') {
          return 'clock';
        }
      } catch {
        // Ignore URL parsing errors
      }
    }
    if (
      initialRestoredMatch &&
      (initialRestoredMatch.status === 'paused' || initialRestoredMatch.status === 'flagged')
    ) {
      return 'clock';
    }
    return 'setup';
  });

  const [lastPresetId, setLastPresetId] = useState<string>(() => {
    return safeGetStorage(LAST_PRESET_ID_KEY) || QUICK_PRESETS[1].id;
  });

  const [clockState, setClockState] = useState<ClockState>(() => {
    if (initialRestoredMatch) {
      return initialRestoredMatch;
    }
    const savedPresetId = safeGetStorage(LAST_PRESET_ID_KEY);
    const foundPreset = savedPresetId ? QUICK_PRESETS.find((p) => p.id === savedPresetId) : null;
    return createInitialClockState(foundPreset || QUICK_PRESETS[1]);
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const raw = safeGetStorage(SOUND_PREF_KEY);
    return raw !== null ? raw === 'true' : true;
  });

  const [tabletopRotated, setTabletopRotated] = useState<boolean>(() => {
    const raw = safeGetStorage(ROTATION_PREF_KEY);
    return raw !== null ? raw === 'true' : true;
  });

  const [instantStartOnPresetClick, setInstantStartOnPresetClick] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Blitz' | 'Rapid' | 'Classical' | 'Bullet'>('All');

  // Custom Configurator State
  const [p1Name, setP1Name] = useState<string>('');
  const [p2Name, setP2Name] = useState<string>('');
  const [isAsymmetric, setIsAsymmetric] = useState<boolean>(false);
  const [p1Minutes, setP1Minutes] = useState<string>('10');
  const [p1Seconds, setP1Seconds] = useState<string>('0');
  const [p1Increment, setP1Increment] = useState<string>('0');
  const [p2Minutes, setP2Minutes] = useState<string>('5');
  const [p2Seconds, setP2Seconds] = useState<string>('0');
  const [p2Increment, setP2Increment] = useState<string>('0');
  const [configError, setConfigError] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    safeSetStorage(SAVED_PRESETS_KEY, JSON.stringify(savedCustomPresets));
  }, [savedCustomPresets]);

  useEffect(() => {
    safeSetStorage(MATCH_HISTORY_KEY, JSON.stringify(matchHistory));
  }, [matchHistory]);

  useEffect(() => {
    safeSetStorage(SOUND_PREF_KEY, String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    safeSetStorage(ROTATION_PREF_KEY, String(tabletopRotated));
  }, [tabletopRotated]);

  // Persist active/paused match state for safe restoration on page refresh
  useEffect(() => {
    if (activeView !== 'clock' || clockState.status === 'idle') {
      safeSetStorage(ACTIVE_MATCH_KEY, null);
      return;
    }
    safeSetStorage(ACTIVE_MATCH_KEY, serializeMatchForStorage(clockState, Date.now()));
  }, [activeView, clockState]);

  useEffect(() => {
    const handlePageHide = () => {
      if (activeView === 'clock' && clockState.status !== 'idle') {
        safeSetStorage(ACTIVE_MATCH_KEY, serializeMatchForStorage(clockState, Date.now()));
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [activeView, clockState]);

  const handleLaunchPreset = (preset: MatchConfig, forceImmediateRun = false) => {
    safeSetStorage(LAST_PRESET_ID_KEY, preset.id);
    setLastPresetId(preset.id);
    const cleanP1 = p1Name.trim().slice(0, MAX_NAME_LENGTH);
    const cleanP2 = p2Name.trim().slice(0, MAX_NAME_LENGTH);
    const effectiveConfig: MatchConfig = {
      ...preset,
      p1: {
        ...preset.p1,
        name: cleanP1 || preset.p1.name,
      },
      p2: {
        ...preset.p2,
        name: cleanP2 || preset.p2.name,
      },
    };

    let nextState = createInitialClockState(effectiveConfig);
    if (instantStartOnPresetClick || forceImmediateRun) {
      playClockSwitchClick('p1', soundEnabled);
      nextState = startClock(nextState, 'p1', Date.now());
    }
    setClockState(nextState);
    setActiveView('clock');
  };

  const parseCustomFields = () => {
    if (
      p1Minutes.trim() === '' ||
      p1Seconds.trim() === '' ||
      p1Increment.trim() === '' ||
      (isAsymmetric &&
        (p2Minutes.trim() === '' || p2Seconds.trim() === '' || p2Increment.trim() === ''))
    ) {
      return { valid: false as const, error: 'Please fill in all minutes, seconds, and increment fields.' };
    }
    return validateCustomConfig({
      p1Name,
      p2Name,
      isAsymmetric,
      p1Minutes: Number(p1Minutes),
      p1Seconds: Number(p1Seconds),
      p1Increment: Number(p1Increment),
      p2Minutes: Number(p2Minutes),
      p2Seconds: Number(p2Seconds),
      p2Increment: Number(p2Increment),
    });
  };

  const handleStartCustomMatch = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError(null);
    const validation = parseCustomFields();

    if (!validation.valid || !validation.config) {
      setConfigError(validation.error ?? 'Invalid custom timer configuration.');
      return;
    }

    const initialState = createInitialClockState(validation.config);
    setClockState(initialState);
    setActiveView('clock');
  };

  const handleSaveCustomPreset = () => {
    setConfigError(null);
    const validation = parseCustomFields();

    if (!validation.valid || !validation.config) {
      setConfigError(validation.error ?? 'Invalid custom timer configuration.');
      return;
    }

    setSavedCustomPresets((prev) => [validation.config!, ...prev.slice(0, 5)]);
    setSavedFeedback(`Saved "${validation.config.label}" to Quick Presets.`);
    setTimeout(() => setSavedFeedback(null), 3000);
  };

  const handleDeleteCustomPreset = (id: string) => {
    setSavedCustomPresets((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMatchFlagged = useCallback((finalState: ClockState) => {
    const winnerName =
      finalState.winner === 'p1' ? finalState.p1Name : finalState.p2Name;
    const newRecord: MatchHistoryRecord = {
      id: `match-${Date.now()}`,
      playedAt: 'Completed · OTB Match',
      label: finalState.label,
      p1Name: finalState.p1Name,
      p2Name: finalState.p2Name,
      p1RemainingMs: finalState.p1TimeMs,
      p2RemainingMs: finalState.p2TimeMs,
      totalMoves: finalState.p1Moves + finalState.p2Moves,
      outcome: `${winnerName} won on time`,
    };
    setMatchHistory((prev) => [newRecord, ...prev.slice(0, 19)]);
  }, []);

  const allPresets = [...QUICK_PRESETS, ...savedCustomPresets];
  const filteredPresets =
    categoryFilter === 'All'
      ? allPresets
      : allPresets.filter((p) => p.category === categoryFilter);

  if (activeView === 'clock') {
    return (
      <ClockArena
        clockState={clockState}
        setClockState={setClockState}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        tabletopRotated={tabletopRotated}
        setTabletopRotated={setTabletopRotated}
        onExitToSetup={() => {
          safeSetStorage(ACTIVE_MATCH_KEY, null);
          setActiveView('setup');
        }}
        onMatchFlagged={handleMatchFlagged}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-4 sm:px-8 py-4 border-b border-slate-800/80 bg-slate-950 sticky top-0 z-30">
        {/* Zone 1: Single text element Brand wordmark */}
        <a
          href="#top"
          className="text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display uppercase"
        >
          ChronoMate
        </a>

        {/* Zone 2: Concise single-line text navigation links */}
        <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <a
            href="#quick-presets"
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Quick Presets
          </a>
          <a
            href="#custom-setup"
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Custom Setup
          </a>
          <a
            href="#match-log"
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Match Log
          </a>
        </nav>

        {/* Zone 3: 1 primary action (>= 48x48px) */}
        <div className="flex items-center gap-3 shrink-0">
          {(() => {
            const activePreset = allPresets.find((p) => p.id === lastPresetId) || QUICK_PRESETS[1];
            return (
              <button
                type="button"
                data-testid="header-launch-preset"
                onClick={() => handleLaunchPreset(activePreset, false)}
                className="min-h-[48px] min-w-[48px] px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-950 bg-amber-400 rounded-xl hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0"
              >
                Launch {activePreset.label} Clock
              </button>
            );
          })()}
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main id="top" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-10">
        {/* COMPACT HERO BAR */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-800/80">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-medium text-amber-400 tracking-wide">
              Over-The-Board Tournament Timer · Zero-Latency Touch Engine
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase text-balance">
              Physical Chess Clock in Your Pocket
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Tap a preset below to open the tabletop clock in one tap—or configure custom player names, Fischer increments, and time odds for home and club matches.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PWAInstallButton />
          </div>
        </section>

        {/* PRIMARY WORKSPACE: 12-COLUMN SPLIT ON DESKTOP, STACKED THUMB-ERGONOMIC ON MOBILE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT 7 COLUMNS: NORMAN'S RULE 1-TAP QUICK START PRESETS */}
          <section
            id="quick-presets"
            aria-labelledby="quick-start-heading"
            className="lg:col-span-7 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 id="quick-start-heading" className="text-xl font-semibold text-white">
                  01. Quick-Start Time Controls
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  One tap loads the full-screen clock (5m, 10m, 15m, 30m, or increments).
                </p>
              </div>

              {/* Interactive Category Filter Segmented Control (all buttons >= 48px high) */}
              <div
                role="group"
                aria-label="Filter Presets by Time Category"
                className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl self-start"
              >
                {(['All', 'Blitz', 'Rapid', 'Classical', 'Bullet'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`min-h-[48px] min-w-[48px] px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      categoryFilter === cat
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Instant-Run Preference Toggle */}
            <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl bg-slate-900/70 border border-slate-800/90">
              <div className="text-xs sm:text-sm">
                <span className="font-medium text-slate-200">Start White&apos;s clock immediately on preset tap</span>
                <span className="block text-slate-400 text-xs">
                  {instantStartOnPresetClick
                    ? 'Enabled: tapping 5 min or 10 min begins ticking immediately.'
                    : 'Default: opens the clock screen ready for first move or Start press.'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={instantStartOnPresetClick}
                aria-label="Start White's clock immediately on preset tap"
                onClick={() => setInstantStartOnPresetClick((prev) => !prev)}
                className={`min-h-[48px] min-w-[48px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  instantStartOnPresetClick
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {instantStartOnPresetClick ? 'Instant Run: ON' : 'Instant Run: OFF'}
              </button>
            </div>

            {/* Preset Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-3.5">
              {filteredPresets.map((preset) => {
                const isCustomSaved = preset.id.startsWith('custom-');
                return (
                  <div
                    key={preset.id}
                    className="group relative rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-400/70 transition-colors flex flex-col justify-between p-4 sm:p-5"
                  >
                    <button
                      type="button"
                      data-testid={`preset-${preset.id}`}
                      onClick={() => handleLaunchPreset(preset, false)}
                      className="text-left w-full min-h-[84px] flex-1 flex flex-col justify-between gap-3 focus-visible:outline-none"
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap truncate">
                          {preset.category}
                          <span aria-hidden="true"> · </span>
                          {preset.p1.incrementSeconds > 0
                            ? `+${preset.p1.incrementSeconds}s inc`
                            : 'Standard'}
                        </span>
                        <Play className="w-4 h-4 text-amber-400 opacity-80 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </div>

                      <div>
                        <div className="clock-digits text-2xl sm:text-3xl font-bold text-white group-hover:text-amber-300 transition-colors">
                          {preset.label}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 truncate">
                          {preset.isAsymmetric
                            ? `${preset.p1.name} vs ${preset.p2.name}`
                            : `${preset.p1.minutes}:00 each side`}
                        </div>
                      </div>
                    </button>

                    {isCustomSaved && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                        <span>Saved Custom</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomPreset(preset.id)}
                          aria-label={`Delete saved preset ${preset.label}`}
                          className="min-h-[48px] min-w-[48px] px-2 text-rose-400 hover:text-rose-300 flex items-center justify-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* RIGHT 5 COLUMNS: DETAILED PLAYER & CUSTOM TIME CONFIGURATOR */}
          <section
            id="custom-setup"
            aria-labelledby="custom-config-heading"
            className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 space-y-6"
          >
            <div>
              <h2 id="custom-config-heading" className="text-xl font-semibold text-white">
                02. Custom Match & Player Setup
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Configure player names (max 16 chars) and equal or asymmetric time odds.
              </p>
            </div>

            <form onSubmit={handleStartCustomMatch} noValidate className="space-y-5">
              {/* Player Names */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-300">
                  Player Names (Optional · Max {MAX_NAME_LENGTH} chars)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="input-p1-name" className="block text-xs text-slate-400 mb-1">
                      Player 1 (White)
                    </label>
                    <input
                      id="input-p1-name"
                      type="text"
                      maxLength={MAX_NAME_LENGTH}
                      placeholder="Player 1 (White)"
                      value={p1Name}
                      onChange={(e) => setP1Name(e.target.value)}
                      className="w-full h-12 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="input-p2-name" className="block text-xs text-slate-400 mb-1">
                      Player 2 (Black)
                    </label>
                    <input
                      id="input-p2-name"
                      type="text"
                      maxLength={MAX_NAME_LENGTH}
                      placeholder="Player 2 (Black)"
                      value={p2Name}
                      onChange={(e) => setP2Name(e.target.value)}
                      className="w-full h-12 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Symmetric vs Asymmetric Time Mode */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-300">
                  Time Allocation Mode
                </span>
                <div
                  role="group"
                  aria-label="Time Allocation Mode"
                  className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl"
                >
                  <button
                    type="button"
                    onClick={() => setIsAsymmetric(false)}
                    className={`min-h-[48px] px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      !isAsymmetric
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Same Time for Both
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAsymmetric(true)}
                    className={`min-h-[48px] px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      isAsymmetric
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Custom per Player (Odds)
                  </button>
                </div>
              </div>

              {/* Player 1 (or Shared) Time Inputs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-semibold">
                    {isAsymmetric ? 'Player 1 (White) Clock' : 'Clock Time per Player'}
                  </span>
                  <span className="text-slate-400 font-mono tabular-nums">
                    {Number(p1Minutes) || 0}m {Number(p1Seconds) || 0}s +{Number(p1Increment) || 0}s
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label htmlFor="p1-min" className="block text-xs text-slate-400 mb-1">
                      Minutes
                    </label>
                    <input
                      id="p1-min"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={180}
                      value={p1Minutes}
                      onChange={(e) => setP1Minutes(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="p1-sec" className="block text-xs text-slate-400 mb-1">
                      Seconds
                    </label>
                    <input
                      id="p1-sec"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      value={p1Seconds}
                      onChange={(e) => setP1Seconds(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="p1-inc" className="block text-xs text-slate-400 mb-1">
                      Increment (s)
                    </label>
                    <input
                      id="p1-inc"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={60}
                      value={p1Increment}
                      onChange={(e) => setP1Increment(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Player 2 Time Inputs (shown when Asymmetric / Handicap mode is active) */}
              {isAsymmetric && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold">Player 2 (Black) Clock</span>
                    <span className="text-slate-400 font-mono tabular-nums">
                      {Number(p2Minutes) || 0}m {Number(p2Seconds) || 0}s +{Number(p2Increment) || 0}s
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label htmlFor="p2-min" className="block text-xs text-slate-400 mb-1">
                        Black Minutes
                      </label>
                      <input
                        id="p2-min"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={180}
                        value={p2Minutes}
                        onChange={(e) => setP2Minutes(e.target.value)}
                        className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label htmlFor="p2-sec" className="block text-xs text-slate-400 mb-1">
                        Black Seconds
                      </label>
                      <input
                        id="p2-sec"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={59}
                        value={p2Seconds}
                        onChange={(e) => setP2Seconds(e.target.value)}
                        className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label htmlFor="p2-inc" className="block text-xs text-slate-400 mb-1">
                        Black Inc (s)
                      </label>
                      <input
                        id="p2-inc"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={60}
                        value={p2Increment}
                        onChange={(e) => setP2Increment(e.target.value)}
                        className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Validation Error or Save Feedback */}
              {configError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{configError}</span>
                </div>
              )}

              {savedFeedback && (
                <div
                  role="status"
                  className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 text-xs flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{savedFeedback}</span>
                </div>
              )}

              {/* Action Buttons (>= 48x48px) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <button
                  type="submit"
                  data-testid="start-custom-match"
                  className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Clock className="w-4 h-4" />
                  <span>Start Custom Match</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomPreset}
                  className="min-h-[48px] px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <BookmarkPlus className="w-4 h-4 text-amber-400" />
                  <span>Save Preset</span>
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* SECTION 03: LOCAL MATCH LOG (OFFLINE PERSISTENCE) */}
        <section
          id="match-log"
          aria-labelledby="match-log-heading"
          className="pt-6 border-t border-slate-800/80 space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="match-log-heading" className="text-lg font-semibold text-white">
                03. Completed Match Log
              </h2>
              <p className="text-xs text-slate-400">
                Recorded locally on your device when a match concludes on time.
              </p>
            </div>
            {matchHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setMatchHistory([])}
                className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Clear Log
              </button>
            )}
          </div>

          {matchHistory.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/80 text-center text-xs sm:text-sm text-slate-400">
              No completed time-control matches recorded yet. Start any clock above to track match outcomes offline.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {matchHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
                      <span>{item.playedAt}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-amber-400">{item.label}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.totalMoves} moves</span>
                    </div>
                    <div className="text-sm font-semibold text-white truncate">
                      {item.p1Name} vs {item.p2Name}
                    </div>
                    <div className="text-xs text-emerald-400 font-medium">
                      {item.outcome}
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs text-slate-300 shrink-0 space-y-0.5 tabular-nums">
                    <div>W: {formatClockTime(item.p1RemainingMs).main}</div>
                    <div>B: {formatClockTime(item.p2RemainingMs).main}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* QUIET FOOTER */}
      <footer className="mt-auto border-t border-slate-900 px-4 sm:px-8 py-6 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl w-full mx-auto">
        <div>
          ChronoMate Chess Clock · 100% offline-capable static build.
        </div>
      </footer>
    </div>
  );
}
