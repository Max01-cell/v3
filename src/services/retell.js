/**
 * Retell AI SDK wrapper.
 * Handles outbound call creation and signature verification.
 *
 * TODO: Fill in full implementation once Retell SDK is confirmed.
 */

import Retell from 'retell-sdk';

let retellClient;

export function getRetellClient() {
  if (!retellClient) {
    retellClient = new Retell({
      apiKey: process.env.RETELL_API_KEY,
    });
  }
  return retellClient;
}

/**
 * Verify Retell webhook signature.
 * MUST use JSON.stringify(body) with no extra args — Retell signs compact JSON.
 *
 * @param {object} rawBody — parsed request body
 * @param {string} signature — X-Retell-Signature header value
 * @returns {boolean}
 */
export function verifyRetellSignature(rawBody, signature) {
  return Retell.verify(
    JSON.stringify(rawBody),
    process.env.RETELL_API_KEY,
    signature
  );
}

/**
 * Create a single outbound phone call via Retell.
 *
 * @param {object} prospect — { phone, businessName, ownerName, industry, id }
 * @param {string} callType — 'cold_call' | 'follow_up'
 * @returns {object} Retell call object
 */
export async function createOutboundCall(prospect, callType = 'cold_call') {
  const retell = getRetellClient();

  const agentId = callType === 'follow_up'
    ? process.env.RETELL_FOLLOW_UP_AGENT_ID
    : process.env.RETELL_COLD_CALL_AGENT_ID;

  if (!agentId) {
    const label = callType === 'follow_up' ? 'RETELL_FOLLOW_UP_AGENT_ID' : 'RETELL_COLD_CALL_AGENT_ID';
    throw new Error(`${label} is not set — create the agent in Retell dashboard first`);
  }

  return retell.call.createPhoneCall({
    from_number: process.env.RETELL_FROM_NUMBER,
    to_number: prospect.phone,
    override_agent_id: agentId,
    retell_llm_dynamic_variables: {
      business_name: prospect.businessName,
      owner_name: prospect.ownerName,
      industry: prospect.industry,
    },
    metadata: { prospect_id: prospect.id },
  });
}

/**
 * Create a batch of outbound calls.
 *
 * @param {object[]} prospects
 * @param {string} callType
 * @returns {object} Retell batch call object
 */
export async function createBatchCalls(prospects, callType = 'cold_call') {
  const retell = getRetellClient();

  const agentId = callType === 'follow_up'
    ? process.env.RETELL_FOLLOW_UP_AGENT_ID
    : process.env.RETELL_COLD_CALL_AGENT_ID;

  if (!agentId) {
    const label = callType === 'follow_up' ? 'RETELL_FOLLOW_UP_AGENT_ID' : 'RETELL_COLD_CALL_AGENT_ID';
    throw new Error(`${label} is not set — create the agent in Retell dashboard first`);
  }

  const tasks = prospects.map(p => ({
    from_number: process.env.RETELL_FROM_NUMBER,
    to_number: p.phone,
    override_agent_id: agentId,
    retell_llm_dynamic_variables: {
      business_name: p.businessName,
      owner_name: p.ownerName,
      industry: p.industry,
    },
    metadata: { prospect_id: p.id },
  }));

  return retell.batchCall.createBatchCall({ tasks });
}
