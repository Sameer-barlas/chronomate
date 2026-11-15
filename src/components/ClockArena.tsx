import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  ArrowLeft,
  FlipVertical2,
  Trophy,
  AlertTriangle,
  Clock,
  Maximize2,
  Minimize2,
} from './Icons';
import {
  ClockState,
  PlayerId,
  FormattedClockTime,
  formatClockTime,
  pressClockPad,
  startClock,
  togglePauseClock,
  pauseClock,
  resumeClock,
  resetClock,
  adjustPlayerTime,
  tickClockAt,
} from '../utils/chessClockEngine';
import { playClockSwitchClick, playFlagBuzzer } from '../utils/soundEffects';

interface ClockPadProps {
  player: PlayerId;
  name: string;
  sideLabel: 'White' | 'Black';
  moves: number;
  incrementMs: number;
  matchLabel: string;
  formatted: FormattedClockTime;
  isActive: boolean;
  isInteractive: boolean;
  isFlagged: boolean;
  isWinner: boolean;
  statusLabel: string;
  rotated: boolean;
  testId: string;
  nameTestId: string;
  timeTestId: string;
  onPointerDownPad: (e: React.PointerEvent<HTMLButtonElement>, player: PlayerId) => void;
  onClickPad: (e: React.MouseEvent<HTMLButtonElement>, player: PlayerId) => void;
}

