/**
 * Stand-in for the hero screenshot: a still of the map with one home's routes
 * drawing out to its life anchors, one at a time, like the app does.
 * Decorative only; the copy beside it carries the message.
 */
const ROUTES = [
  { d: "M150 330 L200 300 L300 300 L310 230 L430 215 L470 120", color: "#6E93D6" },
  { d: "M150 330 L120 250 L95 140", color: "#DB935C" },
  { d: "M150 330 L250 345 L360 340 L440 360", color: "#C97AA2" },
];

export function HeroMap() {
  return (
    <div className="l-map" aria-hidden="true">
      <svg viewBox="0 0 600 520" preserveAspectRatio="xMidYMid slice">
        <rect width="600" height="520" fill="#ECEEE9" />
        <path d="M0 400 C120 380 160 470 300 455 S520 400 600 430 V520 H0 Z" fill="#D7E4EE" />
        <rect x="380" y="60" width="130" height="90" rx="14" fill="#DDEBD9" />
        <rect x="20" y="200" width="70" height="60" rx="10" fill="#DDEBD9" />
        <g stroke="#FFFFFF" strokeWidth="9" fill="none" strokeLinecap="round">
          <path d="M-10 120 L610 160" /><path d="M60 -10 L130 530" /><path d="M-10 300 L610 250" /><path d="M320 -10 L280 530" /><path d="M470 -10 L520 530" />
        </g>
        <g stroke="#FFFFFF" strokeWidth="4" fill="none">
          <path d="M-10 210 L610 205" /><path d="M200 -10 L190 530" /><path d="M-10 60 L610 90" /><path d="M390 -10 L400 530" /><path d="M-10 470 L610 490" />
        </g>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M175 365 L190 300 L320 290 L330 200 L470 180" stroke="#B5BBC3" strokeWidth="3" />
          <path d="M175 365 L110 270 L95 140" stroke="#B5BBC3" strokeWidth="3" />
          {ROUTES.map((r, i) => (
            <g key={i} className="l-route" style={{ "--i": i } as React.CSSProperties}>
              <path d={r.d} pathLength={1} stroke="#FFFFFF" strokeWidth="10" />
              <path d={r.d} pathLength={1} stroke={r.color} strokeWidth="6" />
            </g>
          ))}
        </g>
        <circle cx="175" cy="365" r="8" fill="#6B737C" stroke="#FFFFFF" strokeWidth="3" />
        <circle cx="150" cy="330" r="13" fill="#2C3038" stroke="#FFFFFF" strokeWidth="4" />
        <circle cx="470" cy="120" r="9" fill="#4F77C2" stroke="#FFFFFF" strokeWidth="3" />
        <circle cx="95" cy="140" r="9" fill="#C2763D" stroke="#FFFFFF" strokeWidth="3" />
        <circle cx="440" cy="360" r="9" fill="#B05D88" stroke="#FFFFFF" strokeWidth="3" />
      </svg>
      <div className="l-home" style={{ left: "5%", top: "70%" }}>
        <b>12 Valley Rd</b>
        <span>Mt Eden · $650/wk · 2 bed</span>
      </div>
      <div className="l-tab" style={{ left: "38%", top: "86%" }}>Beach Rd · $590</div>
      <div className="l-place" style={{ right: "5%", top: "7%", "--c": "#4F77C2", "--i": 0 } as React.CSSProperties}>
        <span className="l-place-h">Work</span>
        <span className="l-place-b"><b>14 min</b><em className="good">Fastest</em></span>
      </div>
      <div className="l-place" style={{ left: "5%", top: "6%", "--c": "#C2763D", "--i": 1 } as React.CSSProperties}>
        <span className="l-place-h">Gym</span>
        <span className="l-place-b"><b>7 min</b><em>2nd of 3</em></span>
      </div>
      <div className="l-place" style={{ right: "5%", top: "71%", "--c": "#B05D88", "--i": 2 } as React.CSSProperties}>
        <span className="l-place-h">Sam’s place</span>
        <span className="l-place-b"><b>11 min</b><em>Drive · 9–14 at peak</em></span>
      </div>
    </div>
  );
}
