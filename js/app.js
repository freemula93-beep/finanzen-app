import { DB } from './db.js';
import { DEFAULT_CATEGORIES, DEFAULT_RULES, categorizeDescription } from './categorize.js';
import { parseCsv, parseAmount, parseDate, rowHash, guessMapping } from './csvImport.js';
import { drawBarChart, drawDonutChart } from './charts.js';
import { extractPdfTransactions } from './pdfImport.js';
import { extractReceiptData } from './receiptImport.js';

const state = {
  view: 'dashboard',
  monthOffset: 0, // 0 = aktueller Monat, -1 = Vormonat, ...
  categories: [],
  rules: [],
  transactions: [],
  importDraft: null, // { kind: 'csv'|'pdf'|'receipt', ... }
  importLoading: null, // Ladetext, während PDF/Foto verarbeitet wird
  txSearch: '',
};

const viewRoot = document.getElementById('view-root');
const topbarTitle = document.getElementById('topbar-title');
const periodSwitch = document.getElementById('period-switch');
const toastEl = document.getElementById('toast');

const VIEW_TITLES = {
  dashboard: 'Übersicht',
  transactions: 'Buchungen',
  import: 'CSV-Import',
  analysis: 'Analyse',
  settings: 'Einstellungen',
};

function fmtCurrency(v) {
  return (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function monthLabel(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
}

function monthRange(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start: isoDate(start), end: isoDate(end) };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function txInRange(t, start, end) {
  return t.date >= start && t.date < end;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function categoryByName(name) {
  return state.categories.find((c) => c.name === name);
}
function categoryById(id) {
  return state.categories.find((c) => c.id === id);
}

// ---------- Init & seed ----------

async function init() {
  await seedIfEmpty();
  await loadAll();
  bindNav();
  render();
}

async function seedIfEmpty() {
  const catCount = await DB.count('categories');
  if (catCount === 0) {
    for (const c of DEFAULT_CATEGORIES) await DB.add('categories', c);
  }
  const ruleCount = await DB.count('rules');
  if (ruleCount === 0) {
    for (const r of DEFAULT_RULES) await DB.add('rules', r);
  }
}

async function loadAll() {
  const [cats, rules, txs] = await Promise.all([
    DB.getAll('categories'),
    DB.getAll('rules'),
    DB.getAll('transactions'),
  ]);
  state.categories = cats;
  state.rules = rules;
  state.transactions = txs.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function bindNav() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      state.importDraft = null;
      render();
    });
  });
}

function render() {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  topbarTitle.textContent = VIEW_TITLES[state.view];

  if (state.view === 'dashboard' || state.view === 'transactions') {
    renderPeriodSwitch();
  } else {
    periodSwitch.innerHTML = '';
  }

  if (state.view === 'dashboard') renderDashboard();
  else if (state.view === 'transactions') renderTransactions();
  else if (state.view === 'import') renderImport();
  else if (state.view === 'analysis') renderAnalysis();
  else if (state.view === 'settings') renderSettings();
}

function renderPeriodSwitch() {
  periodSwitch.innerHTML = `
    <button id="month-prev">‹</button>
    <button disabled>${monthLabel(state.monthOffset)}</button>
    <button id="month-next" ${state.monthOffset >= 0 ? 'disabled style="opacity:.35"' : ''}>›</button>
  `;
  document.getElementById('month-prev').addEventListener('click', () => {
    state.monthOffset -= 1;
    render();
  });
  document.getElementById('month-next').addEventListener('click', () => {
    if (state.monthOffset < 0) state.monthOffset += 1;
    render();
  });
}

// ---------- Dashboard ----------

