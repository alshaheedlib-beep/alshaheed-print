import { html, raw, money, int, num } from './util.mjs';
import { layout, icon, productCard, productGrid, breadcrumbs, pager, productImg, productImgSrc, wishBtn, priceLine } from './render.mjs';
import * as cat from './catalog.mjs';
import { parseTiers } from './pricing.mjs';
import { shippingFor } from './cart.mjs';
import { ORDER_STATUSES } from './i18n.mjs';

const modeLabel = (ctx, mode) => ctx.t('mode.' + (mode || 'cart'));
const deptImg = (d) => d.image || '/img/mockups/paper.png';

/* ================= HOME ================= */
/** Partner workshop band shown inside a department page (e.g. القارمات بالتعاون مع الطليعة). */
const partner = (ctx, d) => d.partner_name ? html`<section class="wrap"><div class="partner-band">
  ${d.partner_logo ? html`<img src="${d.partner_logo}" alt="${d.partner_name}" loading="lazy">` : ''}
  <div><small>${ctx.lang === 'ar' ? 'شريك التنفيذ' : 'Production partner'}</small>
  <p>${ctx.lang === 'ar' ? html`تصنيع وتركيب ${ctx.pick(d, 'name')} بالتعاون مع <b>${d.partner_name}</b>` : html`Made and installed in partnership with <b>${d.partner_name}</b>`}</p></div></div></section>` : '';

export function home(ctx) {
  const { t, L, lang } = ctx;
  const depts = cat.departments();
  const print = depts.find((d) => d.mode === 'cart') || depts[0];
  const printCats = print ? cat.categories(print.id) : [];
  const featured = cat.listProducts({ featured: true, limit: 8 }).items;
  const wholesale = depts.find((d) => d.mode === 'wholesale');
  const quoteDept = depts.find((d) => d.mode === 'quote');

  const body = html`
  <section class="hero"><div class="wrap hero-inner">
    <div class="hero-txt">
      <h1>${t('home.hero.title')}</h1>
      <p>${t('home.hero.text')}</p>
      <div class="row">
        <a class="btn btn-accent" href="${print ? L('/dept/' + print.slug) : L('/shop')}">${t('home.hero.cta1')}</a>
        <a class="btn btn-ghost" href="${L('/quote')}">${t('home.hero.cta2')}</a>
      </div>
    </div>
    <div class="hero-art" aria-hidden="true">
      ${depts.slice(0, 4).map((d) => html`<div class="hero-tile"><img src="${deptImg(d)}" alt="" width="220" height="220"></div>`)}
      <span class="crop c1"></span><span class="crop c2"></span>
    </div>
  </div></section>

  <section class="sec wrap" id="sections">
    <div class="sec-head"><h2>${t('home.depts.title')}</h2></div>
    <div class="depts">${depts.map((d) => html`
      <a class="dept" href="${L('/dept/' + d.slug)}">
        <span class="dept-img"><img src="${deptImg(d)}" alt="" loading="lazy" width="300" height="300"></span>
        <span class="dept-body"><span class="pill pill-${d.mode}">${modeLabel(ctx, d.mode)}</span>
          <h3>${ctx.pick(d, 'name')}</h3><p>${ctx.pick(d, 'blurb')}</p>
          <span class="go">${t('see.all')} ${icon('arrow')}</span></span>
      </a>`)}</div>
  </section>

  ${printCats.length ? html`<section class="sec wrap">
    <div class="sec-head"><div><h2>${t('home.cats.title')}</h2><p>${t('home.cats.sub')}</p></div><a class="more" href="${L('/dept/' + print.slug)}">${t('see.all')}</a></div>
    ${catCircles(ctx, printCats)}
  </section>` : ''}

  ${featured.length ? html`<section class="sec band-soft"><div class="wrap">
    <div class="sec-head"><h2>${t('home.featured.title')}</h2><a class="more" href="${L('/shop')}">${t('see.all')}</a></div>
    ${productGrid(ctx, featured)}
  </div></section>` : ''}

  <section class="sec wrap">
    <div class="sec-head"><h2>${t('home.how.title')}</h2></div>
    <ol class="steps">${[1, 2, 3].map((n) => html`<li><b>${t('home.how.' + n)}</b><span>${t('home.how.' + n + 'd')}</span></li>`)}</ol>
  </section>

  <section class="sec wrap">
    <div class="why">${[1, 2, 3, 4].map((n) => html`<div><h3>${t(`home.why.${n}t`)}</h3><p>${t(`home.why.${n}d`)}</p></div>`)}</div>
  </section>

  ${wholesale ? html`<section class="sec wrap"><div class="promo">
    <div><span class="pill pill-wholesale">${ctx.pick(wholesale, 'name')}</span><h2>${t('home.wholesale.title')}</h2><p>${t('home.wholesale.text')}</p>
      <div class="row"><a class="btn btn-accent" href="${L('/dept/' + wholesale.slug)}">${t('see.all')}</a>
      <a class="btn btn-ghost" href="${ctx.wa(lang === 'ar' ? 'مرحباً، بدي أسعار الجملة' : 'Hello, I would like wholesale prices')}" target="_blank" rel="noopener">WhatsApp</a></div></div>
    <img src="${deptImg(wholesale)}" alt="" loading="lazy" width="260" height="260">
  </div></section>` : ''}

  <section class="sec wrap help">
    <h2>${t('home.help.title')}</h2><p>${t('home.help.text')}</p>
    <div class="row center"><a class="btn btn-wa" href="${ctx.wa()}" target="_blank" rel="noopener">${t('home.help.cta')}</a>
    ${quoteDept ? html`<a class="btn btn-outline" href="${L('/quote')}">${t('nav.quote')}</a>` : ''}</div>
  </section>`;
  return layout(ctx, { title: '', body, canonical: '', nav: 'home', jsonld: { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: ctx.name, telephone: ctx.S.phone, email: ctx.S.email, address: ctx.S.address_ar } });
}

