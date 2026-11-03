/**
 * Every browser gets a random display name + cursor color, kept in
 * localStorage so it stays the same across reloads. It is shared with other
 * users through Yjs "awareness" (presence info that is not part of the doc).
 */
const COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#60a5fa', '#a78bfa', '#f472b6'];
const ANIMALS = ['Fox', 'Owl', 'Panda', 'Otter', 'Tiger', 'Koala', 'Lynx', 'Falcon', 'Whale', 'Gecko'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const KEY = 'codesync-user';

export function getLocalUser() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.name && saved?.color) return saved;
  } catch {
    /* ignore */
  }
  const user = { name: `${pick(ANIMALS)}-${Math.floor(Math.random() * 900 + 100)}`, color: pick(COLORS) };
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
  return user;
}

export function saveLocalUser(user) {
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}
