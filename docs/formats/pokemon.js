// Pokemon Showdown Stats Visualizer - Pokemon detail page

const spriteShowdownBase = '../assets/sprites/showdown';
const spriteOriginalBase = '../assets/sprites/original';
const spritePlaceholder = `${spriteOriginalBase}/0.png`;
const iconSpriteBase = '../assets/sprites/icons';
const mysteryDungeonSpriteBase = '../assets/sprites/mystery-dungeon';
const typeSpriteBase = '../assets/sprites/types';
const itemSpriteBase = '../assets/sprites/items';
const itemSpriteFallback = `${itemSpriteBase}/unknown.png`;
const maxBaseStat = 255;
const maxBaseStatTotal = 800;
const highestCurrentBst = 780;
const baseStatLabels = [
    ['hp', 'HP'],
    ['atk', 'Atk'],
    ['def', 'Def'],
    ['spa', 'SpA'],
    ['spd', 'SpD'],
    ['spe', 'Spe']
];
const typeSpriteIndexById = {
    normal: 1,
    fighting: 2,
    flying: 3,
    poison: 4,
    ground: 5,
    rock: 6,
    bug: 7,
    ghost: 8,
    steel: 9,
    fire: 10,
    water: 11,
    grass: 12,
    electric: 13,
    psychic: 14,
    ice: 15,
    dragon: 16,
    dark: 17,
    fairy: 18
};
const countersSortState = {
    key: 'rate',
    direction: 'desc'
};
let baseStatsMapPromise = null;
let moveDataMapPromise = null;
let moveDataMap = null;
let abilityDataMapPromise = null;
let abilityDataMap = null;
let itemNameMapPromise = null;
let itemNameMap = null;
let formatNameMapPromise = null;
let formatNameMap = null;

document.addEventListener('DOMContentLoaded', () => {
    loadPokemonDetail();
});

