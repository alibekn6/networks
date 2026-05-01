// data.js — loads manifest + question pools from /data/*.json

const KEY = {
  progress: "netquiz:progress",
  wrong: "netquiz:wrong",
  lastResult: "netquiz:lastResult",
};

export async function loadManifest() {
  const r = await fetch("data/manifest.json");
  return r.json();
}

export async function loadPool(file) {
  const r = await fetch("data/" + file);
  if (!r.ok) return [];
  return r.json();
}

export async function loadAllQuestions(manifest) {
  const all = [];
  const files = [
    ...manifest.modules.map(m => m.file),
    ...manifest.pools.map(p => p.file),
  ];
  for (const f of files) {
    try {
      const qs = await loadPool(f);
      for (const q of qs) if (!all.find(x => x.id === q.id)) all.push(q);
    } catch (_) { /* missing pool file is fine for the demo */ }
  }
  return all;
}

export function shuffle(arr, seed = Date.now()) {
  // simple seeded shuffle
  const a = arr.slice();
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const storage = {
  getProgress() {
    try { return JSON.parse(localStorage.getItem(KEY.progress) || "{}"); }
    catch { return {}; }
  },
  setProgress(p) { localStorage.setItem(KEY.progress, JSON.stringify(p)); },

  getWrong() {
    try { return JSON.parse(localStorage.getItem(KEY.wrong) || "[]"); }
    catch { return []; }
  },
  addWrong(id) {
    const w = this.getWrong();
    if (!w.includes(id)) w.push(id);
    localStorage.setItem(KEY.wrong, JSON.stringify(w));
  },
  removeWrong(id) {
    const w = this.getWrong().filter(x => x !== id);
    localStorage.setItem(KEY.wrong, JSON.stringify(w));
  },

  saveResult(r) { localStorage.setItem(KEY.lastResult, JSON.stringify(r)); },
  getResult() {
    try { return JSON.parse(localStorage.getItem(KEY.lastResult) || "null"); }
    catch { return null; }
  },

  reset() {
    localStorage.removeItem(KEY.progress);
    localStorage.removeItem(KEY.wrong);
    localStorage.removeItem(KEY.lastResult);
  },
};
