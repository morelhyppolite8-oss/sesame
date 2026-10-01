import type { SVGProps } from 'react';

const paths = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  month: 'M4.5 6.5h15v13h-15zM4.5 10h15M8.5 4v4M15.5 4v4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12.6a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2z',
  wealth: 'M3.5 20.5h17M5 20.5V10M9.7 20.5V10M14.3 20.5V10M19 20.5V10M3 9.5 12 4l9 5.5z',
  settings: 'M5 7h9M18 7h1M5 17h1M10 17h9M5 12h4M13 12h6M16 5v4M8 15v4M11 10v4',
  plus: 'M12 5v14M5 12h14',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.4C3.9 9.1 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  check: 'M5 12.5 10 17 19 7.5',
  chevronRight: 'M9.5 5.5 16 12l-6.5 6.5',
  chevronLeft: 'M14.5 5.5 8 12l6.5 6.5',
  chevronDown: 'M5.5 9.5 12 16l6.5-6.5',
  arrowRight: 'M4.5 12h15M13.5 6l6 6-6 6',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  lock: 'M6 10.5h12v10H6zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9.5l5-5 5 5M5 20h14',
  trash: 'M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13',
  edit: 'M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  umbrella: 'M3 12a9 9 0 0 1 18 0zM12 12v6.5a2 2 0 0 1-4 0M12 3v0',
  x: 'M6 6l12 12M18 6 6 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.8v.01',
  calendarPlus: 'M4.5 6.5h15v13h-15zM4.5 10h15M8.5 4v4M15.5 4v4M12 12.5v5M9.5 15h5',
  file: 'M6 3.5h8l4 4V20.5H6zM14 3.5v4h4M9 13h6M9 16.5h6',
  sparkle: 'M12 3.5l1.6 5.4L19 10.5l-5.4 1.6L12 17.5l-1.6-5.4L5 10.5l5.4-1.6z',
  transfer: 'M4.5 8.5h14M14.5 4.5l4 4-4 4M19.5 15.5h-14M9.5 11.5l-4 4 4 4',
  chart: 'M4 20h16M6.5 16l4-5 3.5 3 5-7',
  back: 'M19.5 12h-15M10.5 6l-6 6 6 6',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  review: 'M5 4.5h14v15H5zM8.5 9h7M8.5 12.5h7M8.5 16h4',
  receipt: 'M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3zM9 8h6M9 11.5h6M9 15h3',
  shield: 'M12 3.5 19 6v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z',
  backspace: 'M9 5.5h11v13H9l-5.5-6.5zM12.5 9.5l5 5M17.5 9.5l-5 5',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, strokeWidth = 1.4, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
