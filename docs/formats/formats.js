// Pokemon Showdown Stats Visualizer - Formats page

let statsData = null;
let currentSort = { column: 'battles', direction: 'desc' };
let currentRatingFilter = 'all';
let pokemonSort = { column: 'usage_pct', direction: 'desc' };
let selectedFormatKey = '';

// Load data on page load
document.addEventListener('DOMContentLoaded', async () => {
    initializeGlobalHelpTooltip();
    setupDataGuideModal();
    await loadLatestData();
    setupEventListeners();
    handleRouting();
});

function setupDataGuideModal() {
    const trigger = document.getElementById('open-data-guide-btn');
    if (!trigger) return;

    if (!document.getElementById('data-guide-modal')) {
        const modal = document.createElement('div');
        modal.id = 'data-guide-modal';
        modal.className = 'data-guide-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="data-guide-backdrop" data-close="true"></div>
            <div class="data-guide-panel" role="dialog" aria-modal="true" aria-labelledby="data-guide-title">
                <button class="data-guide-close" type="button" aria-label="Close guide" data-close="true">x</button>
                <h2 id="data-guide-title">How to Read These Stats</h2>
                <p>Usage % shows how often a Pokemon appears in teams for the selected format and rating.</p>
                <p>Total Usage Count is the raw number of appearances in the monthly data.</p>
                <p>Monthly Rank is ordered by Usage % (highest to lowest) for the selected format and rating.</p>
                <p>Rating filters (for example, 1500+ or 1825+) show stats from players at or above that threshold.</p>
                <p>Green-highlighted rows mark meta Pokemon based on weighted usage.</p>
                <p>Meta threshold rule: a Pokemon is highlighted if its weighted usage is at least 4.52%. For OU/UU/RU/NU/PU, this corresponds to being more than 50% likely to be encountered at least once across 15 battles.</p>
                <p class="data-guide-note">Data source: Smogon monthly usage stats.</p>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const modal = document.getElementById('data-guide-modal');
    if (!modal) return;

    const closeModal = () => {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    };

    const openModal = () => {
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
    };

    trigger.addEventListener('click', openModal);

    modal.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('[data-close="true"]')) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeModal();
        }
    });
}

// Load the latest stats data
async function loadLatestData() {
    try {
        const tableBody = document.getElementById('table-body');
        if (tableBody) {
            tableBody.innerHTML = buildFormatsTableSkeletonRows();
        }

        const periods = await loadPeriods();
        if (!periods || !periods.latest) {
            throw new Error('Failed to load periods');
        }
        const latestPeriod = String(periods.latest);

        statsData = await loadFormatSummary(latestPeriod);
        if (!statsData) {
            throw new Error('Failed to load format summary');
        }
        formatNameMap = await loadFormatNameMap();
        loadLocalBaseStatsMap();

        // Update UI
        const usageDateEl = document.getElementById('usage-stats-date');
        if (usageDateEl) {
            usageDateEl.textContent = `Latest usage stats data from ${latestPeriod}`;
        }
        document.getElementById('total-battles').textContent = formatNumber(statsData.total_battles);
        document.getElementById('format-count').textContent = statsData.formats.length;

        const initialRating = getRatingFromUrl();
        if (initialRating) {
            currentRatingFilter = initialRating;
        }

        populateRatingFilter();
        renderTable();
        setupGlobalPokemonSearch();

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('table-body').innerHTML = `
            <tr>
                <td colspan="3" class="error">
                    Failed to load data. Please try again later.
                </td>
            </tr>
        `;
    }
}

function buildFormatsTableSkeletonRows() {
    return Array.from({ length: 8 }, () => `
        <tr class="skeleton-row" aria-hidden="true">
            <td><span class="skeleton-line skeleton-line--lg"></span></td>
            <td><span class="skeleton-line skeleton-line--sm"></span></td>
            <td><span class="skeleton-line skeleton-line--sm"></span></td>
        </tr>
    `).join('');
}

