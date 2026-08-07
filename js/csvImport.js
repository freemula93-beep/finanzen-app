// Generischer CSV-Parser für Kontoauszüge unterschiedlicher Banken (kein Bank-spezifisches Format nötig).

function detectDelimiter(sampleLine) {
  const candidates = [';', ',', '\t'];
  let best = ';';
  let bestCount = -1;
  for (const c of candidates) {
    const count = sampleLine.split(c).length;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

// Einfacher RFC4180-artiger CSV-Zeilen-Parser (unterstützt Anführungszeichen, escaped quotes, eingebettete Zeilenumbrüche)
function parseCsvText(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\r') {
        // ignore, \n handles the newline
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export function parseCsv(text) {
  const cleaned = text.replace(/^﻿/, ''); // BOM entfernen
  const firstLine = cleaned.split(/\r?\n/).find((l) => l.trim() !== '') || '';
  const delimiter = detectDelimiter(firstLine);
  const rows = parseCsvText(cleaned, delimiter);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows, delimiter };
}

// Deutsches ("1.234,56") und englisches ("1,234.56" / "1234.56") Zahlenformat erkennen
export function parseAmount(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/[€\s]/g, '');
  if (s === '') return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return n;
}

// Verschiedene Datumsformate erkennen (DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY, DD.MM.YY)
export function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    let year = m[3];
    if (year.length === 2) year = (parseInt(year, 10) < 50 ? '20' : '19') + year;
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let year = m[3];
    if (year.length === 2) year = (parseInt(year, 10) < 50 ? '20' : '19') + year;
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// Simple hash für Duplikaterkennung (Datum+Betrag+Beschreibung)
export function rowHash(date, amount, description) {
  const s = `${date}|${amount}|${description}`;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

// Versucht, Spalten anhand typischer Header-Namen automatisch zuzuordnen
export function guessMapping(headers) {
  const lower = headers.map((h) => h.toLowerCase());
  const find = (...needles) => {
    for (const n of needles) {
      const idx = lower.findIndex((h) => h.includes(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  return {
    date: find('buchungstag', 'buchungsdatum', 'datum', 'date', 'valuta'),
    description: find('verwendungszweck', 'buchungstext', 'beschreibung', 'description', 'text', 'empfänger', 'zahlungsempfänger', 'auftraggeber'),
    amount: find('betrag', 'amount', 'umsatz'),
    debit: find('soll'),
    credit: find('haben'),
  };
}
