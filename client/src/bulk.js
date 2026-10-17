// CSV parsing / serialisation helpers used across the bulk import & export UI.

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Turn raw CSV/paste text into row objects using a column schema.
export function parseTable(text, columns) {
  const raw = parseCSV(text).filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!raw.length) return { rows: [], headerDetected: false };

  const lookup = new Map();
  for (const col of columns) {
    lookup.set(norm(col.label), col.key);
    lookup.set(norm(col.key), col.key);
    for (const alias of col.aliases || []) lookup.set(norm(alias), col.key);
  }

  const firstKeys = raw[0].map((c) => lookup.get(norm(c)));
  const nonEmptyFirst = raw[0].filter((c) => String(c).trim() !== '').length;
  const matched = firstKeys.filter(Boolean).length;
  const headerDetected = matched > 0 && matched >= Math.ceil(nonEmptyFirst / 2);

  const body = headerDetected ? raw.slice(1) : raw;
  const keys = headerDetected ? firstKeys : columns.map((c) => c.key);
  const rows = body
    .map((cells) => {
      const obj = {};
      cells.forEach((cell, i) => {
        const key = keys[i];
        if (key) obj[key] = String(cell).trim();
      });
      return obj;
    })
    .filter((o) => Object.values(o).some((v) => v !== ''));
  return { rows, headerDetected };
}

// Split free text into non-empty trimmed tokens (newlines and/or commas).
export function parseList(text) {
  return String(text ?? '')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  const head = columns.map((c) => csvEscape(c.label ?? c.key)).join(',');
  const body = rows
    .map((r) =>
      columns
        .map((c) => csvEscape(typeof c.value === 'function' ? c.value(r) : r[c.key]))
        .join(',')
    )
    .join('\n');
  return `${head}\n${body}`;
}

export function downloadText(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCSV(filename, rows, columns) {
  downloadText(filename, toCSV(rows, columns));
}
