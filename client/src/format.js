export const FORMAT_LABELS = {
  swiss: 'Swiss',
  single_elim: 'Single Elimination',
  double_elim: 'Double Elimination',
  round_robin: 'Round Robin',
};

export const STATUS_LABELS = {
  draft: 'Draft',
  registration: 'Registration Open',
  active: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TIME_RULE_LABELS = {
  sudden_death: 'Sudden death',
  extra_turns: 'Extra turns',
  draw: 'Draw',
  none: 'None',
};

export function statusClass(status) {
  return `status status-${status || 'draft'}`;
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