function catCircles(ctx, cats) {
  return html`<div class="cats">${cats.map((c) => html`
    <a class="cat" href="${ctx.L('/category/' + c.slug)}"><span class="ic"><img src="${c.image || '/img/mockups/paper.png'}" alt="" loading="lazy" width="120" height="120"></span>
      <span class="nm">${ctx.pick(c, 'name')}</span><small class="num">${c.n} ${ctx.t('shop.results')}</small></a>`)}</div>`;
}

/* ================= DEPARTMENT ================= */
export function department(ctx, slug) {
  const { t, L } = ctx;
  const d = cat.departmentBySlug(slug);
  if (!d) return null;
  const cats = cat.categories(d.id);
  const all = cat.listProducts({ dept: slug, limit: 24 });
  const items = all.items;
  const body = html`
  ${breadcrumbs(ctx, [[ctx.pick(d, 'name')]])}
  <section class="dept-hero"><div class="wrap dept-hero-in">
    <div><span class="pill pill-${d.mode}">${modeLabel(ctx, d.mode)}</span><h1>${ctx.pick(d, 'name')}</h1><p>${ctx.pick(d, 'blurb')}</p>
      ${d.mode === 'quote' ? html`<a class="btn btn-accent" href="${L('/quote?dept=' + d.slug)}">${t('nav.quote')}</a>` : ''}</div>
    <img src="${deptImg(d)}" alt="" width="240" height="240">
  </div></section>
  ${partner(ctx, d)}
  <div class="wrap">
    ${cats.length ? html`<section class="sec">${catCircles(ctx, cats)}</section>` : ''}
    <section class="sec" style="padding-top:0">
      ${items.length ? html`<div class="sec-head"><h2>${t('home.featured.title')}</h2><a class="more" href="${L('/shop?dept=' + d.slug)}">${t('see.all')} (<span class="num">${all.total}</span>)</a></div>${productGrid(ctx, items)}
        ${all.total > items.length ? html`<div class="row center" style="margin-top:24px"><a class="btn btn-navy" href="${L('/shop?dept=' + d.slug)}">${t('see.all')} — <span class="num">${all.total}</span> ${t('shop.results')}</a></div>` : ''}`
        : html`<div class="empty"><p>${t('shop.empty')}</p></div>`}
    </section>
  </div>`;
  return layout(ctx, { title: ctx.pick(d, 'name'), description: ctx.pick(d, 'blurb'), body, canonical: '/dept/' + d.slug, image: d.image, nav: 'dept:' + d.slug });
}

/* ================= LISTING (shop / category / search) ================= */
function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null && v !== 0 && v !== false) p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
}

export function listing(ctx, { kind, slug }) {
  const { t, L, query } = ctx;
  const category = kind === 'category' ? cat.categoryBySlug(slug) : null;
  if (kind === 'category' && !category) return null;
  const depts = cat.departments();
  const f = {
    q: kind === 'search' ? String(query.q || '').trim().slice(0, 80) : '',
    min: num(query.min), max: num(query.max),
    sort: ['best', 'new', 'price_asc', 'price_desc'].includes(query.sort) ? query.sort : 'best',
    page: Math.max(1, int(query.page, 1)),
    dept: kind !== 'category' && depts.some((d) => d.slug === query.dept) ? query.dept : '',
  };
  const res = cat.listProducts({ ...f, cat: kind === 'category' ? slug : '' });
  const base = kind === 'category' ? `/category/${slug}` : kind === 'search' ? '/search' : '/shop';
  const keep = { q: f.q, dept: f.dept, min: f.min || '', max: f.max || '', sort: f.sort === 'best' ? '' : f.sort };
  const href = (patch) => L(base) + qs({ ...keep, ...patch });
  const hasFilters = f.min || f.max || f.dept;

  let title, h1, sub = '', trail;
  if (kind === 'category') {
    title = h1 = ctx.pick(category, 'name'); sub = ctx.pick(category, 'blurb');
    trail = [[ctx.pick({ name_ar: category.dname_ar, name_en: category.dname_en }, 'name'), L('/dept/' + category.dslug)], [h1]];
  } else if (kind === 'search') { h1 = f.q ? `${t('search.results_for')} «${f.q}»` : t('search.btn'); title = h1; trail = [[h1]]; }
  else { title = h1 = t('shop.title'); trail = [[h1]]; }
  const sortOpts = ['best', 'new', 'price_asc', 'price_desc'];

  const filters = html`<form class="filters" id="filters" method="get" action="${L(base)}">
    <div class="filters-head"><h3>${t('shop.filters')}</h3><button type="button" class="icon-btn" data-close-filters aria-label="${t('nav.close')}">${icon('close')}</button></div>
    ${f.q ? html`<input type="hidden" name="q" value="${f.q}">` : ''}
    ${f.sort !== 'best' ? html`<input type="hidden" name="sort" value="${f.sort}">` : ''}
    ${kind !== 'category' ? html`<h4>${t('filter.dept')}</h4>
      <label class="opt"><input type="radio" name="dept" value="" ${!f.dept ? raw('checked') : ''}> ${t('filter.all')}</label>
      ${depts.map((d) => html`<label class="opt"><input type="radio" name="dept" value="${d.slug}" ${f.dept === d.slug ? raw('checked') : ''}> ${ctx.pick(d, 'name')} <small class="muted num">(${d.n})</small></label>`)}` : ''}
    <h4>${t('filter.price')} (₪)</h4>
    <div class="range"><input type="number" name="min" min="0" step="0.01" inputmode="decimal" placeholder="${t('filter.min')}" value="${f.min || ''}" aria-label="${t('filter.min')}">
      <input type="number" name="max" min="0" step="0.01" inputmode="decimal" placeholder="${t('filter.max')}" value="${f.max || ''}" aria-label="${t('filter.max')}"></div>
    <div class="stack"><button class="btn btn-navy" type="submit">${t('filter.apply')}</button>
      ${hasFilters ? html`<a class="btn btn-outline btn-sm" href="${L(base)}${f.q ? '?q=' + encodeURIComponent(f.q) : ''}">${t('filter.clear')}</a>` : ''}</div>
  </form>`;

  const body = html`
  ${breadcrumbs(ctx, trail)}
  <div class="wrap">
    <div class="page-head"><h1>${h1}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>
    <div class="listing">
      ${filters}
      <div class="listing-main">
        <div class="toolbar">
          <button class="btn btn-outline btn-sm filter-toggle" type="button" data-open-filters>${icon('filter')} ${t('shop.filters')}</button>
          <span class="muted"><span class="num">${res.total}</span> ${t('shop.results')}</span>
          <div class="sorts" aria-label="${t('shop.sort')}">${sortOpts.map((k) => html`<a href="${href({ sort: k === 'best' ? '' : k, page: '' })}" ${f.sort === k ? raw('aria-current="true"') : ''}>${t('sort.' + k)}</a>`)}</div>
        </div>
        ${res.items.length
          ? html`${productGrid(ctx, res.items)}${pager(ctx, f.page, res.pages, (n) => href({ page: n > 1 ? n : '' }))}`
          : html`<div class="empty"><h2>${t('shop.empty')}</h2><a class="btn btn-navy" href="${L('/shop')}">${t('nav.shop')}</a></div>`}
      </div>
    </div>
  </div>`;
  const noindex = kind === 'search' || f.page > 1 || hasFilters;
  return layout(ctx, { title, description: sub, body, canonical: kind === 'search' ? null : base, nav: kind === 'category' ? 'dept:' + category.dslug : 'shop', noindex });
}

