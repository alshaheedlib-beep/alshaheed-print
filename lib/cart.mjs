import { all, get, run, tx } from './db.mjs';
import { parseCookies, cookieHeader, int } from './util.mjs';
import { parseTiers, discountFor, unitPrice, normalizeQty, round2 } from './pricing.mjs';

const COOKIE = 'sh_cart';
const MAX_LINES = 40;
export const MAX_QTY = 1000000;

/** cookie format: "variantId:qty,variantId:qty" — always re-validated against the database. */
export function readCartCookie(req) {
  const raw = parseCookies(req)[COOKIE] || '';
  const lines = [];
  const seen = new Set();
  for (const part of raw.split(',').slice(0, MAX_LINES)) {
    const [v, q] = part.split(':');
    const vid = int(v), qty = int(q);
    if (vid > 0 && qty > 0 && !seen.has(vid)) { seen.add(vid); lines.push({ vid, qty: Math.min(qty, MAX_QTY) }); }
  }
  return lines;
}
export const cartCookie = (lines) =>
  cookieHeader(COOKIE, lines.map((l) => `${l.vid}:${l.qty}`).join(','), { maxAge: 60 * 60 * 24 * 30 });
export const clearCartCookie = () => cookieHeader(COOKIE, '', { maxAge: 0 });

const LINE_SQL = `SELECT v.id AS vid, v.label_ar, v.label_en, v.price, v.old_price, v.stock, v.sku,
  p.id AS pid, p.slug, p.name_ar, p.name_en, p.image, p.active, p.min_qty, p.step, p.tiers, p.quote, p.unit_ar, p.unit_en,
  c.image AS cimage, COALESCE(d.mode, 'cart') AS mode
  FROM variants v JOIN products p ON p.id = v.product_id
  LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN departments d ON d.id = c.department_id WHERE v.id = ?`;

/** Hydrate cookie lines with live data: enforce minimums / steps, apply quantity discounts, drop unavailable lines. */
export function hydrate(lines) {
  const out = [];
  let adjusted = false, removed = false;
  for (const l of lines) {
    const row = get(LINE_SQL, l.vid);
    if (!row || !row.active || row.stock <= 0 || row.quote || !(row.price > 0)) { removed = true; continue; }
    const qty = normalizeQty(l.qty, row.min_qty, row.step, Math.min(row.stock, MAX_QTY));
    if (qty !== l.qty) adjusted = true;
    const pct = discountFor(parseTiers(row.tiers), qty);
    const unit = unitPrice(row.price, pct);
    out.push({ ...row, qty, pct, unit, line: round2(unit * qty) });
  }
  const subtotal = round2(out.reduce((s, x) => s + x.line, 0));
  return { items: out, subtotal, count: out.length, adjusted, removed };
}

export function shippingFor(subtotal, zone, freeMin) {
  if (!zone) return null;
  if (freeMin > 0 && subtotal >= freeMin) return 0;
  return zone.fee;
}

export function addToCart(lines, vid, qty) {
  const v = get(LINE_SQL, vid);
  if (!v || !v.active || v.stock <= 0 || v.quote || !(v.price > 0)) return { lines, ok: false };
  const next = lines.map((l) => ({ ...l }));
  const found = next.find((l) => l.vid === vid);
  const max = Math.min(v.stock, MAX_QTY);
  if (found) found.qty = normalizeQty(found.qty + qty, v.min_qty, v.step, max);
  else next.push({ vid, qty: normalizeQty(qty, v.min_qty, v.step, max) });
  return { lines: next.slice(0, MAX_LINES), ok: true };
}

/** Create the order inside one transaction, re-checking stock. */
export function placeOrder({ items, form, zone, shipping, subtotal, lang, logo }) {
  return tx(() => {
    for (const it of items) {
      const cur = get('SELECT stock FROM variants WHERE id = ?', it.vid);
      if (!cur || cur.stock < it.qty) throw Object.assign(new Error('stock'), { code: 'stock' });
    }
    const total = round2(subtotal + shipping);
    const number = nextNumber('SH', 'orders');
    const r = run(
      `INSERT INTO orders(number, payment_method, payment_status, name, phone, email, business, zone_id, zone_name, city, address, notes, logo, logo_name, subtotal, shipping, total, lang)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      number, form.payment, 'pending', form.name, form.phone, form.email || '', form.business || '', zone.id,
      lang === 'en' ? zone.name_en : zone.name_ar, form.city || '', form.address, form.notes || '',
      logo?.path || '', logo?.name || '', subtotal, shipping, total, lang);
    const oid = Number(r.lastInsertRowid);
    for (const it of items) {
      run('INSERT INTO order_items(order_id, product_id, variant_id, name, variant_label, price, qty, discount) VALUES (?,?,?,?,?,?,?,?)',
        oid, it.pid, it.vid, lang === 'en' ? it.name_en : it.name_ar, lang === 'en' ? it.label_en : it.label_ar, it.unit, it.qty, it.pct);
      run('UPDATE variants SET stock = stock - ? WHERE id = ?', it.qty, it.vid);
      run('UPDATE products SET sold = sold + ? WHERE id = ?', it.qty, it.pid);
    }
    return { id: oid, number, total };
  });
}

export function nextNumber(prefix, table) {
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  for (let i = 0; i < 20; i++) {
    const n = `${prefix}-${ymd}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    if (!get(`SELECT 1 FROM ${table} WHERE number = ?`, n)) return n;
  }
  return `${prefix}-${Date.now()}`;
}

export const orderByNumber = (n) => get('SELECT * FROM orders WHERE number = ?', n);
export const orderItems = (oid) => all('SELECT * FROM order_items WHERE order_id = ?', oid);
export const quoteByNumber = (n) => get('SELECT * FROM quotes WHERE number = ?', n);

/** Return stock to inventory (used when an order is cancelled from admin). */
export function restock(orderId) {
  tx(() => {
    for (const it of all('SELECT * FROM order_items WHERE order_id = ?', orderId)) {
      if (it.variant_id) run('UPDATE variants SET stock = stock + ? WHERE id = ?', it.qty, it.variant_id);
    }
  });
}
