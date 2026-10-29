import type { Request, Response } from 'express';
import { asc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from './db/client';
import { categories, resourceCategories, resources, type Resource } from './db/schema';
import { adminWhere, categoriesFor, countiesFor, tagsFor } from './queries';

/**
 * Downloads for the admin portal:
 *  - CSV: every field, one row per listing, honoring the admin table's current filters.
 *  - XLSX: the live directory in the original Google Sheet's layout (one tab per category,
 *    same title row and 12 columns), so it can be imported over her sheet with
 *    File → Import → Upload → "Replace spreadsheet".
 */

/** How a listing's service area maps onto the sheet's county column and row colors. */
type AreaKind = 'placer' | 'sacramento' | 'both' | 'other';

function sheetArea(statewide: boolean, countyNames: string[]): { label: string; kind: AreaKind } {
  if (statewide) return { label: 'Statewide', kind: 'other' };
  const set = new Set(countyNames);
  if (set.size === 2 && set.has('Placer') && set.has('Sacramento')) return { label: 'Both Counties', kind: 'both' };
  if (set.size === 1 && set.has('Placer')) return { label: 'Placer County', kind: 'placer' };
  if (set.size === 1 && set.has('Sacramento')) return { label: 'Sacramento County', kind: 'sacramento' };
  if (countyNames.length === 1) return { label: `${countyNames[0]} County`, kind: 'other' };
  return { label: `${countyNames.join(', ')} Counties`, kind: 'other' };
}

const SHEET_STATUS: Record<Resource['verificationStatus'], string> = {
  verified: 'Verified',
  needs_verification: 'Needs Verification',
};

/** The original sheet's columns, in order. */
const SHEET_HEADER = [
  'County',
  'Organization Name',
  'Website',
  'Phone Number',
  'Mission Statement',
  'Services',
  'Tags',
  'Contact Person',
  'Contact Phone',
  'Contact Email',
  'Verification Status',
  'Notes',
];


const today = () => new Date().toISOString().slice(0, 10);
const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

/** The importer moved the leading address out of Notes; put it back for the sheet layout. */
function sheetNotes(r: Resource): string {
  if (!r.address || r.notes?.includes(r.address)) return r.notes ?? '';
  return r.notes ? `${r.address}. ${r.notes}` : r.address;
}

/**
 * Quotes a CSV field. Values that start with a formula character get a leading apostrophe
 * so spreadsheet apps treat them as text, not formulas (CSV injection).
 */
function csvField(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportCsv(req: Request, res: Response): Promise<void> {
  const rows = await db
    .select()
    .from(resources)
    .where(adminWhere(req.query as Record<string, unknown>))
    .orderBy(asc(resources.name), asc(resources.id));
  const ids = rows.map((r) => r.id);
  const [cats, tagMap, areas] = await Promise.all([categoriesFor(ids), tagsFor(ids), countiesFor(ids)]);

  const header = [
    'ID',
    'EIN',
    'Organization Name',
    'Categories',
    'Service Area',
    'Website',
    'Phone Number',
    'Address',
    'Mission Statement',
    'Services',
    'Notes',
    'Tags',
    'Contact Person',
    'Contact Phone',
    'Contact Email',
    'Verification Status',
    'Last Verified',
    'Possible Duplicate Group',
    'Status',
    'Last Edited',
    'Last Edited By',
  ];
  const lines = [header.map(csvField).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.ein,
        r.name,
        (cats.get(r.id) ?? []).map((c) => c.name).join('; '),
        r.statewide ? 'Statewide' : (areas.get(r.id) ?? []).map((c) => c.name).join('; '),
        r.website,
        r.phone,
        r.address,
        r.mission,
        r.services,
        r.notes,
        (tagMap.get(r.id) ?? []).join(', '),
        r.contactPerson,
        r.contactPhone,
        r.contactEmail,
        SHEET_STATUS[r.verificationStatus],
        dateOnly(r.verifiedAt),
        r.duplicateGroup,
        r.isActive ? 'Live' : 'Archived',
        dateOnly(r.updatedAt),
        r.updatedBy,
      ]
        .map(csvField)
        .join(','),
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cares-directory-${today()}.csv"`);
  // BOM so Excel opens accented characters correctly; Google Sheets ignores it.
  res.send('﻿' + lines.join('\r\n') + '\r\n');
}

// ---------- Workbook styling, copied from the original Google Sheet ----------

const BLACK_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};
const fill = (rgb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rgb}` } });

const TITLE_FILL = fill('1F3864');
const HEADER_FILL = fill('2E75B6');
/** Row colors from the sheet's Legend tab. */
const COUNTY_FILL: Record<AreaKind, ExcelJS.Fill> = {
  placer: fill('E2EFDA'),
  sacramento: fill('FFF2CC'),
  both: fill('F4E2FF'),
  other: fill('DDEBF7'),
};
const FONT = 'Arial';

/** Google Sheets pixel widths → Excel character widths. */
const px = (pixels: number) => Math.round((pixels / 7) * 10) / 10;
const CATEGORY_COLUMN_PX = [104, 251, 307, 167, 405, 489, 433, 209, 167, 279, 104, 363];
const INDEX_COLUMN_PX = [293, 69, 62, 83, 62, 111, 237];

/**
 * Excel tab names: max 31 chars, unique, and none of \ / ? * [ ] :. A "/" (as in
 * "Domestic Violence / IPV") becomes the look-alike division slash "∕" so the tab reads the same.
 */
function tabName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/\//g, '∕')
      .replace(/[\\?*[\]:]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 28)} ${i}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Navy merged title bar across the first row. */
function addTitle(sheet: ExcelJS.Worksheet, text: string, columns: number): void {
  const row = sheet.addRow([text]);
  sheet.mergeCells(1, 1, 1, columns);
  const cell = row.getCell(1);
  cell.font = { name: FONT, bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  cell.fill = TITLE_FILL;
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = { bottom: BLACK_BORDER.bottom };
  row.height = 22;
}

function addHeader(sheet: ExcelJS.Worksheet, labels: string[], horizontal: 'left' | 'center'): void {
  const row = sheet.addRow(labels);
  row.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.border = BLACK_BORDER;
    cell.alignment = { horizontal, vertical: 'middle', wrapText: horizontal === 'center' };
  });
}

export async function exportWorkbook(res: Response): Promise<void> {
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  const links = await db
    .select({ categoryId: resourceCategories.categoryId, resource: resources })
    .from(resourceCategories)
    .innerJoin(resources, eq(resources.id, resourceCategories.resourceId))
    .where(eq(resources.isActive, true))
    .orderBy(asc(resources.name));
  const liveIds = [...new Set(links.map((l) => l.resource.id))];
  const [tagMap, areaMap] = await Promise.all([tagsFor(liveIds), countiesFor(liveIds)]);
  const areaOf = (r: Resource) => sheetArea(r.statewide, (areaMap.get(r.id) ?? []).map((c) => c.name));
  // Her sheet only ever had Placer / Sacramento / Both; add an "Other" column once listings go wider.
  const anyOther = links.some((l) => areaOf(l.resource).kind === 'other');

  const byCategory = new Map<number, Resource[]>();
  for (const { categoryId, resource } of links) byCategory.set(categoryId, [...(byCategory.get(categoryId) ?? []), resource]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CARES Connects admin';
  wb.created = new Date();
  const used = new Set<string>();

  // "New Tabs Index" first, like the original. Rows are filled in after the tabs are named.
  const index = wb.addWorksheet(tabName('New Tabs Index', used));
  const indexHeader = ['Category', 'Entries', 'Placer', 'Sacramento', 'Both', ...(anyOther ? ['Other'] : []), 'Needs Verification', 'Tab'];
  addTitle(index, 'CARES Connects — New Category Tabs (import into master database)', indexHeader.length);
  addHeader(index, indexHeader, 'left');
  index.columns = (anyOther ? [...INDEX_COLUMN_PX.slice(0, 5), 70, ...INDEX_COLUMN_PX.slice(5)] : INDEX_COLUMN_PX).map((w) => ({
    width: px(w),
  }));

  const totals = new Array(anyOther ? 6 : 5).fill(0);
  for (const cat of cats) {
    const list = byCategory.get(cat.id) ?? [];
    const name = tabName(cat.name, used);
    const sheet = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] });
    sheet.columns = CATEGORY_COLUMN_PX.map((w) => ({ width: px(w) }));
    addTitle(sheet, `CARES Connects — ${cat.name} Resources Database (Placer & Sacramento Counties)`, SHEET_HEADER.length);
    addHeader(sheet, SHEET_HEADER, 'center');

    for (const r of list) {
      const area = areaOf(r);
      const row = sheet.addRow([
        area.label,
        r.name,
        r.website ? { text: r.website, hyperlink: r.website } : '',
        r.phone ?? '',
        r.mission ?? '',
        r.services ?? '',
        (tagMap.get(r.id) ?? []).join(', '),
        r.contactPerson ?? '',
        r.contactPhone ?? '',
        r.contactEmail ?? '',
        SHEET_STATUS[r.verificationStatus],
        sheetNotes(r),
      ]);
      for (let c = 1; c <= SHEET_HEADER.length; c++) {
        const cell = row.getCell(c);
        cell.fill = COUNTY_FILL[area.kind];
        cell.border = BLACK_BORDER;
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        cell.font =
          c === 3 && r.website
            ? { name: FONT, size: 9, color: { argb: 'FF0000FF' }, underline: true }
            : { name: FONT, size: 9, color: { argb: 'FF000000' } };
      }
    }

    const counts = [
      list.length,
      list.filter((r) => areaOf(r).kind === 'placer').length,
      list.filter((r) => areaOf(r).kind === 'sacramento').length,
      list.filter((r) => areaOf(r).kind === 'both').length,
      ...(anyOther ? [list.filter((r) => areaOf(r).kind === 'other').length] : []),
      list.filter((r) => r.verificationStatus === 'needs_verification').length,
    ];
    counts.forEach((n, i) => (totals[i] += n));

    const indexRow = index.addRow([
      cat.name,
      ...counts,
      { text: name, hyperlink: `#'${name.replace(/'/g, "''")}'!A1` },
    ]);
    const tabCol = indexHeader.length;
    indexRow.eachCell((cell, col) => {
      cell.border = BLACK_BORDER;
      cell.font =
        col === tabCol
          ? { name: FONT, size: 10, color: { argb: 'FF0563C1' }, underline: true }
          : { name: FONT, size: 10, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: col >= 2 && col < tabCol ? 'right' : 'left' };
    });
  }
  const totalRow = index.addRow(['TOTAL', ...totals]);
  totalRow.eachCell((cell, col) => {
    cell.font = { name: FONT, size: 10, bold: true };
    cell.alignment = { horizontal: col === 1 ? 'left' : 'right' };
  });

  // Legend last, with the same county colors as the rows.
  const legend = wb.addWorksheet(tabName('Legend', used));
  legend.columns = [{ width: px(153) }, { width: px(419) }];
  legend.addRow(['Legend']).getCell(1).font = { name: FONT, bold: true, size: 12 };
  const legendRows: [AreaKind, string, string][] = [
    ['placer', 'Placer County', 'Resources serving Placer County'],
    ['sacramento', 'Sacramento County', 'Resources serving Sacramento County'],
    ['both', 'Both Counties', 'Resources serving both Placer and Sacramento Counties'],
    ...(anyOther ? [['other', 'Other / Statewide', 'Resources serving other California counties or the whole state'] as [AreaKind, string, string]] : []),
  ];
  for (const [county, label, text] of legendRows) {
    const row = legend.addRow([label, text]);
    row.getCell(1).fill = COUNTY_FILL[county];
    row.getCell(1).font = { name: FONT, bold: true, size: 10 };
    row.getCell(2).font = { name: FONT, size: 10 };
    row.eachCell((cell) => (cell.border = BLACK_BORDER));
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cares-directory-google-sheets-${today()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}