/* ================= PRODUCT ================= */
export function product(ctx, slug, { quoteValues, quoteErrors } = {}) {
  const { t, L, lang } = ctx;
  const p = cat.getProductBySlug(slug);
  if (!p || !p.active) return null;
  const quote = cat.isQuote(p);
  const variants = cat.variantsOf(p.id);
  const sel = variants.find((v) => v.stock > 0) || variants[0];
  const related = cat.listProducts({ cat: p.cslug, exclude: p.id, limit: 4 }).items;
  const name = ctx.pick(p, 'name');
  const paras = String(ctx.pick(p, 'desc')).split(/\n{2,}/).filter(Boolean);
  const tiers = parseTiers(p.tiers);
  const days = ctx.pick(p, 'days') || t('p.days_default');
  const catName = ctx.pick({ name_ar: p.cname_ar, name_en: p.cname_en }, 'name');
  const deptName = ctx.pick({ name_ar: p.dname_ar, name_en: p.dname_en }, 'name');

  const buy = html`
    <form method="post" action="${L('/cart/add')}" data-ajax id="buy-form" data-tiers="${JSON.stringify(tiers)}" data-min="${p.min_qty}" data-step="${p.step}">
      ${variants.length > 1 ? html`<span class="field-label">${t('p.size')}</span>
      <div class="chips" role="radiogroup">${variants.map((v) => html`<label class="chip">
        <input type="radio" name="variant" value="${v.id}" ${v.id === sel.id ? raw('checked') : ''} ${v.stock <= 0 ? raw('disabled') : ''} data-price="${v.price}">
        <span>${ctx.pick(v, 'label')}</span></label>`)}</div>` : html`<input type="hidden" name="variant" value="${sel.id}" data-price="${sel.price}" checked>`}
      <span class="field-label">${t('p.qty')} ${p.min_qty > 1 ? html`<small class="muted">(${t('p.min')} <span class="num">${p.min_qty}</span>)</small>` : ''}</span>
      <div class="qty"><button type="button" data-qty="-1" aria-label="−">−</button>
        <input type="number" name="qty" value="${p.min_qty}" min="${p.min_qty}" step="${p.step}" max="1000000" inputmode="numeric" aria-label="${t('p.qty')}">
        <button type="button" data-qty="1" aria-label="+">+</button></div>
      ${tiers.length ? html`<table class="tiers num" id="tiers"><caption>${t('p.tiers')}</caption>
        <tr data-t="0"><td>${t('p.tier_none', { q: tiers[0].qty })}</td><td>—</td></tr>
        ${tiers.map((x) => html`<tr data-t="${x.qty}"><td>${t('p.tier_row', { q: x.qty })}</td><td>-${x.pct}%</td></tr>`)}</table>` : ''}
      <div class="total-box"><span>${t('p.total')}</span><b class="num" id="total">${money(sel.price * p.min_qty)}</b><small class="muted num" id="total-sub"></small></div>
      <button class="btn btn-accent btn-block" type="submit" id="add-btn">${t('p.add')}</button>
    </form>`;

  const body = html`
  ${breadcrumbs(ctx, [[deptName, L('/dept/' + p.dslug)], [catName, L('/category/' + p.cslug)], [name]])}
  <div class="wrap"><div class="pdp">
    <div class="pdp-media">${wishBtn(ctx, p.id)}${productImg(p)}</div>
    <div class="pdp-info">
      <a class="card-cat" href="${L('/category/' + p.cslug)}">${catName}</a>
      <h1>${name}</h1>
      ${quote ? html`<div class="price quote big">${p.minp > 0 ? html`<span class="from">${t('p.from')}</span> <span class="now num">${money(p.minp)}</span> <span class="muted">${ctx.pick(p, 'unit')}</span>` : t('p.quote_price')}</div>`
        : html`<div class="price big"><span class="now num" id="unit">${money(sel.price)}</span> <span class="muted">${ctx.pick(p, 'unit')}</span></div>`}
      ${ctx.pick(p, 'short') ? html`<p class="lead">${ctx.pick(p, 'short')}</p>` : ''}
      <ul class="facts">
        ${quote ? '' : html`<li>${icon('layers')}<span>${t('p.min')}: <b class="num">${p.min_qty}</b> · ${ctx.pick(p, 'unit')}</span></li>`}
        <li>${icon('clock')}<span>${t('p.days')}: <b>${days}</b></span></li>
        <li>${icon('eye')}<span>${t('p.logo_note')}</span></li>
        ${quote ? '' : html`<li>${icon('truck')}<span>${t('p.no_ship')}</span></li>`}
      </ul>
      ${quote ? quoteForm(ctx, { product: p, dept: { id: p.did, slug: p.dslug, mode: p.mode }, values: quoteValues, errors: quoteErrors }) : buy}
      <a class="btn btn-wa btn-block" style="margin-top:12px" href="${ctx.wa(t('p.wa_msg') + ' ' + name)}" target="_blank" rel="noopener">${t('p.ask_wa')}</a>
      ${paras.length ? html`<div class="desc"><h2>${t('p.desc')}</h2>${paras.map((x) => x.includes(' · ') ? html`<ul class="contents">${x.split(' · ').map((li) => html`<li>${li}</li>`)}</ul>` : html`<p>${x}</p>`)}</div>` : ''}
    </div>
  </div>
  ${related.length ? html`<section class="sec"><div class="sec-head"><h2>${t('p.related')}</h2></div>${productGrid(ctx, related)}</section>` : ''}
  </div>`;

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name, description: paras[0] || name, image: ctx.site + productImgSrc(p), category: catName,
    brand: { '@type': 'Brand', name: ctx.name },
    ...(quote ? {} : { offers: { '@type': 'AggregateOffer', priceCurrency: 'ILS', lowPrice: p.minp, highPrice: p.maxp, offerCount: variants.length, availability: 'https://schema.org/InStock' } }),
  };
  return layout(ctx, { title: name, description: ctx.pick(p, 'short') || paras[0], body, canonical: `/product/${p.slug}`, image: productImgSrc(p), jsonld, nav: 'dept:' + p.dslug });
}

