import { useCallback, useEffect, useState } from 'react';

// Lightweight user preferences. Sound is opt-in; decorative effects can be
// turned off while still keeping essential state feedback.

const EVENT = 'tcg-pref-changed';

export function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(`tcg_pref_${key}`);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(`tcg_pref_${key}`, JSON.stringify(value));
  } catch {
    /* storage can be unavailable */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value } }));
}

export function usePref(key, fallback) {
  const [value, setValue] = useState(() => readPref(key, fallback));

  useEffect(() => {
    const onChange = (e) => {
      if (!e.detail || e.detail.key === key) setValue(readPref(key, fallback));
    };
    const onStorage = (e) => {
      if (e.key === `tcg_pref_${key}`) setValue(readPref(key, fallback));
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [key, fallback]);

  const set = useCallback(
    (next) => {
      const resolved = typeof next === 'function' ? next(readPref(key, fallback)) : next;
      writePref(key, resolved);
      setValue(resolved);
    },
    [key, fallback]
  );

  return [value, set];
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

let audioCtx = null;

// Short, restrained victory chord. No audio assets required.
export function playVictory() {
  if (!readPref('sound', false) || prefersReducedMotion()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const notes = [392, 523.25, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.4);
    });
  } catch {
    /* audio is optional */
  }
}
