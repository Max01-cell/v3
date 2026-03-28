/**
 * Lead storage and retrieval via SQLite (better-sqlite3).
 * WAL mode for safe concurrent reads/writes.
 * File lives at ./data/01payments.db — persisted on Railway volume.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const DB_PATH = process.env.DB_PATH || './data/01payments.db';
let db;

export function initDatabase() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      industry TEXT,
      pos_system TEXT,
      estimated_volume TEXT,
      best_time_to_call TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      source TEXT NOT NULL DEFAULT 'website',
      analysis_json TEXT,
      UNIQUE(phone)
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      call_id TEXT NOT NULL,
      call_type TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      duration_ms INTEGER,
      transcript TEXT,
      recording_url TEXT,
      outcome TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
    CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
  `);

  // Migrate: add boarding tracking columns if not present
  const existingCols = db.prepare('PRAGMA table_info(leads)').all().map(c => c.name);
  if (!existingCols.includes('boarded_iso'))           db.exec('ALTER TABLE leads ADD COLUMN boarded_iso TEXT');
  if (!existingCols.includes('boarded_tier'))          db.exec('ALTER TABLE leads ADD COLUMN boarded_tier TEXT');
  if (!existingCols.includes('boarded_date'))          db.exec('ALTER TABLE leads ADD COLUMN boarded_date TEXT');
  if (!existingCols.includes('non_solicit_permanent')) db.exec('ALTER TABLE leads ADD COLUMN non_solicit_permanent INTEGER DEFAULT 0');

  // Merchants pipeline table
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      owner_name TEXT,
      owner_email TEXT,
      owner_phone TEXT,
      business_name TEXT,
      business_type TEXT,
      city TEXT,
      current_processor TEXT,
      current_rate TEXT,
      monthly_volume TEXT,
      contract_status TEXT,
      estimated_monthly_savings REAL,
      estimated_annual_savings REAL,
      matched_iso TEXT,
      matched_tier TEXT,
      our_residual REAL,
      merchant_floor_cost REAL,
      stage TEXT DEFAULT 'new_lead',
      app_sent_date DATETIME,
      app_signed_date DATETIME,
      submitted_to_iso_date DATETIME,
      approved_date DATETIME,
      mid_number TEXT,
      terminal_id TEXT,
      go_live_date DATETIME,
      first_statement_date DATETIME,
      first_residual_amount REAL,
      monthly_residual_amount REAL,
      retell_call_id TEXT,
      call_recording_url TEXT,
      call_transcript TEXT,
      lead_quality TEXT,
      objection_given TEXT,
      callback_time TEXT,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_merchants_stage ON merchants(stage);
    CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants(owner_email);
  `);

  return db;
}

export function getDb() { return db; }

export function upsertLead(data) {
  const id = data.id || randomUUID();
  const stmt = db.prepare(`
    INSERT INTO leads (id, name, business_name, phone, email, industry,
                       pos_system, estimated_volume, best_time_to_call, status, source)
    VALUES (@id, @name, @businessName, @phone, @email, @industry,
            @posSystem, @estimatedVolume, @bestTimeToCall, @status, @source)
    ON CONFLICT(phone) DO UPDATE SET
      name = COALESCE(@name, name),
      business_name = COALESCE(@businessName, business_name),
      email = COALESCE(@email, email),
      industry = COALESCE(@industry, industry),
      pos_system = COALESCE(@posSystem, pos_system),
      estimated_volume = COALESCE(@estimatedVolume, estimated_volume),
      best_time_to_call = COALESCE(@bestTimeToCall, best_time_to_call),
      status = @status,
      updated_at = datetime('now')
  `);

  stmt.run({
    id,
    name: data.name ?? null,
    businessName: data.businessName ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    industry: data.industry ?? null,
    posSystem: data.posSystem ?? null,
    estimatedVolume: data.estimatedVolume ?? null,
    bestTimeToCall: data.bestTimeToCall ?? null,
    status: data.status ?? 'new',
    source: data.source ?? 'website',
  });

  return id;
}

export function getLeadByPhone(phone) {
  return db.prepare('SELECT * FROM leads WHERE phone = ?').get(phone);
}

export function getLeadById(id) {
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
}

export function updateLeadStatus(id, status) {
  db.prepare("UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);
}

export function saveCallRecord(leadId, callData) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO calls (id, lead_id, call_id, call_type, duration_ms,
                       transcript, recording_url, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, leadId, callData.callId, callData.callType,
    callData.durationMs ?? null, callData.transcript ?? null,
    callData.recordingUrl ?? null, callData.outcome ?? null
  );
}

export function saveAnalysis(leadId, analysisJson) {
  db.prepare("UPDATE leads SET analysis_json = ?, status = 'analysis_complete', updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(analysisJson), leadId);
}

export function getCallsByLeadId(leadId) {
  return db.prepare('SELECT * FROM calls WHERE lead_id = ? ORDER BY timestamp DESC').all(leadId);
}

/**
 * Record that a merchant has been boarded with an ISO.
 * Critical: prevents re-routing due to non-solicitation clauses.
 *
 * @param {string} leadId
 * @param {{ boardedIso, boardedTier, nonSolicitPermanent }} params
 */
export function boardLead(leadId, { boardedIso, boardedTier, nonSolicitPermanent = false }) {
  db.prepare(`
    UPDATE leads SET
      boarded_iso = ?,
      boarded_tier = ?,
      boarded_date = datetime('now'),
      non_solicit_permanent = ?,
      status = 'boarded',
      updated_at = datetime('now')
    WHERE id = ?
  `).run(boardedIso, boardedTier, nonSolicitPermanent ? 1 : 0, leadId);
}
