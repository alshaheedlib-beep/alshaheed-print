import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { DATA_DIR } from './util.mjs';

export const db = new DatabaseSync(path.join(DATA_DIR, 'store.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

/*
  Structure: department (4 top-level sections) → category → product → variants (size / option + price).
  department.mode decides how its products are ordered:
    cart      — add to cart and check out (المطبعة)
    quote     — request a quote with measurements / photos (اللافتات، التسويق)
    wholesale — cart, bulk units and quantity tiers (الجملة)
  A single product can also force a quote with products.quote = 1.
*/
db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  blurb_ar TEXT DEFAULT '',
  blurb_en TEXT DEFAULT '',
  image TEXT DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'cart',
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  slug TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  blurb_ar TEXT DEFAULT '',
  blurb_en TEXT DEFAULT '',
  image TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  short_ar TEXT DEFAULT '',
  short_en TEXT DEFAULT '',
  desc_ar TEXT DEFAULT '',
  desc_en TEXT DEFAULT '',
  unit_ar TEXT DEFAULT 'للقطعة',
  unit_en TEXT DEFAULT 'per piece',
  min_qty INTEGER DEFAULT 1,
  step INTEGER DEFAULT 1,
  tiers TEXT DEFAULT '',
  days_ar TEXT DEFAULT '',
  days_en TEXT DEFAULT '',
  quote INTEGER DEFAULT 0,
  badge TEXT DEFAULT '',
  image TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sold INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label_ar TEXT NOT NULL,
  label_en TEXT NOT NULL,
  price REAL NOT NULL,
  old_price REAL DEFAULT 0,
  stock INTEGER DEFAULT 1000000,
  sku TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  eta_ar TEXT DEFAULT '',
  eta_en TEXT DEFAULT '',
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'new',
  payment_method TEXT NOT NULL,
  payment_status TEXT DEFAULT 'pending',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  business TEXT DEFAULT '',
  zone_id INTEGER,
  zone_name TEXT DEFAULT '',
  city TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  logo_name TEXT DEFAULT '',
  subtotal REAL NOT NULL,
  shipping REAL NOT NULL,
  total REAL NOT NULL,
  lang TEXT DEFAULT 'ar'
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  variant_id INTEGER,
  name TEXT NOT NULL,
  variant_label TEXT DEFAULT '',
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  discount REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'new',
  department_id INTEGER,
  department_name TEXT DEFAULT '',
  product_id INTEGER,
  product_name TEXT DEFAULT '',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  business TEXT DEFAULT '',
  city TEXT DEFAULT '',
  width REAL DEFAULT 0,
  height REAL DEFAULT 0,
  qty INTEGER DEFAULT 0,
  budget TEXT DEFAULT '',
  details TEXT DEFAULT '',
  file TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  admin_note TEXT DEFAULT '',
  lang TEXT DEFAULT 'ar'
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

/* ---------- helpers ---------- */
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

let txDepth = 0;
/** Re-entrant transaction: the outermost call BEGINs, nested calls use SAVEPOINTs. (All DB work is synchronous.) */
export function tx(fn) {
  if (txDepth > 0) {
    const sp = `sp${txDepth}`;
    db.exec(`SAVEPOINT ${sp}`);
    txDepth++;
    try { const r = fn(); db.exec(`RELEASE ${sp}`); return r; }
    catch (e) { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`); throw e; }
    finally { txDepth--; }
  }
  db.exec('BEGIN IMMEDIATE');
  txDepth++;
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
  finally { txDepth--; }
}

export const DEFAULT_SETTINGS = {
  store_name_ar: 'مطبعة الشهيد',
  store_name_en: 'Al-Shaheed Press',
  tagline_ar: 'لافتات، طباعة، تسويق ومواد خام — كل شغل مشروعك من مكان واحد',
  tagline_en: 'Signs, printing, marketing and supplies — everything your business needs in one place',
  whatsapp: '972597323130',
  phone_cc: '970',
  phone: '0597323130',
  email: 'alshaheedlib@gmail.com',
  address_ar: 'الخليل – دائرة السير',
  address_en: 'Hebron – Traffic Department roundabout',
  hours_ar: 'السبت إلى الخميس: 8:00 صباحاً — 7:00 مساءً',
  hours_en: 'Sat–Thu: 8:00 AM – 7:00 PM',
  free_shipping_min: '0',
  instagram: '',
  facebook: '',
  tiktok: '',
  card_enabled: '1',
  cod_enabled: '1',
  announce_ar: 'بنأكد معك التصميم على واتساب قبل الطباعة · توصيل لكل المناطق',
  announce_en: 'We confirm your design on WhatsApp before printing · Delivery everywhere',
};

export function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}
export function setSetting(key, value) {
  run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}
