import { parseDate, parseAmount } from './csvImport.js';
import { loadScript } from './loader.js';

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const DATE_RE = /^(\d{1,2}\.\d{1,2}\.\d{2,4})/;
const AMOUNT_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?/g;

// Extrahiert Text aus einer PDF-Datei (Kontoauszug) und versucht, Buchungszeilen zu erkennen.
// Best-Effort: funktioniert nur mit "echten" PDFs (nicht eingescannten Bildern) und muss vom
// Nutzer vor dem Import geprüft werden, da Bankformate stark variieren.
export async function extractPdfTransactions(file) {
  await loadScript(PDFJS_URL);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;

  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;

  const transactions = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }));
    for (const line of clusterLines(items)) {
      const t = parseLine(line);
      if (t) transactions.push(t);
    }
  }
  return transactions;
}

function clusterLines(items) {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let current = null;
  for (const it of sorted) {
    if (!current || Math.abs(it.y - current.y) > 2.5) {
      current = { y: it.y, items: [] };
      lines.push(current);
    }
    current.items.push(it);
  }
  return lines
    .map((l) => l.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseLine(line) {
  const m = line.match(DATE_RE);
  if (!m) return null;
  const date = parseDate(m[1]);
  if (!date) return null;
  let rest = line.slice(m[0].length).trim();

  // Manche Auszüge listen Buchungs- und Valutadatum direkt hintereinander
  const m2 = rest.match(DATE_RE);
  if (m2) rest = rest.slice(m2[0].length).trim();

  const amounts = rest.match(AMOUNT_RE);
  if (!amounts || amounts.length === 0) return null;
  const amountStr = amounts[0];
  let amount = parseAmount(amountStr.replace(/-$/, ''));
  if (isNaN(amount)) return null;
  if (amountStr.trim().endsWith('-')) amount = -Math.abs(amount);

  const idx = rest.indexOf(amountStr);
  const description = (idx > 0 ? rest.slice(0, idx) : rest).trim() || 'PDF-Buchung';
  return { date, description, amount };
}
