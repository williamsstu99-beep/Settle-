import type { AnchorIcon, Mode } from "@/core/types";

const P = {
  drive: <><path d="M2.5 10.5V8l1.6-3.4c.2-.4.5-.6.9-.6h6c.4 0 .7.2.9.6L13.5 8v2.5" /><path d="M2 8.5h12v3H2z" /></>,
  transit: <><rect x="3.5" y="2" width="9" height="10" rx="2" /><path d="M3.5 7.5h9M6 14l-1.2-2M10 14l1.2-2" /></>,
  bike: <><circle cx="3.8" cy="10.5" r="2.6" /><circle cx="12.2" cy="10.5" r="2.6" /><path d="M3.8 10.5 6.5 5h4l1.7 5.5M6.5 5 8.5 10.5h-4.7" /></>,
  train: <><rect x="4" y="2" width="8" height="9.5" rx="2" /><path d="M4 7h8M6 14l1-2.5M10 14l-1-2.5" /><circle cx="6.3" cy="9.2" r=".5" /><circle cx="9.7" cy="9.2" r=".5" /></>,
  ferry: <><path d="M2 11.5c1.2 1 2.4 1 3.6 0 1.2 1 2.4 1 3.6 0 1.2 1 2.4 1 3.6 0" /><path d="M3.5 9.5 4.5 6h7l1 3.5M6.5 6V3.5h3V6" /></>,
  walk: <><circle cx="8.5" cy="2.8" r="1.3" /><path d="M7 14l1.2-4.2L6.5 8l.8-3 2.4 1.3 1.6 1.7M9.5 14l-1.3-4.2M7.3 5 5 7" /></>,
  work: <><rect x="2.5" y="5" width="11" height="8" rx="1.5" /><path d="M6 5V3.5h4V5M2.5 9h11" /></>,
  gym: <path d="M2 8h12M4.5 4.5v7M11.5 4.5v7M2.5 6v4M13.5 6v4" />,
  partner: <path d="M8 13.2S2.5 10 2.5 6.3A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5 1.3C13.5 10 8 13.2 8 13.2z" />,
  family: <><path d="M2.5 7.5 8 3l5.5 4.5V13h-11z" /><path d="M6.5 13V9.5h3V13" /></>,
  study: <><path d="M1.5 6.5 8 3.5l6.5 3L8 9.5z" /><path d="M4.5 8v3c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5V8" /></>,
  cafe: <><path d="M3 5.5h8v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" /><path d="M11 6.5h1a1.8 1.8 0 0 1 0 3.6h-1M5.5 2.5v1.5M8.5 2.5v1.5" /></>,
  other: <><path d="M8 14s-4.5-4.2-4.5-7.5a4.5 4.5 0 0 1 9 0C12.5 9.8 8 14 8 14z" /><circle cx="8" cy="6.5" r="1.5" /></>,
  house: <><path d="M2.5 7.5 8 3l5.5 4.5v6h-11z" /><path d="M6.5 13.5V10h3v3.5" /></>,
  apartment: <><rect x="3.5" y="2" width="9" height="12" rx="1" /><path d="M6 5h1M9 5h1M6 8h1M9 8h1M7 14v-2.5h2V14" /></>,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  expand: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  anchor: <><circle cx="8" cy="3.4" r="1.6" /><path d="M8 5v9M5.2 7.6h5.6M2.6 9.6A5.4 5.4 0 0 0 8 14a5.4 5.4 0 0 0 5.4-4.4" /></>,
  house2: <><path d="M2.6 7.4 8 2.8l5.4 4.6V13a.8.8 0 0 1-.8.8H3.4a.8.8 0 0 1-.8-.8z" /><path d="M6.4 13.8V9.6h3.2v4.2" /></>,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  external: <path d="M9 3h4v4M13 3L7.5 8.5M11.5 9.5V13h-9V4H6" />,
  camera: <><path d="M2.5 5.5h2.2l1.1-1.6h4.4l1.1 1.6h2.2v7h-11z" /><circle cx="8" cy="8.8" r="2.1" /></>,
  back: <path d="M13 8H3M7 4 3 8l4 4" />,
  arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
  chev: <path d="M4 6l4 4 4-4" />,
  clock: <><circle cx="8" cy="8" r="5.8" /><path d="M8 5v3.2l2 1.3" /></>,
  search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>,
  link: <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />,
  share: <><circle cx="12" cy="3.5" r="1.8" /><circle cx="4" cy="8" r="1.8" /><circle cx="12" cy="12.5" r="1.8" /><path d="m5.6 7.1 4.8-2.7M5.6 8.9l4.8 2.7" /></>,
  logo: <><path d="M2.5 7.5 8 3l5.5 4.5V13h-11z" /><circle cx="8" cy="9.4" r="1.6" /></>,
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, size = 16, className, style }: { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

export const ANCHOR_ICONS: { id: AnchorIcon; label: string }[] = [
  { id: "work", label: "Work" },
  { id: "gym", label: "Gym" },
  { id: "partner", label: "Partner" },
  { id: "family", label: "Family" },
  { id: "study", label: "Study" },
  { id: "cafe", label: "Café" },
  { id: "other", label: "Other" },
];

export const MODE_LABEL: Record<Mode, string> = { transit: "Transit", drive: "Drive", bike: "Bike", walk: "Walk" };

export const optionIcon = (type?: string): IconName => (type && /apartment|studio|flat/i.test(type) ? "apartment" : "house");
