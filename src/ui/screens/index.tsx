import type { ComponentType } from 'react';
import type { TournamentTab } from '../router';
import { useT } from '../ctx';
import { GameRow, Section } from '../parts';
import { href } from '../router';
import { store, useStore } from '../../store/app';

export interface ScreenProps {
  arg?: string;
}

/** Placeholder while a screen is being built: every game in order. */
function AllGames() {
  const c = useT();
  return (
    <Section title="Games">
      <div className="card list">
        {c.view.games.filter((v) => c.inDiv(v.g.division)).map((v) => (
          <GameRow key={v.g.id} v={v} showTime showDay />
        ))}
      </div>
    </Section>
  );
}

function Home() {
  useStore();
  return (
    <div className="page">
      <h1>Tournaments</h1>
      <a className="btn primary" href={href({ name: 'add' })}>Add tournament</a>
      <ul>
        {store.saved().map((s) => (
          <li key={s.id}>
            <a href={`#/t/${encodeURIComponent(s.id)}/now`}>{s.summary?.title ?? s.id}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Placeholder = () => <div className="page"><p className="muted">Coming soon.</p></div>;

export const screens: {
  Home: ComponentType;
  Add: ComponentType;
  AppSettings: ComponentType;
  tournament: Partial<Record<TournamentTab, ComponentType<ScreenProps>>> & { now: ComponentType<ScreenProps> };
} = {
  Home,
  Add: Placeholder,
  AppSettings: Placeholder,
  tournament: { now: AllGames },
};
