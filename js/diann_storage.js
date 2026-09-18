/* Nebula port of 0266_diann-parquet-parser/js/storage.js - scoped for the #diannExplorerTab panel. See AGENTS.md. */
/* file://-safe classic script converted from src/storage.js. Load via plain <script src> (see index.html order + js/README.txt). No import/export. */
// DIA-NN Settings and UI LocalStorage manager

const STORAGE_KEY = 'diann_viewer_settings_v1';

const DEFAULT_SETTINGS = {
  theme: 'dark',
  qValue: 0.01,
  globalQValue: 0.01,
  pgQValue: 0.01,
  quantMethod: 'PG.MaxLFQ', // 'PG.MaxLFQ', 'Sum', 'Top3'
  intensityColumn: 'Precursor.Normalised', // 'Precursor.Normalised', 'Precursor.Quantity'
  proteotypicOnly: false,
  pageSize: 25,
  activeTab: 'diann-summary-tab',
  fastaFileName: 'results.protein_description.tsv',
  xicPath: 'data/results_xic'
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    console.warn('Failed to parse settings from localStorage:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(newSettings) {
  try {
    const current = loadSettings();
    const updated = { ...current, ...newSettings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to save settings to localStorage:', err);
    return newSettings;
  }
}

function applyTheme(theme) {
  /* Nebula port: scope the studio theme to the #diannExplorerTab panel so the
     Nebula shell (documentElement) is never touched. */
  var el = document.getElementById('diannExplorerTab');
  if (!el) return;
  el.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    el.classList.add('dark');
    el.classList.remove('light');
  } else {
    el.classList.add('light');
    el.classList.remove('dark');
  }
}