// Populate the segmented rating filter buttons.
function populateRatingFilter(formatName) {
    const filterContainer = document.getElementById('rating-filter');
    if (!filterContainer) return;

    filterContainer.innerHTML = '';

    let ratings = [];
    if (formatName && statsData) {
        const format = statsData.formats.find(f => getFormatKey(f) === formatName);
        if (format && format.by_rating) {
            ratings = Object.keys(format.by_rating);
        }
    } else if (statsData && statsData.formats) {
        const ratingSet = new Set();
        statsData.formats.forEach(format => {
            if (!format.by_rating) return;
            Object.keys(format.by_rating).forEach(rating => ratingSet.add(rating));
        });
        ratings = Array.from(ratingSet);
    }

    const parsedRatings = ratings
        .map(rating => parseInt(rating, 10))
        .filter(rating => !Number.isNaN(rating))
        .sort((a, b) => a - b);

    const visibleRatings = parsedRatings.length > 3
        ? parsedRatings.slice(-3)
        : parsedRatings;

    const options = [
        { value: 'all', label: 'All' },
        ...visibleRatings.map(rating => ({ value: String(rating), label: `${rating}+` }))
    ];

    const activeValue = options.some(option => option.value === currentRatingFilter)
        ? currentRatingFilter
        : 'all';
    currentRatingFilter = activeValue;

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
            if (nextRating === currentRatingFilter) return;

            currentRatingFilter = nextRating;
            if (selectedFormatKey) {
                populateRatingFilter(selectedFormatKey);
            } else {
                populateRatingFilter();
            }
            renderTable();
            if (selectedFormatKey) {
                renderFormatDetail(selectedFormatKey);
                updateSelectionInUrl();
            }
        };

        filterContainer.appendChild(button);
    }
}

// Render the stats table
function renderTable() {
    if (!statsData) return;
    let formats = getFormatsForCurrentRating();

    // Apply sorting
    formats.sort((a, b) => {
        let comparison = 0;

        switch (currentSort.column) {
            case 'format-name':
                comparison = getFormatName(a).localeCompare(getFormatName(b));
                break;
            case 'percentage':
                comparison = a.percentage - b.percentage;
                break;
            case 'battles':
                comparison = a.total_battles - b.total_battles;
                break;
        }

        return currentSort.direction === 'asc' ? comparison : -comparison;
    });

    // Render table rows
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    formats.forEach(format => {
        const row = document.createElement('tr');
        const formatKey = getFormatKey(format);
        const formatLink = `?format=${encodeURIComponent(formatKey)}`;
        row.dataset.format = formatKey;
        if (formatKey === selectedFormatKey) {
            row.classList.add('format-row-selected');
        }

        row.innerHTML = `
            <td class="format-name"><a href="${formatLink}" class="format-link">${escapeHtml(getFormatName(format))}</a></td>
            <td class="percentage">${format.percentage.toFixed(2)}%</td>
            <td class="battles">${formatNumber(format.total_battles)}</td>
        `;

        row.addEventListener('click', () => {
            selectFormat(formatKey);
        });

        row.querySelectorAll('td').forEach(cell => {
            cell.addEventListener('click', () => {
                selectFormat(formatKey);
            });
        });

        const link = row.querySelector('.format-link');
        if (link) {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                selectFormat(formatKey);
            });
        }

        tbody.appendChild(row);
    });

    // Update sort indicators
    updateSortIndicators();
}

function getFormatsForCurrentRating() {
    if (!statsData || !Array.isArray(statsData.formats)) {
        return [];
    }

    const baseFormats = [...statsData.formats];
    if (currentRatingFilter === 'all') {
        return baseFormats;
    }

    const rating = parseInt(currentRatingFilter, 10);
    if (Number.isNaN(rating)) {
        return baseFormats;
    }

    const filtered = baseFormats
        .map(format => {
            let battles = format.by_rating && typeof format.by_rating === 'object'
                ? format.by_rating[rating]
                : undefined;

            // If exact rating doesn't exist, find closest higher rating.
            if (battles === undefined && format.by_rating && typeof format.by_rating === 'object') {
                const availableRatings = Object.keys(format.by_rating)
                    .map(r => parseInt(r, 10))
                    .filter(r => !Number.isNaN(r) && r >= rating)
                    .sort((a, b) => a - b);

                if (availableRatings.length > 0) {
                    battles = format.by_rating[availableRatings[0]];
                } else {
                    battles = 0;
                }
            }

            return {
                ...format,
                total_battles: Number(battles) || 0,
                percentage: 0
            };
        })
        .filter(format => format.total_battles > 0);

    const totalFiltered = filtered.reduce((sum, format) => sum + format.total_battles, 0);
    filtered.forEach(format => {
        format.percentage = totalFiltered > 0
            ? (format.total_battles / totalFiltered * 100)
            : 0;
    });

    return filtered;
}

