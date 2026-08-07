import { parseDate, parseAmount } from './csvImport.js';
import { loadScript } from './loader.js';

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const DATE_RE = /^(\d{1,2}\.\d{1,2}\.\d{2,4})/;
const AMOUNT_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?/g;
// Zeilen, die typischerweise das Ende einer Buchung markieren (Kontostand, Seitenfuß, ...) –
// werden nicht mehr der Buchung zugeschlagen, damit Blöcke nicht ins Uferlose wachsen.
const STOP_RE = /(kontostand|saldo\s*(alt|neu)?|übertrag|seite \d|zwischensumme|neuer saldo|alter saldo)/i;

// Extrahiert Text aus einer PDF-Datei (Kontoauszug) und versucht, Buchungen zu erkennen.
// Viele Banken drucken eine Buchung über mehrere Zeilen (1. Zeile: Datum + Buchungsart wie
// "Lastschrift", 2.+ Zeile: eigentlicher Verwendungszweck/Empfänger) – deshalb werden alle
// Zeilen bis zur nächsten Buchung (nächstes Datum am Zeilenanfang) zu einem Block zusammengefasst.
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
    const lines = clusterLines(items);
    transactions.push(...groupIntoTransactions(lines));
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

// Fasst aufeinanderfolgende Zeilen zu Blöcken zusammen: ein Block beginnt bei einer Zeile,
// die mit einem Datum startet, und endet, sobald das nächste Datum (oder eine Stop-Zeile) kommt.
function groupIntoTransactions(lines) {
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (DATE_RE.test(line)) {
      if (current) blocks.push(current);
      current = [line];
    } else if (current) {
      if (STOP_RE.test(line)) {
        blocks.push(current);
        current = null;
      } else {
        current.push(line);
      }
    }
  }
  if (current) blocks.push(current);
  return blocks.map(parseBlock).filter(Boolean);
}

function parseBlock(blockLines) {
  const firstLine = blockLines[0];
  const m = firstLine.match(DATE_RE);
  if (!m) return null;
  const date = parseDate(m[1]);
  if (!date) return null;

  let joined = blockLines.join(' ').replace(/\s+/g, ' ').trim();
  joined = joined.slice(m[0].length).trim();

  // Manche Auszüge listen Buchungs- und Valutadatum direkt hintereinander
  const m2 = joined.match(DATE_RE);
  if (m2) joined = joined.slice(m2[0].length).trim();

  const amounts = joined.match(AMOUNT_RE);
  if (!amounts || amounts.length === 0) return null;
  const amountStr = amounts[0];
  let amount = parseAmount(amountStr.replace(/-$/, ''));
  if (isNaN(amount)) return null;
  if (amountStr.trim().endsWith('-')) amount = -Math.abs(amount);

  // Beschreibung setzt sich aus dem Text vor UND nach dem Betrag zusammen, da der eigentliche
  // Verwendungszweck bei mehrzeiligen Buchungen oft erst in der Folgezeile (nach dem Betrag) steht.
  const idx = joined.indexOf(amountStr);
  const before = idx > 0 ? joined.slice(0, idx) : '';
  const after = joined.slice(idx + amountStr.length);
  let description = (before + ' ' + after).replace(AMOUNT_RE, '').replace(/\s{2,}/g, ' ').trim();
  if (!description) description = 'PDF-Buchung';
  return { date, description, amount };
}
