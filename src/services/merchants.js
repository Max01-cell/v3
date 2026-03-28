/**
 * Merchant pipeline CRUD — uses the same SQLite db as leads.
 */

import { getDb } from './leads.js';

const STAGE_DATE_FIELDS = {
  app_sent:       'app_sent_date',
  app_signed:     'app_signed_date',
  underwriting:   'submitted_to_iso_date',
  approved:       'approved_date',
  live:           'go_live_date',
  first_statement: 'first_statement_date',
};

const ALL_STAGES = [
  'new_lead', 'email_sent', 'contacted', 'verbal_yes', 'app_sent',
  'app_signed', 'underwriting', 'approved', 'terminal_setup',
  'live', 'first_statement', 'churned', 'dead',
];

// Fields allowed in generic updates (prevents SQL injection via column names)
const ALLOWED_UPDATE_FIELDS = [
  'owner_name', 'owner_email', 'owner_phone', 'business_name', 'business_type', 'city',
  'current_processor', 'current_rate', 'monthly_volume', 'contract_status',
  'estimated_monthly_savings', 'estimated_annual_savings',
  'matched_iso', 'matched_tier', 'our_residual', 'merchant_floor_cost',
  'stage', 'app_sent_date', 'app_signed_date', 'submitted_to_iso_date',
  'approved_date', 'mid_number', 'terminal_id', 'go_live_date', 'first_statement_date',
  'first_residual_amount', 'monthly_residual_amount',
  'lead_quality', 'objection_given', 'callback_time', 'notes',
];

export function getMerchant(id) {
  return getDb().prepare('SELECT * FROM merchants WHERE id = ?').get(id);
}

export function getAllMerchants({ stage, iso, quality } = {}) {
  const conditions = [];
  const params = [];

  if (stage)   { conditions.push('stage = ?');        params.push(stage); }
  if (iso)     { conditions.push('matched_iso = ?');  params.push(iso); }
  if (quality) { conditions.push('lead_quality = ?'); params.push(quality); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return getDb().prepare(
    `SELECT * FROM merchants ${where} ORDER BY updated_at DESC`
  ).all(...params);
}

export function getMerchantStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as n FROM merchants').get().n;

  const rows = db.prepare(
    'SELECT stage, COUNT(*) as n FROM merchants GROUP BY stage'
  ).all();

  const byStage = Object.fromEntries(ALL_STAGES.map(s => [s, 0]));
  rows.forEach(r => { byStage[r.stage] = r.n; });

  const totals = db.prepare(`
    SELECT
      SUM(monthly_residual_amount) as residuals,
      SUM(estimated_monthly_savings) as savings,
      AVG(our_residual) as avg_deal
    FROM merchants WHERE stage NOT IN ('dead','churned')
  `).get();

  return {
    total,
    by_stage: byStage,
    total_monthly_residuals: totals.residuals || 0,
    total_estimated_savings: totals.savings || 0,
    avg_deal_size: Math.round(totals.avg_deal || 0),
  };
}

/**
 * Create or update a merchant.
 * Uses owner_email as dedup key when present.
 * Accepts camelCase field names (maps to snake_case columns).
 */