// Setup event listeners
function setupEventListeners() {
    // Table header sorting
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;

            if (currentSort.column === column) {
                // Toggle direction
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                // New column, default to descending
                currentSort.column = column;
                currentSort.direction = column === 'format-name' ? 'asc' : 'desc';
            }

            renderTable();
        });
    });

    // Rating filter uses segmented buttons built in populateRatingFilter().
}

// Update sort indicator classes on table headers
function updateSortIndicators() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');

        if (th.dataset.sort === currentSort.column) {
            th.classList.add(`sort-${currentSort.direction}`);
        }
    });
}

// Get format name from URL query parameter
function getFormatFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('format');
}

function getRatingFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('rating');
}

// Handle routing based on URL
function handleRouting() {
    const requestedFormat = getFormatFromUrl();
    if (requestedFormat && statsData && statsData.formats.some(format => getFormatKey(format) === requestedFormat)) {
        selectFormat(requestedFormat, false);
        return;
    }

    const detailContent = document.getElementById('detail-content');
    if (detailContent) {
        detailContent.innerHTML = `
            <div class="loading">
                <p>Select a format to view Pokemon usage.</p>
            </div>
        `;
    }
}

function selectFormat(formatKey, updateHistory = true) {
    if (!formatKey || !statsData) return;
    const exists = statsData.formats.some(format => getFormatKey(format) === formatKey);
    if (!exists) return;

    selectedFormatKey = formatKey;
    populateRatingFilter(selectedFormatKey);
    renderTable();
    const detailRenderPromise = renderFormatDetail(selectedFormatKey);

    if (updateHistory) {
        updateSelectionInUrl();

        detailRenderPromise.finally(() => {
            if (!isStackedFormatsLayout()) return;
            scrollToFormatDetailTop();
        });
    }
}

function isStackedFormatsLayout() {
    if (window.matchMedia('(max-width: 768px)').matches) {
        return true;
    }

    const formatsPane = document.querySelector('.formats-pane');
    const detailPane = document.getElementById('format-detail');
    if (!formatsPane || !detailPane) return false;

    const formatsTop = formatsPane.getBoundingClientRect().top;
    const detailTop = detailPane.getBoundingClientRect().top;
    return detailTop - formatsTop > 24;
}

function scrollToFormatDetailTop() {
    const detailPane = document.getElementById('format-detail');
    if (!detailPane) return;

    const targetY = window.scrollY + detailPane.getBoundingClientRect().top - 8;
    const startY = window.scrollY;
    const distance = targetY - startY;
    if (Math.abs(distance) < 2) return;

    const durationMs = 420;
    const startTime = performance.now();

    const easeInOutCubic = t => (t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const step = now => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = easeInOutCubic(progress);
        window.scrollTo(0, startY + (distance * eased));

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    };

    requestAnimationFrame(step);
}

function updateSelectionInUrl() {
    const params = new URLSearchParams();
    if (selectedFormatKey) {
        params.set('format', selectedFormatKey);
    }
    if (currentRatingFilter && currentRatingFilter !== 'all') {
        params.set('rating', currentRatingFilter);
    }

    const path = window.location.pathname || 'index.html';
    const query = params.toString();
    const nextUrl = query ? `${path}?${query}` : path;
    window.history.replaceState({}, '', nextUrl);
}

