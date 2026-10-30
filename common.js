/* 공통: 서버 호출, 화면 도구, 범위 표시 */
(function () {
  var CFG = window.QUIZ_CONFIG || {};
  var APP_VERSION = '1.2.1';
  window.APP_VERSION = APP_VERSION;

  function api(action, payload) {
    var body = Object.assign({ action: action }, payload || {});
    if (window.DEMO_BACKEND) {
      return new Promise(function (res) { setTimeout(function () { res(window.DEMO_BACKEND.handle(JSON.parse(JSON.stringify(body)))); }, 120); });
    }
    if (!CFG.api) return Promise.resolve({ ok: false, code: 'no_api', message: '서버 주소가 설정되지 않았습니다.' });
    return fetch(CFG.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, code: 'network', message: '인터넷 연결을 확인해 주세요. 잠시 뒤 다시 시도합니다.' }; });
  }
  function beacon(action, payload) {
    var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    if (window.DEMO_BACKEND) { try { window.DEMO_BACKEND.handle(JSON.parse(body)); } catch (e) { } return true; }
    try { if (navigator.sendBeacon && CFG.api) return navigator.sendBeacon(CFG.api, new Blob([body], { type: 'text/plain;charset=utf-8' })); } catch (e) { }
    try { fetch(CFG.api, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); } catch (e) { }
    return false;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var toastT;
  function toast(msg, ms) {
    var t = $('.toast'); if (!t) { t = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add('hidden'); }, ms || 2600);
  }
  function modal(opts) {
    var back = h('div', { class: 'modal-back' });
    var box = h('div', { class: 'modal ' + (opts.tone || ''), role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'mdl-t' });
    box.appendChild(h('h2', { id: 'mdl-t', text: opts.title || '' }));
    if (opts.html) box.appendChild(h('div', { html: opts.html, style: 'margin-top:10px' }));
    var row = h('div', { class: 'row', style: 'margin-top:20px;justify-content:flex-end' });
    (opts.buttons || [{ label: '확인', primary: true }]).forEach(function (b) {
      row.appendChild(h('button', {
        class: 'btn ' + (b.primary ? 'accent' : 'ghost'), text: b.label,
        onclick: function () { if (b.onClick && b.onClick() === false) return; document.body.removeChild(back); }
      }));
    });
    box.appendChild(row); back.appendChild(box); document.body.appendChild(back);
    setTimeout(function () { var f = box.querySelector('.btn.accent') || box.querySelector('.btn'); if (f) f.focus(); }, 30);
    return back;
  }
  function confirmBox(title, html, okLabel) {
    return new Promise(function (res) {
      modal({ title: title, html: html, buttons: [{ label: '취소', onClick: function () { res(false); } }, { label: okLabel || '확인', primary: true, onClick: function () { res(true); } }] });
    });
  }
  // 글자 크기(보편적 학습 설계: 표상 수단 조절)
  var SIZES = [15, 17, 19, 22];
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function applySize(i) { i = Math.max(0, Math.min(SIZES.length - 1, i)); document.documentElement.style.setProperty('--fs', SIZES[i] + 'px'); sset('quiz_fs', String(i)); return i; }
  var sizeIdx = applySize(Number(sget('quiz_fs') || 1));
  function sizeButtons() {
    return [
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '글자 작게', text: '가−', onclick: function () { sizeIdx = applySize(sizeIdx - 1); } }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '글자 크게', text: '가+', onclick: function () { sizeIdx = applySize(sizeIdx + 1); } })
    ];
  }
  function fmtDate(t) {
    if (!t) return '';
    var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '.' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtTime(t) { var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
  var TYPE_LABEL = { mc: '객관식', short: '단답형', essay: '서술형', imyong: '임용 기출 변형', orig: '임용 기출 원문' };
  var KIND_LABEL = { hidden: '다른 화면으로 전환', blur: '다른 창 선택', reenter: '앱 종료 후 다시 입장', leave: '페이지 나감' };

  /* 목차(정답 없음) */
  var OUT = window.OUTLINE || [];
  var IDX = {}; OUT.forEach(function (n, i) { IDX[n.id] = i; });
  function node(id) { return OUT[IDX[id]]; }
  function chapterOf(id) { var n = node(id); return n ? node(n.ch) : null; }
  function pathOf(id) {
    var n = node(id); if (!n) return [];
    var i = IDX[id], out = [n], lv = n.level;
    for (var j = i - 1; j >= 0 && lv > 0; j--) { if (OUT[j].ch !== n.ch) break; if (OUT[j].level < lv) { out.unshift(OUT[j]); lv = OUT[j].level; } }
    return out;
  }
  function gradeOf(id) {
    var n = node(id); if (!n) return null;
    if (n.imp && n.imp.grade) return n.imp.grade;
    var p = pathOf(id); for (var i = p.length - 2; i >= 1; i--) if (p[i].imp && p[i].imp.grade) return p[i].imp.grade;
    return null;
  }
  function impText(n) {
    if (!n || !n.imp) return '';
    var c = n.imp.subtotal || n.imp.count;
    return (n.imp.grade ? '중요도 ' + n.imp.grade : '') + (c ? ' · 기출 ' + c + '회' : '') + (n.imp.latest ? ' · 최근 ' + n.imp.latest : '');
  }
  function gradeChip(g) { if (!g) return null; if (g === '미산정') return h('span', { class: 'chip', text: '기출 횟수 미산정' }); return h('span', { class: 'chip ' + (g === '상' ? 'bad' : g === '중' ? 'warn' : ''), text: '임용 중요도 ' + g }); }
  function nodeText(n) { return (n.num ? n.num + ' ' : '') + n.title; }
  function rangeIds(start, end) {
    var si = start && IDX[start] !== undefined ? IDX[start] : 0;
    var ei = OUT.length - 1;
    if (end && IDX[end] !== undefined) {
      ei = IDX[end]; var lv = OUT[ei].level, ch = OUT[ei].ch;
      while (ei + 1 < OUT.length && OUT[ei + 1].ch === ch && OUT[ei + 1].level > lv) ei++;
    }
    if (si > ei) { var t = si; si = ei; ei = t; }
    var ids = []; for (var i = si; i <= ei; i++) ids.push(OUT[i].id);
    return ids;
  }
  function rangeLabel(start, end) {
    function part(id, isStart) {
      if (!id) return isStart ? (OUT[0] ? (OUT[0].num + ' ' + OUT[0].title + ' 첫 페이지') : '처음') : '마지막 장 끝';
      var p = pathOf(id); if (!p.length) return '';
      var ch = p[0];
      if (p.length === 1) return ch.num + ' ' + ch.title + (isStart ? ' 첫 페이지' : ' 끝');
      return ch.num + ' ' + p.slice(1).map(nodeText).join(' > ');
    }
    return part(start, true) + ' 시작 ~ ' + part(end, false) + '까지';
  }
  function rangePages(ids) {
    var pages = [];
    ids.forEach(function (id) { (node(id).pages || []).forEach(function (p) { if (pages.indexOf(p) < 0) pages.push(p); }); });
    return pages;
  }

  window.Q = {
    api: api, beacon: beacon, $: $, $$: $$, esc: esc, h: h, toast: toast, modal: modal, confirmBox: confirmBox,
    sizeButtons: sizeButtons, fmtDate: fmtDate, fmtTime: fmtTime, TYPE_LABEL: TYPE_LABEL, KIND_LABEL: KIND_LABEL,
    OUT: OUT, node: node, gradeOf: gradeOf, impText: impText, gradeChip: gradeChip, chapterOf: chapterOf, pathOf: pathOf, nodeText: nodeText, rangeIds: rangeIds, rangeLabel: rangeLabel, rangePages: rangePages,
    sget: sget, sset: sset, isDemo: function () { return !!window.DEMO_BACKEND; }
  };
})();
