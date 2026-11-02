import { useT } from '../ctx';
import { Section } from '../parts';
import { href, tHref } from '../router';
import { IExternal, IChevronRight } from '../icons';
import { TIEBREAK_LABEL } from '../../engine/rulesPresets';
import { dateLabel, ago } from '../fmt';
import type { ScreenProps } from './index';

/** Info (spec §9.12): rules and format text from the sheet, timing, points, links, about. */
export function Info(_: ScreenProps) {
  const c = useT();
  const t = c.t;
  const links: { label: string; url: string }[] = [];
  const spiritLinks = t.links.items.filter((i) => /spirit|sotg/i.test(i.label) || /forms\.gle|google\.com\/forms/.test(i.url));
  if (spiritLinks.length > 1) for (const s of spiritLinks) links.push({ label: s.label || 'Spirit form', url: s.url });
  else if (t.links.spirit) links.push({ label: 'Spirit form', url: t.links.spirit });
  if (t.links.stream) links.push({ label: 'Stream', url: t.links.stream });
  if (t.links.pitchMap) links.push({ label: 'Pitch map', url: t.links.pitchMap });
  links.push({ label: 'Original sheet', url: t.links.sheet });
  const r = t.rules;
  return (
    <div className="info">
      <Section title="Links">
        <div className="card list">
          {links.map((l) => (
            <a key={l.url + l.label} className="link-row" href={l.url} target="_blank" rel="noreferrer">
              {l.label}
              <span style={{ flex: 1 }} />
              <IExternal size={16} />
            </a>
          ))}
        </div>
      </Section>
      <Section title="Timing and points">
        <div className="card pad">
          <dl className="kv">
            {t.timing.map((x) => (
              <div key={x.day} style={{ display: 'contents' }}>
                <dt>{t.days.find((d) => d.name === x.day) ? dateLabel(t.days.find((d) => d.name === x.day)!.date) : x.day}</dt>
                <dd>
                  {x.gameMins} min games, every {x.slotMins} min
                  {x.capMins ? ` · cap ${x.capMins} min before the end` : ''}
                  {x.delayMins ? ` · running ${x.delayMins} min late` : ''}
                </dd>
              </div>
            ))}
            <dt>Points</dt>
            <dd>
              Win {r.points.win} · draw {r.points.draw} · loss {r.points.loss}
            </dd>
            <dt>Tie-breaks</dt>
            <dd>{r.tiebreaks.map((x, i) => `${i + 1}. ${TIEBREAK_LABEL[x]}`).join(' · ')}</dd>
            <dt>Draws</dt>
            <dd>
              {r.drawsAllowed.pool ? 'Allowed in pools' : 'Not in pools'} · {r.drawsAllowed.placement ? 'allowed in placement games' : 'not in placement games'}
            </dd>
          </dl>
        </div>
      </Section>
      {t.info.map((s, i) => (
        <details key={i} className="card pad info-sec" open={i < 2 && s.lines.length < 8}>
          <summary>
            <b>{s.title}</b>
          </summary>
          <div className="info-lines">
            {s.lines.map((l, j) => (
              <p key={j}>{l}</p>
            ))}
          </div>
        </details>
      ))}
      <Section title="About">
        <div className="card pad stack small">
          <p style={{ margin: 0 }}>
            An unofficial viewer. Everything comes from the tournament’s Google Sheet, which stays the source of truth. Predictions (possible opponents, what-ifs) are the app’s own reasoning and are
            marked as such.
          </p>
          <p style={{ margin: 0 }} className="muted">
            {ago(c.rt.lastSuccess, c.now)}. The app checks the sheet every minute while open. Published sheets can lag the live sheet by up to about 5 minutes.
          </p>
        </div>
      </Section>
      <div className="card list">
        <a className="link-row" href={tHref(c.id, 'settings')}>
          Tournament settings <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </a>
        <a className="link-row" href={tHref(c.id, 'standings')}>
          Final standings <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </a>
        <a className="link-row" href={href({ name: 'home' })}>
          All tournaments <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </a>
        <a className="link-row" href={href({ name: 'appSettings' })}>
          App settings <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </a>
        <button className="link-row as-btn" onClick={() => c.setReplayAt(Math.min(...c.t.games.filter((g) => !g.unscheduled).map((g) => g.start)))}>
          Replay the tournament <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </button>
        <a className="link-row" href={tHref(c.id, 'diagnostics')}>
          Diagnostics <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </a>
      </div>
    </div>
  );
}
