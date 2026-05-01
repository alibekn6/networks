// quiz.js — runs both quiz.html and results.html
import { loadManifest, loadAllQuestions, loadPool, shuffle, storage } from "./data.js";

const params = new URLSearchParams(location.search);
const isResults = location.pathname.endsWith("results.html");

const state = {
  questions: [],
  i: 0,
  answers: {},        // id -> user answer (array | string)
  correctMap: {},     // id -> bool
  mode: params.get("mode") || "practice",   // practice | test
  scope: null,        // module id, pool id, or "wrong" / "mock"
  startedAt: Date.now(),
  timeLimit: parseInt(params.get("time") || "0", 10) * 60, // seconds, 0 = none
  endsAt: null,
  finished: false,
};

if (isResults) renderResults();
else { renderQuizSkeleton(); initQuiz(); }

function renderQuizSkeleton() {
  const card = document.getElementById("qcard");
  if (!card) return;
  card.innerHTML = `
    <div class="qmeta">
      <span class="skeleton sk-line sk-w-20" style="height:11px;"></span>
    </div>
    <span class="skeleton sk-line lg sk-w-80" style="margin-bottom:6px;"></span>
    <span class="skeleton sk-line lg sk-w-60" style="margin-bottom:18px;"></span>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <span class="skeleton sk-block"></span>
      <span class="skeleton sk-block"></span>
      <span class="skeleton sk-block"></span>
      <span class="skeleton sk-block"></span>
    </div>
  `;
  const t = document.getElementById("progressText");
  if (t) t.textContent = "— / —";
}

// =========================================================
// QUIZ INIT
// =========================================================
async function initQuiz() {
  const manifest = await loadManifest();
  const moduleId = params.get("module");
  const poolId = params.get("pool");
  const n = parseInt(params.get("n") || "0", 10);

  let qs = [];
  if (poolId === "wrong") {
    const all = await loadAllQuestions(manifest);
    const wrongIds = storage.getWrong();
    qs = all.filter(q => wrongIds.includes(q.id));
    state.scope = "wrong";
    if (!qs.length) { alert("No wrong answers yet. Take a quiz first!"); location.href = "index.html"; return; }
  } else if (poolId === "mock") {
    const all = await loadAllQuestions(manifest);
    qs = shuffle(all).slice(0, n || 38);
    state.scope = "mock";
  } else if (poolId) {
    const meta = manifest.pools.find(p => p.id === poolId);
    qs = await loadPool(meta.file);
    state.scope = "pool:" + poolId;
  } else if (moduleId) {
    const meta = manifest.modules.find(m => m.id === moduleId);
    qs = await loadPool(meta.file);
    state.scope = "module:" + moduleId;
  } else {
    alert("Missing quiz parameters");
    location.href = "index.html";
    return;
  }

  state.questions = (state.mode === "test" || poolId !== "lastyear") ? shuffle(qs) : qs;
  if (!state.questions.length) {
    document.getElementById("qcard").innerHTML = `
      <h3>Pool is empty</h3>
      <p>This module's question file isn't filled in yet. Try the <a href="quiz.html?pool=lastyear&mode=test">Last-Year pool</a> or another module.</p>`;
    document.getElementById("qfooter").classList.add("hidden");
    return;
  }

  if (state.timeLimit > 0) {
    state.endsAt = Date.now() + state.timeLimit * 1000;
    tickTimer();
    setInterval(tickTimer, 500);
  } else {
    document.getElementById("timer").textContent = "∞";
  }

  document.getElementById("submitBtn").addEventListener("click", onSubmit);
  document.getElementById("nextBtn").addEventListener("click", onNext);
  document.getElementById("finishBtn").addEventListener("click", finish);
  document.addEventListener("keydown", onKey);

  render();
}

