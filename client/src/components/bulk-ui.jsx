import { useCallback, useState } from 'react';

// Selection state for a list of rows. Returns helpers + a toggle-all binder.
export function useSelection(getId = (row) => row.id) {
  const [selected, setSelected] = useState(() => new Set());

  const isSelected = useCallback((row) => selected.has(getId(row)), [selected, getId]);

  const toggle = useCallback(
    (row) => {
      const id = getId(row);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [getId]
  );

  const setAll = useCallback(
    (rows, on) => {
      setSelected(on ? new Set(rows.map(getId)) : new Set());
    },
    [getId]
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selectedIds: [...selected],
    count: selected.size,
    isSelected,
    toggle,
    setAll,
    clear,
    setSelected,
  };
}

export function SelectAllBox({ rows, selection, label = 'Select all' }) {
  const allOn = rows.length > 0 && rows.every((r) => selection.isSelected(r));
  const someOn = !allOn && rows.some((r) => selection.isSelected(r));
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={allOn}
      ref={(el) => {
        if (el) el.indeterminate = someOn;
      }}
      onChange={() => selection.setAll(rows, !allOn)}
    />
  );
}

export function RowCheck({ row, selection }) {
  return (
    <input
      type="checkbox"
      checked={selection.isSelected(row)}
      onChange={() => selection.toggle(row)}
      aria-label="Select row"
    />
  );
}

export default function BulkBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div className="bulk-bar">
      <strong>{count} selected</strong>
      <div className="bulk-actions">{children}</div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
