/**
 * Validate all processor JSON configs against the schema.
 * Run: npm run validate-processors
 *
 * Exits 0 if all valid, exits 1 if any fail.
 */

import Ajv from 'ajv';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const PROCESSORS_DIR = join(process.cwd(), 'data', 'processors');
const schema = JSON.parse(readFileSync(join(PROCESSORS_DIR, '_schema.json'), 'utf-8'));

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const files = readdirSync(PROCESSORS_DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'));

let allValid = true;

for (const file of files) {
  const data = JSON.parse(readFileSync(join(PROCESSORS_DIR, file), 'utf-8'));
  const valid = validate(data);

  if (!valid) {
    console.error(`❌ ${file} — ${data.name || 'unknown'} (${data.status || 'unknown'})`);
    for (const err of validate.errors) {
      console.error(`   ${err.instancePath || '(root)'}: ${err.message}`);
    }
    allValid = false;
  } else {
    const tierCount = data.tiers?.length ?? 0;
    const signedLabel = data.status === 'signed' ? '✅' : '⏳';
    console.log(`${signedLabel} ${file} — ${data.name} (${data.status}, ${tierCount} tier(s))`);
  }
}

console.log(`\nValidated ${files.length} processor config(s).`);

if (!allValid) {
  console.error('One or more processor configs are invalid.');
  process.exit(1);
}

console.log('All configs valid.');
