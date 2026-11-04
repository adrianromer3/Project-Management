// Turns a report from buildReport() into a PDF, PowerPoint or Excel file.
// The libraries are large, so each loads from the CDN the first time its format is used.

import { settings } from './store.js';
import { fmtMoney, fmtDate, fmtPct, downloadBlob } from './ui.js';

const CDN = 'https://cdn.jsdelivr.net/npm';
const LIBS = {
  pdf: [`${CDN}/pdfmake@0.2.10/build/pdfmake.min.js`, `${CDN}/pdfmake@0.2.10/build/vfs_fonts.js`],
  pptx: [`${CDN}/pptxgenjs@3.12.0/dist/pptxgen.bundle.js`],
  xlsx: [`${CDN}/exceljs@4.4.0/dist/exceljs.min.js`],
};

const loaded = new Map();

function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const el = Object.assign(document.createElement('script'), { src, onload: resolve });
      el.onerror = () => {
        loaded.delete(src);
        el.remove();
        reject(new Error('Could not load the export library. Check your internet connection and try again.'));
      };
      document.head.appendChild(el);
    }));
  }
  return loaded.get(src);
}

// In order, because vfs_fonts.js registers itself on the pdfMake global.
async function loadLibs(format) {
  for (const src of LIBS[format]) await loadScript(src);
}

const BUILDERS = { pdf: buildPdf, pptx: buildPptx, xlsx: buildXlsx };

export async function buildReportFile(format, r) {
  await loadLibs(format);
  return BUILDERS[format](r);
}

export async function exportReport(format, r) {
  const blob = await buildReportFile(format, r);
  downloadBlob(blob, `${String(r.code).replace(/[^\w-]+/g, '_')}-status-report-${r.asOf}.${format}`);
}

const money = (n) => fmtMoney(n);
const daysLeftText = (r) => (r.daysLeft == null ? '—' : String(r.daysLeft));
const scheduleText = (r) => `${fmtDate(r.start)} – ${fmtDate(r.end)}`;

const details = (r) => [
  ['Client / department', r.client],
  ['Project manager', r.manager],
  ['Region', r.region],
  ['Area manager', r.areaManager],
  ['Status', r.status],
  ['Health', r.health],
  ['Schedule', scheduleText(r)],
].filter(([, v]) => v);

const tiles = (r) => [
  ['Progress', fmtPct(r.progress), `${fmtPct(r.elapsed)} of schedule elapsed`],
  ['Tasks done', `${r.done}/${r.total}`, `${r.overdueCount} overdue`],
  ['Spent', fmtMoney(r.spent, { compact: true }), `${fmtPct(r.budgetUsed)} of ${fmtMoney(r.budget, { compact: true })}`],
  ['Days left', daysLeftText(r), r.end ? `ends ${fmtDate(r.end)}` : ''],
];

const budgetRows = (r) => [
  ['Budget', money(r.budget)],
  ['Spent', money(r.spent)],
  [r.remaining < 0 ? 'Over budget' : 'Remaining', money(Math.abs(r.remaining))],
  ['Budget used', fmtPct(r.budgetUsed)],
];

// ---- PDF -------------------------------------------------------------------

