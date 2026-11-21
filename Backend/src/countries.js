import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'countries.json');
const { countries } = JSON.parse(readFileSync(file, 'utf8'));

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const byKey = new Map();
for (const c of countries) {
  for (const n of [c.name, c.iso2, ...c.aliases]) {
    const k = key(n);
    if (k && !byKey.has(k)) byKey.set(k, c);
  }
}

/** Resolve free-text country names ("USA", "United States", "U.S.") to a canonical record. */
export function resolveCountry(name) {
  if (!name) return null;
  const k = key(name);
  if (!k || k === 'unknown' || k === 'na' || k === 'global') return null;
  return byKey.get(k) || null;
}

export function canonicalCountryName(name) {
  const c = resolveCountry(name);
  return c ? c.name : null;
}
