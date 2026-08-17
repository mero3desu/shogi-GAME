(() => {
  'use strict';

  const STORAGE_KEY = 'healthNoteData.v1';

  const DEFAULT_STATE = {
    profile: { age: 50, heightCm: 167, weightKg: 53, menopause: 'pre' },
    glucose: [],      // { ts:number(ms), value:number(mg/dL), source:'libre-historic'|'libre-scan'|'manual' }
    logs: [],         // { id, ts, date, time, category, ...fields }
    appleHealth: { heartRateDaily: [], sleepDaily: [] } // summarized per day
  };

  const MEAL_CHIPS = {
    breakfast: ['ノンシュガーカフェオレ', 'ゆで卵', 'キャロットラペ', 'ブロッコリー', '紫キャベツのラペ', 'かぼちゃ', 'ささみ蒸し', 'フォカッチャ', '丸パン'],
    lunch: ['納豆', 'お弁当（少なめ）'],
    dinner: ['ビール350ml', 'おかず中心（主食なし）']
  };

  // ---------- state ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(DEFAULT_STATE), parsed);
    } catch (e) {
      console.error('load failed', e);
      return structuredClone(DEFAULT_STATE);
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- tabs ----------
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'dashboard') renderDashboard();
    if (btn.dataset.tab === 'advice') renderAdvice();
  });

  // ---------- time-of-day buckets ----------
  const BUCKETS = [
    { key: 'night', label: '夜間', from: 0, to: 6, color: 'var(--band-night)' },
    { key: 'morning', label: '朝', from: 6, to: 10, color: 'var(--band-morning)' },
    { key: 'noon', label: '昼', from: 10, to: 15, color: 'var(--band-noon)' },
    { key: 'evening', label: '夕方', from: 15, to: 19, color: 'var(--band-evening)' },
    { key: 'night2', label: '夜', from: 19, to: 24, color: 'var(--band-night)' }
  ];
  function bucketOf(hour) {
    return BUCKETS.find(b => hour >= b.from && hour < b.to) || BUCKETS[BUCKETS.length - 1];
  }

  // ---------- log form ----------
  const logDate = document.getElementById('log-date');
  const logTime = document.getElementById('log-time');
  (function initDefaults() {
    const now = new Date();
    logDate.value = now.toISOString().slice(0, 10);
    logTime.value = now.toTimeString().slice(0, 5);
  })();

  const categorySelect = document.getElementById('log-category');
  const fieldsMeal = document.getElementById('fields-meal');
  const fieldsSymptom = document.getElementById('fields-symptom');
  const fieldsGlucose = document.getElementById('fields-glucose');
  const fieldsNote = document.getElementById('fields-note');
  const alcoholField = document.getElementById('alcohol-field');
  const mealChipsWrap = document.getElementById('meal-chips');
  const mealText = document.getElementById('meal-text');

  function updateFormFields() {
    const cat = categorySelect.value;
    fieldsMeal.style.display = ['breakfast', 'lunch', 'dinner'].includes(cat) ? 'flex' : 'none';
    fieldsSymptom.style.display = cat === 'symptom' ? 'flex' : 'none';
    fieldsGlucose.style.display = cat === 'glucose' ? 'flex' : 'none';
    fieldsNote.style.display = cat === 'note' ? 'flex' : 'none';
    alcoholField.style.display = cat === 'dinner' ? 'flex' : 'none';

    mealChipsWrap.innerHTML = '';
    if (MEAL_CHIPS[cat]) {
      MEAL_CHIPS[cat].forEach(item => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = item;
        chip.addEventListener('click', () => {
          const cur = mealText.value.trim();
          mealText.value = cur ? cur + '、' + item : item;
        });
        mealChipsWrap.appendChild(chip);
      });
    }
  }
  categorySelect.addEventListener('change', updateFormFields);
  updateFormFields();

  const severitySlider = document.getElementById('symptom-severity');
  const severityOut = document.getElementById('symptom-severity-out');
  severitySlider.addEventListener('input', () => { severityOut.textContent = severitySlider.value; });

  document.getElementById('log-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = logDate.value;
    const time = logTime.value;
    if (!date || !time) return;
    const ts = new Date(date + 'T' + time + ':00').getTime();
    const cat = categorySelect.value;
    const entry = { id: 'l' + Date.now() + Math.random().toString(36).slice(2, 7), ts, date, time, category: cat };

    if (['breakfast', 'lunch', 'dinner'].includes(cat)) {
      entry.text = mealText.value.trim();
      if (cat === 'dinner') entry.alcoholBeer350 = parseFloat(document.getElementById('alcohol-amount').value) || 0;
    } else if (cat === 'symptom') {
      entry.symptomType = document.getElementById('symptom-type').value;
      entry.severity = parseInt(severitySlider.value, 10);
      entry.layDown = document.getElementById('symptom-lay-down').checked;
      entry.note = document.getElementById('symptom-note').value.trim();
    } else if (cat === 'glucose') {
      const v = parseFloat(document.getElementById('glucose-value').value);
      if (!isNaN(v)) state.glucose.push({ ts, value: v, source: 'manual' });
      entry.value = v;
    } else if (cat === 'note') {
      entry.text = document.getElementById('note-text').value.trim();
    }

    state.logs.push(entry);
    saveState();
    e.target.reset();
    (function initDefaults() {
      const now = new Date();
      logDate.value = now.toISOString().slice(0, 10);
      logTime.value = now.toTimeString().slice(0, 5);
    })();
    updateFormFields();
    severityOut.textContent = '3';
    alert('記録しました。');
    renderDashboard();
  });

  // ---------- CSV parsing (LibreView export) ----------
  function parseCSV(text) {
    // simple RFC4180-ish parser handling quoted fields
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(field); field = '';
          if (row.length > 1 || row[0] !== '') rows.push(row);
          row = [];
        } else field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function findLibreHeaderRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const joined = rows[i].join('|');
      if (/(timestamp|タイムスタンプ)/i.test(joined) && /(glucose|グルコース)/i.test(joined)) {
        return i;
      }
    }
    return -1;
  }

  function parseFlexibleDate(str) {
    if (!str) return null;
    str = str.trim();
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    // dd-mm-yyyy hh:mm or mm/dd/yyyy hh:mm
    const m = str.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|午前|午後)?$/i);
    if (m) {
      let [, a, b, c, hh, mm, ss, ampm] = m;
      let year, month, day;
      if (a.length === 4) { year = +a; month = +b; day = +c; }
      else if (c.length === 4) {
        // ambiguous: assume dd-mm-yyyy (Libre EU default)
        year = +c; day = +a; month = +b;
      } else { year = 2000 + (+c); day = +a; month = +b; }
      let hour = +hh;
      if (ampm) {
        const isPM = /PM|午後/i.test(ampm);
        if (isPM && hour < 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
      }
      d = new Date(year, month - 1, day, hour, +mm, ss ? +ss : 0);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  function importLibreCSV(text) {
    const rows = parseCSV(text);
    const headerIdx = findLibreHeaderRow(rows);
    if (headerIdx === -1) return { added: 0, error: 'ヘッダー行が見つかりませんでした。LibreViewの標準エクスポート形式のCSVをお使いください。' };
    const header = rows[headerIdx].map(h => h.trim());

    const idx = (patterns) => header.findIndex(h => patterns.some(p => p.test(h)));
    const tsIdx = idx([/timestamp/i, /タイムスタンプ/]);
    const histIdx = idx([/historic.*glucose/i, /履歴.*グルコース/]);
    const scanIdx = idx([/scan.*glucose/i, /スキャン.*グルコース/]);
    const unitIsMmol = header.some(h => /mmol/i.test(h));

    if (tsIdx === -1 || (histIdx === -1 && scanIdx === -1)) {
      return { added: 0, error: '必要な列（タイムスタンプ／グルコース値）が見つかりませんでした。' };
    }

    let added = 0;
    const existing = new Set(state.glucose.map(g => g.ts));
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 2) continue;
      const d = parseFlexibleDate(r[tsIdx]);
      if (!d) continue;
      let raw = null, source = 'libre-historic';
      if (histIdx !== -1 && r[histIdx] && r[histIdx].trim() !== '') { raw = parseFloat(r[histIdx]); source = 'libre-historic'; }
      else if (scanIdx !== -1 && r[scanIdx] && r[scanIdx].trim() !== '') { raw = parseFloat(r[scanIdx]); source = 'libre-scan'; }
      if (raw === null || isNaN(raw)) continue;
      const value = unitIsMmol ? Math.round(raw * 18) : Math.round(raw);
      const ts = d.getTime();
      if (existing.has(ts)) continue;
      existing.add(ts);
      state.glucose.push({ ts, value, source });
      added++;
    }
    state.glucose.sort((a, b) => a.ts - b.ts);
    saveState();
    return { added };
  }

  document.getElementById('libre-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const statusEl = document.getElementById('libre-status');
    if (!file) return;
    statusEl.textContent = '読み込み中...';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = importLibreCSV(reader.result);
        if (result.error) statusEl.textContent = 'エラー: ' + result.error;
        else statusEl.textContent = `${result.added}件の血糖値データを取り込みました。`;
        renderDashboard();
      } catch (err) {
        statusEl.textContent = '読み込みに失敗しました: ' + err.message;
      }
    };
    reader.onerror = () => { statusEl.textContent = 'ファイルの読み込みに失敗しました。'; };
    reader.readAsText(file, 'utf-8');
  });

  // ---------- Apple Health XML (streaming, summarized per day) ----------
  document.getElementById('apple-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const statusEl = document.getElementById('apple-status');
    if (!file) return;
    statusEl.textContent = '解析中... (ファイルサイズによっては数分かかります)';

    const CHUNK = 8 * 1024 * 1024;
    let offset = 0;
    let leftover = '';
    const hrByDay = {}; // date -> {sum,count,min,max}
    const sleepByDay = {}; // date -> minutes

    const recordRe = /<Record\b[^>]*\/>/g;
    const attrRe = (name) => new RegExp(name + '="([^"]*)"');
    const typeRe = attrRe('type');
    const startRe = attrRe('startDate');
    const endRe = attrRe('endDate');
    const valueRe = attrRe('value');

    function processChunkText(chunkText) {
      const combined = leftover + chunkText;
      let lastRecordEnd = combined.lastIndexOf('/>');
      let usable, remainder;
      if (lastRecordEnd === -1) { usable = ''; remainder = combined; }
      else { usable = combined.slice(0, lastRecordEnd + 2); remainder = combined.slice(lastRecordEnd + 2); }
      leftover = remainder;

      let m;
      recordRe.lastIndex = 0;
      while ((m = recordRe.exec(usable))) {
        const rec = m[0];
        const typeM = typeRe.exec(rec);
        if (!typeM) continue;
        const type = typeM[1];
        if (type === 'HKQuantityTypeIdentifierHeartRate') {
          const sM = startRe.exec(rec), vM = valueRe.exec(rec);
          if (!sM || !vM) continue;
          const date = sM[1].slice(0, 10);
          const v = parseFloat(vM[1]);
          if (isNaN(v)) continue;
          const d = hrByDay[date] || (hrByDay[date] = { sum: 0, count: 0, min: Infinity, max: -Infinity });
          d.sum += v; d.count++; d.min = Math.min(d.min, v); d.max = Math.max(d.max, v);
        } else if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
          const sM = startRe.exec(rec), eM = endRe.exec(rec);
          if (!sM || !eM) continue;
          const start = new Date(sM[1]), end = new Date(eM[1]);
          if (isNaN(start) || isNaN(end)) continue;
          const date = sM[1].slice(0, 10);
          const minutes = (end - start) / 60000;
          sleepByDay[date] = (sleepByDay[date] || 0) + minutes;
        }
      }
    }

    function readNext() {
      const slice = file.slice(offset, offset + CHUNK);
      const reader = new FileReader();
      reader.onload = () => {
        processChunkText(reader.result);
        offset += CHUNK;
        if (offset < file.size) {
          statusEl.textContent = `解析中... ${Math.min(100, Math.round((offset / file.size) * 100))}%`;
          readNext();
        } else {
          state.appleHealth.heartRateDaily = Object.entries(hrByDay).map(([date, d]) => ({
            date, avg: Math.round(d.sum / d.count), min: d.min, max: d.max
          })).sort((a, b) => a.date.localeCompare(b.date));
          state.appleHealth.sleepDaily = Object.entries(sleepByDay).map(([date, minutes]) => ({
            date, hours: Math.round((minutes / 60) * 10) / 10
          })).sort((a, b) => a.date.localeCompare(b.date));
          saveState();
          statusEl.textContent = `完了: 心拍データ ${state.appleHealth.heartRateDaily.length}日分、睡眠データ ${state.appleHealth.sleepDaily.length}日分を取り込みました。`;
          renderAdvice();
        }
      };
      reader.onerror = () => { statusEl.textContent = '読み込みに失敗しました。'; };
      reader.readAsText(slice, 'utf-8');
    }
    readNext();
  });

  // ---------- backup restore ----------
  document.getElementById('backup-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const statusEl = document.getElementById('backup-status');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state = Object.assign(structuredClone(DEFAULT_STATE), data);
        saveState();
        statusEl.textContent = '復元しました。';
        renderDashboard();
        loadProfileForm();
      } catch (err) {
        statusEl.textContent = '復元に失敗しました: ' + err.message;
      }
    };
    reader.readAsText(file, 'utf-8');
  });

  // ---------- profile / settings ----------
  function loadProfileForm() {
    document.getElementById('p-age').value = state.profile.age;
    document.getElementById('p-height').value = state.profile.heightCm;
    document.getElementById('p-weight').value = state.profile.weightKg;
    document.getElementById('p-menopause').value = state.profile.menopause;
  }
  loadProfileForm();

  document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.profile = {
      age: parseInt(document.getElementById('p-age').value, 10) || 0,
      heightCm: parseFloat(document.getElementById('p-height').value) || 0,
      weightKg: parseFloat(document.getElementById('p-weight').value) || 0,
      menopause: document.getElementById('p-menopause').value
    };
    saveState();
    alert('プロフィールを保存しました。');
    renderAdvice();
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-note-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    if (!confirm('本当にすべての記録を削除しますか？この操作は取り消せません。')) return;
    state = structuredClone(DEFAULT_STATE);
    saveState();
    renderDashboard();
    loadProfileForm();
    alert('削除しました。');
  });

  // ---------- dashboard: chart + stats ----------
  const rangeSelect = document.getElementById('range-days');
  rangeSelect.addEventListener('change', renderDashboard);

  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function renderDashboard() {
    const days = parseInt(rangeSelect.value, 10);
    const now = Date.now();
    const from = now - days * 86400000;
    const points = state.glucose.filter(g => g.ts >= from && g.ts <= now).sort((a, b) => a.ts - b.ts);
    const symptomLogs = state.logs.filter(l => l.category === 'symptom' && l.ts >= from && l.ts <= now);

    const chartWrap = document.getElementById('chart-wrap');
    const emptyHint = document.getElementById('chart-empty');
    chartWrap.querySelectorAll('svg').forEach(s => s.remove());

    if (points.length === 0) {
      emptyHint.style.display = 'block';
    } else {
      emptyHint.style.display = 'none';
      chartWrap.appendChild(buildChartSVG(points, symptomLogs, from, now, days));
    }

    renderStats(points, symptomLogs, days);
    renderRecentLogs();
  }

  function buildChartSVG(points, symptomLogs, from, to, days) {
    const dayWidth = 260;
    const width = Math.max(360, days * dayWidth);
    const height = 260;
    const padTop = 20, padBottom = 30, padLeft = 40, padRight = 10;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const yMin = 40, yMax = 260;

    const x = (ts) => padLeft + ((ts - from) / (to - from)) * plotW;
    const y = (v) => padTop + (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * plotH;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="sans-serif">`;

    // day/time-of-day background bands
    for (let d = 0; d <= days; d++) {
      const dayStart = new Date(new Date(to).setHours(0, 0, 0, 0) - (days - 1 - d) * 86400000);
      BUCKETS.forEach(b => {
        const bStart = new Date(dayStart).setHours(b.from, 0, 0, 0);
        const bEnd = new Date(dayStart).setHours(b.to, 0, 0, 0);
        if (bEnd < from || bStart > to) return;
        const x1 = x(Math.max(bStart, from));
        const x2 = x(Math.min(bEnd, to));
        const fill = { night: '#e9ecfb', morning: '#fff3da', noon: '#eafaf1', evening: '#ffe6ec', night2: '#e9ecfb' }[b.key];
        svg += `<rect x="${x1}" y="${padTop}" width="${Math.max(0, x2 - x1)}" height="${plotH}" fill="${fill}" opacity="0.6"/>`;
      });
      const dayLabel = new Date(dayStart);
      svg += `<text x="${x(dayStart) + 4}" y="${height - 8}" font-size="10" fill="#767181">${dayLabel.getMonth() + 1}/${dayLabel.getDate()}</text>`;
    }

    // threshold lines
    [70, 54].forEach(th => {
      const color = th === 70 ? '#f5a623' : '#e0556f';
      svg += `<line x1="${padLeft}" y1="${y(th)}" x2="${width - padRight}" y2="${y(th)}" stroke="${color}" stroke-width="1.2" stroke-dasharray="4,3"/>`;
      svg += `<text x="${width - padRight - 20}" y="${y(th) - 3}" font-size="9" fill="${color}">${th}</text>`;
    });

    // y-axis labels
    [50, 100, 150, 200, 250].forEach(v => {
      svg += `<text x="2" y="${y(v) + 3}" font-size="9" fill="#767181">${v}</text>`;
    });

    // glucose line
    let path = '';
    points.forEach((p, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      path += `${cmd}${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)} `;
    });
    svg += `<path d="${path}" fill="none" stroke="#6c63ff" stroke-width="2"/>`;

    // low-value points highlighted
    points.forEach(p => {
      if (p.value < 70) {
        const color = p.value < 54 ? '#e0556f' : '#f5a623';
        svg += `<circle cx="${x(p.ts).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.6" fill="${color}"/>`;
      }
    });

    // symptom markers
    symptomLogs.forEach(l => {
      const cx = x(l.ts);
      const cy = padTop + 8;
      const label = l.symptomType === 'dizziness' ? 'めまい' : l.symptomType === 'fatigue' ? '倦怠感' : l.symptomType === 'both' ? 'めまい+倦怠感' : 'その他';
      svg += `<circle cx="${cx.toFixed(1)}" cy="${cy}" r="4" fill="#e0556f"><title>${fmtDate(l.ts)} ${label} (つらさ${l.severity})</title></circle>`;
      svg += `<line x1="${cx.toFixed(1)}" y1="${cy + 4}" x2="${cx.toFixed(1)}" y2="${padTop + plotH}" stroke="#e0556f" stroke-width="0.6" stroke-dasharray="2,3" opacity="0.5"/>`;
    });

    svg += '</svg>';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = svg;
    return wrapper.firstChild;
  }

  function renderStats(points, symptomLogs, days) {
    const grid = document.getElementById('stat-grid');
    if (points.length === 0) { grid.innerHTML = ''; return; }

    const byBucket = {};
    BUCKETS.forEach(b => byBucket[b.key] = []);
    points.forEach(p => byBucket[bucketOf(new Date(p.ts).getHours()).key].push(p.value));

    const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const min = (arr) => arr.length ? Math.min(...arr) : null;

    const nightVals = byBucket.night;
    const eveningVals = byBucket.evening;
    const under70 = points.filter(p => p.value < 70).length;
    const under54 = points.filter(p => p.value < 54).length;
    const layDownCount = symptomLogs.filter(l => l.layDown).length;
    const last = points[points.length - 1];

    const cards = [
      { label: '最新の血糖値', value: `${last.value} mg/dL`, cls: last.value < 70 ? 'danger' : last.value < 80 ? 'warn' : '' },
      { label: `夜間(0-6時) 平均/最低`, value: nightVals.length ? `${avg(nightVals)} / ${min(nightVals)}` : '—', cls: min(nightVals) !== null && min(nightVals) < 70 ? 'warn' : '' },
      { label: `夕方(15-19時) 平均/最低`, value: eveningVals.length ? `${avg(eveningVals)} / ${min(eveningVals)}` : '—', cls: min(eveningVals) !== null && min(eveningVals) < 80 ? 'warn' : '' },
      { label: `70未満の回数 (${days}日間)`, value: `${under70}回`, cls: under70 > 0 ? 'warn' : '' },
      { label: `54未満の回数 (${days}日間)`, value: `${under54}回`, cls: under54 > 0 ? 'danger' : '' },
      { label: `横になった回数 (${days}日間)`, value: `${layDownCount}回`, cls: layDownCount > 0 ? 'warn' : '' }
    ];
    grid.innerHTML = cards.map(c => `<div class="stat-card ${c.cls}"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`).join('');
  }

  function renderRecentLogs() {
    const wrap = document.getElementById('recent-logs');
    const recent = [...state.logs].sort((a, b) => b.ts - a.ts).slice(0, 15);
    if (recent.length === 0) { wrap.innerHTML = '<p class="hint">まだ記録がありません。</p>'; return; }
    const catLabel = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', symptom: '体調', glucose: '血糖値', note: 'メモ' };
    wrap.innerHTML = recent.map(l => {
      let detail = '';
      if (l.category === 'symptom') {
        const t = l.symptomType === 'dizziness' ? 'めまい' : l.symptomType === 'fatigue' ? '倦怠感' : l.symptomType === 'both' ? 'めまい＋倦怠感' : 'その他';
        detail = `${t}・つらさ${l.severity}${l.layDown ? '・横になった' : ''}${l.note ? '「' + l.note + '」' : ''}`;
      } else if (l.category === 'glucose') detail = `${l.value} mg/dL`;
      else if (l.category === 'dinner') detail = `${l.text || ''}${l.alcoholBeer350 ? `（ビール${l.alcoholBeer350}本）` : ''}`;
      else detail = l.text || '';
      return `<div class="log-item ${l.category === 'symptom' ? 'symptom' : ''}">
        <span class="tag">${catLabel[l.category] || l.category}</span>
        <div><div>${detail}</div><div class="meta">${fmtDate(l.ts)}</div></div>
        <button class="del-btn" data-id="${l.id}">削除</button>
      </div>`;
    }).join('');
    wrap.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.logs = state.logs.filter(l => l.id !== btn.dataset.id);
        saveState();
        renderDashboard();
      });
    });
  }

  // ---------- advice engine ----------
  function computeGlucoseStats(days) {
    const now = Date.now();
    const from = now - days * 86400000;
    const points = state.glucose.filter(g => g.ts >= from && g.ts <= now);
    const byBucket = {};
    BUCKETS.forEach(b => byBucket[b.key] = []);
    points.forEach(p => byBucket[bucketOf(new Date(p.ts).getHours()).key].push(p.value));
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const min = (arr) => arr.length ? Math.min(...arr) : null;
    return {
      points,
      nightAvg: avg(byBucket.night), nightMin: min(byBucket.night),
      eveningAvg: avg(byBucket.evening), eveningMin: min(byBucket.evening),
      under70: points.filter(p => p.value < 70).length,
      under54: points.filter(p => p.value < 54).length
    };
  }

  function symptomGlucoseCorrelation(days) {
    const now = Date.now();
    const from = now - days * 86400000;
    const symptomLogs = state.logs.filter(l => l.category === 'symptom' && l.ts >= from && l.ts <= now);
    let withLowGlucose = 0;
    symptomLogs.forEach(l => {
      const nearby = state.glucose.filter(g => Math.abs(g.ts - l.ts) <= 30 * 60000);
      if (nearby.some(g => g.value < 80)) withLowGlucose++;
    });
    return { total: symptomLogs.length, withLowGlucose, layDown: symptomLogs.filter(l => l.layDown).length };
  }

  function alcoholDinnerPattern() {
    const dinners = state.logs.filter(l => l.category === 'dinner');
    const withAlcoholNoCarb = dinners.filter(l => (l.alcoholBeer350 || 0) > 0 && !/(ご飯|パン|麺|米|主食)/.test(l.text || ''));
    return { total: dinners.length, alcoholNoCarb: withAlcoholNoCarb.length };
  }

  function block(title, items, opts = {}) {
    if (!items.length) return '';
    const cls = opts.alert ? 'advice-block alert' : 'advice-block';
    return `<div class="${cls}"><h3>${title}</h3><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  }

  function renderAdvice() {
    const el = document.getElementById('advice-content');
    const stats30 = computeGlucoseStats(30);
    const corr30 = symptomGlucoseCorrelation(30);
    const alcoholPattern = alcoholDinnerPattern();
    const menopauseLabel = { pre: '未閉経', peri: '閉経移行期', post: '閉経後' }[state.profile.menopause];

    let html = '';

    // Alert block — always shown given the described nighttime 60mg/dL reading and severe symptoms
    const alertItems = [];
    if (stats30.under54 > 0 || stats30.nightMin !== null && stats30.nightMin <= 60) {
      alertItems.push(`夜間に60mg/dL台などの低めの血糖値が記録されています。無自覚の低血糖（夜間気づかないうちに血糖が下がる状態）が起きている可能性があるため、リブレのAGPレポート（平均血糖・変動グラフ）を主治医に見せて相談することを強くおすすめします。`);
    }
    alertItems.push(`「めまい」「横にならないと耐えられないほどの倦怠感」が夕方に繰り返し起こる場合、低血糖に加えて自律神経・ホルモン変動（閉経移行期に多い症状）の両方が関わっている可能性があります。安全のため、症状が出た時刻・血糖値・食事内容・直前の行動をできるだけ記録し、内科（できれば糖尿病・代謝内科）と婦人科の両方に相談してください。`);
    alertItems.push(`症状が強く「動けない」「意識がぼんやりする」「発汗・動悸を伴う」「一人で対処できない」場合は様子見をせず、早めに受診（必要なら救急）してください。特に自転車・車の運転中や入浴中に症状が出るのは危険です。`);
    html += block('⚠ まず知っておいてほしいこと', alertItems, { alert: true });

    // Data-driven observations
    const dataItems = [];
    if (stats30.points.length > 0) {
      if (stats30.nightAvg !== null) dataItems.push(`直近30日の夜間(0-6時)平均血糖: 約${Math.round(stats30.nightAvg)}mg/dL（最低${stats30.nightMin}mg/dL）`);
      if (stats30.eveningAvg !== null) dataItems.push(`直近30日の夕方(15-19時)平均血糖: 約${Math.round(stats30.eveningAvg)}mg/dL（最低${stats30.eveningMin}mg/dL）`);
      dataItems.push(`70mg/dL未満: ${stats30.under70}回、54mg/dL未満: ${stats30.under54}回（直近30日）`);
    } else {
      dataItems.push(`まだリブレのデータが取り込まれていません。「データ取込」タブからCSVを読み込むと、時間帯ごとの傾向がここに表示されます。`);
    }
    if (corr30.total > 0) {
      dataItems.push(`記録された体調不良 ${corr30.total}件のうち、${corr30.withLowGlucose}件は前後30分以内に80mg/dL未満の血糖値が記録されています（横になった回数: ${corr30.layDown}回）。`);
    }
    if (alcoholPattern.total > 0) {
      dataItems.push(`夕食の記録 ${alcoholPattern.total}件のうち、${alcoholPattern.alcoholNoCarb}件が「主食なし＋飲酒あり」のパターンでした。`);
    }
    html += block('📊 記録からわかること', dataItems);

    // Alcohol & dinner advice
    html += block('🍺 晩酌と夕食について', [
      `アルコールは肝臓での糖新生（血糖を保つ働き）を数時間抑えるため、炭水化物ゼロのおつまみ＋ビールという組み合わせは、就寝中〜早朝の低血糖リスクを上げやすい食べ方です。`,
      `飲酒する日は、おかずに少量の根菜・かぼちゃ・全粒粉クラッカーなど「ゆっくり吸収される炭水化物」を少し添えると血糖が安定しやすくなります。`,
      `寝る前にリブレの数値を確認し、90mg/dLを下回っているようならチーズや無糖ヨーグルト＋ナッツなど、少量のタンパク質＋脂質のスナックを摂ってから休むと夜間低血糖の予防になります。`,
      `リブレアプリの低血糖アラームを80mg/dL程度に設定しておくと、就寝中の低下に早く気づけます。`
    ]);

    // Breakfast/lunch advice
    html += block('🥗 朝食・昼食について', [
      `ゆで卵・キャロットラペ・ささみ蒸しなど、たんぱく質と食物繊維を中心にした朝食は血糖の急上昇を抑えるうえで良い組み合わせです。パンは全粒粉やライ麦を使うと血糖の上がり方がより緩やかになります。`,
      `納豆を先に食べてからお弁当、という食べる順番は食後血糖の急上昇を抑えるのに役立っています。ただし昼食の量が「やや少なめ」とのことなので、夕方の症状が単純な空腹・エネルギー不足から来ていないかも確認してみてください。`,
      `夕方に強い症状が出やすいなら、昼食と夕食の間が空きすぎていないか、15時前後に軽い補食（ナッツ、チーズ、ゆで卵など）を挟むと血糖の落ち込みを防げる場合があります。`
    ]);

    // Menopause-related advice
    html += block(`🌸 更年期・ホルモンの視点（現在: ${menopauseLabel}）`, [
      `50歳・未閉経とのことで、閉経移行期特有のホルモン変動（エストロゲンの変動）によるほてり・動悸・めまい・強い倦怠感が、低血糖の症状と非常によく似ることが知られています。両方が重なっている可能性もあります。`,
      `婦人科で女性ホルモン（エストラジオール・FSHなど）、内科で甲状腺機能（TSH）・貧血（フェリチン・ヘモグロビン）・HbA1c・空腹時インスリンなどの基本的な血液検査を一度受けておくと、原因の切り分けがしやすくなります。`,
      `症状日記（このアプリの記録）とリブレのデータを合わせて主治医に見せると、低血糖由来かホルモン由来かの判断材料になります。`
    ]);

    // Apple health summary if present
    if (state.appleHealth.heartRateDaily.length || state.appleHealth.sleepDaily.length) {
      const hrItems = [];
      if (state.appleHealth.heartRateDaily.length) {
        const recent = state.appleHealth.heartRateDaily.slice(-7);
        const avgAll = Math.round(recent.reduce((a, d) => a + d.avg, 0) / recent.length);
        hrItems.push(`直近${recent.length}日間の平均心拍数: 約${avgAll}bpm。症状が出た時間帯に心拍が普段より高い場合は、動悸を伴う自律神経反応（低血糖時にもホルモン変動時にも起こりえます）の可能性があります。`);
      }
      if (state.appleHealth.sleepDaily.length) {
        const recent = state.appleHealth.sleepDaily.slice(-7);
        const avgSleep = (recent.reduce((a, d) => a + d.hours, 0) / recent.length).toFixed(1);
        hrItems.push(`直近${recent.length}日間の平均睡眠時間: 約${avgSleep}時間。睡眠不足は血糖の変動やホルモンバランス、倦怠感の悪化要因になり得ます。`);
      }
      html += block('⌚ Apple Watch/ヘルスケアのデータから', hrItems);
    }

    html += block('✅ 次にできる小さな一歩', [
      `1〜2週間、症状が出た時刻・直前に食べたもの・飲酒量をこのアプリに記録し続けてみてください。パターンが見えやすくなります。`,
      `リブレのAGP（平均血糖プロファイル）レポートを主治医に持参して相談する。`,
      `婦人科でホルモン検査、内科で血液検査（HbA1c・甲状腺・貧血）を受ける予約を取る。`,
      `晩酌の日は「主食ゼロ」をやめて少量の炭水化物を添え、寝る前血糖が90未満なら軽い補食をとる。`
    ]);

    el.innerHTML = html;
  }

  // ---------- init ----------
  renderDashboard();
  renderAdvice();
})();