/* ================= QUOTE ================= */
export function quoteForm(ctx, { product = null, dept = null, values = {}, errors = {}, depts = null } = {}) {
  const { t, L } = ctx;
  const sized = !dept || !!depts || dept.slug === 'signage';
  const fld = (name, label, extra = '', type = 'text', cls = '') => html`<div class="field ${errors[name] ? 'has-err' : ''} ${cls}">
    <label for="q-${name}">${label}</label><input class="input" id="q-${name}" name="${name}" type="${type}" value="${values[name] || ''}" ${raw(extra)}>
    ${errors[name] ? html`<div class="err" role="alert">${errors[name]}</div>` : ''}</div>`;
  return html`<form method="post" action="${L('/quote')}" enctype="multipart/form-data" class="panel quote-form" novalidate>
    <h2>${t('q.title')}</h2><p class="muted">${t('q.sub')}</p>
    ${product ? html`<input type="hidden" name="product" value="${product.id}">` : ''}
    ${dept && !depts ? html`<input type="hidden" name="dept" value="${dept.id}">` : ''}
    <div class="form-grid">
      ${depts ? html`<div class="field full"><label for="q-dept">${t('q.service')}</label><select class="input" id="q-dept" name="dept">
        ${depts.map((d) => html`<option value="${d.id}" ${String(values.dept || dept?.id) === String(d.id) ? raw('selected') : ''}>${ctx.pick(d, 'name')}</option>`)}</select></div>` : ''}
      ${sized ? html`${fld('width', t('q.width'), 'inputmode="decimal" min="0" step="1"', 'number')}${fld('height', t('q.height'), 'inputmode="decimal" min="0" step="1"', 'number')}` : ''}
      ${fld('qty', t('q.qty'), 'inputmode="numeric" min="1" step="1"', 'number')}
      ${fld('budget', t('q.budget'), 'placeholder="₪"')}
      <div class="field full ${errors.details ? 'has-err' : ''}"><label for="q-details">${t('q.details')}</label>
        <textarea class="input" id="q-details" name="details" rows="4" placeholder="${t('q.details_ph')}" required>${values.details || ''}</textarea>
        ${errors.details ? html`<div class="err" role="alert">${errors.details}</div>` : ''}</div>
      <div class="field full ${errors.file ? 'has-err' : ''}"><label for="q-file">${t('q.file')}</label>
        <label class="drop">${icon('upload')}<span>${t('q.file_hint')}</span><input id="q-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
        ${errors.file ? html`<div class="err" role="alert">${errors.file}</div>` : ''}</div>
      ${fld('name', t('co.name'), 'autocomplete="name" required')}
      ${fld('phone', t('co.phone'), 'autocomplete="tel" inputmode="tel" required dir="ltr" placeholder="05XXXXXXXX"', 'tel')}
      ${fld('business', t('q.business'), 'autocomplete="organization"')}
      ${fld('city', t('co.city'), 'autocomplete="address-level2"')}
    </div>
    <button class="btn btn-accent btn-block" type="submit">${t('q.send')}</button>
  </form>`;
}