function buildPdf(r) {
  const heading = (text) => ({ text, style: 'heading', headlineLevel: 1 });
  // A copy, because pdfmake rewrites the arrays it's given.
  const bullets = (items) => ({ ul: [...items], margin: [0, 0, 0, 4] });
  const table = (headers, rows, widths) => ({
    layout: 'lightHorizontalLines',
    table: { headerRows: 1, widths, body: [headers.map((h) => ({ bold: true, color: '#475569', ...(typeof h === 'string' ? { text: h } : h) })), ...rows] },
  });
  const tasks = (title, rows, none) => [
    heading(title),
    rows.length
      ? table(['Task', 'Assignee', 'Status', 'Due'], rows.map((t) => [t.title, t.assignee || '—', t.status, fmtDate(t.due)]), ['*', 100, 70, 75])
      : { text: none, color: '#64748b' },
  ];
  const notes = (title, items) => (items.length ? [heading(title), bullets(items)] : []);

  const def = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { fontSize: 10, color: '#1e293b' },
    styles: { heading: { fontSize: 12, bold: true, color: '#0f172a', margin: [0, 14, 0, 6] } },
    info: { title: `${r.code} status report ${r.asOf}` },
    // A section heading never sits alone at the bottom of a page.
    pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.length === 0,
    footer: (page, pages) => ({
      margin: [40, 16, 40, 0],
      columns: [{ text: `${r.code} · Status as of ${fmtDate(r.asOf)}`, fontSize: 8, color: '#64748b' }, { text: `Page ${page} of ${pages}`, alignment: 'right', fontSize: 8, color: '#64748b' }],
    }),
    content: [
      { text: 'Project status report', fontSize: 10, color: '#64748b' },
      { text: r.name, fontSize: 20, bold: true, color: '#0f172a', margin: [0, 2, 0, 2] },
      { text: [`${r.code} · Status as of ${fmtDate(r.asOf)} · `, { text: r.health, bold: true, color: r.healthColor }], margin: [0, 0, 0, 10] },
      { layout: 'noBorders', table: { widths: [110, '*'], body: details(r).map(([k, v]) => [{ text: k, color: '#64748b' }, v]) } },
      {
        margin: [0, 12, 0, 0],
        layout: { hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0', paddingTop: () => 6, paddingBottom: () => 6 },
        table: {
          widths: ['*', '*', '*', '*'],
          body: [tiles(r).map(([label, value, sub]) => ({ stack: [{ text: label, fontSize: 8, color: '#64748b' }, { text: value, fontSize: 16, bold: true, color: '#0f172a' }, { text: sub, fontSize: 8, color: '#64748b' }] }))],
        },
      },
      ...(r.summary ? [heading('Summary'), { text: r.summary }] : []),
      ...notes('Accomplishments', r.accomplishments),
      ...notes('Next steps', r.nextSteps),
      ...notes('Risks & issues', r.risks),
      ...(r.milestones.length ? [heading('Milestones'), table(['Milestone', 'Status', 'Due'], r.milestones.map((t) => [t.title, t.status, fmtDate(t.due)]), ['*', 70, 75])] : []),
      ...tasks(`Overdue tasks (${r.overdue.length})`, r.overdue, 'Nothing overdue.'),
      ...tasks(`Due in the next 14 days (${r.upcoming.length})`, r.upcoming, 'Nothing due soon.'),
      {
        unbreakable: true,
        stack: [
          { text: 'Budget', style: 'heading' },
          {
            columnGap: 24,
            columns: [
              { width: '*', layout: 'noBorders', table: { widths: [80, '*'], body: budgetRows(r).map(([k, v]) => [{ text: k, color: '#64748b' }, v]) } },
              r.byCategory.length
                ? { width: '*', ...table(['Category', { text: 'Amount', alignment: 'right' }], r.byCategory.map((c) => [c.label, { text: money(c.amount), alignment: 'right' }]), ['*', 90]) }
                : { width: '*', text: 'No costs recorded yet.', color: '#64748b' },
            ],
          },
        ],
      },
    ],
  };
  return new Promise((resolve) => window.pdfMake.createPdf(def).getBlob(resolve));
}

// ---- PowerPoint ------------------------------------------------------------

const SLIDE_W = 13.33;
const INK = '0F172A';
const MUTED = '64748B';
const LINE = 'E2E8F0';

