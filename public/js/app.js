/* مطبعة الشهيد — storefront behaviour. Everything still works without JS (forms post normally). */
(function () {
  'use strict';
  var SH = window.SH || { msg: {}, lang: 'ar' };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var body = document.body;
  var money = function (n) { var v = Math.round(n * 100) / 100; return (v % 1 ? v.toFixed(2) : String(v)) + ' ₪'; };

  /* ---------- drawer & filters ---------- */
  $$('[data-open-drawer]').forEach(function (b) { b.addEventListener('click', function () { body.classList.add('drawer-open'); }); });
  $$('[data-close-drawer]').forEach(function (b) { b.addEventListener('click', function () { body.classList.remove('drawer-open'); }); });
  $$('[data-open-filters]').forEach(function (b) { b.addEventListener('click', function () { body.classList.add('filters-open'); }); });
  $$('[data-close-filters]').forEach(function (b) { b.addEventListener('click', function () { body.classList.remove('filters-open'); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') body.classList.remove('drawer-open', 'filters-open'); });

  /* ---------- toast ---------- */
  var toastEl = $('#toast'), toastTimer;
  function toast(text, href, linkText) {
    if (!toastEl) return;
    toastEl.textContent = '';
    var s = document.createElement('span'); s.textContent = text; toastEl.appendChild(s);
    if (href) { var a = document.createElement('a'); a.href = href; a.textContent = linkText; toastEl.appendChild(a); }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }
  function setCartCount(n) { $$('[data-cart-count]').forEach(function (el) { el.textContent = n > 0 ? n : ''; el.setAttribute('data-n', n); }); }

  /* ---------- add to cart (ajax) ---------- */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.matches || !f.matches('form[data-ajax]') || !window.fetch) return;
    e.preventDefault();
    var btn = f.querySelector('button[type=submit]');
    if (btn) btn.disabled = true;
    fetch(f.action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'fetch', 'Accept': 'application/json' },
      body: new URLSearchParams(new FormData(f)).toString()
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok) { setCartCount(d.count); toast(SH.msg.added, SH.cartUrl, SH.msg.cart); }
      else toast(SH.msg.error);
    }).catch(function () { f.submit(); }).then(function () { if (btn) btn.disabled = false; });
  });

  /* ---------- qty steppers (respect min / step) ---------- */
  function clampQty(input) {
    var min = parseInt(input.min || '1', 10) || 1, step = parseInt(input.step || '1', 10) || 1, max = parseInt(input.max || '1000000', 10);
    var v = parseInt(input.value, 10); if (!(v > 0)) v = min;
    v = Math.max(min, Math.min(max, v));
    if (step > 1) v = min + Math.ceil((v - min) / step) * step;
    return Math.min(v, max);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-qty]');
    if (!b) return;
    var input = b.closest('.qty') && b.closest('.qty').querySelector('input');
    if (!input) return;
    var dir = parseInt(b.getAttribute('data-qty'), 10) || 0, step = parseInt(input.step || '1', 10) || 1;
    input.value = (parseInt(input.value, 10) || 0) + dir * step;
    input.value = clampQty(input);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  $$('[data-autosubmit]').forEach(function (inp) {
    var t;
    inp.addEventListener('change', function () { clearTimeout(t); t = setTimeout(function () { inp.form.submit(); }, 500); });
  });

  /* ---------- product page: live price with quantity discounts ---------- */
  var buy = $('#buy-form');
  if (buy) {
    var tiers = []; try { tiers = JSON.parse(buy.getAttribute('data-tiers') || '[]'); } catch (e) {}
    var qty = $('input[name=qty]', buy), unitEl = $('#unit'), totalEl = $('#total'), subEl = $('#total-sub');
    var current = function () {
      var r = $$('input[name=variant]', buy).filter(function (x) { return x.type === 'hidden' || x.checked; })[0];
      return r ? parseFloat(r.getAttribute('data-price')) || 0 : 0;
    };
    var apply = function () {
      var price = current(), q = clampQty(qty), pct = 0, hit = 0;
      tiers.forEach(function (t) { if (q >= t.qty) { pct = t.pct; hit = t.qty; } });
      var unit = Math.round(price * (1 - pct / 100) * 100) / 100;
      if (unitEl) unitEl.textContent = money(unit);
      totalEl.textContent = money(unit * q);
      subEl.textContent = money(unit) + ' × ' + q + (pct ? ' · ' + (SH.msg.off || '').replace('{p}', pct) : '');
      $$('#tiers tr[data-t]').forEach(function (tr) { tr.classList.toggle('on', parseInt(tr.getAttribute('data-t'), 10) === hit); });
    };
    $$('input[name=variant]', buy).forEach(function (r) { r.addEventListener('change', apply); });
    qty.addEventListener('input', apply);
    qty.addEventListener('change', function () { qty.value = clampQty(qty); apply(); });
    apply();
  }

  /* ---------- file inputs: show the chosen file name ---------- */
  $$('.drop input[type=file]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0], span = inp.parentNode.querySelector('span');
      if (f && span) { span.textContent = f.name; inp.parentNode.classList.add('has-file'); }
    });
  });

  /* ---------- wishlist (localStorage) ---------- */
  var KEY = 'sh_wish';
  function getWish() { try { return JSON.parse(localStorage.getItem(KEY) || '[]').filter(Number); } catch (e) { return []; } }
  function setWish(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  function paintWish() {
    var w = getWish();
    $$('[data-wish]').forEach(function (b) {
      var on = w.indexOf(parseInt(b.getAttribute('data-wish'), 10)) > -1;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', on ? SH.msg.wishRemove : SH.msg.wishAdd);
    });
    $$('[data-wish-count]').forEach(function (el) { el.textContent = w.length || ''; el.setAttribute('data-n', w.length); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-wish]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = parseInt(b.getAttribute('data-wish'), 10), w = getWish(), i = w.indexOf(id);
    if (i > -1) w.splice(i, 1); else w.push(id);
    setWish(w); paintWish();
    if ($('#wish-list')) loadWishlist();
  });
  function loadWishlist() {
    var box = $('#wish-list'); if (!box) return;
    var ids = getWish(), empty = $('#wish-empty');
    if (!ids.length) { box.innerHTML = ''; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    fetch(box.getAttribute('data-url') + '?ids=' + ids.join(','), { credentials: 'same-origin' })
      .then(function (r) { return r.text(); }).then(function (h) { box.innerHTML = h; paintWish(); })
      .catch(function () { box.textContent = SH.msg.error; });
  }
  paintWish(); loadWishlist();

  /* ---------- checkout totals ---------- */
  var co = $('#checkout-form');
  if (co) {
    var sel = $('[data-zone]', co), sub = parseFloat(co.getAttribute('data-sub')) || 0, free = parseFloat(co.getAttribute('data-free')) || 0;
    var shipEl = $('#ship-val'), grandEl = $('#grand-val');
    var upd = function () {
      var o = sel.options[sel.selectedIndex], fee = o && o.getAttribute('data-fee') !== null ? parseFloat(o.getAttribute('data-fee')) : null;
      if (fee === null) { shipEl.textContent = '—'; grandEl.textContent = money(sub); return; }
      var s = (free > 0 && sub >= free) ? 0 : fee;
      shipEl.textContent = s === 0 ? SH.msg.free : money(s);
      grandEl.textContent = money(sub + s);
    };
    sel.addEventListener('change', upd); upd();
  }

  /* ---------- contact → whatsapp ---------- */
  var wa = $('#wa-form');
  if (wa) wa.addEventListener('submit', function (e) {
    e.preventDefault();
    var n = $('#w-n').value.trim(), m = $('#w-m').value.trim();
    window.open('https://wa.me/' + wa.getAttribute('data-wa') + '?text=' + encodeURIComponent(n + ': ' + m), '_blank', 'noopener');
  });
})();
