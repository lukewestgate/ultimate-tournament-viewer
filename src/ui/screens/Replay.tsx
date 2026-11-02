import { useEffect, useRef, useState } from 'react';
import { useT, type TCtx } from '../ctx';
import { useOverlay } from '../overlay';
import { IReplay, IPlay, IPause, IChevronLeft, IChevronRight, ICopy } from '../icons';
import { dayShort, timeOf } from '../fmt';

function useReplayRange(c: TCtx) {
  const games = c.t.games.filter((g) => !g.unscheduled && !g.isBye);
  const starts = [...new Set(games.map((g) => g.start))].sort((a, b) => a - b);
  const min = (starts[0] ?? c.view.clock) - 30 * 60000;
  const max = Math.max(...games.map((g) => g.end), c.view.clock) + 15 * 60000;
  const dayStarts = c.t.days
    .map((d) => ({ name: d.name, start: Math.min(...games.filter((g) => g.day === d.name).map((g) => g.start)) }))
    .filter((d) => Number.isFinite(d.start));
  return { starts, min, max, dayStarts };
}

const label = (c: TCtx, t: number) => `${dayShort(t, c.t.timeZone)} ${timeOf(t, c.t.timeZone)}`;

/** Replay banner: always shows the replay time. */
export function ReplayBar() {
  const c = useT();
  const at = c.replayAt ?? c.view.clock;
  return (
    <div className="bn replay">
      <IReplay size={18} />
      <span className="bn-text">
        Replay · <span className="phone-hide">as it was at </span>
        <b className="d bn-time">{label(c, at)}</b>
      </span>
      <button className="bn-solid" onClick={() => c.setReplayAt(undefined)}>
        Exit
      </button>
    </div>
  );
}

/** Docked replay controls (replace the tab bar): scrubber, step slot, play/pause, more. */
export function ReplayDock() {
  const c = useT();
  const overlay = useOverlay();
  const { starts, min, max } = useReplayRange(c);
  const [playing, setPlaying] = useState(false);
  const speedRef = useRef(1);
  const at = c.replayAt ?? c.view.clock;
  const step = (dir: 1 | -1) => {
    const n = dir > 0 ? starts.find((s) => s > at + 1000) ?? max : [...starts].reverse().find((s) => s < at - 1000) ?? min;
    c.setReplayAt(n);
  };
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const cur = c.replayAt ?? 0;
      const n = starts.find((s) => s > cur + 1000);
      if (n === undefined) {
        setPlaying(false);
        c.setReplayAt(max);
      } else c.setReplayAt(n);
    }, 1000 / speedRef.current);
    return () => clearInterval(t);
  }, [playing, c.replayAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const nowPct = Math.min(100, Math.max(0, ((Date.now() - min) / (max - min)) * 100));
  const pct = ((at - min) / (max - min)) * 100;
  return (
    <div className="replay-dock" role="region" aria-label="Replay controls">
      <div className="scrub-wrap" style={{ ['--pct' as string]: `${pct}%` }}>
        <input
          type="range"
          className="scrubber"
          min={min}
          max={max}
          step={60000}
          value={at}
          onChange={(e) => c.setReplayAt(Number(e.target.value))}
          aria-label="Replay time"
          aria-valuetext={label(c, at)}
        />
        {nowPct > 0 && nowPct < 100 && <span className="scrub-now" style={{ left: `${nowPct}%` }} aria-hidden="true" />}
      </div>
      <div className="dock-btns">
        <button className="dock-btn" onClick={() => step(-1)} aria-label="Previous slot">
          <IChevronLeft size={18} />
        </button>
        <button className="dock-btn play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <IPause size={20} /> : <IPlay size={20} />}
        </button>
        <button className="dock-btn" onClick={() => step(1)} aria-label="Next slot">
          <IChevronRight size={18} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => overlay.openSheet(<ReplayMore speedRef={speedRef} onPlay={() => setPlaying(true)} />)}>
          More
        </button>
      </div>
    </div>
  );
}

function ReplayMore({ speedRef, onPlay }: { speedRef: { current: number }; onPlay: () => void }) {
  const c = useT();
  const overlay = useOverlay();
  const { min, max, dayStarts } = useReplayRange(c);
  const [speed, setSpeed] = useState(speedRef.current);
  const at = c.replayAt ?? c.view.clock;
  const jump = (t: number) => {
    c.setReplayAt(t);
    overlay.closeSheet();
  };
  return (
    <div className="stack replay-more">
      <div className="rm-time">
        <span className="d">{label(c, at)}</span>
        <span className="muted small">replay time</span>
      </div>
      <span className="lbl">Jump to</span>
      <div className="jump-grid">
        {dayStarts.map((d) => (
          <button key={d.name} className="btn" onClick={() => jump(d.start)}>
            Start of {d.name}
          </button>
        ))}
        <button className="btn" onClick={() => jump(Math.min(Math.max(Date.now(), min), max))}>
          Now (live)
        </button>
        <button className="btn" onClick={() => jump(max)}>
          End
        </button>
      </div>
      <span className="lbl">Play speed · slots per second</span>
      <div className="seg" role="radiogroup" aria-label="Speed">
        {[0.5, 1, 4, 16].map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={speed === s}
            className={speed === s ? 'on' : ''}
            onClick={() => {
              speedRef.current = s;
              setSpeed(s);
            }}
          >
            {s === 0.5 ? '½' : s}
          </button>
        ))}
      </div>
      <div className="row-btns">
        <button className="btn grow" onClick={() => (onPlay(), overlay.closeSheet())}>
          <IPlay size={16} /> Play from here
        </button>
        <button
          className="btn grow"
          onClick={async () => {
            await navigator.clipboard?.writeText(location.href).catch(() => undefined);
            overlay.toast('Link to this moment copied.');
          }}
        >
          <ICopy size={16} /> Copy link to this moment
        </button>
      </div>
      <div className="note replay-note">
        Replay is an approximation: results appear at each game’s scheduled end, which may be earlier than the TD actually entered them. Live data keeps updating underneath.
      </div>
    </div>
  );
}