export function quotePage(ctx, { values = {}, errors = {} } = {}) {
  const { t } = ctx;
  const depts = cat.departments();
  const pre = depts.find((d) => d.slug === ctx.query.dept) || depts.find((d) => d.mode === 'quote');
  const body = html`${breadcrumbs(ctx, [[t('q.title')]])}
  <div class="wrap narrow"><div class="page-head"><h1>${t('q.title')}</h1></div>
    ${quoteForm(ctx, { dept: pre, depts, values: { dept: pre?.id, ...values }, errors })}</div>`;
  return layout(ctx, { title: t('q.title'), body, canonical: '/quote', nav: 'quote' });
}

export function quoteSuccess(ctx, q) {
  const { t, L } = ctx;
  const body = html`<div class="wrap"><div class="success">
    <div class="tick">${icon('check')}</div><h1>${t('q.ok.title')}</h1>
    <p class="muted">${t('q.ok.text')}</p><div class="order-no num">${q.number}</div>
    <p>${t('q.ok.next')}</p>
    <div class="row center"><a class="btn btn-wa" href="${ctx.wa((ctx.lang === 'ar' ? 'مرحباً، رقم طلب عرض السعر: ' : 'Hello, my quote request number is ') + q.number)}" target="_blank" rel="noopener">WhatsApp</a>
    <a class="btn btn-outline" href="${L('')}">${t('back.home')}</a></div></div></div>`;
  return layout(ctx, { title: t('q.ok.title'), body, noindex: true });
}

/* ================= CART ================= */
export function cartPage(ctx, cart, notice = '') {
  const { t, L } = ctx;
  let body;
  if (!cart.items.length) {
    body = html`${breadcrumbs(ctx, [[t('cart')]])}<div class="wrap"><div class="empty">
      ${notice ? html`<div class="alert info">${notice}</div>` : ''}
      <h1>${t('cart.empty')}</h1><p>${t('cart.empty_sub')}</p><a class="btn btn-navy" href="${L('/shop')}">${t('cart.continue')}</a></div></div>`;
  } else {
    body = html`${breadcrumbs(ctx, [[t('cart')]])}
    <div class="wrap"><div class="page-head"><h1>${t('cart.title')}</h1></div>
      ${notice ? html`<div class="alert info">${notice}</div>` : ''}
      <div class="cart-wrap">
        <form class="panel" method="post" action="${L('/cart/update')}" id="cart-form">
          ${cart.items.map((it) => html`<div class="cart-line">
            <a class="thumb" href="${L('/product/' + it.slug)}">${productImg(it)}</a>
            <div class="cl-main">
              <h3><a href="${L('/product/' + it.slug)}">${ctx.pick(it, 'name')}</a></h3>
              <small>${ctx.pick({ label_ar: it.label_ar, label_en: it.label_en }, 'label')} · <span class="num">${money(it.unit)}</span> ${ctx.pick(it, 'unit')}
                ${it.pct ? html` · <b class="ok">${t('cart.discount', { p: it.pct })}</b>` : ''}</small>
              <div class="ctrl">
                <div class="qty"><button type="button" data-qty="-1" aria-label="−">−</button>
                  <input type="number" name="qty_${it.vid}" value="${it.qty}" min="${it.min_qty}" step="${it.step}" max="1000000" data-autosubmit inputmode="numeric" aria-label="${t('p.qty')}">
                  <button type="button" data-qty="1" aria-label="+">+</button></div>
                <button class="link-btn" type="submit" name="remove" value="${it.vid}">${t('cart.remove')}</button>
              </div>
            </div>
            <div class="line-total num">${money(it.line)}</div>
          </div>`)}
          <div class="row"><button class="btn btn-outline btn-sm" type="submit">${t('cart.update')}</button>
            <a class="btn btn-sm link-btn" href="${L('/shop')}">${t('cart.continue')}</a></div>
        </form>
        <aside class="panel summary">
          <h2>${t('co.summary')}</h2>
          <div class="sum-row"><span>${t('cart.subtotal')}</span><b class="num">${money(cart.subtotal)}</b></div>
          <div class="sum-row"><span>${t('cart.shipping')}</span><span class="muted">${t('cart.shipping_calc')}</span></div>
          <a class="btn btn-accent btn-block" href="${L('/checkout')}">${t('cart.checkout')}</a>
          <p class="muted small center">${t('p.logo_note')}</p>
        </aside>
      </div></div>`;
  }
  return layout(ctx, { title: t('cart'), body, noindex: true, nav: 'cart' });
}

