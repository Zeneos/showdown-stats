// Pokemon Showdown Stats Visualizer - Pokemon detail page

const spriteShowdownBase = '../assets/sprites/showdown';
const spriteOriginalBase = '../assets/sprites/original';
const spritePlaceholder = `${spriteOriginalBase}/0.png`;

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
        renderMapSection('Teammates', entry.teammates_json),
        renderArraySection('Viability', entry.viability_json)
    ]
        .filter(Boolean)
        .join('');
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

    const rows = entries
        .map(([key, value]) => `
            <tr>
                <td>${escapeHtml(key)}</td>
                <td class="detail-value">${formatNumber(value)}</td>
            </tr>
        `)
        .join('');

    return `
        <section class="pokemon-detail-section">
            <h3>${escapeHtml(title)}</h3>
            <table class="detail-table">
                <thead>
                    <tr>
                        <th>${escapeHtml(title)}</th>
                        <th>Usage</th>
                    </tr>
                </thead>
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
