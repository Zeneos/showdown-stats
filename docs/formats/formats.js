// Pokemon Showdown Stats Visualizer - JavaScript

let statsData = null;
let currentSort = { column: 'battles', direction: 'desc' };
let currentRatingFilter = 'all';
let pokemonSort = { column: 'usage_pct', direction: 'desc' };
const spriteShowdownBase = '../assets/sprites/showdown';
const spriteOriginalBase = '../assets/sprites/original';
const spritePlaceholder = `${spriteOriginalBase}/0.png`;
const metaUsageThreshold = 4.52;
const metaEncounterBattles = 15;
const metaEncounterProbability = 0.5;

// Load data on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadLatestData();
    setupEventListeners();
    handleRouting();
});

// Load the latest stats data
async function loadLatestData() {
    try {
        // First, load the index to get the latest period
        const indexResponse = await fetch(`../index.json`);
        if (!indexResponse.ok) {
            throw new Error('Failed to load index');
        }

        const index = await indexResponse.json();
        const latestPeriod = index.latest;

        // Load the data for the latest period
        const dataResponse = await fetch(`${latestPeriod}.json`);
        if (!dataResponse.ok) {
            throw new Error('Failed to load data');
        }

        statsData = await dataResponse.json();

        // Update UI
        document.getElementById('period-info').textContent = `Stats Period: ${latestPeriod}`;
        document.getElementById('total-battles').textContent = formatNumber(statsData.total_battles);
        document.getElementById('format-count').textContent = statsData.formats.length;

        // Check if we should render table or detail view
        const formatName = getFormatFromUrl();
        if (formatName) {
            populateRatingFilter(formatName);
            renderFormatDetail(formatName);
        } else {
            populateRatingFilter();
            renderTable();
        }

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

// Populate the rating filter dropdown
function populateRatingFilter(formatName) {
    const filterSelect = document.getElementById('rating-filter');
    if (!filterSelect) return;

    filterSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All ratings';
    filterSelect.appendChild(allOption);

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

    ratings
        .map(rating => parseInt(rating, 10))
        .filter(rating => !Number.isNaN(rating))
        .sort((a, b) => a - b)
        .forEach(rating => {
            const option = document.createElement('option');
            option.value = String(rating);
            option.textContent = `Rating ${rating}+`;
            filterSelect.appendChild(option);
        });

    if (currentRatingFilter) {
        filterSelect.value = currentRatingFilter;
    }

    if (!filterSelect.value) {
        currentRatingFilter = 'all';
        filterSelect.value = 'all';
    }
}

// Render the stats table
function renderTable() {
    if (!statsData) return;

    let formats = [...statsData.formats];

    // Apply rating filter
    if (currentRatingFilter !== 'all') {
        const rating = parseInt(currentRatingFilter, 10);
        formats = formats
            .map(format => {
                let battles = format.by_rating[rating];

                // If exact rating doesn't exist, find closest higher rating
                if (battles === undefined) {
                    const availableRatings = Object.keys(format.by_rating)
                        .map(r => parseInt(r))
                        .filter(r => r >= rating)
                        .sort((a, b) => a - b);

                    if (availableRatings.length > 0) {
                        battles = format.by_rating[availableRatings[0]];
                    } else {
                        battles = 0;
                    }
                }

                return {
                    ...format,
                    total_battles: battles,
                    percentage: 0  // Will recalculate
                };
            })
            .filter(format => format.total_battles > 0);

        // Recalculate percentages for filtered data
        const totalFiltered = formats.reduce((sum, f) => sum + f.total_battles, 0);
        formats.forEach(format => {
            format.percentage = totalFiltered > 0
                ? (format.total_battles / totalFiltered * 100)
                : 0;
        });
    }

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

        row.innerHTML = `
            <td class="format-name"><a href="${formatLink}" class="format-link">${escapeHtml(getFormatName(format))}</a></td>
            <td class="percentage">${format.percentage.toFixed(2)}%</td>
            <td class="battles">${formatNumber(format.total_battles)}</td>
        `;

        tbody.appendChild(row);
    });

    // Update sort indicators
    updateSortIndicators();
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

    // Rating filter
    document.getElementById('rating-filter').addEventListener('change', (e) => {
        currentRatingFilter = e.target.value;
        const formatName = getFormatFromUrl();
        if (formatName) {
            renderFormatDetail(formatName);
        } else {
            renderTable();
        }
    });
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

// Format number with commas
function formatNumber(num) {
    return num.toLocaleString('en-US');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeSpriteName(name) {
    if (!name) return '';
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/[\s.]+$/g, '')
        .trim();
}

function encodePathSegment(path) {
    return path
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

function getPokemonSpritePaths(pokemonName) {
    const safeName = sanitizeSpriteName(pokemonName);
    if (!safeName) return spritePlaceholder;

    const showdown = `${spriteShowdownBase}/${encodePathSegment(`${safeName}.gif`)}`;
    const original = `${spriteOriginalBase}/${encodePathSegment(`${safeName}.png`)}`;
    return { showdown, original, placeholder: spritePlaceholder };
}

function getEncounterProbability(usagePct, battles) {
    const p = Math.max(0, Math.min(usagePct / 100, 1));
    return 1 - Math.pow(1 - p, battles);
}

function isMetaPokemon(usagePct) {
    if (usagePct < metaUsageThreshold) return false;
    return getEncounterProbability(usagePct, metaEncounterBattles) >= metaEncounterProbability;
}

// Get format name from URL query parameter
function getFormatFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('format');
}

// Handle routing based on URL
function handleRouting() {
    const formatName = getFormatFromUrl();
    if (formatName) {
        renderFormatDetail(formatName);
    }
}

// Render detail view for a specific format
async function renderFormatDetail(formatName, ratingOverride) {
    if (!statsData) return;

    const format = statsData.formats.find(f => getFormatKey(f) === formatName);
    
    if (!format) {
        const container = document.getElementById('table-container');
        if (container) container.style.display = 'none';
        const detailDiv = document.getElementById('format-detail');
        if (detailDiv) {
            detailDiv.style.display = 'block';
            detailDiv.innerHTML = `
                <div class="error">
                    <p>Format "${escapeHtml(formatName)}" not found.</p>
                    <a href="./">Back to all formats</a>
                </div>
            `;
        }
        return;
    }

    // Hide table, show detail
    const container = document.getElementById('table-container');
    if (container) container.style.display = 'none';
    const detailDiv = document.getElementById('format-detail');
    if (detailDiv) detailDiv.style.display = 'block';

    // Update header
    const periodInfo = document.getElementById('period-info');
    if (periodInfo) periodInfo.textContent = `${escapeHtml(getFormatName(format))} - Stats Period: Latest`;

    populateRatingFilter(getFormatKey(format));
    const rating = ratingOverride || currentRatingFilter || 'all';
    const pokemonData = await loadPokemonData(getFormatKey(format), rating);

    // Render format detail content
    const detailContent = document.getElementById('detail-content');
    if (detailContent) {
        if (!pokemonData || !Array.isArray(pokemonData.pokemon)) {
            detailContent.innerHTML = `
                <div class="error">
                    <p>Pokemon data for "${escapeHtml(getFormatName(format))}" could not be loaded.</p>
                    <a href="./" class="back-link">← Back to all formats</a>
                </div>
            `;
            return;
        }

        const sortedPokemon = sortPokemonList(pokemonData.pokemon);
        const pokemonRows = sortedPokemon
            .map(pokemon => {
                const spritePaths = getPokemonSpritePaths(pokemon.pokemon_name);
                const showdownSrc = typeof spritePaths === 'string' ? spritePaths : spritePaths.showdown;
                const originalSrc = typeof spritePaths === 'string' ? spritePlaceholder : spritePaths.original;
                const placeholderSrc = typeof spritePaths === 'string' ? spritePlaceholder : spritePaths.placeholder;
                const isMeta = isMetaPokemon(pokemon.usage_pct);
                return `
                <tr class="${isMeta ? 'pokemon-meta' : ''}">
                    <td class="pokemon-name">
                        <span class="pokemon-name-cell">
                            <img class="pokemon-sprite" src="${showdownSrc}" alt="" loading="lazy" onerror="this.onerror=function(){this.onerror=null;this.src='${placeholderSrc}';};this.src='${originalSrc}';">
                            <span>${escapeHtml(pokemon.pokemon_name)}</span>
                        </span>
                    </td>
                    <td class="pokemon-usage ${isMeta ? 'pokemon-meta-usage' : ''}">${pokemon.usage_pct.toFixed(2)}%</td>
                    <td class="pokemon-count">${formatNumber(pokemon.usage_count)}</td>
                </tr>
            `;
            })
            .join('');

        detailContent.innerHTML = `
            <div class="format-header">
                <h2>${escapeHtml(getFormatName(format))}</h2>
                <p>Total Battles: <strong>${formatNumber(format.total_battles)}</strong></p>
                <p>Overall Percentage: <strong>${format.percentage.toFixed(2)}%</strong></p>
                <p>
                    Pokemon Usage:
                    <strong>${formatPokemonRatingLabel(pokemonData.elo_cutoff, rating)}</strong>
                        <span class="help-tooltip" aria-label="Meta criteria" data-tooltip="Pokemon with at least 4.52% weighted usage are highlighted. For OU/UU/RU/NU/PU formats, a Pokemon is truly in their tier if a typical competitive player is more than 50% likely to encounter it at least once in a day of playing (15 battles).">?</span>
                </p>
            </div>
            <div class="pokemon-breakdown">
                <div class="pokemon-table-wrapper">
                    <table class="pokemon-table">
                        <thead>
                            <tr>
                                <th class="pokemon-sortable" data-sort="pokemon_name">Pokemon</th>
                                <th class="pokemon-sortable" data-sort="usage_pct">Usage %</th>
                                <th class="pokemon-sortable" data-sort="usage_count">Usage Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pokemonRows}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="detail-actions">
                <a href="./" class="back-link">← Back to all formats</a>
            </div>
        `;

        setupPokemonSortListeners(getFormatKey(format), rating);
        updatePokemonSortIndicators();
    }
}

function getFormatName(format) {
    return format.format_name || format.name || '';
}

function getFormatKey(format) {
    return format.format_name || format.name || '';
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
        return `Rating ${escapeHtml(String(ratingFilter))}+`;
    }
    return `Rating ${escapeHtml(String(eloCutoff))}+`;
}
