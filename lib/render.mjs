import { html, raw, esc, money } from './util.mjs';
import { fontHead } from './fonts.mjs';
import { makeT, dir as dirOf, pick } from './i18n.mjs';
import { isQuote } from './catalog.mjs';

export const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.7 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.3 0 5.4 3.1 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/>',
  bag: '<path d="M3 4h2l2.5 11h11L21 7H6.5"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  quote: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 005 5L15 12l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  pen: '<path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
  facebook: '<path d="M14 8h3V4h-3a4 4 0 00-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5A.5.5 0 0114 8z"/>',
  tiktok: '<path d="M14 3v11.5a3.5 3.5 0 11-3.5-3.5M14 3c.3 2.4 1.9 4 4.5 4.2"/>',
};
export const icon = (n, cls = '') => raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`);
const WA_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.4L3 29l6.8-1.8A13 13 0 1016 3zm0 23.7c-2 0-3.9-.6-5.5-1.6l-.4-.2-4 1.1 1.1-3.9-.3-.4A10.6 10.6 0 1116 26.7zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-.9 1.2-.3.2-.6.1a8.7 8.7 0 01-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.1 1.1-1.1 2.6 1.1 3.1 1.3 3.3 2.2 3.4 5.4 4.7c2 .8 2.8.9 3.8.7.6-.1 1.9-.8 2.1-1.5s.3-1.4.2-1.5-.3-.2-.6-.4z"/></svg>';

/* ---------- context ---------- */
export function makeCtx(req, { lang, settings, cartCount, pathAfterLang, query }) {
  const t = makeT(lang);
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const site = (process.env.SITE_URL || `${proto}://${req.headers.host || 'localhost'}`).replace(/\/$/, '');
  return {
    req, site, lang, t, dir: dirOf(lang), S: settings, cartCount, path: pathAfterLang, query: query || {},
    L: (p = '') => `/${lang}${p}`,
    name: lang === 'ar' ? settings.store_name_ar : settings.store_name_en,
    pick: (row, f) => pick(row, f, lang),
    price: money,
    wa: (text = '') => `https://wa.me/${String(settings.whatsapp).replace(/\D/g, '')}${text ? '?text=' + encodeURIComponent(text) : ''}`,
  };
}

/* ---------- product bits ---------- */
export const productImgSrc = (p) => p.image || p.cimage || '/img/mockups/paper.png';
export function productImg(p, cls = '') {
  return raw(`<img class="${cls}" src="${esc(productImgSrc(p))}" alt="${esc(p.name_ar || p.name_en)}" loading="lazy" decoding="async" width="400" height="400">`);
}

export function wishBtn(ctx, id) {
  return html`<button class="wish" type="button" data-wish="${id}" aria-pressed="false" aria-label="${ctx.t('p.wish_add')}">${icon('heart')}</button>`;
}

export function priceLine(ctx, p) {
  const { t } = ctx;
  if (isQuote(p)) return p.minp > 0
    ? html`<div class="price quote"><span class="from">${t('p.from')}</span><span class="now num">${money(p.minp)}</span></div>`
    : html`<div class="price quote">${t('p.quote_badge')}</div>`;
  const from = (p.nvar > 1 && p.maxp > p.minp) || p.review === 1;
  return html`<div class="price">${from ? html`<span class="from">${t('p.from')}</span>` : ''}<span class="now num">${money(p.minp)}</span>
    ${p.minold > p.minp ? html`<span class="old num">${money(p.minold)}</span>` : ''}</div>`;
}

