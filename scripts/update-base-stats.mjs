#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOWDOWN_POKEDEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json';

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(scriptDir, '..', 'docs', 'assets', 'base-stats.json');

  console.log('Downloading Pokemon Showdown pokedex data...');
  const response = await fetch(SHOWDOWN_POKEDEX_URL);
  if (!response.ok) {
    throw new Error(`Failed to download pokedex: ${response.status} ${response.statusText}`);
  }

  const pokedex = await response.json();
  const pokemon = {};

  for (const [id, entry] of Object.entries(pokedex)) {
    if (!entry || typeof entry !== 'object' || !entry.baseStats) continue;

    const { hp, atk, def, spa, spd, spe } = entry.baseStats;
    const values = [hp, atk, def, spa, spd, spe].map(Number);
    if (values.some(Number.isNaN)) continue;

    pokemon[id] = {
      name: String(entry.name || id),
      hp: values[0],
      atk: values[1],
      def: values[2],
      spa: values[3],
      spd: values[4],
      spe: values[5],
      bst: values.reduce((sum, value) => sum + value, 0)
    };
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: SHOWDOWN_POKEDEX_URL,
      totalPokemon: Object.keys(pokemon).length
    },
    pokemon
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${Object.keys(pokemon).length} entries to ${outputPath}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
