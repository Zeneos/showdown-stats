// Shared light/dark theme toggle with persisted preference.

(function initTheme() {
    const storageKey = 'pss-theme';
    const root = document.documentElement;
    const scriptUrl = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : window.location.href;
    const sunIconSrc = new URL('./assets/Icons/sun.png', scriptUrl).href;
    const moonIconSrc = new URL('./assets/Icons/moon.png', scriptUrl).href;
    const saved = localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light');

    applyTheme(initial);

    document.addEventListener('DOMContentLoaded', () => {
        createThemeToggle();
    });

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        root.style.colorScheme = theme;
        localStorage.setItem(storageKey, theme);
    }

    function createThemeToggle() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-toggle-btn';
        const thumb = document.createElement('span');
        thumb.className = 'theme-toggle-thumb';
        const icon = document.createElement('img');
        icon.className = 'theme-toggle-icon';
        icon.alt = '';
        icon.decoding = 'async';
        thumb.appendChild(icon);
        button.appendChild(thumb);

        const refreshLabel = () => {
            const current = root.getAttribute('data-theme') || 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            const nextLabel = next === 'dark' ? 'dark' : 'light';
            icon.src = current === 'dark' ? moonIconSrc : sunIconSrc;
            button.setAttribute('aria-pressed', current === 'dark' ? 'true' : 'false');
            button.setAttribute('data-theme-current', current);
            button.setAttribute('aria-label', `Switch to ${nextLabel} mode`);
            button.setAttribute('title', `Switch to ${next} mode`);
        };

        button.addEventListener('click', () => {
            const current = root.getAttribute('data-theme') || 'light';
            applyTheme(current === 'dark' ? 'light' : 'dark');
            refreshLabel();
        });

        refreshLabel();
        document.body.appendChild(button);
    }
})();