/* ================= CHECKOUT ================= */
export function checkoutPage(ctx, cart, { values = {}, errors = {}, banner = '' } = {}) {
  const { t, L, S } = ctx;
  const zones = cat.zones();
  const freeMin = Math.round(Number(S.free_shipping_min) || 0);
  const zone = zones.find((z) => String(z.id) === String(values.zone)) || null;
  const ship = shippingFor(cart.subtotal, zone, freeMin);
  const cardOn = S.card_enabled === '1', codOn = S.cod_enabled === '1';
  const pay = values.payment || (codOn ? 'cod' : 'card');
  const fld = (name, label, extra = '', type = 'text', cls = '') => html`<div class="field ${errors[name] ? 'has-err' : ''} ${cls}">
    <label for="f-${name}">${label}</label>
    <input class="input" id="f-${name}" name="${name}" type="${type}" value="${values[name] || ''}" ${raw(extra)}>
    ${errors[name] ? html`<div class="err" role="alert">${errors[name]}</div>` : ''}</div>`;
  const body = html`${breadcrumbs(ctx, [[t('cart'), L('/cart')], [t('co.title')]])}
  <div class="wrap"><div class="page-head"><h1>${t('co.title')}</h1></div>
    ${banner ? html`<div class="alert err" role="alert">${banner}</div>` : ''}
    <form method="post" action="${L('/checkout')}" enctype="multipart/form-data" class="cart-wrap" novalidate id="checkout-form" data-free="${freeMin}" data-sub="${cart.subtotal}">
      <div class="stack-lg">
        <section class="panel"><h2>${t('co.details')}</h2>
          <div class="form-grid">
            ${fld('name', t('co.name'), 'autocomplete="name" required')}
            ${fld('phone', t('co.phone'), 'autocomplete="tel" inputmode="tel" required dir="ltr" placeholder="05XXXXXXXX"', 'tel')}
            ${fld('business', t('co.business'), 'autocomplete="organization"')}
            ${fld('email', t('co.email'), 'autocomplete="email" dir="ltr"', 'email')}
            <div class="field ${errors.zone ? 'has-err' : ''}"><label for="f-zone">${t('co.zone')}</label>
              <select class="input" id="f-zone" name="zone" required data-zone>
                <option value="">${t('co.select')}</option>
                ${zones.map((z) => html`<option value="${z.id}" data-fee="${z.fee}" ${String(z.id) === String(values.zone) ? raw('selected') : ''}>${ctx.pick(z, 'name')} — ${money(z.fee)}</option>`)}
              </select>${errors.zone ? html`<div class="err" role="alert">${errors.zone}</div>` : ''}</div>
            ${fld('city', t('co.city'), 'autocomplete="address-level2"')}
            ${fld('address', t('co.address'), 'autocomplete="street-address" required', 'text', 'full')}
          </div>
        </section>
        <section class="panel"><h2>${t('co.logo')}</h2>
          <div class="field ${errors.logo ? 'has-err' : ''}">
            <label class="drop">${icon('upload')}<span>${t('co.logo_hint')}</span><input name="logo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="${t('co.logo')}"></label>
            ${errors.logo ? html`<div class="err" role="alert">${errors.logo}</div>` : ''}</div>
          <div class="field"><label for="f-notes">${t('co.notes')}</label><textarea class="input" id="f-notes" name="notes" rows="3" placeholder="${t('co.notes_ph')}">${values.notes || ''}</textarea></div>
        </section>
        <section class="panel"><h2>${t('co.payment')}</h2>
          ${errors.payment ? html`<div class="err" role="alert">${errors.payment}</div>` : ''}
          ${codOn ? html`<label class="pay-opt"><input type="radio" name="payment" value="cod" ${pay === 'cod' ? raw('checked') : ''}><div><b>${t('co.cod')}</b><span>${t('co.cod_d')}</span></div></label>` : ''}
          ${cardOn ? html`<label class="pay-opt"><input type="radio" name="payment" value="card" ${pay === 'card' ? raw('checked') : ''}><div><b>${t('co.card')}</b><span>${t('co.card_d')}</span></div></label>` : ''}
        </section>
      </div>
      <aside class="panel summary">
        <h2>${t('co.summary')}</h2>
        ${cart.items.map((it) => html`<div class="sum-item"><span class="qn num">${it.qty}</span>
          <div class="nm">${ctx.pick(it, 'name')}<small>${ctx.pick({ label_ar: it.label_ar, label_en: it.label_en }, 'label')}${it.pct ? ' · ' + t('cart.discount', { p: it.pct }) : ''}</small></div><span class="num">${money(it.line)}</span></div>`)}
        <div class="sum-rows">
          <div class="sum-row"><span>${t('cart.subtotal')}</span><b class="num">${money(cart.subtotal)}</b></div>
          <div class="sum-row"><span>${t('cart.shipping')}</span><b class="num" id="ship-val">${ship == null ? '—' : ship === 0 ? t('cart.free') : money(ship)}</b></div>
          <div class="sum-row total"><span>${t('cart.grand')}</span><span class="num" id="grand-val">${money(cart.subtotal + (ship || 0))}</span></div>
        </div>
        <button class="btn btn-accent btn-block" type="submit">${t('co.place')}</button>
      </aside>
    </form></div>`;
  return layout(ctx, { title: t('co.title'), body, noindex: true, noFloat: true, nav: 'cart' });
}

export function successPage(ctx, order) {
  const { t, L } = ctx;
  const waText = (ctx.lang === 'ar' ? 'مرحباً، رقم طلبي: ' : 'Hello, my order number is ') + order.number + (order.logo ? '' : (ctx.lang === 'ar' ? ' — هذا الشعار:' : ' — here is the logo:'));
  const body = html`<div class="wrap"><div class="success">
    <div class="tick">${icon('check')}</div>
    <h1>${t('ok.title')}</h1>
    <p class="muted">${t('ok.number')}</p>
    <div class="order-no num">${order.number}</div>
    <p>${t('ok.msg')}</p>
    <p class="muted small">${t('ok.save_number')}</p>
    <div class="row center">
      <a class="btn btn-wa" href="${ctx.wa(waText)}" target="_blank" rel="noopener">${order.logo ? 'WhatsApp' : t('ok.send_logo')}</a>
      <a class="btn btn-navy" href="${L('/track')}">${t('ok.track')}</a>
      <a class="btn btn-outline" href="${L('/shop')}">${t('cart.continue')}</a>
    </div></div></div>`;
  return layout(ctx, { title: t('ok.title'), body, noindex: true });
}

