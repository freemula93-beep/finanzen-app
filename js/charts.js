function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

const GRID_COLOR = 'rgba(148,163,184,0.2)';
const TEXT_COLOR = '#94a3b8';

export function drawBarChart(canvas, labels, incomeData, expenseData) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const padLeft = 44, padBottom = 26, padTop = 12, padRight = 8;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const maxVal = Math.max(1, ...incomeData, ...expenseData);
  const niceMax = niceCeiling(maxVal);

  ctx.strokeStyle = GRID_COLOR;
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '11px system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padTop + chartH - (chartH * i) / steps;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    const val = (niceMax * i) / steps;
    ctx.fillText(formatShort(val), padLeft - 6, y);
  }

  const n = labels.length;
  const groupW = chartW / n;
  const barW = Math.min(18, groupW * 0.32);

  for (let i = 0; i < n; i++) {
    const cx = padLeft + groupW * i + groupW / 2;
    const incH = (incomeData[i] / niceMax) * chartH;
    const expH = (expenseData[i] / niceMax) * chartH;

    ctx.fillStyle = '#22d3ee';
    roundRect(ctx, cx - barW - 2, padTop + chartH - incH, barW, incH, 3);
    ctx.fill();

    ctx.fillStyle = '#f87171';
    roundRect(ctx, cx + 2, padTop + chartH - expH, barW, expH, 3);
    ctx.fill();

    ctx.fillStyle = TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '10px system-ui';
    ctx.fillText(labels[i], cx, padTop + chartH + 6);
  }
}

export function drawDonutChart(canvas, entries) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const total = entries.reduce((s, e) => s + e.value, 0);
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) / 2 - 4;
  const innerRadius = radius * 0.6;

  if (total <= 0) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = radius - innerRadius;
    ctx.beginPath();
    ctx.arc(cx, cy, (radius + innerRadius) / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '12px system-ui';
    ctx.fillText('Keine Daten', cx, cy);
    return;
  }

  let start = -Math.PI / 2;
  for (const e of entries) {
    const slice = (e.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.fillStyle = e.color;
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + slice);
    ctx.closePath();
    ctx.fill();
    start += slice;
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px system-ui';
  ctx.fillText(formatShort(total), cx, cy - 6);
  ctx.font = '10px system-ui';
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText('Ausgaben', cx, cy + 12);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function niceCeiling(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const norm = v / base;
  let nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function formatShort(v) {
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(v).toString();
}
