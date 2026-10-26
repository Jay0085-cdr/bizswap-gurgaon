export function inr(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  const t = (x: number, d: number) => x.toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  if (a >= 1e7) return `₹${t(n / 1e7, 2)} Cr`;
  if (a >= 1e5) return `₹${t(n / 1e5, 1)} L`;
  if (a >= 1e3) return `₹${t(n / 1e3, 1)}K`;
  return `₹${Math.round(n)}`;
}

export function fmtField(type: string, v: unknown, unit?: string) {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'inr') return `${inr(Number(v))}${unit && unit.startsWith('per') ? ` ${unit.replace('per ', '/')}` : ''}`;
  if (type === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  const s = type === 'number' && typeof v === 'number' ? v.toLocaleString('en-IN') : String(v);
  return `${s}${unit && type === 'number' ? ` ${unit}` : ''}`;
}
