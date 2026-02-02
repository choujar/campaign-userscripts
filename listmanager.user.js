// ==UserScript==
// @name         List Manager Tweaks
// @namespace    https://github.com/choujar/campaign-userscripts
// @version      1.8.2
// @description  UX improvements for List Manager and Rocket
// @author       Sahil Choujar
// @match        https://listmanager.greens.org.au/*
// @match        https://contact-sa.greens.org.au/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/choujar/campaign-userscripts/main/listmanager.user.js
// @downloadURL  https://raw.githubusercontent.com/choujar/campaign-userscripts/main/listmanager.user.js
// ==/UserScript==

(function() {
    'use strict';

    const IS_LISTMANAGER = location.hostname === 'listmanager.greens.org.au';
    const IS_ROCKET = location.hostname === 'contact-sa.greens.org.au';

    // =========================================================================
    // Shared styles
    // =========================================================================
    GM_addStyle(`
        .gus-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .gus-modal {
            background: white;
            border-radius: 12px;
            padding: 24px;
            width: 560px;
            max-width: 90vw;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .gus-modal h2 {
            margin: 0 0 4px 0;
            font-size: 18px;
            font-weight: 600;
            color: #333;
        }
        .gus-modal label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: #555;
            margin-bottom: 6px;
        }
        .gus-modal textarea {
            width: 100%;
            min-height: 160px;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
            line-height: 1.5;
            resize: vertical;
            box-sizing: border-box;
        }
        .gus-modal textarea:focus {
            outline: none;
            border-color: #2e7d32;
            box-shadow: 0 0 0 2px rgba(46,125,50,0.15);
        }
        .gus-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 16px;
        }
        .gus-modal-actions button,
        .gus-modal-actions a {
            padding: 8px 16px;
            border-radius: 6px;
            border: 1px solid #ccc;
            background: white;
            cursor: pointer;
            font-size: 14px;
            text-decoration: none;
            display: inline-block;
        }
        .gus-modal-actions .gus-save,
        .gus-modal-actions .gus-send {
            background: #2e7d32;
            color: white;
            border-color: #2e7d32;
        }
        .gus-modal-actions .gus-save:hover,
        .gus-modal-actions .gus-send:hover {
            background: #256b29;
        }
        .gus-modal-actions button:not(.gus-save):not(.gus-send):hover {
            background: #f5f5f5;
        }
        .gus-banner {
            background: #fff3e0;
            border: 1px solid #ffb74d;
            border-radius: 8px;
            padding: 10px 14px;
            margin-bottom: 16px;
            font-size: 13px;
            color: #e65100;
            line-height: 1.4;
        }
    `);

    // =========================================================================
    // Shared: dismiss overlay helper
    // =========================================================================
    function dismissOnEscapeOrClickOutside(overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handler);
            }
        });
    }

    // =========================================================================
    // LIST MANAGER features
    // =========================================================================
    if (IS_LISTMANAGER) {

        // --- Pointer cursor on name cells only ---
        GM_addStyle(`
            .MuiDataGrid-cell[data-field="preferredName"],
            .MuiDataGrid-cell[data-field="lastName"],
            .MuiDataGrid-cell[data-field="firstName"] {
                cursor: pointer !important;
            }
            .MuiDataGrid-cell[data-field="preferredName"] span[role="presentation"],
            .MuiDataGrid-cell[data-field="lastName"] span[role="presentation"],
            .MuiDataGrid-cell[data-field="firstName"] span[role="presentation"] {
                cursor: pointer !important;
            }
        `);

        // --- Template manager styles ---
        GM_addStyle(`
            .gus-template-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                border: 1px solid #ccc;
                border-radius: 8px;
                background: white;
                cursor: pointer;
                font-size: 16px;
                margin-left: 10px;
                vertical-align: middle;
                transition: background 0.15s, border-color 0.15s;
                flex-shrink: 0;
            }
            .gus-template-btn:hover {
                background: #f5f5f5;
                border-color: #999;
            }
            .gus-template-btn.has-template {
                border-color: #2e7d32;
                color: #2e7d32;
            }
            .gus-modal .gus-list-label {
                font-size: 13px;
                color: #666;
                margin-bottom: 16px;
            }
            .gus-version-badge {
                font-size: 10px;
                color: #999;
                font-weight: 400;
                margin-left: auto;
                padding-right: 12px;
                white-space: nowrap;
                letter-spacing: 0.3px;
                text-decoration: none;
            }
            .gus-version-badge:hover {
                color: #666;
                text-decoration: underline;
            }
        `);

        const DEFAULT_TEMPLATE = `Hi [their name], this is [your name] from the SA Greens.

The election has now been called! We need people to hand out 'How to Vote' cards at polling booths across [electorate] ([suburb]) on election day (21st of March). If you are able to help I can roster you on at a time and place that suits.`;

        function getListId() {
            const match = window.location.pathname.match(/\/lists\/(\d+)/);
            return match ? match[1] : null;
        }

        function getListName() {
            const heading = document.querySelector('h5.MuiTypography-h5');
            return heading ? heading.textContent.trim() : null;
        }

        function getStorageKey(listId) { return 'smsTemplate_' + listId; }
        function getListNameKey(listId) { return 'smsTemplateListName_' + listId; }

        function loadTemplate(listId) { return GM_getValue(getStorageKey(listId), null); }

        function saveTemplate(listId, template, listName) {
            GM_setValue(getStorageKey(listId), template);
            // Also save as the shared template for Rocket to read
            GM_setValue('smsTemplate_current', template);
            if (listName) {
                GM_setValue(getListNameKey(listId), listName);
            }
        }

        function createTemplateModal(listId, listName) {
            const existing = loadTemplate(listId);
            const template = existing !== null ? existing : DEFAULT_TEMPLATE;

            const overlay = document.createElement('div');
            overlay.className = 'gus-overlay';

            const savedListName = GM_getValue(getListNameKey(listId), null);
            const nameChanged = savedListName && listName && savedListName !== listName;

            overlay.innerHTML = `
                <div class="gus-modal">
                    <h2>Templates</h2>
                    <div class="gus-list-label">List: ${listName || listId}</div>
                    ${nameChanged ? `
                        <div class="gus-banner">
                            This is a different list${savedListName ? ` (was: ${savedListName})` : ''}. Check the template is still appropriate.
                        </div>
                    ` : ''}
                    <label for="gus-sms-template">SMS Template</label>
                    <textarea id="gus-sms-template">${template}</textarea>
                    <div class="gus-modal-actions">
                        <button class="gus-cancel">Cancel</button>
                        <button class="gus-save">Save</button>
                    </div>
                </div>
            `;

            overlay.querySelector('.gus-cancel').addEventListener('click', () => overlay.remove());
            dismissOnEscapeOrClickOutside(overlay);

            overlay.querySelector('.gus-save').addEventListener('click', () => {
                const val = overlay.querySelector('#gus-sms-template').value;
                saveTemplate(listId, val, listName);
                updateButtonState(listId);
                overlay.remove();
            });

            document.body.appendChild(overlay);
            overlay.querySelector('#gus-sms-template').focus();
        }

        function updateButtonState(listId) {
            const btn = document.querySelector('.gus-template-btn');
            if (!btn) return;
            const hasTemplate = loadTemplate(listId) !== null;
            btn.classList.toggle('has-template', hasTemplate);
            btn.title = hasTemplate ? 'Edit SMS template' : 'Set up SMS template';
        }

        function injectButton() {
            const listId = getListId();
            if (!listId) return;

            const heading = document.querySelector('h5.MuiTypography-h5');
            if (!heading) return;
            if (heading.querySelector('.gus-template-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'gus-template-btn';
            btn.innerHTML = '&#9881;';

            const hasTemplate = loadTemplate(listId) !== null;
            btn.classList.toggle('has-template', hasTemplate);
            btn.title = hasTemplate ? 'Edit SMS template' : 'Set up SMS template';

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                createTemplateModal(listId, getListName());
            });

            heading.style.display = 'flex';
            heading.style.alignItems = 'center';
            heading.appendChild(btn);
        }

        function injectVersionBadge() {
            const topBar = document.querySelector('.TopBar-titleText');
            if (!topBar) return;
            if (topBar.parentElement.querySelector('.gus-version-badge')) return;

            const container = topBar.parentElement;
            container.style.display = 'flex';
            container.style.alignItems = 'center';

            const badge = document.createElement('a');
            badge.className = 'gus-version-badge';
            badge.textContent = 'Tweaks v' + GM_info.script.version;
            badge.href = 'https://raw.githubusercontent.com/choujar/campaign-userscripts/main/listmanager.user.js';
            badge.target = '_blank';
            badge.rel = 'noopener';
            container.appendChild(badge);
        }

        let lastListId = getListId();

        function checkListChange() {
            const currentId = getListId();
            if (currentId && currentId !== lastListId) {
                lastListId = currentId;
                const oldBtn = document.querySelector('.gus-template-btn');
                if (oldBtn) oldBtn.remove();
                injectButton();
            }
        }

        const lmObserver = new MutationObserver(() => {
            injectButton();
            injectVersionBadge();
            checkListChange();
        });
        lmObserver.observe(document.body, { childList: true, subtree: true });

        injectButton();
        injectVersionBadge();
    }

    // =========================================================================
    // ROCKET features (inside iframe)
    // =========================================================================
    if (IS_ROCKET) {

        GM_addStyle(`
            .gus-sms-link {
                display: inline-block;
                margin-left: 4px;
                margin-right: 12px;
                padding: 2px 8px;
                font-size: 11px;
                font-weight: 600;
                color: #fff;
                background: #2e7d32;
                border: 1px solid #2e7d32;
                border-radius: 4px;
                cursor: pointer;
                text-decoration: none;
                vertical-align: middle;
                transition: background 0.15s, color 0.15s;
            }
            .gus-sms-link:hover {
                background: #256b29;
                color: #fff;
            }
            .gus-modal .gus-preview-label {
                font-size: 13px;
                font-weight: 500;
                color: #555;
                margin-bottom: 6px;
            }
            .gus-modal .gus-preview {
                background: #f5f5f5;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 14px;
                font-size: 14px;
                line-height: 1.6;
                white-space: pre-wrap;
                color: #333;
                margin-bottom: 16px;
            }
            .gus-modal .gus-preview .gus-placeholder {
                background: #fff3e0;
                color: #e65100;
                padding: 1px 4px;
                border-radius: 3px;
                font-weight: 500;
            }
            .gus-modal .gus-preview .gus-filled {
                background: #e8f5e9;
                color: #2e7d32;
                padding: 1px 4px;
                border-radius: 3px;
                font-weight: 500;
            }
            .gus-electorate-row {
                margin-top: 2px;
            }
            .gus-electorate-row label {
                font-weight: bold;
                margin-right: 4px;
            }
            .gus-electorate-value {
                font-weight: normal;
            }
            .gus-spinner {
                display: inline-block;
                width: 12px;
                height: 12px;
                border: 2px solid #ccc;
                border-top-color: #2e7d32;
                border-radius: 50%;
                animation: gus-spin 0.6s linear infinite;
                vertical-align: middle;
                margin-left: 4px;
            }
            @keyframes gus-spin {
                to { transform: rotate(360deg); }
            }
            .gus-modal .gus-to {
                font-size: 13px;
                color: #666;
                margin-bottom: 16px;
            }
        `);

        const DEFAULT_TEMPLATE_ROCKET = `Hi [their name], this is [your name] from the SA Greens.

The election has now been called! We need people to hand out 'How to Vote' cards at polling booths across [electorate] ([suburb]) on election day (21st of March). If you are able to help I can roster you on at a time and place that suits.`;

        function getContactName() {
            const h2 = document.querySelector('h2.ng-binding');
            if (!h2) return null;

            const text = h2.childNodes[0]?.textContent?.trim();
            if (!text) return null;

            const parts = text.split('~');
            const preferred = parts.length > 1 ? parts[1].trim() : null;
            const fullName = parts[0].trim();
            const firstName = fullName.split(' ')[0];

            return {
                full: fullName,
                preferred: preferred || firstName,
                first: firstName
            };
        }

        function getSuburb() {
            const addrSpan = document.querySelector('span[agc-address]');
            if (!addrSpan) return null;

            const text = addrSpan.textContent.trim();
            const parts = text.split(',').map(p => p.trim());
            for (let i = 0; i < parts.length; i++) {
                if (/^\d{4}$/.test(parts[i])) {
                    const suburb = parts[i - 1];
                    if (suburb) {
                        return suburb.replace(/\b\w+/g, w =>
                            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                        );
                    }
                }
            }
            return null;
        }

        // =================================================================
        // Electorate lookup via ECSA polygon data
        // =================================================================

        let ecsaDistricts = null; // cached polygon data
        let ecsaLoading = false;
        let ecsaCallbacks = [];

        function loadEcsaData(callback) {
            if (ecsaDistricts) {
                callback(ecsaDistricts);
                return;
            }
            ecsaCallbacks.push(callback);
            if (ecsaLoading) return;
            ecsaLoading = true;

            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://www.ecsa.sa.gov.au/index.php?option=com_ecsa_map&task=get_sa_council_region&format=map_service',
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const districts2026 = data['2026'] || [];
                        ecsaDistricts = districts2026.map(d => ({
                            name: d.name,
                            paths: d.paths
                        }));
                        ecsaCallbacks.forEach(cb => cb(ecsaDistricts));
                        ecsaCallbacks = [];
                    } catch (e) {
                        console.error('[GUS] Failed to parse ECSA data:', e);
                        ecsaCallbacks.forEach(cb => cb(null));
                        ecsaCallbacks = [];
                    }
                },
                onerror: function(err) {
                    console.error('[GUS] Failed to fetch ECSA data:', err);
                    ecsaCallbacks.forEach(cb => cb(null));
                    ecsaCallbacks = [];
                }
            });
        }

        // Build a list of address variants to try, from most specific to least
        function buildAddressVariants(rawAddress) {
            const variants = [];
            const parts = rawAddress.split(',').map(p => p.trim());

            // Pattern for unit/apartment/flat segments
            const unitPattern = /^(unit|apartment|apt|flat|suite|ste|level|lvl|lot)\b/i;
            // Pattern for "3/45" or "Unit 3" prefix on a street part (e.g. "3/45 Smith St")
            const slashUnitPattern = /^\d+\s*\/\s*(\d+.*)$/;

            // First: filter out standalone unit/apartment parts
            const cleaned = [];
            for (const part of parts) {
                if (unitPattern.test(part)) continue; // skip "Apartment 221" etc
                // Convert "3/45 Smith St" → "45 Smith St"
                const slashMatch = part.match(slashUnitPattern);
                if (slashMatch) {
                    cleaned.push(slashMatch[1]);
                } else {
                    cleaned.push(part);
                }
            }
            const cleanedAddr = cleaned.join(', ');
            if (cleanedAddr !== rawAddress) {
                variants.push(cleanedAddr);
            }

            // Second: just street + suburb + postcode + state (drop any extra address lines)
            // Find the suburb (uppercase word before a 4-digit postcode)
            const postcodeIdx = cleaned.findIndex(p => /^\d{4}$/.test(p));
            if (postcodeIdx >= 1) {
                // Take from the first part (street) + suburb onward
                const minimal = [cleaned[0], ...cleaned.slice(postcodeIdx - 1)].join(', ');
                if (minimal !== cleanedAddr) {
                    variants.push(minimal);
                }
            }

            return variants;
        }

        function nominatimSearch(address, callback) {
            const query = encodeURIComponent(address + ', South Australia, Australia');
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
                headers: { 'User-Agent': 'CampaignUserscripts/1.0' },
                onload: function(response) {
                    try {
                        const results = JSON.parse(response.responseText);
                        if (results.length > 0) {
                            callback(parseFloat(results[0].lat), parseFloat(results[0].lon));
                        } else {
                            callback(null, null);
                        }
                    } catch (e) {
                        console.error('[GUS] Nominatim parse error:', e);
                        callback(null, null);
                    }
                },
                onerror: function(err) {
                    console.error('[GUS] Nominatim request failed:', err);
                    callback(null, null);
                }
            });
        }

        function geocodeAddress(address, callback) {
            // Try the raw address first, then cleaned variants
            const variants = buildAddressVariants(address);
            const allAttempts = [address, ...variants];
            let attempt = 0;

            function tryNext() {
                if (attempt >= allAttempts.length) {
                    console.log('[GUS] Nominatim: no results after', attempt, 'attempts for', address);
                    callback(null, null);
                    return;
                }
                const addr = allAttempts[attempt];
                console.log('[GUS] Nominatim attempt', attempt + 1 + '/' + allAttempts.length + ':', addr);
                nominatimSearch(addr, (lat, lng) => {
                    if (lat !== null) {
                        if (attempt > 0) console.log('[GUS] Nominatim: succeeded on cleaned address:', addr);
                        callback(lat, lng);
                    } else {
                        attempt++;
                        tryNext();
                    }
                });
            }
            tryNext();
        }

        // Simple point-in-polygon using ray casting (no Google dependency)
        function pointInPolygon(lat, lng, polygon) {
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const yi = polygon[i].lat, xi = polygon[i].lng;
                const yj = polygon[j].lat, xj = polygon[j].lng;
                const intersect = ((yi > lat) !== (yj > lat)) &&
                    (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }

        // Decode Google's encoded polyline format
        function decodePolyline(encoded) {
            const points = [];
            let index = 0, lat = 0, lng = 0;
            while (index < encoded.length) {
                let shift = 0, result = 0, byte;
                do {
                    byte = encoded.charCodeAt(index++) - 63;
                    result |= (byte & 0x1f) << shift;
                    shift += 5;
                } while (byte >= 0x20);
                lat += (result & 1) ? ~(result >> 1) : (result >> 1);

                shift = 0; result = 0;
                do {
                    byte = encoded.charCodeAt(index++) - 63;
                    result |= (byte & 0x1f) << shift;
                    shift += 5;
                } while (byte >= 0x20);
                lng += (result & 1) ? ~(result >> 1) : (result >> 1);

                points.push({ lat: lat / 1e5, lng: lng / 1e5 });
            }
            return points;
        }

        function findElectorate(address, callback) {
            geocodeAddress(address, (lat, lng) => {
                if (lat === null) {
                    callback(null);
                    return;
                }
                console.log('[GUS] Geocoded to:', lat, lng);

                loadEcsaData((districts) => {
                    if (!districts) {
                        callback(null);
                        return;
                    }

                    for (const district of districts) {
                        if (district.name === 'All Districts') continue;

                        try {
                            for (const encodedPath of district.paths) {
                                const polygon = decodePolyline(encodedPath);
                                if (pointInPolygon(lat, lng, polygon)) {
                                    const name = district.name.charAt(0).toUpperCase() +
                                        district.name.slice(1).toLowerCase();
                                    console.log('[GUS] Found electorate:', name);
                                    callback(name);
                                    return;
                                }
                            }
                        } catch (e) {
                            // Skip malformed districts
                        }
                    }

                    console.log('[GUS] No electorate found for location');
                    callback(null);
                });
            });
        }

        // Cache electorate per contact address to avoid re-geocoding
        let cachedElectorate = { address: null, electorate: null, loading: false };
        let electorateReadyCallbacks = [];

        function getElectorateForContact(callback) {
            if (cachedElectorate.electorate !== null && cachedElectorate.address === getCurrentAddress()) {
                callback(cachedElectorate.electorate);
                return;
            }
            if (cachedElectorate.loading) {
                electorateReadyCallbacks.push(callback);
                return;
            }
            callback(null);
        }

        function getCurrentAddress() {
            const addrSpan = document.querySelector('span[agc-address]');
            return addrSpan ? addrSpan.textContent.trim() : null;
        }

        function injectElectorateRow() {
            const addrP = document.querySelector('p[ng-if="fields.show_primary_address"]');
            if (!addrP) return;
            if (addrP.parentElement.querySelector('.gus-electorate-row')) return;

            const row = document.createElement('p');
            row.className = 'col-md-12 gus-electorate-row';
            row.innerHTML = '<label>Electorate:</label><span class="gus-electorate-value"><span class="gus-spinner"></span></span>';

            addrP.after(row);
            return row;
        }

        function updateElectorateDisplay(electorate) {
            const valueSpan = document.querySelector('.gus-electorate-value');
            if (!valueSpan) return;
            if (electorate) {
                valueSpan.textContent = electorate;
            } else {
                valueSpan.innerHTML = '<span style="color:#999">Not found</span>';
            }
        }

        function prefetchElectorate() {
            const address = getCurrentAddress();
            if (!address) return;
            if (cachedElectorate.address === address) return;

            cachedElectorate = { address: address, electorate: null, loading: true };
            injectElectorateRow();

            findElectorate(address, (electorate) => {
                cachedElectorate = { address: address, electorate: electorate, loading: false };
                updateElectorateDisplay(electorate);
                electorateReadyCallbacks.forEach(cb => cb(electorate));
                electorateReadyCallbacks = [];
            });
        }

        function getRocketTemplate() {
            // Try shared template from List Manager, fall back to default
            const shared = GM_getValue('smsTemplate_current', null);
            return shared || DEFAULT_TEMPLATE_ROCKET;
        }

        function fillTemplate(template, name, suburb, electorate) {
            let filled = template;
            filled = filled.replace(/\[their name\]/gi, name || '[their name]');
            filled = filled.replace(/\[suburb\]/gi, suburb || '[suburb]');
            filled = filled.replace(/\[electorate\]/gi, electorate || '[electorate]');
            return filled;
        }

        function fillTemplateForPreview(template, name, suburb, electorate) {
            let html = template
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            html = html.replace(/\[their name\]/gi, name
                ? `<span class="gus-filled">${name}</span>`
                : '<span class="gus-placeholder">[their name]</span>');
            html = html.replace(/\[suburb\]/gi, suburb
                ? `<span class="gus-filled">${suburb}</span>`
                : '<span class="gus-placeholder">[suburb]</span>');
            html = html.replace(/\[electorate\]/gi, electorate
                ? `<span class="gus-filled">${electorate}</span>`
                : '<span class="gus-placeholder">[electorate]</span>');

            // Any remaining placeholders stay orange
            html = html.replace(/\[([^\]]+)\]/g, '<span class="gus-placeholder">[$1]</span>');

            return html;
        }

        function buildSmsUrl(phoneDigits, message) {
            const encoded = encodeURIComponent(message);
            return `sms:${phoneDigits}&body=${encoded}`;
        }

        function showSmsModal(phone, contactName, suburb) {
            // Show modal immediately with loading state for electorate
            const template = getRocketTemplate();

            const overlay = document.createElement('div');
            overlay.className = 'gus-overlay';

            function renderModal(electorate) {
                const filled = fillTemplate(template, contactName.preferred, suburb, electorate);
                const previewHtml = fillTemplateForPreview(template, contactName.preferred, suburb, electorate);

                overlay.innerHTML = `
                    <div class="gus-modal">
                        <h2>Send SMS</h2>
                        <div class="gus-to">To: ${contactName.preferred} (${phone.display})</div>
                        <div class="gus-preview-label">Message preview:</div>
                        <div class="gus-preview">${previewHtml}</div>
                        <div class="gus-modal-actions">
                            <button class="gus-cancel">Cancel</button>
                            <a class="gus-send" href="${buildSmsUrl(phone.digits, filled)}">Send SMS</a>
                        </div>
                    </div>
                `;

                overlay.querySelector('.gus-cancel').addEventListener('click', () => overlay.remove());
                overlay.querySelector('.gus-send').addEventListener('click', () => {
                    setTimeout(() => overlay.remove(), 300);
                });
            }

            dismissOnEscapeOrClickOutside(overlay);

            // Render immediately without electorate
            renderModal(null);
            document.body.appendChild(overlay);

            // Then look up electorate and re-render
            getElectorateForContact((electorate) => {
                if (electorate && document.body.contains(overlay)) {
                    renderModal(electorate);
                }
            });
        }

        function injectSmsLinks() {
            const contactName = getContactName();
            if (!contactName) return;

            const suburb = getSuburb();

            document.querySelectorAll('span[agc-phone]').forEach(span => {
                if (span.querySelector('.gus-sms-link')) return;

                const text = span.childNodes[0]?.textContent?.trim();
                if (!text) return;

                const digits = text.replace(/\s/g, '');
                if (!/^04\d{8}$/.test(digits)) return;

                const phone = { display: text, digits: digits };

                const smsLink = document.createElement('span');
                smsLink.className = 'gus-sms-link';
                smsLink.textContent = 'SMS';
                smsLink.title = 'Send SMS to ' + text;

                smsLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showSmsModal(phone, contactName, suburb);
                });

                // Place after the asterisk (primary indicator) if present, else after phone icon
                const asterisk = span.querySelector('.fa-asterisk');
                if (asterisk) {
                    asterisk.after(smsLink);
                } else {
                    const phoneIcon = span.querySelector('a[href^="tel:"]');
                    if (phoneIcon) {
                        phoneIcon.after(smsLink);
                    } else {
                        span.appendChild(smsLink);
                    }
                }
            });
        }

        const rocketObserver = new MutationObserver(() => {
            injectSmsLinks();
            prefetchElectorate();
        });
        rocketObserver.observe(document.body, { childList: true, subtree: true });

        injectSmsLinks();
        prefetchElectorate();
    }

})();
