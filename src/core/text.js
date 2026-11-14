// Small string helpers shared across modules.

/** "sponsor" to "Sponsor"; an empty string stays empty. */
export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** mm:ss, or h:mm:ss past an hour. */
export function formatTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  /** Two digits: 5 is "05". */
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
