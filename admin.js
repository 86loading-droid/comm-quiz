/* 교수 화면: 시험 범위 설정·자동 출제·회기 운영·채점·성적 그래프 */
(function () {
  var Q = window.Q, h = Q.h, $ = Q.$, app = $('#app');
  var TOK = null, STATS = null, charts = [];
  var CIRC = '①②③④⑤⑥';
  $('#ver').textContent = '판 ' + window.APP_VERSION + (Q.isDemo() ? ' · 체험판(기록은 이 기기에만)' : '');
  Q.sizeButtons().forEach(function (b) { $('#tb-tools').appendChild(b); });
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }

  function call(action, p) {
    return Q.api(action, Object.assign({ adminToken: TOK }, p || {})).then(function (r) {
      if (!r.ok && r.code === 'admin_expired') { TOK = null; ssSet('quiz_adm', ''); showLogin(r.message); throw r; }
      return r;
    });
  }
  function killCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) { } }); charts = []; }
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  /* ---------- 로그인 ---------- */
  function showLogin(msg) {
    app.innerHTML = '';
    var pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': '교수 비밀번호' });
    var f = h('form', { class: 'card', style: 'max-width:460px;margin:40px auto' }, [
      h('p', { class: 'kicker', text: '교수 로그인' }), h('h1', { text: '비밀번호를 입력하세요' }),
      msg ? h('div', { class: 'note bad', text: msg }) : null,
      h('label', { class: 'field' }, [h('span', { text: '비밀번호' }), pw]),
      h('button', { class: 'btn accent block', type: 'submit', text: '들어가기' }),
      h('p', { class: 'tiny muted', style: 'margin-top:12px', text: '비밀번호는 기록 서버(Apps Script)의 스크립트 속성 ADMIN_PW에 교수님이 직접 넣은 값입니다.' })
    ]);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      Q.api('adminLogin', { pw: pw.value }).then(function (r) {
        if (!r.ok) { showLogin(r.message); return; }
        TOK = r.adminToken; ssSet('quiz_adm', TOK); boot();
      });
    });
    app.appendChild(f); setTimeout(function () { pw.focus(); }, 50);
  }

  /* ---------- 틀 ---------- */
  var TABS = [['make', '출제'], ['run', '응시 현황·채점'], ['grade', '성적 그래프'], ['set', '명단·문항은행']];
  var curTab = 'make', pollT = null;
  function boot() {
    call('bankStats').then(function (r) { if (!r.ok) { showLogin(r.message); return; } STATS = r; frame(); }).catch(function () { });
  }
  function frame() {
    app.innerHTML = '';
    var tabs = h('div', { class: 'tabs', role: 'tablist' });
    TABS.forEach(function (t) {
      tabs.appendChild(h('button', { role: 'tab', 'aria-selected': String(curTab === t[0]), text: t[1], onclick: function () { curTab = t[0]; frame(); } }));
    });
    tabs.appendChild(h('span', { style: 'flex:1' }));
    tabs.appendChild(h('button', { text: '로그아웃', onclick: function () { TOK = null; ssSet('quiz_adm', ''); showLogin(); } }));
    app.appendChild(tabs);
    var body = h('div', { id: 'tab-body' }); app.appendChild(body);
    clearInterval(pollT); killCharts();
    ({ make: tabMake, run: tabRun, grade: tabGrade, set: tabSet })[curTab](body);
  }

  /* ---------- 출제 ---------- */
  var draft = null; // {range:{start,end}, counts, questions, opts}
  function nodeOptions(chId, firstLabel) {
    var opts = [h('option', { value: chId, text: firstLabel })];
    Q.OUT.forEach(function (n) {
      if (n.ch !== chId || n.level === 0) return;
      var pad = n.level === 1 ? '' : n.level === 2 ? '   ' : '      ';
      var g = n.imp && n.imp.grade ? '  [' + n.imp.grade + ((n.imp.subtotal || n.imp.count) ? ' · 기출 ' + (n.imp.subtotal || n.imp.count) : '') + ']' : '';
      opts.push(h('option', { value: n.id, text: pad + Q.nodeText(n) + g }));
    });
    return opts;
  }
  function chapters() { return Q.OUT.filter(function (n) { return n.level === 0; }); }
  function countIn(ids) {
    var c = { mc: 0, short: 0, essay: 0, imyong: 0 }, seen = {};
    ids.forEach(function (id) { var b = STATS.byUnit[id]; if (b) Object.keys(c).forEach(function (k) { c[k] += b[k] || 0; }); });
    return c;
  }
  function tabMake(body) {
    var st = draft && draft.form ? draft.form : { sCh: chapters()[0].id, sNode: chapters()[0].id, eCh: chapters()[0].id, eNode: chapters()[0].id, counts: { mc: 4, short: 2, essay: 1, imyong: 1 }, excludeUsed: true, timeLimit: 15, showResult: 'immediate', shuffle: true };
    var sCh = h('select', { 'aria-label': '시작 장' }), sNode = h('select', { 'aria-label': '시작 위치' });
    var eCh = h('select', { 'aria-label': '끝 장' }), eNode = h('select', { 'aria-label': '끝 위치' });
    chapters().forEach(function (c) {
      var g = c.imp && c.imp.grade ? '  [' + c.imp.grade + ']' : '';
      sCh.appendChild(h('option', { value: c.id, text: c.num + ' ' + c.title + g }));
      eCh.appendChild(h('option', { value: c.id, text: c.num + ' ' + c.title + g }));
    });
    function fillS() { sNode.innerHTML = ''; nodeOptions(sCh.value, '장 첫 페이지부터').forEach(function (o) { sNode.appendChild(o); }); }
    function fillE() { eNode.innerHTML = ''; nodeOptions(eCh.value, '장 끝까지').forEach(function (o) { eNode.appendChild(o); }); }
    sCh.value = st.sCh; fillS(); sNode.value = st.sNode; eCh.value = st.eCh; fillE(); eNode.value = st.eNode;
    var label = h('div', { class: 'range-label', 'aria-live': 'polite' });
    var avail = h('p', { class: 'small muted' });
    var trendBox = h('div', { class: 'trend-box' });
    function drawTrend(id) {
      trendBox.innerHTML = '';
      var rows = id.map(Q.node).filter(function (n) { return n.level > 0 && n.imp && n.imp.grade && (n.imp.count > 0 || n.imp.grade === '미산정'); });
      var W = { '상': 3, '중': 2, '하': 1 };
      rows.sort(function (a, b) { return ((W[b.imp.grade] || 0) - (W[a.imp.grade] || 0)) || ((b.imp.subtotal || b.imp.count || 0) - (a.imp.subtotal || a.imp.count || 0)); });
      trendBox.appendChild(h('p', { class: 'small', style: 'margin:14px 0 6px', html: '<b>임용 출제 경향</b> (범위 안 단원, 기출 횟수 기준 중요도)' }));
      if (!rows.length) { trendBox.appendChild(h('p', { class: 'small muted', text: '이 범위에는 임용 기출로 확인된 단원이 없습니다.' })); return; }
      var tb = h('tbody');
      rows.forEach(function (n) {
        var ch = Q.node(n.ch);
        tb.appendChild(h('tr', {}, [
          h('td', {}, [Q.gradeChip(n.imp.grade)]),
          h('td', { html: '<b>' + Q.esc(Q.nodeText(n)) + '</b><div class="tiny muted">' + Q.esc(ch.num) + (n.imp.trend ? ' · ' + Q.esc(n.imp.trend) : '') + '</div>' }),
          h('td', { class: 'small', text: n.imp.grade === '미산정' ? '-' : (n.imp.subtotal || n.imp.count || 0) + '회' + (n.imp.recent ? ' (최근 5년 ' + n.imp.recent + ')' : '') }),
          h('td', { class: 'tiny muted', text: (n.imp.codes || []).slice(-4).join(', ') })
        ]));
      });
      trendBox.appendChild(h('div', { class: 'table-wrap' }, [h('table', {}, [h('thead', {}, [h('tr', {}, ['중요도', '단원·경향', '횟수', '최근 기출'].map(function (t) { return h('th', { text: t }); }))]), tb])]));
    }
    var counts = JSON.parse(JSON.stringify(st.counts));
    var mixBox = h('div', { class: 'mix' });
    var totalOut = h('b');
    function startId() { return sNode.value; }
    function endId() { return eNode.value; }
    function ids() { return Q.rangeIds(startId() === chapters()[0].id ? null : startId(), endId()); }
    function refresh() {
      label.textContent = Q.rangeLabel(startId() === sCh.value ? sCh.value : startId(), endId());
      var id = ids(), c = countIn(id), pg = Q.rangePages(id);
      drawTrend(id);
      avail.innerHTML = '범위 안 문항: 객관식 <b>' + c.mc + '</b> · 단답형 <b>' + c.short + '</b> · 서술형 <b>' + c.essay + '</b> · 임용 기출 변형 <b>' + c.imyong + '</b>' +
        (pg.length ? '<br>강의자료 쪽: ' + Q.esc(pg[0]) + ' ~ ' + Q.esc(pg[pg.length - 1]) + ' (' + pg.length + '쪽)' : '');
      var tot = counts.mc + counts.short + counts.essay + counts.imyong;
      totalOut.textContent = '모두 ' + tot + '문항';
      totalOut.style.color = tot < 5 || tot > 10 ? css('--bad') : '';
      genBtn.disabled = tot < 5 || tot > 10;
      genBtn.textContent = tot < 5 || tot > 10 ? '문항 수를 5~10개로 맞춰 주세요' : '문제 자동 생성 (' + tot + '문항)';
    }
    function stepper(key, label, max) {
      var out = h('output', { text: String(counts[key]) });
      function set(v) { counts[key] = Math.max(0, Math.min(max, v)); out.textContent = String(counts[key]); refresh(); }
      return h('div', { class: 'cell' }, [h('b', { text: label }), h('div', { class: 'stepper' }, [
        h('button', { type: 'button', 'aria-label': label + ' 줄이기', text: '−', onclick: function () { set(counts[key] - 1); } }), out,
        h('button', { type: 'button', 'aria-label': label + ' 늘리기', text: '+', onclick: function () { set(counts[key] + 1); } })])]);
    }
    mixBox.appendChild(stepper('mc', '객관식', 10)); mixBox.appendChild(stepper('short', '단답형', 10));
    mixBox.appendChild(stepper('essay', '서술형', 5)); mixBox.appendChild(stepper('imyong', '임용 기출 변형', 2));
    [sCh, sNode, eCh, eNode].forEach(function (s) { s.addEventListener('change', function () { if (s === sCh) fillS(); if (s === eCh) fillE(); refresh(); }); });
    var exUsed = h('input', { type: 'checkbox', checked: st.excludeUsed });
    var shuffle = h('input', { type: 'checkbox', checked: st.shuffle });
    var prefer = h('input', { type: 'checkbox', checked: st.preferImportant !== false });
    var tl = h('input', { type: 'number', min: '0', max: '180', value: String(st.timeLimit), style: 'max-width:120px' });
    var showRes = h('select', {}, [h('option', { value: 'immediate', text: '제출하면 바로 점수·해설 공개' }), h('option', { value: 'after', text: '교수가 공개한 뒤에 공개' })]);
    showRes.value = st.showResult;
    var genBtn = h('button', { class: 'btn accent', type: 'button' });
    function form() { return { sCh: sCh.value, sNode: sNode.value, eCh: eCh.value, eNode: eNode.value, counts: counts, excludeUsed: exUsed.checked, timeLimit: Number(tl.value) || 0, showResult: showRes.value, shuffle: shuffle.checked, preferImportant: prefer.checked }; }
    function range() { return { start: sNode.value === chapters()[0].id ? null : sNode.value, end: eNode.value }; }
    genBtn.addEventListener('click', function () {
      genBtn.disabled = true; genBtn.textContent = '만드는 중…';
      call('generate', { range: range(), counts: counts, excludeUsed: exUsed.checked, preferImportant: prefer.checked }).then(function (r) {
        refresh();
        if (!r.ok) { Q.toast(r.message, 4000); return; }
        draft = { form: form(), range: range(), rangeLabel: label.textContent, questions: r.questions, shortage: r.shortage };
        renderDraft(previewBox);
        previewBox.scrollIntoView({ behavior: 'smooth' });
      }).catch(function () { });
    });
    body.appendChild(h('div', { class: 'card' }, [
      h('p', { class: 'kicker', text: '1단계' }), h('h2', { text: '시험 범위 정하기' }),
      h('p', { class: 'small muted', text: '대제목(장) → 소제목·내용(절·항·목) 순서로 시작과 끝을 고르세요. 끝으로 고른 항목은 그 아래 내용까지 모두 들어갑니다.' }),
      h('div', { class: 'range-box', style: 'margin-top:12px' }, [
        h('div', { class: 'range-side' }, [h('b', { text: '시작' }), h('label', { class: 'field' }, [h('span', { text: '대제목(장)' }), sCh]), h('label', { class: 'field' }, [h('span', { text: '소제목·내용' }), sNode])]),
        h('div', { class: 'range-side' }, [h('b', { text: '끝' }), h('label', { class: 'field' }, [h('span', { text: '대제목(장)' }), eCh]), h('label', { class: 'field' }, [h('span', { text: '소제목·내용' }), eNode])])
      ]),
      h('p', { class: 'small', style: 'margin:14px 0 6px', html: '<b>시험 범위 표시</b> (학생 화면에 이대로 나갑니다)' }), label, avail, trendBox
    ]));
    body.appendChild(h('div', { class: 'card' }, [
      h('p', { class: 'kicker', text: '2단계' }), h('h2', { text: '문항 수와 유형' }),
      h('p', { class: 'small muted', text: '한 회기 5~10문항. 임용 기출 변형은 같은 범위의 임용 기출(서답형)을 단답형·객관식으로 바꾼 문항입니다(0~2개).' }),
      mixBox, h('p', { style: 'margin-top:10px' }, [totalOut]),
      h('div', { class: 'grid2', style: 'margin-top:8px' }, [
        h('label', { class: 'row' }, [exUsed, h('span', { text: '이전 회기에 낸 문항은 빼기' })]),
        h('label', { class: 'row' }, [shuffle, h('span', { text: '학생마다 문항·보기 순서 섞기' })]),
        h('label', { class: 'row' }, [prefer, h('span', { text: '임용 중요도 높은 단원 먼저 뽑기' })]),
        h('label', { class: 'field' }, [h('span', { text: '제한 시간(분, 0은 제한 없음)' }), tl]),
        h('label', { class: 'field' }, [h('span', { text: '결과 공개' }), showRes])
      ]),
      genBtn
    ]));
    var previewBox = h('div', { id: 'preview' });
    body.appendChild(previewBox);
    refresh();
    if (draft && draft.questions) renderDraft(previewBox);
    // 설정 바뀌면 기억
    [exUsed, shuffle, tl, showRes].forEach(function (x) { x.addEventListener('change', function () { if (draft) draft.form = form(); }); });
    body._form = form;
  }
  function renderDraft(box) {
    box.innerHTML = '';
    var d = draft;
    var card = h('div', { class: 'card' }, [
      h('p', { class: 'kicker', text: '3단계' }), h('h2', { text: '문항 확인·고치기' }),
      h('p', { class: 'small', text: d.rangeLabel })
    ]);
    if (d.shortage && d.shortage.length) {
      card.appendChild(h('div', { class: 'note warn', text: d.shortage.map(function (s) { return Q.TYPE_LABEL[s.type] + ' ' + s.want + '개 중 ' + s.got + '개만 찾았습니다'; }).join(' · ') + '. 범위를 넓히거나 다른 유형으로 바꾸세요.' }));
    }
    d.questions.forEach(function (q, i) { card.appendChild(pqCard(q, i)); });
    var title = h('input', { type: 'text', maxlength: '80', value: d.title || defaultTitle() });
    title.addEventListener('input', function () { d.title = title.value; });
    var n = d.questions.length;
    card.appendChild(h('label', { class: 'field' }, [h('span', { text: '시험 이름' }), title]));
    card.appendChild(h('div', { class: 'row' }, [
      h('button', { class: 'btn accent', type: 'button', text: '이대로 시험 열기', disabled: n < 5 || n > 10, onclick: function () { save('open', title.value); } }),
      h('button', { class: 'btn ghost', type: 'button', text: '임시 저장(아직 안 열기)', disabled: n < 5 || n > 10, onclick: function () { save('draft', title.value); } }),
      h('button', { class: 'btn ghost', type: 'button', text: '모두 다시 뽑기', onclick: function () { $('#tab-body .btn.accent').click(); } })
    ]));
    if (n < 5 || n > 10) card.appendChild(h('p', { class: 'note bad small', text: '지금 ' + n + '문항입니다. 5~10문항이어야 열 수 있습니다.' }));
    box.appendChild(card);
  }
  function defaultTitle() {
    var d = new Date(); return '의사소통장애 퀴즈 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }
  function save(status, title) {
    var f = draft.form;
    call('createSession', { title: title || defaultTitle(), range: draft.range, rangeLabel: draft.rangeLabel, questions: draft.questions, timeLimit: f.timeLimit, showResult: f.showResult, shuffle: f.shuffle, status: status }).then(function (r) {
      if (!r.ok) { Q.toast(r.message, 4000); return; }
      Q.toast(status === 'open' ? '시험을 열었습니다. 학생 화면에 바로 보입니다.' : '임시 저장했습니다.');
      draft = { form: draft.form }; curTab = 'run'; frame();
    }).catch(function () { });
  }
  function pqCard(q, i) {
    var box = h('div', { class: 'pq' });
    function view() {
      box.innerHTML = '';
      box.appendChild(h('div', { class: 'row' }, [
        h('b', { text: (i + 1) + '번' }), h('span', { class: 'chip', text: Q.TYPE_LABEL[q.type] }),
        q.kind === 'imyong' ? h('span', { class: 'chip warn', text: '임용 기출 변형 ' + (q.code || '') }) : null,
        q.source ? h('span', { class: 'chip', text: '근거 ' + q.source }) : null,
        Q.gradeChip(q.grade || (q.unit ? Q.gradeOf(q.unit) : null)),
        h('span', { style: 'flex:1' }),
        h('button', { class: 'btn ghost sm', type: 'button', text: '다른 문항으로', onclick: replace }),
        h('button', { class: 'btn ghost sm', type: 'button', text: '고치기', onclick: edit }),
        h('button', { class: 'btn ghost sm', type: 'button', text: '빼기', onclick: function () { draft.questions.splice(i, 1); renderDraft($('#preview')); } })
      ]));
      box.appendChild(h('p', { style: 'white-space:pre-wrap;margin:10px 0', text: q.stem }));
      if (q.type === 'mc') box.appendChild(h('ol', { class: 'small', style: 'list-style:none;padding-left:0' }, q.options.map(function (o, k) {
        return h('li', { class: k === q.answer ? 'ans' : '', text: CIRC[k] + ' ' + o + (k === q.answer ? '  ← 정답' : '') });
      })));
      if (q.type === 'short') box.appendChild(h('p', { class: 'small', html: '정답(인정 답): <span class="ans">' + q.accept.map(Q.esc).join(' / ') + '</span>' }));
      if (q.type === 'essay') {
        box.appendChild(h('p', { class: 'small', html: '채점 요소: ' + q.keyPoints.map(function (k) { return Q.esc(k.point) + ' <span class="muted">[' + Q.esc((k.keywords || []).join(', ')) + ']</span>'; }).join('<br>') }));
        if (q.model) box.appendChild(h('p', { class: 'small muted', text: '모범 답안: ' + q.model }));
      }
      if (q.explain) box.appendChild(h('p', { class: 'small muted', text: '해설: ' + q.explain }));
    }
    function replace() {
      var t = q.kind === 'imyong' ? 'imyong' : q.type;
      call('regenOne', { range: draft.range, type: t, excludeIds: draft.questions.map(function (x) { return x.bankId; }), excludeUsed: draft.form.excludeUsed, preferImportant: draft.form.preferImportant !== false }).then(function (r) {
        if (!r.ok) { Q.toast(r.message); return; }
        draft.questions[i] = r.question; renderDraft($('#preview'));
      }).catch(function () { });
    }
    function edit() {
      box.innerHTML = '';
      var stem = h('textarea', {}); stem.value = q.stem;
      box.appendChild(h('label', { class: 'field' }, [h('span', { text: '발문' }), stem]));
      var optIns = [], radios = [];
      if (q.type === 'mc') {
        q.options.forEach(function (o, k) {
          var r = h('input', { type: 'radio', name: 'ans' + i, checked: k === q.answer, 'aria-label': (k + 1) + '번을 정답으로' });
          var t = h('input', { type: 'text', value: o }); optIns.push(t); radios.push(r);
          box.appendChild(h('div', { class: 'row', style: 'margin:6px 0;flex-wrap:nowrap' }, [r, h('b', { text: CIRC[k] }), t]));
        });
        box.appendChild(h('p', { class: 'tiny muted', text: '동그라미를 누른 보기가 정답입니다.' }));
      }
      var acc = null, kp = null, model = null;
      if (q.type === 'short') { acc = h('input', { type: 'text', value: q.accept.join(' / ') }); box.appendChild(h('label', { class: 'field' }, [h('span', { text: '인정 답(/로 구분)' }), acc])); }
      if (q.type === 'essay') {
        kp = h('textarea', {}); kp.value = q.keyPoints.map(function (k) { return k.point + ' | ' + (k.keywords || []).join(', ') + ' | ' + (k.pts || 1); }).join('\n');
        box.appendChild(h('label', { class: 'field' }, [h('span', { text: '채점 요소(한 줄에 하나: 요소 | 핵심어, 핵심어 | 배점)' }), kp]));
        model = h('textarea', {}); model.value = q.model || '';
        box.appendChild(h('label', { class: 'field' }, [h('span', { text: '모범 답안' }), model]));
      }
      var ex = h('textarea', {}); ex.value = q.explain || '';
      box.appendChild(h('label', { class: 'field' }, [h('span', { text: '해설' }), ex]));
      box.appendChild(h('div', { class: 'row' }, [
        h('button', { class: 'btn sm', type: 'button', text: '고친 내용 적용', onclick: function () {
          q.stem = stem.value.trim();
          if (q.type === 'mc') { q.options = optIns.map(function (t) { return t.value.trim(); }); q.answer = radios.findIndex(function (r) { return r.checked; }); }
          if (acc) q.accept = acc.value.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
          if (kp) q.keyPoints = kp.value.split('\n').map(function (l) { var p = l.split('|'); return { point: (p[0] || '').trim(), keywords: (p[1] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean), pts: Number(p[2]) || 1 }; }).filter(function (k) { return k.point; });
          if (model) q.model = model.value.trim();
          q.explain = ex.value.trim(); q.edited = true; view();
        } }),
        h('button', { class: 'btn ghost sm', type: 'button', text: '취소', onclick: view })
      ]));
    }
    view();
    return box;
  }

  /* ---------- 응시 현황·채점 ---------- */
  var openSid = null;
  function tabRun(body) {
    var list = h('div', { class: 'card' }, [h('h2', { text: '시험 회기' }), h('p', { class: 'muted' }, [h('span', { class: 'spinner' }), ' 불러오는 중…'])]);
    var detail = h('div', { id: 'detail' });
    body.appendChild(list); body.appendChild(detail);
    function loadList() {
      call('listSessions').then(function (r) {
        if (!r.ok) return;
        list.innerHTML = ''; list.appendChild(h('div', { class: 'row between' }, [h('h2', { text: '시험 회기' }), h('button', { class: 'btn ghost sm', text: '새로고침', onclick: loadList })]));
        if (!r.sessions.length) { list.appendChild(h('p', { class: 'muted', text: '아직 만든 시험이 없습니다. 「출제」 탭에서 만드세요.' })); return; }
        var tb = h('tbody');
        r.sessions.forEach(function (s) {
          var stChip = s.status === 'open' ? h('span', { class: 'chip ok', text: '응시 중' }) : s.status === 'draft' ? h('span', { class: 'chip', text: '임시 저장' }) : h('span', { class: 'chip', text: '마감' });
          tb.appendChild(h('tr', {}, [
            h('td', {}, [h('b', { text: s.title }), h('div', { class: 'tiny muted', text: s.rangeLabel })]),
            h('td', {}, [stChip]),
            h('td', { text: s.n + '문항' + (s.timeLimit ? ' · ' + s.timeLimit + '분' : '') }),
            h('td', { html: '제출 ' + s.nDone + ' · 응시 중 ' + s.nInProgress + (s.nTerminated ? ' · <span class="chip bad">이탈 종료 ' + s.nTerminated + '</span>' : '') + (s.nPending ? ' · <span class="chip warn">서술형 채점 ' + s.nPending + '</span>' : '') }),
            h('td', { text: s.avg == null ? '-' : String(s.avg) }),
            h('td', {}, [h('button', { class: 'btn sm', text: '열어 보기', onclick: function () { openSid = s.id; loadDetail(); } })])
          ]));
        });
        list.appendChild(h('div', { class: 'table-wrap' }, [h('table', {}, [h('thead', {}, [h('tr', {}, ['시험', '상태', '구성', '응시', '평균', ''].map(function (t) { return h('th', { text: t }); }))]), tb])]));
      }).catch(function () { });
    }
    function loadDetail() {
      if (!openSid) return;
      call('sessionDetail', { id: openSid }).then(function (r) { if (r.ok) renderDetail(detail, r, loadDetail, loadList); }).catch(function () { });
    }
    loadList(); if (openSid) loadDetail();
    pollT = setInterval(function () { if (document.visibilityState === 'visible' && openSid && !detail.querySelector('.editing')) loadDetail(); }, 15000);
  }
  function scoreOf(a) { return a.score == null ? '-' : a.score; }
  function renderDetail(box, r, reload, reloadList) {
    var s = r.session, at = r.attempts.sort(function (a, b) { return a.no < b.no ? -1 : 1; });
    box.innerHTML = '';
    var card = h('div', { class: 'card' });
    card.appendChild(h('div', { class: 'row between' }, [
      h('div', {}, [h('p', { class: 'kicker', text: s.status === 'open' ? '응시 중 · 15초마다 새로 고침' : s.status === 'draft' ? '임시 저장' : '마감' }), h('h2', { text: s.title }), h('p', { class: 'small muted', text: s.rangeLabel })]),
      h('div', { class: 'row' }, [
        s.status !== 'open' ? h('button', { class: 'btn accent sm', text: '응시 열기', onclick: function () { upd({ status: 'open' }); } }) : h('button', { class: 'btn sm', text: '응시 마감', onclick: function () { Q.confirmBox('응시를 마감할까요?', '<p>응시 중인 학생은 더 이상 들어올 수 없고, 이미 연 학생은 제출만 할 수 있습니다.</p>', '마감').then(function (ok) { if (ok) upd({ status: 'closed' }); }); } }),
        h('button', { class: 'btn ghost sm', text: s.released ? '결과 비공개로' : '결과 공개', onclick: function () { upd({ released: !s.released }); } }),
        h('button', { class: 'btn ghost sm', text: 'CSV 내려받기', onclick: function () { csv(s, at); } }),
        h('button', { class: 'btn danger sm', text: '회기 삭제', onclick: function () { Q.confirmBox('회기를 지울까요?', '<p>이 회기의 문항과 학생 응시 기록 ' + at.length + '건이 모두 지워집니다. 되돌릴 수 없습니다.</p>', '삭제').then(function (ok) { if (ok) call('deleteSession', { id: s.id }).then(function () { openSid = null; box.innerHTML = ''; reloadList(); }); }); } })
      ])
    ]));
    function upd(patch) { call('updateSession', { id: s.id, patch: patch }).then(function (x) { if (!x.ok) Q.toast(x.message); reload(); reloadList(); }).catch(function () { }); }
    var done = at.filter(function (a) { return a.status !== 'in_progress'; });
    var sc = done.map(function (a) { return a.status === 'terminated' ? 0 : a.score; });
    var avg = sc.length ? Math.round(sc.reduce(function (t, x) { return t + x; }, 0) / sc.length * 10) / 10 : '-';
    card.appendChild(h('div', { class: 'stat', style: 'margin:12px 0' }, [
      h('div', {}, [h('b', { text: String(at.length) }), h('span', { text: '입장' })]),
      h('div', {}, [h('b', { text: String(done.length) }), h('span', { text: '제출·종료' })]),
      h('div', {}, [h('b', { text: String(at.filter(function (a) { return a.violations.length; }).length) }), h('span', { text: '이탈 기록 있음' })]),
      h('div', {}, [h('b', { text: String(avg) }), h('span', { text: '평균(100점)' })])
    ]));
    var tb = h('tbody');
    at.forEach(function (a) {
      var st = a.status === 'in_progress' ? h('span', { class: 'chip acc', text: '응시 중 ' + a.answered + '/' + s.questions.length }) : a.status === 'terminated' ? h('span', { class: 'chip bad', text: '이탈 종료(0점)' }) : h('span', { class: 'chip ok', text: a.endReason === 'timeout' || a.endReason === 'auto' ? '시간 종료 제출' : '제출' });
      var vio = a.violations.length ? a.violations.map(function (v) { return Q.fmtTime(v.at) + ' ' + (Q.KIND_LABEL[v.kind] || v.kind); }).join('\n') : '';
      tb.appendChild(h('tr', {}, [
        h('td', { text: a.no }), h('td', { text: a.name }), h('td', {}, [st]),
        h('td', { style: 'white-space:pre-line', html: a.violations.length ? '<b style="color:' + css('--bad') + '">' + a.violations.length + '회</b><div class="tiny muted">' + Q.esc(vio) + '</div>' : '<span class="muted">없음</span>' }),
        h('td', { html: '<b>' + scoreOf(a) + '</b>' + (a.pending && a.status === 'submitted' ? ' <span class="chip warn">서술 채점</span>' : '') }),
        h('td', { class: 'tiny muted', text: Q.fmtDate(a.startedAt) + (a.submittedAt ? ' → ' + Q.fmtTime(a.submittedAt) : '') + '\n' + (a.device || '') }),
        h('td', {}, [h('button', { class: 'btn ghost sm', text: '답안', onclick: function () { sheet(s, a, reload); } })])
      ]));
    });
    card.appendChild(h('div', { class: 'table-wrap' }, [h('table', {}, [h('thead', {}, [h('tr', {}, ['학번', '이름', '상태', '화면 이탈', '점수', '시각·기기', ''].map(function (t) { return h('th', { text: t }); }))]), tb])]));
    if (!at.length) card.appendChild(h('p', { class: 'muted', text: '아직 입장한 학생이 없습니다.' }));
    card.appendChild(h('p', { class: 'tiny muted', style: 'margin-top:8px', text: '화면 이탈: 다른 화면으로 전환(앱·탭 바꿈, 화면 꺼짐) / 다른 창 선택(2초 넘게) / 앱 종료 후 다시 입장. 1회 경고, 2회 즉시 종료·0점.' }));
    box.appendChild(card);
    box.appendChild(sheetHost);
  }
  var sheetHost = h('div', { id: 'sheet' });
  function sheet(s, a, reload) {
    sheetHost.innerHTML = '';
    var card = h('div', { class: 'card editing' });
    card.appendChild(h('div', { class: 'row between' }, [
      h('h2', { text: a.name + ' (' + a.no + ') 답안' }),
      h('div', { class: 'row' }, [
        a.violations.length ? h('button', { class: 'btn ghost sm', text: '이탈 1회 취소', onclick: function () { Q.confirmBox('이탈 기록 1회를 취소할까요?', '<p>가장 최근 기록을 취소합니다. 이탈로 종료된 학생이면 응시 중 상태로 돌아가 이어서 풀 수 있습니다.</p>', '취소 처리').then(function (ok) { if (ok) call('forgive', { sid: s.id, studentNo: a.no }).then(function () { sheetHost.innerHTML = ''; reload(); }); }); } }) : null,
        h('button', { class: 'btn danger sm', text: '재응시 허용(기록 지움)', onclick: function () { Q.confirmBox('응시 기록을 지울까요?', '<p>' + Q.esc(a.name) + ' 학생의 이 회기 답안·점수·이탈 기록이 지워지고 처음부터 다시 볼 수 있습니다.</p>', '지우기').then(function (ok) { if (ok) call('resetAttempt', { sid: s.id, studentNo: a.no }).then(function () { sheetHost.innerHTML = ''; reload(); }); }); } }),
        h('button', { class: 'btn ghost sm', text: '닫기', onclick: function () { sheetHost.innerHTML = ''; } })
      ])
    ]));
    if (a.status === 'terminated') card.appendChild(h('div', { class: 'note bad', text: '화면 이탈 ' + a.violations.length + '회로 종료되어 0점입니다. 아래 점수는 참고용입니다.' }));
    s.questions.forEach(function (q, i) {
      var v = a.answers[q.qid], g = a.items[q.qid] || { frac: 0 }, man = a.manual[q.qid];
      var blk = h('div', { class: 'review-item' });
      var mk = g.frac >= 1 ? ['ok', '맞음'] : g.frac > 0 ? ['part', Math.round(g.frac * 100) + '%'] : ['bad', '틀림'];
      blk.appendChild(h('div', { class: 'row' }, [h('b', { text: (i + 1) + '번' }), h('span', { class: 'chip', text: Q.TYPE_LABEL[q.type] }), h('span', { class: 'mark ' + mk[0], text: mk[1] + (g.manual ? ' (교수 판정)' : g.provisional ? ' (자동 예비)' : '') })]));
      blk.appendChild(h('p', { class: 'small', style: 'white-space:pre-wrap', text: q.stem }));
      if (q.type === 'mc') blk.appendChild(h('p', { class: 'small', html: '학생 답: ' + (typeof v === 'number' ? CIRC[v] + ' ' + Q.esc(q.options[v]) : '<span class="muted">없음</span>') + ' · 정답 ' + CIRC[q.answer] }));
      else blk.appendChild(h('p', { class: 'small', style: 'white-space:pre-wrap', html: '학생 답: ' + (v ? Q.esc(v) : '<span class="muted">없음</span>') + (q.type === 'short' ? ' · 인정 답 ' + q.accept.map(Q.esc).join(' / ') : '') }));
      var row = h('div', { class: 'row' });
      if (q.type === 'essay') {
        var boxes = q.keyPoints.map(function (k, j) {
          var auto = (g.hits || []).indexOf(j) >= 0;
          var c = h('input', { type: 'checkbox', checked: man != null ? false : auto });
          row.appendChild(h('label', { class: 'row small', style: 'width:100%' }, [c, h('span', { text: k.point + ' (' + (k.pts || 1) + '점)' })]));
          return { c: c, pts: Number(k.pts) || 1 };
        });
        row.appendChild(h('button', { class: 'btn sm', text: '이 채점으로 확정', onclick: function () {
          var tot = 0, got = 0; boxes.forEach(function (b) { tot += b.pts; if (b.c.checked) got += b.pts; });
          setM(s, a, q.qid, tot ? got / tot : 0, reload);
        } }));
        if (man != null) row.appendChild(h('span', { class: 'small muted', text: '확정 ' + Math.round(man * 100) + '%' }));
      } else {
        row.appendChild(h('button', { class: 'btn ghost sm', text: '정답 인정', onclick: function () { setM(s, a, q.qid, 1, reload); } }));
        row.appendChild(h('button', { class: 'btn ghost sm', text: '오답 처리', onclick: function () { setM(s, a, q.qid, 0, reload); } }));
      }
      if (man != null) row.appendChild(h('button', { class: 'btn ghost sm', text: '자동 채점으로 되돌리기', onclick: function () { setM(s, a, q.qid, null, reload); } }));
      blk.appendChild(row);
      card.appendChild(blk);
    });
    sheetHost.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth' });
  }
  function setM(s, a, qid, val, reload) {
    call('setManual', { sid: s.id, studentNo: a.no, qid: qid, value: val }).then(function (r) {
      if (!r.ok) { Q.toast(r.message); return; }
      Q.toast('반영했습니다. 점수 ' + r.attempt.score);
      sheet(s, r.attempt, reload); reload();
    }).catch(function () { });
  }
  function csv(s, at) {
    var head = ['학번', '이름', '상태', '점수', '이탈 횟수', '이탈 기록', '입장', '제출'].concat(s.questions.map(function (q, i) { return (i + 1) + '번(' + Q.TYPE_LABEL[q.type] + ')'; }));
    var rows = at.map(function (a) {
      return [a.no, a.name, a.status === 'terminated' ? '이탈 종료' : a.status === 'in_progress' ? '응시 중' : '제출', a.score == null ? '' : a.score, a.violations.length,
        a.violations.map(function (v) { return Q.fmtTime(v.at) + ' ' + (Q.KIND_LABEL[v.kind] || v.kind); }).join('; '), Q.fmtDate(a.startedAt), a.submittedAt ? Q.fmtDate(a.submittedAt) : '']
        .concat(s.questions.map(function (q) { var g = a.items[q.qid]; return g ? Math.round(g.frac * 100) / 100 : ''; }));
    });
    var txt = '﻿' + [head].concat(rows).map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = s.title.replace(/[\\/:*?"<>|]/g, '_') + '_결과.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- 성적 그래프 ---------- */
  function tabGrade(body) {
    body.appendChild(h('p', { class: 'muted' }, [h('span', { class: 'spinner' }), ' 불러오는 중…']));
    call('gradebook').then(function (r) {
      body.innerHTML = ''; if (!r.ok) return;
      if (!r.sessions.length) { body.appendChild(h('div', { class: 'card' }, [h('p', { class: 'muted', text: '연 시험이 아직 없습니다.' })])); return; }
      var acc = css('--accent'), mut = css('--muted'), line = css('--line'), ink = css('--ink'), ok = css('--ok');
      var axis = { ticks: { color: mut }, grid: { color: line } };
      // 1) 회기별 평균
      var c1 = h('canvas', { role: 'img', 'aria-label': '회기별 평균 점수 꺾은선 그래프' });
      body.appendChild(h('div', { class: 'card' }, [h('h2', { text: '회기별 평균 점수' }), h('div', { class: 'chart-box' }, [c1])]));
      charts.push(new Chart(c1, { type: 'line', data: { labels: r.sessions.map(function (s) { return s.title; }), datasets: [
        { label: '평균', data: r.sessions.map(function (s) { return s.avg; }), borderColor: acc, backgroundColor: acc, borderWidth: 3, pointRadius: 5, tension: .2 },
        { label: '최고', data: r.sessions.map(function (s) { return s.scores.length ? Math.max.apply(null, s.scores) : null; }), borderColor: ok, backgroundColor: ok, borderDash: [4, 4], pointRadius: 3 },
        { label: '최저', data: r.sessions.map(function (s) { return s.scores.length ? Math.min.apply(null, s.scores) : null; }), borderColor: mut, backgroundColor: mut, borderDash: [4, 4], pointRadius: 3 }
      ] }, options: { maintainAspectRatio: false, scales: { y: Object.assign({ min: 0, max: 100 }, axis), x: { ticks: { color: mut }, grid: { display: false } } }, plugins: { legend: { labels: { color: ink } } } } }));
      // 2) 회기 선택: 점수 분포와 문항별 정답률
      var sel = h('select', {}, r.sessions.map(function (s) { return h('option', { value: s.id, text: s.title }); }).reverse());
      var c2 = h('canvas', { role: 'img', 'aria-label': '점수 분포 막대그래프' }), c3 = h('canvas', { role: 'img', 'aria-label': '문항별 정답률 막대그래프' });
      var info = h('p', { class: 'small muted' });
      body.appendChild(h('div', { class: 'card' }, [h('div', { class: 'row between' }, [h('h2', { text: '회기별 점수 분포 · 문항별 정답률' }), h('div', { style: 'min-width:220px' }, [sel])]), info,
        h('div', { class: 'grid2' }, [h('div', { class: 'chart-box' }, [c2]), h('div', { class: 'chart-box' }, [c3])])]));
      var ch2 = null, ch3 = null;
      function draw() {
        var s = r.sessions.filter(function (x) { return x.id === sel.value; })[0];
        var bins = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        s.scores.forEach(function (v) { bins[Math.min(9, Math.floor(v / 10))]++; });
        info.textContent = '응시 ' + s.scores.length + '명 · 평균 ' + (s.avg == null ? '-' : s.avg) + '점';
        if (ch2) ch2.destroy(); if (ch3) ch3.destroy();
        ch2 = new Chart(c2, { type: 'bar', data: { labels: ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'], datasets: [{ label: '학생 수', data: bins, backgroundColor: acc, borderRadius: 4 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: '점수 분포', color: ink } }, scales: { y: Object.assign({ beginAtZero: true, ticks: { stepSize: 1, color: mut } }, { grid: { color: line } }), x: { ticks: { color: mut }, grid: { display: false } } } } });
        ch3 = new Chart(c3, { type: 'bar', data: { labels: s.items.map(function (it, i) { return (i + 1) + '번 ' + (it.kind === 'imyong' ? '기출' : Q.TYPE_LABEL[it.type]); }), datasets: [{ label: '정답률(%)', data: s.items.map(function (it) { return it.rate; }), backgroundColor: s.items.map(function (it) { return it.rate != null && it.rate < 50 ? css('--bad') : ok; }), borderRadius: 4 }] }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: '문항별 정답률(50% 미만 붉은색)', color: ink }, tooltip: { callbacks: { afterLabel: function (c) { return s.items[c.dataIndex].stem; } } } }, scales: { x: Object.assign({ min: 0, max: 100 }, axis), y: { ticks: { color: mut }, grid: { display: false } } } } });
        charts.push(ch2, ch3);
      }
      sel.addEventListener('change', draw); draw();
      // 3) 학생별 추이
      var stuSel = h('select', {}, [h('option', { value: '', text: '학생을 고르세요' })].concat(r.students.map(function (st) { return h('option', { value: st.no, text: st.no + ' ' + st.name }); })));
      var c4 = h('canvas', { role: 'img', 'aria-label': '학생별 점수 추이 꺾은선 그래프' });
      var tbl = h('div', { class: 'table-wrap', style: 'margin-top:14px' });
      body.appendChild(h('div', { class: 'card' }, [h('div', { class: 'row between' }, [h('h2', { text: '학생별 점수 추이' }), h('div', { style: 'min-width:220px' }, [stuSel])]), h('div', { class: 'chart-box' }, [c4]), tbl]));
      var ch4 = null;
      function draw4() {
        if (ch4) ch4.destroy();
        var st = r.students.filter(function (x) { return x.no === stuSel.value; })[0];
        var ds = [{ label: '반 평균', data: r.sessions.map(function (s) { return s.avg; }), borderColor: mut, backgroundColor: mut, borderDash: [6, 4], pointRadius: 3, tension: .2 }];
        if (st) ds.unshift({ label: st.name, data: r.sessions.map(function (s) { return st.scores[s.id] == null ? null : st.scores[s.id]; }), borderColor: acc, backgroundColor: acc, borderWidth: 3, pointRadius: 5, spanGaps: true, tension: .2 });
        ch4 = new Chart(c4, { type: 'line', data: { labels: r.sessions.map(function (s) { return s.title; }), datasets: ds }, options: { maintainAspectRatio: false, scales: { y: Object.assign({ min: 0, max: 100 }, axis), x: { ticks: { color: mut }, grid: { display: false } } }, plugins: { legend: { labels: { color: ink } } } } });
        charts.push(ch4);
      }
      stuSel.addEventListener('change', draw4); draw4();
      // 전체 성적표
      var t = h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: '학번' }), h('th', { text: '이름' })].concat(r.sessions.map(function (s) { return h('th', { text: s.title }); })).concat([h('th', { text: '평균' })]))])]);
      var tb = h('tbody');
      r.students.forEach(function (st) {
        var v = r.sessions.map(function (s) { return st.scores[s.id]; }), got = v.filter(function (x) { return x != null; });
        tb.appendChild(h('tr', {}, [h('td', { text: st.no }), h('td', { text: st.name })].concat(v.map(function (x) { return h('td', { text: x == null ? '-' : String(x) }); })).concat([h('td', { html: '<b>' + (got.length ? Math.round(got.reduce(function (a, b) { return a + b; }, 0) / got.length * 10) / 10 : '-') + '</b>' })])));
      });
      t.appendChild(tb); tbl.appendChild(t);
    }).catch(function () { });
  }

  /* ---------- 명단·문항은행 ---------- */
  function tabSet(body) {
    var ta = h('textarea', { placeholder: '한 줄에 한 명: 학번 이름\n예) 20241234 홍길동', style: 'min-height:180px' });
    var info = h('p', { class: 'small muted' });
    call('getRoster').then(function (r) { if (r.ok) { ta.value = r.roster.map(function (x) { return x.no + ' ' + x.name; }).join('\n'); info.textContent = r.roster.length ? '명단 ' + r.roster.length + '명 — 명단에 있는 학번·이름만 입장할 수 있습니다.' : '명단이 비어 있으면 누구나 학번·이름으로 입장합니다.'; } }).catch(function () { });
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: '수강생 명단(선택)' }), info, ta,
      h('div', { class: 'row', style: 'margin-top:10px' }, [h('button', { class: 'btn', text: '명단 저장', onclick: function () {
        var list = ta.value.split(/\n/).map(function (l) { var m = l.trim().split(/[\s,\t]+/); return m.length >= 2 ? { no: m[0], name: m.slice(1).join(' ') } : null; }).filter(Boolean);
        call('setRoster', { roster: list }).then(function (r) { if (r.ok) { Q.toast('명단 ' + r.roster.length + '명을 저장했습니다.'); frame(); } }).catch(function () { });
      } })])
    ]));
    var bank = h('div', { class: 'card' }, [h('h2', { text: '문항은행' }), h('p', { class: 'muted' }, [h('span', { class: 'spinner' }), ' 불러오는 중…'])]);
    var outs = window.TREND_OUTSIDE || [];
    if (outs.length) body.appendChild(h('div', { class: 'card' }, [h('h2', { text: '강의자료 범위 밖 임용 빈출 영역' }), h('p', { class: 'small muted', text: '지금 강의자료(1~6장)에는 없어 출제하지 않는 영역입니다. 다음 차시 자료가 올라오면 문항은행에 넣을 수 있습니다.' }),
      h('ul', { class: 'small' }, outs.slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); }).slice(0, 15).map(function (o) { return h('li', { text: o.topic + ' — 기출 ' + (o.count || '?') + '회' + (o.latest ? ' (최근 ' + o.latest + ')' : '') }); }))]));
    body.appendChild(bank);
    call('bankList').then(function (r) {
      if (!r.ok) return;
      bank.innerHTML = '';
      bank.appendChild(h('h2', { text: '문항은행' }));
      bank.appendChild(h('p', { class: 'small muted', text: '강의자료 문항 ' + r.questions.length + '개, 임용 기출 변형 ' + r.imyong.length + '개 · 문항은행 판 ' + (STATS.bankVersion || '') + '. 출제 화면에서 고친 내용은 그 회기에만 적용되고 은행은 바뀌지 않습니다.' }));
      var tb = h('tbody');
      Q.OUT.forEach(function (n) {
        var b = STATS.byUnit[n.id]; if (!b && n.level > 0) return;
        tb.appendChild(h('tr', {}, [
          h('td', { style: 'padding-left:' + (10 + n.level * 14) + 'px', html: n.level === 0 ? '<b>' + Q.esc(n.num + ' ' + n.title) + '</b>' : Q.esc(Q.nodeText(n)) }),
          h('td', { class: 'tiny muted', text: (n.pages || []).slice(0, 1).concat((n.pages || []).length > 1 ? ['…' + n.pages[n.pages.length - 1]] : []).join(' ') }),
          h('td', { class: 'tiny', text: Q.impText(n) }),
          h('td', { text: b ? String(b.mc) : '' }), h('td', { text: b ? String(b.short) : '' }), h('td', { text: b ? String(b.essay) : '' }), h('td', { text: b ? String(b.imyong) : '' })
        ]));
      });
      bank.appendChild(h('div', { class: 'table-wrap' }, [h('table', {}, [h('thead', {}, [h('tr', {}, ['목차', '쪽', '임용 출제 경향', '객관식', '단답형', '서술형', '기출 변형'].map(function (t) { return h('th', { text: t }); }))]), tb])]));
    }).catch(function () { });
  }

  TOK = ssGet('quiz_adm') || null;
  if (TOK) boot(); else showLogin();
})();
