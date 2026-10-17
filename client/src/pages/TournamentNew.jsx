import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';

const FORMATS = [
  { value: 'swiss', label: 'Swiss', hint: 'Everyone plays every round; standings with tiebreakers.' },
  { value: 'single_elim', label: 'Single Elimination', hint: 'Lose once and you are out.' },
  { value: 'double_elim', label: 'Double Elimination', hint: 'Winners and losers brackets with a grand final reset.' },
  { value: 'round_robin', label: 'Round Robin', hint: 'Everyone plays everyone once.' },
];

const emptyForm = {
  name: '',
  gameId: '',
  format: 'swiss',
  bestOf: 3,
  allowDraws: false,
  timeRule: 'sudden_death',
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  roundsOverride: '',
  maxPlayers: '',
  description: '',
};

export default function TournamentNew() {
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getGames()
      .then((data) => {
        setGames(data.games);
        if (data.games[0]) {
          const g = data.games[0];
          setForm((f) => ({
            ...f,
            gameId: g.id,
            bestOf: g.default_best_of,
            timeRule: g.default_time_rule,
            allowDraws: !!g.default_allow_draws,
          }));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const upd = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const onGameChange = (e) => {
    const g = games.find((x) => String(x.id) === e.target.value);
    setForm((f) => ({
      ...f,
      gameId: e.target.value,
      bestOf: g ? g.default_best_of : f.bestOf,
      timeRule: g ? g.default_time_rule : f.timeRule,
      allowDraws: g ? !!g.default_allow_draws : f.allowDraws,
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        ...form,
        gameId: Number(form.gameId),
        bestOf: Number(form.bestOf),
        pointsWin: Number(form.pointsWin),
        pointsDraw: Number(form.pointsDraw),
        pointsLoss: Number(form.pointsLoss),
        roundsOverride: form.roundsOverride ? Number(form.roundsOverride) : null,
        maxPlayers: form.maxPlayers ? Number(form.maxPlayers) : null,
      };
      const data = await api.createTournament(payload);
      navigate(`/tournaments/${data.tournament.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (loading) return <Spinner full />;

  const selectedFormat = FORMATS.find((f) => f.value === form.format);

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>New tournament</h1>
      </div>
      <form className="card stack" onSubmit={onSubmit}>
        {error && <div className="alert alert-error">{error}</div>}

        <label className="field">
          <span>Tournament name</span>
          <input value={form.name} onChange={upd('name')} placeholder="Saturday Night Vanguard" required autoFocus />
        </label>

        <div className="grid-2">
          <label className="field">
            <span>Game</span>
            <select value={form.gameId} onChange={onGameChange} required>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Format</span>
            <select value={form.format} onChange={upd('format')}>
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedFormat && <p className="muted small field-hint">{selectedFormat.hint}</p>}

        <div className="grid-3">
          <label className="field">
            <span>Match length</span>
            <select value={form.bestOf} onChange={upd('bestOf')}>
              <option value={1}>Best of 1</option>
              <option value={3}>Best of 3</option>
              <option value={5}>Best of 5</option>
            </select>
          </label>
          <label className="field">
            <span>Time rule</span>
            <select value={form.timeRule} onChange={upd('timeRule')}>
              <option value="sudden_death">Sudden death</option>
              <option value="extra_turns">Extra turns</option>
              <option value="draw">Draw</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="field">
            <span>Max players</span>
            <input
              type="number"
              min={2}
              value={form.maxPlayers}
              onChange={upd('maxPlayers')}
              placeholder="No limit"
            />
          </label>
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={form.allowDraws} onChange={upd('allowDraws')} />
          <span>Allow draws (Swiss / Round Robin only)</span>
        </label>

        <fieldset className="fieldset">
          <legend>Match points</legend>
          <div className="grid-3">
            <label className="field">
              <span>Win</span>
              <input type="number" min={0} value={form.pointsWin} onChange={upd('pointsWin')} />
            </label>
            <label className="field">
              <span>Draw</span>
              <input type="number" min={0} value={form.pointsDraw} onChange={upd('pointsDraw')} />
            </label>
            <label className="field">
              <span>Loss</span>
              <input type="number" min={0} value={form.pointsLoss} onChange={upd('pointsLoss')} />
            </label>
          </div>
        </fieldset>

        {form.format === 'swiss' && (
          <label className="field">
            <span>Number of Swiss rounds</span>
            <input
              type="number"
              min={1}
              max={30}
              value={form.roundsOverride}
              onChange={upd('roundsOverride')}
              placeholder="Default: ceil(log2(players))"
            />
          </label>
        )}

        <label className="field">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={upd('description')} placeholder="Optional details for players" />
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create tournament'}
          </button>
        </div>
      </form>
    </div>
  );
}
