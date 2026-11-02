import { useEffect, useState } from 'react';
import { useT } from '../ctx';
import { IReplay, IPlay, IPause } from '../icons';
import { dayShort, timeOf } from '../fmt';

/** Replay banner with a docked scrubber (spec §11). */
export function ReplayBar() {
  const c = useT();
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const at = c.replayAt ?? c.view.clock;
  const games = c.t.games.filter((g) => !g.unscheduled && !g.isBye);
  const starts = [...new Set(games.map((g) => g.start))].sort((a, b) => a - b);
  const min = (starts[0] ?? at) - 30 * 60000;
  const max = Math.max(...games.map((g) => g.end), at) + 15 * 60000;
  const nextSlot = (dir: 1 | -1) => {
    if (dir > 0) return starts.find((s) => s > at + 1000) ?? max;
    return [...starts].reverse().find((s) => s < at - 1000) ?? min;
  };
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const n = starts.find((s) => s > (c.replayAt ?? 0) + 1000);
      if (n === undefined) {
        setPlaying(false);
        c.setReplayAt(max);
      } else c.setReplayAt(n);
    }, 1000 / speed);
    return () => clearInterval(t);
  }, [playing, speed, c.replayAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayStarts = c.t.days.map((d) => ({ name: d.name, start: Math.min(...games.filter((g) => g.day === d.name).map((g) => g.start)) })).filter((d) => Number.isFinite(d.start));
  return (
    <div className="replay-wrap sticky">
      <div className="bn replay">
        <IReplay size={18} />
        <button className="replay-time" onClick={() => setOpen(!open)} aria-expanded={open}>
          Replay · <b>{dayShort(at, c.t.timeZone)} {timeOf(at, c.t.timeZone)}</b>
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <IPause size={16} /> : <IPlay size={16} />}
        </button>
        <button onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Controls'}</button>
        <button onClick={() => c.setReplayAt(undefined)}>Exit</button>
      </div>
      {open && (
        <div className="card pad replay-panel stack">
          <input
            type="range"
            className="scrubber"
            min={min}
            max={max}
            step={60000}
            value={at}
            onChange={(e) => c.setReplayAt(Number(e.target.value))}
            aria-label="Replay time"
            aria-valuetext={`${dayShort(at, c.t.timeZone)} ${timeOf(at, c.t.timeZone)}`}
          />
          <div className="scrub-days small muted">
            {dayStarts.map((d) => (
              <span key={d.name}>{d.name.slice(0, 3).toUpperCase()} {timeOf(d.start, c.t.timeZone)}</span>
            ))}
            <span>END</span>
          </div>
          <div className="row-btns">
            <button className="btn small" onClick={() => c.setReplayAt(nextSlot(-1))} aria-label="Previous slot">
              ◂ Slot
            </button>
            <button className="btn small" onClick={() => setPlaying(!playing)}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button className="btn small" onClick={() => c.setReplayAt(nextSlot(1))} aria-label="Next slot">
              Slot ▸
            </button>
            <div className="seg" role="radiogroup" aria-label="Speed">
              {[1, 4, 16].map((s) => (
                <button key={s} role="radio" aria-checked={speed === s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div className="row-btns">
            {dayStarts.map((d) => (
              <button key={d.name} className="btn small" onClick={() => c.setReplayAt(d.start)}>
                {d.name} start
              </button>
            ))}
            <button className="btn small" onClick={() => c.setReplayAt(Math.min(Math.max(Date.now(), min), max))}>
              Now
            </button>
            <button className="btn small" onClick={() => c.setReplayAt(max)}>
              End
            </button>
          </div>
          <span className="small muted">Scores appear at each game’s scheduled end; real score entry may have been later. Speed is slots per second.</span>
        </div>
      )}
    </div>
  );
}