async function loadPokemonDetail() {
    const params = new URLSearchParams(window.location.search);
    const formatName = params.get('format');
    const pokemonName = params.get('pokemon');
    const rating = params.get('rating') || 'all';

    if (!formatName || !pokemonName) {
        showError('Missing format or pokemon in the URL.');
        return;
    }

    let latestPeriod = '';

    try {
        const indexResponse = await fetch('../index.json');
        if (indexResponse.ok) {
            const index = await indexResponse.json();
            latestPeriod = String(index.latest || '');
            const periodInfo = document.getElementById('period-info');
            if (periodInfo) {
                periodInfo.textContent = `Stats Period: ${index.latest}`;
            }
        }
    } catch (error) {
        console.error('Error loading index:', error);
    }

    const pokemonData = await loadPokemonData(formatName, rating);
    if (!pokemonData || !Array.isArray(pokemonData.pokemon)) {
        showError(`Pokemon data for "${escapeHtml(pokemonName)}" could not be loaded.`);
        return;
    }

    let entry = findPokemonEntry(pokemonData.pokemon, pokemonName);
    if (!entry) {
        entry = getMostUsedPokemonEntry(pokemonData.pokemon);
        if (!entry) {
            showError(`Pokemon data for format "${escapeHtml(formatName)}" is empty.`);
            return;
        }

        // Keep URL in sync when we auto-fallback to the most-used Pokemon.
        const nextParams = new URLSearchParams();
        nextParams.set('format', formatName);
        nextParams.set('pokemon', entry.pokemon_name);
        if (rating && rating !== 'all') {
            nextParams.set('rating', rating);
        }
        const nextUrl = `${window.location.pathname || 'pokemon.html'}?${nextParams.toString()}`;
        window.history.replaceState({}, '', nextUrl);
    }

    const baseStats = await loadBaseStatsForPokemon(entry.pokemon_name);
    moveDataMap = await loadMoveDataMap();
    abilityDataMap = await loadAbilityDataMap();
    itemNameMap = await loadItemNameMap();
    formatNameMap = await loadFormatNameMap();
    const displayFormatName = getDisplayFormatName(formatName);

    const detail = document.getElementById('pokemon-detail');
    if (detail) detail.style.display = 'block';

    document.title = `${entry.pokemon_name} - ${displayFormatName}`;

    const sprite = document.getElementById('pokemon-sprite');
    const spritePaths = getPokemonSpritePaths(entry.pokemon_name);
    if (sprite) {
        sprite.src = spritePaths.showdown;
        sprite.onerror = function () {
            this.onerror = function () {
                this.onerror = null;
                this.src = spritePaths.placeholder;
            };
            this.src = spritePaths.original;
        };
    }

    const nameEl = document.getElementById('pokemon-name');
    if (nameEl) nameEl.textContent = entry.pokemon_name;

    const typesEl = document.getElementById('pokemon-types');
    if (typesEl) {
        const types = baseStats && Array.isArray(baseStats.types) ? baseStats.types : [];
        typesEl.innerHTML = renderPokemonHeaderTypes(types);
    }

    await populateFormatSwitcher(entry.pokemon_name, formatName, displayFormatName, rating, latestPeriod);

    const usageEl = document.getElementById('pokemon-usage');
    if (usageEl) {
        const usagePct = entry.usage_pct !== undefined ? entry.usage_pct.toFixed(2) : '0.00';
        const usageCount = entry.usage_count !== undefined ? formatNumber(entry.usage_count) : '0';
        usageEl.textContent = `Usage: ${usagePct}% (${usageCount} battles)`;
    }

    const rankingEl = document.getElementById('pokemon-ranking');
    if (rankingEl) {
        const monthlyRank = getPokemonMonthlyRank(pokemonData.pokemon, entry.pokemon_name);
        rankingEl.textContent = monthlyRank > 0
            ? `Monthly Ranking: #${monthlyRank}`
            : 'Monthly Ranking: --';
    }

    const backLink = document.getElementById('back-to-format');
    if (backLink) {
        const params = new URLSearchParams();
        params.set('format', formatName);
        if (rating && rating !== 'all') {
            params.set('rating', rating);
        }
        backLink.href = `index.html?${params.toString()}`;
    }

    const grid = document.getElementById('pokemon-detail-grid');
    if (!grid) return;

    grid.innerHTML = [
        renderBaseStatsSection('Base Stats', baseStats),
        renderMapSection('Moves', entry.moves_json),
        renderMapSection('Spreads', entry.spreads_json),
        renderMapSection('Items', entry.items_json),
        renderMapSection('Abilities', entry.abilities_json),
        renderMapSection('Tera Types', entry.tera_json),
        renderMapSection('Teammates', entry.teammates_json),
        renderCountersSection('Checks and Counters', entry.counters_json, countersSortState)
    ]
        .filter(Boolean)
        .join('');

    attachCountersSortHandlers(entry.counters_json);
    attachPokemonRowNavigationHandlers();
}

async function loadBaseStatsForPokemon(pokemonName) {
    const map = await loadBaseStatsMap();
    if (!map) return null;
    return map[toId(pokemonName)] || null;
}

async function loadBaseStatsMap() {
    if (!baseStatsMapPromise) {
        baseStatsMapPromise = fetch('../assets/base-stats.json')
            .then(response => {
                if (!response.ok) return null;
                return response.json();
            })
            .then(data => (data && data.pokemon ? data.pokemon : null))
            .catch(error => {
                console.error('Error loading base stats:', error);
                return null;
            });
    }

    return baseStatsMapPromise;
}

async function loadMoveDataMap() {
    if (!moveDataMapPromise) {
        moveDataMapPromise = fetch('../assets/move-data.json')
            .then(response => {
                if (!response.ok) return null;
                return response.json();
            })
            .then(data => (data && data.moves ? data.moves : null))
            .catch(error => {
                console.error('Error loading move data:', error);
                return null;
            });
    }

    return moveDataMapPromise;
}

async function loadItemNameMap() {
    if (!itemNameMapPromise) {
        itemNameMapPromise = fetch('../assets/item-name-map.json')
            .then(response => {
                if (!response.ok) return null;
                return response.json();
            })
            .then(data => (data && data.items ? data.items : null))
            .catch(error => {
                console.error('Error loading item name map:', error);
                return null;
            });
    }

    return itemNameMapPromise;
}

