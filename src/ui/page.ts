// The Titan web UI — a single self-contained page served at "/".
// Inlined (no build step, no static-file bundling) so it ships cleanly inside
// the serverless function. Vanilla JS talks to the same /auth and /applications
// API. Design: a case file on an underwriter's desk — ink-navy desk, bone-paper
// dossier cards, brass officialdom; the six agents stamp their findings in turn.

export const page = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Titan — autonomous loan underwriting</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --ink: #0E1A2B;
    --panel: #15263B;
    --panel-2: #1C3149;
    --paper: #E9E1CF;
    --paper-line: #D6CBB2;
    --paper-ink: #1C2230;
    --brass: #C9A227;
    --brass-dim: #9c7d20;
    --approve: #2E7D5B;
    --reject: #B23A48;
    --mist: #8FA3BB;
    --sans: "IBM Plex Sans", system-ui, sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, monospace;
    --serif: "Fraunces", Georgia, serif;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--ink);
    color: #E8EEF6;
    font-family: var(--sans);
    line-height: 1.5;
    min-height: 100vh;
    background-image:
      radial-gradient(1200px 500px at 80% -10%, rgba(201,162,39,0.10), transparent 60%),
      radial-gradient(900px 500px at -10% 110%, rgba(46,125,91,0.08), transparent 60%);
  }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 28px 22px 80px; }

  /* Masthead */
  .masthead {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
    border-bottom: 1px solid rgba(201,162,39,0.35);
    padding-bottom: 16px; margin-bottom: 30px;
  }
  .brand { display: flex; align-items: baseline; gap: 14px; }
  .wordmark {
    font-family: var(--serif); font-weight: 900; font-size: 40px; letter-spacing: 0.5px;
    color: var(--paper); line-height: 1;
  }
  .wordmark .dot { color: var(--brass); }
  .tagline {
    font-family: var(--mono); font-size: 11px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--mist);
  }
  .seal {
    font-family: var(--mono); font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--brass); border: 1px solid rgba(201,162,39,0.5); border-radius: 999px;
    padding: 6px 12px;
  }

  /* Layout */
  .stage { display: grid; grid-template-columns: 1fr; gap: 28px; }
  @media (min-width: 860px) {
    .stage.running { grid-template-columns: 260px 1fr; }
  }

  /* Intake form */
  .intake {
    background: var(--panel); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 14px; padding: 26px;
  }
  .intake h2 {
    font-family: var(--serif); font-weight: 600; font-size: 24px; margin: 0 0 4px;
    color: var(--paper);
  }
  .intake p.lead { color: var(--mist); margin: 0 0 22px; font-size: 14px; max-width: 60ch; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 620px) { .grid { grid-template-columns: 1fr; } }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field.full { grid-column: 1 / -1; }
  label {
    font-family: var(--mono); font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--mist);
  }
  input, select, textarea {
    background: #0F1C2E; border: 1px solid #24384f; border-radius: 8px;
    color: #EAF1FA; font-family: var(--sans); font-size: 15px; padding: 11px 12px;
    width: 100%;
  }
  textarea { resize: vertical; min-height: 84px; font-family: var(--mono); font-size: 13px; }
  input:focus, select:focus, textarea:focus {
    outline: 2px solid var(--brass); outline-offset: 1px; border-color: var(--brass);
  }
  .actions { margin-top: 22px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .btn {
    font-family: var(--mono); font-size: 13px; letter-spacing: 1px; text-transform: uppercase;
    background: var(--brass); color: #201700; border: none; border-radius: 8px;
    padding: 13px 22px; cursor: pointer; font-weight: 600;
  }
  .btn:hover { background: #d9b02f; }
  .btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .btn.ghost { background: transparent; color: var(--brass); border: 1px solid rgba(201,162,39,0.5); }
  .btn.ghost:hover { background: rgba(201,162,39,0.08); }
  .hint { color: var(--mist); font-size: 12px; font-family: var(--mono); }

  /* Pipeline rail */
  .rail { position: relative; }
  .rail h3, .trail h3 {
    font-family: var(--mono); font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--mist); margin: 0 0 16px;
  }
  .station {
    display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: center;
    padding: 10px 0; position: relative;
  }
  .station:not(:last-child)::after {
    content: ""; position: absolute; left: 16px; top: 40px; bottom: -6px; width: 2px;
    background: linear-gradient(var(--panel-2), var(--panel-2));
  }
  .node {
    width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
    font-family: var(--mono); font-size: 13px; font-weight: 600; z-index: 1;
    border: 2px solid #2b4059; color: var(--mist); background: var(--ink);
    transition: all .35s ease;
  }
  .station .name {
    font-family: var(--sans); font-size: 15px; font-weight: 500; color: #cdd9e6;
  }
  .station .sub { font-family: var(--mono); font-size: 11px; color: var(--mist); }
  .station[data-state="analyzing"] .node {
    border-color: var(--brass); color: var(--brass); box-shadow: 0 0 0 4px rgba(201,162,39,0.12);
    animation: pulse 1.1s ease-in-out infinite;
  }
  .station[data-state="done"] .node { border-color: var(--approve); color: var(--approve); background: rgba(46,125,91,0.12); }
  .station[data-state="done"] .name { color: #E8EEF6; }
  .station[data-state="failed"] .node { border-color: var(--reject); color: var(--reject); }
  @keyframes pulse { 0%,100% { box-shadow: 0 0 0 3px rgba(201,162,39,0.10); } 50% { box-shadow: 0 0 0 7px rgba(201,162,39,0.02); } }

  /* Audit trail — bone case-file cards */
  .trail { min-height: 200px; }
  .cards { display: flex; flex-direction: column; gap: 14px; }
  .case {
    background: var(--paper); color: var(--paper-ink); border-radius: 10px; padding: 16px 18px;
    box-shadow: 0 10px 24px rgba(0,0,0,0.35); position: relative;
    border-left: 4px solid var(--brass);
    animation: drop .45s cubic-bezier(.2,.8,.2,1) both;
  }
  @keyframes drop { from { opacity: 0; transform: translateY(-10px) rotate(-.4deg); } to { opacity: 1; transform: none; } }
  .case .chead {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
  }
  .case .cname {
    font-family: var(--serif); font-weight: 600; font-size: 18px; color: #16202e;
  }
  .case .cstamp {
    font-family: var(--mono); font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
    padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(28,34,48,0.25); color: #4a4536;
  }
  .case .cstamp.good { color: var(--approve); border-color: rgba(46,125,91,0.4); }
  .case .cstamp.warn { color: var(--brass-dim); border-color: rgba(201,162,39,0.5); }
  .case .cstamp.bad  { color: var(--reject); border-color: rgba(178,58,72,0.4); }
  .kv { display: flex; flex-wrap: wrap; gap: 8px 22px; }
  .kv div { display: flex; flex-direction: column; }
  .kv .k { font-family: var(--mono); font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #7c7460; }
  .kv .v { font-family: var(--mono); font-size: 15px; font-weight: 500; color: #1c2230; }
  .case .note { margin-top: 10px; font-size: 13px; color: #55503f; border-top: 1px dashed var(--paper-line); padding-top: 8px; }
  .signals { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .signals span { font-family: var(--mono); font-size: 11px; background: rgba(178,58,72,0.12); color: #7d2531; padding: 2px 7px; border-radius: 4px; }

  /* Verdict seal */
  .verdict {
    background: var(--paper); color: var(--paper-ink); border-radius: 12px; padding: 24px;
    border-top: 6px solid var(--brass); box-shadow: 0 16px 40px rgba(0,0,0,0.45);
    animation: stamp .5s cubic-bezier(.2,.9,.3,1.2) both;
  }
  @keyframes stamp {
    0% { opacity: 0; transform: scale(1.25) rotate(-3deg); }
    60% { opacity: 1; transform: scale(.97) rotate(.5deg); }
    100% { transform: none; }
  }
  .verdict .vlabel {
    font-family: var(--mono); font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #7c7460;
  }
  .verdict .vstatus {
    font-family: var(--serif); font-weight: 900; font-size: 42px; line-height: 1.05; margin: 4px 0 2px;
  }
  .verdict.approved .vstatus { color: var(--approve); }
  .verdict.rejected .vstatus { color: var(--reject); }
  .verdict .terms { display: flex; gap: 28px; margin: 14px 0 6px; flex-wrap: wrap; }
  .verdict .terms .k { font-family: var(--mono); font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #7c7460; }
  .verdict .terms .v { font-family: var(--mono); font-size: 22px; font-weight: 600; color: #1c2230; }
  .verdict .rationale { font-size: 14px; color: #453f30; margin-top: 8px; }

  .empty { color: var(--mist); font-family: var(--mono); font-size: 13px; padding: 20px 0; }
  .banner {
    background: rgba(201,162,39,0.10); border: 1px solid rgba(201,162,39,0.35); color: #e9d79a;
    font-family: var(--mono); font-size: 12px; border-radius: 8px; padding: 10px 12px; margin-bottom: 20px;
  }
  .hidden { display: none !important; }
  @media (prefers-reduced-motion: reduce) {
    .case, .verdict, .station[data-state="analyzing"] .node { animation: none !important; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <div class="brand">
      <div class="wordmark">TITAN<span class="dot">.</span></div>
      <div class="tagline">Autonomous loan underwriting</div>
    </div>
    <div class="seal" id="providerSeal">engine: —</div>
  </header>

  <div id="banner" class="banner hidden"></div>

  <main class="stage" id="stage">
    <!-- Intake -->
    <section class="intake" id="intakePanel">
      <h2>New loan dossier</h2>
      <p class="lead">Submit an application and six specialist agents — document, fraud, credit,
        risk, compliance, decision — will analyse it in sequence and return an explainable verdict.</p>
      <form id="form">
        <div class="grid">
          <div class="field">
            <label for="applicantName">Applicant name</label>
            <input id="applicantName" required value="Jane Doe" />
          </div>
          <div class="field">
            <label for="amountRequested">Amount requested ($)</label>
            <input id="amountRequested" type="number" min="1" required value="20000" />
          </div>
          <div class="field">
            <label for="income">Annual income ($)</label>
            <input id="income" type="number" min="0" required value="90000" />
          </div>
          <div class="field">
            <label for="employmentStatus">Employment</label>
            <select id="employmentStatus">
              <option>employed full-time</option>
              <option>employed part-time</option>
              <option>self-employed</option>
              <option>unemployed</option>
            </select>
          </div>
          <div class="field full">
            <label for="purpose">Purpose</label>
            <input id="purpose" required value="home improvement" />
          </div>
          <div class="field full">
            <label for="documentText">Supporting document text</label>
            <textarea id="documentText" required>Jane Doe, employed full-time for 6 years as a software engineer. Annual income $90,000. Requesting funds for home improvement. No prior defaults.</textarea>
          </div>
        </div>
        <div class="actions">
          <button class="btn" type="submit" id="submitBtn">Run underwriting</button>
          <span class="hint" id="formHint">6 agents · ~15s with live inference</span>
        </div>
      </form>
    </section>

    <!-- Pipeline rail (hidden until running) -->
    <section class="rail hidden" id="railPanel">
      <h3>Pipeline</h3>
      <div id="stations"></div>
      <div class="actions" style="margin-top:22px">
        <button class="btn ghost" id="newBtn" type="button">New dossier</button>
      </div>
    </section>

    <!-- Audit trail -->
    <section class="trail hidden" id="trailPanel">
      <h3>Audit trail</h3>
      <div class="cards" id="cards"><div class="empty">Awaiting first agent…</div></div>
    </section>
  </main>
</div>

<script>
const AGENTS = [
  { key: "document",   label: "Document" },
  { key: "fraud",      label: "Fraud" },
  { key: "credit",     label: "Credit" },
  { key: "risk",       label: "Risk" },
  { key: "compliance", label: "Compliance" },
  { key: "decision",   label: "Decision" },
];
const $ = (id) => document.getElementById(id);
let token = null;

function showBanner(msg) { const b = $("banner"); b.textContent = msg; b.classList.remove("hidden"); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body.error && body.error.message) || ("HTTP " + res.status));
  return body;
}

// Demo auth: one throwaway account per browser, stored locally.
async function ensureAuth() {
  const saved = localStorage.getItem("titan_token");
  if (saved) { token = saved; return; }
  const email = "demo+" + Math.random().toString(36).slice(2, 10) + "@titan.app";
  const password = "demopassword123";
  try {
    const r = await api("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
    token = r.token;
  } catch {
    const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    token = r.token;
  }
  localStorage.setItem("titan_token", token);
}

function renderStations(done, current, failed) {
  $("stations").innerHTML = AGENTS.map((a, i) => {
    let state = "pending";
    if (done.includes(a.key)) state = "done";
    else if (failed) state = a.key === current ? "failed" : "pending";
    else if (a.key === current) state = "analyzing";
    const glyph = state === "done" ? "✓" : (i + 1);
    const sub = state === "analyzing" ? "analysing…" : state === "done" ? "complete" : state === "failed" ? "failed" : "pending";
    return \`<div class="station" data-state="\${state}">
      <div class="node">\${glyph}</div>
      <div><div class="name">\${a.label}</div><div class="sub">\${sub}</div></div>
    </div>\`;
  }).join("");
}

const money = (n) => "$" + Number(n).toLocaleString();

function stampClass(agent, out) {
  if (agent === "fraud") return out.status === "clear" ? "good" : out.status === "flagged" ? "bad" : "warn";
  if (agent === "compliance") return out.status === "pass" ? "good" : "bad";
  if (agent === "risk") return out.level === "low" ? "good" : out.level === "high" ? "bad" : "warn";
  return "";
}
function stampText(agent, out) {
  if (agent === "fraud") return out.status;
  if (agent === "compliance") return out.status;
  if (agent === "risk") return out.level + " risk";
  if (agent === "credit") return "assessed";
  if (agent === "document") return "extracted";
  return "";
}
function kv(pairs) {
  return '<div class="kv">' + pairs.map(([k, v]) => \`<div><span class="k">\${k}</span><span class="v">\${v}</span></div>\`).join("") + "</div>";
}

function renderAgentCard(agent, out) {
  let inner = "";
  if (agent === "document") inner = kv([["income", money(out.extractedIncome)], ["employment", out.employmentStatus], ["experience", out.yearsExperience + " yrs"]]) + \`<div class="note">\${out.summary || ""}</div>\`;
  else if (agent === "fraud") { inner = kv([["fraud prob", Number(out.fraudProbability).toFixed(2)], ["status", out.status]]); if ((out.signals||[]).length) inner += '<div class="signals">' + out.signals.map(s => "<span>" + s + "</span>").join("") + "</div>"; }
  else if (agent === "credit") inner = kv([["credit score", out.creditScore], ["debt-to-income", Number(out.debtToIncome).toFixed(2)]]) + \`<div class="note">\${out.notes || ""}</div>\`;
  else if (agent === "risk") inner = kv([["risk score", out.riskScore + " / 100"], ["level", out.level]]) + \`<div class="note">\${(out.factors||[]).join(" · ")}</div>\`;
  else if (agent === "compliance") inner = kv([["kyc", out.kyc], ["aml", out.aml], ["sanctions", out.sanctions]]) + \`<div class="note">\${out.notes || ""}</div>\`;
  const meta = AGENTS.find(a => a.key === agent);
  const sc = stampClass(agent, out), st = stampText(agent, out);
  return \`<div class="case">
    <div class="chead"><div class="cname">\${meta ? meta.label : agent}</div>\${st ? \`<div class="cstamp \${sc}">\${st}</div>\` : ""}</div>
    \${inner}
  </div>\`;
}

function renderVerdict(d) {
  const approved = d.status === "approved";
  return \`<div class="verdict \${d.status}">
    <div class="vlabel">Underwriting verdict</div>
    <div class="vstatus">\${approved ? "APPROVED" : "REJECTED"}</div>
    \${approved ? \`<div class="terms">
      <div><div class="k">Loan amount</div><div class="v">\${money(d.loanAmount)}</div></div>
      <div><div class="k">Interest rate</div><div class="v">\${Number(d.interestRate).toFixed(2)}%</div></div>
    </div>\` : ""}
    <div class="rationale">\${d.rationale || ""}</div>
  </div>\`;
}

function renderTrail(app) {
  const results = (app.agentResults || []).filter(r => r.agentName !== "decision");
  const cards = $("cards");
  if (!results.length && !app.decision && app.status !== "failed") {
    cards.innerHTML = '<div class="empty">Awaiting first agent…</div>';
    return;
  }
  let html = results.map(r => renderAgentCard(r.agentName, r.outputJson)).join("");
  if (app.decision) html += renderVerdict(app.decision);
  if (app.status === "failed") html += '<div class="verdict rejected"><div class="vlabel">Pipeline</div><div class="vstatus" style="font-size:28px">FAILED</div><div class="rationale">An agent could not complete. Please try again.</div></div>';
  cards.innerHTML = html || '<div class="empty">Awaiting first agent…</div>';
}

let pollTimer = null;
async function poll(id) {
  const app = await api("/applications/" + id);
  const done = (app.agentResults || []).map(r => r.agentName);
  const current = AGENTS.map(a => a.key).find(k => !done.includes(k));
  renderStations(done, current, app.status === "failed");
  renderTrail(app);
  if (app.status === "processing") { pollTimer = setTimeout(() => poll(id), 1500); }
}

function enterRunning() {
  $("stage").classList.add("running");
  $("intakePanel").classList.add("hidden");
  $("railPanel").classList.remove("hidden");
  $("trailPanel").classList.remove("hidden");
}
function resetToIntake() {
  clearTimeout(pollTimer);
  $("stage").classList.remove("running");
  $("intakePanel").classList.remove("hidden");
  $("railPanel").classList.add("hidden");
  $("trailPanel").classList.add("hidden");
  $("cards").innerHTML = '<div class="empty">Awaiting first agent…</div>';
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("submitBtn"); btn.disabled = true; btn.textContent = "Submitting…";
  try {
    await ensureAuth();
    const payload = {
      applicantName: $("applicantName").value.trim(),
      amountRequested: Number($("amountRequested").value),
      income: Number($("income").value),
      employmentStatus: $("employmentStatus").value,
      purpose: $("purpose").value.trim(),
      documentText: $("documentText").value.trim(),
    };
    const app = await api("/applications", { method: "POST", body: JSON.stringify(payload) });
    await api("/applications/" + app.id + "/submit", { method: "POST" });
    enterRunning();
    renderStations([], "document", false);
    poll(app.id);
  } catch (err) {
    showBanner("Could not start underwriting: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Run underwriting";
  }
});
$("newBtn").addEventListener("click", resetToIntake);

// Show which inference engine is live.
api("/health").then((h) => { $("providerSeal").textContent = "engine: " + (h.llm || "—"); }).catch(() => {});
</script>
</body>
</html>`;
