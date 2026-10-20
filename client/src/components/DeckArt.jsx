import { useEffect, useState } from 'react';
import { getTheme } from '../card-themes.js';

// Artwork frame used in the bracket, match detail and deck profile. Missing or
// broken artwork always falls back to the player's card theme — never to a
// random substitute image.
export function DeckArt({ src, alt = '', themeKey, size = 'sm', className = '', showLabel = false, featured }) {
  const theme = getTheme(themeKey);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const label = featured || theme.label;
  const classes = `deck-art deck-art-${size} ${src && !broken ? 'has-art' : 'no-art'} ${className}`.trim();

  return (
    <span
      className={classes}
      style={{ '--da-frame': theme.frame, '--da-glow': theme.glow, '--da-ink': theme.ink }}
    >
      {src && !broken ? (
        <img src={src} alt={alt || label} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="deck-art-fallback" aria-hidden="true">
          <span className="deck-art-emblem">{theme.emblem}</span>
          {size !== 'xs' && <span className="deck-art-code">{theme.code}</span>}
        </span>
      )}
      {showLabel && <span className="deck-art-label">{label}</span>}
    </span>
  );
}

export function PlayerAvatar({ user, size = 'sm', className = '' }) {
  const [broken, setBroken] = useState(false);
  const initial = (user?.name || '?').charAt(0).toUpperCase();
  const src = user?.avatar;

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <span className={`avatar-frame avatar-${size} ${className}`.trim()}>
      {src && !broken ? (
        <img src={src} alt={user?.name || 'Player'} loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}

export default DeckArt;
