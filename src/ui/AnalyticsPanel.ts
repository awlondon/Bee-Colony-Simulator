import type { HistorySample } from '../sim/types';

interface Metric {
  key: keyof Omit<HistorySample, 't'>;
  label: string;
  color: string;
  unit: string;
  digits: number;
}

const METRICS: Metric[] = [
  { key: 'population', label: 'Adult bees', color: '#f4b73a', unit: '', digits: 0 },
  { key: 'brood', label: 'Brood', color: '#e98fb0', unit: '', digits: 0 },
  { key: 'honey', label: 'Honey + nectar', color: '#ffd23f', unit: ' kg', digits: 1 },
  { key: 'pollen', label: 'Pollen', color: '#ffb347', unit: ' kg', digits: 2 },
];

const W = 160;
const H = 24;
const MAX_POINTS = 96; // four game days of hourly samples

/** Sparklines of colony history, drawn as inline SVG. */
export function analyticsHtml(history: readonly HistorySample[]): string {
  const data = history.slice(-MAX_POINTS);
  if (data.length < 2) return '<div class="note">Collecting data…</div>';
  return METRICS.map((m) => {
    const vals = data.map((d) => d[m.key]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const pts = vals
      .map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - min) / span) * (H - 6)).toFixed(1)}`)
      .join(' ');
    const last = vals[vals.length - 1];
    const fmt = last.toLocaleString(undefined, { maximumFractionDigits: m.digits, minimumFractionDigits: m.digits });
    return `<div class="spark"><div class="row"><span>${m.label}</span><b>${fmt}${m.unit}</b></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${m.label} history">
        <polyline fill="none" stroke="${m.color}" stroke-width="1.6" stroke-linejoin="round" points="${pts}"/>
      </svg></div>`;
  }).join('');
}
