import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 22): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

const make = (d: React.ReactNode) =>
  function Icon({ size, ...rest }: P) {
    return (
      <svg {...base(size)} {...rest}>
        {d}
      </svg>
    );
  };

export const INow = make(
  <>
    <circle cx="12" cy="12" r="2.5" />
    <path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
  </>,
);
export const ISchedule = make(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
);
export const ITeams = make(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
  </>,
);
export const IPools = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M3 14h18M9 9v11" />
  </>,
);
export const IBrackets = make(<path d="M3 5h5v5M3 19h5v-5M8 10v4h5M13 7h4v10h-4M17 12h4" />);
export const IInfo = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </>,
);
export const ISearch = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const IStar = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(p.size)} {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);
export const IPitch = make(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
    <path d="M7 6v12M17 6v12" />
  </>,
);
export const IWhatIf = make(<path d="M6 3v12a3 3 0 0 0 3 3h9M15 15l3 3-3 3M18 6l-3 3M18 9V6h-3" />);
export const IReplay = make(<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 8v4l3 2" />);
export const IRefresh = make(<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />);
export const IWarn = make(<path d="M12 3 2 20h20zM12 10v4M12 17v.5" />);
export const IClose = make(<path d="M6 6l12 12M18 6 6 18" />);
export const IChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const IChevronRight = make(<path d="m9 6 6 6-6 6" />);
export const IChevronLeft = make(<path d="m15 6-6 6 6 6" />);
export const IArrowRight = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IOffline = make(<path d="M3 3l18 18M9 15.5a5 5 0 0 1 6 0M12 19v.5M5 12a10 10 0 0 1 4-2.5M19 12a10 10 0 0 0-2.4-1.8M2 8.5a15 15 0 0 1 5-3M22 8.5a15 15 0 0 0-9-4" />);
export const IShare = make(<path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" />);
export const ISettings = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
);
export const IPlus = make(<path d="M12 5v14M5 12h14" />);
export const IMore = make(
  <>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </>,
);
export const IClock = make(<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />);
export const IList = make(<path d="M4 5h16v5H4zM4 14h16v5H4z" />);
export const ISliders = make(<path d="M4 7h10M18 7h2M14 5v4M4 17h4M12 17h8M8 15v4" />);
export const ICheck = make(<path d="M5 12l5 5L20 7" />);
export const ISparkle = make(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />);
export const IPlay = make(<path d="M7 4l13 8-13 8z" />);
export const IPause = make(<path d="M8 4v16M16 4v16" />);
export const IExternal = make(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />);
export const ICopy = make(
  <>
    <rect x="8" y="8" width="13" height="13" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </>,
);
