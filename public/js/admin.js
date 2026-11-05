/* Admin helpers: local-time dates, confirm dialogs, variant rows, image preview. ES5 for older browsers. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  $$('time[data-utc]').forEach(function (t) {
    var raw = t.getAttribute('data-utc'); if (!raw) return;
    var d = new Date(raw.replace(' ', 'T') + 'Z'); if (isNaN(d.getTime())) return;
    try { t.textContent = d.toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { t.textContent = d.toLocaleString(); }
  });

  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-confirm]');
    if (c && !window.confirm(c.getAttribute('data-confirm'))) e.preventDefault();
    var del = e.target.closest && e.target.closest('[data-del-row]');
    if (del) {
      var body = $('#vbody'), row = del.closest('tr');
      if (body && $$('.vrow', body).length > 1) row.parentNode.removeChild(row);
      else if (row) $$('input:not([type=hidden])', row).forEach(function (i) { i.value = ''; });
    }
  });
  $$('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault(); });
  });

  var add = $('#add-variant');
  if (add) add.addEventListener('click', function () {
    var tpl = $('#vtpl'), body = $('#vbody');
    var holder = document.createElement('tbody');
    holder.innerHTML = tpl.innerHTML.replace(/^\s*<tr/, '<tr');
    var tr = holder.querySelector('tr') || holder.firstChild;
    body.appendChild(tr);
    var first = tr.querySelector('input[name=v_label_ar]'); if (first) first.focus();
  });

  var inp = $('#img-in'), prev = $('#img-prev');
  if (inp && prev) inp.addEventListener('change', function () {
    var f = inp.files && inp.files[0]; if (!f) return;
    var r = new FileReader(); r.onload = function () { prev.src = r.result; }; r.readAsDataURL(f);
  });
})();

/* font picker live preview */
(function () {
  var sels = document.querySelectorAll('[data-font-preview]');
  Array.prototype.forEach.call(sels, function (s) {
    s.addEventListener('change', function () {
      var pv = document.getElementById(s.getAttribute('data-font-preview')), v = s.value;
      if (!pv) return;
      pv.style.fontFamily = !v ? 'inherit' : v.indexOf('custom:') === 0 ? "'ShFont-" + v.slice(7) + "'" : "'" + v + "'";
    });
  });
})();
