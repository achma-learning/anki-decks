// ==UserScript==
// @name         AMMPS Generic Drugs Scraper (Smart Pagination)
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Scrape all Moroccan generic drugs – detects last page from pagination HTML
// @match        https://www.ammps.gov.ma/repertoire-medicaments-generiques*
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';

    // ---------- Core scraping logic ----------
    const BASE_URL = 'https://www.ammps.gov.ma/repertoire-medicaments-generiques';
    const REQUEST_DELAY_MS = 500;
    const MAX_SAFETY_PAGES = 200;

    let settings = {
        format: 'json',
        fields: {
            drug_name: true,
            dci: true,
            route: true,
            type: false,
            epi: false,
            ean13: false
        },
        addSymbol: true
    };

    function loadSettings() {
        const saved = localStorage.getItem('ammps_scraper_settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                settings = { ...settings, ...parsed };
            } catch(e) {}
        }
    }
    loadSettings();

    function saveSettings() {
        localStorage.setItem('ammps_scraper_settings', JSON.stringify(settings));
    }

    function addRegisteredSymbol(drugName) {
        const match = drugName.match(/\d/);
        if (match && match.index > 0) {
            return drugName.slice(0, match.index) + '®' + drugName.slice(match.index);
        }
        return drugName + '®';
    }

    function mapType(typeCode) {
        const map = {
            'P': 'Princeps / Original',
            'G': 'Generique',
            'I': 'Innovateur',
            'BS': 'Biosimilaire'
        };
        return map[typeCode] || typeCode;
    }

    function filterDrugObject(original, addSymbol) {
        let filtered = {};
        if (settings.fields.drug_name) {
            let name = original.drug_name;
            if (addSymbol) name = addRegisteredSymbol(name);
            filtered.drug_name = name;
        }
        if (settings.fields.dci) filtered.dci = original.dci;
        if (settings.fields.route) filtered.route = original.route;
        if (settings.fields.type) filtered.type = mapType(original.type);
        if (settings.fields.epi) filtered.epi = original.epi;
        if (settings.fields.ean13) filtered.ean13 = original.ean13;
        return filtered;
    }

    function formatOutput(data, format) {
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'txt') {
            if (!data.length) return '';
            const headers = Object.keys(data[0]);
            const escape = (s) => {
                let str = String(s).replace(/[\t\n\r]/g, ' ');
                if (str.includes('\t') || str.includes(',')) {
                    str = `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };
            const rows = [
                headers.join('\t'),
                ...data.map(row => headers.map(h => escape(row[h])).join('\t'))
            ];
            return rows.join('\n');
        } else if (format === 'md') {
            if (!data.length) return '';
            const headers = Object.keys(data[0]);
            const headerRow = '| ' + headers.join(' | ') + ' |';
            const separatorRow = '|' + headers.map(() => ' --- ').join('|') + '|';
            const bodyRows = data.map(row => {
                return '| ' + headers.map(h => String(row[h]).replace(/\|/g, '\\|')).join(' | ') + ' |';
            });
            return [headerRow, separatorRow, ...bodyRows].join('\n');
        }
        return '';
    }

    // ---------- Fetch a single page and extract drug data ----------
    async function fetchPageData(pageNum) {
        const url = `${BASE_URL}?page=${pageNum}`;
        console.log(`[Scraper] Fetching ${url} ...`);
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'User-Agent': navigator.userAgent }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const cards = doc.querySelectorAll('.rmmg-substance-card');
        if (cards.length === 0) return null;

        const pageData = [];
        for (const card of cards) {
            const groupElem = card.querySelector('.rmmg-group-title');
            const dci = groupElem ? groupElem.textContent.trim() : '';
            const routeElem = card.querySelector('.rmmg-route');
            let route = '';
            if (routeElem) {
                route = routeElem.textContent.replace('Voie d’administration :', '').trim();
            }
            const table = card.querySelector('.rmmg-data-table');
            if (!table) continue;
            const rows = table.querySelectorAll('tbody tr');
            for (const row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 4) continue;
                const typeSpan = cells[0].querySelector('.type-badge');
                let type = typeSpan ? typeSpan.textContent.trim() : '';
                if (type === 'Groupe gén' || type === '-' || type === '') continue;
                let drugName = cells[1].textContent.trim();
                if (drugName === '-' || drugName === '') continue;
                const epi = cells[2].textContent.trim();
                const ean = cells[3].textContent.trim();
                pageData.push({
                    drug_name: drugName,
                    dci: dci,
                    route: route,
                    type: type,
                    epi: (epi === '-' ? '' : epi),
                    ean13: (ean === '-' ? '' : ean)
                });
            }
        }
        return pageData;
    }

    // ---------- Smart pagination: extract last page number from pagination HTML ----------
    async function getLastPageNumber() {
        try {
            const firstPageHtml = await (await fetch(`${BASE_URL}?page=1`)).text();
            const doc = new DOMParser().parseFromString(firstPageHtml, 'text/html');
            const pagination = doc.querySelector('.pagination');
            if (!pagination) return null;

            let maxPage = 0;
            // Get all page links (both <a> and <span> with page numbers)
            const pageItems = pagination.querySelectorAll('.page-link');
            for (const item of pageItems) {
                let pageNum = null;
                // Try to get number from href attribute
                const href = item.getAttribute('href');
                if (href) {
                    const match = href.match(/[?&]page=(\d+)/);
                    if (match) pageNum = parseInt(match[1], 10);
                }
                // If no href, try the text content (e.g., "16")
                if (!pageNum) {
                    const text = item.textContent.trim();
                    if (/^\d+$/.test(text)) pageNum = parseInt(text, 10);
                }
                if (pageNum && pageNum > maxPage) maxPage = pageNum;
            }
            return maxPage > 0 ? maxPage : null;
        } catch(e) {
            console.warn('Could not detect last page:', e);
            return null;
        }
    }

    // ---------- Main scraping loop (smart pagination) ----------
    async function scrapeAll(progressCallback) {
        let allDrugs = [];
        let totalPages = await getLastPageNumber();
        if (!totalPages) {
            showToast('Could not detect total pages, using safe limit of 200', 'warn');
            totalPages = MAX_SAFETY_PAGES;
        } else {
            showToast(`Detected ${totalPages} pages.`, 'info');
        }

        for (let page = 1; page <= totalPages; page++) {
            try {
                if (progressCallback) progressCallback(page, totalPages);
                const pageData = await fetchPageData(page);
                if (!pageData || pageData.length === 0) {
                    console.log(`Page ${page} has no drugs – stopping.`);
                    showToast(`No drugs on page ${page}. Stopping.`, 'warn');
                    break;
                }
                allDrugs = allDrugs.concat(pageData);
                console.log(`Page ${page}: added ${pageData.length} drugs (total ${allDrugs.length})`);
                if (page < totalPages) await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
            } catch (err) {
                console.error(`Error on page ${page}:`, err);
                showToast(`Error on page ${page}: ${err.message}`, 'error');
                break;
            }
        }

        if (!allDrugs.length) {
            showToast('No drugs found. Check your internet or the website.', 'error');
            return;
        }

        const filteredData = allDrugs.map(drug => filterDrugObject(drug, settings.addSymbol));
        const output = formatOutput(filteredData, settings.format);
        const extension = settings.format === 'json' ? 'json' : (settings.format === 'txt' ? 'txt' : 'md');
        const timestamp = new Date().toISOString().slice(0,19).replace(/:/g, '-');
        const filename = `ammps_drugs_${timestamp}.${extension}`;
        const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);

        showToast(`✅ ${allDrugs.length} drugs saved as ${settings.format.toUpperCase()}`, 'success');
        if (typeof GM_notification !== 'undefined') {
            GM_notification({ text: `${allDrugs.length} drugs exported.`, timeout: 3000 });
        }
    }

    // ---------- UI helpers (toast, styles, etc.) ----------
    function showToast(message, type = 'info') {
        const toast = document.getElementById('ammps-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.style.backgroundColor = type === 'error' ? '#dc2626' : (type === 'success' ? '#16a34a' : (type === 'warn' ? '#f59e0b' : '#111827'));
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
        }, 3000);
    }

    function injectStyles() {
        const css = `
        #ammps-widget {
            position: fixed;
            right: 20px;
            bottom: 20px;
            width: 320px;
            z-index: 99999;
            background: rgba(15,23,42,.92);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,.25), 0 4px 10px rgba(0,0,0,.15);
            color: white;
            font-family: Inter, system-ui, sans-serif;
        }
        #ammps-widget button { transition: all .18s ease; cursor: pointer; }
        #ammps-widget button:hover { transform: translateY(-1px); }
        .ammps-widget-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 16px;
            border-bottom: 1px solid rgba(255,255,255,.1);
        }
        .ammps-widget-header span { font-weight: 600; font-size: 14px; }
        #ammps-start-btn {
            width: calc(100% - 32px);
            margin: 12px 16px;
            height: 46px;
            border: none;
            border-radius: 12px;
            background: linear-gradient(135deg, #16a34a, #22c55e);
            color: white;
            font-weight: 700;
            cursor: pointer;
        }
        #ammps-settings-btn {
            background: rgba(255,255,255,.08);
            border: none;
            border-radius: 10px;
            width: 32px;
            height: 32px;
            color: white;
            font-size: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        #ammps-progress-container {
            margin: 0 16px 12px 16px;
            height: 6px;
            background: rgba(255,255,255,.2);
            border-radius: 3px;
            overflow: hidden;
        }
        #ammps-progress-bar { width: 0%; height: 100%; background: #22c55e; transition: width 0.2s ease; }
        #ammps-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.4);
            backdrop-filter: blur(6px);
            display: none;
            z-index: 100000;
            align-items: flex-end;
            justify-content: flex-end;
            padding: 20px;
        }
        #ammps-modal {
            background: white;
            border-radius: 24px;
            width: 380px;
            max-width: 90vw;
            overflow: hidden;
            box-shadow: 0 25px 60px rgba(0,0,0,.25);
            animation: slideUp 0.2s ease;
        }
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        .ammps-header {
            padding: 20px;
            background: linear-gradient(135deg, #16a34a, #15803d);
            color: white;
        }
        .ammps-header h3 { margin: 0 0 4px 0; font-size: 18px; }
        .ammps-header small { opacity: 0.8; font-size: 12px; }
        .ammps-section {
            padding: 18px 20px;
            border-bottom: 1px solid #eef2f6;
        }
        .ammps-title {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .08em;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 10px;
        }
        .ammps-segment {
            display: flex;
            gap: 4px;
            padding: 4px;
            border-radius: 12px;
            background: #f1f5f9;
        }
        .ammps-format {
            flex: 1;
            border: none;
            padding: 10px;
            border-radius: 10px;
            background: transparent;
            cursor: pointer;
            font-weight: 500;
        }
        .ammps-format.active {
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,.08);
            color: #16a34a;
        }
        .field-grid { display: grid; gap: 8px; }
        .field-card {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            cursor: pointer;
            transition: .18s;
        }
        .field-card:hover { border-color: #22c55e; background: #f8fafc; }
        .field-card.active { border-color: #22c55e; background: #f0fdf4; }
        .field-card input {
            margin: 0;
            width: 18px;
            height: 18px;
            cursor: pointer;
            pointer-events: none;
        }
        .field-card label {
            cursor: pointer;
            flex: 1;
            pointer-events: none;
        }
        .ammps-actions { display: flex; gap: 10px; padding: 20px; }
        .ammps-save {
            flex: 1;
            border: none;
            border-radius: 12px;
            background: #16a34a;
            color: white;
            height: 42px;
            font-weight: 700;
            cursor: pointer;
        }
        .ammps-reset {
            width: 100px;
            border: none;
            border-radius: 12px;
            background: #f1f5f9;
            cursor: pointer;
        }
        #ammps-toast {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            background: #111827;
            color: white;
            padding: 12px 16px;
            border-radius: 12px;
            opacity: 0;
            transform: translateY(-10px);
            transition: .25s;
            font-size: 14px;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        #ammps-summary {
            font-size: 12px;
            margin: 8px 16px 12px;
            padding: 8px 10px;
            background: rgba(255,255,255,.1);
            border-radius: 10px;
            text-align: center;
        }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function updateSummary() {
        const summaryEl = document.getElementById('ammps-summary');
        if (!summaryEl) return;
        const fieldsEnabled = Object.entries(settings.fields).filter(([_,v]) => v).map(([k]) => k).join(', ');
        summaryEl.innerHTML = `📄 ${settings.format.toUpperCase()} &nbsp;|&nbsp; 🏷️ ${settings.addSymbol ? '® on' : '® off'} &nbsp;|&nbsp; 📋 ${fieldsEnabled || 'none'}`;
    }

    function toggleField(field) {
        settings.fields[field] = !settings.fields[field];
        const card = document.querySelector(`.field-card[data-field="${field}"]`);
        if (card) {
            const cb = card.querySelector('input');
            if (cb) cb.checked = settings.fields[field];
            if (settings.fields[field]) card.classList.add('active');
            else card.classList.remove('active');
        }
        updateSummary();
        saveSettings();
    }

    function toggleSymbol() {
        settings.addSymbol = !settings.addSymbol;
        const card = document.getElementById('symbol-card');
        const cb = document.getElementById('add-symbol-checkbox');
        if (cb) cb.checked = settings.addSymbol;
        if (card) {
            if (settings.addSymbol) card.classList.add('active');
            else card.classList.remove('active');
        }
        updateSummary();
        saveSettings();
    }

    function buildUI() {
        document.getElementById('ammps-widget')?.remove();
        document.getElementById('ammps-modal-overlay')?.remove();
        document.getElementById('ammps-toast')?.remove();

        const widget = document.createElement('div');
        widget.id = 'ammps-widget';
        widget.innerHTML = `
            <div class="ammps-widget-header">
                <span>📦 AMMPS Scraper</span>
                <button id="ammps-settings-btn">⚙️</button>
            </div>
            <div id="ammps-progress-container" style="display:none;">
                <div id="ammps-progress-bar"></div>
            </div>
            <div id="ammps-summary"></div>
            <button id="ammps-start-btn">🚀 Start scraping</button>
        `;
        document.body.appendChild(widget);

        const toast = document.createElement('div');
        toast.id = 'ammps-toast';
        document.body.appendChild(toast);

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'ammps-modal-overlay';
        modalOverlay.innerHTML = `
            <div id="ammps-modal">
                <div class="ammps-header">
                    <h3>Export Settings</h3>
                    <small>AMMPS Generic Drugs Scraper</small>
                </div>
                <div class="ammps-section">
                    <div class="ammps-title">Format</div>
                    <div class="ammps-segment" id="format-segment">
                        <button class="ammps-format" data-format="json">JSON</button>
                        <button class="ammps-format" data-format="txt">TXT</button>
                        <button class="ammps-format" data-format="md">MD</button>
                    </div>
                </div>
                <div class="ammps-section">
                    <div class="ammps-title">Fields</div>
                    <div class="field-grid">
                        ${['drug_name', 'dci', 'route', 'type', 'epi', 'ean13'].map(field => `
                            <div class="field-card ${settings.fields[field] ? 'active' : ''}" data-field="${field}">
                                <input type="checkbox" ${settings.fields[field] ? 'checked' : ''}>
                                <label>${field}</label>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="ammps-section">
                    <div class="ammps-title">Options</div>
                    <div class="field-card ${settings.addSymbol ? 'active' : ''}" id="symbol-card">
                        <input type="checkbox" ${settings.addSymbol ? 'checked' : ''} id="add-symbol-checkbox">
                        <label>Add ® before dosage</label>
                    </div>
                </div>
                <div class="ammps-actions">
                    <button class="ammps-reset" id="reset-settings">Reset</button>
                    <button class="ammps-save" id="save-settings">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        // Event delegation for perfect toggles
        modalOverlay.addEventListener('click', (e) => {
            const card = e.target.closest('.field-card');
            if (card) {
                const field = card.getAttribute('data-field');
                if (field) toggleField(field);
                else if (card.id === 'symbol-card') toggleSymbol();
            }
        });

        // Format buttons
        document.querySelectorAll('.ammps-format').forEach(btn => {
            btn.addEventListener('click', () => {
                settings.format = btn.getAttribute('data-format');
                updateSummary();
                saveSettings();
                document.querySelectorAll('.ammps-format').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Start scraping
        document.getElementById('ammps-start-btn').addEventListener('click', async () => {
            const startBtn = document.getElementById('ammps-start-btn');
            const progressContainer = document.getElementById('ammps-progress-container');
            const progressBar = document.getElementById('ammps-progress-bar');
            startBtn.disabled = true;
            startBtn.textContent = '⏳ Scraping...';
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';
            await scrapeAll((current, total) => {
                const percent = (current / total) * 100;
                progressBar.style.width = `${percent}%`;
            });
            startBtn.disabled = false;
            startBtn.textContent = '🚀 Start scraping';
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
        });

        // Open modal
        document.getElementById('ammps-settings-btn').addEventListener('click', () => {
            document.querySelectorAll('.ammps-format').forEach(btn => {
                if (btn.getAttribute('data-format') === settings.format) btn.classList.add('active');
                else btn.classList.remove('active');
            });
            modalOverlay.style.display = 'flex';
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.style.display = 'none';
        });

        // Save settings
        document.getElementById('save-settings').addEventListener('click', () => {
            saveSettings();
            updateSummary();
            modalOverlay.style.display = 'none';
            showToast('Settings saved', 'success');
        });

        // Reset settings
        document.getElementById('reset-settings').addEventListener('click', () => {
            settings = {
                format: 'json',
                fields: {
                    drug_name: true,
                    dci: true,
                    route: true,
                    type: false,
                    epi: false,
                    ean13: false
                },
                addSymbol: true
            };
            saveSettings();
            // Refresh UI
            document.querySelectorAll('.field-card[data-field]').forEach(card => {
                const field = card.getAttribute('data-field');
                if (settings.fields[field]) {
                    card.classList.add('active');
                    card.querySelector('input').checked = true;
                } else {
                    card.classList.remove('active');
                    card.querySelector('input').checked = false;
                }
            });
            const symbolCard = document.getElementById('symbol-card');
            if (symbolCard) symbolCard.classList.add('active');
            const symbolCb = document.getElementById('add-symbol-checkbox');
            if (symbolCb) symbolCb.checked = true;
            document.querySelectorAll('.ammps-format').forEach(btn => {
                if (btn.getAttribute('data-format') === 'json') btn.classList.add('active');
                else btn.classList.remove('active');
            });
            updateSummary();
            showToast('Reset to default settings', 'info');
        });

        updateSummary();
    }

    injectStyles();
    buildUI();
})();