function renderDashboard() {
  const { start, end } = monthRange(state.monthOffset);
  const monthTx = state.transactions.filter((t) => txInRange(t, start, end));
  const income = monthTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const balance = income + expense;

  const expenseByCat = {};
  for (const t of monthTx) {
    if (t.amount < 0) {
      expenseByCat[t.category || 'Sonstiges'] = (expenseByCat[t.category || 'Sonstiges'] || 0) + Math.abs(t.amount);
    }
  }
  const donutEntries = Object.entries(expenseByCat)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, color: categoryByName(name)?.color || '#94a3b8' }));

  const months = [];
  for (let i = 5; i >= 0; i--) months.push(state.monthOffset - i);
  const seriesLabels = months.map((m) => monthLabel(m).split(' ')[0]);
  const seriesIncome = [];
  const seriesExpense = [];
  for (const m of months) {
    const r = monthRange(m);
    const tx = state.transactions.filter((t) => txInRange(t, r.start, r.end));
    seriesIncome.push(tx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
    seriesExpense.push(Math.abs(tx.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)));
  }

  viewRoot.innerHTML = `
    ${state.transactions.length === 0 ? emptyStateNoData() : ''}
    <div class="summary-grid">
      <div class="summary-tile income"><div class="label">Einnahmen</div><div class="value">${fmtCurrency(income)}</div></div>
      <div class="summary-tile expense"><div class="label">Ausgaben</div><div class="value">${fmtCurrency(expense)}</div></div>
      <div class="summary-tile balance"><div class="label">Saldo</div><div class="value ${balance >= 0 ? 'positive' : 'negative'}">${fmtCurrency(balance)}</div></div>
    </div>

    <div class="card">
      <h2>Verlauf (6 Monate)</h2>
      <canvas id="bar-chart"></canvas>
      <div class="legend">
        <div class="legend-row"><span class="legend-dot" style="background:#22d3ee"></span><span class="legend-name">Einnahmen</span></div>
        <div class="legend-row"><span class="legend-dot" style="background:#f87171"></span><span class="legend-name">Ausgaben</span></div>
      </div>
    </div>

    <div class="card">
      <h2>Ausgaben nach Kategorie · ${monthLabel(state.monthOffset)}</h2>
      <canvas id="donut-chart"></canvas>
      <div class="legend">
        ${donutEntries.slice(0, 8).map((e) => `
          <div class="legend-row">
            <span class="legend-dot" style="background:${e.color}"></span>
            <span class="legend-name">${e.name}</span>
            <span class="legend-value">${fmtCurrency(e.value)}</span>
          </div>
        `).join('') || '<div class="legend-row"><span class="legend-name">Keine Ausgaben in diesem Monat</span></div>'}
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    drawBarChart(document.getElementById('bar-chart'), seriesLabels, seriesIncome, seriesExpense);
    drawDonutChart(document.getElementById('donut-chart'), donutEntries);
  });
}

function emptyStateNoData() {
  return `<div class="card"><div class="empty-state">Noch keine Daten. Importiere einen Kontoauszug im Tab <b>Import</b>, um loszulegen.</div></div>`;
}

// ---------- Transactions ----------

function renderTransactions() {
  const { start, end } = monthRange(state.monthOffset);
  let monthTx = state.transactions.filter((t) => txInRange(t, start, end));
  if (state.txSearch.trim()) {
    const q = state.txSearch.toLowerCase();
    monthTx = monthTx.filter((t) => t.description.toLowerCase().includes(q));
  }

  const catOptions = state.categories
    .map((c) => `<option value="${c.name}">${c.name}</option>`)
    .join('');

  viewRoot.innerHTML = `
    <div class="search-row">
      <input type="text" id="tx-search" placeholder="Suche in Buchungen…" value="${escapeAttr(state.txSearch)}" />
    </div>
    <div class="tx-list">
      ${monthTx.length === 0 ? '<div class="empty-state">Keine Buchungen in diesem Zeitraum.</div>' : monthTx.map(txRowHtml).join('')}
    </div>
  `;

  function txRowHtml(t) {
    const cat = categoryByName(t.category) || {};
    return `
      <div class="tx-row" data-id="${t.id}">
        <span class="tx-cat-dot" style="background:${cat.color || '#94a3b8'}"></span>
        <div class="tx-main">
          <div class="tx-desc">${escapeHtml(t.description)}</div>
          <div class="tx-meta">${fmtDate(t.date)}</div>
          <select class="tx-cat-select" data-id="${t.id}">
            <option value="">Kategorie…</option>
            ${catOptions}
          </select>
        </div>
        <div class="tx-amount ${t.amount >= 0 ? 'income' : 'expense'}">${fmtCurrency(t.amount)}</div>
      </div>
    `;
  }

  document.getElementById('tx-search').addEventListener('input', (e) => {
    state.txSearch = e.target.value;
    renderTransactions();
  });

  viewRoot.querySelectorAll('.tx-cat-select').forEach((sel) => {
    const id = Number(sel.dataset.id);
    const t = state.transactions.find((x) => x.id === id);
    sel.value = t?.category || '';
    sel.addEventListener('change', async () => {
      t.category = sel.value;
      await DB.put('transactions', t);
      toast('Kategorie aktualisiert');
    });
  });
}

// ---------- Import ----------

function renderImport() {
  if (state.importLoading) {
    viewRoot.innerHTML = `<div class="card"><div class="empty-state">⏳ ${escapeHtml(state.importLoading)}</div></div>`;
    return;
  }

  if (!state.importDraft) {
    viewRoot.innerHTML = `
      <div class="card">
        <h2>Beleg oder Kontoauszug importieren</h2>
        <label class="dropzone" id="dropzone" for="csv-input">
          <div>📄 Datei hierher ziehen<br/>oder tippen zum Auswählen</div>
          <input type="file" id="csv-input" accept=".csv,text/csv,.pdf,application/pdf,image/jpeg,image/png" style="display:none" />
        </label>
        <div style="font-size:12px;color:var(--text-dim);line-height:1.5">
          Unterstützt werden <b>CSV</b>-Kontoauszüge (Spalten frei zuordenbar), <b>PDF</b>-Kontoauszüge (Text wird automatisch erkannt)
          und Fotos von Belegen (<b>JPEG/PNG</b>, per Texterkennung). Die PDF- und Foto-Erkennung ist Best-Effort – bitte die
          erkannten Daten vor dem Speichern prüfen. Dafür wird einmalig eine Erkennungs-Bibliothek geladen, also kurz Internet nötig.
        </div>
      </div>
    `;
    const input = document.getElementById('csv-input');
    const dz = document.getElementById('dropzone');
    input.addEventListener('change', () => input.files[0] && handleFile(input.files[0]));
    ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
    dz.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    return;
  }

  const d = state.importDraft;
  if (d.kind === 'pdf') return renderPdfReview(d);
  if (d.kind === 'receipt') return renderReceiptReview(d);
  return renderCsvMapping(d);
}

function renderCsvMapping(d) {
  const colOptions = (selected) => d.headers.map((h, i) => `<option value="${i}" ${i === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('') + `<option value="-1" ${selected === -1 || selected === undefined ? 'selected' : ''}>– keine –</option>`;

  const previewRows = d.rows.slice(0, 5);

  viewRoot.innerHTML = `
    <div class="card">
      <h2>Spalten zuordnen</h2>
      <div class="mapping-grid">
        <div>
          <label class="field-label">Datum</label>
          <select id="map-date">${colOptions(d.mapping.date)}</select>
        </div>
        <div>
          <label class="field-label">Beschreibung</label>
          <select id="map-desc">${colOptions(d.mapping.description)}</select>
        </div>
        <div>
          <label class="field-label">Betrag (mit Vorzeichen)</label>
          <select id="map-amount">${colOptions(d.mapping.amount)}</select>
        </div>
        <div>
          <label class="field-label">oder: Soll-Spalte</label>
          <select id="map-debit">${colOptions(d.mapping.debit)}</select>
        </div>
        <div>
          <label class="field-label">oder: Haben-Spalte</label>
          <select id="map-credit">${colOptions(d.mapping.credit)}</select>
        </div>
        <div style="display:flex;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-dim)">
            <input type="checkbox" id="map-invert" ${d.invert ? 'checked' : ''}/> Beträge invertieren
          </label>
        </div>
      </div>
      <div style="overflow-x:auto;margin-bottom:14px">
        <table class="preview">
          <thead><tr>${d.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${previewRows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="btn-row">
        <button class="btn secondary" id="import-cancel">Abbrechen</button>
        <button class="btn" id="import-confirm">Importieren</button>
      </div>
    </div>
  `;

  const bind = (id, key) => document.getElementById(id).addEventListener('change', (e) => {
    d.mapping[key] = Number(e.target.value);
  });
  bind('map-date', 'date');
  bind('map-desc', 'description');
  bind('map-amount', 'amount');
  bind('map-debit', 'debit');
  bind('map-credit', 'credit');
  document.getElementById('map-invert').addEventListener('change', (e) => { d.invert = e.target.checked; });

  document.getElementById('import-cancel').addEventListener('click', () => {
    state.importDraft = null;
    render();
  });
  document.getElementById('import-confirm').addEventListener('click', doCsvImport);
}

