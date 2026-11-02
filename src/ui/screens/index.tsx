import type { ComponentType } from 'react';
import type { TournamentTab } from '../router';
import { Home } from './Home';
import { Add } from './Add';
import { Now } from './Now';
import { Schedule } from './Schedule';
import { Teams } from './Teams';
import { Team } from './Team';
import { Pools } from './Pools';
import { Brackets, StandingsScreen } from './Brackets';
import { Info } from './Info';

export interface ScreenProps {
  arg?: string;
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
  tournament: { now: Now, schedule: Schedule, teams: Teams, team: Team, pools: Pools, brackets: Brackets, info: Info, standings: StandingsScreen },
};
