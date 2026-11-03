// Draws voter slips (layout copied from template.jpeg: 2 per row, 6 rows per A4 page, dashed cut lines)
// onto canvases and turns them into a PDF with jsPDF. Text is drawn by the browser, so Hindi joins correctly.
// Copied from slip-extension/slips.js (same drawing); this copy adds the one-slip page and the page-by-page PDF.
const Slips = (() => {
  'use strict';
  const FONT = 'NotoDev';
  const DPI = 150, PAGE_W = Math.round(8.27 * DPI), PAGE_H = Math.round(11.69 * DPI);   // A4
  const MARGIN = 24, GAP = 18, COLS = 2, ROWS = 6, PER_PAGE = COLS * ROWS;
  const PINK = '#e3175c';
  // template.jpeg slip is ~510 × 234 px; all positions below are in those units and scaled to the real slip size
  const T_W = 510, T_H = 234;

  async function loadFonts() {
    await Promise.all(['400', '700'].flatMap((w) => [document.fonts.load(`${w} 20px ${FONT}`, 'नाम मतदाता'), document.fonts.load(`${w} 20px ${FONT}`, 'ABC 123')]));
  }

  function font(ctx, size, weight = 400) { ctx.font = `${weight} ${size}px ${FONT}`; }
  // shrink the font until the text fits maxW
  function fit(ctx, text, size, weight, maxW) {
    let s = size;
    font(ctx, s, weight);
    while (s > 6 && ctx.measureText(text).width > maxW) { s -= 0.5; font(ctx, s, weight); }
    return s;
  }
  function label(ctx, text, x, y, size, weight = 400, align = 'left') { font(ctx, size, weight); ctx.textAlign = align; ctx.fillText(text, x, y); }

  function drawSlip(ctx, x, y, w, h, v, m) {
    const s = Math.min(w / T_W, h / T_H);
    const X = (u) => x + u * s, Y = (u) => y + u * s, S = (u) => u * s;
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, S(1.1)); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#111'; ctx.textBaseline = 'alphabetic';

    // top right: पं.सं. / जि.प. / वार्ड नं. / भाग सं.
    const rx = x + w - S(14);
    label(ctx, `पं.सं. ${m.ps || ''}      जि.प. ${m.zp || ''}`, rx, Y(18), S(12.5), 700, 'right');
    label(ctx, `वार्ड नं. : ${m.ward || ''}      भाग सं. ${m.bhag || ''}`, rx, Y(36), S(12.5), 700, 'right');

    // box number + Voter ID
    const bx = X(10), by = Y(22), bw = S(58), bh = S(31);
    ctx.lineWidth = Math.max(1, S(1.3)); ctx.strokeRect(bx, by, bw, bh);
    ctx.font = `700 ${fit(ctx, String(v.box), S(22), 700, bw - S(8))}px "Times New Roman", Georgia, serif`;
    ctx.textAlign = 'center'; ctx.fillText(String(v.box), bx + bw / 2, by + bh - S(8));
    if (v.epic) {   // keeps clear of the पं.सं./वार्ड lines on the right
      const ex = bx + bw + S(10);
      fit(ctx, v.epic, S(27), 700, X(350) - ex); ctx.textAlign = 'left'; ctx.fillText(v.epic, ex, by + bh - S(5));
    }

    const col2 = X(300);   // right-hand column (मकान संख्या, आयु, लिंग)
    // नाम
    const nameMax = col2 - X(10) - S(8);
    label(ctx, 'नाम: ', X(10), Y(88), S(19), 700);
    const nl = ctx.measureText('नाम: ').width;
    fit(ctx, v.name || '', S(19), 700, nameMax - nl); ctx.fillText(v.name || '', X(10) + nl, Y(88));
    label(ctx, 'मकान संख्या:', col2, Y(90), S(15), 700);
    label(ctx, String(v.house || ''), x + w - S(14), Y(90), S(17), 400, 'right');

    // पिता / पति / माता का नाम
    const relLabel = `${v.relation || 'पिता'} का नाम: `;
    label(ctx, relLabel, X(10), Y(132), S(18), 700);
    const rl = ctx.measureText(relLabel).width;
    fit(ctx, v.relative || '', S(18), 700, nameMax - rl); ctx.fillText(v.relative || '', X(10) + rl, Y(132));
    label(ctx, 'आयु:', col2, Y(134), S(15), 700);
    label(ctx, String(v.age || ''), col2 + S(58), Y(134), S(17), 400, 'center');
    label(ctx, 'लिंग:', col2 + S(110), Y(134), S(15), 700);
    label(ctx, v.gender || '', x + w - S(14), Y(134), S(17), 700, 'right');

    // मतदान केन्द्र
    ctx.lineWidth = Math.max(1, S(1)); ctx.beginPath(); ctx.moveTo(X(26), Y(170)); ctx.lineTo(x + w - S(26), Y(170)); ctx.stroke();
    const kendra = `मतदान केन्द्र : ${m.kendraNo || ''} - ${m.kendraName || ''}`;
    fit(ctx, kendra, S(13.5), 700, w - S(40)); ctx.textAlign = 'center'; ctx.fillText(kendra, x + w / 2, Y(190));

    // मतदान समय (pink bar)
    const barY = Y(200), barH = y + h - barY;
    ctx.fillStyle = PINK; ctx.fillRect(x + 1, barY, w - 2, barH - 1);
    ctx.fillStyle = '#fff';
    const time = `मतदान समय : ${m.time || ''}`;
    fit(ctx, time, S(13.5), 400, w - S(30)); ctx.textAlign = 'center'; ctx.fillText(time, x + w / 2, barY + barH / 2 + S(5));
    ctx.restore();
  }

  function cutLines(ctx, slipW, slipH) {
    ctx.save();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.2; ctx.setLineDash([10, 7]);
    const midX = MARGIN + slipW + GAP / 2;
    ctx.beginPath(); ctx.moveTo(midX, MARGIN / 2); ctx.lineTo(midX, PAGE_H - MARGIN / 2); ctx.stroke();
    for (let r = 1; r < ROWS; r++) {
      const yy = MARGIN + r * slipH + (r - 0.5) * GAP;
      ctx.beginPath(); ctx.moveTo(MARGIN / 2, yy); ctx.lineTo(PAGE_W - MARGIN / 2, yy); ctx.stroke();
    }
    ctx.restore();
  }

  // voters: [{box, epic, name, relation, relative, house, age, gender}], meta: {ps, zp, ward, bhag, kendraNo, kendraName, time}
  const SLIP_W = (PAGE_W - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
  const SLIP_H = (PAGE_H - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS;
  function blankPage() {
    const c = document.createElement('canvas');
    c.width = PAGE_W; c.height = PAGE_H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    return { c, ctx };
  }
  // up to 12 slips on one A4 page, 2 per row, with cut lines
  function page(voters, meta) {
    const { c, ctx } = blankPage();
    cutLines(ctx, SLIP_W, SLIP_H);
    voters.forEach((v, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      drawSlip(ctx, MARGIN + col * (SLIP_W + GAP), MARGIN + row * (SLIP_H + GAP), SLIP_W, SLIP_H, v, meta);
    });
    return c;
  }
  // one slip in the top-left corner of an A4 page, the same size as on a full page, with cut lines beside and below it
  function single(v, meta) {
    const { c, ctx } = blankPage();
    drawSlip(ctx, MARGIN, MARGIN, SLIP_W, SLIP_H, v, meta);
    ctx.save();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.2; ctx.setLineDash([10, 7]);
    const rx = MARGIN + SLIP_W + GAP / 2, by = MARGIN + SLIP_H + GAP / 2;
    ctx.beginPath(); ctx.moveTo(rx, MARGIN / 2); ctx.lineTo(rx, by); ctx.lineTo(MARGIN / 2, by); ctx.stroke();
    ctx.restore();
    return c;
  }

  // A PDF of all the slips, drawn one page at a time so a phone never holds every page image at once.
  // onPage(done, total) reports progress.
  async function savePdf(voters, meta, fileName, onPage) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const total = Math.ceil(voters.length / PER_PAGE);
    for (let p = 0; p < total; p++) {
      const at = p * PER_PAGE;
      const c = page(voters.slice(at, at + PER_PAGE), meta);
      if (p) doc.addPage();
      doc.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      c.width = c.height = 0;   // free the page image
      if (onPage) onPage(p + 1, total);
      await new Promise((r) => setTimeout(r, 0));   // let the screen update between pages
    }
    doc.save(fileName);
  }
  function singlePdf(canvas, fileName) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    doc.save(fileName);
  }

  return { loadFonts, single, savePdf, singlePdf, PER_PAGE };
})();