function handleFile(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const reader = new FileReader();
    reader.onload = () => {
      const { headers, rows } = parseCsv(String(reader.result));
      if (headers.length === 0) {
        toast('CSV konnte nicht gelesen werden');
        return;
      }
      const mapping = guessMapping(headers);
      state.importDraft = { kind: 'csv', headers, rows, mapping, invert: false };
      render();
    };
    reader.readAsText(file, 'utf-8');
    return;
  }

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    state.importLoading = 'PDF wird analysiert…';
    render();
    extractPdfTransactions(file)
      .then((txs) => {
        state.importLoading = null;
        if (txs.length === 0) {
          toast('Es konnten keine Buchungen im PDF erkannt werden');
          render();
          return;
        }
        state.importDraft = { kind: 'pdf', rows: txs, invert: false };
        render();
      })
      .catch((err) => {
        state.importLoading = null;
        toast(err.message || 'PDF konnte nicht gelesen werden');
        render();
      });
    return;
  }

  if (file.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(name)) {
    state.importLoading = 'Beleg wird erkannt (OCR)…';
    render();
    extractReceiptData(file)
      .then((res) => {
        state.importLoading = null;
        state.importDraft = { kind: 'receipt', ...res };
        render();
      })
      .catch((err) => {
        state.importLoading = null;
        toast(err.message || 'Beleg konnte nicht gelesen werden');
        render();
      });
    return;
  }

  toast('Nicht unterstütztes Dateiformat');
}

