import { useTranslation } from 'react-i18next';

const SWEEP = 60;

function point(cents: number, radius: number) {
  const angle = cents / 50 * SWEEP * Math.PI / 180;
  return { x: 200 + Math.sin(angle) * radius, y: 200 - Math.cos(angle) * radius };
}

function arc(from: number, to: number, radius: number) {
  const start = point(from, radius);
  const end = point(to, radius);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

export function NeedleDial({ cents }: { cents: number | null }) {
  const { t } = useTranslation();
  const hasReading = cents !== null && Number.isFinite(cents);
  const angle = hasReading ? Math.max(-50, Math.min(50, cents)) / 50 * SWEEP : 0;
  const inTune = hasReading && Math.abs(cents) <= 3;

  return (
    <svg className={`needle-dial ${hasReading ? 'has-reading' : ''} ${inTune ? 'is-in-tune' : ''}`}
      viewBox="0 0 400 400" role="img" aria-label={t('tuner.needleDial')}>
      <circle className="needle-ring-edge" cx="200" cy="200" r="136" />
      <circle className="needle-ring-edge" cx="200" cy="200" r="182" />
      <circle className="needle-scale-band" cx="200" cy="200" r="159" />
      <path className="needle-tune-band" d={arc(-3, 3, 159)} />
      {Array.from({ length: 21 }, (_, index) => {
        const value = index * 5 - 50;
        const major = index % 5 === 0;
        const outer = point(value, major ? 195 : 190);
        const inner = point(value, 186);
        return (
          <g key={value} className={value === 0 ? 'needle-zero' : undefined}>
            <line className={`needle-tick ${major ? 'needle-tick--major' : ''}`}
              x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />
          </g>
        );
      })}
      {[-50, -25, 0, 25, 50].map((value) => {
        const label = point(value, 212);
        return <text key={value} className={`needle-scale-label ${value === 0 ? 'needle-zero-label' : ''}`}
          x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central">
          {value > 0 ? `+${value}` : value === 0 ? '0' : `−${Math.abs(value)}`}
        </text>;
      })}
      <g className="needle-pointer" style={{ transform: `rotate(${angle}deg)` }}>
        <path d="M 200 18 L 204 102 Q 200 110 196 102 Z" />
      </g>
    </svg>
  );
}