// Render detail view for a specific format
async function renderFormatDetail(formatName, ratingOverride) {
    if (!statsData) return;

    const detailContent = document.getElementById('detail-content');
    if (!detailContent) return;

    detailContent.innerHTML = buildPokemonTableSkeleton();

    const format = statsData.formats.find(f => getFormatKey(f) === formatName);

    if (!format) {
        detailContent.innerHTML = `
            <div class="error">
                <p>Format "${escapeHtml(formatName)}" not found.</p>
            </div>
        `;
        return;
    }

    const rating = ratingOverride || currentRatingFilter || 'all';
    const pokemonData = await loadPokemonUsageData(getFormatKey(format), rating);
    const formatForDisplay = getFormatsForCurrentRating().find(f => getFormatKey(f) === formatName) || format;

    if (!pokemonData || !Array.isArray(pokemonData.pokemon)) {
        detailContent.innerHTML = `
            <div class="error">
                <p>Pokemon data for "${escapeHtml(getFormatName(format))}" could not be loaded.</p>
            </div>
        `;
        return;
    }

    const sortedPokemon = sortPokemonList(pokemonData.pokemon);
    const monthlyRankMap = buildMonthlyRankMapByUsagePct(pokemonData.pokemon);
    const pokemonRows = sortedPokemon
        .map((pokemon) => {
            const spritePaths = getPokemonSpritePaths(pokemon.pokemon_name);
            const isMeta = isMetaPokemon(pokemon.usage_pct);
            const usageClass = isMeta
                ? 'pokemon-meta-usage'
                : (pokemon.usage_pct < 1 ? 'pokemon-low-usage' : 'pokemon-mid-usage');
            const pokemonLink = getPokemonLink(getFormatKey(format), pokemon.pokemon_name, rating);
            const monthlyRank = monthlyRankMap.get(toId(pokemon.pokemon_name)) || 0;
            return `
            <tr class="${isMeta ? 'pokemon-meta' : ''} pokemon-row-link" data-href="${pokemonLink}" tabindex="0" role="link" aria-label="View ${escapeHtml(pokemon.pokemon_name)} details">
                <td class="pokemon-name">
                    <a class="pokemon-link" href="${pokemonLink}">
                        <span class="pokemon-name-cell">
                            <img class="pokemon-sprite" src="${spritePaths.showdown}" alt="" loading="lazy" onerror="this.onerror=function(){this.onerror=null;this.src='${spritePaths.placeholder}';};this.src='${spritePaths.original}';">
                            <span>${escapeHtml(pokemon.pokemon_name)}</span>
                        </span>
                    </a>
                </td>
                <td class="pokemon-usage ${usageClass}">${pokemon.usage_pct.toFixed(2)}%</td>
                <td class="pokemon-count">${formatNumber(pokemon.usage_count)}</td>
                <td class="pokemon-rank ${usageClass}">#${monthlyRank > 0 ? monthlyRank : '--'}</td>
            </tr>
        `;
        })
        .join('');

    detailContent.innerHTML = `
        <div class="pokemon-breakdown">
            <div class="pokemon-table-wrapper">
                <table class="pokemon-table">
                    <thead>
                        <tr>
                            <th class="pokemon-sortable" data-sort="pokemon_name">Pokemon</th>
                            <th class="pokemon-sortable" data-sort="usage_pct">Usage %
                            <span class="help-tooltip" aria-label="Meta criteria" data-tooltip="Pokemon with at least 4.52% weighted usage are highlighted. For OU/UU/RU/NU/PU formats, a Pokemon is truly in their tier if a typical competitive player is more than 50% likely to encounter it at least once in a day of playing (15 battles)." tabindex="0">?</span>
                            </th>
                            <th class="pokemon-sortable" data-sort="usage_count">Total Usage Count</th>
                            <th>Monthly Rank</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pokemonRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    setupPokemonSortListeners(getFormatKey(format), rating);
    updatePokemonSortIndicators();
    setupPokemonRowLinks(detailContent);
}

function buildPokemonTableSkeleton() {
    const rows = Array.from({ length: 8 }, () => `
        <tr class="skeleton-row">
            <td><span class="skeleton-line skeleton-line--lg"></span></td>
            <td><span class="skeleton-line skeleton-line--sm"></span></td>
            <td><span class="skeleton-line skeleton-line--sm"></span></td>
            <td><span class="skeleton-line skeleton-line--sm"></span></td>
        </tr>
    `).join('');

    return `
        <div class="pokemon-breakdown">
            <div class="pokemon-table-wrapper">
                <table class="pokemon-table">
                    <thead>
                        <tr>
                            <th>Pokemon</th>
                            <th>Usage %</th>
                            <th>Total Usage Count</th>
                            <th>Monthly Rank</th>
                        </tr>
                    </thead>
                    <tbody class="skeleton-table-body" aria-hidden="true">
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function setupPokemonRowLinks(container) {
    if (!container) return;

    const rows = container.querySelectorAll('.pokemon-table tbody tr.pokemon-row-link[data-href]');
    rows.forEach(row => {
        row.addEventListener('click', (event) => {
            if (event.target.closest('a, button')) return;
            const href = row.dataset.href;
            if (href) {
                window.location.href = href;
            }
        });

        row.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            const href = row.dataset.href;
            if (href) {
                window.location.href = href;
            }
        });
    });
}

