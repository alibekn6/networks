// app.js — home page logic
import { loadManifest, loadAllQuestions, storage } from "./data.js";

const grid = document.getElementById("moduleGrid");
const stats = document.getElementById("stats");
const resetBtn = document.getElementById("resetBtn");

function renderSkeletons() {
  // 8 module-card skeletons match the manifest length
  grid.innerHTML = Array.from({ length: 8 }).map(() => `
    <div class="module-card">
      <span class="skeleton sk-line lg sk-w-60"></span>
      <span class="skeleton sk-line sk-w-40"></span>
      <span class="skeleton sk-bar sk-w-100"></span>
      <span class="skeleton sk-line sk-w-30"></span>
      <div style="display:flex;gap:6px;margin-top:4px;">
        <span class="skeleton sk-pill"></span>
        <span class="skeleton sk-pill"></span>
      </div>
    </div>
  `).join("");
  stats.innerHTML = Array.from({ length: 3 }).map(() => `
    <div class="stat">
      <span class="skeleton sk-line lg sk-w-50" style="margin:0 auto 6px;"></span>
      <span class="skeleton sk-line sk-w-70" style="margin:0 auto;height:9px;"></span>
    </div>
  `).join("");
}

async function init() {
  renderSkeletons();
  const manifest = await loadManifest();
  const allQs = await loadAllQuestions(manifest);
  const progress = storage.getProgress();
  const wrong = storage.getWrong();

  // Module cards
  grid.innerHTML = manifest.modules.map(m => {
    const count = allQs.filter(q => q.module === m.id).length;
    const best = progress[m.id]?.best ?? 0;
    const lastN = progress[m.id]?.lastN ?? 0;
    const pct = count ? Math.round((best / count) * 100) : 0;
    return `
      <div class="module-card ${m.color}">
        <h4>${m.title}</h4>
        <div class="meta">${m.src} · ${count} question${count === 1 ? "" : "s"}</div>
        <div class="progress-mini"><span style="width:${pct}%"></span></div>
        <div class="row"><span>Best ${best}/${count || "?"}</span><span>${lastN ? "Last: " + lastN : ""}</span></div>
        <div class="actions">
          <a class="pill" href="quiz.html?module=${m.id}&mode=practice">Practice</a>
          <a class="pill primary" href="quiz.html?module=${m.id}&mode=test">Test</a>
        </div>
      </div>`;
  }).join("");

  // Stats footer
  const totalAnswered = Object.values(progress).reduce((s, p) => s + (p.totalAnswered || 0), 0);
  const totalCorrect = Object.values(progress).reduce((s, p) => s + (p.totalCorrect || 0), 0);
  stats.innerHTML = `
    <div class="stat"><b>${allQs.length}</b><span>Questions</span></div>
    <div class="stat"><b>${totalCorrect}/${totalAnswered || 0}</b><span>Correct</span></div>
    <div class="stat"><b>${wrong.length}</b><span>To review</span></div>
  `;

  resetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Reset all progress and wrong-answer log?")) {
      storage.reset();
      location.reload();
    }
  });
}

init();
