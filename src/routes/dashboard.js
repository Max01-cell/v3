/**
 * Internal pipeline dashboard — single HTML page at GET /dashboard.
 * No build step. Fetches data from /api/merchants and /api/merchants/stats.
 */

export default async function dashboardRoutes(fastify) {
  fastify.get('/dashboard', async (request, reply) => {
    reply.type('text/html');
    return DASHBOARD_HTML;
  });
}

const STAGE_META = {
  new_lead:        { label: 'New Lead',        color: '#6b7280' },
  email_sent:      { label: 'Email Sent',       color: '#3b82f6' },
  contacted:       { label: 'Contacted',        color: '#3b82f6' },
  verbal_yes:      { label: 'Verbal Yes',       color: '#10b981' },
  app_sent:        { label: 'App Sent',         color: '#f59e0b' },
  app_signed:      { label: 'App Signed',       color: '#f59e0b' },
  underwriting:    { label: 'Underwriting',     color: '#f97316' },
  approved:        { label: 'Approved',         color: '#10b981' },
  terminal_setup:  { label: 'Terminal Setup',   color: '#f97316' },
  live:            { label: 'Live',             color: '#059669' },
  first_statement: { label: 'First Statement',  color: '#059669' },
  churned:         { label: 'Churned',          color: '#ef4444' },
  dead:            { label: 'Dead',             color: '#ef4444' },
};

const NEXT_STAGE = {
  new_lead: 'email_sent', email_sent: 'contacted', contacted: 'verbal_yes',
  verbal_yes: 'app_sent', app_sent: 'app_signed', app_signed: 'underwriting',
  underwriting: 'approved', approved: 'terminal_setup',
  terminal_setup: 'live', live: 'first_statement',
};

const ACTIVE_STAGES = [
  'new_lead','email_sent','contacted','verbal_yes','app_sent',
  'app_signed','underwriting','approved','terminal_setup','live','first_statement',
];

