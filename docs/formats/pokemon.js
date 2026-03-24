// Pokemon Showdown Stats Visualizer - Pokemon detail page

const iconSpriteBase = '../assets/sprites/icons';
const mysteryDungeonSpriteBase = '../assets/sprites/mystery-dungeon';
const typeSpriteBase = '../assets/sprites/types';
const itemSpriteBase = '../assets/sprites/items';
const itemSpriteFallback = `${itemSpriteBase}/unknown.png`;
const maxBaseStat = 220;
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
const latestFormatsDataCache = {};
let pokemonPickerOutsideClickHandler = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeGlobalHelpTooltip();
    setupShareLinkButton();
    loadPokemonDetail();

    window.addEventListener('popstate', () => {
        loadPokemonDetail();
    });
});

function spaNavigate(params) {
    const path = window.location.pathname || 'pokemon.html';
    const query = params.toString();
    const nextUrl = query ? `${path}?${query}` : path;
    window.history.pushState({}, '', nextUrl);
    loadPokemonDetail();
}

function setupShareLinkButton() {
    const button = document.getElementById('share-link-btn');
    if (!button) return;

    const labelEl = button.querySelector('.share-link-label');
    const defaultText = labelEl ? (labelEl.textContent || 'Share') : 'Share';

    button.addEventListener('click', async () => {
        const success = await copyTextToClipboard(window.location.href);
        button.classList.toggle('is-copied', success);
        if (labelEl) {
            labelEl.textContent = success ? 'Copied!' : 'Copy failed';
        }

        window.setTimeout(() => {
            button.classList.remove('is-copied');
            if (labelEl) {
                labelEl.textContent = defaultText;
            }
        }, 1400);
    });
}

async function copyTextToClipboard(text) {
    if (!text) return false;

    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_error) {
            // Fallback to execCommand path below.
        }
    }

    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const copied = document.execCommand('copy');
        document.body.removeChild(textArea);
        return copied;
    } catch (_error) {
        return false;
    }
}

