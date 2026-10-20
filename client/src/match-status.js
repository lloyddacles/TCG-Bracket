// Shared match status vocabulary for the bracket, rounds list and detail panel.
export function matchPhase(match) {
  if (!match) return { key: 'upcoming', label: 'Upcoming' };
  if (Number(match.is_bye) || Number(match.player1_is_bye) || Number(match.player2_is_bye)) {
    return { key: 'bye', label: 'Bye' };
  }
  if (match.status === 'disputed') return { key: 'disputed', label: 'Disputed' };
  if (match.status === 'approved') {
    if (match.is_draw) return { key: 'completed', label: 'Draw' };
    return { key: 'completed', label: 'Completed' };
  }
  if (match.status === 'reported') return { key: 'in_progress', label: 'Awaiting approval' };
  if (match.status === 'waiting') return { key: 'upcoming', label: 'Reset pending' };
  if (match.status === 'void') return { key: 'void', label: 'Cancelled' };
  if (match.player1_id == null || match.player2_id == null) {
    return { key: 'upcoming', label: 'Awaiting players' };
  }
  return { key: 'upcoming', label: 'Upcoming' };
}

export function isPlayable(match) {
  return Boolean(
    match &&
      match.player1_id != null &&
      match.player2_id != null &&
      !Number(match.player1_is_bye) &&
      !Number(match.player2_is_bye)
  );
}

export function playerName(playersMap, id) {
  if (id == null) return 'TBD';
  const p = playersMap instanceof Map ? playersMap.get(id) : null;
  return p?.name || p?.display_name || p?.user_name || `Player ${id}`;
}

export function deckLabel(player) {
  if (!player) return null;
  return player.deck || player.profile_deck_name || player.deck_featured || null;
}