function getFormatName(format) {
    const fallback = format.format_name || format.name || '';
    const key = getFormatKey(format);
    return getDisplayFormatName(key, fallback);
}

function getPokemonLink(formatName, pokemonName, rating) {
    const params = new URLSearchParams();
    params.set('format', formatName);
    params.set('pokemon', pokemonName);
    if (rating && rating !== 'all') {
        params.set('rating', rating);
    }
    return `pokemon.html?${params.toString()}`;
}

function sortPokemonList(pokemonList) {
    const sorted = [...pokemonList];
    sorted.sort((a, b) => {
        let comparison = 0;
        switch (pokemonSort.column) {
            case 'pokemon_name':
                comparison = a.pokemon_name.localeCompare(b.pokemon_name);
                break;
            case 'usage_count':
                comparison = a.usage_count - b.usage_count;
                break;
            case 'usage_pct':
            default:
                comparison = a.usage_pct - b.usage_pct;
                break;
        }
        return pokemonSort.direction === 'asc' ? comparison : -comparison;
    });
    return sorted;
}

function buildMonthlyRankMapByUsagePct(pokemonList) {
    const ranked = [...pokemonList]
        .filter(pokemon => pokemon && typeof pokemon === 'object')
        .sort((a, b) => {
            const usageDiff = Number(b.usage_pct || 0) - Number(a.usage_pct || 0);
            if (usageDiff !== 0) return usageDiff;

            const countDiff = Number(b.usage_count || 0) - Number(a.usage_count || 0);
            if (countDiff !== 0) return countDiff;

            return String(a.pokemon_name || '').localeCompare(String(b.pokemon_name || ''));
        });

    const rankMap = new Map();
    ranked.forEach((pokemon, index) => {
        rankMap.set(toId(pokemon.pokemon_name), index + 1);
    });

    return rankMap;
}

function setupPokemonSortListeners(formatName, rating) {
    document.querySelectorAll('.pokemon-sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (pokemonSort.column === column) {
                pokemonSort.direction = pokemonSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                pokemonSort.column = column;
                pokemonSort.direction = column === 'pokemon_name' ? 'asc' : 'desc';
            }

            renderFormatDetail(formatName, rating);
        });
    });
}

function updatePokemonSortIndicators() {
    document.querySelectorAll('.pokemon-sortable').forEach(th => {
        th.classList.remove('pokemon-sort-asc', 'pokemon-sort-desc');

        if (th.dataset.sort === pokemonSort.column) {
            th.classList.add(`pokemon-sort-${pokemonSort.direction}`);
        }
    });
}

function formatPokemonRatingLabel(eloCutoff, ratingFilter) {
    if (ratingFilter === 'all') {
        return 'All ratings';
    }
    if (eloCutoff === undefined || eloCutoff === null) {
        return `${escapeHtml(String(ratingFilter))}+`;
    }
    return `${escapeHtml(String(eloCutoff))}+`;
}

