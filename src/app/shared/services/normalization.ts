import { A3Record, PdfReceipt } from '../models/reconciliation.models';

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

export function normalizeNif(value: string): string {
  return value.replace(/[\s.\-]/g, '').toUpperCase();
}

export function normalizeModel(value: string): string {
  return value.trim().toUpperCase().replace(/^MODELO\s*/i, '').replace(/\s+/g, '');
}

export function normalizePeriod(value: string, fallbackYear = ''): string {
  const upper = value.trim().toUpperCase().replace(/\s+/g, ' ');
  const year = upper.match(/\b(20\d{2})\b/)?.[1] ?? fallbackYear.match(/\b(20\d{2})\b/)?.[1] ?? '';
  const quarter = upper.match(/\b([1-4])\s*[TQ]\b/);
  const month = upper.match(/\b(0?[1-9]|1[0-2])\s*(?:M|MES)?\b/);
  const annual = /\b(?:0A|ANUAL|ANNUAL)\b/.test(upper);

  if (quarter) {
    return year ? `${quarter[1]}T/${year}` : `${quarter[1]}T`;
  }
  if (annual) {
    return year ? `0A/${year}` : '0A';
  }
  if (month) {
    const normalizedMonth = month[1].padStart(2, '0');
    return year ? `${normalizedMonth}/${year}` : normalizedMonth;
  }

  return upper
    .replace(/[.\-]/g, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '');
}

export function buildKey(record: Pick<A3Record | PdfReceipt, 'nif' | 'model' | 'period'>): string {
  const nif = normalizeNif(record.nif);
  const model = normalizeModel(record.model);
  const period = normalizePeriod(record.period);
  return nif && model && isCompletePeriod(period) ? `${nif}|${model}|${period}` : '';
}

export function isCompletePeriod(period: string): boolean {
  return /^(?:[1-4]T|0A|(?:0[1-9]|1[0-2]))\/20\d{2}$/.test(period);
}

export function namesAreSimilar(left: string, right: string): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}
