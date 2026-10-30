const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const Icons = {
  menu: <svg width="22" height="22" viewBox="0 0 24 24" {...base} aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>,
  search: <svg width="22" height="22" viewBox="0 0 24 24" {...base} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  searchSm: <svg width="18" height="18" viewBox="0 0 24 24" {...base} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  back: <svg width="22" height="22" viewBox="0 0 24 24" {...base} strokeWidth={2.2} aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" {...base} strokeWidth={2.2} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  chevron: <svg width="18" height="18" viewBox="0 0 24 24" {...base} strokeWidth={2.2} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>,
  star: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>,
  starOutline: <svg width="16" height="16" viewBox="0 0 24 24" {...base} aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>,
  warn: <svg width="18" height="18" viewBox="0 0 24 24" {...base} aria-hidden="true"><path d="M12 3 2 20h20zM12 10v4M12 17v.5" /></svg>,
  offline: <svg width="18" height="18" viewBox="0 0 24 24" {...base} aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19v.5M3 3l18 18" /></svg>,
  whatif: <svg width="20" height="20" viewBox="0 0 24 24" {...base} aria-hidden="true"><path d="M6 3v12a3 3 0 0 0 3 3h9M15 15l3 3-3 3" /></svg>,
  list: <svg width="20" height="20" viewBox="0 0 24 24" {...base} aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.5M3 12h.5M3 18h.5" /></svg>,
  grid: <svg width="20" height="20" viewBox="0 0 24 24" {...base} aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></svg>,
  now: <svg width="24" height="24" viewBox="0 0 24 24" {...base} aria-hidden="true"><circle cx="12" cy="12" r="2.5" /><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" /></svg>,
  schedule: <svg width="24" height="24" viewBox="0 0 24 24" {...base} aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  teams: <svg width="24" height="24" viewBox="0 0 24 24" {...base} aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></svg>,
  pools: <svg width="24" height="24" viewBox="0 0 24 24" {...base} aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14h18M9 9v11" /></svg>,
  brackets: <svg width="24" height="24" viewBox="0 0 24 24" {...base} aria-hidden="true"><path d="M3 5h5v5M3 19h5v-5M8 10v4h5M13 7h4v10h-4M17 12h4" /></svg>,
  logo: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="1.5" stroke="#FFFFFF" strokeOpacity=".55" strokeWidth="1.6" />
      <path d="M7 6v12M17 6v12" stroke="#FFFFFF" strokeOpacity=".55" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="4.2" ry="2.2" fill="#FF6A3D" />
    </svg>
  ),
};