function onKey(e) {
  if (state.finished) return;
  const q = state.questions[state.i];
  if (!q) return;

  if (q.type === "single" || q.type === "multi") {
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= (q.choices?.length || 0)) {
      toggleChoice(num - 1);
      e.preventDefault();
    }
  }
  if (e.key === "Enter") {
    const submit = document.getElementById("submitBtn");
    const next = document.getElementById("nextBtn");
    const finish = document.getElementById("finishBtn");
    if (!submit.classList.contains("hidden") && !submit.disabled) submit.click();
    else if (!next.classList.contains("hidden")) next.click();
    else if (!finish.classList.contains("hidden")) finish.click();
  }
}

// =========================================================
// RENDER
// =========================================================
function render() {
  const q = state.questions[state.i];
  const total = state.questions.length;
  document.getElementById("progressText").textContent = `${state.i + 1} / ${total}`;
  document.querySelector(".progress").style.setProperty("--p", `${((state.i) / total) * 100}%`);

  const card = document.getElementById("qcard");
  card.innerHTML = `
    <div class="qmeta">
      <span class="tag">${q.module || "general"}</span>
      ${q.type === "multi" ? `<span class="multi-hint">CHOOSE ALL THAT APPLY</span>` : ""}
      ${q.type === "fill" ? `<span class="multi-hint">FILL IN</span>` : ""}
      ${q.type === "cli" ? `<span class="multi-hint">TYPE THE COMMAND</span>` : ""}
      ${q.bank_error ? `<span class="bank-error" title="${escapeHtml(q.bank_error_note || "")}">⚠ BANK-ERROR WORDING</span>` : ""}
    </div>
    ${q.image ? `<img class="exhibit" src="assets/img/${q.image}" alt="exhibit" />` : ""}
    <p class="stem">${escapeHtml(q.stem)}</p>
    ${renderInput(q)}
    <div id="feedback"></div>
  `;

  // wire choice handlers
  if (q.type === "single" || q.type === "multi") {
    card.querySelectorAll(".choice").forEach(el => {
      el.addEventListener("click", () => toggleChoice(parseInt(el.dataset.idx, 10)));
    });
  } else {
    const inp = card.querySelector("input");
    if (inp) {
      inp.addEventListener("input", () => {
        document.getElementById("submitBtn").disabled = inp.value.trim().length === 0;
      });
      inp.focus();
    }
  }

  // reset button states
  document.getElementById("submitBtn").classList.remove("hidden");
  document.getElementById("submitBtn").disabled = true;
  document.getElementById("nextBtn").classList.add("hidden");
  document.getElementById("finishBtn").classList.add("hidden");
}

function renderInput(q) {
  if (q.type === "single" || q.type === "multi") {
    return `<div class="choices">
      ${q.choices.map((c, i) => `
        <div class="choice" data-idx="${i}">
          <span class="key">${i + 1}</span>
          <span>${escapeHtml(c)}</span>
        </div>`).join("")}
    </div>`;
  }
  if (q.type === "fill") {
    return `<input type="text" class="fill-input" placeholder="Type the answer…" autocomplete="off" />`;
  }
  if (q.type === "cli") {
    return `<div class="cli-prefix">${escapeHtml(q.prefix || "Router#")}</div>
            <input type="text" class="cli-input" placeholder="…" autocomplete="off" spellcheck="false" />`;
  }
  return "";
}

function toggleChoice(idx) {
  const q = state.questions[state.i];
  const sel = state.answers[q.id] || [];
  if (q.type === "single") {
    state.answers[q.id] = [idx];
    document.querySelectorAll(".choice").forEach(el => {
      el.classList.toggle("selected", parseInt(el.dataset.idx, 10) === idx);
    });
  } else {
    const set = new Set(sel);
    set.has(idx) ? set.delete(idx) : set.add(idx);
    state.answers[q.id] = [...set];
    const el = document.querySelector(`.choice[data-idx="${idx}"]`);
    el.classList.toggle("selected");
  }
  document.getElementById("submitBtn").disabled = (state.answers[q.id]?.length || 0) === 0;
}

