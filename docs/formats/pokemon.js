// Pokemon Showdown Stats Visualizer - Pokemon detail page

const spriteShowdownBase = '../assets/sprites/showdown';
const spriteOriginalBase = '../assets/sprites/original';
const spritePlaceholder = `${spriteOriginalBase}/0.png`;
const countersSortState = {
    key: 'rate',
    direction: 'desc'
};

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

    try {
        const indexResponse = await fetch('../index.json');
        if (indexResponse.ok) {
            const index = await indexResponse.json();
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

    const entry = findPokemonEntry(pokemonData.pokemon, pokemonName);
    if (!entry) {
        showError(`Pokemon "${escapeHtml(pokemonName)}" not found in this format.`);
        return;
    }

    const detail = document.getElementById('pokemon-detail');
    if (detail) detail.style.display = 'block';

    document.title = `${entry.pokemon_name} - ${formatName}`;

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

    const formatEl = document.getElementById('pokemon-format');
    if (formatEl) formatEl.textContent = `Format: ${formatName}`;

    const usageEl = document.getElementById('pokemon-usage');
    if (usageEl) {
        const usagePct = entry.usage_pct !== undefined ? entry.usage_pct.toFixed(2) : '0.00';
        const usageCount = entry.usage_count !== undefined ? formatNumber(entry.usage_count) : '0';
        usageEl.textContent = `Usage: ${usagePct}% (${usageCount} battles)`;
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
        renderMapSection('Abilities', entry.abilities_json),
        renderMapSection('Items', entry.items_json),
        renderMapSection('Spreads', entry.spreads_json),
        renderMapSection('Moves', entry.moves_json),
        renderMapSection('Tera Types', entry.tera_json),
        renderMapSection('Teammates', entry.teammates_json),
        renderCountersSection('Checks and Counters', entry.counters_json, countersSortState)
    ]
        .filter(Boolean)
        .join('');

    attachCountersSortHandlers(entry.counters_json);
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

    const rows = entries
        .map(([key, value]) => `
            <tr>
                <td>${escapeHtml(key)}</td>
                <td class="detail-value">${total > 0 ? ((value / total) * 100).toFixed(2) : '0.00'}%</td>
            </tr>
        `)
        .join('');

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
            const countPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
            return `
            <tr>
                <td>${escapeHtml(name)}</td>
                <td class="detail-value">${(rate * 100).toFixed(2)}%</td>
                <td class="detail-value">${countPct.toFixed(2)}%</td>
            </tr>
        `;
        })
        .join('');

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