// Global Pokemon search functionality
let globalPokemonIndex = null;
let globalPokemonIndexLoadingPromise = null;
let pokemonSearchOutsideClickHandler = null;
let baseStatsMapPromise = null;
const iconSpriteBase = '../assets/sprites/icons';

function createSearchPokemonIcon(pokemonName) {
    if (!pokemonName) return null;
    const iconSlug = getPokemonIconSlugForSearch(pokemonName);
    const img = document.createElement('img');
    img.className = 'pokemon-inline-icon';
    img.alt = String(pokemonName || 'Pokemon');
    img.loading = 'lazy';
    img.src = `${iconSpriteBase}/${iconSlug}.png`;
    img.onerror = function () {
        this.onerror = null;
        this.style.display = 'none';
    };
    return img;
}

function getPokemonIconSlugForSearch(pokemonName) {
    const base = toKebabCaseForSearch(pokemonName);
    if (!base) return '';

    // Replace short form with full form names
    return base
        .replace(/-hisui/g, '-hisuian')
        .replace(/-alola/g, '-alolan')
        .replace(/-galar/g, '-galarian')
        .replace(/-paldea/g, '-paldean');
}

function toKebabCaseForSearch(text) {
    return String(text || '')
        .replace(/[\u2019'`,]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function setupGlobalPokemonSearch() {
    const searchInput = document.getElementById('global-pokemon-search');
    const dropdown = document.getElementById('pokemon-search-dropdown');
    
    if (!searchInput || !dropdown) return;

    async function ensureGlobalPokemonIndexLoaded() {
        if (!globalPokemonIndex) {
            if (!globalPokemonIndexLoadingPromise) {
                globalPokemonIndexLoadingPromise = buildGlobalPokemonIndex();
            }
            globalPokemonIndex = await globalPokemonIndexLoadingPromise;
        }
        return globalPokemonIndex;
    }

    async function loadAndShowAllPokemon() {
        if (!globalPokemonIndex) {
            dropdown.innerHTML = '<div class="pokemon-search-empty">Loading Pokemon data...</div>';
            dropdown.style.display = 'block';
            await ensureGlobalPokemonIndexLoaded();
        }
        performPokemonSearch('');
    }

    // Handle focus - show all Pokemon alphabetically
    searchInput.addEventListener('focus', loadAndShowAllPokemon);

    // Handle click - show all Pokemon alphabetically
    searchInput.addEventListener('click', loadAndShowAllPokemon);

    // Handle search input
    searchInput.addEventListener('input', async (event) => {
        const query = event.target.value.trim();
        if (!query) {
            await ensureGlobalPokemonIndexLoaded();
            performPokemonSearch('');
            return;
        }

        if (!globalPokemonIndex) {
            dropdown.innerHTML = '<div class="pokemon-search-empty">Loading Pokemon data...</div>';
            dropdown.style.display = 'block';
            return;
        }

        performPokemonSearch(query);
    });

    // Close dropdown when clicking outside
    pokemonSearchOutsideClickHandler = (event) => {
        if (!searchInput.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.style.display = 'none';
            searchInput.value = '';
        }
    };

    document.addEventListener('click', pokemonSearchOutsideClickHandler);

    // Handle Escape key
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            dropdown.style.display = 'none';
            searchInput.value = '';
        }
    });
}

async function loadLocalBaseStatsMap() {
    if (!baseStatsMapPromise) {
        baseStatsMapPromise = fetch('../assets/base-stats.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load base stats');
                }
                return response.json();
            })
            .catch(error => {
                console.warn('Failed to load local base stats:', error);
                return null;
            });
    }
    return baseStatsMapPromise;
}

function getPreferredPokemonSearchFormat() {
    if (statsData && Array.isArray(statsData.formats)) {
        const preferredFormats = [
            'gen9nationaldex',
            'gen8nationaldex',
            'gen9ou',
            'gen8ou',
            'gen7ou'
        ];

        for (const formatKey of preferredFormats) {
            if (statsData.formats.some(f => getFormatKey(f) === formatKey)) {
                return formatKey;
            }
        }

        return getFormatKey(statsData.formats[0]) || 'gen9ou';
    }
    return 'gen9ou';
}

