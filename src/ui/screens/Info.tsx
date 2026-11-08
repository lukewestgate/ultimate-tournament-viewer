import { useState } from 'react';
import { useT } from '../ctx';
import { PageHead } from '../Shell';
import { href, tHref } from '../router';
import { IExternal, IChevronRight, IChevronDown, IPlay, IReplay, IList, ISliders } from '../icons';
import { TIEBREAK_LABEL } from '../../engine/rulesPresets';
import { dateRange, ago } from '../fmt';
import { withoutTag } from '../../extract/names';
import type { ScreenProps } from './index';

/** Info (spec §9.12; SpecInfo #1): links, timing and scoring, rules text from the sheet, spirit, about. */
export function Info(_: ScreenProps) {
  const c = useT();
  const t = c.t;
  const spiritLinks = t.links.items.filter((i) => (/spirit|sotg/i.test(i.label) || /forms\.gle|google\.com\/forms/.test(i.url)) && c.inDiv(i.division));
  const shortLabel = (l: string) => {
    const rest = l.replace(/spirit( of the game)?( score)?( form)?|sotg( form)?/i, '').replace(/\s+/g, ' ').trim();
    return rest ? `${rest} spirit form` : 'Spirit form';
  };
  const spirit = spiritLinks.length > 1 ? spiritLinks.map((s) => ({ label: shortLabel(s.label || ''), url: s.url })) : t.links.spirit ? [{ label: 'Spirit form', url: t.links.spirit }] : [];
  const manyForms = spirit.length > 2;
  const r = t.rules;
  const dayShort = (d: string) => d.slice(0, 3);
  const lengths = [...new Map(t.timing.filter((x) => c.inDiv(x.division)).map((x) => [`${x.day}|${x.gameMins}`, x])).values()];
  const sameLength = new Set(lengths.map((x) => x.gameMins)).size === 1;
  const caps = [...new Set(t.timing.map((x) => x.capMins).filter((x): x is number => x !== undefined))];
  const late = t.timing.filter((x) => x.delayMins);
  const spiritRows = (t.spirit ?? []).filter((s) => c.isFollowed(s.team, s.division));
  return (
    <div className="info">
      <PageHead title="Info" sub={[t.title, dateRange(t.days.map((d) => d.date))].filter(Boolean).join(' · ')} />
      <div className="card list">
        <a className="nav-row" href={href({ name: 'home' })}>
          <IList size={20} /> All tournaments <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </a>
        <a className="nav-row" href={tHref(c.id, 'settings')}>
          <ISliders size={20} /> Reading <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </a>
      </div>
      {manyForms && (
        <div className="card list">
          {spirit.map((l) => (
            <a key={l.url} className="nav-row" href={l.url} target="_blank" rel="noreferrer">
              {l.label} <span style={{ flex: 1 }} />
              <IExternal size={15} />
            </a>
          ))}
        </div>
      )}
      {((!manyForms && spirit.length > 0) || t.links.stream || t.links.pitchMap) && (
        <div className="info-btns">
          {(manyForms ? [] : spirit).map((l) => (
            <a key={l.url} className="btn" href={l.url} target="_blank" rel="noreferrer">
              {l.label} <IExternal size={15} />
            </a>
          ))}
          {t.links.pitchMap && (
            <a className="btn" href={t.links.pitchMap} target="_blank" rel="noreferrer">
              Pitch map <IExternal size={15} />
            </a>
          )}
          {t.links.stream && (
            <a className="btn ink" href={t.links.stream} target="_blank" rel="noreferrer">
              <IPlay size={14} /> Watch the stream
            </a>
          )}
        </div>
      )}
      <section className="card kv-card">
        <span className="lbl">Timing & scoring</span>
        <div className="kv-row">
          <span>Game length</span>
          <b className="d">{sameLength && lengths.length ? `${lengths[0].gameMins} min` : lengths.map((x) => `${dayShort(x.day)}${x.division && !c.division ? ` ${x.division}` : ''} ${x.gameMins} min`).join(' · ')}</b>
        </div>
        {caps.length > 0 && (
          <div className="kv-row">
            <span>Cap</span>
            <b className="d">{caps.map((m) => `${m} min before the end`).join(' · ')}</b>
          </div>
        )}
        {late.length > 0 && (
          <div className="kv-row">
            <span>Running late</span>
            <span>
              <b className="d late">+{Math.max(...late.map((x) => x.delayMins))} min</b> <span className="small muted">{late.map((x) => dayShort(x.day)).join(', ')}, set in settings</span>
            </span>
          </div>
        )}
        <div className="kv-row">
          <span>Points</span>
          <b className="d">
            Win {r.points.win} · Draw {r.points.draw} · Loss {r.points.loss}
          </b>
        </div>
        <div className="kv-row col">
          <span>Tie-breaks, in order</span>
          <span className="small muted">{r.tiebreaks.map((x) => TIEBREAK_LABEL[x]).join(' → ')}</span>
        </div>
        <div className="kv-row">
          <span>Draws</span>
          <span className="small">{r.drawsAllowed.pool ? 'Allowed in pools' : 'Not in pools'} · {r.drawsAllowed.placement ? 'allowed in placement' : 'not in placement'}</span>
        </div>
      </section>
      {t.info.length > 0 && (
        <section className="section">
          <span className="lbl">Rules from the sheet</span>
          <div className="card list">
            {t.info.map((s, i) => (
              <RuleRow key={i} title={s.title} lines={s.lines} initiallyOpen={i === t.info.findIndex((x) => !/^header$/i.test(x.title)) && t.info.length > 1} />
            ))}
          </div>
        </section>
      )}
      {spiritRows.length > 0 && (
        <section className="section">
          <span className="lbl">Spirit submissions</span>
          <div className="card kv-card">
            {spiritRows.map((s) => (
              <div key={s.team} className="kv-row">
                <span className="spirit-team">
                  <span className="dot" style={{ background: c.colorOf(s.team, s.division) }} />
                  {withoutTag(s.team)}
                </span>
                <b className="d">
                  {s.submitted ?? 0} / {s.played ?? 0}
                </b>
              </div>
            ))}
            <a className="link" href={tHref(c.id, 'teams')}>
              All {t.spirit!.length} teams
            </a>
          </div>
        </section>
      )}
      <div className="card list">
        <a className="nav-row" href={t.links.sheet} target="_blank" rel="noreferrer">
          Original sheet <IExternal size={15} />
        </a>
        {(t.finalStandings?.length || c.view.places.size > 0) && (
          <a className="nav-row" href={tHref(c.id, 'standings')}>
            Final standings <span style={{ flex: 1 }} />
            <IChevronRight size={18} />
          </a>
        )}
        <button className="nav-row" onClick={() => c.setReplayAt(Math.min(...c.t.games.filter((g) => !g.unscheduled).map((g) => g.start)))}>
          <IReplay size={20} /> Replay the tournament <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </button>
        <a className="nav-row" href={href({ name: 'appSettings' })}>
          App settings <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </a>
        <a className="nav-row" href={tHref(c.id, 'diagnostics')}>
          Diagnostics <span style={{ flex: 1 }} />
          <IChevronRight size={18} />
        </a>
      </div>
      <p className="small muted about">
        Unofficial and community-made. The TD’s sheet is the source of truth; this app only reads it and checks for changes every minute while open. Scores can be a few minutes behind.{' '}
        {c.rt.lastSuccess ? `${ago(c.rt.lastSuccess, c.now)}.` : ''}
      </p>
    </div>
  );
}

function RuleRow({ title, lines, initiallyOpen }: { title: string; lines: string[]; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [all, setAll] = useState(false);
  const long = lines.join(' ').length > 220 || lines.length > 4;
  return (
    <div className="rule">
      <button className="rule-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>{title}</b>
        <span style={{ flex: 1 }} />
        <IChevronDown size={16} className={`chev${open ? ' up' : ''}`} />
      </button>
      {open && (
        <div className={`rule-body${long && !all ? ' clamp' : ''}`}>
          {lines.map((l, j) => (
            <p key={j}>{l}</p>
          ))}
        </div>
      )}
      {open && long && !all && (
        <button className="link rule-more" onClick={() => setAll(true)}>
          Show all
        </button>
      )}
    </div>
  );
}
