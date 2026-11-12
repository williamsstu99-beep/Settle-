/**
 * The Settle mark: an "S" drawn as a route in two place colours, starting at a
 * ring (where you are) and ending at the home dot.
 */
export function SettleMark({ size = 32, onDark = false }: { size?: number; onDark?: boolean }) {
  const top = onDark ? "#8FB0EA" : "#4F77C2", bottom = onDark ? "#E8A878" : "#C2763D";
  const ink = onDark ? "#FFFFFF" : "#2C3038", paper = onDark ? "#2C3038" : "#FFFFFF";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <g transform="translate(48 0) scale(-1 1)">
        <path d="M13 10 H31 A7 7 0 0 1 31 24 H24" fill="none" stroke={top} strokeWidth="5" strokeLinecap="round" />
        <path d="M24 24 H17 A7 7 0 0 0 17 38 H33" fill="none" stroke={bottom} strokeWidth="5" strokeLinecap="round" />
        <circle cx="9" cy="10" r="3.6" fill={paper} stroke={ink} strokeWidth="2.6" />
        <circle cx="38" cy="38" r="5" fill={ink} />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 26, mark = 32 }: { size?: number; mark?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <SettleMark size={mark} />
      <span>settle</span>
    </span>
  );
}