async function buildGlobalPokemonIndex() {
    const index = new Map(); // Maps pokemon name to their formats

    try {
        const preferredFormat = getPreferredPokemonSearchFormat();
        const baseStats = await loadLocalBaseStatsMap();

        if (baseStats && baseStats.pokemon && typeof baseStats.pokemon === 'object') {
            Object.values(baseStats.pokemon).forEach(entry => {
                const name = String(entry?.name || '').trim();
                if (name && !index.has(name)) {
                    index.set(name, preferredFormat);
                }
            });
        }

        if (index.size > 0) {
            console.log(`Built Pokemon index from local base-stats.json with ${index.size} entries`);
            return index;
        }

        // Fallback to slower format-based index if local base stats couldn't be used
        const priorityFormats = ['gen9ou'];
        const formatsToLoad = [];

        if (statsData && statsData.formats) {
            if (statsData.formats.some(f => getFormatKey(f) === 'gen9ou')) {
                formatsToLoad.push('gen9ou');
            }
            const firstKey = getFormatKey(statsData.formats[0]);
            if (!formatsToLoad.includes(firstKey)) {
                formatsToLoad.push(firstKey);
            }
        }

        if (formatsToLoad.length === 0) {
            formatsToLoad.push('gen9ou');
        }

        for (const formatKey of formatsToLoad) {
            try {
                const pokemonData = await loadPokemonUsageData(formatKey, '0');
                if (pokemonData && Array.isArray(pokemonData.pokemon)) {
                    pokemonData.pokemon.forEach(poke => {
                        const name = poke.pokemon_name;
                        if (name && !index.has(name)) {
                            index.set(name, formatKey);
                        }
                    });
                }
            } catch (error) {
                console.warn(`Failed to load Pokemon data for format ${formatKey}:`, error);
            }
        }

        return index;
    } catch (error) {
        console.error('Error building Pokemon index:', error);
        return new Map();
    }
}

function performPokemonSearch(query) {
    const dropdown = document.getElementById('pokemon-search-dropdown');
    if (!dropdown || !globalPokemonIndex) {
        dropdown.innerHTML = '<div class="pokemon-search-empty">No data</div>';
        dropdown.style.display = 'block';
        return;
    }

    // Filter Pokemon based on query
    const queryLower = query.toLowerCase();
    let results = Array.from(globalPokemonIndex.entries())
        .filter(([name]) => name.toLowerCase().includes(queryLower));

    // Sort alphabetically
    results.sort((a, b) => a[0].localeCompare(b[0]));

    // Limit to 8 results for display
    results = results.slice(0, 8);

    if (results.length === 0) {
        dropdown.innerHTML = '<div class="pokemon-search-empty">No Pokemon found</div>';
        dropdown.style.display = 'block';
        return;
    }

    // Build dropdown options with sprite icons
    dropdown.innerHTML = '';
    results.forEach(([name, format]) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'pokemon-search-option';
        option.dataset.pokemon = name;
        option.dataset.format = format;

        // Left side with icon and name
        const left = document.createElement('span');
        left.className = 'pokemon-search-option-main pokemon-inline-cell';

        const iconImg = createSearchPokemonIcon(name);
        if (iconImg) {
            left.appendChild(iconImg);
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'pokemon-search-option-name';
        nameSpan.textContent = name;
        left.appendChild(nameSpan);

        option.appendChild(left);
        option.addEventListener('click', () => {
            navigateToPokemon(name, format);
        });

        dropdown.appendChild(option);
    });

    dropdown.style.display = 'block';
}

function navigateToPokemon(pokemonName, formatKey) {
    if (!pokemonName || !formatKey) return;

    const params = new URLSearchParams();
    params.set('format', formatKey);
    params.set('pokemon', pokemonName);
    params.set('rating', '0');

    const pokemonUrl = `pokemon.html?${params.toString()}`;
    window.location.href = pokemonUrl;
}