async function loadAbilityDataMap() {
    if (!abilityDataMapPromise) {
        abilityDataMapPromise = fetch('../assets/ability-data.json')
            .then(response => {
                if (!response.ok) return null;
                return response.json();
            })
            .then(data => (data && data.abilities ? data.abilities : null))
            .catch(error => {
                console.error('Error loading ability data:', error);
                return null;
            });
    }

    return abilityDataMapPromise;
}

async function loadFormatNameMap() {
    if (!formatNameMapPromise) {
        formatNameMapPromise = fetch('../assets/format-name-map.json')
            .then(response => {
                if (!response.ok) return null;
                return response.json();
            })
            .then(data => (data && data.formats ? data.formats : null))
            .catch(error => {
                console.error('Error loading format name map:', error);
                return null;
            });
    }

    return formatNameMapPromise;
}

async function populateFormatSwitcher(pokemonName, currentFormatKey, currentFormatDisplayName, rating, latestPeriod) {
    const inputEl = document.getElementById('pokemon-format-select');
    const listEl = document.getElementById('pokemon-format-options');
    const currentEl = document.getElementById('pokemon-format-current');
    if (!inputEl || !listEl) return;

    inputEl.disabled = true;
    inputEl.value = '';
    inputEl.placeholder = 'Search Formats';
    listEl.innerHTML = '<option value="Loading formats..."></option>';
    if (currentEl) currentEl.textContent = currentFormatDisplayName;

    const options = await loadAllFormatOptions(latestPeriod);
    const available = options.length > 0
        ? options
        : [{ key: currentFormatKey, displayName: currentFormatDisplayName }];

    listEl.innerHTML = available
        .map(option => `<option value="${escapeHtml(option.displayName)}"></option>`)
        .join('');

    inputEl.disabled = available.length === 0;
    inputEl.placeholder = 'Search Formats';

    const navigateToSelection = () => {
        const nextFormat = resolveFormatKeyFromInput(inputEl.value, available);
        if (!nextFormat || nextFormat === currentFormatKey) return;

        const params = new URLSearchParams();
        params.set('format', nextFormat);
        params.set('pokemon', pokemonName);
        if (rating && rating !== 'all') {
            params.set('rating', rating);
        }

        const path = window.location.pathname || 'pokemon.html';
        window.location.href = `${path}?${params.toString()}`;
    };

    inputEl.onchange = navigateToSelection;
    inputEl.onkeydown = event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            navigateToSelection();
        }
    };
}

function resolveFormatKeyFromInput(inputValue, options) {
    const raw = String(inputValue || '').trim();
    if (!raw || !Array.isArray(options)) return '';

    const normalized = raw.toLowerCase();
    const byDisplay = options.find(option => String(option.displayName || '').toLowerCase() === normalized);
    if (byDisplay) return byDisplay.key;

    const byKey = options.find(option => String(option.key || '').toLowerCase() === normalized);
    if (byKey) return byKey.key;

    return '';
}

async function loadAllFormatOptions(latestPeriod) {
    if (!latestPeriod) return [];

    try {
        const response = await fetch(`${encodeURIComponent(latestPeriod)}.json`);
        if (!response.ok) return [];

        const latestData = await response.json();
        if (!latestData || !Array.isArray(latestData.formats)) return [];

        return latestData.formats
            .map(format => ({
                key: getFormatKey(format),
                totalBattles: Number(format.total_battles) || 0,
                displayName: getDisplayFormatName(getFormatKey(format))
            }))
            .filter(format => Boolean(format.key))
            .sort((a, b) => {
                if (b.totalBattles !== a.totalBattles) return b.totalBattles - a.totalBattles;
                return a.displayName.localeCompare(b.displayName);
            });
    } catch (error) {
        console.error('Error loading format options:', error);
        return [];
    }
}

function getMostUsedPokemonEntry(pokemonList) {
    if (!Array.isArray(pokemonList) || pokemonList.length === 0) return null;

    return [...pokemonList]
        .filter(p => p && typeof p === 'object')
        .sort((a, b) => {
            const usageDiff = Number(b.usage_pct || 0) - Number(a.usage_pct || 0);
            if (usageDiff !== 0) return usageDiff;

            const countDiff = Number(b.usage_count || 0) - Number(a.usage_count || 0);
            if (countDiff !== 0) return countDiff;

            return String(a.pokemon_name || '').localeCompare(String(b.pokemon_name || ''));
        })[0] || null;
}