// Inline the meta as JSON for the client-side JS
const STAGE_META_JSON = JSON.stringify(STAGE_META);
const NEXT_STAGE_JSON = JSON.stringify(NEXT_STAGE);
const ACTIVE_STAGES_JSON = JSON.stringify(ACTIVE_STAGES);

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>01 Payments — Pipeline</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f0;color:#1a1a1a;min-height:100vh}
header{background:#1a1a1a;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.logo{color:#fff;font-size:16px;font-weight:700;letter-spacing:-0.3px}
.logo span{color:#999;font-weight:300}
.stats-bar{display:flex;gap:12px;flex-wrap:wrap}
.stat{background:rgba(255,255,255,0.08);border-radius:8px;padding:8px 14px;color:#fff}
.stat-label{font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px}
.stat-val{font-size:18px;font-weight:700;line-height:1.2}
.board-wrap{overflow-x:auto;padding:20px;display:flex;gap:14px;min-height:calc(100vh - 80px);align-items:flex-start}
.column{background:#e8e8e4;border-radius:10px;width:260px;min-width:260px;display:flex;flex-direction:column;max-height:calc(100vh - 120px)}
.col-header{padding:12px 14px;display:flex;align-items:center;justify-content:space-between;border-radius:10px 10px 0 0}
.col-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#fff}
.col-count{background:rgba(0,0,0,0.25);color:#fff;font-size:11px;font-weight:700;border-radius:10px;padding:2px 7px}
.col-body{padding:8px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px}
.card{background:#fff;border-radius:8px;padding:12px;cursor:pointer;transition:box-shadow 0.15s;border:1px solid #e5e5e5}
.card:hover{box-shadow:0 3px 12px rgba(0,0,0,0.12)}
.card-biz{font-size:14px;font-weight:600;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-owner{font-size:12px;color:#999;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-row{display:flex;justify-content:space-between;align-items:center;margin-top:4px}
.card-iso{font-size:11px;color:#555;background:#f0f0ec;border-radius:4px;padding:2px 6px}
.card-savings{font-size:12px;font-weight:700;color:#059669}
.card-days{font-size:11px;color:#bbb}
.empty{text-align:center;padding:20px;color:#bbb;font-size:12px}

/* Modal */
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;align-items:center;justify-content:center}
.overlay.open{display:flex}
.modal{background:#fff;border-radius:12px;width:560px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)}
.modal-header{background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:flex-start}
.modal-biz{color:#fff;font-size:18px;font-weight:700}
.modal-owner{color:#999;font-size:13px;margin-top:2px}
.modal-close{color:#999;font-size:20px;cursor:pointer;background:none;border:none;padding:0;line-height:1}
.modal-body{padding:24px}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#999;margin-bottom:10px}
.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-bottom:20px}
.field{display:flex;flex-direction:column;gap:2px}
.field label{font-size:11px;color:#999}
.field span{font-size:14px;font-weight:500;color:#1a1a1a}
.field span.empty-val{color:#ccc;font-style:italic}
.stage-badge{display:inline-block;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;color:#fff;margin-bottom:16px}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}
.btn{padding:8px 16px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:opacity 0.15s}
.btn:hover{opacity:0.85}
.btn-advance{background:#1a1a1a;color:#fff}
.btn-dead{background:#ef4444;color:#fff}
.btn-outline{background:#f0f0ec;color:#1a1a1a;border:1px solid #e0e0e0}
.notes-area{width:100%;border:1px solid #e0e0e0;border-radius:8px;padding:10px;font-size:13px;resize:vertical;min-height:80px;font-family:inherit;color:#1a1a1a}
.notes-area:focus{outline:none;border-color:#1a1a1a}
.save-notes{margin-top:6px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer}
.divider{border:none;border-top:1px solid #eee;margin:16px 0}
</style>
</head>
<body>

<header>
  <div class="logo">01 <span>Payments</span> &mdash; Pipeline</div>
  <div class="stats-bar">
    <div class="stat"><div class="stat-label">Total Leads</div><div class="stat-val" id="s-total">—</div></div>
    <div class="stat"><div class="stat-label">Live</div><div class="stat-val" id="s-live">—</div></div>
    <div class="stat"><div class="stat-label">Monthly Residuals</div><div class="stat-val" id="s-residuals">—</div></div>
    <div class="stat"><div class="stat-label">Avg Deal</div><div class="stat-val" id="s-avg">—</div></div>
  </div>
</header>

<div class="board-wrap" id="board"></div>

<div class="overlay" id="overlay" onclick="closeModal(event)">
  <div class="modal" id="modal">
    <div class="modal-header">
      <div>
        <div class="modal-biz" id="m-biz">—</div>
        <div class="modal-owner" id="m-owner">—</div>
      </div>
      <button class="modal-close" onclick="closeModalDirect()">&times;</button>
    </div>
    <div class="modal-body">
      <div id="m-stage-badge"></div>
      <div class="actions" id="m-actions"></div>
      <div class="section-title">Contact</div>
      <div class="field-grid">
        <div class="field"><label>Email</label><span id="m-email"></span></div>
        <div class="field"><label>Phone</label><span id="m-phone"></span></div>
        <div class="field"><label>Business type</label><span id="m-btype"></span></div>
        <div class="field"><label>City</label><span id="m-city"></span></div>
      </div>
      <div class="section-title">Processing</div>
      <div class="field-grid">
        <div class="field"><label>Current processor</label><span id="m-proc"></span></div>
        <div class="field"><label>Current rate</label><span id="m-rate"></span></div>
        <div class="field"><label>Monthly volume</label><span id="m-vol"></span></div>
        <div class="field"><label>Contract status</label><span id="m-contract"></span></div>
      </div>
      <div class="section-title">Match</div>
      <div class="field-grid">
        <div class="field"><label>Matched ISO</label><span id="m-iso"></span></div>
        <div class="field"><label>Tier</label><span id="m-tier"></span></div>
        <div class="field"><label>Est. monthly savings</label><span id="m-savings"></span></div>
        <div class="field"><label>Our residual</label><span id="m-residual"></span></div>
      </div>
      <div class="section-title">Onboarding</div>
      <div class="field-grid">
        <div class="field"><label>App sent</label><span id="m-app-sent"></span></div>
        <div class="field"><label>App signed</label><span id="m-app-signed"></span></div>
        <div class="field"><label>Submitted to ISO</label><span id="m-submitted"></span></div>
        <div class="field"><label>Approved</label><span id="m-approved"></span></div>
        <div class="field"><label>MID</label><span id="m-mid"></span></div>
        <div class="field"><label>Go live</label><span id="m-live"></span></div>
        <div class="field"><label>First statement</label><span id="m-first-stmt"></span></div>
        <div class="field"><label>Monthly residual</label><span id="m-monthly-res"></span></div>
      </div>
      <div class="section-title">Call</div>
      <div class="field-grid">
        <div class="field"><label>Lead quality</label><span id="m-quality"></span></div>
        <div class="field"><label>Objection</label><span id="m-objection"></span></div>
        <div class="field"><label>Callback time</label><span id="m-callback"></span></div>
        <div class="field"><label>Added</label><span id="m-created"></span></div>
      </div>
      <hr class="divider">
      <div class="section-title">Notes</div>
      <textarea class="notes-area" id="m-notes" placeholder="Add notes..."></textarea>
      <button class="save-notes" id="save-notes-btn">Save notes</button>
    </div>
  </div>
</div>

<script>
const STAGE_META = ${STAGE_META_JSON};
const NEXT_STAGE = ${NEXT_STAGE_JSON};
const ACTIVE_STAGES = ${ACTIVE_STAGES_JSON};

let currentMerchant = null;
let allMerchants = [];

async function load() {
  const [statsRes, listRes] = await Promise.all([
    fetch('/api/merchants/stats'),
    fetch('/api/merchants'),
  ]);
  const stats = await statsRes.json();
  const { merchants } = await listRes.json();
  allMerchants = merchants;
  renderStats(stats);
  renderBoard(merchants);
}

function fmt(n) {
  if (!n && n !== 0) return null;
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'2-digit' });
}

function daysAgo(d) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d)) / 86400000);
}

function renderStats(s) {
  document.getElementById('s-total').textContent = s.total;
  const live = (s.by_stage.live || 0) + (s.by_stage.first_statement || 0);
  document.getElementById('s-live').textContent = live;
  document.getElementById('s-residuals').textContent = fmt(s.total_monthly_residuals) || '$0';
  document.getElementById('s-avg').textContent = fmt(s.avg_deal_size) || '$0';
}

function renderBoard(merchants) {
  const board = document.getElementById('board');
  board.innerHTML = '';
  ACTIVE_STAGES.forEach(stage => {
    const group = merchants.filter(m => m.stage === stage);
    const meta = STAGE_META[stage];
    const col = document.createElement('div');
    col.className = 'column';
    col.innerHTML = \`
      <div class="col-header" style="background:\${meta.color}">
        <span class="col-title">\${meta.label}</span>
        <span class="col-count">\${group.length}</span>
      </div>
      <div class="col-body" id="col-\${stage}"></div>
    \`;
    board.appendChild(col);
    const body = col.querySelector('.col-body');
    if (group.length === 0) {
      body.innerHTML = '<div class="empty">Empty</div>';
    } else {
      group.forEach(m => body.appendChild(makeCard(m)));
    }
  });
}

function makeCard(m) {
  const div = document.createElement('div');
  div.className = 'card';
  const savings = m.estimated_monthly_savings ? fmt(m.estimated_monthly_savings) + '/mo' : '—';
  const days = daysAgo(m.updated_at);
  const isoLabel = m.matched_iso || '—';
  div.innerHTML = \`
    <div class="card-biz">\${m.business_name || m.owner_name || 'Unknown'}</div>
    <div class="card-owner">\${m.owner_name || ''}\${m.city ? ' &middot; ' + m.city : ''}</div>
    <div class="card-row">
      <span class="card-iso">\${isoLabel}</span>
      <span class="card-savings">\${savings}</span>
    </div>
    <div class="card-row">
      <span style="font-size:11px;color:#bbb">\${m.current_processor || ''}</span>
      <span class="card-days">\${days}d</span>
    </div>
  \`;
  div.onclick = () => openModal(m);
  return div;
}

function v(val) {
  if (val === null || val === undefined || val === '') return '<span class="empty-val">—</span>';
  return val;
}

function openModal(m) {
  currentMerchant = m;
  const meta = STAGE_META[m.stage] || { label: m.stage, color: '#999' };

  document.getElementById('m-biz').textContent = m.business_name || m.owner_name || 'Unknown';
  document.getElementById('m-owner').textContent = [m.owner_name, m.owner_email].filter(Boolean).join(' · ');
  document.getElementById('m-stage-badge').innerHTML =
    \`<span class="stage-badge" style="background:\${meta.color}">\${meta.label}</span>\`;

  const actions = document.getElementById('m-actions');
  actions.innerHTML = '';
  const next = NEXT_STAGE[m.stage];
  if (next) {
    const nextMeta = STAGE_META[next];
    const btn = document.createElement('button');
    btn.className = 'btn btn-advance';
    btn.textContent = '→ ' + nextMeta.label;
    btn.onclick = () => doStage(m.id, next);
    actions.appendChild(btn);
  }
  if (m.stage !== 'dead') {
    const dead = document.createElement('button');
    dead.className = 'btn btn-dead';
    dead.textContent = 'Mark Dead';
    dead.onclick = () => doStage(m.id, 'dead');
    actions.appendChild(dead);
  }

  const fields = {
    'm-email': m.owner_email, 'm-phone': m.owner_phone,
    'm-btype': m.business_type, 'm-city': m.city,
    'm-proc': m.current_processor, 'm-rate': m.current_rate,
    'm-vol': m.monthly_volume, 'm-contract': m.contract_status,
    'm-iso': m.matched_iso, 'm-tier': m.matched_tier,
    'm-savings': m.estimated_monthly_savings ? fmt(m.estimated_monthly_savings) + '/mo' : null,
    'm-residual': m.our_residual ? fmt(m.our_residual) + '/mo' : null,
    'm-app-sent': fmtDate(m.app_sent_date), 'm-app-signed': fmtDate(m.app_signed_date),
    'm-submitted': fmtDate(m.submitted_to_iso_date), 'm-approved': fmtDate(m.approved_date),
    'm-mid': m.mid_number, 'm-live': fmtDate(m.go_live_date),
    'm-first-stmt': fmtDate(m.first_statement_date),
    'm-monthly-res': m.monthly_residual_amount ? fmt(m.monthly_residual_amount) + '/mo' : null,
    'm-quality': m.lead_quality, 'm-objection': m.objection_given,
    'm-callback': m.callback_time, 'm-created': fmtDate(m.created_at),
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = v(val);
  });

  document.getElementById('m-notes').value = m.notes || '';
  document.getElementById('overlay').classList.add('open');
}

function closeModal(e) {
  if (e.target === document.getElementById('overlay')) closeModalDirect();
}
function closeModalDirect() {
  document.getElementById('overlay').classList.remove('open');
  currentMerchant = null;
}

async function doStage(id, stage) {
  await fetch(\`/api/merchants/\${id}/stage\`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
  closeModalDirect();
  load();
}

document.getElementById('save-notes-btn').onclick = async () => {
  if (!currentMerchant) return;
  const notes = document.getElementById('m-notes').value;
  await fetch(\`/api/merchants/\${currentMerchant.id}\`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  currentMerchant.notes = notes;
  const btn = document.getElementById('save-notes-btn');
  btn.textContent = 'Saved ✓';
  setTimeout(() => { btn.textContent = 'Save notes'; }, 1500);
};

load();
setInterval(load, 60000); // auto-refresh every minute
</script>
</body>
</html>`;
