// Pokemon Showdown Stats Visualizer - JavaScript

let statsData = null;
let currentSort = { column: 'battles', direction: 'desc' };
let currentRatingFilter = '0';

// Load data on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadLatestData();
    setupEventListeners();
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

        // Render the table
        renderTable();

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
            case 'name':
                comparison = a.name.localeCompare(b.name);
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

        row.innerHTML = `
            <td class="format-name">${escapeHtml(format.name)}</td>
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