// ---------- PDF-Review ----------

function renderPdfReview(d) {
  viewRoot.innerHTML = `
    <div class="card">
      <h2>PDF-Buchungen prüfen (${d.rows.length})</h2>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">
        Die Erkennung ist nicht perfekt – bitte Datum, Text und Betrag kontrollieren und bei Bedarf korrigieren oder Zeilen löschen.
      </div>
      <div id="pdf-rows">${d.rows.map(pdfRowHtml).join('')}</div>
      <button class="btn secondary" id="pdf-add-row" style="margin-bottom:14px">+ Zeile hinzufügen</button>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-dim);margin-bottom:14px">
        <input type="checkbox" id="pdf-invert" ${d.invert ? 'checked' : ''}/> Alle Beträge invertieren
      </label>
      <div class="btn-row">
        <button class="btn secondary" id="import-cancel">Abbrechen</button>
        <button class="btn" id="pdf-import-confirm">Importieren</button>
      </div>
    </div>
  `;

  function pdfRowHtml(r, i) {
    return `
      <div class="rule-row" data-i="${i}" style="flex-wrap:wrap;gap:6px">
        <input type="date" class="pdf-date" data-i="${i}" value="${r.date || ''}" style="flex:1 1 130px" />
        <input type="text" class="pdf-desc" data-i="${i}" value="${escapeAttr(r.description)}" style="flex:2 1 140px" />
        <input type="number" step="0.01" class="pdf-amount" data-i="${i}" value="${r.amount}" style="flex:1 1 90px" />
        <button class="icon-btn pdf-del" data-i="${i}">✕</button>
      </div>
    `;
  }

  function rebindRows() {
    viewRoot.querySelectorAll('.pdf-date').forEach((el) => el.addEventListener('input', () => { d.rows[Number(el.dataset.i)].date = el.value; }));
    viewRoot.querySelectorAll('.pdf-desc').forEach((el) => el.addEventListener('input', () => { d.rows[Number(el.dataset.i)].description = el.value; }));
    viewRoot.querySelectorAll('.pdf-amount').forEach((el) => el.addEventListener('input', () => { d.rows[Number(el.dataset.i)].amount = el.value; }));
    viewRoot.querySelectorAll('.pdf-del').forEach((el) => el.addEventListener('click', () => {
      d.rows.splice(Number(el.dataset.i), 1);
      renderPdfReview(d);
    }));
  }
  rebindRows();

  document.getElementById('pdf-add-row').addEventListener('click', () => {
    d.rows.push({ date: '', description: '', amount: 0 });
    renderPdfReview(d);
  });
  document.getElementById('pdf-invert').addEventListener('change', (e) => { d.invert = e.target.checked; });
  document.getElementById('import-cancel').addEventListener('click', () => { state.importDraft = null; render(); });
  document.getElementById('pdf-import-confirm').addEventListener('click', doPdfImport);
}

