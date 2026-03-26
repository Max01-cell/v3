/**
 * Validate all processor JSON files against the schema.
 * Run: node --test tests/processor-schema.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';

const PROCESSORS_DIR = join(process.cwd(), 'data', 'processors');
const schema = JSON.parse(readFileSync(join(PROCESSORS_DIR, '_schema.json'), 'utf-8'));

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const files = readdirSync(PROCESSORS_DIR)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'));

describe('Processor JSON schema validation', () => {
  for (const file of files) {
    test(`${file} is valid`, () => {
      const data = JSON.parse(readFileSync(join(PROCESSORS_DIR, file), 'utf-8'));
      const valid = validate(data);
      if (!valid) {
        const errors = validate.errors.map(e => `  ${e.instancePath} ${e.message}`).join('\n');
        assert.fail(`${file} failed schema validation:\n${errors}`);
      }
    });
  }
});
