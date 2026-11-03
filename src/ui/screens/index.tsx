import { lazy, type ComponentType } from 'react';
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
const WhatIf = lazy(() => import('./WhatIf').then((m) => ({ default: m.WhatIf })));
const Settings = lazy(() => import('./Settings').then((m) => ({ default: m.Settings })));
const AppSettings = lazy(() => import('./AppSettings').then((m) => ({ default: m.AppSettings })));
const Diagnostics = lazy(() => import('./Diagnostics').then((m) => ({ default: m.Diagnostics })));
const Manual = lazy(() => import('./Manual').then((m) => ({ default: m.Manual })));
const FormatEditor = lazy(() => import('./FormatEditor').then((m) => ({ default: m.FormatEditor })));
const Review = lazy(() => import('./Review').then((m) => ({ default: m.Review })));

// Rarely used screens are split out of the main bundle.
export interface ScreenProps {
  arg?: string;
}

export const screens: {
  Home: ComponentType;
  Add: ComponentType;
  AppSettings: ComponentType;
  tournament: Partial<Record<TournamentTab, ComponentType<ScreenProps>>> & { now: ComponentType<ScreenProps> };
} = {
  Home,
  Add,
  AppSettings,
  tournament: { now: Now, schedule: Schedule, teams: Teams, team: Team, pools: Pools, brackets: Brackets, info: Info, standings: StandingsScreen, whatif: WhatIf, settings: Settings, diagnostics: Diagnostics, manual: Manual, format: FormatEditor, review: Review },
};
