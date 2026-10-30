import { useMemo, useState } from 'react';
import { resultFor, stageLabel } from '../components/game';
import { Icons } from '../components/icons';
import { Badges, Dot, Pitch, Possible, Section, StarButton, WL } from '../components/ui';
import { ord } from '../engine/bracket';
import { clubColor, clubOf } from '../engine/clubs';
import { placementPaths, poolOutlook, type PathLeaf, type PathNode } from '../engine/paths';
import { mayPlay, sideTeam, teamSide, type RGame } from '../engine/resolve';
import { shortDay, untilText } from '../engine/time';
import { useApp } from '../state/app';
import { href } from '../state/router';

export function TeamsView() {
  const { t, myTeam } = useApp();
  const clubs = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of [...t.seeds].sort((a, b) => a.team.localeCompare(b.team, undefined, { numeric: true }))) {
      const c = clubOf(s.team);
      m.set(c, [...(m.get(c) ?? []), s.team]);
    }
    return [...m];
  }, [t]);
  return (
    <main className="page" style={{ gap: 18 }}>
      <div className="page-head">
        <h1>Teams</h1>
      </div>
      {!myTeam && <p className="muted" style={{ margin: 0 }}>Tap a team, then “Set as my team” to pin it to the Now screen.</p>}
      {clubs.map(([club, teams]) => (
        <section key={club} className="section">
          <div className="row lbl">
            <span className="dot sm" style={{ background: clubColor(teams[0]) }} />
            {club}
          </div>
          <div className="card list">
            {teams.map((tm) => (
              <a key={tm} className={`lrow ${tm === myTeam ? 'mine-row' : ''}`} href={href('team', tm)} style={{ textDecoration: 'none' }}>
                <Dot team={tm} />
                <b className="grow" style={{ fontSize: 15 }}>
                  {tm}
                </b>
                <NextSummary team={tm} />
                {tm === myTeam && <span style={{ color: 'var(--accent)' }}>{Icons.star}</span>}
              </a>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function NextSummary({ team }: { team: string }) {
  const { r, status } = useApp();
  const next = r.games.find((rg) => teamSide(rg, team) && !(rg.real && rg.outcome) && status(rg) !== 'awaiting');
  if (!next) return null;
  return (
    <span className="cap">
      {status(next) === 'live' ? 'Playing now' : `Next ${next.game.stage === 'placement' ? shortDay(next.game.day) + ' ' : ''}${next.game.time}`} · P{next.game.pitch}
    </span>
  );
}

export function TeamView({ team }: { team?: string }) {
  const { t, r, real, bracket, now, status, sotgFor, setWhatIf, whatIf } = useTeamCtx();
  if (!team || !t.seeds.some((s) => s.team === team)) {
    return (
      <main className="page">
        <div className="card empty">
          <b>Team not found</b>
          <a href={href('teams')}>All teams</a>
        </div>
      </main>
    );
  }
  const seed = t.seeds.find((s) => s.team === team)!.seed;
  const games = r.games.filter((rg) => teamSide(rg, team));
  const realGames = real.games.filter((rg) => teamSide(rg, team) && rg.real && rg.outcome);
  const rec = { w: 0, l: 0, d: 0 };
  for (const rg of realGames) {
    const x = resultFor(rg, teamSide(rg, team)!);
    if (x === 'W') rec.w++;
    else if (x === 'L') rec.l++;
    else if (x === 'D') rec.d++;
  }
  const next = games.find((rg) => !(rg.real && rg.outcome) && status(rg) !== 'awaiting');
  const possibleLater = r.games.filter((rg) => !rg.outcome && mayPlay(rg, team) && !teamSide(rg, team));
  const standing = [...r.pools.values()]
    .filter((p) => p.rows.some((x) => x.team === team))
    .sort((a, b) => b.pool.stage - a.pool.stage)[0];
  const row = standing?.rows.find((x) => x.team === team);
  const place = [...r.places].find(([p, s]) => p <= bracket.maxPos && sideTeam(s) === team && s.settled)?.[0];
  const sotg = sotgFor(team);

  return (
    <main className="page">
      <div className="mobile-only row" style={{ margin: '-12px -8px -16px' }}>
        <a className="ib" href={href('teams')} aria-label="Back to teams">
          {Icons.back}
        </a>
        <span className="cap">All teams</span>
      </div>
      <section className="team-head">
        <div className="band" style={{ background: clubColor(team) }} />
        <div className="body">
          <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div className="grow col" style={{ gap: 2 }}>
              <span className="lbl row" style={{ gap: 6 }}>
                <span className="dot sm" style={{ background: clubColor(team) }} />
                {clubOf(team)}
              </span>
              <h1>{team}</h1>
            </div>
            <StarButton team={team} />
          </div>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            <span className="chip">
              Seed <b className="d" style={{ fontSize: 17, color: 'var(--ink)' }}>{seed}</b>
            </span>
            {place ? (
              <span className="chip">Finished {ord(place)}</span>
            ) : (
              !!row?.rank && row.played > 0 && (
                <span className="chip">
                  {ord(row.rank)}
                  {row.tied ? '=' : ''} in {standing.pool.stage === 2 ? 'Power pool' : 'Pool'} {standing.pool.letter}
                </span>
              )
            )}
            {realGames.length > 0 && (
              <span className="chip">
                {rec.w}W · {rec.l}L{rec.d ? ` · ${rec.d}D` : ''}
              </span>
            )}
          </div>
        </div>
      </section>

      {next && (
        <section className={`card mine`} style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row">
            <span className="lbl">
              {status(next) === 'upcoming' ? 'Next' : 'Now'} · {stageLabel(next, bracket)}
            </span>
            <span className="grow" />
            {status(next) === 'upcoming' && (
              <span className="chip accent" style={{ height: 30 }}>
                {untilText(next.game.start - now)}
              </span>
            )}
          </div>
          <div className="row" style={{ gap: 14 }}>
            <span className="d" style={{ fontSize: 60, fontWeight: 700, lineHeight: 0.9 }}>
              {next.game.time}
            </span>
            <span className="pb" style={{ height: 42, minWidth: 50, fontSize: 28, borderRadius: 10 }}>
              P{next.game.pitch}
            </span>
            <span className="d" style={{ fontSize: 15, color: 'var(--ink3)', fontWeight: 600 }}>
              {shortDay(next.game.day)} · {next.game.code}
            </span>
          </div>
          <OpponentLine rg={next} team={team} />
        </section>
      )}

      <PathsAhead team={team} />

      <Section title="Games">
        <div className="card list">
          {groupByDay(games).map(([day, list]) => (
            <div key={day}>
              <div className="lbl" style={{ padding: '12px 14px 4px' }}>
                {day}
              </div>
              {list.map((rg) => (
                <TeamGameRow key={rg.game.id} rg={rg} team={team} isNext={rg === next} />
              ))}
            </div>
          ))}
          {possibleLater.length > 0 && (
            <div>
              <div className="lbl" style={{ padding: '12px 14px 4px' }}>
                Possible later games
              </div>
              {possibleLater.slice(0, 6).map((rg) => (
                <TeamGameRow key={rg.game.id} rg={rg} team={team} possible />
              ))}
            </div>
          )}
        </div>
      </Section>

      {sotg && (sotg.played > 0 || t.header.sotgFormUrl) && (
        <section className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="grow col" style={{ gap: 6 }}>
            <b style={{ fontSize: 15 }}>Spirit scores</b>
            <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
              {sotg.played ? `Submitted for ${sotg.submitted} of ${sotg.played} game${sotg.played === 1 ? '' : 's'}` : 'Submit after each game'}
            </span>
            {sotg.played > 0 && (
              <div className="row" style={{ gap: 4 }}>
                {Array.from({ length: sotg.played }, (_, i) => (
                  <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < sotg.submitted ? 'var(--win)' : 'var(--surface2)' }} />
                ))}
              </div>
            )}
          </div>
          {t.header.sotgFormUrl && (
            <a className="btn" href={t.header.sotgFormUrl} target="_blank" rel="noreferrer">
              Open form
            </a>
          )}
        </section>
      )}

      {!whatIf && (
        <button className="btn whatif" style={{ height: 52, borderRadius: 14, fontSize: 15 }} onClick={() => setWhatIf(true)}>
          {Icons.whatif}Explore what-ifs
        </button>
      )}
    </main>
  );
}

function useTeamCtx() {
  const app = useApp();
  return { ...app, sotgFor: (team: string) => app.t.sotg.find((s) => s.team === team) };
}

function groupByDay(games: RGame[]): [string, RGame[]][] {
  const m = new Map<string, RGame[]>();
  for (const g of games) m.set(g.game.day, [...(m.get(g.game.day) ?? []), g]);
  return [...m];
}

function OpponentLine({ rg, team }: { rg: RGame; team: string }) {
  const side = teamSide(rg, team)!;
  const opp = side === 'lo' ? rg.hi : rg.lo;
  const name = sideTeam(opp);
  return (
    <div className="col" style={{ gap: 4 }}>
      <div style={{ fontSize: 19, fontWeight: 700 }} className="row">
        <span style={{ color: 'var(--ink3)', fontWeight: 500 }}>vs</span>
        {name ? (
          <>
            <Dot team={name} />
            {name}
          </>
        ) : (
          <span style={{ fontStyle: 'italic' }}>{opp.label}</span>
        )}
      </div>
      {!name && <Possible teams={opp.teams} />}
    </div>
  );
}

function TeamGameRow({ rg, team, isNext, possible }: { rg: RGame; team: string; isNext?: boolean; possible?: boolean }) {
  const { openGame, status, bracket } = useApp();
  const side = teamSide(rg, team);
  const opp = side ? (side === 'lo' ? rg.hi : rg.lo) : undefined;
  const oppName = opp && sideTeam(opp);
  const st = status(rg);
  const res = side && rg.outcome ? resultFor(rg, side) : undefined;
  const score = side && rg.game.scoreLo !== undefined && rg.game.scoreHi !== undefined ? (side === 'lo' ? `${rg.game.scoreLo}–${rg.game.scoreHi}` : `${rg.game.scoreHi}–${rg.game.scoreLo}`) : '';
  const carried = rg.game.id.includes(':carried:');
  return (
    <button
      className={`lrow ${isNext ? 'mine-row' : ''} ${!rg.real && rg.outcome ? 'hyp-row' : ''}`}
      style={{ borderTop: 'none', padding: '9px 14px', opacity: possible ? 0.8 : 1 }}
      onClick={() => openGame(rg.game.id)}
    >
      <span className="d" style={{ fontSize: 17, fontWeight: 700, width: 40, color: isNext ? 'var(--accent)' : 'var(--ink3)' }}>
        {rg.game.time}
      </span>
      <div className="grow col">
        <span className="row" style={{ fontSize: 14, fontWeight: 600, gap: 6 }}>
          {possible ? (
            <span style={{ fontStyle: 'italic' }}>
              {stageLabel(rg, bracket)} · if {rg.lo.teams.includes(team) ? rg.lo.label : rg.hi.label}
            </span>
          ) : oppName ? (
            <>
              <Dot team={oppName} size="sm" />v {oppName}
            </>
          ) : (
            <span style={{ fontStyle: 'italic' }}>v {opp?.label}</span>
          )}
        </span>
        <span className="cap" style={{ fontWeight: 500 }}>
          {possible ? `${shortDay(rg.game.day)} · P${rg.game.pitch}` : `${stageLabel(rg, bracket)} · P${rg.game.pitch}${carried ? ' · carried' : ''}`}
          {st === 'live' && ' · live now'}
        </span>
      </div>
      <span className="d" style={{ fontSize: 18, fontWeight: 700 }}>
        {score}
      </span>
      {res ? <WL r={res} /> : <span style={{ width: 22 }} />}
    </button>
  );
}

function PathsAhead({ team }: { team: string }) {
  const { t, scenario, whatIf } = useApp();
  const sc = whatIf ? scenario : {};
  const outlook = useMemo(() => poolOutlook(t, sc, team), [t, sc, team]);
  const tree = useMemo(() => (outlook ? undefined : placementPaths(t, sc, team, 3)), [t, sc, team, outlook]);
  const [open, setOpen] = useState(true);
  if (!outlook && !tree) return null;
  return (
    <Section
      title="Paths ahead"
      right={
        <button className="tree-toggle" onClick={() => setOpen(!open)}>
          {open ? 'Collapse' : 'Expand'}
        </button>
      }
    >
      {open && (
        <div className="card ptree">
          {outlook ? <PoolOutlookView o={outlook} team={team} /> : tree && <TreeNode n={tree} depth={0} />}
        </div>
      )}
    </Section>
  );
}

const range = (xs: number[]) => (!xs.length ? '–' : xs.length === 1 ? ord(xs[0]) : `${ord(xs[0])}–${ord(xs[xs.length - 1])}`);

function PoolOutlookView({ o, team }: { o: NonNullable<ReturnType<typeof poolOutlook>>; team: string }) {
  const dests = [...new Set(o.now.map((p) => o.dest(p)))];
  return (
    <>
      <div className="bn">
        <div className="bt">
          <span>
            {o.remaining.length} game{o.remaining.length === 1 ? '' : 's'} left in Pool {o.pool}
          </span>
        </div>
        <div className="bs">Could finish {range(o.now)} · {dests.join(' or ')}</div>
      </div>
      <div className="br">
        {o.remaining.map((rg) => {
          const opp = teamSide(rg, team) === 'lo' ? rg.hi : rg.lo;
          return (
            <div key={rg.game.id} className="bt">
              <span className="tm">{rg.game.time}</span>
              <Pitch n={rg.game.pitch} size="sm" />
              <span className="row" style={{ gap: 6 }}>
                vs <Dot team={sideTeam(opp)} size="sm" />
                {sideTeam(opp) ?? opp.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="br" style={{ borderLeftColor: 'transparent', paddingLeft: 0, marginLeft: 0 }}>
        <div className="bn">
          <div className="bt">
            <span className="wl W wide">Win all</span>
            <span>Finish {range(o.winAll)}</span>
          </div>
          <div className="bs">→ {[...new Set(o.winAll.map(o.dest))].join(' or ')}</div>
        </div>
        <div className="bn">
          <div className="bt">
            <span className="wl L wide">Lose all</span>
            <span>Finish {range(o.loseAll)}</span>
          </div>
          <div className="bs">→ {[...new Set(o.loseAll.map(o.dest))].join(' or ')}</div>
        </div>
      </div>
    </>
  );
}

function TreeNode({ n, depth, outcome }: { n: PathNode | PathLeaf; depth: number; outcome?: 'Win' | 'Lose' }) {
  const [open, setOpen] = useState(depth < 2);
  const tag = outcome && <span className={`wl ${outcome === 'Win' ? 'W' : 'L'} wide`}>{outcome}</span>;
  if (n.kind === 'leaf') {
    return (
      <div className="bt">
        {tag}
        <span>{n.text}</span>
        <Badges list={n.badges} full />
      </div>
    );
  }
  const g = n.rg.game;
  const oppName = sideTeam(n.opponent);
  const hasKids = n.win || n.lose;
  const isLeafish = !hasKids;
  return (
    <>
      <div className="bn">
        <div className="bt">
          {tag}
          <span className="tm">{g.stage === 'placement' && depth === 0 ? `${shortDay(g.day)} ${g.time}` : g.time}</span>
          <Pitch n={g.pitch} size="sm" />
          <span>{n.name}</span>
          {isLeafish && <Badges list={n.badges} full />}
        </div>
        <div className="bs">
          vs {oppName ?? n.opponent.label}
          {!oppName && n.opponent.teams.length > 0 && n.opponent.teams.length <= 3 && ` · ${n.opponent.teams.join(' or ')}`}
          {!oppName && n.opponent.teams.length > 3 && ` · 1 of ${n.opponent.teams.length} teams`}
        </div>
        {hasKids && depth >= 1 && (
          <button className="tree-toggle" onClick={() => setOpen(!open)} style={{ marginTop: 2 }}>
            {open ? 'Hide' : 'Show'} what follows
          </button>
        )}
      </div>
      {hasKids && open && (
        <div className="br">
          {n.win && <TreeNode n={n.win} depth={depth + 1} outcome="Win" />}
          {n.lose && <TreeNode n={n.lose} depth={depth + 1} outcome="Lose" />}
        </div>
      )}
    </>
  );
}