// =========================================================
// SUBMIT / FEEDBACK
// =========================================================
function onSubmit() {
  const q = state.questions[state.i];
  let userVal;
  if (q.type === "single" || q.type === "multi") {
    userVal = (state.answers[q.id] || []).slice().sort();
  } else {
    const inp = document.querySelector(".fill-input, .cli-input");
    userVal = inp ? inp.value.trim() : "";
    state.answers[q.id] = userVal;
  }

  const correct = isCorrect(q, userVal);
  state.correctMap[q.id] = correct;

  if (correct) storage.removeWrong(q.id);
  else storage.addWrong(q.id);

  // Visual feedback
  if (q.type === "single" || q.type === "multi") {
    const correctIdxs = q.answer;
    document.querySelectorAll(".choice").forEach(el => {
      const i = parseInt(el.dataset.idx, 10);
      el.classList.add("disabled");
      if (correctIdxs.includes(i)) el.classList.add("correct");
      else if (userVal.includes(i)) el.classList.add("wrong");
    });
  } else {
    const inp = document.querySelector(".fill-input, .cli-input");
    if (inp) {
      inp.disabled = true;
      inp.style.borderColor = correct ? "var(--correct)" : "var(--wrong)";
    }
  }

  // Always show the explanation after submit — correct or wrong, both modes.
  const fb = document.getElementById("feedback");
  fb.innerHTML = explanationBlock(q, correct);
  fb.scrollIntoView({ behavior: "smooth", block: "nearest" });

  document.getElementById("submitBtn").classList.add("hidden");
  if (state.i + 1 < state.questions.length) {
    document.getElementById("nextBtn").classList.remove("hidden");
  } else {
    document.getElementById("finishBtn").classList.remove("hidden");
  }
}

function explanationBlock(q, correct) {
  const cls = correct ? "ok" : "bad";
  const head = correct ? "Correct" : "Wrong";
  const correctText = formatCorrect(q);
  const lec = q.explain_lecture;
  const lecBlock = lec ? `
    <div class="lecture">
      <div class="lecture-head">From the lecture · ${escapeHtml(lec.module)} — ${escapeHtml(lec.slide)}</div>
      <blockquote>${escapeHtml(lec.quote)}</blockquote>
      <div class="cite">Source: ${lec.module.startsWith("ITN") ? "ITN PowerPoint" : lec.module.startsWith("SRWE") ? "SRWE PDF" : "course material"} · slide "${escapeHtml(lec.slide)}"</div>
    </div>` : "";
  return `
    <div class="feedback ${cls}">
      <h5>${head}</h5>
      <p class="ans-line"><b>Answer:</b> ${escapeHtml(correctText)}</p>
      <p>${escapeHtml(q.explain_short || "")}</p>
      ${lecBlock}
    </div>`;
}

function formatCorrect(q) {
  if (q.type === "single" || q.type === "multi") {
    return q.answer.map(i => q.choices[i]).join(" · ");
  }
  return q.answer;
}

function isCorrect(q, userVal) {
  if (q.type === "single" || q.type === "multi") {
    const a = [...q.answer].sort();
    if (a.length !== userVal.length) return false;
    return a.every((v, i) => v === userVal[i]);
  }
  const norm = s => String(s).toLowerCase().replace(/\s+/g, " ").trim();
  if (norm(userVal) === norm(q.answer)) return true;
  if (q.alt_answers) return q.alt_answers.some(a => norm(a) === norm(userVal));
  return false;
}

function onNext() {
  state.i++;
  render();
}