async function doPdfImport() {
  const d = state.importDraft;
  const existingHashes = new Set(state.transactions.map((t) => t.hash));
  const toInsert = [];
  let skipped = 0;

  for (const r of d.rows) {
    if (!r.date) continue;
    let amount = Number(r.amount);
    if (isNaN(amount)) continue;
    if (d.invert) amount = -amount;
    const description = (r.description || '').trim() || 'PDF-Buchung';

    const hash = rowHash(r.date, amount, description);
    if (existingHashes.has(hash)) {
      skipped++;
      continue;
    }
    existingHashes.add(hash);

    const category = categorizeDescription(description, state.rules) || (amount > 0 ? 'Sonstige Einnahmen' : 'Sonstiges');
    toInsert.push({ date: r.date, description, amount, category, hash, importedAt: new Date().toISOString() });
  }

  if (toInsert.length > 0) await DB.bulkAdd('transactions', toInsert);
  await loadAll();
  state.importDraft = null;
  state.view = 'dashboard';
  render();
  toast(`${toInsert.length} Buchungen importiert${skipped ? `, ${skipped} Duplikate übersprungen` : ''}`);
}

// ---------- Beleg-Review (OCR) ----------

function renderReceiptReview(d) {
  const catOptions = state.categories.filter((c) => c.type === 'expense').map((c) => `<option value="${c.name}">${c.name}</option>`).join('');
  const guessedCat = categorizeDescription(d.merchant, state.rules) || 'Sonstiges';

  viewRoot.innerHTML = `
    <div class="card">
      <h2>Beleg erkannt</h2>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Bitte Angaben prüfen und bei Bedarf korrigieren.</div>
      <div class="mapping-grid">
        <div><label class="field-label">Händler / Beschreibung</label><input type="text" id="r-desc" value="${escapeAttr(d.merchant || '')}" /></div>
        <div><label class="field-label">Datum</label><input type="date" id="r-date" value="${d.date || ''}" /></div>
        <div><label class="field-label">Betrag (€)</label><input type="number" step="0.01" min="0" id="r-amount" value="${d.amount != null ? d.amount : ''}" /></div>
        <div><label class="field-label">Kategorie</label><select id="r-cat">${catOptions}</select></div>
      </div>
      <details style="margin-bottom:14px">
        <summary style="cursor:pointer;color:var(--text-dim);font-size:12px">Erkannten Text anzeigen</summary>
        <pre style="white-space:pre-wrap;font-size:11px;color:var(--text-dim);margin-top:8px">${escapeHtml(d.rawText || '')}</pre>
      </details>
      <div class="btn-row">
        <button class="btn secondary" id="import-cancel">Abbrechen</button>
        <button class="btn" id="receipt-confirm">Als Ausgabe speichern</button>
      </div>
    </div>
  `;

  const catSelect = document.getElementById('r-cat');
  if ([...catSelect.options].some((o) => o.value === guessedCat)) catSelect.value = guessedCat;

  document.getElementById('import-cancel').addEventListener('click', () => { state.importDraft = null; render(); });
  document.getElementById('receipt-confirm').addEventListener('click', async () => {
    const date = document.getElementById('r-date').value;
    const description = document.getElementById('r-desc').value.trim() || 'Beleg';
    const amountAbs = parseFloat(document.getElementById('r-amount').value);
    const category = catSelect.value;
    if (!date || isNaN(amountAbs)) {
      toast('Bitte Datum und Betrag angeben');
      return;
    }
    const amount = -Math.abs(amountAbs);
    const hash = rowHash(date, amount, description);
    if (state.transactions.some((t) => t.hash === hash)) {
      toast('Diese Buchung scheint bereits zu existieren');
      return;
    }
    await DB.add('transactions', { date, description, amount, category, hash, importedAt: new Date().toISOString() });
    await loadAll();
    state.importDraft = null;
    state.view = 'dashboard';
    render();
    toast('Beleg gespeichert');
  });
}

