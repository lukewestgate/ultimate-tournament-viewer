import type { ComponentType } from 'react';
import type { TournamentTab } from '../router';
import { useT } from '../ctx';
import { GameRow, Section } from '../parts';
import { Home } from './Home';
import { Add } from './Add';

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

const Placeholder = () => <div className="page"><p className="muted">Coming soon.</p></div>;

export const screens: {
  Home: ComponentType;
  Add: ComponentType;
  AppSettings: ComponentType;
  tournament: Partial<Record<TournamentTab, ComponentType<ScreenProps>>> & { now: ComponentType<ScreenProps> };
} = {
  Home,
  Add,
  AppSettings: Placeholder,
  tournament: { now: AllGames },
};