async function buildPptx(r) {
  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `${r.code} status report ${r.asOf}`;
  pptx.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
  pptx.defineSlideMaster({
    title: 'REPORT',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: SLIDE_W, h: 0.14, fill: { color: INK } } },
      { text: { text: `${r.code} · ${r.name} · Status as of ${fmtDate(r.asOf)}`, options: { x: 0.5, y: 7.05, w: 11, h: 0.3, fontSize: 10, color: MUTED } } },
    ],
    slideNumber: { x: 12.4, y: 7.05, w: 0.5, h: 0.3, fontSize: 10, color: MUTED },
  });
  const slide = (title) => {
    const s = pptx.addSlide({ masterName: 'REPORT' });
    s.addText(title, { x: 0.5, y: 0.35, w: 12.33, h: 0.6, fontSize: 26, bold: true, color: INK });
    return s;
  };
  const header = (text) => ({ text, options: { bold: true, color: 'FFFFFF', fill: { color: INK } } });
  const table = (s, rows, colW, y = 1.15) => s.addTable(rows, {
    x: 0.5, y, w: 12.33, colW, fontSize: 13, color: '1E293B', border: { type: 'solid', pt: 0.5, color: LINE }, valign: 'middle',
    autoPage: true, autoPageRepeatHeader: true, autoPageHeaderRows: 1, newSlideStartY: 0.5, autoPageSlideStartY: 0.5,
  });

  // Title
  const title = pptx.addSlide({ masterName: 'REPORT' });
  title.addText('Project status report', { x: 0.8, y: 2.1, w: 11.7, h: 0.5, fontSize: 18, color: MUTED });
  title.addText(r.name, { x: 0.8, y: 2.6, w: 11.7, h: 1.2, fontSize: 40, bold: true, color: INK });
  title.addText(`${r.code} · Status as of ${fmtDate(r.asOf)}`, { x: 0.8, y: 3.85, w: 11.7, h: 0.4, fontSize: 18, color: MUTED });
  title.addText([r.manager && `Project manager: ${r.manager}`, r.region && `Region: ${r.region}`].filter(Boolean).join(' · ') || ' ', { x: 0.8, y: 4.3, w: 11.7, h: 0.4, fontSize: 16, color: MUTED });

  // Overview
  const overview = slide('Status overview');
  overview.addText(r.health, { shape: pptx.ShapeType.roundRect, rectRadius: 0.08, x: 0.5, y: 1.15, w: 1.8, h: 0.45, fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', fill: { color: r.healthColor.slice(1) } });
  overview.addText(`${r.status} · ${scheduleText(r)}`, { x: 2.45, y: 1.15, w: 10.3, h: 0.45, fontSize: 15, color: MUTED });
  tiles(r).forEach(([label, value, sub], i) => {
    overview.addText([
      { text: label, options: { fontSize: 13, color: MUTED, breakLine: true } },
      { text: value, options: { fontSize: 32, bold: true, color: INK, breakLine: true } },
      { text: sub || ' ', options: { fontSize: 12, color: MUTED } },
    ], { shape: pptx.ShapeType.rect, x: 0.5 + i * 3.11, y: 1.85, w: 3, h: 1.75, margin: 8, valign: 'middle', fill: { color: 'F8FAFC' }, line: { color: LINE, width: 0.75 } });
  });
  const people = details(r).filter(([k]) => k !== 'Status' && k !== 'Health' && k !== 'Schedule');
  if (people.length) {
    overview.addTable(people.map(([k, v]) => [{ text: k, options: { color: MUTED } }, v]), {
      x: 0.5, y: 3.9, w: 12.33, colW: [2.6, 9.73], fontSize: 14, color: '1E293B', border: { type: 'none' },
    });
  }

  // Written notes
  const noteRows = [
    ...(r.summary ? [[header('Summary')], [r.summary]] : []),
    ...[['Accomplishments', r.accomplishments], ['Next steps', r.nextSteps], ['Risks & issues', r.risks]]
      .flatMap(([name, items]) => (items.length ? [[header(name)], ...items.map((i) => [`• ${i}`])] : [])),
  ];
  if (noteRows.length) table(slide('Summary & outlook'), noteRows, [12.33]);

  // Schedule
  if (r.milestones.length) {
    table(slide('Milestones'), [[header('Milestone'), header('Status'), header('Due')], ...r.milestones.map((t) => [t.title, t.status, fmtDate(t.due)])], [8.33, 2, 2]);
  }
  const attention = [...r.overdue.map((t) => ({ ...t, when: 'Overdue' })), ...r.upcoming.map((t) => ({ ...t, when: 'Next 14 days' }))];
  if (attention.length) {
    table(slide('Overdue & due soon'), [[header('Task'), header('Assignee'), header('Status'), header('Due'), header('When')], ...attention.map((t) => [t.title, t.assignee || '—', t.status, fmtDate(t.due), t.when])], [5.13, 2.2, 1.6, 1.7, 1.7]);
  }

  // Budget
  const budget = slide('Budget');
  budget.addTable(budgetRows(r).map(([k, v]) => [{ text: k, options: { color: MUTED } }, { text: v, options: { bold: true, align: 'right' } }]), {
    x: 0.5, y: 1.25, w: 4.4, colW: [2, 2.4], fontSize: 15, color: '1E293B', border: { type: 'solid', pt: 0.5, color: LINE }, rowH: 0.55, valign: 'middle',
  });
  if (r.byCategory.length) {
    budget.addChart(pptx.charts.BAR, [{ name: 'Spent', labels: r.byCategory.map((c) => c.label), values: r.byCategory.map((c) => c.amount) }], {
      x: 5.2, y: 1.15, w: 7.63, h: 5.6, barDir: 'bar', chartColors: ['0EA5E9'], showValue: true, dataLabelFormatCode: '#,##0', dataLabelFontSize: 12, catAxisLabelFontSize: 13, valAxisHidden: true, valGridLine: { style: 'none' }, catAxisOrientation: 'maxMin', showTitle: true, title: 'Spend by category', titleFontSize: 14, showLegend: false,
    });
  } else {
    budget.addText('No costs recorded yet.', { x: 5.2, y: 1.25, w: 7.63, h: 0.5, fontSize: 15, color: MUTED });
  }

  return pptx.write({ outputType: 'blob' });
}

// ---- Excel -----------------------------------------------------------------

// A real date cell. Built in UTC because that's how Excel files store them, so the day
// doesn't shift in time zones ahead of or behind UTC.
function excelDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function moneyFormat() {
  const currency = settings().currency || 'PHP';
  let symbol = currency;
  try {
    symbol = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0).find((x) => x.type === 'currency')?.value || currency;
  } catch { /* unknown currency code: show the code itself */ }
  return `"${symbol}"#,##0.00`;
}