function getFormatKey(format) {
    if (!format || typeof format !== 'object') return '';
    return String(format.format_name || format.name || '').trim();
}

function getDisplayFormatName(formatName) {
    const key = String(formatName || '').trim();
    if (key && formatNameMap && formatNameMap[key]) {
        return String(formatNameMap[key]);
    }
    return key;
}

function renderBaseStatsSection(title, baseStats) {
    if (!baseStats || typeof baseStats !== 'object') return '';

    const bstValue = Number(baseStats.bst);
    const bst = Number.isNaN(bstValue)
        ? baseStatLabels.reduce((sum, [key]) => sum + (Number(baseStats[key]) || 0), 0)
        : bstValue;

    const rows = baseStatLabels
        .map(([key, label]) => {
            const value = Number(baseStats[key]);
            if (Number.isNaN(value)) return '';
            return renderBaseStatRow(label, value, maxBaseStat);
        })
        .join('') + renderBaseStatRow('BST', bst, maxBaseStatTotal, getBstTier(bst));

    return `
        <section class="pokemon-detail-section">
            <h3>${escapeHtml(title)}</h3>
            <ul class="base-stats-list">
                ${rows}
            </ul>
        </section>
    `;
}

function renderBaseStatRow(label, value, maxValue, tierOverride = null) {
    const safeValue = Number.isFinite(value) ? value : 0;
    const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : maxBaseStat;
    const percentage = Math.max(0, Math.min(100, (safeValue / safeMax) * 100));
    const tier = Number.isFinite(tierOverride) ? tierOverride : getBaseStatTier(percentage);

    return `
        <li class="base-stats-row">
            <span class="base-stats-label">${label}</span>
            <div class="base-stats-track" role="img" aria-label="${label} base stat ${safeValue}">
                <span class="base-stats-fill stat-tier-${tier}" style="width: ${percentage.toFixed(2)}%"></span>
            </div>
            <span class="base-stats-value stat-tier-text-${tier}">${safeValue}</span>
        </li>
    `;
}

function getBaseStatTier(percentage) {
    if (percentage < 20) return 1;
    if (percentage < 30) return 2;
    if (percentage < 40) return 3;
    if (percentage < 50) return 4;
    if (percentage < 60) return 5;
    return 6;
}

function getBstTier(bstValue) {
    const bst = Math.max(0, Number(bstValue) || 0);
    // Use BST-specific tiers: 600 is pseudo/legendary territory and ~780 is current highest.
    if (bst < 300) return 1;
    if (bst < 400) return 2;
    if (bst < 500) return 3;
    if (bst < 600) return 4;
    if (bst < 700) return 5;
    if (bst >= highestCurrentBst) return 6;
    return 6;
}

function getPokemonMonthlyRank(pokemonList, pokemonName) {
    if (!Array.isArray(pokemonList) || !pokemonName) return 0;

    const ranked = [...pokemonList]
        .filter(p => p && typeof p === 'object')
        .sort((a, b) => {
            const usageDiff = Number(b.usage_pct || 0) - Number(a.usage_pct || 0);
            if (usageDiff !== 0) return usageDiff;

            const countDiff = Number(b.usage_count || 0) - Number(a.usage_count || 0);
            if (countDiff !== 0) return countDiff;

            return String(a.pokemon_name || '').localeCompare(String(b.pokemon_name || ''));
        });

    const targetName = String(pokemonName || '').toLowerCase();
    const index = ranked.findIndex(p => String(p.pokemon_name || '').toLowerCase() === targetName);
    return index >= 0 ? index + 1 : 0;
}

function findPokemonEntry(pokemonList, pokemonName) {
    const exact = pokemonList.find(p => p.pokemon_name === pokemonName);
    if (exact) return exact;
    const target = pokemonName.trim().toLowerCase();
    return pokemonList.find(p => String(p.pokemon_name || '').toLowerCase() === target) || null;
}