async function doCsvImport() {
  const d = state.importDraft;
  const { mapping, rows, invert } = d;
  if (mapping.date === -1 || mapping.date === undefined) {
    toast('Bitte Datums-Spalte wählen');
    return;
  }
  if ((mapping.amount === -1 || mapping.amount === undefined) && (mapping.debit === -1 || mapping.debit === undefined) && (mapping.credit === -1 || mapping.credit === undefined)) {
    toast('Bitte Betrags-Spalte(n) wählen');
    return;
  }

  const existingHashes = new Set(state.transactions.map((t) => t.hash));
  const toInsert = [];
  let skipped = 0;

  for (const row of rows) {
    const date = parseDate(row[mapping.date]);
    if (!date) continue;
    const description = mapping.description !== -1 && mapping.description !== undefined ? (row[mapping.description] || '').trim() : '(ohne Beschreibung)';

    let amount;
    if (mapping.amount !== -1 && mapping.amount !== undefined) {
      amount = parseAmount(row[mapping.amount]);
    } else {
      const debit = mapping.debit !== -1 && mapping.debit !== undefined ? parseAmount(row[mapping.debit]) : 0;
      const credit = mapping.credit !== -1 && mapping.credit !== undefined ? parseAmount(row[mapping.credit]) : 0;
      amount = (isNaN(credit) ? 0 : credit) - (isNaN(debit) ? 0 : Math.abs(debit || 0));
    }
    if (isNaN(amount)) continue;
    if (invert) amount = -amount;

    const hash = rowHash(date, amount, description);
    if (existingHashes.has(hash)) {
      skipped++;
      continue;
    }
    existingHashes.add(hash);

    const category = categorizeDescription(description, state.rules) || (amount > 0 ? 'Sonstige Einnahmen' : 'Sonstiges');
    toInsert.push({ date, description, amount, category, hash, importedAt: new Date().toISOString() });
  }

  if (toInsert.length > 0) {
    await DB.bulkAdd('transactions', toInsert);
  }
  await loadAll();
  state.importDraft = null;
  state.view = 'dashboard';
  render();
  toast(`${toInsert.length} Buchungen importiert${skipped ? `, ${skipped} Duplikate übersprungen` : ''}`);
}

// ---------- Analysis ----------

