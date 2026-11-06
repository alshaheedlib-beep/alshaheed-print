import { all, get } from './db.mjs';

const PRODUCT_SELECT = `
SELECT p.*, c.slug AS cslug, c.name_ar AS cname_ar, c.name_en AS cname_en, c.image AS cimage, COALESCE(c.design_fee, 0) AS dfee,
  d.id AS did, d.slug AS dslug, d.name_ar AS dname_ar, d.name_en AS dname_en, COALESCE(d.mode, 'cart') AS mode,
  (SELECT MIN(price) FROM variants v WHERE v.product_id = p.id) AS minp,
  (SELECT MAX(price) FROM variants v WHERE v.product_id = p.id) AS maxp,
  (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS nvar,
  (SELECT COALESCE(SUM(stock), 0) FROM variants v WHERE v.product_id = p.id) AS stock,
  (SELECT COALESCE(MAX(CASE WHEN old_price > price THEN ROUND((old_price - price) * 100.0 / old_price) ELSE 0 END), 0) FROM variants v WHERE v.product_id = p.id) AS disc,
  (SELECT old_price FROM variants v WHERE v.product_id = p.id ORDER BY price ASC, id ASC LIMIT 1) AS minold,
  (SELECT id FROM variants v WHERE v.product_id = p.id AND stock > 0 ORDER BY sort, id LIMIT 1) AS vid1
FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN departments d ON d.id = c.department_id`;

export const PAGE_SIZE = 24;

/* ---------- Arabic-aware search ---------- */
/** Normalise Arabic for matching: no diacritics/tatweel, one alef, ة→ه, ى→ي, Arabic digits → Latin. */
export const normAr = (s) => String(s || '').toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const stem = (w) => (w.length > 4 ? w.replace(/^(وال|بال|كال|فال|لل|ال)/, '') : w);
const words = (s) => normAr(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem);
/** Words people use for the same thing (normalised). */
const SYNONYMS = [
  ['كرت', 'كروت', 'كارت', 'بطاقه', 'بطاقات', 'بزنس'],
  ['كاس', 'كاسه', 'كاسات', 'كوب', 'اكواب', 'cup', 'cups'],
  ['كيس', 'اكياس', 'شنطه', 'شنط', 'bag', 'bags'],
  ['يافطه', 'يافطات', 'قارمه', 'قارمات', 'لافته', 'لافتات', 'لوحه', 'لوحات', 'واجهه', 'واجهات', 'sign', 'signs'],
  ['ستيكر', 'ستيكرات', 'ملصق', 'ملصقات', 'لاصق', 'ليبل', 'sticker', 'stickers', 'label', 'labels'],
  ['شادر', 'شوادر', 'بانر', 'فليكس', 'banner'],
  ['فوم', 'كابا'],
  ['عرس', 'اعراس', 'زفاف', 'فرح', 'wedding'],
  ['علبه', 'علب', 'صندوق', 'صناديق', 'بوكس', 'كرتونه', 'box', 'boxes'],
  ['ملابس', 'البسه', 'تيشرت', 'تيشيرت', 'قميص', 'مريول', 'يونيفورم', 'زي'],
  ['فلاير', 'فلايرات', 'منشور', 'منشورات', 'بروشور', 'flyer'],
  ['منيو', 'قايمه', 'menu'],
  ['رول', 'رولات', 'roll'],
  ['بكج', 'بكجات', 'باكج', 'باقه', 'package'],
];
const SYN = new Map();
for (const g of SYNONYMS) { const n = g.map(normAr).map(stem); for (const w of n) SYN.set(w, n); }
/** Rank products for a query: every query word must match (by word or synonym); name hits beat category / description hits. */
export function searchRank(rows, q, sort) {
  const toks = words(q).slice(0, 6);
  if (!toks.length) return rows;
  const variants = toks.map((t) => SYN.get(t) || [t]);
  const hit = (ws, vs) => {
    let best = 0;
    for (const w of ws) for (const v of vs) {
      if (w === v) return 3;
      if (v.length >= 3 && w.startsWith(v) && w.length - v.length <= 2) best = Math.max(best, 2); // كاس → كاسات
      else if (v.length >= 4 && w.includes(v)) best = Math.max(best, 1);
    }
    return best;
  };
  const scored = [];
  for (const p of rows) {
    const name = words(`${p.name_ar} ${p.name_en}`), cat = words(`${p.cname_ar} ${p.cname_en} ${p.dname_ar} ${p.dname_en}`), body = words(`${p.short_ar} ${p.short_en} ${p.desc_ar}`);
    let score = 0, ok = true;
    for (const vs of variants) {
      const s = Math.max(hit(name, vs) * 10, hit(cat, vs) * 4) + hit(body, vs);
      if (!s) { ok = false; break; }
      score += s;
    }
    if (ok) scored.push([score * 10 + (p.featured ? 8 : 0) - name.length, p]); // ties: featured, then shorter (more general) names
  }
  if (!sort || sort === 'best') scored.sort((a, b) => b[0] - a[0]);
  return scored.map(([, p]) => p);
}
const likeEsc = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);

