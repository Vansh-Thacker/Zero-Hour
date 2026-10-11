// A tiny PDF writer, so a player can download their debrief without any library.
// It lays out plain text blocks (headings, paragraphs, bullet points) on A4 pages in the
// built-in Helvetica fonts, wraps long lines and adds page numbers. Pure: makePdf() returns
// the file's bytes, so it is tested in Node; downloadPdf() is the only part that needs a browser.

const PAGE = {width: 595, height: 842, margin: 50};   // A4 in points
const BAND = 64;                                     // the green title band on page 1

// How each kind of block looks: font size, bold, colour (r g b), left indent, space above.
const STYLE = {
  title: {size: 22, bold: true, color: '1 1 1', indent: 0, before: 0},
  sub: {size: 10, bold: false, color: '0.85 0.95 0.88', indent: 0, before: 4},
  h2: {size: 15, bold: true, color: '0 0.45 0.2', indent: 0, before: 18},
  h3: {size: 12, bold: true, color: '0.1 0.1 0.1', indent: 0, before: 12},
  p: {size: 10.5, bold: false, color: '0.15 0.15 0.15', indent: 0, before: 5},
  li: {size: 10.5, bold: false, color: '0.15 0.15 0.15', indent: 14, before: 3},
  good: {size: 10.5, bold: true, color: '0 0.5 0.22', indent: 14, before: 3},
  bad: {size: 10.5, bold: true, color: '0.72 0.33 0', indent: 14, before: 3},
  q: {size: 10.5, bold: true, color: '0.1 0.1 0.1', indent: 0, before: 9},
  small: {size: 9, bold: false, color: '0.4 0.4 0.4', indent: 14, before: 2},
};

// Helvetica character widths (thousandths of the font size) for the printable ASCII characters.
const WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667,
  722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
  667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556,
  222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584];

// Characters the built-in fonts can show (Windows-1252). Anything else, like emoji, is left out.
const WIN_ANSI = {'€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '✓': null, '✗': null, '✖': null};

/** Text the PDF fonts can draw: one character code (0-255) per character. */
export function pdfText(text) {
  let out = '';
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (ch in WIN_ANSI) { if (WIN_ANSI[ch] !== null) out += String.fromCharCode(WIN_ANSI[ch]); }
    else if (code === 0x09 || code === 0x0A) out += ' ';
    else if ((code >= 0x20 && code < 0x7F) || (code >= 0xA0 && code <= 0xFF)) out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function widthOf(text, size, bold) {
  let units = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? WIDTHS[code - 32] : 556;
  }
  return units * size / 1000 * (bold ? 1.06 : 1);
}

function wrap(text, size, bold, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const tryLine = line ? `${line} ${word}` : word;
    if (!line || widthOf(tryLine, size, bold) <= maxWidth) line = tryLine;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

const escape = text => text.replace(/[\\()]/g, ch => `\\${ch}`);

/**
 * blocks: [{kind, text}], kind one of the STYLE names. 'title' and 'sub' go in the band on page 1.
 * Returns the PDF file as a Uint8Array.
 */
export function makePdf(blocks, {title = 'Debrief', footer = ''} = {}) {
  const pages = [[]];
  const bottom = PAGE.margin + 20;
  let y = PAGE.height - 12;

  for (const block of blocks) {
    const style = STYLE[block.kind] ?? STYLE.p;
    const text = pdfText(block.text);
    if (!text) continue;
    const inBand = block.kind === 'title' || block.kind === 'sub';
    if (!inBand && y > PAGE.height - BAND - 10 && pages.length === 1) y = PAGE.height - BAND - 16;
    const bullet = block.kind === 'li' || block.kind === 'good' || block.kind === 'bad';
    const x = PAGE.margin + style.indent + (bullet ? 10 : 0);
    const lines = wrap(text, style.size, style.bold, PAGE.width - PAGE.margin - x);
    const lineHeight = style.size * 1.35;
    y -= style.before;
    // Keep a heading with at least two lines of what follows it.
    const needed = lineHeight * (block.kind.startsWith('h') ? lines.length + 2 : 1);
    if (!inBand && y - needed < bottom) { pages.push([]); y = PAGE.height - PAGE.margin; }
    lines.forEach((line, i) => {
      y -= lineHeight;
      if (!inBand && y < bottom) { pages.push([]); y = PAGE.height - PAGE.margin - lineHeight; }
      const font = style.bold ? 'F2' : 'F1';
      const ops = pages[pages.length - 1];
      if (bullet && i === 0) ops.push(`BT /F1 ${style.size} Tf ${style.color} rg ${x - 10} ${y.toFixed(1)} Td (${String.fromCharCode(0x95)}) Tj ET`);
      ops.push(`BT /${font} ${style.size} Tf ${style.color} rg ${x} ${y.toFixed(1)} Td (${escape(line)}) Tj ET`);
    });
  }

  // Page 1 gets the green band behind the title; every page gets a footer with its number.
  const streams = pages.map((ops, i) => {
    const band = i === 0 ? [`0 0.25 0.165 rg 0 ${PAGE.height - BAND - 6} ${PAGE.width} ${BAND + 6} re f`] : [];
    const foot = pdfText(`${footer ? `${footer}  ·  ` : ''}page ${i + 1} of ${pages.length}`);
    const footOps = [`0.8 0.8 0.8 RG 0.5 w ${PAGE.margin} ${PAGE.margin} m ${PAGE.width - PAGE.margin} ${PAGE.margin} l S`,
      `BT /F1 8 Tf 0.45 0.45 0.45 rg ${PAGE.margin} ${PAGE.margin - 14} Td (${escape(foot)}) Tj ET`];
    return [...band, ...ops, ...footOps].join('\n');
  });

  // Objects: 1 catalog, 2 page list, 3 and 4 fonts, 5 document info, then each page and its content.
  const objects = [];
  const pageIds = streams.map((_, i) => 6 + 2 * i);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[5] = `<< /Title (${escape(pdfText(title))}) /Producer (Zero Hour) >>`;
  streams.forEach((stream, i) => {
    objects[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  // Every character is one byte, so string lengths are byte offsets.
  let file = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = file.length;
    file += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = file.length;
  file += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) file += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  file += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i);
  return bytes;
}

/** Browser only: save the bytes as a .pdf file on this device. */
export function downloadPdf(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  const link = Object.assign(document.createElement('a'), {href: url, download: fileName});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
