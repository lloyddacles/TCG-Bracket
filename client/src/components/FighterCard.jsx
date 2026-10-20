import { QRCodeSVG } from 'qrcode.react';
import { getTheme, qrPayload, cardSerial } from '../card-themes.js';

export default function FighterCard({ user, deck, size = 'full' }) {
  const theme = getTheme(user?.cardTheme);
  const payload = qrPayload(user?.qrToken);
  const serial = cardSerial(user?.id, user?.qrToken);
  const qrSize = size === 'compact' ? 116 : 172;

  const style = {
    '--fc-frame': theme.frame,
    '--fc-accent': theme.accent,
    '--fc-accent2': theme.accent2,
    '--fc-glow': theme.glow,
    '--fc-ink': theme.ink,
    '--fc-panel': theme.panel,
    '--fc-text': theme.text,
  };

  return (
    <div className={`fighter-card size-${size}`} style={style}>
      <div className="fc-sheen" aria-hidden="true" />
      <div className="fc-watermark" aria-hidden="true">
        {theme.emblem}
      </div>
      <div className="fc-frame">
        <header className="fc-head">
          <span className="fc-emblem" aria-hidden="true">
            {theme.emblem}
          </span>
          <div className="fc-nation">
            <strong>
              {theme.label}
              <span className="fc-code">{theme.code}</span>
            </strong>
            <em>
              {theme.group === 'collab' ? 'Collab · ' : ''}
              {theme.tagline}
            </em>
          </div>
          <span className="fc-rank">FIGHTER</span>
        </header>

        <div className="fc-body">
          <div className="fc-qr">
            {payload ? (
              <QRCodeSVG value={payload} size={qrSize} level="H" fgColor={theme.ink} bgColor="#ffffff" />
            ) : (
              <div className="fc-qr-empty">No QR</div>
            )}
            <span className="fc-qr-badge" aria-hidden="true">
              {theme.emblem}
            </span>
          </div>
          <div className="fc-id">
            <span className="fc-idlabel">Fighter</span>
            <h3 className="fc-name">{user?.name || 'Unknown'}</h3>
            <span className="fc-handle">@{user?.username || '—'}</span>
            {deck ? <span className="fc-deck">🃏 {deck}</span> : null}
          </div>
        </div>

        <footer className="fc-foot">
          <span className="fc-title">{user?.cardTitle || 'Registered Duelist'}</span>
          <span className="fc-serial">{serial}</span>
        </footer>
      </div>
    </div>
  );
}