/** A product is ordered by quote (no cart) when it is flagged as such or has no price yet.
    Its price, if any, is shown as an indicative "from" price. */
export const isQuote = (p) => !!p && (p.quote === 1 || !(p.minp > 0));

export function listProducts({ cat, dept, q, min, max, sort, page = 1, ids, featured, limit, exclude, includeInactive = false } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('p.active = 1');
  if (cat) { where.push('c.slug = ?'); params.push(cat); }
  if (dept) { where.push('d.slug = ?'); params.push(dept); }
  if (featured) where.push('p.featured = 1');
  if (exclude) { where.push('p.id != ?'); params.push(exclude); }
  if (ids && ids.length) { where.push(`p.id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  // text search is ranked in JS (see searchRank) — the catalogue is a few hundred rows
  const outer = [];
  const op = [];
  if (min > 0) { outer.push('minp >= ?'); op.push(min); }
  if (max > 0) { outer.push('minp <= ?'); op.push(max); }

  const orderMap = {
    new: 'created_at DESC, id DESC',
    price_asc: 'minp ASC, id ASC',
    price_desc: 'minp DESC, id ASC',
    best: 'featured DESC, sold DESC, id ASC',
  };
  const order = orderMap[sort] || orderMap.best;
  const base = `SELECT * FROM (${PRODUCT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}) ${outer.length ? 'WHERE ' + outer.join(' AND ') : ''}`;
  const allParams = [...params, ...op];
  if (q && q.trim()) {
    const ranked = searchRank(all(`${base} ORDER BY ${order}`, ...allParams), q, sort);
    const lim = limit || PAGE_SIZE, off = limit ? 0 : (Math.max(1, page) - 1) * PAGE_SIZE;
    return { items: ranked.slice(off, off + lim), total: ranked.length, pages: Math.max(1, Math.ceil(ranked.length / PAGE_SIZE)) };
  }
  const total = get(`SELECT COUNT(*) AS n FROM (${base})`, ...allParams).n;
  const lim = limit || PAGE_SIZE;
  const off = limit ? 0 : (Math.max(1, page) - 1) * PAGE_SIZE;
  const sql = `${base} ORDER BY ${order} LIMIT ${lim | 0} OFFSET ${off | 0}`;
  return { items: all(sql, ...allParams), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const getProductBySlug = (slug) => get(`SELECT * FROM (${PRODUCT_SELECT}) WHERE slug = ?`, slug);
export const getProductById = (id) => get(`SELECT * FROM (${PRODUCT_SELECT}) WHERE id = ?`, id);
export const variantsOf = (pid) => all('SELECT * FROM variants WHERE product_id = ? ORDER BY sort, id', pid);

export const departments = () =>
  all(`SELECT d.*, (SELECT COUNT(*) FROM products p JOIN categories c ON c.id = p.category_id WHERE c.department_id = d.id AND p.active = 1) AS n
       FROM departments d ORDER BY sort, id`);
export const departmentBySlug = (slug) => get('SELECT * FROM departments WHERE slug = ?', slug);

export const categories = (deptId) =>
  all(`SELECT c.*, d.slug AS dslug, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS n
       FROM categories c LEFT JOIN departments d ON d.id = c.department_id
       ${deptId ? 'WHERE c.department_id = ?' : ''} ORDER BY d.sort, c.sort, c.id`, ...(deptId ? [deptId] : []));
export const categoryBySlug = (slug) =>
  get(`SELECT c.*, d.slug AS dslug, d.name_ar AS dname_ar, d.name_en AS dname_en, COALESCE(d.mode,'cart') AS mode
       FROM categories c LEFT JOIN departments d ON d.id = c.department_id WHERE c.slug = ?`, slug);
export const zones = () => all('SELECT * FROM zones ORDER BY sort, id');

export function priceBounds() {
  return get('SELECT COALESCE(MIN(price),0) AS lo, COALESCE(MAX(price),0) AS hi FROM variants');
}
