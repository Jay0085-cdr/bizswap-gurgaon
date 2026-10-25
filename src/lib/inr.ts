// Indian number formatting: ₹12,34,567 and compact ₹12.3 L / ₹1.25 Cr.
const LAKH = 1_00_000;
const CRORE = 1_00_00_000;

export function formatINR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}₹${rest ? `${rest},` : ''}${last3}`;
}

function trim(x: number, digits: number) {
  return x.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

export function formatINRCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= CRORE) return `${sign}₹${trim(a / CRORE, 2)} Cr`;
  if (a >= LAKH) return `${sign}₹${trim(a / LAKH, 1)} L`;
  if (a >= 1000) return `${sign}₹${trim(a / 1000, 1)}K`;
  return formatINR(n);
}

export function formatRange(lo?: number | null, hi?: number | null) {
  if (!lo && !hi) return '—';
  if (lo && hi) return `${formatINRCompact(lo)} – ${formatINRCompact(hi)}`;
  return formatINRCompact(lo ?? hi);
}

export function formatNumberIN(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return formatINR(n).replace('₹', '');
}
