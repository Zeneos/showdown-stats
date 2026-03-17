// Shared utilities, constants, and data loading for Pokemon Showdown Stats

// Sprite paths
const spriteShowdownBase = '../assets/sprites/showdown';
const spriteOriginalBase = '../assets/sprites/original';
const spritePlaceholder = `${spriteOriginalBase}/0.png`;

// Meta usage thresholds
const metaUsageThreshold = 4.52;
const metaEncounterBattles = 15;
const metaEncounterProbability = 0.5;

// Shared data caches
const formatDataCache = {};
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

async function loadFormatData(formatName) {
    if (!formatDataCache[formatName]) {
        formatDataCache[formatName] = fetch(`../data/${encodeURIComponent(formatName)}.json`)
            .then(response => {
                if (!response.ok) return null;
                return response.json();
            })
            .catch(error => {
                console.error('Error loading format data:', error);
                return null;
            });
    }
    return formatDataCache[formatName];
}

async function loadPokemonData(formatName, rating) {
    const formatData = await loadFormatData(formatName);
    if (!formatData || !formatData.by_rating) return null;

    const ratingValue = rating === 'all' ? '0' : rating || '0';
    let ratingData = formatData.by_rating[ratingValue];

    if (!ratingData && ratingValue !== '0') {
        ratingData = formatData.by_rating['0'];
    }

    return ratingData || null;
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