async function loadPokemonDetail() {
    renderPokemonDetailSkeleton();

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
            const usageDateEl = document.getElementById('usage-stats-date');
            if (usageDateEl) {
                usageDateEl.textContent = `Usage stats data from ${index.latest}`;
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

    populatePokemonSwitcher(entry.pokemon_name, formatName, rating, pokemonData.pokemon);
    await populateRatingFilter(formatName, rating, entry.pokemon_name, latestPeriod);
    await populateFormatSwitcher(entry.pokemon_name, formatName, displayFormatName, rating, latestPeriod);

    const usageEl = document.getElementById('pokemon-usage');
    const isMeta = isMetaPokemon(entry.usage_pct);
    if (usageEl) {
        const usagePct = entry.usage_pct !== undefined ? entry.usage_pct.toFixed(2) : '0.00';
        const usageCount = entry.usage_count !== undefined ? formatNumber(entry.usage_count) : '0';
        const usageTierClass = getUsageTierClass(entry.usage_pct);
        const usageClassAttr = usageTierClass ? ` class="${usageTierClass}"` : '';
        const metaTooltip = isMeta
            ? ` <span class="help-tooltip" aria-label="Meta criteria" data-tooltip="Pokemon with at least 4.52% weighted usage are highlighted. For OU/UU/RU/NU/PU formats, a Pokemon is truly in their tier if a typical competitive player is more than 50% likely to encounter it at least once in a day of playing (15 battles)." tabindex="0">?</span>`
            : '';
        usageEl.innerHTML = `Usage: <span${usageClassAttr}>${escapeHtml(`${usagePct}%`)}</span> (${escapeHtml(`${usageCount} battles`)})${metaTooltip}`;
    }

    const rankingEl = document.getElementById('pokemon-ranking');
    if (rankingEl) {
        const monthlyRank = getPokemonMonthlyRank(pokemonData.pokemon, entry.pokemon_name);
        if (monthlyRank > 0) {
            const usageTierClass = getUsageTierClass(entry.usage_pct);
            const rankClass = usageTierClass ? ` class="${usageTierClass}"` : '';
            rankingEl.innerHTML = `Monthly Ranking: <span${rankClass}>#${escapeHtml(String(monthlyRank))}</span>`;
        } else {
            rankingEl.textContent = 'Monthly Ranking: --';
        }
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

    grid.style.opacity = '';
    grid.style.pointerEvents = '';
    grid.style.transition = '';

    attachCountersSortHandlers(entry.counters_json);
    attachPokemonRowNavigationHandlers();
}

function renderPokemonDetailSkeleton() {
    const grid = document.getElementById('pokemon-detail-grid');
    if (!grid) return;

    // If content already exists, dim it instead of replacing with skeleton cards.
    // This avoids layout flashing on fast SPA navigations.
    if (grid.children.length > 0) {
        grid.style.opacity = '0.45';
        grid.style.pointerEvents = 'none';
        grid.style.transition = 'opacity 0.15s ease';
        return;
    }

    const cards = Array.from({ length: 6 }, () => `
        <section class="pokemon-detail-section pokemon-detail-skeleton-card" aria-hidden="true">
            <div class="skeleton-line skeleton-line--lg"></div>
            <div class="skeleton-line skeleton-line--md"></div>
            <div class="skeleton-line skeleton-line--md"></div>
            <div class="skeleton-line skeleton-line--sm"></div>
        </section>
    `).join('');

    grid.innerHTML = cards;
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

async function populateFormatSwitcher(pokemonName, currentFormatKey, currentFormatDisplayName, rating, latestPeriod) {
    const selectEl = document.getElementById('pokemon-format-select');
    if (!selectEl) return;

    selectEl.disabled = true;
    selectEl.innerHTML = `<option value="">${escapeHtml(currentFormatDisplayName || 'Loading formats...')}</option>`;

    const options = await loadAllFormatOptions(latestPeriod);
    const available = options.length > 0
        ? options
        : [{ key: currentFormatKey, displayName: currentFormatDisplayName }];

    selectEl.innerHTML = available
        .map(option => `<option value="${escapeHtml(option.key)}">${escapeHtml(option.displayName)}</option>`)
        .join('');

    if (available.some(option => option.key === currentFormatKey)) {
        selectEl.value = currentFormatKey;
    }

    selectEl.disabled = available.length === 0;

    selectEl.onchange = () => {
        const nextFormat = String(selectEl.value || '').trim();
        if (!nextFormat || nextFormat === currentFormatKey) return;

        const params = new URLSearchParams();
        params.set('format', nextFormat);
        params.set('pokemon', pokemonName);
        if (rating && rating !== 'all') {
            params.set('rating', rating);
        }

        spaNavigate(params);
    };
}

function populatePokemonSwitcher(currentPokemonName, formatName, currentRating, pokemonEntries) {
    const inputEl = document.getElementById('pokemon-picker-select');
    const menuEl = document.getElementById('pokemon-picker-menu');
    if (!inputEl || !menuEl || !Array.isArray(pokemonEntries)) return;

    const sortedPokemon = [...pokemonEntries].sort((a, b) => {
        const usageDiff = Number.parseFloat(b.usage_pct) - Number.parseFloat(a.usage_pct);
        if (usageDiff !== 0) return usageDiff;

        const countDiff = Number.parseInt(b.usage_count, 10) - Number.parseInt(a.usage_count, 10);
        if (countDiff !== 0) return countDiff;

        return a.pokemon_name.localeCompare(b.pokemon_name);
    });

    inputEl.value = currentPokemonName;
    inputEl.placeholder = 'Search Pokemon or move';
    let hasTypedFilter = false;

    const navigateToPokemon = nextPokemon => {
        if (!nextPokemon || nextPokemon === currentPokemonName) return;

        const params = new URLSearchParams();
        params.set('format', formatName);
        params.set('pokemon', nextPokemon);
        if (currentRating && currentRating !== 'all') {
            params.set('rating', currentRating);
        }

        spaNavigate(params);
    };

    const closeMenu = () => {
        menuEl.classList.remove('is-open');
        inputEl.setAttribute('aria-expanded', 'false');
    };

    const openMenu = () => {
        if (!menuEl.childElementCount) return;
        menuEl.classList.add('is-open');
        inputEl.setAttribute('aria-expanded', 'true');
    };

    const renderOptions = (applyFilter) => {
        const query = inputEl.value.trim().toLowerCase();
        const shouldFilter = applyFilter && query.length > 0;
        const visiblePokemon = shouldFilter
            ? sortedPokemon.filter(pokemon => pokemonMatchesPickerQuery(pokemon, query))
            : sortedPokemon;

        menuEl.innerHTML = '';
        if (!visiblePokemon.length) {
            const empty = document.createElement('div');
            empty.className = 'pokemon-picker-empty';
            empty.textContent = 'No Pokemon found.';
            menuEl.appendChild(empty);
            openMenu();
            return;
        }

        for (const pokemon of visiblePokemon) {
            const usagePct = Number(pokemon.usage_pct) || 0;
            const isMeta = isMetaPokemon(usagePct);
            const isLowUsage = usagePct < 1;
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'pokemon-picker-option';
            option.setAttribute('role', 'option');
            option.dataset.pokemon = pokemon.pokemon_name;

            if (isMeta) {
                option.classList.add('pokemon-picker-option--meta');
            }

            if (pokemon.pokemon_name === currentPokemonName) {
                option.classList.add('is-active');
            }

            const left = document.createElement('span');
            left.className = 'pokemon-picker-option-main pokemon-inline-cell';

            const iconImg = createPokemonInlineIcon(pokemon.pokemon_name);
            if (iconImg) {
                left.appendChild(iconImg);
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'pokemon-picker-option-name';
            nameSpan.textContent = pokemon.pokemon_name;
            left.appendChild(nameSpan);

            const usageSpan = document.createElement('span');
            usageSpan.className = 'pokemon-picker-option-usage';
            usageSpan.textContent = `${formatPercent(pokemon.usage_pct)}%`;

            if (isMeta) {
                usageSpan.classList.add('pokemon-picker-option-usage--meta');
            } else if (isLowUsage) {
                usageSpan.classList.add('pokemon-picker-option-usage--low');
            } else {
                usageSpan.classList.add('pokemon-picker-option-usage--mid');
            }

            option.appendChild(left);
            option.appendChild(usageSpan);
            menuEl.appendChild(option);
        }

        openMenu();

        // When opening the unfiltered list, keep the current selection in view
        // so the picker starts near the selected Pokemon instead of the top.
        if (!shouldFilter) {
            requestAnimationFrame(() => {
                const activeOption = menuEl.querySelector('.pokemon-picker-option.is-active');
                if (activeOption) {
                    const optionOffsetTop = activeOption.offsetTop;
                    menuEl.scrollTop = Math.max(0, optionOffsetTop);
                }
            });
        }
    };

    closeMenu();

    inputEl.onfocus = () => {
        renderOptions(hasTypedFilter);
    };

    inputEl.onclick = () => {
        renderOptions(hasTypedFilter);
    };

    inputEl.oninput = () => {
        hasTypedFilter = true;
        renderOptions(true);
    };

    inputEl.onkeydown = event => {
        if (event.key === 'Escape') {
            closeMenu();
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const exactMatch = resolvePokemonFromInput(inputEl.value, sortedPokemon);
            if (exactMatch) {
                navigateToPokemon(exactMatch);
                return;
            }

            const firstOption = menuEl.querySelector('.pokemon-picker-option');
            if (firstOption) {
                navigateToPokemon(firstOption.dataset.pokemon || '');
            }
        }
    };

    menuEl.onmousedown = event => {
        event.preventDefault();
    };

    menuEl.onclick = event => {
        const option = event.target.closest('.pokemon-picker-option');
        if (!option) return;
        navigateToPokemon(option.dataset.pokemon || '');
    };

    if (pokemonPickerOutsideClickHandler) {
        document.removeEventListener('click', pokemonPickerOutsideClickHandler);
    }

    pokemonPickerOutsideClickHandler = event => {
        if (event.target === inputEl || menuEl.contains(event.target)) return;
        closeMenu();
    };

    document.addEventListener('click', pokemonPickerOutsideClickHandler);
}

async function populateRatingFilter(formatName, currentRating, pokemonName, latestPeriod) {
    const containerEl = document.getElementById('pokemon-rating-filter');
    if (!containerEl) return;

    containerEl.innerHTML = '';
    containerEl.setAttribute('aria-busy', 'true');

    const formatData = await loadFormatData(formatName);

    let parsedRatings = [];
    if (formatData && Array.isArray(formatData.available_ratings)) {
        parsedRatings = formatData.available_ratings
            .filter(rating => !Number.isNaN(rating) && rating > 0)
            .sort((a, b) => a - b);
    } else if (formatData && formatData.by_rating) {
        parsedRatings = Object.keys(formatData.by_rating)
            .map(rating => Number.parseInt(rating, 10))
            .filter(rating => !Number.isNaN(rating) && rating > 0)
            .sort((a, b) => a - b);
    }

    const visibleRatings = parsedRatings.length > 3
        ? parsedRatings.slice(-3)
        : parsedRatings;

    const options = [
        { value: 'all', label: 'All' },
        ...visibleRatings.map(rating => ({ value: String(rating), label: `${rating}+` }))
    ];

    const targetRating = currentRating && currentRating !== '0' ? String(currentRating) : 'all';
    const activeValue = options.some(option => option.value === targetRating)
        ? targetRating
        : 'all';

    for (const option of options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pokemon-rating-btn';
        button.dataset.value = option.value;
        button.textContent = option.label;
        button.setAttribute('aria-pressed', option.value === activeValue ? 'true' : 'false');

        if (option.value === activeValue) {
            button.classList.add('is-active');
        }

        button.onclick = () => {
            const nextRating = option.value || 'all';
            if (nextRating === activeValue) return;

            const params = new URLSearchParams();
            params.set('format', formatName);
            params.set('pokemon', pokemonName);
            if (nextRating !== 'all') {
                params.set('rating', nextRating);
            }

            spaNavigate(params);
        };

        containerEl.appendChild(button);
    }

    containerEl.setAttribute('aria-busy', 'false');
}

async function loadLatestFormatsData(latestPeriod) {
    const key = String(latestPeriod || '').trim();
    if (!key) return null;

    if (!latestFormatsDataCache[key]) {
        latestFormatsDataCache[key] = fetch(`../data/${encodeURIComponent(key)}.json`)
            .then(response => {
                if (!response.ok) return null;
                return response.json();
            })
            .catch(error => {
                console.error('Error loading latest formats data:', error);
                return null;
            });
    }

    return latestFormatsDataCache[key];
}

function resolvePokemonFromInput(inputValue, options) {
    const raw = String(inputValue || '').trim();
    if (!raw || !Array.isArray(options)) return '';

    const normalized = raw.toLowerCase();
    const exact = options.find(pokemon => String(pokemon.pokemon_name || '').toLowerCase() === normalized);
    return exact ? exact.pokemon_name : '';
}

function pokemonMatchesPickerQuery(pokemon, query) {
    const rawQuery = String(query || '').trim().toLowerCase();
    if (!rawQuery) return true;

    const pokemonName = String(pokemon && pokemon.pokemon_name ? pokemon.pokemon_name : '').toLowerCase();
    if (pokemonName.includes(rawQuery)) {
        return true;
    }

    const queryId = toId(rawQuery);
    if (!queryId) {
        return false;
    }

    const moves = pokemon && pokemon.moves_json && typeof pokemon.moves_json === 'object'
        ? Object.keys(pokemon.moves_json)
        : [];

    return moves.some(moveName => {
        const move = String(moveName || '').toLowerCase();
        return move.includes(rawQuery) || toId(move) === queryId;
    });
}

function formatPercent(value) {
    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric)) return '0.00';
    return numeric.toFixed(2);
}

function createPokemonInlineIcon(pokemonName) {
    const preferredSlug = getPokemonIconSlug(pokemonName, true);
    const fallbackSlug = getPokemonIconSlug(pokemonName, false);
    const candidateSources = [
        preferredSlug ? `${iconSpriteBase}/${preferredSlug}.png` : '',
        fallbackSlug && fallbackSlug !== preferredSlug ? `${iconSpriteBase}/${fallbackSlug}.png` : ''
    ].filter(Boolean);

    const sources = [...new Set(candidateSources)];
    if (!sources.length) return null;

    const img = document.createElement('img');
    img.className = 'pokemon-inline-icon';
    img.alt = String(pokemonName || 'Pokemon');
    img.loading = 'lazy';
    img.src = sources[0];

    const fallbackSources = sources.slice(1);
    img.dataset.fallbacks = fallbackSources.join('|');
    img.onerror = function () {
        const fallbacks = String(this.dataset.fallbacks || '')
            .split('|')
            .filter(Boolean);

        if (!fallbacks.length) {
            this.onerror = null;
            this.style.display = 'none';
            return;
        }

        this.src = fallbacks.shift();
        this.dataset.fallbacks = fallbacks.join('|');
    };

    return img;
}

async function loadAllFormatOptions(latestPeriod) {
    const latestData = await loadLatestFormatsData(latestPeriod);
    if (!latestData || !Array.isArray(latestData.formats)) return [];

    try {
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
    if (bst < 300) return 1;
    if (bst < 400) return 2;
    if (bst < 500) return 3;
    if (bst < 580) return 4;
    if (bst < 640) return 5;
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

function getUsageTierClass(usagePct) {
    const usage = Number(usagePct) || 0;
    if (isMetaPokemon(usage)) return 'pokemon-meta-usage';
    if (usage < 1) return 'pokemon-low-usage';
    return 'pokemon-mid-usage';
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

    if (title === 'Tera Types' && entries.length === 1) {
        const onlyType = String(entries[0][0] || '').trim().toLowerCase();
        if (onlyType === 'nothing') {
            return '';
        }
    }

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
                        fallbackBase: iconSpriteBase,
                        iconClass: 'pokemon-inline-icon--boxed'
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
    const iconClassName = options.iconClass
        ? `pokemon-inline-icon ${String(options.iconClass).trim()}`
        : 'pokemon-inline-icon';
    const onErrorCode = fallbackSources
        ? "const fallbacks=(this.dataset.fallbacks||'').split('|').filter(Boolean);if(!fallbacks.length){this.onerror=null;this.style.display='none';return;}this.src=fallbacks.shift();this.dataset.fallbacks=fallbacks.join('|');"
        : "this.style.display='none';";

    return `
        <a class="pokemon-inline-cell pokemon-inline-link" href="${escapeHtml(href)}" aria-label="View ${escapeHtml(displayName)} details">
            ${iconSrc
            ? `<img class="${escapeHtml(iconClassName)}" src="${escapeHtml(iconSrc)}" alt="${escapeHtml(displayName)}" loading="lazy" data-fallbacks="${escapeHtml(fallbackSources)}" onerror="${onErrorCode}">`
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
            spaNavigateFromHref(href);
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

    // Intercept <a> clicks inside nav rows for SPA navigation
    const links = document.querySelectorAll('tr.pokemon-nav-row a.pokemon-inline-link');
    links.forEach(link => {
        if (link.dataset.spaBound === '1') return;
        link.dataset.spaBound = '1';

        link.addEventListener('click', event => {
            event.preventDefault();
            const href = link.getAttribute('href');
            if (href) spaNavigateFromHref(href);
        });
    });
}

function spaNavigateFromHref(href) {
    const queryString = href.includes('?') ? href.split('?')[1] : '';
    if (!queryString) return;
    const params = new URLSearchParams(queryString);
    spaNavigate(params);
}

function getSortArrow(sortState, key) {
    if (sortState.key !== key) return '⇅';
    return sortState.direction === 'asc' ? '↑' : '↓';
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