/* ================= TRACK ================= */
export function trackPage(ctx, { order, items, values = {}, notFound = false, error = '' } = {}) {
  const { t, L } = ctx;
  const flow = ORDER_STATUSES.filter((s) => s !== 'cancelled');
  let result = '';
  if (order) {
    const idx = flow.indexOf(order.status);
    result = html`<div class="panel" style="margin-top:22px">
      <div class="sum-row"><b class="num">${order.number}</b><span class="muted num">${order.created_at}</span></div>
      ${order.status === 'cancelled'
        ? html`<div class="alert err">${t('status.cancelled')}</div>`
        : html`<ol class="timeline">${flow.map((s, i) => html`<li class="${i <= idx ? 'done' : ''}">${t('status.' + s)}</li>`)}</ol>`}
      <div class="sum-row"><span>${t('co.payment')}</span><b>${order.payment_method === 'cod' ? t('co.cod') : t('co.card')} · ${order.payment_status === 'paid' ? t('pay.paid') : order.payment_method === 'cod' ? t('pay.cod') : t('pay.pending')}</b></div>
      ${items.map((it) => html`<div class="sum-item"><span class="qn num">${it.qty}</span><div class="nm">${it.name}<small>${it.variant_label}</small></div><span class="num">${money(it.price * it.qty)}</span></div>`)}
      <div class="sum-row"><span>${t('cart.shipping')}</span><span class="num">${order.shipping ? money(order.shipping) : t('cart.free')}</span></div>
      <div class="sum-row total"><span>${t('cart.grand')}</span><span class="num">${money(order.total)}</span></div></div>`;
  }
  const body = html`${breadcrumbs(ctx, [[t('track.title')]])}
  <div class="wrap narrow"><div class="page-head"><h1>${t('track.title')}</h1><p>${t('track.sub')}</p></div>
    ${notFound ? html`<div class="alert err" role="alert">${t('track.notfound')}</div>` : ''}${error ? html`<div class="alert err" role="alert">${error}</div>` : ''}
    <form method="post" action="${L('/track')}" class="panel"><div class="form-grid">
      <div class="field"><label for="t-n">${t('track.number')}</label><input class="input" id="t-n" name="number" dir="ltr" placeholder="SH-250101-1234" value="${values.number || ''}" required></div>
      <div class="field"><label for="t-p">${t('co.phone')}</label><input class="input" id="t-p" name="phone" dir="ltr" type="tel" value="${values.phone || ''}" required></div>
      <div class="field full"><button class="btn btn-navy" type="submit">${t('track.btn')}</button></div></div></form>
    ${result}</div>`;
  return layout(ctx, { title: t('track.title'), body, noindex: true });
}

/* ================= WISHLIST ================= */
export function wishlistPage(ctx) {
  const { t, L } = ctx;
  const body = html`${breadcrumbs(ctx, [[t('wishlist')]])}
  <div class="wrap"><div class="page-head"><h1>${t('wishlist')}</h1></div>
    <div id="wish-list" data-url="${L('/wishlist/items')}"></div>
    <div class="empty" id="wish-empty" hidden><h2>${t('wish.empty')}</h2><p>${t('wish.empty_sub')}</p><a class="btn btn-navy" href="${L('/shop')}">${t('nav.shop')}</a></div>
  </div>`;
  return layout(ctx, { title: t('wishlist'), body, noindex: true });
}

/* ================= INFO PAGES ================= */
export function aboutPage(ctx) {
  const { t, L, lang } = ctx;
  const depts = cat.departments();
  const ar = lang === 'ar';
  const body = html`${breadcrumbs(ctx, [[t('about.title')]])}
  <div class="wrap narrow prose">
    <h1>${ctx.name}</h1>
    <p class="lead">${ar ? 'مطبعة في الخليل عند دائرة السير، بنشتغل مع المحلات والشركات والمطاعم والمناسبات: من يافطة المحل وواجهته، لكل مطبوعاتك بشعارك، لإدارة صفحاتك وحملاتك الإعلانية، ولحد المواد الخام بالجملة.' : 'A Hebron print shop by the Traffic Department roundabout, working with shops, companies, restaurants and events — from your shop sign and frontage, to everything printed with your logo, to running your social pages and ad campaigns, to wholesale supplies.'}</p>
    <h2>${t('home.depts.title')}</h2>
    <ul>${depts.map((d) => html`<li><a href="${L('/dept/' + d.slug)}"><b>${ctx.pick(d, 'name')}</b></a> — ${ctx.pick(d, 'blurb')}</li>`)}</ul>
    <h2>${t('home.how.title')}</h2>
    <ol>${[1, 2, 3].map((n) => html`<li><b>${t('home.how.' + n)}:</b> ${t('home.how.' + n + 'd')}</li>`)}</ol>
    <div class="row"><a class="btn btn-accent" href="${L('/shop')}">${t('nav.shop')}</a><a class="btn btn-outline" href="${L('/contact')}">${t('nav.contact')}</a></div>
  </div>`;
  return layout(ctx, { title: t('about.title'), body, canonical: '/about' });
}

