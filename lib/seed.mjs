import { get, run, tx, db } from './db.mjs';
import { slugify } from './util.mjs';
import { round2 } from './pricing.mjs';
import { DEPTS, CATS, PRODUCTS, ZONES, DESIGN_FEES, defaultsFor } from './catalog-data.mjs';

/** Turn a catalogue row's price spec into [{label, price}] and whether the prices need checking. */
function buildVariants(price, options) {
  const labels = options && options.length ? options : ['قياسي'];
  if (Array.isArray(price)) {
    const [lo, hi] = price;
    return { review: false, list: labels.map((l, i) => ({ label: l, price: labels.length > 1 ? round2(lo + ((hi - lo) * i) / (labels.length - 1)) : lo })) };
  }
  if (price && typeof price === 'object') return { review: true, list: labels.map((l) => ({ label: l, price: price.from })) };
  return { review: false, list: labels.map((l) => ({ label: l, price })) };
}

// Bump when the starter catalogue changes: a store with no orders or quotes yet is re-seeded automatically.
export const CATALOG_VERSION = '5';

export function seedIfEmpty({ reset = false } = {}) {
  const ver = get("SELECT value FROM settings WHERE key = 'catalog_version'")?.value;
  const untouched = get('SELECT (SELECT COUNT(*) FROM orders) + (SELECT COUNT(*) FROM quotes) AS n').n === 0;
  if (!reset && ver !== CATALOG_VERSION && untouched && get('SELECT COUNT(*) n FROM departments').n > 0) reset = true;
  if (reset) db.exec('DELETE FROM design_messages; DELETE FROM order_items; DELETE FROM orders; DELETE FROM quotes; DELETE FROM variants; DELETE FROM products; DELETE FROM categories; DELETE FROM departments; DELETE FROM zones;');
  if (get('SELECT COUNT(*) n FROM departments').n > 0) { defaultDesignFees(); return false; }
  tx(() => {
    const deptId = {};
    DEPTS.forEach((d, i) => {
      deptId[d.slug] = Number(run('INSERT INTO departments(slug,name_ar,name_en,blurb_ar,blurb_en,image,mode,partner_name,partner_logo,sort) VALUES (?,?,?,?,?,?,?,?,?,?)',
        d.slug, d.ar[0], d.en[0], d.ar[1], d.en[1], d.image, d.mode, d.partner || '', d.partnerLogo || '', i).lastInsertRowid);
    });
    const catId = {};
    CATS.forEach(([dept, slug, ar, en, image], i) => {
      catId[slug] = Number(run('INSERT INTO categories(department_id,slug,name_ar,name_en,image,design_fee,sort) VALUES (?,?,?,?,?,?,?)', deptId[dept], slug, ar, en, image, DESIGN_FEES[slug] || 0, i).lastInsertRowid);
    });
    const used = new Set();
    PRODUCTS.forEach(([c, name, price, options, x = {}], i) => {
      if (!catId[c]) throw new Error('Unknown category in catalogue: ' + c);
      const { review, list } = buildVariants(price, options);
      const base = defaultsFor(Math.min(...list.map((v) => v.price || 999)));
      let slug = slugify(name) || 'p-' + i;
      while (used.has(slug)) slug += '-' + i;
      used.add(slug);
      const pid = Number(run(`INSERT INTO products(slug,category_id,name_ar,name_en,short_ar,desc_ar,unit_ar,unit_en,min_qty,step,tiers,days_ar,quote,featured,review,created_at)
        VALUES (?,?,?,'',?,?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`,
        slug, catId[c], name, x.short || '', x.desc || '', x.unit || 'للقطعة', '', x.min ?? base.min, x.step ?? (x.min ? 1 : base.step), x.tiers ?? base.tiers,
        x.days || '', x.quote ? 1 : 0, x.featured ? 1 : 0, review || x.review ? 1 : 0, `-${PRODUCTS.length - i} minutes`).lastInsertRowid);
      list.forEach((v, j) => run('INSERT INTO variants(product_id,label_ar,label_en,price,sku,sort) VALUES (?,?,?,?,?,?)', pid, v.label, '', v.price, `SH-${String(pid).padStart(3, '0')}-${j + 1}`, j));
    });
    ZONES.forEach(([ar, en, fee, ear, een], i) => run('INSERT INTO zones(name_ar,name_en,fee,eta_ar,eta_en,sort) VALUES (?,?,?,?,?,?)', ar, en, fee, ear, een, i));
    run("INSERT INTO settings(key, value) VALUES ('catalog_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", CATALOG_VERSION);
    run("INSERT INTO settings(key, value) VALUES ('design_fees_v', '1') ON CONFLICT(key) DO NOTHING");
  });
  return true;
}

/** Stores created before the design service get the default design fees once (admin edits are never overwritten). */
function defaultDesignFees() {
  if (get("SELECT value FROM settings WHERE key = 'design_fees_v'")) return;
  tx(() => {
    if (!get('SELECT 1 FROM categories WHERE design_fee > 0')) {
      for (const [slug, fee] of Object.entries(DESIGN_FEES)) run('UPDATE categories SET design_fee = ? WHERE slug = ?', fee, slug);
    }
    run("INSERT INTO settings(key, value) VALUES ('design_fees_v', '1') ON CONFLICT(key) DO NOTHING");
  });
}
