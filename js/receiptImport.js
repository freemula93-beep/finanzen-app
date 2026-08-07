import { parseDate, parseAmount } from './csvImport.js';
import { loadScript } from './loader.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js';
const AMOUNT_RE = /\d{1,3}(?:[.,]\d{3})*[,.]\d{2}/g;
const TOTAL_KEYWORDS = /(summe|gesamt|total|zu zahlen|betrag)/i;

// Führt OCR auf einem Beleg-Foto aus und rät Händler, Datum und Gesamtbetrag.
// Best-Effort: die Ergebnisse müssen vom Nutzer vor dem Speichern geprüft werden.
export async function extractReceiptData(file) {
  await loadScript(TESSERACT_URL);
  const { data } = await window.Tesseract.recognize(file, 'deu+eng');
  const text = data.text || '';
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const merchant = lines[0] || '';

  let date = null;
  const dateMatch = text.match(/\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}/);
  if (dateMatch) date = parseDate(dateMatch[0]);

  let amount = null;
  const totalLineIdx = lines.findIndex((l) => TOTAL_KEYWORDS.test(l));
  if (totalLineIdx !== -1) {
    const nearby = [lines[totalLineIdx], lines[totalLineIdx + 1] || ''].join(' ');
    const candidates = nearby.match(AMOUNT_RE);
    if (candidates) amount = parseAmount(candidates[candidates.length - 1]);
  }
  if (amount == null) {
    const all = text.match(AMOUNT_RE);
    if (all && all.length) {
      const nums = all.map(parseAmount).filter((n) => !isNaN(n));
      if (nums.length) amount = Math.max(...nums);
    }
  }

  return { merchant, date, amount, rawText: text };
}