export function upsertMerchant(data) {
  const db = getDb();

  if (data.ownerEmail) {
    const existing = db.prepare('SELECT id FROM merchants WHERE owner_email = ?').get(data.ownerEmail);
    if (existing) {
      db.prepare(`
        UPDATE merchants SET
          owner_name             = COALESCE(@ownerName, owner_name),
          owner_phone            = COALESCE(@ownerPhone, owner_phone),
          business_name          = COALESCE(@businessName, business_name),
          business_type          = COALESCE(@businessType, business_type),
          city                   = COALESCE(@city, city),
          current_processor      = COALESCE(@currentProcessor, current_processor),
          current_rate           = COALESCE(@currentRate, current_rate),
          monthly_volume         = COALESCE(@monthlyVolume, monthly_volume),
          contract_status        = COALESCE(@contractStatus, contract_status),
          estimated_monthly_savings = COALESCE(@estimatedMonthlySavings, estimated_monthly_savings),
          estimated_annual_savings  = COALESCE(@estimatedAnnualSavings, estimated_annual_savings),
          matched_iso            = COALESCE(@matchedIso, matched_iso),
          matched_tier           = COALESCE(@matchedTier, matched_tier),
          our_residual           = COALESCE(@ourResidual, our_residual),
          merchant_floor_cost    = COALESCE(@merchantFloorCost, merchant_floor_cost),
          stage                  = COALESCE(@stage, stage),
          retell_call_id         = COALESCE(@retellCallId, retell_call_id),
          call_recording_url     = COALESCE(@callRecordingUrl, call_recording_url),
          lead_quality           = COALESCE(@leadQuality, lead_quality),
          objection_given        = COALESCE(@objectionGiven, objection_given),
          callback_time          = COALESCE(@callbackTime, callback_time),
          updated_at             = datetime('now')
        WHERE id = @id
      `).run({ ...mapData(data), id: existing.id });
      return existing.id;
    }
  }

  const result = db.prepare(`
    INSERT INTO merchants (
      owner_name, owner_email, owner_phone, business_name, business_type, city,
      current_processor, current_rate, monthly_volume, contract_status,
      estimated_monthly_savings, estimated_annual_savings,
      matched_iso, matched_tier, our_residual, merchant_floor_cost,
      stage, retell_call_id, call_recording_url,
      lead_quality, objection_given, callback_time
    ) VALUES (
      @ownerName, @ownerEmail, @ownerPhone, @businessName, @businessType, @city,
      @currentProcessor, @currentRate, @monthlyVolume, @contractStatus,
      @estimatedMonthlySavings, @estimatedAnnualSavings,
      @matchedIso, @matchedTier, @ourResidual, @merchantFloorCost,
      @stage, @retellCallId, @callRecordingUrl,
      @leadQuality, @objectionGiven, @callbackTime
    )
  `).run(mapData(data));

  return result.lastInsertRowid;
}

function mapData(d) {
  return {
    ownerName:                d.ownerName              ?? null,
    ownerEmail:               d.ownerEmail             ?? null,
    ownerPhone:               d.ownerPhone             ?? null,
    businessName:             d.businessName           ?? null,
    businessType:             d.businessType           ?? null,
    city:                     d.city                   ?? null,
    currentProcessor:         d.currentProcessor       ?? null,
    currentRate:              d.currentRate            ?? null,
    monthlyVolume:            d.monthlyVolume          ?? null,
    contractStatus:           d.contractStatus         ?? null,
    estimatedMonthlySavings:  d.estimatedMonthlySavings ?? null,
    estimatedAnnualSavings:   d.estimatedAnnualSavings  ?? null,
    matchedIso:               d.matchedIso             ?? null,
    matchedTier:              d.matchedTier            ?? null,
    ourResidual:              d.ourResidual            ?? null,
    merchantFloorCost:        d.merchantFloorCost      ?? null,
    stage:                    d.stage                  ?? 'new_lead',
    retellCallId:             d.retellCallId           ?? null,
    callRecordingUrl:         d.callRecordingUrl       ?? null,
    leadQuality:              d.leadQuality            ?? null,
    objectionGiven:           d.objectionGiven         ?? null,
    callbackTime:             d.callbackTime           ?? null,
  };
}

/** Partial update — accepts snake_case field names from the API. */
export function updateMerchant(id, fields) {
  const db = getDb();
  const sets = [];
  const params = [];

  for (const col of ALLOWED_UPDATE_FIELDS) {
    if (col in fields) {
      sets.push(`${col} = ?`);
      params.push(fields[col]);
    }
  }

  if (sets.length === 0) return getMerchant(id);

  sets.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE merchants SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getMerchant(id);
}

/** Update stage and auto-set the corresponding date field. */
export function updateMerchantStage(id, stage) {
  const db = getDb();
  const dateCol = STAGE_DATE_FIELDS[stage];

  if (dateCol) {
    db.prepare(`
      UPDATE merchants
      SET stage = ?, ${dateCol} = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(stage, id);
  } else {
    db.prepare(`
      UPDATE merchants SET stage = ?, updated_at = datetime('now') WHERE id = ?
    `).run(stage, id);
  }

  return getMerchant(id);
}