function renderMapSection(title, map) {
    if (!map || typeof map !== 'object') return '';
    const entries = Object.entries(map)
        .map(([key, value]) => [key, Number(value)])
        .filter(([, value]) => !Number.isNaN(value))
        .sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) return '';

    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    const limitedTitles = new Set(['Items', 'Spreads', 'Moves']);
    const visibleEntries = limitedTitles.has(title) ? entries.slice(0, 25) : entries;

    const rows = visibleEntries
        .map(([key, value]) => {
            const percentage = total > 0 ? (value / total) * 100 : 0;
            if (roundsToDisplayedZero(percentage)) return '';
            const rowHref = title === 'Teammates' ? getPokemonDetailHref(key) : '';
            const rowAttrs = rowHref
                ? ` class="pokemon-nav-row" data-href="${escapeHtml(rowHref)}" tabindex="0" role="link" aria-label="View ${escapeHtml(String(key || 'Pokemon'))} details"`
                : '';

            const firstCell = title === 'Moves'
                ? renderMoveNameCell(key)
                : title === 'Items'
                    ? renderItemNameCell(key)
                : title === 'Abilities'
                    ? renderAbilityNameCell(key)
                : title === 'Tera Types'
                    ? renderTeraTypeCell(key)
                : title === 'Teammates'
                    ? renderPokemonIconNameCell(key, {
                        spriteBase: mysteryDungeonSpriteBase,
                        fallbackBase: iconSpriteBase
                    })
                : title === 'Spreads'
                    ? escapeHtml(formatSpreadLabel(key))
                : escapeHtml(key);

            return `
            <tr${rowAttrs}>
                <td>${firstCell}</td>
                <td class="detail-value">${percentage.toFixed(2)}%</td>
            </tr>
        `;
        })
        .filter(Boolean)
        .join('');

    if (!rows) return '';

    const wideClass = title === 'Spreads' ? ' pokemon-detail-section--wide' : '';
    return `
        <section class="pokemon-detail-section${wideClass}">
            <h3>${escapeHtml(title)}</h3>
            <table class="detail-table">
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </section>
    `;
}

function formatSpreadLabel(text) {
    return String(text || '')
        .replace(/:\s*/g, ': ')
        .replace(/\s*\/\s*/g, ' / ');
}

function renderMoveNameCell(moveName) {
    const moveInfo = getMoveDataByName(moveName);
    const displayName = moveInfo && moveInfo.name ? String(moveInfo.name) : String(moveName);
    const hasType = moveInfo && moveInfo.type;
    const typeText = hasType ? String(moveInfo.type) : '???';
    const typeSpriteSrc = getTypeSpriteSrc(typeText);

    const pp = formatMoveStatValue(moveInfo ? moveInfo.pp : null);
    const bp = formatMoveStatValue(moveInfo ? moveInfo.basePower : null);
    const acc = formatMoveAccuracy(moveInfo ? moveInfo.accuracy : null);
    const pri = formatMovePriority(moveInfo ? moveInfo.priority : null);
    const priMeta = pri ? ` | Prio ${pri}` : '';
    const description = moveInfo && moveInfo.description ? String(moveInfo.description) : '';

    return `
        <div class="move-cell">
            <div class="move-title-row">
                ${typeSpriteSrc
            ? `<img class="move-type-sprite" src="${escapeHtml(typeSpriteSrc)}" alt="${escapeHtml(typeText)}" loading="lazy">`
            : `<span class="move-type-icon move-type-unknown" aria-label="Move type ${escapeHtml(typeText)}">${escapeHtml(typeText)}</span>`}
                <span class="move-name">${escapeHtml(displayName)}</span>
            </div>
            <div class="move-meta">PP ${pp} | BP ${bp} | Acc ${acc}${priMeta}</div>
            ${description ? `<div class="move-description" title="${escapeHtml(description)}">${escapeHtml(description)}</div>` : ''}
        </div>
    `;
}

function getTypeSpriteSrc(typeName) {
    const typeId = toId(typeName);
    const spriteIndex = typeSpriteIndexById[typeId];
    if (!spriteIndex) return null;
    return `${typeSpriteBase}/${spriteIndex}.png`;
}

