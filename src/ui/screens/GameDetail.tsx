import { useT } from '../ctx';
import { useOverlay } from '../overlay';
import { PitchBadge, Side, StatusTag, scoreText, stageText, winnerSide } from '../parts';
import { dateLabel, timeOf } from '../fmt';

/** Game detail (sheet on phone, modal on desktop). */
export function GameDetail({ id }: { id: string }) {
  const c = useT();
  const v = c.view.byId.get(id);
  if (!v) return <p className="muted">Game not found.</p>;
  const w = winnerSide(v);
  const day = c.t.days.find((d) => d.name === v.g.day);
  return (
    <div className="stack gd">
      <div className="gd-teams">
        {([0, 1] as const).map((i) => (
          <div key={i} className={`gd-side${w === i ? ' won' : ''}`}>
            <Side side={v.sides[i]} division={v.g.division} bold={w === i} />
            <b className="d gd-score">{scoreText(v, i)}</b>
          </div>
        ))}
      </div>
      <div className="gd-meta">
        <PitchBadge label={v.g.pitch.label} />
        <span className="d gd-time">{timeOf(v.g.start, c.t.timeZone)}</span>
        <span className="muted">{day ? dateLabel(day.date) : v.g.day}</span>
        <span className="muted">· {stageText(v)}</span>
        {v.g.division && <span className="muted">· {v.g.division}</span>}
        <span style={{ flex: 1 }} />
        <StatusTag v={v} />
      </div>
    </div>
  );
}

export function useOpenGame() {
  const overlay = useOverlay();
  return (id: string) => overlay.openSheet(<GameDetail id={id} />, { title: 'Game' });
}
