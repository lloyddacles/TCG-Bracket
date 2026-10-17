import { useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { parseTable, downloadText } from '../bulk.js';

// Reusable CSV / paste importer.
//  columns: [{ key, label, aliases?, required?, example? }]
//  onSubmit(rows) -> { summary: { errors?, ...counts }, ... }
export default function ImportDialog({ title, help, columns, onSubmit, onClose, onDone }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const parsed = useMemo(() => parseTable(text, columns), [text, columns]);

  const templateCSV = useMemo(() => {
    const header = columns.map((c) => c.label ?? c.key).join(',');
    const sample = columns.map((c) => c.example ?? '').join(',');
    return `${header}\n${sample}\n`;
  }, [columns]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    try {
      setText(await file.text());
    } catch (err) {
      setError(`Could not read file: ${err.message}`);
    }
  };

  const submit = async () => {
    if (!parsed.rows.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await onSubmit(parsed.rows);
      setResult(res?.summary || res || {});
      onDone?.(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const previewCols = columns.slice(0, 6);
  const previewRows = parsed.rows.slice(0, 6);
  const missingRequired = useMemo(() => {
    const required = columns.filter((c) => c.required);
    return parsed.rows.some((r) => required.some((c) => !String(r[c.key] ?? '').trim()));
  }, [parsed.rows, columns]);

  return (
    <Modal title={title || 'Bulk import'} onClose={onClose} wide>
      {result ? (
        <div className="stack">
          <div className="alert alert-success">
            <ImportSummary result={result} />
          </div>
          {Array.isArray(result.errors) && result.errors.length > 0 && (
            <div className="import-errors">
              <strong>{result.errors.length} row(s) skipped</strong>
              <ul>
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    <code>{e.ref}</code> — {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setResult(null);
                setText('');
                setFileName('');
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              Import more
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {help && <p className="muted">{help}</p>}
          {error && <div className="alert alert-error">{error}</div>}

          <div className="import-toolbar">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => downloadText('template.csv', templateCSV)}
            >
              Download template
            </button>
            <label className="btn btn-ghost btn-sm file-btn">
              Choose CSV file
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} hidden />
            </label>
            {fileName && <span className="muted small">{fileName}</span>}
          </div>

          <label className="field">
            <span>Paste CSV rows (first line may be a header)</span>
            <textarea
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={columns.map((c) => c.label ?? c.key).join(',')}
              spellCheck={false}
            />
          </label>

          <div className="import-cols muted small">
            Columns: {columns.map((c) => `${c.label ?? c.key}${c.required ? '*' : ''}`).join(' · ')}
          </div>

          {parsed.rows.length > 0 && (
            <div className="import-preview">
              <div className="spread">
                <strong>{parsed.rows.length} row(s) ready</strong>
                <span className="muted small">{parsed.headerDetected ? 'header detected' : 'no header — using column order'}</span>
              </div>
              <div className="table-wrap">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      {previewCols.map((c) => (
                        <th key={c.key}>{c.label ?? c.key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i}>
                        {previewCols.map((c) => (
                          <td key={c.key}>{r[c.key] || <span className="muted">—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > previewRows.length && (
                <p className="muted small">…and {parsed.rows.length - previewRows.length} more</p>
              )}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !parsed.rows.length || missingRequired}
              onClick={submit}
            >
              {busy ? 'Importing…' : `Import ${parsed.rows.length || ''}`.trim()}
            </button>
          </div>
          {missingRequired && <p className="muted small">Fill required (*) columns in every row before importing.</p>}
        </div>
      )}
    </Modal>
  );
}

function ImportSummary({ result }) {
  const parts = Object.entries(result)
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .map(([k, v]) => `${v} ${k}`);
  return <span>{parts.length ? `Done — ${parts.join(', ')}.` : 'Nothing changed.'}</span>;
}
