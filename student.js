/* 학생 화면: 입장 → 시험 목록·내 점수 → 응시(화면 이탈 감시) → 결과 */
(function () {
  var Q = window.Q, h = Q.h, $ = Q.$, app = $('#app');
  var me = null;          // {no, name}
  var ex = null;          // 응시 상태
  var chart = null;
  $('#ver').textContent = '판 ' + window.APP_VERSION + (Q.isDemo() ? ' · 체험판(기록은 이 기기에만)' : '');
  var tools = $('#tb-tools'); Q.sizeButtons().forEach(function (b) { tools.appendChild(b); });

  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }
  function clear() { app.innerHTML = ''; window.scrollTo(0, 0); }
  function deviceInfo() {
    var ua = navigator.userAgent, t = /iPad|Tablet|SM-T|Tab/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? '태블릿' : /Mobi|Android|iPhone/i.test(ua) ? '휴대폰' : '노트북·PC';
    return t + ' ' + window.screen.width + 'x' + window.screen.height;
  }
  function errBox(r) { return h('div', { class: 'note bad', role: 'alert', text: r && r.message ? r.message : '잠시 뒤 다시 시도해 주세요.' }); }

  /* ---------- 1. 입장 ---------- */
  function showLogin(msg) {
    clear();
    var saved = {}; try { saved = JSON.parse(ssGet('quiz_me') || '{}'); } catch (e) { }
    var no = h('input', { type: 'text', id: 'in-no', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '20', value: saved.no || '', placeholder: '예: 20241234' });
    var nm = h('input', { type: 'text', id: 'in-name', autocomplete: 'off', maxlength: '40', value: saved.name || '', placeholder: '예: 홍길동' });
    no.addEventListener('input', function () { var p = no.selectionStart; no.value = no.value.toUpperCase().replace(/\s/g, ''); try { no.setSelectionRange(p, p); } catch (e) { } });
    var go = h('button', { class: 'btn accent block', type: 'submit', text: '입장하기' });
    var form = h('form', { class: 'card', novalidate: true }, [
      h('p', { class: 'kicker', text: '학생 입장' }),
      h('h1', { text: '학번과 이름으로 들어갑니다' }),
      msg ? h('div', { class: 'note bad', role: 'alert', text: msg }) : null,
      h('label', { class: 'field' }, [h('span', { text: '학번' }), no]),
      h('label', { class: 'field' }, [h('span', { text: '이름' }), nm]),
      go,
      h('div', { class: 'note small', style: 'margin-top:18px', html:
        '<b>저장되는 정보</b><br>학번, 이름, 응시 시각, 답안, 점수, 화면 이탈 기록(시각과 종류), 접속 기기 종류(휴대폰·태블릿·노트북과 화면 크기)가 저장됩니다. ' +
        '열람은 담당 교수만 하며, 수업의 형성평가에만 씁니다. 기록은 학기 수업이 끝나면 담당 교수가 지웁니다.' })
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = { no: no.value.trim().toUpperCase(), name: nm.value.trim() };
      if (v.no.length < 4) { Q.toast('학번을 확인해 주세요.'); no.focus(); return; }
      if (!v.name) { Q.toast('이름을 입력해 주세요.'); nm.focus(); return; }
      me = v; ssSet('quiz_me', JSON.stringify(v));
      showHome();
    });
    app.appendChild(form);
    setTimeout(function () { (saved.no ? nm : no).focus(); }, 50);
  }

  /* ---------- 2. 시험 목록과 내 점수 ---------- */
  function showHome() {
    clear();
    $('#tb-title').textContent = '의사소통장애학생교육 퀴즈';
    $('#tb-sub').textContent = me.name + ' · ' + me.no;
    var head = h('div', { class: 'row between' }, [
      h('div', {}, [h('p', { class: 'kicker', text: '오늘의 퀴즈' }), h('h1', { text: me.name + ' 님, 안녕하세요' })]),
      h('button', { class: 'btn ghost sm', type: 'button', text: '다른 학번으로', onclick: function () { me = null; ssSet('quiz_me', '{}'); showLogin(); } })
    ]);
    var list = h('div', { class: 'card', id: 'open-list' }, [h('p', { class: 'muted' }, [h('span', { class: 'spinner' }), ' 열린 시험을 찾는 중…'])]);
    var hist = h('div', { class: 'card', id: 'hist' }, [h('h2', { text: '내 점수' }), h('p', { class: 'muted small', text: '불러오는 중…' })]);
    app.appendChild(head); app.appendChild(list); app.appendChild(hist);
    Q.api('listOpen').then(function (r) {
      list.innerHTML = '';
      list.appendChild(h('h2', { text: '응시할 수 있는 시험' }));
      if (!r.ok) { list.appendChild(errBox(r)); return; }
      if (!r.sessions.length) { list.appendChild(h('p', { class: 'muted', text: '지금 열린 시험이 없습니다. 교수님이 시험을 열면 이 화면에서 새로고침해 주세요.' })); list.appendChild(h('button', { class: 'btn ghost sm', text: '새로고침', onclick: showHome })); return; }
      r.sessions.forEach(function (s) {
        var cnt = {}; s.types.forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; });
        list.appendChild(h('div', { class: 'card flat', style: 'margin:10px 0' }, [
          h('h3', { text: s.title }),
          h('p', { class: 'small muted', text: '범위: ' + s.rangeLabel }),
          h('div', { class: 'row small', style: 'margin:6px 0 12px' }, [
            h('span', { class: 'chip', text: s.n + '문항' }),
            cnt.mc ? h('span', { class: 'chip', text: '객관식 ' + cnt.mc }) : null,
            cnt.short ? h('span', { class: 'chip', text: '단답형 ' + cnt.short }) : null,
            cnt.essay ? h('span', { class: 'chip', text: '서술형 ' + cnt.essay }) : null,
            h('span', { class: 'chip', text: s.timeLimit ? '제한 ' + s.timeLimit + '분' : '시간 제한 없음' })
          ]),
          h('button', { class: 'btn accent', text: '이 시험 보기', onclick: function () { showRules(s); } })
        ]));
      });
    });
    loadHistory(hist);
  }
  function loadHistory(box) {
    Q.api('myHistory', { studentNo: me.no, name: me.name }).then(function (r) {
      box.innerHTML = ''; box.appendChild(h('h2', { text: '내 점수' }));
      if (!r.ok) { box.appendChild(errBox(r)); return; }
      var rel = r.history.filter(function (x) { return x.released; });
      if (!r.history.length) { box.appendChild(h('p', { class: 'muted', text: '아직 응시한 시험이 없습니다.' })); return; }
      if (rel.length && window.Chart) {
        var cv = h('canvas', { 'aria-label': '내 점수와 반 평균 꺾은선 그래프', role: 'img' });
        box.appendChild(h('div', { class: 'chart-box' }, [cv]));
        drawHistory(cv, rel);
      }
      var tb = h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { text: '시험' }), h('th', { text: '응시' }), h('th', { text: '내 점수' }), h('th', { text: '반 평균' })])])]);
      var body = h('tbody');
      r.history.slice().reverse().forEach(function (x) {
        body.appendChild(h('tr', {}, [
          h('td', { text: x.title }), h('td', { text: Q.fmtDate(x.at) }),
          h('td', { html: x.released ? '<b>' + x.score + '</b>' + (x.status === 'terminated' ? ' <span class="chip bad">이탈 종료</span>' : '') : '<span class="muted">공개 전</span>' }),
          h('td', { text: x.released && x.classAvg != null ? x.classAvg + ' (' + x.classN + '명)' : '-' })
        ]));
      });
      tb.appendChild(body);
      box.appendChild(h('div', { class: 'table-wrap', style: 'margin-top:12px' }, [tb]));
    });
  }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function drawHistory(cv, rows) {
    if (chart) chart.destroy();
    chart = new Chart(cv, {
      type: 'line',
      data: {
        labels: rows.map(function (x) { return x.title.length > 12 ? x.title.slice(0, 12) + '…' : x.title; }),
        datasets: [
          { label: '내 점수', data: rows.map(function (x) { return x.score; }), borderColor: cssVar('--accent'), backgroundColor: cssVar('--accent'), borderWidth: 3, pointRadius: 5, tension: .2 },
          { label: '반 평균', data: rows.map(function (x) { return x.classAvg; }), borderColor: cssVar('--muted'), backgroundColor: cssVar('--muted'), borderDash: [6, 4], borderWidth: 2, pointRadius: 3, tension: .2 }
        ]
      },
      options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 100, ticks: { stepSize: 20, color: cssVar('--muted') }, grid: { color: cssVar('--line') } }, x: { ticks: { color: cssVar('--muted') }, grid: { display: false } } }, plugins: { legend: { labels: { color: cssVar('--ink') } } } }
    });
  }

  /* ---------- 3. 응시 안내 ---------- */
  function showRules(s) {
    clear();
    var agree = h('input', { type: 'checkbox', id: 'agree' });
    var start = h('button', { class: 'btn accent block', text: '시험 시작', disabled: true });
    agree.addEventListener('change', function () { start.disabled = !agree.checked; });
    start.addEventListener('click', function () { start.disabled = true; start.textContent = '시작하는 중…'; enter(s.id); });
    app.appendChild(h('div', { class: 'card' }, [
      h('p', { class: 'kicker', text: '응시 전 안내' }),
      h('h1', { text: s.title }),
      h('p', { class: 'muted small', text: '범위: ' + s.rangeLabel }),
      h('div', { class: 'note warn', html:
        '<b>화면 이탈 규칙</b><br>시험 중 다른 앱이나 다른 탭으로 옮기거나, 다른 창을 누르거나, 앱(브라우저)을 닫거나 새로고침하면 <b>화면 이탈</b>로 기록됩니다.<br>' +
        '1회: 경고 문구가 나오고 계속 풀 수 있습니다.<br>2회: <b>시험이 즉시 끝나고 0점</b> 처리됩니다.' }),
      h('ul', { class: 'small' }, [
        h('li', { text: '시작 전에 휴대폰은 방해 금지 모드로 바꾸고, 알림 창을 내리지 마세요.' }),
        h('li', { text: '답은 적는 대로 서버에 저장됩니다. 마지막에 「제출」을 눌러야 끝납니다.' }),
        s.timeLimit ? h('li', { text: '제한 시간 ' + s.timeLimit + '분이 지나면 적은 답까지 자동 제출됩니다.' }) : null,
        h('li', { text: '답 칸에는 붙여넣기가 되지 않습니다. 직접 입력하세요.' }),
        h('li', { text: '문제마다 「문제 듣기」를 누르면 소리로 읽어 줍니다(이어폰 사용).' })
      ]),
      h('label', { class: 'row', style: 'margin:14px 0;cursor:pointer' }, [agree, h('span', { text: '위 규칙을 읽었고 이해했습니다.' })]),
      start,
      h('button', { class: 'btn ghost block', style: 'margin-top:8px', text: '목록으로', onclick: showHome })
    ]));
  }

  /* ---------- 4. 응시 ---------- */
  function enter(sid) {
    Q.api('enter', { sid: sid, studentNo: me.no, name: me.name, device: deviceInfo() }).then(function (r) {
      if (!r.ok) { if (r.code === 'name_mismatch' || r.code === 'not_in_roster' || r.code === 'bad_no') { showLogin(r.message); } else { Q.toast(r.message, 4000); showHome(); } return; }
      ssSet('quiz_active', JSON.stringify({ sid: sid }));
      if (r.status !== 'in_progress') { showResult(r); return; }
      ex = {
        sid: sid, token: r.token, session: r.session, questions: r.questions, answers: r.answers || {},
        violations: r.violations, limit: r.violationLimit, deadline: r.deadline, offset: r.serverNow - Date.now(),
        cur: 0, away: null, blurT: null, dirty: false, saveT: null, done: false
      };
      // 기존 답의 저장 시각 표시
      renderExam();
      armGuards();
      if (r.reentered) {
        if (r.status === 'in_progress') warn(r.warned ? '앱을 닫았거나 새로고침한 뒤 다시 들어왔습니다.' : '이전 이탈에 이어 다시 들어왔습니다.');
      }
      startTimer();
    });
  }
  function nowS() { return Date.now() + (ex ? ex.offset : 0); }
  function renderExam() {
    clear();
    var s = ex.session;
    $('#tb-title').textContent = s.title;
    $('#tb-sub').textContent = me.name + ' · ' + me.no;
    var head = h('div', { class: 'exam-head card flat', style: 'padding:12px 14px' }, [
      h('span', { class: 'timer', id: 'timer', text: s.timeLimit ? '--:--' : '시간 제한 없음' }),
      h('span', { class: 'vio', id: 'vio', title: '화면 이탈 기록' }, ['이탈 '].concat(dotList())),
      h('span', { class: 'saved', id: 'saved', text: '' }),
      h('span', { style: 'flex:1' }),
      document.fullscreenEnabled && !/Mobi|iPhone|Android/i.test(navigator.userAgent) ? h('button', { class: 'btn ghost sm', text: '전체 화면', onclick: function () { document.documentElement.requestFullscreen().catch(function () { }); } }) : null
    ]);
    app.appendChild(head);
    var nav = h('nav', { class: 'qnav', 'aria-label': '문항 이동', id: 'qnav' });
    ex.questions.forEach(function (q, i) {
      nav.appendChild(h('button', { type: 'button', text: String(i + 1), 'aria-label': (i + 1) + '번 문항', onclick: function () { go(i); } }));
    });
    app.appendChild(nav);
    app.appendChild(h('section', { id: 'qbox' }));
    showQ();
  }
  function dotList() { var a = []; for (var i = 0; i < ex.limit; i++) a.push(h('i', { class: i < ex.violations ? 'on' : '' })); a.push(h('span', { class: 'sr', text: ex.violations + '회' })); return a; }
  function updDots() { var v = $('#vio'); if (!v) return; v.innerHTML = ''; ['이탈 '].concat(dotList()).forEach(function (c) { v.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); }
  function answered(q) { var v = ex.answers[q.qid]; return v !== undefined && v !== null && String(v).trim() !== ''; }
  function updNav() {
    Q.$$('#qnav button').forEach(function (b, i) {
      b.classList.toggle('done', answered(ex.questions[i])); b.classList.toggle('cur', i === ex.cur);
      if (i === ex.cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  }
  function go(i) { flushSave(); ex.cur = Math.max(0, Math.min(ex.questions.length - 1, i)); showQ(); window.scrollTo(0, 0); }
  function speak(text) {
    if (!('speechSynthesis' in window)) { Q.toast('이 기기는 읽어 주기를 지원하지 않습니다.'); return; }
    speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 0.95; speechSynthesis.speak(u);
  }
  function noPaste(el) {
    el.addEventListener('paste', function (e) { e.preventDefault(); Q.toast('붙여넣기는 할 수 없습니다. 직접 입력해 주세요.'); });
    el.addEventListener('drop', function (e) { e.preventDefault(); });
  }
  function showQ() {
    var q = ex.questions[ex.cur], box = $('#qbox'); box.innerHTML = '';
    var card = h('article', { class: 'card qcard', 'aria-labelledby': 'qh' });
    card.appendChild(h('div', { class: 'qmeta' }, [
      h('span', { class: 'chip acc', id: 'qh', text: (ex.cur + 1) + ' / ' + ex.questions.length }),
      h('span', { class: 'chip', text: Q.TYPE_LABEL[q.type] }),
      q.kind === 'imyong' ? h('span', { class: 'chip warn', text: '임용 기출 변형' + (q.code ? ' · ' + q.code : '') }) : null,
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn ghost sm', type: 'button', text: '문제 듣기', onclick: function () {
        var t = q.stem + (q.options ? '. ' + q.options.map(function (o, i) { return (i + 1) + '번, ' + o; }).join('. ') : ''); speak(t);
      } })
    ]));
    card.appendChild(h('div', { class: 'qstem', text: q.stem }));
    if (q.type === 'mc') {
      var opts = h('div', { class: 'opts', role: 'radiogroup', 'aria-labelledby': 'qh' });
      q.options.forEach(function (o, i) {
        var b = h('button', { type: 'button', class: 'opt', role: 'radio', 'aria-checked': String(ex.answers[q.qid] === i) }, [h('span', { class: 'n', text: String(i + 1) }), h('span', { text: o })]);
        b.addEventListener('click', function () {
          ex.answers[q.qid] = i; Q.$$('.opt', opts).forEach(function (x, k) { x.setAttribute('aria-checked', String(k === i)); });
          markDirty(true); updNav();
        });
        opts.appendChild(b);
      });
      card.appendChild(opts);
    } else {
      var isEssay = q.type === 'essay';
      var inp = h(isEssay ? 'textarea' : 'input', isEssay ? { 'aria-label': '답안', placeholder: '작성 방법의 항목 순서대로 쓰세요.', maxlength: '3000', rows: '8' } : { type: 'text', 'aria-label': '답', placeholder: '답을 쓰세요', maxlength: '200', autocomplete: 'off', spellcheck: 'false' });
      inp.value = ex.answers[q.qid] || '';
      inp.addEventListener('input', function () { ex.answers[q.qid] = inp.value; markDirty(false); updNav(); cnt.textContent = inp.value.length + '자'; });
      noPaste(inp);
      var cnt = h('div', { class: 'tiny muted', style: 'text-align:right', text: (inp.value || '').length + '자' });
      card.appendChild(inp); card.appendChild(cnt);
      if (isEssay && q.items) card.appendChild(h('p', { class: 'tiny muted', text: '채점 요소 ' + q.items + '개 · 요소마다 핵심 용어를 정확히 쓰세요.' }));
    }
    var last = ex.cur === ex.questions.length - 1;
    card.appendChild(h('div', { class: 'exam-foot' }, [
      h('button', { class: 'btn ghost', type: 'button', text: '이전', disabled: ex.cur === 0, onclick: function () { go(ex.cur - 1); } }),
      last ? h('button', { class: 'btn accent', type: 'button', text: '제출 전 확인', onclick: reviewSubmit })
           : h('button', { class: 'btn', type: 'button', text: '다음', onclick: function () { go(ex.cur + 1); } })
    ]));
    box.appendChild(card);
    updNav();
  }
  function markDirty(now) {
    ex.dirty = true; clearTimeout(ex.saveT);
    ex.saveT = setTimeout(flushSave, now ? 600 : 2500);
    var s = $('#saved'); if (s) s.textContent = '저장 대기';
  }
  function flushSave() {
    if (!ex || !ex.dirty || ex.done) return;
    ex.dirty = false; clearTimeout(ex.saveT);
    var payload = { sid: ex.sid, token: ex.token, studentNo: me.no, answers: ex.answers };
    Q.api('save', payload).then(function (r) {
      var s = $('#saved');
      if (!r.ok) { ex.dirty = true; if (s) s.textContent = '저장 실패 — 다시 시도'; ex.saveT = setTimeout(flushSave, 4000); return; }
      if (r.status && r.status !== 'in_progress') { finishedByServer(); return; }
      if (s) s.textContent = '저장됨 ' + Q.fmtTime(Date.now());
    });
  }
  function reviewSubmit() {
    flushSave();
    var miss = ex.questions.map(function (q, i) { return answered(q) ? null : (i + 1); }).filter(Boolean);
    Q.confirmBox('제출할까요?', miss.length ? '<p class="note warn">답을 쓰지 않은 문항: ' + miss.join(', ') + '번</p><p>제출하면 다시 고칠 수 없습니다.</p>' : '<p>모든 문항에 답했습니다. 제출하면 다시 고칠 수 없습니다.</p>', '제출').then(function (ok) {
      if (ok) submit(false);
    });
  }
  function submit(auto) {
    if (!ex || ex.done) return;
    ex.done = true; disarmGuards(); stopTimer();
    app.innerHTML = ''; app.appendChild(h('p', { class: 'muted' }, [h('span', { class: 'spinner' }), ' 제출하는 중…']));
    var tries = 0;
    (function send() {
      Q.api('submit', { sid: ex.sid, token: ex.token, studentNo: me.no, answers: ex.answers, auto: auto }).then(function (r) {
        if (!r.ok && r.code === 'network' && tries++ < 5) { setTimeout(send, 2500); return; }
        if (!r.ok) { app.innerHTML = ''; app.appendChild(errBox(r)); app.appendChild(h('button', { class: 'btn', text: '다시 제출', onclick: function () { tries = 0; send(); } })); return; }
        ssSet('quiz_active', ''); showResult(r);
      });
    })();
  }

  /* ---------- 화면 이탈 감시 ----------
   * hidden(다른 앱·탭·화면 꺼짐·닫기): 바로 1회
   * blur(창은 보이나 다른 창 선택): 2초 넘게 이어지면 1회
   * 이탈이 시작되면 그 순간 서버에 알리고(sendBeacon), 돌아오면 같은 번호로 한 번 더 알려 확인한다(서버는 중복을 세지 않음).
   * 앱을 닫고 다시 들어오면 서버가 입장 때 판정한다(같은 이탈 중이면 추가로 세지 않음). */
  function onAway(kind) {
    if (!ex || ex.done || ex.away) return;
    ex.away = { id: 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), kind: kind, at: nowS() };
    Q.sset('quiz_away', JSON.stringify({ sid: ex.sid, id: ex.away.id }));
    Q.beacon('violation', { sid: ex.sid, token: ex.token, studentNo: me.no, eventId: ex.away.id, kind: kind, at: ex.away.at, phase: 'away', answers: ex.answers, detail: deviceInfo() });
  }
  function onBack() {
    if (!ex || ex.done || !ex.away) return;
    var ev = ex.away; ex.away = null;
    Q.api('violation', { sid: ex.sid, token: ex.token, studentNo: me.no, eventId: ev.id, kind: ev.kind, at: ev.at, phase: 'return', answers: ex.answers }).then(function (r) {
      if (!r.ok) { ex.violations++; updDots(); if (ex.violations >= ex.limit) finishedByServer(); else warn(); return; }
      ex.violations = r.violations; updDots();
      if (r.status !== 'in_progress') { finishedByServer(r); return; }
      warn();
    });
  }
  function onVis() { if (document.visibilityState === 'hidden') onAway('hidden'); else onBack(); }
  function onBlur() {
    if (!ex || ex.done) return;
    clearTimeout(ex.blurT);
    ex.blurT = setTimeout(function () { if (!document.hasFocus() && document.visibilityState === 'visible') onAway('blur'); }, 2000);
  }
  function onFocus() { if (!ex) return; clearTimeout(ex.blurT); if (ex.away && document.visibilityState === 'visible') onBack(); }
  function onHide() { if (ex && !ex.done) { onAway('hidden'); flushBeacon(); } }
  function flushBeacon() { if (ex && ex.dirty) Q.beacon('save', { sid: ex.sid, token: ex.token, studentNo: me.no, answers: ex.answers }); }
  function block(e) { if (ex && !ex.done) { e.preventDefault(); } }
  function keyBlock(e) {
    if (!ex || ex.done) return;
    var k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'v', 'p', 's', 'a', 'u'].indexOf(k) >= 0) { e.preventDefault(); }
  }
  function armGuards() {
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('keydown', keyBlock);
    window.onbeforeunload = function () { return '시험 중입니다. 나가면 화면 이탈로 기록됩니다.'; };
  }
  function disarmGuards() {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('contextmenu', block);
    document.removeEventListener('copy', block);
    document.removeEventListener('cut', block);
    document.removeEventListener('keydown', keyBlock);
    window.onbeforeunload = null;
    if (ex) clearTimeout(ex.blurT);
  }
  var warnOpen = null;
  function warn(extra) {
    if (warnOpen && warnOpen.parentNode) return;
    warnOpen = Q.modal({
      tone: 'alarm', title: '화면 이탈이 기록되었습니다 (' + ex.violations + '/' + ex.limit + ')',
      html: (extra ? '<p>' + Q.esc(extra) + '</p>' : '') +
        '<p>시험 화면을 벗어난 기록이 남았습니다. 담당 교수님 화면에 시각과 함께 표시됩니다.</p>' +
        '<p class="note bad"><b>한 번 더 화면을 벗어나면 시험이 즉시 끝나고 0점 처리됩니다.</b></p>',
      buttons: [{ label: '확인하고 계속 풀기', primary: true }]
    });
  }
  function finishedByServer() {
    if (!ex) return;
    ex.done = true; disarmGuards(); stopTimer();
    if (warnOpen && warnOpen.parentNode) warnOpen.parentNode.removeChild(warnOpen);
    Q.api('enter', { sid: ex.sid, studentNo: me.no, name: me.name, device: deviceInfo() }).then(function (r) {
      ssSet('quiz_active', '');
      if (r.ok) showResult(r); else showHome();
    });
  }

  /* ---------- 시간 ---------- */
  var tick = null;
  function startTimer() {
    stopTimer(); if (!ex.deadline) return;
    tick = setInterval(function () {
      var left = ex.deadline - nowS(), t = $('#timer'); if (!t) return;
      if (left <= 0) { t.textContent = '00:00'; Q.toast('제한 시간이 끝나 자동 제출합니다.', 3500); submit(true); return; }
      var m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      t.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      t.classList.toggle('low', left < 60000);
    }, 500);
  }
  function stopTimer() { if (tick) clearInterval(tick); tick = null; }

  /* ---------- 5. 결과 ---------- */
  function showResult(r) {
    clear(); ex = null;
    var res = r.result || {}, s = r.session;
    var card = h('div', { class: 'card' });
    card.appendChild(h('p', { class: 'kicker', text: res.status === 'terminated' ? '시험 종료' : '제출 완료' }));
    card.appendChild(h('h1', { text: s.title }));
    if (res.status === 'terminated') {
      card.appendChild(h('div', { class: 'note bad', role: 'alert', html: '<b>' + Q.esc(res.message || '화면 이탈 2회로 시험이 종료되었습니다.') + '</b><br>이의가 있으면 담당 교수님께 바로 말씀드리세요.' }));
      card.appendChild(h('p', {}, [h('span', { class: 'big-num', text: '0' }), ' 점']));
    } else if (!res.released) {
      card.appendChild(h('div', { class: 'note ok', text: '답안이 제출되었습니다. 점수와 해설은 교수님이 공개한 뒤 「내 점수」에서 볼 수 있습니다.' }));
    } else {
      card.appendChild(h('p', {}, [h('span', { class: 'big-num', text: String(res.score) }), ' / 100점']));
      if (res.pending) card.appendChild(h('p', { class: 'note warn small', text: '서술형 ' + res.pending + '문항은 자동 예비 채점 점수입니다. 교수님 채점 뒤 바뀔 수 있습니다.' }));
    }
    app.appendChild(card);
    if (res.released && res.items && res.status !== 'terminated') {
      var rv = h('div', { class: 'card' }, [h('h2', { text: '문항별 확인' })]);
      res.items.forEach(function (it) {
        var mk = it.frac >= 1 ? ['ok', '맞음'] : it.frac > 0 ? ['part', '부분 ' + Math.round(it.frac * 100) + '%'] : ['bad', '틀림'];
        var blk = h('div', { class: 'review-item' }, [
          h('div', { class: 'row' }, [h('b', { text: it.no + '번' }), h('span', { class: 'chip', text: Q.TYPE_LABEL[it.type] }), it.code ? h('span', { class: 'chip warn', text: '기출 ' + it.code }) : null, h('span', { class: 'mark ' + mk[0], text: mk[1] + (it.provisional ? ' (예비)' : '') })]),
          h('p', { style: 'white-space:pre-wrap', text: it.stem })
        ]);
        if (it.type === 'mc') {
          blk.appendChild(h('p', { class: 'small', html: '내 답: ' + (it.mine != null && it.mine >= 0 ? '①②③④⑤⑥'[it.mine] + ' ' + Q.esc(it.options[it.mine]) : '<span class="muted">없음</span>') + '<br>정답: <b>' + '①②③④⑤⑥'[it.correct] + ' ' + Q.esc(it.options[it.correct]) + '</b>' }));
        } else if (it.type === 'short') {
          blk.appendChild(h('p', { class: 'small', html: '내 답: ' + (Q.esc(it.mine) || '<span class="muted">없음</span>') + '<br>정답: <b>' + Q.esc(it.correct) + '</b>' }));
        } else {
          blk.appendChild(h('p', { class: 'small', style: 'white-space:pre-wrap', html: '내 답: ' + (Q.esc(it.mine) || '<span class="muted">없음</span>') }));
          if (it.points && it.points.length) blk.appendChild(h('p', { class: 'small', html: '채점 요소: ' + it.points.map(Q.esc).join(' / ') }));
          if (it.model) blk.appendChild(h('p', { class: 'small', html: '모범 답안: ' + Q.esc(it.model) }));
        }
        if (it.explain) blk.appendChild(h('p', { class: 'small muted', text: '해설: ' + it.explain + (it.source ? ' (강의자료 ' + it.source + ')' : '') }));
        rv.appendChild(blk);
      });
      app.appendChild(rv);
    }
    app.appendChild(h('button', { class: 'btn block', text: '목록과 내 점수 보기', onclick: function () { if (me) showHome(); else showLogin(); } }));
  }

  /* ---------- 시작 ---------- */
  try { me = JSON.parse(ssGet('quiz_me') || 'null'); if (me && !me.no) me = null; } catch (e) { me = null; }
  var act = null; try { act = JSON.parse(ssGet('quiz_active') || 'null'); } catch (e) { }
  if (me && act && act.sid) enter(act.sid);   // 새로고침·재입장: 서버가 이탈 여부를 판정
  else if (me) showHome(); else showLogin();
})();
