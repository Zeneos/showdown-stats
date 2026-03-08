#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOWDOWN_ABILITIES_URL = 'https://play.pokemonshowdown.com/data/abilities.js';

function toId(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseAbilitiesJs(sourceText) {
  const sandbox = { exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(sourceText, sandbox, { timeout: 5000 });

  const abilities = sandbox.exports && sandbox.exports.BattleAbilities;
  if (!abilities || typeof abilities !== 'object') {
    throw new Error('Failed to parse abilities.js: BattleAbilities not found');
  }

  return abilities;
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(scriptDir, '..', 'docs', 'assets', 'ability-data.json');

  console.log('Downloading Pokemon Showdown ability data...');
  const response = await fetch(SHOWDOWN_ABILITIES_URL);
  if (!response.ok) {
    throw new Error(`Failed to download ability data: ${response.status} ${response.statusText}`);
  }

  const sourceText = await response.text();
  const abilitiesRaw = parseAbilitiesJs(sourceText);
  const abilities = {};

  for (const [key, entry] of Object.entries(abilitiesRaw)) {
    if (!entry || typeof entry !== 'object') continue;

    const name = String(entry.name || key);
    const description = String(entry.shortDesc || entry.desc || '');

    const record = {
      name,
      description
    };

    const keyId = toId(key);
    const nameId = toId(name);

    if (keyId) abilities[keyId] = record;
    if (nameId) abilities[nameId] = record;
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: SHOWDOWN_ABILITIES_URL,
      totalAbilities: Object.keys(abilities).length
    },
    abilities
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${Object.keys(abilities).length} entries to ${outputPath}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
