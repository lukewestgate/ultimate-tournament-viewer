import { useState, type ReactNode } from 'react';
import { ReadingStatus, IssueList, FixOptions, ChangeList, StepTabs, TapList, SheetGrid, LiveBar, Stepper, type StepState } from './components';
import { ROLE_COLOR } from '../mapping/manual';

/**
 * Development only (#/gallery): every shared component in src/ui/components with sample props, in both themes. Add a
 * section here whenever you add a component; the design system's previews follow these examples.
 */
export function Gallery() {
  const [dark, setDark] = useState(document.body.classList.contains('t-dark'));
  const flip = () => {
    document.body.classList.toggle('t-dark', !dark);
    document.body.classList.toggle('t-light', dark);
    setDark(!dark);
  };
  const log = (what: string) => () => console.info(`[gallery] ${what}`);
  const [step, setStep] = useState<'games' | 'pools' | 'seeding' | 'info'>('pools');
  const [n, setN] = useState(60);
  const grid = [
    ['Pool V', '', '', '', ''],
    ['Team', 'P', 'W', 'L', 'Pts'],
    ['Durham 2', '3', '3', '0', '9'],
    ['Leeds 3', '3', '2', '1', '6'],
    ['York 2', '3', '1', '2', '3'],
  ];
  const roles: Record<number, string> = { 0: 'team', 2: 'w', 4: 'pts' };
  const steps: { key: typeof step; label: string; state: StepState }[] = [
    { key: 'games', label: 'Games', state: 'done' },
    { key: 'pools', label: 'Pool tables', state: 'warn' },
    { key: 'seeding', label: 'Seeding', state: 'done' },
    { key: 'info', label: 'Rules text', state: 'todo' },
  ];
  return (
    <div className="app-shell sub-shell">
      <header className="sub-hdr">
        <div className="sub-hdr-row">
          <div className="sub-title" style={{ paddingLeft: 10 }}>
            <h1>Component gallery</h1>
            <span>src/ui/components · development only</span>
          </div>
          <button className="btn small" onClick={flip}>
            {dark ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>
      <main className="sub-main wide" style={{ gap: 28 }}>
        <Item name="ReadingStatus">
          <ReadingStatus tone="ok" title="Looks right" counts={[{ label: 'games', value: 217 }, { label: 'teams', value: 74 }, { label: 'days', value: 2 }]} note="Next opponents known for every game" />
          <ReadingStatus tone="warn" title="10 things to check" detail="5 likely wrong · 5 worth a look" counts={[{ label: 'games', value: 217 }, { label: 'teams', value: 74 }]} />
          <ReadingStatus tone="bad" title="Couldn’t find the games" detail="We opened the sheet and found 6 tabs, but none of them looks like a list or grid of games." />
        </Item>
        <Item name="IssueList">
          <IssueList
            items={[
              { key: '1', bad: true, text: '3 games are listed twice at the same time', actions: <button className="btn small">See them</button> },
              { key: '2', bad: true, text: 'Pool V (Men D3): No games read for this pool', actions: <button className="btn small">See it</button> },
              { key: '3', bad: false, text: '“Leeds Ult” and “Leeds Ultimate” may be the same team', sub: 'Men D2', actions: <><button className="btn small primary">Merge</button><button className="btn small">Not the same</button></> },
              { key: '4', bad: false, text: 'Sunday’s date was guessed: Sun 22 Mar', actions: <button className="link-btn">It’s right</button> },
              { key: '5', bad: false, text: '2 teams play far fewer games than the rest', sub: 'Chichester 1 and Hull 2' },
              { key: '6', bad: false, text: '8 games start before 7:00 or after 21:00' },
            ]}
          />
        </Item>
        <Item name="FixOptions">
          <FixOptions hasKey onAi={log('ai')} onMap={log('map')} onAddKey={log('key')} />
          <FixOptions hasKey={false} noGames onAi={log('ai')} onMap={log('map')} onAddKey={log('key')} />
        </Item>
        <Item name="ChangeList">
          <section className="card pad">
            <ChangeList
              items={[
                { kind: 'add', text: 'Pool tables: 29 → 30' },
                { kind: 'fix', text: 'Merged team names: 0 → 1' },
                { kind: 'remove', text: 'Games: 220 → 217', sub: 'Three duplicate rows dropped' },
              ]}
            />
          </section>
        </Item>
        <Item name="StepTabs + TapList">
          <StepTabs label="What to map" steps={steps} current={step} onPick={setStep} />
          <section className="card pad">
            <TapList
              items={[
                { text: 'Pick the tab', state: 'done' },
                { text: 'Tap the header row of a pool table', state: 'done' },
                { text: 'Tap the team column, then each stat column (W, L, Pts…)', state: 'now' },
                { text: 'Tap another table’s header row to add it (optional)', state: 'todo' },
              ]}
            />
          </section>
        </Item>
        <Item name="SheetGrid">
          <section className="card" style={{ overflow: 'hidden' }}>
            <SheetGrid
              label="Preview of Pools D3"
              rows={grid.length}
              cols={5}
              text={(r, c) => grid[r][c]}
              col={(c) => ({ name: String.fromCharCode(65 + c), role: roles[c], color: roles[c] ? ROLE_COLOR[roles[c]] : undefined })}
              isHeader={(r) => r === 1}
              tint={(r, c) => (r > 1 && roles[c] ? ROLE_COLOR[roles[c]] : undefined)}
              onCell={(r, c) => console.info('[gallery] cell', r, c)}
              onRow={(r) => console.info('[gallery] row', r)}
            />
          </section>
        </Item>
        <Item name="LiveBar">
          <LiveBar action={<button className="btn small">Save</button>}>
            Read so far: <b>217</b> games · <b>74</b> teams · <b>30</b> pool tables
          </LiveBar>
        </Item>
        <Item name="Stepper">
          <section className="card set-list">
            <div className="set-row">
              <span>Game length</span>
              <Stepper label="Game length" value={`${n} min`} onMinus={() => setN(n - 1)} onPlus={() => setN(n + 1)} />
            </div>
          </section>
        </Item>
      </main>
    </div>
  );
}

function Item({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="stack" style={{ maxWidth: 560 }}>
      <span className="lbl-head">{name}</span>
      {children}
    </section>
  );
}