// =========================================================
// FINISH → results
// =========================================================
function finish() {
  state.finished = true;
  const total = state.questions.length;
  const correct = state.questions.filter(q => state.correctMap[q.id]).length;
  const elapsed = Math.round((Date.now() - state.startedAt) / 1000);

  // Update progress per module
  const prog = storage.getProgress();
  if (state.scope?.startsWith("module:")) {
    const mid = state.scope.slice(7);
    prog[mid] = prog[mid] || { best: 0, totalAnswered: 0, totalCorrect: 0 };
    prog[mid].best = Math.max(prog[mid].best, correct);
    prog[mid].lastN = `${correct}/${total}`;
    prog[mid].totalAnswered += total;
    prog[mid].totalCorrect += correct;
    storage.setProgress(prog);
  }

  storage.saveResult({
    scope: state.scope,
    questions: state.questions,
    answers: state.answers,
    correctMap: state.correctMap,
    total, correct, elapsed,
    timestamp: Date.now(),
  });
  location.href = "results.html";
}

function tickTimer() {
  if (!state.endsAt) return;
  const left = Math.max(0, state.endsAt - Date.now());
  const t = document.getElementById("timer");
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  t.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  t.className = "timer";
  if (left < 60_000) t.classList.add("danger");
  else if (left < 5 * 60_000) t.classList.add("warn");
  if (left === 0 && !state.finished) finish();
}

// =========================================================
// RESULTS
// =========================================================
function renderResults() {
  const r = storage.getResult();
  if (!r) {
    document.body.innerHTML = "<main class='container'><h2>No results yet.</h2><p><a href='index.html'>Home</a></p></main>";
    return;
  }
  const pct = Math.round((r.correct / r.total) * 100);
  document.getElementById("scoreHeadline").textContent = `${r.correct} / ${r.total}`;
  document.getElementById("scoreLine").textContent =
    `${pct}% · ${Math.floor(r.elapsed / 60)}m ${r.elapsed % 60}s`;

  // Tag stats
  const tagAgg = {};
  r.questions.forEach(q => {
    (q.tags || ["general"]).forEach(t => {
      tagAgg[t] = tagAgg[t] || { ok: 0, total: 0 };
      tagAgg[t].total++;
      if (r.correctMap[q.id]) tagAgg[t].ok++;
    });
  });
  document.getElementById("tagStats").innerHTML = Object.entries(tagAgg)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([t, v]) => `
      <div class="tag-stat">
        <b>${v.ok}/${v.total}</b><span>${t}</span>
        <div class="bar"><span style="width:${(v.ok / v.total) * 100}%"></span></div>
      </div>`).join("");

  // Review list
  document.getElementById("reviewList").innerHTML = r.questions.map(q => {
    const ok = r.correctMap[q.id];
    const userAns = formatUserAnswer(q, r.answers[q.id]);
    const correctAns = formatCorrect(q);
    return `
      <div class="review-item ${ok ? "ok" : ""}">
        <p class="stem-mini"><b>${ok ? "✓" : "✗"}</b> ${escapeHtml(q.stem)}</p>
        ${ok ? "" : `<p class="ans-mini"><span class="yours">Your answer:</span> ${escapeHtml(userAns || "—")}</p>`}
        <p class="ans-mini"><b>Correct:</b> ${escapeHtml(correctAns)}</p>
        <p class="ans-mini">${escapeHtml(q.explain_short || "")}</p>
        ${q.explain_lecture ? `
          <div class="lecture" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
            <div class="lecture-head">From the lecture · ${escapeHtml(q.explain_lecture.module)} — ${escapeHtml(q.explain_lecture.slide)}</div>
            <blockquote>${escapeHtml(q.explain_lecture.quote)}</blockquote>
          </div>` : ""}
      </div>`;
  }).join("");

  document.getElementById("retryWrong").addEventListener("click", () => {
    const wrongIds = r.questions.filter(q => !r.correctMap[q.id]).map(q => q.id);
    if (!wrongIds.length) { alert("No wrong answers — perfect score!"); return; }
    location.href = "quiz.html?pool=wrong&mode=practice";
  });
}

function formatUserAnswer(q, ua) {
  if (!ua && ua !== 0) return "";
  if (q.type === "single" || q.type === "multi") {
    if (!Array.isArray(ua)) return "";
    return ua.map(i => q.choices[i]).join(" · ");
  }
  return String(ua);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[c]));
}