export function productCard(ctx, p) {
  const { t, L } = ctx;
  const url = L(`/product/${p.slug}`);
  const quote = isQuote(p);
  return html`<article class="card">
    <a class="card-img" href="${url}" tabindex="-1" aria-hidden="true">${productImg(p)}</a>
    ${wishBtn(ctx, p.id)}
    ${p.disc > 0 && !quote ? html`<span class="badge sale">-${p.disc}%</span>` : p.badge === 'new' ? html`<span class="badge">${ctx.lang === 'ar' ? 'جديد' : 'New'}</span>` : ''}
    <div class="card-body">
      <span class="card-cat">${ctx.pick({ name_ar: p.cname_ar, name_en: p.cname_en }, 'name')}</span>
      <h3 class="card-title"><a href="${url}">${ctx.pick(p, 'name')}</a></h3>
      ${quote ? html`<p class="card-meta">${p.minp > 0 ? ctx.pick(p, 'unit') : t('p.quote_price')}</p>`
        : html`<p class="card-meta">${ctx.pick(p, 'unit')}${p.min_qty > 1 ? html` · ${t('p.min')} <span class="num">${p.min_qty}</span>` : ''}</p>`}
      ${priceLine(ctx, p)}
      <a class="btn ${quote ? 'btn-outline' : 'btn-navy'} btn-sm card-cta" href="${url}">${quote ? t('nav.quote') : t('p.choose')}</a>
    </div>
  </article>`;
}

export function productGrid(ctx, items, cls = '') {
  return html`<div class="grid ${cls}">${items.map((p) => productCard(ctx, p))}</div>`;
}

export function breadcrumbs(ctx, trail) {
  const parts = [[ctx.t('nav.home'), ctx.L('')], ...trail];
  return html`<nav class="crumbs wrap" aria-label="breadcrumb">${parts.map(([label, href], i) =>
    html`${i ? html`<span aria-hidden="true">/</span>` : ''}${href && i < parts.length - 1 ? html`<a href="${href}">${label}</a>` : html`<span aria-current="page">${label}</span>`}`)}</nav>`;
}

export function pager(ctx, page, pages, hrefFor) {
  if (pages <= 1) return '';
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
  const out = [];
  let prev = 0;
  for (const n of nums) { if (n - prev > 1) out.push('…'); out.push(n); prev = n; }
  return html`<nav class="pager" aria-label="pagination">
    ${page > 1 ? html`<a href="${hrefFor(page - 1)}" rel="prev">${ctx.t('shop.prev')}</a>` : ''}
    ${out.map((n) => (n === '…' ? html`<span>…</span>` : n === page ? html`<span class="cur" aria-current="page">${n}</span>` : html`<a href="${hrefFor(n)}">${n}</a>`))}
    ${page < pages ? html`<a href="${hrefFor(page + 1)}" rel="next">${ctx.t('shop.next')}</a>` : ''}
  </nav>`;
}