export function contactPage(ctx) {
  const { t, lang, S } = ctx;
  const body = html`${breadcrumbs(ctx, [[t('contact.title')]])}
  <div class="wrap"><div class="page-head"><h1>${t('contact.title')}</h1><p>${t('contact.sub')}</p></div>
    <div class="contact">
      <div class="info">
        <div>${icon('phone')}<span><small>WhatsApp</small><b class="num sel" dir="ltr">${S.phone}</b></span></div>
        <div>${icon('mail')}<span><small>Email</small><b class="sel" dir="ltr">${S.email}</b></span></div>
        <div>${icon('pin')}<span><small>${lang === 'ar' ? 'العنوان' : 'Address'}</small><b>${lang === 'ar' ? S.address_ar : S.address_en}</b></span></div>
        <div>${icon('clock')}<span><small>${lang === 'ar' ? 'ساعات العمل' : 'Hours'}</small><b>${lang === 'ar' ? S.hours_ar : S.hours_en}</b></span></div>
      </div>
      <form class="panel" id="wa-form" data-wa="${String(S.whatsapp).replace(/\D/g, '')}">
        <div class="field"><label for="w-n">${t('contact.name')}</label><input class="input" id="w-n" required></div>
        <div class="field"><label for="w-m">${t('contact.msg')}</label><textarea class="input" id="w-m" rows="5" required></textarea></div>
        <button class="btn btn-wa" type="submit">${t('contact.send')}</button>
      </form>
    </div></div>`;
  return layout(ctx, { title: t('contact.title'), body, canonical: '/contact' });
}

const POLICIES = {
  shipping: {
    ar: ['التوصيل والتنفيذ', ['مدة التنفيذ عادةً من 2 إلى 5 أيام عمل حسب المنتج والكمية، وبعض المنتجات (مثل الكاسات المطبوعة) أسبوعين. بنبلغك بالمدة عند تأكيد الطلب.', 'بنوصل لكل المناطق، ورسوم التوصيل بتبين في صفحة تثبيت الطلب حسب المنطقة.', 'اللافتات والواجهات بنركّبها بأنفسنا، وموعد التركيب بنتفق عليه معك.']],
    en: ['Delivery & production', ['Production usually takes 2–5 working days depending on the product and quantity; some items (such as printed cups) take two weeks. We confirm timing when we confirm your order.', 'We deliver everywhere; the delivery fee for your area is shown at checkout.', 'Signs and shopfronts are installed by our team at a time we agree with you.']],
  },
  terms: {
    ar: ['الشروط والأحكام', ['الطلب بيتعتمد بعد ما نتفق معك على المنتج والكمية والتصميم والسعر ومدة التنفيذ.', 'انت مسؤول عن صحة النصوص والتصاميم اللي بتبعتها، وعن حقك باستخدام الشعارات والصور فيها.', 'الأسعار بالشيكل ولا تشمل التوصيل إلا إذا ذُكر غير ذلك.', 'الألوان المطبوعة ممكن تختلف شوي عن الشاشة حسب الخامة، وهذا مش عيب بالتنفيذ.', 'لأن المنتجات بتنطبع حسب طلبك، ما بنرجّعها ولا بنبدّلها إلا إذا في خطأ من عنا. بلّغنا خلال 3 أيام من الاستلام وبنعيد الطباعة.']],
    en: ['Terms', ['An order is confirmed once we agree on the product, quantity, design, price and timing.', 'You are responsible for the text and artwork you send and for your right to use any logos and images in it.', 'Prices are in shekels and exclude delivery unless stated.', 'Printed colours may differ slightly from your screen depending on the material; this is not a defect.', 'Because products are printed to order, they can’t be returned or exchanged unless we made a mistake. Tell us within 3 days of delivery and we will reprint.']],
  },
  privacy: {
    ar: ['سياسة الخصوصية', ['بنستخدم اسمك ورقمك وعنوانك فقط لتنفيذ طلبك وتوصيله والتواصل معك بخصوصه.', 'الشعارات والتصاميم اللي بترفعها بتضل ملكك، وما بنستخدمها لأي غرض ثاني بدون إذنك.', 'ما بنبيع بياناتك ولا بنشاركها مع أي جهة غير شركة التوصيل.']],
    en: ['Privacy', ['We use your name, number and address only to produce and deliver your order and to contact you about it.', 'Logos and designs you upload remain yours and are not used for anything else without your permission.', 'We never sell your data or share it with anyone other than the courier.']],
  },
};
export function policyPage(ctx, key) {
  const pol = POLICIES[key];
  if (!pol) return null;
  const [title, paras] = pol[ctx.lang];
  const body = html`${breadcrumbs(ctx, [[title]])}<div class="wrap narrow prose"><h1>${title}</h1>${paras.map((p) => html`<p>${p}</p>`)}</div>`;
  return layout(ctx, { title, body, canonical: '/policy/' + key });
}

export function notFoundPage(ctx) {
  const { t, L } = ctx;
  return layout(ctx, { title: t('nf.title'), noindex: true, body: html`<div class="wrap"><div class="empty"><h1>${t('nf.title')}</h1><p>${t('nf.text')}</p><a class="btn btn-navy" href="${L('')}">${t('back.home')}</a></div></div>` });
}
export function errorPage(ctx) {
  const { t, L } = ctx;
  return layout(ctx, { title: t('error.title'), noindex: true, body: html`<div class="wrap"><div class="empty"><h1>${t('error.title')}</h1><p>${t('error.text')}</p><a class="btn btn-navy" href="${L('')}">${t('back.home')}</a></div></div>` });
}