const DATE_FMT = 'mmm d, yyyy';

async function buildXlsx(r) {
  const wb = new window.ExcelJS.Workbook();
  wb.created = new Date();
  const MONEY_FMT = moneyFormat();
  const headerRow = (row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; });
  };

  // Summary sheet: label / value rows, then the written notes.
  const sum = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  sum.columns = [{ width: 24 }, { width: 70 }];
  const pair = (label, value, numFmt) => {
    const row = sum.addRow([label, value]);
    row.getCell(1).font = { color: { argb: 'FF64748B' } };
    row.getCell(2).alignment = { horizontal: 'left', wrapText: true, vertical: 'top' };
    row.getCell(1).alignment = { vertical: 'top' };
    if (numFmt) row.getCell(2).numFmt = numFmt;
  };
  const section = (title) => {
    sum.addRow([]);
    const row = sum.addRow([title]);
    row.font = { bold: true, size: 12 };
  };
  sum.addRow([r.name]).font = { bold: true, size: 16 };
  sum.addRow([`${r.code} · Project status report`]).font = { color: { argb: 'FF64748B' } };
  sum.addRow([]);
  pair('Status as of', excelDate(r.asOf), DATE_FMT);
  details(r).filter(([k]) => k !== 'Schedule').forEach(([k, v]) => pair(k, v));
  pair('Start', excelDate(r.start), DATE_FMT);
  pair('End', excelDate(r.end), DATE_FMT);
  pair('Days left', r.daysLeft);

  section('Progress');
  pair('Progress', r.progress / 100, '0%');
  pair('Schedule elapsed', r.elapsed / 100, '0%');
  pair('Tasks done', `${r.done} of ${r.total}`);
  pair('Overdue tasks', r.overdueCount);

  section('Budget');
  pair('Budget', r.budget, MONEY_FMT);
  pair('Spent', r.spent, MONEY_FMT);
  pair('Remaining', r.remaining, MONEY_FMT);
  pair('Budget used', r.budgetUsed / 100, '0%');
  r.byCategory.forEach((c) => pair(`Spent · ${c.label}`, c.amount, MONEY_FMT));

  if (r.summary) { section('Summary'); pair('', r.summary); }
  [['Accomplishments', r.accomplishments], ['Next steps', r.nextSteps], ['Risks & issues', r.risks]].forEach(([title, items]) => {
    if (!items.length) return;
    section(title);
    items.forEach((i) => pair('', i));
  });

  // Tasks sheet
  const tasks = wb.addWorksheet('Tasks', { views: [{ state: 'frozen', ySplit: 1 }] });
  tasks.columns = [
    { header: 'Task', width: 40 }, { header: 'Assignee', width: 18 }, { header: 'Status', width: 13 }, { header: 'Priority', width: 10 },
    { header: 'Start', width: 14, style: { numFmt: DATE_FMT } }, { header: 'Due', width: 14, style: { numFmt: DATE_FMT } },
    { header: 'Progress', width: 10, style: { numFmt: '0%' } }, { header: 'Milestone', width: 10 },
  ];
  r.tasks.forEach((t) => tasks.addRow([t.title, t.assignee, t.status, t.priority, excelDate(t.start), excelDate(t.due), t.progress / 100, t.milestone ? 'Yes' : '']));
  headerRow(tasks.getRow(1));
  tasks.autoFilter = { from: 'A1', to: 'H1' };

  // Costs sheet
  const costs = wb.addWorksheet('Costs', { views: [{ state: 'frozen', ySplit: 1 }] });
  costs.columns = [
    { header: 'Date', width: 14, style: { numFmt: DATE_FMT } }, { header: 'Category', width: 14 }, { header: 'Description', width: 44 },
    { header: 'Amount', width: 18, style: { numFmt: MONEY_FMT } },
  ];
  r.costs.forEach((c) => costs.addRow([excelDate(c.date), c.category, c.description, c.amount]));
  headerRow(costs.getRow(1));
  costs.autoFilter = { from: 'A1', to: 'D1' };
  if (r.costs.length) {
    const total = costs.addRow(['', '', 'Total', { formula: `SUM(D2:D${r.costs.length + 1})`, result: r.spent }]);
    total.font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
