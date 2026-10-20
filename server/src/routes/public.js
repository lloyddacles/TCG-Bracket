import { Router } from 'express';
import { getPublicBundle } from '../services/tournaments.js';

const router = Router();

router.get('/:slug', async (req, res) => {
  const bundle = await getPublicBundle(req.params.slug);
  if (!bundle) return res.status(404).json({ error: 'Tournament not found or not public' });
  // Public view omits internal audit fields.
  const bundlePublic = {
    tournament: bundle.tournament,
    game: bundle.game,
    players: bundle.players.map((p) => ({
      id: p.id,
      name: p.name,
      deck: p.deck,
      seed: p.seed,
      dropped: p.dropped,
      eliminated: p.eliminated,
      card_theme: p.card_theme,
      card_title: p.card_title,
      avatar: p.avatar,
      deck_featured: p.deck_featured,
      deck_nation: p.deck_nation,
      deck_playstyle: p.deck_playstyle,
      deck_art: p.deck_art,
      deck_status: p.deck_status,
      profile_deck_name: p.profile_deck_name,
      profile_deck_list: p.profile_deck_list,
    })),
    matches: bundle.matches.map((m) => ({
      id: m.id,
      round: m.round,
      bracket: m.bracket,
      match_index: m.match_index,
      slot_key: m.slot_key,
      label: m.label,
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      player1_is_bye: m.player1_is_bye,
      player2_is_bye: m.player2_is_bye,
      score1: m.score1,
      score2: m.score2,
      winner_id: m.winner_id,
      is_draw: m.is_draw,
      is_bye: m.is_bye,
      status: m.status,
      winner_to_match: m.winner_to_match,
      winner_to_slot: m.winner_to_slot,
      loser_to_match: m.loser_to_match,
      loser_to_slot: m.loser_to_slot,
    })),
    standings: bundle.standings,
    champion: bundle.champion,
  };
  res.json(bundlePublic);
});

export default router;
