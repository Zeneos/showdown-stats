#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOWDOWN_MOVES_URL = 'https://play.pokemonshowdown.com/data/moves.json';

function toId(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(scriptDir, '..', 'docs', 'assets', 'move-data.json');

  console.log('Downloading Pokemon Showdown move data...');
  const response = await fetch(SHOWDOWN_MOVES_URL);
  if (!response.ok) {
    throw new Error(`Failed to download move data: ${response.status} ${response.statusText}`);
  }

  const movesRaw = await response.json();
  const moves = {};

  for (const [key, entry] of Object.entries(movesRaw)) {
    if (!entry || typeof entry !== 'object') continue;

    const name = String(entry.name || key);
    const type = entry.type ? String(entry.type) : null;
    const description = String(entry.shortDesc || entry.desc || '');

    const pp = Number.isFinite(Number(entry.pp)) ? Number(entry.pp) : null;
    const basePower = Number.isFinite(Number(entry.basePower)) ? Number(entry.basePower) : null;

    let accuracy = null;
    if (entry.accuracy === true) {
      accuracy = true;
    } else if (Number.isFinite(Number(entry.accuracy))) {
      accuracy = Number(entry.accuracy);
    }

    const priority = Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 0;

    const record = {
      name,
      type,
      pp,
      basePower,
      accuracy,
      priority,
      description
    };

    const keyId = toId(key);
    const nameId = toId(name);

    if (keyId) moves[keyId] = record;
    if (nameId) moves[nameId] = record;
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: SHOWDOWN_MOVES_URL,
      totalMoves: Object.keys(moves).length
    },
    moves
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${Object.keys(moves).length} entries to ${outputPath}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