function renderTeraTypeCell(typeName) {
    const displayName = formatTypeLabel(typeName);
    const typeSpriteSrc = getTypeSpriteSrc(typeName);

    return `
        <div class="tera-type-cell">
            ${typeSpriteSrc
            ? `<img class="tera-type-sprite" src="${escapeHtml(typeSpriteSrc)}" alt="${escapeHtml(displayName)}" loading="lazy">`
            : `<span class="move-type-icon move-type-unknown" aria-label="Type ${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>`}
            <span class="tera-type-name">${escapeHtml(displayName)}</span>
        </div>
    `;
}

function renderPokemonHeaderTypes(types) {
    if (!Array.isArray(types) || types.length === 0) return '';

    return types
        .slice(0, 2)
        .map(typeName => {
            const displayName = formatTypeLabel(typeName);
            const typeSpriteSrc = getTypeSpriteSrc(typeName);

            if (typeSpriteSrc) {
                return `<img class="pokemon-header-type-sprite" src="${escapeHtml(typeSpriteSrc)}" alt="${escapeHtml(displayName)}" loading="lazy">`;
            }

            return `<span class="move-type-icon move-type-unknown" aria-label="Type ${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>`;
        })
        .join('');
}

function formatTypeLabel(typeName) {
    const raw = String(typeName || '').trim();
    if (!raw) return '???';

    return raw
        .replace(/[-_]+/g, ' ')
        .split(/\s+/)
        .map(word => {
            const lower = word.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
}

function renderItemNameCell(itemName) {
    const itemInfo = getItemDataByName(itemName);
    const spriteFile = itemInfo && itemInfo.file ? String(itemInfo.file) : `${toKebabCase(itemName)}.png`;
    const displayName = formatItemNameFromFile(spriteFile) || String(itemName);
    const spriteSrc = `${itemSpriteBase}/${spriteFile}`;

    return `
        <div class="item-cell">
            <img class="item-sprite" src="${escapeHtml(spriteSrc)}" alt="${escapeHtml(displayName)}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(itemSpriteFallback)}';">
            <span class="item-name">${escapeHtml(displayName)}</span>
        </div>
    `;
}

function renderAbilityNameCell(abilityName) {
    const abilityInfo = getAbilityDataByName(abilityName);
    const displayName = abilityInfo && abilityInfo.name ? String(abilityInfo.name) : String(abilityName || 'Unknown');
    const description = abilityInfo && abilityInfo.description ? String(abilityInfo.description) : '';

    return `
        <div class="ability-cell">
            <span class="ability-name">${escapeHtml(displayName)}</span>
            ${description ? `<div class="ability-description" title="${escapeHtml(description)}">${escapeHtml(description)}</div>` : ''}
        </div>
    `;
}

function renderPokemonIconNameCell(pokemonName, options = {}) {
    const displayName = String(pokemonName || 'Unknown');
    const href = getPokemonDetailHref(pokemonName);
    const spriteBase = options.spriteBase || iconSpriteBase;
    const fallbackBase = options.fallbackBase || iconSpriteBase;
    const preferredSlug = getPokemonIconSlug(pokemonName, true);
    const fallbackSlug = getPokemonIconSlug(pokemonName, false);
    const candidateSources = [
        preferredSlug ? `${spriteBase}/${preferredSlug}.png` : '',
        fallbackSlug && fallbackSlug !== preferredSlug ? `${spriteBase}/${fallbackSlug}.png` : '',
        fallbackBase !== spriteBase && preferredSlug ? `${fallbackBase}/${preferredSlug}.png` : '',
        fallbackBase !== spriteBase && fallbackSlug && fallbackSlug !== preferredSlug ? `${fallbackBase}/${fallbackSlug}.png` : ''
    ].filter(Boolean);

    const sources = [...new Set(candidateSources)];
    const iconSrc = sources[0] || '';
    const fallbackSources = sources.slice(1).join('|');
    const onErrorCode = fallbackSources
        ? "const fallbacks=(this.dataset.fallbacks||'').split('|').filter(Boolean);if(!fallbacks.length){this.onerror=null;this.style.display='none';return;}this.src=fallbacks.shift();this.dataset.fallbacks=fallbacks.join('|');"
        : "this.style.display='none';";

    return `
        <a class="pokemon-inline-cell pokemon-inline-link" href="${escapeHtml(href)}" aria-label="View ${escapeHtml(displayName)} details">
            ${iconSrc
            ? `<img class="pokemon-inline-icon" src="${escapeHtml(iconSrc)}" alt="${escapeHtml(displayName)}" loading="lazy" data-fallbacks="${escapeHtml(fallbackSources)}" onerror="${onErrorCode}">`
            : ''}
            <span class="pokemon-inline-name">${escapeHtml(displayName)}</span>
        </a>
    `;
}

function getPokemonDetailHref(pokemonName) {
    const name = String(pokemonName || '').trim();
    if (!name) return window.location.pathname || 'pokemon.html';

    const currentParams = new URLSearchParams(window.location.search);
    const nextParams = new URLSearchParams();
    const format = currentParams.get('format');
    const rating = currentParams.get('rating');

    if (format) nextParams.set('format', format);
    nextParams.set('pokemon', name);
    if (rating && rating !== 'all') nextParams.set('rating', rating);

    const path = window.location.pathname || 'pokemon.html';
    return `${path}?${nextParams.toString()}`;
}

function getPokemonIconSlug(pokemonName, preferRegionalAdjective) {
    const base = toKebabCase(pokemonName);
    if (!base) return '';

    if (!preferRegionalAdjective) {
        return base;
    }

    return base
        .replace(/-hisui/g, '-hisuian')
        .replace(/-alola/g, '-alolan')
        .replace(/-galar/g, '-galarian')
        .replace(/-paldea/g, '-paldean');
}

function getItemDataByName(itemName) {
    if (!itemNameMap || !itemName) return null;
    return itemNameMap[toId(itemName)] || null;
}

function toKebabCase(text) {
    return String(text || '')
    // Keep name fragments together for forms like Pa'u -> pau.
    .replace(/[\u2019'`,]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function formatItemNameFromFile(fileName) {
    const base = String(fileName || '').replace(/\.png$/i, '');
    const spaced = base.replace(/[-_]+/g, ' ').trim();
    if (!spaced) return '';

    return spaced
        .split(/\s+/)
        .map(word => {
            const lower = word.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
}

function getMoveDataByName(moveName) {
    if (!moveDataMap || !moveName) return null;
    return moveDataMap[toId(moveName)] || null;
}

function getAbilityDataByName(abilityName) {
    if (!abilityDataMap || !abilityName) return null;
    return abilityDataMap[toId(abilityName)] || null;
}

function formatMoveStatValue(value) {
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : '--';
}

function formatMoveAccuracy(value) {
    if (value === true) return '--';
    return formatMoveStatValue(value);
}

function formatMovePriority(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return '';
    return num > 0 ? `+${num}` : String(num);
}

function roundsToDisplayedZero(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return true;
    return Number(num.toFixed(2)) === 0;
}

function renderArraySection(title, items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const listItems = items.map(item => `<li>${escapeHtml(String(item))}</li>`).join('');
    return `
        <section class="pokemon-detail-section">
            <h3>${escapeHtml(title)}</h3>
            <ul class="detail-list">
                ${listItems}
            </ul>
        </section>
    `;
}

function renderCountersSection(title, counters, sortState) {
    if (!counters || typeof counters !== 'object') return '';

    const entries = Object.entries(counters)
        .map(([name, values]) => {
            if (!Array.isArray(values) || values.length < 3) return null;
            const [count, rate, variance] = values.map(Number);
            if ([count, rate, variance].some(Number.isNaN)) return null;
            return { name, count, rate, variance };
        })
        .filter(Boolean);

    if (entries.length === 0) return '';

    const totalCount = entries.reduce((sum, entry) => sum + entry.count, 0);

    // Keep variance in ranking to prefer reliable check rates.
    const sortedEntries = [...entries].sort((a, b) => {
        const direction = sortState.direction === 'asc' ? 1 : -1;
        if (sortState.key === 'count') {
            if (a.count === b.count) return a.name.localeCompare(b.name) * direction;
            return (a.count - b.count) * direction;
        }

        const aScore = a.rate - a.variance;
        const bScore = b.rate - b.variance;
        if (aScore === bScore) return (a.count - b.count) * direction;
        return (aScore - bScore) * direction;
    });

    const rows = sortedEntries
        .map(({ name, count, rate }) => {
            const ratePct = rate * 100;
            const countPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
            if (roundsToDisplayedZero(ratePct) || roundsToDisplayedZero(countPct)) return '';
            const rowHref = getPokemonDetailHref(name);

            return `
            <tr class="pokemon-nav-row" data-href="${escapeHtml(rowHref)}" tabindex="0" role="link" aria-label="View ${escapeHtml(String(name || 'Pokemon'))} details">
                <td>${renderPokemonIconNameCell(name)}</td>
                <td class="detail-value">${ratePct.toFixed(2)}%</td>
                <td class="detail-value">${countPct.toFixed(2)}%</td>
            </tr>
        `;
        })
        .filter(Boolean)
        .join('');

    if (!rows) return '';

    const rateArrow = getSortArrow(sortState, 'rate');
    const countArrow = getSortArrow(sortState, 'count');

    return `
        <section id="counters-section" class="pokemon-detail-section pokemon-detail-section--full">
            <h3>${escapeHtml(title)}</h3>
            <table class="detail-table detail-table--counters">
                <thead>
                    <tr>
                        <th>Pokemon</th>
                        <th><button type="button" class="counters-sort-btn" data-sort-key="rate">Check/Counter ${rateArrow}</button></th>
                        <th><button type="button" class="counters-sort-btn" data-sort-key="count">Match Count ${countArrow}</button></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </section>
    `;
}

function attachCountersSortHandlers(counters) {
    const buttons = document.querySelectorAll('.counters-sort-btn');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const key = button.dataset.sortKey;
            if (!key) return;

            if (countersSortState.key === key) {
                countersSortState.direction = countersSortState.direction === 'desc' ? 'asc' : 'desc';
            } else {
                countersSortState.key = key;
                countersSortState.direction = 'desc';
            }

            const section = document.getElementById('counters-section');
            if (!section) return;
            section.outerHTML = renderCountersSection('Checks and Counters', counters, countersSortState);
            attachCountersSortHandlers(counters);
            attachPokemonRowNavigationHandlers();
        });
    });
}

function attachPokemonRowNavigationHandlers() {
    const rows = document.querySelectorAll('tr.pokemon-nav-row[data-href]');
    rows.forEach(row => {
        if (row.dataset.navBound === '1') return;
        row.dataset.navBound = '1';

        const navigate = () => {
            const href = row.dataset.href;
            if (!href) return;
            window.location.href = href;
        };

        row.addEventListener('click', event => {
            if (event.target && event.target.closest('a, button')) return;
            navigate();
        });

        row.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate();
            }
        });
    });
}

