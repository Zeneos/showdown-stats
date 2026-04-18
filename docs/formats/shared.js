// Shared utilities, constants, and data loading for Pokemon Showdown Stats

// API configuration
const API_BASE = 'https://pokechumps-api.s3.us-east-2.amazonaws.com/v1';

// Sprite paths
const spriteShowdownBase = '../assets/sprites/showdown';
const spriteOriginalBase = '../assets/sprites/original';
const spritePlaceholder = `${spriteOriginalBase}/0.png`;

// Meta usage thresholds
const metaUsageThreshold = 4.52;
const metaEncounterBattles = 15;
const metaEncounterProbability = 0.5;

// Shared data caches
const apiResponseCache = {};
const formatSummaryCache = {};
let periodsPromise = null;
let formatNameMapPromise = null;
let formatNameMap = null;

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

function formatNumber(num) {
    return Number(num).toLocaleString('en-US');
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

function getEncounterProbability(usagePct, battles) {
    const p = Math.max(0, Math.min((Number(usagePct) || 0) / 100, 1));
    return 1 - Math.pow(1 - p, battles);
}

function isMetaPokemon(usagePct) {
    const usage = Number(usagePct) || 0;
    if (usage < metaUsageThreshold) return false;
    return getEncounterProbability(usage, metaEncounterBattles) >= metaEncounterProbability;
}

function getFormatKey(format) {
    if (!format || typeof format !== 'object') return '';
    return String(format.format_name || format.name || '').trim();
}

function getDisplayFormatName(formatKey, fallbackName = '') {
    const key = String(formatKey || '').trim();
    if (key && formatNameMap && formatNameMap[key]) {
        return String(formatNameMap[key]);
    }
    return String(fallbackName || key);
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

function apiFetch(path) {
    const url = `${API_BASE}${path}`;
    if (!apiResponseCache[url]) {
        apiResponseCache[url] = fetch(url)
            .then(response => response.ok ? response.json() : null)
            .catch(error => {
                console.error('API fetch failed:', url, error);
                return null;
            });
    }
    return apiResponseCache[url];
}

function resolveApiRating(rating) {
    // API does not expose an "all" aggregate yet — map to "0".
    if (!rating || rating === 'all') return '0';
    return String(rating);
}

async function fetchWithRatingFallback(buildPath, requestedRating) {
    const ratingKey = resolveApiRating(requestedRating);
    const primary = await apiFetch(buildPath(ratingKey));
    if (primary) return primary;
    if (ratingKey === '0') return null;
    return apiFetch(buildPath('0'));
}

async function loadPeriods() {
    if (!periodsPromise) {
        periodsPromise = apiFetch('/periods.json');
    }
    return periodsPromise;
}

async function loadLatestPeriod() {
    const periods = await loadPeriods();
    return periods && periods.latest ? String(periods.latest) : '';
}

async function loadFormatSummary(period) {
    const key = String(period || '').trim();
    if (!key) return null;
    if (!formatSummaryCache[key]) {
        formatSummaryCache[key] = apiFetch(`/periods/${encodeURIComponent(key)}/formats.json`);
    }
    return formatSummaryCache[key];
}

async function loadPokemonUsageData(formatName, rating) {
    const period = await loadLatestPeriod();
    if (!period || !formatName) return null;
    const buildPath = r =>
        `/periods/${encodeURIComponent(period)}/formats/${encodeURIComponent(formatName)}/usage/${encodeURIComponent(r)}.json`;
    return fetchWithRatingFallback(buildPath, rating);
}

async function loadPokemonEntry(formatName, pokemonName, rating) {
    const period = await loadLatestPeriod();
    if (!period || !formatName || !pokemonName) return null;
    const pokemonId = toId(pokemonName);
    if (!pokemonId) return null;
    const buildPath = r =>
        `/periods/${encodeURIComponent(period)}/formats/${encodeURIComponent(formatName)}/pokemon/${encodeURIComponent(pokemonId)}/${encodeURIComponent(r)}.json`;
    return fetchWithRatingFallback(buildPath, rating);
}

async function loadPokemonCrossFormats(pokemonName, period) {
    const resolvedPeriod = period ? String(period).trim() : await loadLatestPeriod();
    if (!resolvedPeriod || !pokemonName) return null;
    const pokemonId = toId(pokemonName);
    if (!pokemonId) return null;
    return apiFetch(`/pokemon/${encodeURIComponent(pokemonId)}/formats/${encodeURIComponent(resolvedPeriod)}.json`);
}

async function getFormatRatings(formatName) {
    const period = await loadLatestPeriod();
    if (!period) return [];
    const summary = await loadFormatSummary(period);
    if (!summary || !Array.isArray(summary.formats)) return [];
    const entry = summary.formats.find(f => getFormatKey(f) === formatName);
    if (!entry || !entry.by_rating) return [];
    return Object.keys(entry.by_rating)
        .map(r => Number.parseInt(r, 10))
        .filter(r => !Number.isNaN(r))
        .sort((a, b) => a - b);
}

function initializeGlobalHelpTooltip() {
    if (document.getElementById('global-help-tooltip')) return;

    const tooltip = document.createElement('div');
    tooltip.id = 'global-help-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);

    document.body.classList.add('js-tooltip-enabled');

    const hideTooltip = () => {
        tooltip.classList.remove('is-visible');
        tooltip.textContent = '';
    };

    const showTooltipFor = (target) => {
        if (!target) return;
        const text = target.getAttribute('data-tooltip');
        if (!text) return;

        tooltip.textContent = text;
        tooltip.classList.add('is-visible');

        const rect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const gap = 10;

        let top = rect.top - tooltipRect.height - gap;
        if (top < 8) {
            top = rect.bottom + gap;
        }

        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        const minLeft = 8;
        const maxLeft = window.innerWidth - tooltipRect.width - 8;
        left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxLeft)));

        tooltip.style.top = `${Math.round(top)}px`;
        tooltip.style.left = `${Math.round(left)}px`;
    };

    document.addEventListener('pointerover', (event) => {
        const target = event.target && event.target.closest
            ? event.target.closest('.help-tooltip')
            : null;
        if (!target) return;
        showTooltipFor(target);
    });

    document.addEventListener('pointerout', (event) => {
        const target = event.target && event.target.closest
            ? event.target.closest('.help-tooltip')
            : null;
        if (!target) return;
        hideTooltip();
    });

    document.addEventListener('focusin', (event) => {
        const target = event.target && event.target.closest
            ? event.target.closest('.help-tooltip')
            : null;
        if (!target) return;
        showTooltipFor(target);
    });

    document.addEventListener('focusout', (event) => {
        const target = event.target && event.target.closest
            ? event.target.closest('.help-tooltip')
            : null;
        if (!target) return;
        hideTooltip();
    });

    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
}