function renderAnalysis() {
  const curr = monthRange(0);
  const prev = monthRange(-1);
  const currTx = state.transactions.filter((t) => txInRange(t, curr.start, curr.end));
  const prevTx = state.transactions.filter((t) => txInRange(t, prev.start, prev.end));

  const currIncome = currTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const currExpense = Math.abs(currTx.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const savingsRate = currIncome > 0 ? (currIncome - currExpense) / currIncome : null;

  const sumByCat = (tx) => {
    const m = {};
    for (const t of tx) if (t.amount < 0) m[t.category || 'Sonstiges'] = (m[t.category || 'Sonstiges'] || 0) + Math.abs(t.amount);
    return m;
  };
  const currByCat = sumByCat(currTx);
  const prevByCat = sumByCat(prevTx);

  const insights = [];

  if (state.transactions.length === 0) {
    viewRoot.innerHTML = emptyStateNoData();
    return;
  }

  if (savingsRate !== null) {
    if (savingsRate < 0) {
      insights.push(insightHtml('bad', '⚠️', `Du hast diesen Monat ${fmtCurrency(Math.abs(currIncome - currExpense))} mehr ausgegeben als eingenommen.`));
    } else if (savingsRate < 0.1) {
      insights.push(insightHtml('warn', '💡', `Deine Sparquote liegt bei ${(savingsRate * 100).toFixed(0)}%. Empfehlenswert sind mind. 10–20% des Einkommens.`));
    } else {
      insights.push(insightHtml('good', '✅', `Starke Sparquote von ${(savingsRate * 100).toFixed(0)}% diesen Monat – weiter so!`));
    }
  }

  const risers = Object.entries(currByCat)
    .map(([cat, val]) => ({ cat, val, prevVal: prevByCat[cat] || 0, diff: val - (prevByCat[cat] || 0) }))
    .filter((e) => e.prevVal > 0 && e.diff > 0 && e.diff / e.prevVal > 0.2)
    .sort((a, b) => b.diff - a.diff);
  for (const r of risers.slice(0, 3)) {
    const pct = Math.round((r.diff / r.prevVal) * 100);
    insights.push(insightHtml('warn', '📈', `${r.cat}: +${pct}% gegenüber Vormonat (${fmtCurrency(r.prevVal)} → ${fmtCurrency(r.val)}).`));
  }

  const fallers = Object.entries(currByCat)
    .map(([cat, val]) => ({ cat, val, prevVal: prevByCat[cat] || 0, diff: (prevByCat[cat] || 0) - val }))
    .filter((e) => e.prevVal > 0 && e.diff > 0 && e.diff / e.prevVal > 0.2)
    .sort((a, b) => b.diff - a.diff);
  for (const f of fallers.slice(0, 2)) {
    const pct = Math.round((f.diff / f.prevVal) * 100);
    insights.push(insightHtml('good', '📉', `${f.cat}: -${pct}% gegenüber Vormonat – gut gespart!`));
  }

  const topCats = Object.entries(currByCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topCats.length > 0 && currExpense > 0) {
    const [name, val] = topCats[0];
    insights.push(insightHtml('info', '🏆', `Größter Ausgabenposten: ${name} mit ${fmtCurrency(val)} (${Math.round((val / currExpense) * 100)}% der Ausgaben).`));
  }

  const subs = currByCat['Abos & Streaming'] || 0;
  if (subs > 0) {
    insights.push(insightHtml('info', '🔁', `Abos & Streaming: ${fmtCurrency(subs)} diesen Monat. Prüfe, ob du alle Abos noch nutzt.`));
  }

  const budgetsSet = state.categories.filter((c) => c.type === 'expense' && c.budget > 0);
  const budgetRows = budgetsSet.map((c) => {
    const spent = currByCat[c.name] || 0;
    const pct = Math.min(100, Math.round((spent / c.budget) * 100));
    const over = spent > c.budget;
    return `
      <div class="progress-row">
        <div class="top"><span>${c.name}</span><span>${fmtCurrency(spent)} / ${fmtCurrency(c.budget)}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${over ? '#f87171' : c.color}"></div></div>
      </div>
    `;
  }).join('');

  viewRoot.innerHTML = `
    <div class="card">
      <h2>Erkenntnisse · ${monthLabel(0)}</h2>
      ${insights.join('') || '<div class="empty-state">Noch nicht genug Daten für eine Analyse.</div>'}
    </div>
    ${budgetsSet.length > 0 ? `
      <div class="card">
        <h2>Budgets diesen Monat</h2>
        ${budgetRows}
      </div>
    ` : `
      <div class="card">
        <h2>Budgets</h2>
        <div class="empty-state">Lege in den Einstellungen Monatsbudgets pro Kategorie fest, um hier deinen Fortschritt zu sehen.</div>
      </div>
    `}
  `;
}

function insightHtml(type, icon, text) {
  return `<div class="insight ${type}"><span class="icon">${icon}</span><span>${text}</span></div>`;
}

// ---------- Settings ----------

function renderSettings() {
  const expenseCats = state.categories.filter((c) => c.type === 'expense');
  const incomeCats = state.categories.filter((c) => c.type === 'income');

  viewRoot.innerHTML = `
    <div class="card">
      <h2>Monatsbudgets</h2>
      ${expenseCats.map((c) => `
        <div class="cat-row">
          <span class="name"><span class="legend-dot" style="background:${c.color}"></span>${c.name}</span>
          <input type="number" min="0" step="10" placeholder="0" value="${c.budget || ''}" data-cat-id="${c.id}" class="budget-input" />
        </div>
      `).join('')}
    </div>

    <div class="card">
      <h2>Kategorien</h2>
      <div id="all-cats">
        ${state.categories.map((c) => `<div class="cat-row"><span class="name"><span class="legend-dot" style="background:${c.color}"></span>${c.name}</span><span style="color:var(--text-dim);font-size:11px">${c.type === 'income' ? 'Einnahme' : 'Ausgabe'}</span></div>`).join('')}
      </div>
      <div class="section-title">Neue Kategorie</div>
      <div class="mapping-grid">
        <div><label class="field-label">Name</label><input type="text" id="new-cat-name" placeholder="z.B. Haustier" /></div>
        <div><label class="field-label">Typ</label><select id="new-cat-type"><option value="expense">Ausgabe</option><option value="income">Einnahme</option></select></div>
      </div>
      <button class="btn secondary" id="add-cat-btn">Kategorie hinzufügen</button>
    </div>

    <div class="card">
      <h2>Automatische Kategorisierung (Regeln)</h2>
      <div id="rules-list">
        ${state.rules.map((r) => `
          <div class="rule-row" data-id="${r.id}">
            <span class="kw">${escapeHtml(r.keyword)}</span>
            <span style="color:var(--text-dim)">→</span>
            <span>${escapeHtml(r.category)}</span>
            <button class="icon-btn del-rule" data-id="${r.id}">✕</button>
          </div>
        `).join('')}
      </div>
      <div class="section-title">Neue Regel</div>
      <div class="mapping-grid">
        <div><label class="field-label">Schlüsselwort</label><input type="text" id="new-rule-kw" placeholder="z.B. SPOTIFY" /></div>
        <div><label class="field-label">Kategorie</label>
          <select id="new-rule-cat">${state.categories.map((c) => `<option value="${c.name}">${c.name}</option>`).join('')}</select>
        </div>
      </div>
      <button class="btn secondary" id="add-rule-btn">Regel hinzufügen</button>
    </div>

    <div class="card">
      <h2>Daten</h2>
      <div class="btn-row" style="margin-bottom:10px">
        <button class="btn secondary" id="export-btn">Backup exportieren</button>
        <label class="btn secondary" style="text-align:center">Backup importieren
          <input type="file" id="import-backup-input" accept="application/json" style="display:none" />
        </label>
      </div>
      <button class="btn danger" id="wipe-btn">Alle Daten löschen</button>
    </div>
  `;

  viewRoot.querySelectorAll('.budget-input').forEach((inp) => {
    inp.addEventListener('change', async () => {
      const cat = categoryById(Number(inp.dataset.catId));
      cat.budget = parseFloat(inp.value) || 0;
      await DB.put('categories', cat);
      toast('Budget gespeichert');
    });
  });

  document.getElementById('add-cat-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-cat-name').value.trim();
    const type = document.getElementById('new-cat-type').value;
    if (!name) return;
    const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    await DB.add('categories', { name, type, color, budget: 0 });
    await loadAll();
    render();
  });

  document.getElementById('add-rule-btn').addEventListener('click', async () => {
    const keyword = document.getElementById('new-rule-kw').value.trim();
    const category = document.getElementById('new-rule-cat').value;
    if (!keyword) return;
    await DB.add('rules', { keyword, category });
    await loadAll();
    render();
  });

  viewRoot.querySelectorAll('.del-rule').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await DB.delete('rules', Number(btn.dataset.id));
      await loadAll();
      render();
    });
  });

  document.getElementById('export-btn').addEventListener('click', async () => {
    const data = {
      categories: await DB.getAll('categories'),
      rules: await DB.getAll('rules'),
      transactions: await DB.getAll('transactions'),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finanzen-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-backup-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!confirm('Bestehende Daten werden mit dem Backup zusammengeführt. Fortfahren?')) return;
      if (Array.isArray(data.categories)) for (const c of data.categories) { const { id, ...rest } = c; await DB.add('categories', rest).catch(() => {}); }
      if (Array.isArray(data.rules)) for (const r of data.rules) { const { id, ...rest } = r; await DB.add('rules', rest).catch(() => {}); }
      if (Array.isArray(data.transactions)) for (const t of data.transactions) { const { id, ...rest } = t; await DB.add('transactions', rest).catch(() => {}); }
      await loadAll();
      render();
      toast('Backup importiert');
    } catch (err) {
      toast('Ungültige Backup-Datei');
    }
  });

  document.getElementById('wipe-btn').addEventListener('click', async () => {
    if (!confirm('Wirklich ALLE Finanzdaten unwiderruflich löschen?')) return;
    await DB.clear('transactions');
    await DB.clear('categories');
    await DB.clear('rules');
    await seedIfEmpty();
    await loadAll();
    state.view = 'dashboard';
    render();
    toast('Alle Daten gelöscht');
  });
}

// ---------- utils ----------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

init();