function getSortArrow(sortState, key) {
    if (sortState.key !== key) return '⇅';
    return sortState.direction === 'asc' ? '↑' : '↓';
}

function getPokemonSpritePaths(pokemonName) {
    const safeName = sanitizeSpriteName(pokemonName);
    if (!safeName) {
        return {
            showdown: spritePlaceholder,
            original: spritePlaceholder,
            placeholder: spritePlaceholder
        };
    }

    return {
        showdown: `${spriteShowdownBase}/${encodePathSegment(`${safeName}.gif`)}`,
        original: `${spriteOriginalBase}/${encodePathSegment(`${safeName}.png`)}`,
        placeholder: spritePlaceholder
    };
}

function sanitizeSpriteName(name) {
    if (!name) return '';
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[<>:"/\\|\?\*]/g, '-')
        .replace(/[\s.]+$/g, '')
        .trim();
}

function encodePathSegment(path) {
    return path
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

async function loadPokemonData(formatName, rating) {
    const ratingValue = rating === 'all' ? '0' : rating || '0';
    const requestedPath = `formats/${encodeURIComponent(formatName)}/${ratingValue}.json`;

    try {
        const response = await fetch(requestedPath);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Error loading pokemon data:', error);
    }

    if (ratingValue !== '0') {
        try {
            const fallbackResponse = await fetch(`formats/${encodeURIComponent(formatName)}/0.json`);
            if (fallbackResponse.ok) {
                return await fallbackResponse.json();
            }
        } catch (error) {
            console.error('Error loading fallback pokemon data:', error);
        }
    }

    return null;
}

function showError(message) {
    const detail = document.getElementById('pokemon-detail');
    if (detail) detail.style.display = 'none';
    const errorEl = document.getElementById('pokemon-error');
    if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.textContent = message;
    }
}

function formatNumber(num) {
    return Number(num).toLocaleString('en-US');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toId(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}