/* ---------- layout ---------- */
export function layout(ctx, { title, description, body, canonical, image, jsonld, nav = '', noindex = false, noFloat = false }) {
  const { t, lang, S, L } = ctx;
  const site = ctx.site;
  const fullTitle = title ? `${title} | ${ctx.name}` : `${ctx.name} — ${lang === 'ar' ? S.tagline_ar : S.tagline_en}`;
  const desc = description || (lang === 'ar' ? S.tagline_ar : S.tagline_en);
  const other = lang === 'ar' ? 'en' : 'ar';
  const subPath = ctx.path === '/' ? '' : ctx.path;
  const qs = ctx.req.url.includes('?') ? ctx.req.url.slice(ctx.req.url.indexOf('?')) : '';
  const depts = ctx.depts || [];
  const cats = ctx.cats || [];
  const cur = (key) => (nav === key ? raw('aria-current="page"') : '');
  const announce = lang === 'ar' ? S.announce_ar : S.announce_en;

  const drawer = html`
  <div class="drawer-scrim" data-close-drawer></div>
  <aside class="drawer" aria-label="${t('nav.menu')}">
    <div class="drawer-head"><a class="brand" href="${L('')}"><img src="/img/logo.png" alt="" width="36" height="44"><b>${ctx.name}</b></a>
      <button class="icon-btn" data-close-drawer aria-label="${t('nav.close')}">${icon('close')}</button></div>
    <div class="drawer-body">
      ${depts.map((d) => html`<details ${nav === 'dept:' + d.slug ? raw('open') : ''}><summary>${ctx.pick(d, 'name')}</summary>
        <a href="${L('/dept/' + d.slug)}">${t('see.all')}</a>
        ${cats.filter((c) => c.department_id === d.id).map((c) => html`<a href="${L('/category/' + c.slug)}">${ctx.pick(c, 'name')}</a>`)}</details>`)}
      <a href="${L('/quote')}">${t('nav.quote')}</a>
      <a href="${L('/track')}">${t('nav.track')}</a>
      <a href="${L('/about')}">${t('nav.about')}</a>
      <a href="${L('/contact')}">${t('nav.contact')}</a>
      <a href="${L('/wishlist')}">${t('wishlist')}</a>
      <a href="/${other}${subPath}${qs}" hreflang="${other}" lang="${other}">${t('lang.switch')}</a>
    </div>
  </aside>`;

  const header = html`
  ${announce ? html`<div class="announce">${announce}</div>` : ''}
  <header class="top">
    <div class="wrap top-main">
      <button class="icon-btn menu-btn" data-open-drawer aria-label="${t('nav.menu')}">${icon('menu')}</button>
      <a class="brand" href="${L('')}" aria-label="${ctx.name}"><img src="/img/logo-light.png" alt="" width="40" height="49"><span><b>${ctx.name}</b><small>${lang === 'ar' ? S.address_ar : S.address_en}</small></span></a>
      <form class="search" role="search" action="${L('/search')}" method="get">
        <input type="search" name="q" placeholder="${t('search.placeholder')}" value="${ctx.query.q || ''}" aria-label="${t('search.btn')}" autocomplete="off">
        <button type="submit" aria-label="${t('search.btn')}">${icon('search')}</button>
      </form>
      <div class="hactions">
        <a class="lang-btn" href="/${other}${subPath}${qs}" hreflang="${other}" lang="${other}">${t('lang.switch')}</a>
        <a class="icon-btn hide-sm" href="${L('/wishlist')}" aria-label="${t('wishlist')}">${icon('heart')}<span class="count" data-wish-count></span></a>
        <a class="cart-btn" href="${L('/cart')}" aria-label="${t('cart')}">${icon('bag')}<span class="hide-sm">${t('cart')}</span><span class="count" data-cart-count data-n="${ctx.cartCount}">${ctx.cartCount || ''}</span></a>
      </div>
    </div>
    <nav class="nav" aria-label="main"><div class="wrap nav-inner">
      ${depts.map((d) => html`<a class="nav-dept" href="${L('/dept/' + d.slug)}" ${cur('dept:' + d.slug)}><img class="nav-ic" src="${d.image || '/img/favicon.png'}" alt="" width="26" height="26" loading="lazy"><span class="full">${ctx.pick(d, 'name')}</span><span class="short">${String(ctx.pick(d, 'name')).split(/ و| &| and /)[0]}</span></a>`)}
      <a class="nav-extra" href="${L('/shop')}" ${cur('shop')}>${t('nav.shop')}</a>
      <span class="sp nav-extra"></span>
      <a class="nav-quote nav-extra" href="${L('/quote')}" ${cur('quote')}>${t('nav.quote')}</a>
    </div></nav>
  </header>`;

  const social = (href, ic, label) => (href ? html`<a href="${href}" target="_blank" rel="noopener" aria-label="${label}">${icon(ic)}</a>` : '');
  const footer = html`
  <footer class="foot">
    <div class="wrap foot-top">
      <div class="foot-brand">
        <a class="brand" href="${L('')}"><img src="/img/logo-light.png" alt="" width="44" height="54"><b>${ctx.name}</b></a>
        <p>${lang === 'ar' ? S.tagline_ar : S.tagline_en}</p>
        <div class="socials">${social(S.instagram, 'instagram', 'Instagram')}${social(S.facebook, 'facebook', 'Facebook')}${social(S.tiktok, 'tiktok', 'TikTok')}</div>
      </div>
      <div><h4>${t('f.sections')}</h4><ul>${depts.map((d) => html`<li><a href="${L('/dept/' + d.slug)}">${ctx.pick(d, 'name')}</a></li>`)}<li><a href="${L('/quote')}">${t('nav.quote')}</a></li></ul></div>
      <div><h4>${t('f.help')}</h4><ul>
        <li><a href="${L('/track')}">${t('nav.track')}</a></li><li><a href="${L('/about')}">${t('nav.about')}</a></li><li><a href="/designer">${lang === 'ar' ? 'بوابة المصممين' : 'Designer portal'}</a></li>
        <li><a href="${L('/policy/shipping')}">${t('policy.shipping')}</a></li><li><a href="${L('/policy/terms')}">${t('policy.terms')}</a></li>
        <li><a href="${L('/policy/privacy')}">${t('policy.privacy')}</a></li></ul></div>
      <div><h4>${t('f.contact')}</h4><ul class="contact-list">
        <li>${icon('pin')}<span>${lang === 'ar' ? S.address_ar : S.address_en}</span></li>
        <li>${icon('phone')}<span class="num" dir="ltr">${S.phone}</span></li>
        <li>${icon('mail')}<span dir="ltr">${S.email}</span></li>
        <li>${icon('clock')}<span>${lang === 'ar' ? S.hours_ar : S.hours_en}</span></li></ul></div>
    </div>
    <div class="wrap foot-bottom"><span>© ${new Date().getFullYear()} ${ctx.name} — ${t('f.rights')}</span></div>
  </footer>
  <nav class="tabbar" aria-label="${t('nav.menu')}">
    <a href="${L('')}" ${cur('home')}>${icon('home')}<span>${t('nav.home')}</span></a>
    <a href="${L('/shop')}" ${cur('shop')}>${icon('grid')}<span>${t('nav.shop')}</span></a>
    <a href="${L('/quote')}" ${cur('quote')}>${icon('quote')}<span>${lang === 'ar' ? 'عرض سعر' : 'Quote'}</span></a>
    <a href="${L('/cart')}" ${cur('cart')}>${icon('bag')}<span>${t('cart')}</span><i class="count" data-cart-count data-n="${ctx.cartCount}">${ctx.cartCount || ''}</i></a>
  </nav>
  ${noFloat ? '' : html`<a class="wa-float" href="${ctx.wa()}" target="_blank" rel="noopener" aria-label="WhatsApp">${raw(WA_SVG)}</a>`}
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  const clientCfg = JSON.stringify({
    lang, cur: '₪',
    msg: { added: t('p.added'), cart: t('cart'), wishAdd: t('p.wish_add'), wishRemove: t('p.wish_remove'), error: t('error.text'), free: t('cart.free'), off: t('cart.discount') },
    cartUrl: L('/cart'),
  }).replace(/</g, '\\u003c');

  const canon = canonical != null ? `${site}/${lang}${canonical}` : null;
  return html`<html lang="${lang}" dir="${ctx.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#14284b">
${noindex ? raw('<meta name="robots" content="noindex,nofollow">') : ''}
${canon ? html`<link rel="canonical" href="${canon}">` : ''}
${canonical != null ? html`<link rel="alternate" hreflang="ar" href="${site}/ar${canonical}"><link rel="alternate" hreflang="en" href="${site}/en${canonical}">` : ''}
<meta property="og:type" content="website"><meta property="og:site_name" content="${ctx.name}">
<meta property="og:title" content="${fullTitle}"><meta property="og:description" content="${desc}">
<meta property="og:image" content="${image ? (image.startsWith('http') ? image : site + image) : site + '/img/logo.png'}">
<link rel="icon" href="/img/favicon.png" type="image/png">
<link rel="stylesheet" href="/css/style.css?v=${ASSET_V}">
${fontHead(S)}
${jsonld ? raw(`<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`) : ''}
</head>
<body>
<a class="skip" href="#main">${t('skip')}</a>
${header}${drawer}
<main id="main">${body}</main>
${footer}
<script>window.SH=${raw(clientCfg)};</script>
<script src="/js/app.js?v=${ASSET_V}" defer></script>
</body></html>`;
}
export const ASSET_V = String(Date.now()).slice(-6);
