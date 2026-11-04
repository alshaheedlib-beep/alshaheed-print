/*
  Quantity discount tiers are stored on the product as text: "100:5, 500:10, 1000:15"
  meaning 5% off from 100 units, 10% from 500, 15% from 1000. Prices are always recomputed
  on the server from the database; the browser only previews them.
*/
export function parseTiers(text) {
  return String(text || '')
    .split(/[,\n،]+/)
    .map((s) => s.trim().split(/[:=]/).map((x) => Number(String(x).trim())))
    .filter(([q, pct]) => Number.isFinite(q) && Number.isFinite(pct) && q > 0 && pct > 0 && pct < 90)
    .map(([q, pct]) => ({ qty: Math.round(q), pct }))
    .sort((a, b) => a.qty - b.qty);
}
export const formatTiers = (tiers) => tiers.map((t) => `${t.qty}:${t.pct}`).join(', ');

export function discountFor(tiers, qty) {
  let pct = 0;
  for (const t of tiers) if (qty >= t.qty) pct = t.pct;
  return pct;
}
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const unitPrice = (price, pct) => round2(price * (1 - pct / 100));

/** Clamp a requested quantity to the product's minimum and step. */
export function normalizeQty(qty, min = 1, step = 1, max = 1000000) {
  min = Math.max(1, min | 0); step = Math.max(1, step | 0);
  let q = Math.max(min, Math.min(max, Math.round(Number(qty) || min)));
  if (step > 1) q = min + Math.ceil((q - min) / step) * step;
  return Math.min(q, max);
}
