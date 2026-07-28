export interface CsvColumn<T> {
  key: keyof T;
  label: string;
  format?: (value: T[keyof T], item: T) => string;
}

function escapeCsvValue(value: unknown, delimiter: string): string {
  const str = value == null ? '' : String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv<T>(
  data: T[],
  columns: CsvColumn<T>[],
  filename: string,
  opts: { delimiter?: string } = {},
) {
  const delimiter = opts.delimiter ?? ',';
  const header = columns.map((c) => escapeCsvValue(c.label, delimiter)).join(delimiter);
  const rows = data.map((item) =>
    columns
      .map((col) => {
        const raw = item[col.key];
        const value = col.format ? col.format(raw, item) : raw;
        return escapeCsvValue(value, delimiter);
      })
      .join(delimiter),
  );

  const bom = '\uFEFF';
  const csv = [bom + header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}