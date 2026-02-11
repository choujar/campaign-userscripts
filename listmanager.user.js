// ==UserScript==
// @name         List Manager Tweaks
// @namespace    https://github.com/choujar/campaign-userscripts
// @version      1.15.2
// @description  UX improvements for List Manager and Rocket
// @author       Sahil Choujar
// @match        https://listmanager.greens.org.au/*
// @match        https://contact-sa.greens.org.au/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @connect      api.listmanager.greens.org.au
// @connect      nominatim.openstreetmap.org
// @connect      www.ecsa.sa.gov.au
// @updateURL    https://raw.githubusercontent.com/choujar/campaign-userscripts/main/listmanager.user.js
// @downloadURL  https://raw.githubusercontent.com/choujar/campaign-userscripts/main/listmanager.user.js
// ==/UserScript==

(function() {
    'use strict';

    const IS_LISTMANAGER = location.hostname === 'listmanager.greens.org.au';
    const IS_ROCKET = location.hostname === 'contact-sa.greens.org.au';

    const GUS_DEBUG = false;
    function debugLog(...args) { if (GUS_DEBUG) console.log('[GUS]', ...args); }

    // --- JWT token interception ---
    // Capture Bearer token via: 1) localStorage (Auth0 cache), 2) fetch/XHR interception
    let capturedJwt = null;

    // Access the page's real window (not Tampermonkey's sandbox)
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    function scanLocalStorageForJwt() {
        try {
            const ls = pageWindow.localStorage;
            const allKeys = [];
            for (let i = 0; i < ls.length; i++) {
                allKeys.push(ls.key(i));
            }
            const authKeys = allKeys.filter(k => k && (
                k.includes('auth0') || k.includes('token') || k.includes('jwt') || k.includes('access')
            ));
            for (const key of authKeys) {
                const raw = ls.getItem(key);
                try {
                    const data = JSON.parse(raw);
                    const token = data?.body?.access_token;
                    if (token) return token;
                } catch (e) {}
            }
        } catch (e) {}
        return null;
    }

    if (IS_LISTMANAGER) {
        // Try localStorage first (catches tokens from before script loaded)
        capturedJwt = scanLocalStorageForJwt();

        // Intercept the PAGE's fetch/XHR (not the sandbox's)
        const origFetch = pageWindow.fetch;
        pageWindow.fetch = function(input, init) {
            try {
                const url = typeof input === 'string' ? input : (input?.url || '');
                const authHeader = init?.headers?.Authorization
                    || init?.headers?.authorization
                    || (init?.headers instanceof Headers ? init.headers.get('Authorization') : null);
                if (authHeader && authHeader.startsWith('Bearer ') && url.includes('api.listmanager.greens.org.au')) {
                    capturedJwt = authHeader.replace('Bearer ', '');
                }
            } catch (e) {}
            return origFetch.apply(this, arguments);
        };

        const origXhrOpen = pageWindow.XMLHttpRequest.prototype.open;
        const origXhrSetHeader = pageWindow.XMLHttpRequest.prototype.setRequestHeader;
        pageWindow.XMLHttpRequest.prototype.open = function(method, url) {
            this._gusUrl = url;
            return origXhrOpen.apply(this, arguments);
        };
        pageWindow.XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            try {
                if ((name === 'Authorization' || name === 'authorization') &&
                    value.startsWith('Bearer ') &&
                    this._gusUrl && this._gusUrl.includes('api.listmanager.greens.org.au')) {
                    capturedJwt = value.replace('Bearer ', '');
                }
            } catch (e) {}
            return origXhrSetHeader.apply(this, arguments);
        };
    }

    // --- styles ---
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

    function escapeHtml(s) {
        return ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

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

    // --- List Manager ---
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

        // --- Roster tracker styles ---
        GM_addStyle(`
            .gus-roster-widget {
                background: transparent;
                padding: 0 20px;
                margin-left: auto;
                margin-right: 0;
                min-width: 140px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }
            .gus-roster-title {
                font-size: 14px;
                font-weight: 600;
                color: #333;
                margin: 0;
            }
            .gus-roster-ring {
                position: relative;
                width: 100px;
                height: 100px;
            }
            .gus-roster-ring svg {
                width: 100%;
                height: 100%;
                transform: rotate(-90deg);
            }
            .gus-roster-ring .gus-ring-bg {
                fill: none;
                stroke: #e0e0e0;
                stroke-width: 8;
            }
            .gus-roster-ring .gus-ring-fg {
                fill: none;
                stroke: #2e7d32;
                stroke-width: 8;
                transition: stroke-dashoffset 0.6s ease;
            }
            .gus-roster-ring .gus-ring-other {
                fill: none;
                stroke: #5c9dc4;
                stroke-width: 8;
                transition: stroke-dashoffset 0.6s ease;
            }
            .gus-roster-pct {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 18px;
                font-weight: 600;
                color: #333;
            }
            .gus-roster-count {
                font-size: 13px;
                color: #666;
                display: block;
                width: 100%;
                text-align: center;
            }
            .gus-roster-count strong {
                color: #333;
            }
            .gus-roster-refresh {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 14px;
                color: #999;
                padding: 2px;
                transition: color 0.15s;
            }
            .gus-roster-refresh:hover {
                color: #333;
            }
            .gus-roster-loading {
                color: #999;
                font-size: 13px;
            }
            .gus-roster-error {
                color: #d32f2f;
                font-size: 12px;
            }
            .gus-roster-legend {
                display: flex;
                gap: 10px;
                font-size: 11px;
                color: #666;
            }
            .gus-roster-legend span {
                display: flex;
                align-items: center;
                gap: 3px;
            }
            .gus-roster-legend .gus-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
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
                font-size: 22px;
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
                    <div class="gus-list-label">List: ${escapeHtml(listName || listId)}</div>
                    ${nameChanged ? `
                        <div class="gus-banner">
                            This is a different list${savedListName ? ` (was: ${escapeHtml(savedListName)})` : ''}. Check the template is still appropriate.
                        </div>
                    ` : ''}
                    <label for="gus-sms-template">SMS Template</label>
                    <textarea id="gus-sms-template">${escapeHtml(template)}</textarea>
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
            badge.href = 'https://raw.githubusercontent.com/choujar/campaign-userscripts/main/listmanager.user.js?t=' + Date.now();
            badge.target = '_blank';
            badge.rel = 'noopener';
            container.appendChild(badge);
        }

        // --- Roster count tracker ---
        const ROSTER_TARGET = 1601;
        const HEYSEN_ELECTORATE_ID = 140532;
        let rosterTotal = null;
        let rosterHeysen = null;
        let rosterLoading = false;
        let rosterError = null;

        function buildTotalTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'geometryIds', value: [6], operator: 'lives in' } },
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [], rosterTypes: ['Rostered'], shiftStatus: 'Confirmed', votingPeriod: 'Polling Day' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function buildHeysenTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [HEYSEN_ELECTORATE_ID], rosterTypes: ['Rostered'], shiftStatus: 'Confirmed', votingPeriod: 'Polling Day' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function fetchOneRoster(tree, cb) {
            const url = 'https://api.listmanager.greens.org.au/advsearch/preview?domainCode=sa&tree=' + encodeURIComponent(tree);
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Authorization': 'Bearer ' + capturedJwt,
                    'Accept': '*/*',
                    'Origin': 'https://listmanager.greens.org.au'
                },
                onload: function(response) {
                    if (response.status === 401) { cb(null, 'auth_expired'); return; }
                    try {
                        const data = JSON.parse(response.responseText);
                        cb(data.count ?? null, null);
                    } catch (e) { cb(null, 'Parse error'); }
                },
                onerror: function() { cb(null, 'Request failed'); }
            });
        }

        function fetchRosterCount(callback) {
            if (!capturedJwt) {
                if (callback) callback(null, 'Waiting for auth...');
                return;
            }
            if (isJwtExpired(capturedJwt)) {
                capturedJwt = null;
                rosterError = 'Auth expired, refreshing...';
                updateRosterWidget();
                waitForJwtAndRetry(callback);
                return;
            }
            rosterLoading = true;
            rosterError = null;
            updateRosterWidget();

            let done = 0;
            let authExpired = false;

            function checkDone() {
                done++;
                if (done < 2) return;
                rosterLoading = false;
                if (authExpired) {
                    capturedJwt = null;
                    rosterError = 'Auth expired, refreshing...';
                    updateRosterWidget();
                    waitForJwtAndRetry(callback);
                    return;
                }
                updateRosterWidget();
                if (callback) callback(rosterTotal, rosterError);
            }

            fetchOneRoster(buildTotalTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { rosterError = err; }
                else { rosterTotal = count; }
                checkDone();
            });

            fetchOneRoster(buildHeysenTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { if (!rosterError) rosterError = err; }
                else { rosterHeysen = count; }
                checkDone();
            });
        }

        function isJwtExpired(token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.exp && (payload.exp * 1000) < Date.now();
            } catch (e) {
                return false;
            }
        }

        function waitForJwtAndRetry(callback) {
            let retryCount = 0;
            const interval = setInterval(() => {
                retryCount++;
                if (capturedJwt && !isJwtExpired(capturedJwt)) {
                    clearInterval(interval);
                    fetchRosterCount(callback);
                } else if (retryCount > 15) {
                    clearInterval(interval);
                    rosterError = 'Auth timeout — click refresh';
                    updateRosterWidget();
                }
            }, 2000);
        }

        function buildRingHtml(heysenPct, otherPct, heysenCount, otherCount) {
            const r = 40;
            const circ = 2 * Math.PI * r;
            const heysenLen = (heysenPct / 100) * circ;
            const otherLen = (otherPct / 100) * circ;
            const totalPct = Math.round(heysenPct + otherPct);
            const otherRotation = (heysenPct / 100) * 360;
            return `
                <div class="gus-roster-ring">
                    <svg viewBox="0 0 100 100">
                        <circle class="gus-ring-bg" cx="50" cy="50" r="${r}"/>
                        <circle class="gus-ring-fg" cx="50" cy="50" r="${r}"
                            stroke-dasharray="${heysenLen} ${circ - heysenLen}"
                            data-hover-text="${heysenCount}" style="pointer-events: stroke; cursor: pointer;"/>
                        <circle class="gus-ring-other" cx="50" cy="50" r="${r}"
                            stroke-dasharray="${otherLen} ${circ - otherLen}"
                            data-hover-text="${otherCount}"
                            style="transform: rotate(${otherRotation}deg); transform-origin: 50% 50%; pointer-events: stroke; cursor: pointer;"/>
                    </svg>
                    <span class="gus-roster-pct" data-default="${totalPct}%">${totalPct}%</span>
                </div>
            `;
        }

        function attachRingHover(widget) {
            const ring = widget.querySelector('.gus-roster-ring');
            if (!ring || ring.dataset.gusHover) return;
            ring.dataset.gusHover = '1';
            const pctEl = ring.querySelector('.gus-roster-pct');
            if (!pctEl) return;
            const defaultText = pctEl.dataset.default;
            ring.querySelectorAll('circle[data-hover-text]').forEach(circle => {
                circle.addEventListener('mouseenter', () => {
                    pctEl.textContent = circle.dataset.hoverText;
                });
                circle.addEventListener('mouseleave', () => {
                    pctEl.textContent = defaultText;
                });
            });
        }

        function updateRosterWidget() {
            const widget = document.querySelector('.gus-roster-widget');
            if (!widget) return;

            const body = widget.querySelector('.gus-roster-body');
            if (!body) return;

            if (rosterLoading) {
                body.innerHTML = '<span class="gus-roster-loading"><span class="gus-spinner"></span> Loading...</span>';
                return;
            }
            if (rosterError) {
                body.innerHTML = `<span class="gus-roster-error">${escapeHtml(rosterError)}</span>`;
                return;
            }
            if (rosterTotal !== null) {
                const heysen = rosterHeysen ?? 0;
                const other = rosterTotal - heysen;
                const heysenPct = Math.min((heysen / ROSTER_TARGET) * 100, 100);
                const otherPct = Math.min((other / ROSTER_TARGET) * 100, 100 - heysenPct);
                body.innerHTML = `
                    ${buildRingHtml(heysenPct, otherPct, heysen.toLocaleString(), other.toLocaleString())}
                    <span class="gus-roster-count"><strong>${rosterTotal.toLocaleString()}</strong> (${heysen.toLocaleString()}) / ${ROSTER_TARGET.toLocaleString()}</span>
                    <div class="gus-roster-legend">
                        <span><span class="gus-dot" style="background:#2e7d32;"></span>Heysen</span>
                        <span><span class="gus-dot" style="background:#5c9dc4;"></span>Other</span>
                    </div>
                `;
                attachRingHover(widget);
            }
        }

        function injectRosterWidget() {
            const existing = document.querySelector('.gus-roster-widget');
            if (existing && existing.isConnected) return;

            // Find the stats area — the container with "Call statistics"
            const statsContainer = document.querySelector('div.css-1s6dbl6');
            if (!statsContainer) return;

            // Make the parent flex so widget sits alongside
            const parent = statsContainer.parentElement;
            if (parent && !parent.dataset.gusFlexed) {
                parent.style.display = 'flex';
                parent.style.alignItems = 'flex-start';
                parent.dataset.gusFlexed = '1';
            }

            const widget = document.createElement('div');
            widget.className = 'gus-roster-widget';
            widget.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="gus-roster-title">Roster progress</span>
                    <button class="gus-roster-refresh" title="Refresh">&#x21bb;</button>
                </div>
                <div class="gus-roster-body">
                    <span class="gus-roster-loading">Waiting for auth...</span>
                </div>
            `;

            widget.querySelector('.gus-roster-refresh').addEventListener('click', () => {
                fetchRosterCount();
            });

            // Insert before the stats container (to the left)
            parent.insertBefore(widget, statsContainer);

            // Try initial fetch if JWT already captured
            if (capturedJwt) {
                fetchRosterCount();
            }
        }

        // Watch for JWT becoming available and auto-fetch
        let rosterJwtCheckCount = 0;
        let rosterJwtCheckInterval = setInterval(() => {
            // Re-scan localStorage if we still don't have a JWT
            if (!capturedJwt) {
                capturedJwt = scanLocalStorageForJwt();
            }
            if (capturedJwt && rosterCount === null && !rosterLoading) {
                fetchRosterCount();
            }
            rosterJwtCheckCount++;
            if (rosterCount !== null || rosterJwtCheckCount > 30) {
                clearInterval(rosterJwtCheckInterval);
            }
        }, 2000);

        let lastListId = getListId();

        let lastUrl = location.href;

        function checkNavigation() {
            const currentId = getListId();
            const currentUrl = location.href;
            const urlChanged = currentUrl !== lastUrl;
            const listChanged = currentId && currentId !== lastListId;

            if (listChanged) {
                lastListId = currentId;
                const oldBtn = document.querySelector('.gus-template-btn');
                if (oldBtn) oldBtn.remove();
                injectButton();
            }

            if (urlChanged) {
                lastUrl = currentUrl;
                // Remove old widget so it gets re-injected with fresh data
                const oldWidget = document.querySelector('.gus-roster-widget');
                if (oldWidget) oldWidget.remove();
            }
        }

        const lmObserver = new MutationObserver(() => {
            checkNavigation();
            injectButton();
            injectVersionBadge();
            injectRosterWidget();
        });
        lmObserver.observe(document.body, { childList: true, subtree: true });

        injectButton();
        injectVersionBadge();
        injectRosterWidget();
    }

    // --- Rocket ---
    if (IS_ROCKET) {

        GM_addStyle(`
            .gus-sms-link, .gus-copy-phone {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-left: 4px;
                width: 22px;
                height: 22px;
                border-radius: 4px;
                cursor: pointer;
                vertical-align: middle;
                transition: background 0.15s;
                border: none;
            }
            .gus-sms-link svg, .gus-copy-phone svg {
                width: 14px;
                height: 14px;
            }
            .gus-sms-link {
                background: #2e7d32;
                color: #fff;
            }
            .gus-sms-link:hover {
                background: #256b29;
            }
            .gus-sms-link.gus-sms-warn {
                background: #d32f2f;
            }
            .gus-sms-link.gus-sms-warn:hover {
                background: #b71c1c;
            }
            .gus-copy-phone {
                background: #1565c0;
                color: #fff;
                margin-right: 8px;
            }
            .gus-copy-phone:hover {
                background: #0d47a1;
            }
            .gus-copy-phone.gus-copied {
                background: #2e7d32;
            }
            .gus-electorate-select {
                font-size: 14px;
                font-weight: 600;
                padding: 2px 6px;
                border: 1px solid #555;
                border-radius: 4px;
                background: #2b2b2b;
                color: #fff;
                cursor: pointer;
                vertical-align: middle;
            }
            .gus-electorate-select:hover {
                border-color: #888;
            }
            .gus-electorate-select option {
                font-size: 14px;
                font-weight: normal;
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
            .gus-name-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
            }
            .gus-name-row label {
                font-size: 13px;
                font-weight: 500;
                color: #555;
                white-space: nowrap;
                margin: 0;
            }
            .gus-name-row input {
                flex: 1;
                padding: 4px 8px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 14px;
                font-family: inherit;
            }
            .gus-name-row input:focus {
                outline: none;
                border-color: #2e7d32;
            }
            .gus-tasks-table-wrap {
                margin-top: 4px;
                padding: 0 15px;
                width: 100%;
            }
            .gus-tasks-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
                background: #3a3a3a;
                color: #ccc;
                border-radius: 4px;
                overflow: hidden;
            }
            .gus-tasks-table th,
            .gus-tasks-table td {
                padding: 4px 6px;
                text-align: center;
                border: 1px solid #4a4a4a;
                white-space: nowrap;
            }
            .gus-tasks-table th {
                background: #2e2e2e;
                font-weight: 600;
                font-size: 11px;
                color: #aaa;
            }
            .gus-tasks-table th:first-child,
            .gus-tasks-table td:first-child {
                text-align: left;
                font-weight: 500;
                color: #ddd;
            }
            .gus-task-E { color: #5bc0de; }
            .gus-task-Y { color: #5cb85c; }
            .gus-task-D { color: #5cb85c; }
            .gus-task-R { color: #5cb85c; }
            .gus-task-L { color: #5bc0de; }
            .gus-task-T { color: #f0ad4e; }
            .gus-task-I { color: #999; }
            .gus-task-U { color: #999; }
            .gus-task-N { color: #d9534f; }
            .gus-task-X { color: #d9534f; }
            .gus-note-chips {
                display: flex;
                gap: 4px;
                flex-wrap: wrap;
                align-items: center;
                margin-bottom: 4px;
            }
            .gus-note-chip {
                display: inline-block;
                padding: 3px 12px;
                border-radius: 12px;
                font-size: 12px;
                cursor: pointer;
                border: 1px solid #555;
                background: #3a3a3a;
                color: #ccc;
                transition: background 0.15s;
                user-select: none;
            }
            .gus-note-chip:hover {
                background: #4a4a4a;
            }
            .gus-note-chip-date {
                background: #1565c0;
                border-color: #1565c0;
                color: #fff;
            }
            .gus-note-chip-date:hover {
                background: #0d47a1;
            }
            .gus-note-chips-gear {
                cursor: pointer;
                color: #999;
                font-size: 15px;
                padding: 2px 4px;
                transition: color 0.15s;
            }
            .gus-note-chips-gear:hover {
                color: #fff;
            }
            .gus-chips-editor {
                background: #2b2b2b;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 8px;
                margin-bottom: 4px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .gus-chips-editor input {
                padding: 3px 6px;
                border: 1px solid #555;
                border-radius: 3px;
                background: #3a3a3a;
                color: #ccc;
                font-size: 12px;
                font-family: inherit;
            }
            .gus-chips-editor input:focus {
                outline: none;
                border-color: #2e7d32;
            }
            .gus-chips-editor-row {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .gus-chips-editor-row input[type="checkbox"] {
                cursor: pointer;
                accent-color: #2e7d32;
            }
            .gus-chips-btns {
                display: flex;
                gap: 6px;
                justify-content: flex-end;
            }
            .gus-chips-save, .gus-chips-cancel {
                padding: 2px 10px;
                border: none;
                border-radius: 3px;
                font-size: 11px;
                cursor: pointer;
            }
            .gus-chips-save {
                background: #2e7d32;
                color: #fff;
            }
            .gus-chips-save:hover {
                background: #256b29;
            }
            .gus-chips-cancel {
                background: #555;
                color: #ccc;
            }
            .gus-chips-cancel:hover {
                background: #666;
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

        function checkDoNotSms() {
            // ng-if removes the element entirely when false — presence means flag is set
            return document.querySelector('span[ng-if*="do_not_sms"]') !== null;
        }

        function getYourName() { return GM_getValue('gus_your_name', null); }

        // electorate lookup

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
                        debugLog('Failed to parse ECSA data:', e);
                        ecsaCallbacks.forEach(cb => cb(null));
                        ecsaCallbacks = [];
                    }
                },
                onerror: function(err) {
                    debugLog('Failed to fetch ECSA data:', err);
                    ecsaCallbacks.forEach(cb => cb(null));
                    ecsaCallbacks = [];
                }
            });
        }

        // Build a list of address variants to try, from most specific to least
        function buildAddressVariants(rawAddress) {
            const variants = [];
            const parts = rawAddress.split(',').map(p => p.trim());

            // Pattern for standalone unit/apartment/flat segments
            const unitPattern = /^(unit|apartment|apt|flat|suite|ste|level|lvl|lot)\b/i;
            // Pattern for slash-separated units: "3/45 ...", "U304 / 112 ...", "A2/5 ..."
            const slashUnitPattern = /^[A-Za-z]?\d+\s*\/\s*(\d+.*)$/;
            // Pattern for "Unit 3, 45 Smith St" where unit is part of the street segment
            const unitPrefixPattern = /^(unit|u|apt|flat|lot|ste|suite|level|lvl)\s*\.?\s*\d+\s*[,/]\s*(\d+.*)$/i;

            // First: filter out standalone unit/apartment parts and clean unit prefixes
            const cleaned = [];
            for (const part of parts) {
                if (unitPattern.test(part)) continue; // skip "Apartment 221" etc
                // Convert "U304/112 South Terrace" or "3/45 Smith St" → "112 South Terrace" / "45 Smith St"
                const slashMatch = part.match(slashUnitPattern);
                if (slashMatch) {
                    cleaned.push(slashMatch[1].trim());
                    continue;
                }
                // Convert "Unit 3, 45 Smith St" → "45 Smith St"
                const unitPrefixMatch = part.match(unitPrefixPattern);
                if (unitPrefixMatch) {
                    cleaned.push(unitPrefixMatch[2].trim());
                    continue;
                }
                cleaned.push(part);
            }
            const cleanedAddr = cleaned.join(', ');
            if (cleanedAddr !== rawAddress) {
                variants.push(cleanedAddr);
            }

            // Second: just street + suburb + postcode + state
            const postcodeIdx = cleaned.findIndex(p => /^\d{4}$/.test(p));
            if (postcodeIdx >= 1) {
                const minimal = [cleaned[0], ...cleaned.slice(postcodeIdx - 1)].join(', ');
                if (minimal !== cleanedAddr) {
                    variants.push(minimal);
                }
            }

            // Third: street + suburb only (no postcode/state, Nominatim is forgiving)
            if (postcodeIdx >= 2) {
                const streetSuburb = cleaned[0] + ', ' + cleaned[postcodeIdx - 1];
                variants.push(streetSuburb);
            }

            // Fourth: just suburb + postcode + state (drop street entirely)
            if (postcodeIdx >= 1) {
                const suburbOnly = cleaned.slice(postcodeIdx - 1).join(', ');
                variants.push(suburbOnly);
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
                        debugLog('Nominatim parse error:', e);
                        callback(null, null);
                    }
                },
                onerror: function(err) {
                    debugLog('Nominatim request failed:', err);
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
                    debugLog('Nominatim: no results after', attempt, 'attempts');
                    callback(null, null);
                    return;
                }
                const addr = allAttempts[attempt];
                debugLog('Nominatim attempt', attempt + 1 + '/' + allAttempts.length);
                nominatimSearch(addr, (lat, lng) => {
                    if (lat !== null) {
                        if (attempt > 0) debugLog('Nominatim: succeeded on attempt', attempt + 1);
                        callback(lat, lng);
                    } else {
                        attempt++;
                        // Respect Nominatim's 1 req/sec rate limit
                        setTimeout(tryNext, 1100);
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
                debugLog('Geocoded successfully');

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
                                    debugLog('Found electorate:', name);
                                    callback(name);
                                    return;
                                }
                            }
                        } catch (e) {
                            // Skip malformed districts
                        }
                    }

                    debugLog('No electorate found for location');
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

        function sameIgnoreCase(a, b) {
            return a && b && a.toLowerCase() === b.toLowerCase();
        }

        function fillTemplate(template, name, suburb, electorate, yourName) {
            let filled = template;
            if (sameIgnoreCase(electorate, suburb)) {
                filled = filled.replace(/\[electorate\]\s*\(\s*\[suburb\]\s*\)/gi, '[electorate]');
            }
            filled = filled.replace(/\[their name\]/gi, name || '');
            filled = filled.replace(/\[your name\]/gi, yourName || '');
            filled = filled.replace(/\[suburb\]/gi, suburb || '');
            filled = filled.replace(/\[electorate\]/gi, electorate || '');
            // Clean up empty parentheses and extra whitespace left by stripped placeholders
            filled = filled.replace(/\s*\(\s*\)\s*/g, ' ');
            filled = filled.replace(/  +/g, ' ');
            return filled.trim();
        }

        function fillTemplateForPreview(template, name, suburb, electorate, yourName) {
            let tmpl = template;
            if (sameIgnoreCase(electorate, suburb)) {
                tmpl = tmpl.replace(/\[electorate\]\s*\(\s*\[suburb\]\s*\)/gi, '[electorate]');
            }
            let html = tmpl
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            html = html.replace(/\[their name\]/gi, name
                ? `<span class="gus-filled">${escapeHtml(name)}</span>`
                : '<span class="gus-placeholder">[their name]</span>');
            html = html.replace(/\[your name\]/gi, yourName
                ? `<span class="gus-filled">${escapeHtml(yourName)}</span>`
                : '<span class="gus-placeholder">[your name]</span>');
            html = html.replace(/\[suburb\]/gi, suburb
                ? `<span class="gus-filled">${escapeHtml(suburb)}</span>`
                : '<span class="gus-placeholder">[suburb]</span>');
            html = html.replace(/\[electorate\]/gi, electorate
                ? `<span class="gus-filled">${escapeHtml(electorate)}</span>`
                : '<span class="gus-placeholder">[electorate]</span>');

            html = html.replace(/\[([^\]]+)\]/g, '<span class="gus-placeholder">[$1]</span>');

            return html;
        }

        function copyToClipboard(text) {
            if (navigator.clipboard && window.isSecureContext) {
                return navigator.clipboard.writeText(text).catch(() => copyFallback(text));
            }
            return copyFallback(text);
        }

        function copyFallback(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return Promise.resolve();
        }

        function buildSmsUrl(phoneDigits, message) {
            const encoded = encodeURIComponent(message);
            return `sms:${phoneDigits}&body=${encoded}`;
        }

        function showSmsModal(phone, contactName, suburb) {
            const template = getRocketTemplate();
            const showNameInput = /\[your name\]/i.test(template);
            let yourName = getYourName();

            const overlay = document.createElement('div');
            overlay.className = 'gus-overlay';
            let currentElectorate = null;

            function updatePreview() {
                const filled = fillTemplate(template, contactName.preferred, suburb, currentElectorate, yourName);
                const previewHtml = fillTemplateForPreview(template, contactName.preferred, suburb, currentElectorate, yourName);
                const preview = overlay.querySelector('.gus-preview');
                const sendLink = overlay.querySelector('.gus-send');
                if (preview) preview.innerHTML = previewHtml;
                if (sendLink) sendLink.href = buildSmsUrl(phone.digits, filled);
            }

            function renderModal(electorate) {
                currentElectorate = electorate;
                const nameInputVal = overlay.querySelector('.gus-your-name-input');
                if (nameInputVal) yourName = nameInputVal.value.trim() || null;

                const filled = fillTemplate(template, contactName.preferred, suburb, electorate, yourName);
                const previewHtml = fillTemplateForPreview(template, contactName.preferred, suburb, electorate, yourName);

                overlay.innerHTML = `
                    <div class="gus-modal">
                        <h2>Send SMS</h2>
                        <div class="gus-to">To: ${escapeHtml(contactName.preferred)} (${escapeHtml(phone.display)})</div>
                        ${showNameInput ? `
                            <div class="gus-name-row">
                                <label>Your name:</label>
                                <input type="text" class="gus-your-name-input" value="${escapeHtml(yourName || '')}" placeholder="Enter your name">
                            </div>
                        ` : ''}
                        <div class="gus-preview-label">Message preview:</div>
                        <div class="gus-preview">${previewHtml}</div>
                        <div class="gus-modal-actions">
                            <button class="gus-cancel">Cancel</button>
                            <button class="gus-copy-sms">Copy SMS</button>
                            <a class="gus-send" href="${escapeHtml(buildSmsUrl(phone.digits, filled))}">Send SMS</a>
                        </div>
                    </div>
                `;

                overlay.querySelector('.gus-cancel').addEventListener('click', () => overlay.remove());
                overlay.querySelector('.gus-copy-sms').addEventListener('click', (e) => {
                    const currentFilled = fillTemplate(template, contactName.preferred, suburb, currentElectorate, yourName);
                    copyToClipboard(currentFilled).then(() => {
                        e.target.textContent = 'Copied!';
                        setTimeout(() => { e.target.textContent = 'Copy SMS'; }, 1500);
                    });
                });
                overlay.querySelector('.gus-send').addEventListener('click', () => {
                    setTimeout(() => overlay.remove(), 300);
                });

                const nameInput = overlay.querySelector('.gus-your-name-input');
                if (nameInput) {
                    nameInput.addEventListener('input', () => {
                        yourName = nameInput.value.trim() || null;
                        if (yourName) GM_setValue('gus_your_name', yourName);
                        updatePreview();
                    });
                    if (!yourName) nameInput.focus();
                }
            }

            dismissOnEscapeOrClickOutside(overlay);
            renderModal(null);
            document.body.appendChild(overlay);

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

            const copySvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
            const checkSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

            document.querySelectorAll('span[agc-phone]').forEach(span => {
                if (span.querySelector('.gus-copy-phone')) return;

                const text = span.childNodes[0]?.textContent?.trim();
                if (!text) return;

                const digits = text.replace(/\s/g, '');
                const isMobile = /^04\d{8}$/.test(digits);

                const copyLink = document.createElement('span');
                copyLink.className = 'gus-copy-phone';
                copyLink.innerHTML = copySvg;
                copyLink.title = 'Copy phone number';
                copyLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    copyToClipboard(digits).then(() => {
                        copyLink.innerHTML = checkSvg;
                        copyLink.classList.add('gus-copied');
                        setTimeout(() => { copyLink.innerHTML = copySvg; copyLink.classList.remove('gus-copied'); }, 1500);
                    });
                });

                let smsLink = null;
                if (isMobile) {
                    const phone = { display: text, digits: digits };
                    const doNotSms = checkDoNotSms();
                    smsLink = document.createElement('span');
                    smsLink.className = 'gus-sms-link' + (doNotSms ? ' gus-sms-warn' : '');
                    smsLink.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>';
                    smsLink.title = doNotSms ? '\u26a0 Do Not SMS — ' + text : 'Send SMS to ' + text;
                    smsLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showSmsModal(phone, contactName, suburb);
                    });
                }

                // Place after the asterisk (primary indicator) if present, else after phone icon
                const asterisk = span.querySelector('.fa-asterisk');
                const anchor = asterisk || span.querySelector('a[href^="tel:"]');
                if (anchor) {
                    if (smsLink) { anchor.after(smsLink); smsLink.after(copyLink); }
                    else { anchor.after(copyLink); }
                } else {
                    if (smsLink) span.appendChild(smsLink);
                    span.appendChild(copyLink);
                }
            });
        }

        const ELECTORATES = [
            ['Adelaide', 140511], ['Badcoe', 140512], ['Black', 140513],
            ['Bragg', 140514], ['Chaffey', 140515], ['Cheltenham', 140516],
            ['Colton', 140517], ['Croydon', 140518], ['Davenport', 140519],
            ['Dunstan', 140520], ['Elder', 140521], ['Elizabeth', 140522],
            ['Enfield', 140523], ['Finniss', 140524], ['Flinders', 140525],
            ['Florey', 140526], ['Gibson', 140528], ['Giles', 140529],
            ['Hammond', 140530], ['Hartley', 140531], ['Heysen', 140532],
            ['Hurtle Vale', 140557], ['Kaurna', 140533], ['Kavel', 140534],
            ['King', 140535], ['Lee', 140536], ['Light', 140537],
            ['Mackillop', 140538], ['Mawson', 140539], ['Morialta', 140540],
            ['Morphett', 140541], ['Mount Gambier', 140542], ['Narungga', 140543],
            ['Newland', 140544], ['Ngadjuri', 140527], ['Playford', 140545],
            ['Port Adelaide', 140546], ['Ramsay', 140547], ['Reynell', 140548],
            ['Schubert', 140549], ['Stuart', 140550], ['Taylor', 140551],
            ['Torrens', 140552], ['Unley', 140553], ['Waite', 140554],
            ['West Torrens', 140555], ['Wright', 140556],
        ];

        function injectElectorateDropdown() {
            const h2 = document.querySelector('h2.ng-binding');
            if (!h2 || h2.querySelector('.gus-electorate-select')) return;

            const idMatch = location.hash.match(/boothroster\/(\d+)/);
            if (!idMatch) return;

            const currentId = parseInt(idMatch[1], 10);
            const dayMatch = location.hash.match(/day=([^&]*)/);
            const day = dayMatch ? dayMatch[1] : '0';

            const firstText = h2.childNodes[0];
            if (!firstText || firstText.nodeType !== Node.TEXT_NODE) return;
            const electName = firstText.textContent.trim();
            if (!electName) return;

            const select = document.createElement('select');
            select.className = 'gus-electorate-select';
            for (const [name, id] of ELECTORATES) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = name;
                if (id === currentId) opt.selected = true;
                select.appendChild(opt);
            }

            select.addEventListener('change', () => {
                location.hash = `#!/boothroster/${select.value}?day=${day}`;
            });

            firstText.textContent = '';
            h2.insertBefore(select, h2.firstChild);
            h2.insertBefore(document.createTextNode(' '), select.nextSibling);
        }

        function to12hr(timeStr) {
            const h = parseInt(timeStr, 10);
            if (h === 0) return '12am';
            if (h < 12) return h + 'am';
            if (h === 12) return '12pm';
            return (h - 12) + 'pm';
        }

        function convertShiftTimes() {
            document.querySelectorAll('.panel-heading.ng-binding').forEach(el => {
                if (el.dataset.gusConverted) return;
                const text = el.childNodes[0];
                if (!text || text.nodeType !== Node.TEXT_NODE) return;
                const raw = text.textContent.trim();
                const m = raw.match(/^(\d{1,2}):00\s*-\s*(\d{1,2}):00$/);
                if (!m) return;
                text.textContent = to12hr(m[1]) + ' – ' + to12hr(m[2]) + ' ';
                el.dataset.gusConverted = '1';
            });
        }

        function extractTaskTable() {
            const rows = document.querySelectorAll('tr[ng-repeat*="readable_task_elections"]');
            if (rows.length === 0) return null;

            // Get column headers from the table's thead
            const table = rows[0].closest('table');
            if (!table) return null;

            const headerCells = table.querySelectorAll('thead th, thead td');
            const headers = [];
            headerCells.forEach(th => {
                const text = th.textContent.trim();
                // Skip the first "Election \ Tasks" header
                if (text && !text.includes('Election')) {
                    headers.push(text);
                }
            });

            // If we couldn't get headers from thead, infer from task data
            if (headers.length === 0) return null;

            // Extract data per election row
            const elections = [];
            rows.forEach(row => {
                const electionName = row.querySelector('td.ng-binding')?.textContent?.trim();
                if (!electionName) return;

                const cells = row.querySelectorAll('td[ng-repeat*="task_codes"]');
                const statuses = [];
                cells.forEach(td => {
                    const titleAttr = td.getAttribute('title');
                    let choice = null;
                    if (titleAttr && titleAttr.trim().startsWith('{')) {
                        try {
                            const data = JSON.parse(titleAttr.replace(/&quot;/g, '"'));
                            choice = data.choice || null;
                        } catch (e) {}
                    }
                    statuses.push(choice);
                });

                elections.push({ name: electionName, statuses });
            });

            return { headers, elections };
        }

        const CHOICE_ICONS = {
            E: '✓',
            T: '?',
            Y: '✓',
            L: '~',
            R: 'R',
            D: '✓',
            N: '✗',
            X: '✗',
        };

        const CHOICE_TITLES = {
            E: 'Expressed interest',
            T: 'Tentative',
            Y: 'Yes',
            L: 'Likely',
            U: 'Unlikely',
            N: 'No',
            I: 'Invited',
            D: 'Done',
            R: 'Rostered',
            X: 'Cancelled',
        };

        function injectTaskSummary() {
            const panelBody = document.querySelector('.panel-body');
            if (!panelBody) return;
            if (panelBody.querySelector('.gus-tasks-table-wrap')) return;

            const data = extractTaskTable();
            if (!data || data.elections.length === 0) return;

            const wrap = document.createElement('div');
            wrap.className = 'gus-tasks-table-wrap';

            let html = '<table class="gus-tasks-table"><thead><tr><th></th>';
            for (const h of data.headers) {
                html += `<th>${escapeHtml(h)}</th>`;
            }
            html += '</tr></thead><tbody>';

            for (const election of data.elections) {
                html += `<tr><td>${escapeHtml(election.name)}</td>`;
                for (let i = 0; i < data.headers.length; i++) {
                    const choice = election.statuses[i];
                    if (choice) {
                        const safeChoice = /^[A-Z]$/.test(choice) ? choice : 'X';
                        const icon = CHOICE_ICONS[safeChoice] || '?';
                        const title = CHOICE_TITLES[safeChoice] || 'Unknown';
                        html += `<td title="${escapeHtml(title)}"><span class="gus-task-${safeChoice}">${escapeHtml(icon)}</span></td>`;
                    } else {
                        html += '<td></td>';
                    }
                }
                html += '</tr>';
            }

            html += '</tbody></table>';
            wrap.innerHTML = html;
            panelBody.appendChild(wrap);
        }

        const DEFAULT_NOTE_CHIPS = [
            { label: 're HTV', visible: true },
            { label: 'left vm', visible: true },
            { label: 'sent text', visible: true },
            { label: 'rostered', visible: true }
        ];

        function getNoteChips() {
            try {
                const saved = GM_getValue('gus_note_chips');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length) {
                        // Migrate old string format
                        if (typeof parsed[0] === 'string') {
                            return parsed.slice(0, 4).map(s => ({ label: s, visible: true }));
                        }
                        return parsed.slice(0, 4);
                    }
                }
            } catch (e) {}
            return DEFAULT_NOTE_CHIPS;
        }

        function saveNoteChips(chips) {
            GM_setValue('gus_note_chips', JSON.stringify(chips.slice(0, 4)));
        }

        function appendToNotes(textarea, text) {
            const cur = textarea.value.trim();
            if (cur) {
                textarea.value = cur + ', ' + text;
            } else {
                textarea.value = text;
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function injectNoteChips() {
            const labels = document.querySelectorAll('label');
            let notesLabel = null;
            for (const l of labels) {
                if (l.textContent.trim() === 'Contact Notes') { notesLabel = l; break; }
            }
            if (!notesLabel) return;

            const textarea = notesLabel.closest('.form-group, .control-group, div')?.querySelector('textarea');
            if (!textarea) return;
            if (textarea.dataset.gusChips) return;
            textarea.dataset.gusChips = '1';

            const container = document.createElement('div');
            container.className = 'gus-note-chips';

            function buildChips() {
                container.innerHTML = '';
                const chips = getNoteChips();

                // Date chip
                const dateChip = document.createElement('span');
                dateChip.className = 'gus-note-chip gus-note-chip-date';
                const now = new Date();
                const dateStr = now.getDate() + '/' + (now.getMonth() + 1);
                dateChip.textContent = dateStr;
                dateChip.title = 'Insert today\'s date';
                dateChip.addEventListener('click', () => appendToNotes(textarea, dateStr));
                container.appendChild(dateChip);

                // Action chips
                for (const c of chips) {
                    if (!c.label || !c.label.trim() || !c.visible) continue;
                    const chip = document.createElement('span');
                    chip.className = 'gus-note-chip';
                    chip.textContent = c.label;
                    chip.addEventListener('click', () => appendToNotes(textarea, c.label));
                    container.appendChild(chip);
                }

                // Gear icon
                const gear = document.createElement('span');
                gear.className = 'gus-note-chips-gear';
                gear.textContent = '\u2699';
                gear.title = 'Edit chips';
                gear.addEventListener('click', () => toggleEditor());
                container.appendChild(gear);
            }

            let editorEl = null;
            function toggleEditor() {
                if (editorEl) {
                    editorEl.remove();
                    editorEl = null;
                    return;
                }
                const chips = getNoteChips();
                editorEl = document.createElement('div');
                editorEl.className = 'gus-chips-editor';
                const rows = [];
                for (let i = 0; i < 4; i++) {
                    const c = chips[i] || { label: '', visible: true };
                    const row = document.createElement('div');
                    row.className = 'gus-chips-editor-row';
                    const toggle = document.createElement('input');
                    toggle.type = 'checkbox';
                    toggle.checked = c.visible;
                    toggle.title = 'Show/hide this chip';
                    const inp = document.createElement('input');
                    inp.type = 'text';
                    inp.value = c.label;
                    inp.placeholder = 'Chip ' + (i + 1);
                    rows.push({ inp, toggle });
                    row.appendChild(toggle);
                    row.appendChild(inp);
                    editorEl.appendChild(row);
                }
                const btns = document.createElement('div');
                btns.className = 'gus-chips-btns';
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'gus-chips-cancel';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', () => {
                    editorEl.remove();
                    editorEl = null;
                });
                const saveBtn = document.createElement('button');
                saveBtn.className = 'gus-chips-save';
                saveBtn.textContent = 'Save';
                saveBtn.addEventListener('click', () => {
                    const newChips = rows.map(r => ({ label: r.inp.value.trim(), visible: r.toggle.checked })).filter(c => c.label);
                    saveNoteChips(newChips);
                    editorEl.remove();
                    editorEl = null;
                    buildChips();
                });
                btns.appendChild(cancelBtn);
                btns.appendChild(saveBtn);
                editorEl.appendChild(btns);
                container.parentElement.insertBefore(editorEl, container);
            }

            buildChips();
            textarea.parentElement.insertBefore(container, textarea);
        }

        const rocketObserver = new MutationObserver(() => {
            injectSmsLinks();
            injectElectorateDropdown();
            convertShiftTimes();
            prefetchElectorate();
            injectTaskSummary();
            injectNoteChips();
        });
        rocketObserver.observe(document.body, { childList: true, subtree: true });

        injectSmsLinks();
        injectElectorateDropdown();
        convertShiftTimes();
        prefetchElectorate();
        injectTaskSummary();
        injectNoteChips();
    }

})();
