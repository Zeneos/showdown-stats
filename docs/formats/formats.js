// Pokemon Showdown Stats Visualizer - JavaScript

let statsData = null;
let currentSort = { column: 'battles', direction: 'desc' };
let currentRatingFilter = '0';

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

        // Populate rating filter dropdown
        populateRatingFilter();

        // Check if we should render table or detail view
        const formatName = getFormatFromUrl();
        if (formatName) {
            renderFormatDetail(formatName);
        } else {
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
function populateRatingFilter() {
    const filterSelect = document.getElementById('rating-filter');

    // Add options for each rating threshold
    if (statsData && statsData.rating_thresholds) {
        statsData.rating_thresholds.forEach(rating => {
            const option = document.createElement('option');
            option.value = rating;
            option.textContent = `Rating ${rating}+`;
            filterSelect.appendChild(option);
        });
    }
}

// Render the stats table
function renderTable() {
    if (!statsData) return;

    let formats = [...statsData.formats];

    // Apply rating filter
    if (currentRatingFilter !== '0') {
        const rating = parseInt(currentRatingFilter);
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
                comparison = a.name.localeCompare(b.format_name);
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
        const formatLink = `?format=${encodeURIComponent(format.format_name)}`;

        row.innerHTML = `
            <td class="format-name"><a href="${formatLink}" class="format-link">${escapeHtml(format.format_name)}</a></td>
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
                currentSort.direction = column === 'name' ? 'asc' : 'desc';
            }

            renderTable();
        });
    });

    // Rating filter
    document.getElementById('rating-filter').addEventListener('change', (e) => {
        currentRatingFilter = e.target.value;
        renderTable();
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
function renderFormatDetail(formatName) {
    if (!statsData) return;

    const format = statsData.formats.find(f => f.format_name === formatName);
    
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
    if (periodInfo) periodInfo.textContent = `${escapeHtml(formatName)} - Stats Period: Latest`;

    // Render format detail content
    const detailContent = document.getElementById('detail-content');
    if (detailContent) {
        detailContent.innerHTML = `
            <div class="format-header">
                <h2>${escapeHtml(format.format_name)}</h2>
                <p>Total Battles: <strong>${formatNumber(format.total_battles)}</strong></p>
                <p>Overall Percentage: <strong>${format.percentage.toFixed(2)}%</strong></p>
            </div>
            <div class="rating-breakdown">
                <h3>Rating Breakdown</h3>
                <div class="rating-table">
                    ${Object.entries(format.by_rating)
                        .map(([rating, battles]) => `
                            <div class="rating-row">
                                <span class="rating-label">Rating ${rating}+</span>
                                <span class="rating-battles">${formatNumber(battles)} battles</span>
                            </div>
                        `)
                        .join('')}
                </div>
            </div>
            <div class="detail-actions">
                <a href="./" class="back-link">← Back to all formats</a>
            </div>
        `;
    }
}