const ClockPad = React.memo<ClockPadProps>(
  ({
    player,
    name,
    sideLabel,
    moves,
    incrementMs,
    matchLabel,
    formatted,
    isActive,
    isInteractive,
    isFlagged,
    isWinner,
    statusLabel,
    rotated,
    testId,
    nameTestId,
    timeTestId,
    onPointerDownPad,
    onClickPad,
  }) => {
    let surfaceClasses = 'bg-slate-900 text-slate-200 border border-slate-800';
    if (isFlagged) {
      surfaceClasses = 'bg-rose-950 text-rose-100 border-2 border-rose-500';
    } else if (isWinner) {
      surfaceClasses = 'bg-emerald-950 text-emerald-100 border-2 border-emerald-500';
    } else if (isActive) {
      surfaceClasses = formatted.isLowTime
        ? 'bg-amber-500 text-slate-950 border-2 border-amber-200'
        : 'bg-amber-400 text-slate-950 border-2 border-amber-200';
    }

    const activeFeedbackClass = isInteractive
      ? 'active:scale-[0.992] cursor-pointer'
      : 'cursor-default';

    return (
      <button
        type="button"
        aria-label={`${name} Clock Pad (${formatted.main}${formatted.tenths ?? ''})`}
        data-testid={testId}
        onPointerDown={(e) => onPointerDownPad(e, player)}
        onClick={(e) => onClickPad(e, player)}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative flex-1 min-h-0 rounded-2xl sm:rounded-3xl p-4 sm:p-8 flex flex-col justify-between transition-transform duration-75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 ${surfaceClasses} ${activeFeedbackClass} ${
          rotated ? 'rotate-180 lg:rotate-0' : ''
        }`}
      >
        {/* Top Metadata Row */}
        <div className="w-full flex items-center justify-between gap-3 text-xs sm:text-sm font-medium">
          <div className="flex items-center gap-2 truncate">
            <span
              className={`inline-block w-3 h-3 rounded-sm border border-slate-500 shrink-0 ${
                sideLabel === 'White' ? 'bg-white' : 'bg-slate-950'
              }`}
            />
            <span className="font-semibold truncate text-base sm:text-lg" data-testid={nameTestId}>
              {name}
            </span>
            <span aria-hidden="true">·</span>
            <span className="opacity-85">{sideLabel}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 tabular-nums">
            <span>Moves: {moves}</span>
            {incrementMs > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>+{incrementMs / 1000}s</span>
              </>
            )}
          </div>
        </div>

        {/* Center Giant Tabular Digits */}
        <div className="my-auto flex items-baseline justify-center">
          <span
            data-testid={timeTestId}
            className="clock-digits font-bold text-[clamp(3.75rem,16vw,9rem)] lg:text-[clamp(4.5rem,9vw,8.5rem)] leading-none tracking-tight"
          >
            {formatted.main}
          </span>
          {formatted.tenths && (
            <span className="clock-digits font-bold text-[clamp(1.75rem,6.5vw,3.75rem)] leading-none opacity-85 ml-1">
              {formatted.tenths}
            </span>
          )}
        </div>

        {/* Bottom Status Bar */}
        <div className="w-full flex items-center justify-between gap-2 text-xs sm:text-sm font-semibold tracking-wide">
          <span className="flex items-center gap-1.5 truncate">
            {isFlagged && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {isWinner && <Trophy className="w-4 h-4 shrink-0" />}
            {statusLabel}
          </span>
          <span className="opacity-80 shrink-0">{matchLabel}</span>
        </div>
      </button>
    );
  }
);

ClockPad.displayName = 'ClockPad';

interface ClockArenaProps {
  clockState: ClockState;
  setClockState: React.Dispatch<React.SetStateAction<ClockState>>;
  soundEnabled: boolean;
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  tabletopRotated: boolean;
  setTabletopRotated: React.Dispatch<React.SetStateAction<boolean>>;
  onExitToSetup: () => void;
  onMatchFlagged: (finalState: ClockState) => void;
}

export const ClockArena: React.FC<ClockArenaProps> = ({
  clockState,
  setClockState,
  soundEnabled,
  setSoundEnabled,
  tabletopRotated,
  setTabletopRotated,
  onExitToSetup,
  onMatchFlagged,
}) => {
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'reset' | 'exit' | null>(null);
  const [adjustP1Min, setAdjustP1Min] = useState(0);
  const [adjustP1Sec, setAdjustP1Sec] = useState(0);
  const [adjustP2Min, setAdjustP2Min] = useState(0);
  const [adjustP2Sec, setAdjustP2Sec] = useState(0);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const flaggedNotifiedRef = useRef<boolean>(false);
  const activePointerIdRef = useRef<number | null>(null);
  const lastPointerDownTimeRef = useRef<number>(0);

  // Detect Fullscreen API support safely
  useEffect(() => {
    try {
      const doc = document as Document & { webkitFullscreenEnabled?: boolean };
      const supported = Boolean(
        typeof document !== 'undefined' &&
          (doc.fullscreenEnabled || doc.webkitFullscreenEnabled)
      );
      setCanFullscreen(supported);

      const handleFsChange = () => {
        try {
          setIsFullscreen(Boolean(document.fullscreenElement));
        } catch {
          // Ignore
        }
      };
      document.addEventListener('fullscreenchange', handleFsChange);
      return () => document.removeEventListener('fullscreenchange', handleFsChange);
    } catch {
      setCanFullscreen(false);
    }
  }, []);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen();
      }
    } catch {
      // Fail silently if blocked by environment
    }
  };

  // Screen Wake Lock while clock is running; re-acquire on visibilitychange
  useEffect(() => {
    let wakeLockSentinel: { release: () => Promise<void> } | null = null;
    let isMounted = true;

    const acquireWakeLock = async () => {
      if (!isMounted || clockState.status !== 'running') return;
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
        };
        if (nav.wakeLock && typeof nav.wakeLock.request === 'function') {
          wakeLockSentinel = await nav.wakeLock.request('screen');
        }
      } catch {
        // Fail silently if unsupported or disallowed
      }
    };

    if (clockState.status === 'running') {
      acquireWakeLock();
    }

    const handleVisibilityChange = () => {
      try {
        if (document.visibilityState === 'visible') {
          if (clockState.status === 'running') {
            setClockState((prev) => tickClockAt(prev, Date.now()));
            acquireWakeLock();
          }
        }
      } catch {
        // Ignore
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [clockState.status, setClockState]);

  // Trigger single flag event when status reaches 'flagged'
  useEffect(() => {
    if (clockState.status !== 'flagged') {
      flaggedNotifiedRef.current = false;
    } else if (!flaggedNotifiedRef.current) {
      flaggedNotifiedRef.current = true;
      playFlagBuzzer(soundEnabled);
      onMatchFlagged(clockState);
    }
  }, [clockState, soundEnabled, onMatchFlagged]);

  // High-precision timestamp loop that updates React DOM ONLY when displayed text or status changes
  useEffect(() => {
    if (clockState.status !== 'running') {
      return;
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setClockState((prev) => {
        if (prev.status !== 'running') return prev;
        const next = tickClockAt(prev, now);
        if (next.status !== prev.status) {
          return next;
        }
        const prevP1 = formatClockTime(prev.p1TimeMs);
        const nextP1 = formatClockTime(next.p1TimeMs);
        const prevP2 = formatClockTime(prev.p2TimeMs);
        const nextP2 = formatClockTime(next.p2TimeMs);

        if (
          prevP1.main !== nextP1.main ||
          prevP1.tenths !== nextP1.tenths ||
          prevP2.main !== nextP2.main ||
          prevP2.tenths !== nextP2.tenths
        ) {
          return next;
        }
        return prev;
      });
    }, 30);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [clockState.status, setClockState]);

  const handleRequestReset = useCallback(() => {
    if (clockState.status === 'running') {
      setClockState((prev) => pauseClock(prev, Date.now()));
      setConfirmAction('reset');
      return;
    }
    setConfirmAction(null);
    setClockState((prev) => resetClock(prev));
  }, [clockState.status, setClockState]);

  const handleRequestExit = useCallback(() => {
    if (clockState.status === 'running') {
      setClockState((prev) => pauseClock(prev, Date.now()));
      setConfirmAction('exit');
      return;
    }
    setConfirmAction(null);
    onExitToSetup();
  }, [clockState.status, setClockState, onExitToSetup]);

  // Desktop keyboard support: Space passes turn, P pauses/resumes, R resets
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showAdjustModal || confirmAction) return;
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        const now = Date.now();
        setClockState((prev) => {
          if (prev.status === 'idle') {
            playClockSwitchClick('p1', soundEnabled);
            return startClock(prev, 'p1', now);
          }
          if (prev.status === 'running' && prev.activePlayer) {
            const next = pressClockPad(prev, prev.activePlayer, now);
            if (next !== prev) {
              playClockSwitchClick(prev.activePlayer, soundEnabled);
            }
            return next;
          }
          return prev;
        });
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setClockState((prev) => togglePauseClock(prev, Date.now()));
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRequestReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAdjustModal, confirmAction, setClockState, soundEnabled, handleRequestReset]);

  // Release pointer lock on pointerup/pointercancel
  useEffect(() => {
    const clearPointer = (e: PointerEvent) => {
      if (activePointerIdRef.current === e.pointerId) {
        activePointerIdRef.current = null;
      }
    };
    window.addEventListener('pointerup', clearPointer);
    window.addEventListener('pointercancel', clearPointer);
    return () => {
      window.removeEventListener('pointerup', clearPointer);
      window.removeEventListener('pointercancel', clearPointer);
    };
  }, []);

  const triggerPadSwitch = useCallback(
    (player: PlayerId) => {
      const now = Date.now();
      setClockState((prev) => {
        if (prev.status === 'flagged' || prev.status === 'paused') {
          return prev;
        }
        if (prev.status === 'running' && prev.activePlayer !== player) {
          // Ignore inactive pad with zero feedback
          return prev;
        }
        const next = pressClockPad(prev, player, now);
        if (next !== prev) {
          playClockSwitchClick(player, soundEnabled);
        }
        return next;
      });
    },
    [setClockState, soundEnabled]
  );

  const handlePointerDownPad = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, player: PlayerId) => {
      // Ignore non-primary mouse buttons or multi-touch secondary pointers
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) {
        return;
      }
      if (
        activePointerIdRef.current !== null &&
        activePointerIdRef.current !== e.pointerId
      ) {
        return;
      }
      activePointerIdRef.current = e.pointerId;
      lastPointerDownTimeRef.current = Date.now();
      triggerPadSwitch(player);
    },
    [triggerPadSwitch]
  );

  const handleClickPad = useCallback(
    (_e: React.MouseEvent<HTMLButtonElement>, player: PlayerId) => {
      // If pointerdown already handled this physical interaction within 450ms, skip synthetic click
      if (Date.now() - lastPointerDownTimeRef.current < 450) {
        return;
      }
      triggerPadSwitch(player);
    },
    [triggerPadSwitch]
  );

  const openAdjustTimeModal = () => {
    const now = Date.now();
    const settled = tickClockAt(clockState, now);
    setClockState(settled.status === 'running' ? pauseClock(settled, now) : settled);
    const p1TotalSec = Math.ceil(settled.p1TimeMs / 1000);
    const p2TotalSec = Math.ceil(settled.p2TimeMs / 1000);
    setAdjustP1Min(Math.floor(p1TotalSec / 60));
    setAdjustP1Sec(p1TotalSec % 60);
    setAdjustP2Min(Math.floor(p2TotalSec / 60));
    setAdjustP2Sec(p2TotalSec % 60);
    setAdjustError(null);
    setShowAdjustModal(true);
  };

  const handleSaveAdjustedTime = (e: React.FormEvent) => {
    e.preventDefault();
    const m1 = Math.floor(Number(adjustP1Min));
    const s1 = Math.floor(Number(adjustP1Sec));
    const m2 = Math.floor(Number(adjustP2Min));
    const s2 = Math.floor(Number(adjustP2Sec));

    if (
      !Number.isFinite(m1) ||
      !Number.isFinite(s1) ||
      !Number.isFinite(m2) ||
      !Number.isFinite(s2) ||
      m1 < 0 ||
      s1 < 0 ||
      m2 < 0 ||
      s2 < 0 ||
      s1 > 59 ||
      s2 > 59
    ) {
      setAdjustError('Enter valid minutes (0–180) and seconds (0–59).');
      return;
    }

    const nextP1Ms = (m1 * 60 + s1) * 1000;
    const nextP2Ms = (m2 * 60 + s2) * 1000;
    if (nextP1Ms < 1000 || nextP2Ms < 1000 || nextP1Ms > 10_800_000 || nextP2Ms > 10_800_000) {
      setAdjustError('Remaining time must be between 1 second and 180 minutes.');
      return;
    }

    const now = Date.now();
    setClockState((prev) => {
      const step1 = adjustPlayerTime(prev, 'p1', nextP1Ms, now);
      return adjustPlayerTime(step1, 'p2', nextP2Ms, now);
    });
    setShowAdjustModal(false);
  };

  const p1Formatted = formatClockTime(clockState.p1TimeMs);
  const p2Formatted = formatClockTime(clockState.p2TimeMs);

  const p1IsActive = clockState.status === 'running' && clockState.activePlayer === 'p1';
  const p2IsActive = clockState.status === 'running' && clockState.activePlayer === 'p2';
  const p1IsFlagged = clockState.status === 'flagged' && clockState.flaggedPlayer === 'p1';
  const p2IsFlagged = clockState.status === 'flagged' && clockState.flaggedPlayer === 'p2';
  const p1IsWinner = clockState.status === 'flagged' && clockState.winner === 'p1';
  const p2IsWinner = clockState.status === 'flagged' && clockState.winner === 'p2';

  const getPadStatusLabel = (
    player: PlayerId,
    isActive: boolean,
    isFlagged: boolean,
    isWinner: boolean
  ) => {
    if (isFlagged) return 'FLAGGED · TIME EXPIRED';
    if (isWinner) return 'WINNER ON TIME';
    if (clockState.status === 'paused') {
      return clockState.activePlayer === player
        ? 'PAUSED · YOUR TURN ON RESUME'
        : 'PAUSED · WAITING';
    }
    if (clockState.status === 'idle') {
      return player === 'p1'
        ? 'READY · TAP PAD AFTER MOVE 1 OR PRESS START'
        : 'READY · TAP PAD TO START WHITE CLOCK';
    }
    return isActive
      ? 'ACTIVE TURN · TAP PAD TO END MOVE'
      : 'WAITING FOR OPPONENT MOVE';
  };

  const liveAnnouncement =
    clockState.status === 'flagged'
      ? `Time's up. ${clockState.winner === 'p1' ? clockState.p1Name : clockState.p2Name} won on time.`
      : clockState.status === 'paused'
      ? 'Clock paused.'
      : '';

  return (
    <section
      aria-label="Over-The-Board Chess Clock Arena"
      data-testid="clock-arena"
      data-clock-status={clockState.status}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-40 bg-slate-950 flex flex-col lg:flex-row overflow-hidden gap-2 sm:gap-3 clock-screen-lock"
    >
      {/* Polite Live Region for Paused / Flagged state announcements */}
      <div aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* PLAYER 2 PAD (Top on Mobile/Tablet, Left on Desktop) */}
      <ClockPad
        player="p2"
        name={clockState.p2Name}
        sideLabel="Black"
        moves={clockState.p2Moves}
        incrementMs={clockState.p2IncrementMs}
        matchLabel={clockState.label}
        formatted={p2Formatted}
        isActive={p2IsActive}
        isInteractive={clockState.status === 'idle' || p2IsActive}
        isFlagged={p2IsFlagged}
        isWinner={p2IsWinner}
        statusLabel={getPadStatusLabel('p2', p2IsActive, p2IsFlagged, p2IsWinner)}
        rotated={tabletopRotated}
        testId="pad-p2"
        nameTestId="p2-name"
        timeTestId="p2-time"
        onPointerDownPad={handlePointerDownPad}
        onClickPad={handleClickPad}
      />

      {/* CENTER HARDWARE CONTROL STRIP (Fits 360px+ viewports cleanly with >= 48px height) */}
      <div
        role="toolbar"
        aria-label="Chess Clock Controls"
        className="bg-slate-900 border border-slate-800 rounded-2xl px-1.5 py-1.5 sm:px-4 sm:py-2.5 flex lg:flex-col items-center justify-between gap-1 sm:gap-2 shrink-0 lg:w-28"
      >
        {/* Back to Presets */}
        <button
          type="button"
          data-testid="clock-back-home"
          onClick={handleRequestExit}
          aria-label="Change Time Control"
          className="min-h-[48px] min-w-[44px] sm:min-w-[48px] px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline lg:hidden">Presets</span>
        </button>

        {/* Primary Start / Pause / Resume / Rematch Control */}
        {clockState.status === 'flagged' ? (
          <button
            type="button"
            data-testid="clock-rematch"
            onClick={() => setClockState((prev) => resetClock(prev))}
            aria-label="Rematch — Reset Clock"
            className="min-h-[48px] min-w-[48px] px-3 sm:px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Rematch</span>
          </button>
        ) : (
          <button
            type="button"
            data-testid="clock-start-pause"
            onClick={() => {
              const now = Date.now();
              setClockState((prev) => {
                if (prev.status === 'idle') {
                  playClockSwitchClick('p1', soundEnabled);
                  return startClock(prev, 'p1', now);
                }
                return togglePauseClock(prev, now);
              });
            }}
            aria-label={
              clockState.status === 'running'
                ? 'Pause Clock'
                : clockState.status === 'paused'
                ? 'Resume Clock'
                : 'Start Clock'
            }
            className={`min-h-[48px] min-w-[48px] px-3 sm:px-4 py-2 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              clockState.status === 'running'
                ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
            }`}
          >
            {clockState.status === 'running' ? (
              <>
                <Pause className="w-4 h-4" />
                <span className="lg:hidden">Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span className="lg:hidden">
                  {clockState.status === 'paused' ? 'Resume' : 'Start'}
                </span>
              </>
            )}
          </button>
        )}

        {/* Reset Clock */}
        <button
          type="button"
          data-testid="clock-reset"
          onClick={handleRequestReset}
          aria-label="Reset Clock"
          className="min-h-[48px] min-w-[44px] sm:min-w-[48px] px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="hidden sm:inline lg:hidden">Reset</span>
        </button>

        {/* Adjust Time (Arbiter Edit) */}
        <button
          type="button"
          data-testid="clock-adjust-time"
          onClick={openAdjustTimeModal}
          aria-label="Adjust Remaining Time"
          className="min-h-[48px] min-w-[44px] sm:min-w-[48px] px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden md:inline lg:hidden">Edit Time</span>
        </button>

        {/* Flip 180 Tabletop Mode (Mobile/Tablet) */}
        <button
          type="button"
          data-testid="rotation-toggle"
          onClick={() => setTabletopRotated((prev) => !prev)}
          aria-label={tabletopRotated ? 'Switch to Upright View' : 'Rotate Top Clock 180 Degrees'}
          className={`lg:hidden min-h-[48px] min-w-[44px] sm:min-w-[48px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            tabletopRotated
              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <FlipVertical2 className="w-4 h-4" />
          <span className="hidden md:inline">180°</span>
        </button>

        {/* Sound Toggle */}
        <button
          type="button"
          data-testid="sound-toggle"
          onClick={() => setSoundEnabled((prev) => !prev)}
          aria-label={soundEnabled ? 'Mute Clock Sound' : 'Enable Clock Sound'}
          className="min-h-[48px] min-w-[44px] sm:min-w-[48px] px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center transition-colors shrink-0"
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-amber-400" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {/* Fullscreen Toggle (Shown only when Fullscreen API is supported) */}
        {canFullscreen && (
          <button
            type="button"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="min-h-[48px] min-w-[44px] sm:min-w-[48px] px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center transition-colors shrink-0"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* PLAYER 1 PAD (Bottom on Mobile/Tablet, Right on Desktop) */}
      <ClockPad
        player="p1"
        name={clockState.p1Name}
        sideLabel="White"
        moves={clockState.p1Moves}
        incrementMs={clockState.p1IncrementMs}
        matchLabel={clockState.label}
        formatted={p1Formatted}
        isActive={p1IsActive}
        isInteractive={clockState.status === 'idle' || p1IsActive}
        isFlagged={p1IsFlagged}
        isWinner={p1IsWinner}
        statusLabel={getPadStatusLabel('p1', p1IsActive, p1IsFlagged, p1IsWinner)}
        rotated={false}
        testId="pad-p1"
        nameTestId="p1-name"
        timeTestId="p1-time"
        onPointerDownPad={handlePointerDownPad}
        onClickPad={handleClickPad}
      />

      {/* PAUSE OVERLAY */}
      {clockState.status === 'paused' && !confirmAction && !showAdjustModal && (
        <div
          data-testid="pause-overlay"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 pointer-events-auto"
        >
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="inline-flex p-3 rounded-2xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
              <Pause className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Clock Paused</h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Tapping the clock pads is disabled while paused.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                data-testid="pause-resume"
                onClick={() => setClockState((prev) => resumeClock(prev, Date.now()))}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Play className="w-4 h-4" />
                <span>Resume Clock</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLAG FALL END SCREEN OVERLAY */}
      {clockState.status === 'flagged' && !confirmAction && !showAdjustModal && (
        <div
          data-testid="flag-end-screen"
          className="fixed inset-0 z-30 bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-4 pointer-events-auto"
        >
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-5 shadow-2xl">
            <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-rose-400 uppercase tracking-widest">
                Flag Fall · Time Expired
              </span>
              <h2 className="text-2xl font-bold text-white">
                {clockState.winner === 'p1' ? clockState.p1Name : clockState.p2Name} Wins!
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                {clockState.flaggedPlayer === 'p1' ? clockState.p1Name : clockState.p2Name} ran out of time.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                data-testid="end-screen-exit"
                onClick={handleRequestExit}
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium transition-colors"
              >
                Change Time
              </button>
              <button
                type="button"
                data-testid="end-screen-rematch"
                onClick={() => setClockState((prev) => resetClock(prev))}
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Rematch</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG WHEN RESET OR HOME IS TAPPED WHILE RUNNING */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-action-title"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h2 id="confirm-action-title" className="text-lg font-semibold text-white">
              {confirmAction === 'reset'
                ? 'Reset Active Match?'
                : 'Leave Current Match?'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              The clock has been paused. Confirm to{' '}
              {confirmAction === 'reset'
                ? 'reset both clocks to their starting time'
                : 'return to the preset selection screen'}
              .
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium"
              >
                Keep Playing
              </button>
              <button
                type="button"
                data-testid="confirm-dialog-accept"
                onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  if (action === 'reset') {
                    setClockState((prev) => resetClock(prev));
                  } else {
                    onExitToSetup();
                  }
                }}
                className="min-h-[48px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-semibold"
              >
                {confirmAction === 'reset' ? 'Confirm Reset' : 'Leave Match'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARBITER TIME ADJUSTMENT DIALOG */}
      {showAdjustModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-time-title"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 id="adjust-time-title" className="text-lg font-semibold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Adjust Remaining Clock Time
              </h2>
              <button
                type="button"
                data-testid="adjust-modal-close"
                onClick={() => setShowAdjustModal(false)}
                className="min-h-[48px] px-3 text-xs font-medium text-slate-300 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveAdjustedTime} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  {clockState.p1Name} (White)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="adj-p1-min" className="block text-xs text-slate-400 mb-1">
                      Minutes
                    </label>
                    <input
                      id="adj-p1-min"
                      type="number"
                      min={0}
                      max={180}
                      value={adjustP1Min}
                      onChange={(e) => setAdjustP1Min(Number(e.target.value))}
                      className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="adj-p1-sec" className="block text-xs text-slate-400 mb-1">
                      Seconds
                    </label>
                    <input
                      id="adj-p1-sec"
                      type="number"
                      min={0}
                      max={59}
                      value={adjustP1Sec}
                      onChange={(e) => setAdjustP1Sec(Number(e.target.value))}
                      className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  {clockState.p2Name} (Black)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="adj-p2-min" className="block text-xs text-slate-400 mb-1">
                      Minutes
                    </label>
                    <input
                      id="adj-p2-min"
                      type="number"
                      min={0}
                      max={180}
                      value={adjustP2Min}
                      onChange={(e) => setAdjustP2Min(Number(e.target.value))}
                      className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="adj-p2-sec" className="block text-xs text-slate-400 mb-1">
                      Seconds
                    </label>
                    <input
                      id="adj-p2-sec"
                      type="number"
                      min={0}
                      max={59}
                      value={adjustP2Sec}
                      onChange={(e) => setAdjustP2Sec(Number(e.target.value))}
                      className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              {adjustError && (
                <div role="alert" className="text-xs text-rose-300 bg-rose-950/90 border border-rose-500/50 rounded-xl p-3">
                  {adjustError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[48px] px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-semibold"
                >
                  Apply Time Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
