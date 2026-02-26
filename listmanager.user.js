// ==UserScript==
// @name         List Manager Tweaks
// @namespace    https://github.com/choujar/campaign-userscripts
// @version      1.31.6
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
// @connect      contact-sa.greens.org.au
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

    // --- Shared: default template body + multi-template storage ---
    const DEFAULT_TEMPLATE_BODY = `Hi [their name], this is [your name] from the SA Greens.

The election has now been called! We need people to hand out 'How to Vote' cards at polling booths across [electorate] ([suburb]) on election day (21st of March). If you are able to help I can roster you on at a time and place that suits.`;

    function getGlobalTemplatesKey() { return 'smsTemplates_global'; }
    function getListTemplatesKey(listId) { return 'smsTemplates_' + listId; }
    function getLastTemplateKey(listId) { return 'smsLastTemplate_' + listId; }

    function migrateTemplates(listId) {
        const existing = GM_getValue(getListTemplatesKey(listId), null);
        if (existing !== null) return;
        const oldTemplate = GM_getValue('smsTemplate_' + listId, null);
        if (oldTemplate !== null) {
            GM_setValue(getListTemplatesKey(listId), JSON.stringify([
                { name: 'Default', body: oldTemplate }
            ]));
        }
    }

    function migrateGlobalTemplates() {
        const existing = GM_getValue(getGlobalTemplatesKey(), null);
        if (existing !== null) return;
        const shared = GM_getValue('smsTemplate_current', null);
        if (shared) {
            GM_setValue(getGlobalTemplatesKey(), JSON.stringify([
                { name: 'Default', body: shared }
            ]));
        }
    }

    function loadTemplates(listId) {
        if (listId) migrateTemplates(listId);
        migrateGlobalTemplates();
        const globalRaw = GM_getValue(getGlobalTemplatesKey(), null);
        const global = globalRaw ? JSON.parse(globalRaw) : [];
        const listRaw = listId ? GM_getValue(getListTemplatesKey(listId), null) : null;
        const list = listRaw ? JSON.parse(listRaw) : [];
        return { global, list };
    }

    function resolveTemplates(listId) {
        const { global, list } = loadTemplates(listId);
        const merged = new Map();
        global.forEach(t => merged.set(t.name, { ...t, scope: 'global' }));
        list.forEach(t => merged.set(t.name, { ...t, scope: 'list' }));
        const result = Array.from(merged.values());
        if (result.length === 0) {
            result.push({ name: 'Default', body: DEFAULT_TEMPLATE_BODY, scope: 'default' });
        }
        return result;
    }

    function saveGlobalTemplates(templates) {
        GM_setValue(getGlobalTemplatesKey(), JSON.stringify(templates));
    }

    function saveListTemplates(listId, templates) {
        GM_setValue(getListTemplatesKey(listId), JSON.stringify(templates));
        if (templates.length > 0) {
            GM_setValue('smsTemplate_current', templates[0].body);
        }
    }

    // --- Multi-template CSS ---
    GM_addStyle(`
        .gus-tmpl-section { margin-bottom: 20px; }
        .gus-tmpl-section h3 {
            font-size: 14px; font-weight: 600; color: #444;
            margin: 0 0 8px 0; padding-bottom: 4px;
            border-bottom: 1px solid #e0e0e0;
        }
        .gus-tmpl-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
        .gus-tmpl-row {
            display: flex; align-items: center;
            padding: 6px 10px; border-radius: 6px;
            background: #fafafa; border: 1px solid #e8e8e8;
        }
        .gus-tmpl-row:hover { background: #f0f0f0; }
        .gus-tmpl-name {
            flex: 1; font-size: 14px; color: #333;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .gus-tmpl-scope-badge {
            font-size: 11px; color: #888; margin-left: 6px; font-style: italic;
        }
        .gus-tmpl-actions { display: flex; gap: 4px; margin-left: 8px; }
        .gus-tmpl-actions button {
            background: none; border: 1px solid transparent; border-radius: 4px;
            cursor: pointer; font-size: 14px; padding: 2px 6px; color: #666;
        }
        .gus-tmpl-actions button:hover { background: #e0e0e0; border-color: #ccc; }
        .gus-tmpl-actions button.gus-tmpl-delete:hover { color: #d32f2f; }
        .gus-tmpl-editor {
            padding: 10px; background: #fff; border: 1px solid #2e7d32;
            border-radius: 8px; margin-top: 4px;
        }
        .gus-tmpl-editor input {
            width: 100%; padding: 6px 8px; border: 1px solid #ccc;
            border-radius: 4px; font-size: 14px; font-family: inherit;
            margin-bottom: 8px; box-sizing: border-box;
        }
        .gus-tmpl-editor input:focus, .gus-tmpl-editor textarea:focus {
            outline: none; border-color: #2e7d32;
            box-shadow: 0 0 0 2px rgba(46,125,50,0.15);
        }
        .gus-tmpl-editor textarea {
            width: 100%; min-height: 100px; padding: 8px;
            border: 1px solid #ccc; border-radius: 4px;
            font-size: 13px; font-family: inherit; line-height: 1.5;
            resize: vertical; box-sizing: border-box;
        }
        .gus-tmpl-editor-actions {
            display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px;
        }
        .gus-tmpl-editor-actions button {
            padding: 4px 12px; border-radius: 4px; border: 1px solid #ccc;
            background: white; cursor: pointer; font-size: 13px;
        }
        .gus-tmpl-editor-actions .gus-tmpl-save-btn {
            background: #2e7d32; color: white; border-color: #2e7d32;
        }
        .gus-tmpl-editor-actions .gus-tmpl-save-btn:hover { background: #256b29; }
        .gus-tmpl-add {
            display: inline-flex; align-items: center; gap: 4px;
            padding: 4px 10px; border-radius: 4px; border: 1px dashed #999;
            background: transparent; cursor: pointer; font-size: 13px; color: #555;
        }
        .gus-tmpl-add:hover { background: #f0f0f0; border-color: #666; }
        .gus-tmpl-empty { font-size: 13px; color: #999; font-style: italic; padding: 8px 0; }
        .gus-tmpl-confirm {
            display: inline-flex; align-items: center; gap: 6px;
            font-size: 12px; color: #d32f2f;
        }
        .gus-tmpl-confirm button {
            padding: 2px 8px; border-radius: 3px; border: 1px solid;
            cursor: pointer; font-size: 12px; background: white;
        }
        .gus-tmpl-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .gus-tmpl-pill {
            padding: 4px 12px; border-radius: 16px; border: 1px solid #ccc;
            background: white; cursor: pointer; font-size: 13px; font-family: inherit;
            color: #555; max-width: 160px; overflow: hidden; text-overflow: ellipsis;
            white-space: nowrap; transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .gus-tmpl-pill:hover:not(.gus-tmpl-pill-active) { background: #f0f0f0; border-color: #999; }
        .gus-tmpl-pill-active {
            background: #2e7d32; color: white; border-color: #2e7d32; cursor: default;
        }
        .gus-tmpl-pill-single {
            cursor: default; background: #f5f5f5; border-color: #ddd; color: #555;
        }
    `);

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
                gap: 4px;
                text-align: center;
            }
            .gus-roster-title {
                font-size: 14px;
                font-weight: 600;
                color: #333;
                margin: 0;
            }
            .gus-roster-ring {
                position: relative;
                width: 80px;
                height: 80px;
                margin: 0 auto;
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
            .gus-roster-ring .gus-ring-seg {
                fill: none;
                stroke-width: 8;
                pointer-events: stroke;
                cursor: pointer;
            }
            .gus-roster-pct {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 15px;
                font-weight: 600;
                color: #333;
            }
            .gus-roster-count {
                font-size: 12px;
                color: #666;
                text-align: center;
                width: 100%;
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
                flex-wrap: wrap;
                justify-content: center;
                gap: 4px 10px;
                font-size: 11px;
                color: #666;
                max-width: 200px;
            }
            .gus-roster-legend span {
                display: flex;
                align-items: center;
                gap: 3px;
            }
            .gus-roster-legend .gus-dot, .gus-breakdown-row .gus-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
                flex-shrink: 0;
            }
            .gus-breakdown-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .gus-breakdown-popup {
                background: #fff;
                border-radius: 12px;
                padding: 20px 24px;
                width: 700px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            }
            .gus-breakdown-close {
                font-size: 22px;
                cursor: pointer;
                color: #999;
                line-height: 1;
            }
            .gus-breakdown-close:hover { color: #333; }
            .gus-breakdown-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
            }
            .gus-breakdown-rings {
                display: flex;
                gap: 32px;
                align-items: center;
            }
            .gus-breakdown-ring-wrap {
                flex-shrink: 0;
                text-align: center;
            }
            .gus-breakdown-ring-label {
                font-size: 11px;
                color: #999;
                margin-top: 4px;
            }
            .gus-breakdown-ring {
                width: 180px;
                height: 180px;
            }
            .gus-breakdown-ring .gus-roster-pct {
                font-size: 14px;
            }
            .gus-total-ring {
                width: 160px;
                height: 160px;
            }
            .gus-total-ring .gus-roster-pct {
                font-size: 13px;
            }
            .gus-breakdown-list {
                width: 100%;
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 2px 12px;
            }
            .gus-breakdown-row {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 2px 0;
                font-size: 12px;
            }
            .gus-breakdown-name {
                flex: 1;
                color: #333;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .gus-breakdown-count {
                font-weight: 600;
                color: #333;
                min-width: 24px;
                text-align: right;
            }
            .gus-breakdown-status {
                margin-top: 8px;
                font-size: 12px;
                color: #999;
                text-align: center;
            }
            .gus-breakdown-refresh {
                background: none;
                border: 1px solid #ccc;
                border-radius: 4px;
                color: #666;
                cursor: pointer;
                font-size: 11px;
                padding: 2px 8px;
                margin-left: 6px;
            }
            .gus-breakdown-refresh:hover, .gus-breakdown-download:hover {
                background: #f0f0f0;
                color: #333;
            }
            .gus-breakdown-download {
                background: none;
                border: 1px solid #ccc;
                border-radius: 4px;
                color: #666;
                cursor: pointer;
                font-size: 11px;
                padding: 2px 8px;
                margin-left: 6px;
            }
        `);

        GM_addStyle(`
            .gus-bc-popup {
                background: #fff;
                border-radius: 12px;
                padding: 20px 24px;
                width: 960px;
                max-width: 95vw;
                max-height: 90vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            }
            .gus-bc-table-wrap {
                flex: 1;
                overflow-y: auto;
                min-height: 0;
            }
            .gus-bc-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 12px;
            }
            .gus-bc-title { font-size: 16px; font-weight: 600; }
            .gus-bc-summary { font-size: 12px; color: #666; margin-bottom: 12px; }
            .gus-bc-close {
                font-size: 22px;
                cursor: pointer;
                color: #999;
                line-height: 1;
            }
            .gus-bc-close:hover { color: #333; }
            .gus-bc-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            .gus-bc-table th {
                padding: 6px 8px;
                text-align: center;
                font-size: 11px;
                font-weight: 600;
                color: #666;
                border-bottom: 2px solid #e0e0e0;
                white-space: nowrap;
                position: sticky;
                top: 0;
                background: #fff;
                z-index: 2;
                box-shadow: 0 2px 0 #e0e0e0;
            }
            .gus-bc-table th:first-child { text-align: left; min-width: 140px; }
            .gus-bc-row { cursor: pointer; transition: background 0.1s; }
            .gus-bc-row:hover { background: #f5f5f5; }
            .gus-bc-row td {
                padding: 5px 8px;
                border-bottom: 1px solid #eee;
                text-align: center;
                white-space: nowrap;
            }
            .gus-bc-row td:first-child { text-align: left; font-weight: 500; color: #333; }
            .gus-bc-expand-icon {
                display: inline-block;
                width: 16px;
                font-size: 10px;
                color: #999;
                transition: transform 0.15s;
            }
            .gus-bc-row-expanded .gus-bc-expand-icon { transform: rotate(90deg); }
            .gus-bc-slot {
                display: inline-block;
                min-width: 36px;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                text-align: center;
            }
            .gus-bc-slot-full { background: #e8f5e9; color: #2e7d32; }
            .gus-bc-slot-partial { background: #fff3e0; color: #e65100; }
            .gus-bc-slot-empty { background: #ffebee; color: #c62828; }
            .gus-bc-slot-none { color: #ccc; }
            .gus-bc-slot-unknown { background: #e3f2fd; color: #1565c0; }
            .gus-bc-pct { font-weight: 600; min-width: 40px; }
            .gus-bc-pct-good { color: #2e7d32; }
            .gus-bc-pct-warn { color: #e65100; }
            .gus-bc-pct-bad { color: #c62828; }
            .gus-bc-booth-row td {
                padding: 3px 8px;
                border-bottom: 1px solid #f0f0f0;
                font-size: 11px;
                color: #555;
            }
            .gus-bc-booth-row td:first-child { padding-left: 28px; }
            .gus-bc-booth-row:hover { background: #fafafa; }
            .gus-bc-priority { color: #f57c00; font-size: 10px; letter-spacing: -1px; margin-right: 4px; }
            .gus-bc-tooltip {
                position: fixed;
                background: #333;
                color: #fff;
                padding: 6px 10px;
                border-radius: 6px;
                font-size: 11px;
                line-height: 1.4;
                z-index: 100001;
                pointer-events: none;
                max-width: 220px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            .gus-bc-btn {
                background: none;
                border: 1px solid #ccc;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                padding: 2px 8px;
                color: #666;
                transition: background 0.15s, color 0.15s;
            }
            .gus-bc-btn:hover { background: #f0f0f0; color: #333; }
            .gus-bc-auth-error {
                text-align: center;
                padding: 40px 20px;
                color: #666;
                font-size: 14px;
                line-height: 1.6;
            }
            .gus-bc-sortable:hover { color: #333; background: #f5f5f5; }
            .gus-bc-auth-error a { color: #1565c0; text-decoration: underline; }
            .gus-bc-status {
                margin-top: 8px;
                font-size: 12px;
                color: #999;
                text-align: center;
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

        const DEFAULT_TEMPLATE = DEFAULT_TEMPLATE_BODY;

        function getListId() {
            const match = window.location.pathname.match(/\/lists\/(\d+)/);
            return match ? match[1] : null;
        }

        function getListName() {
            const heading = document.querySelector('h5.MuiTypography-h5');
            if (!heading) return null;
            for (const node of heading.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    return node.textContent.trim();
                }
            }
            return heading.textContent.trim();
        }

        // Legacy wrappers (kept for backwards compat)
        function getStorageKey(listId) { return 'smsTemplate_' + listId; }
        function getListNameKey(listId) { return 'smsTemplateListName_' + listId; }
        function loadTemplate(listId) {
            const templates = resolveTemplates(listId);
            return templates.length > 0 ? templates[0].body : null;
        }

        function createTemplateModal(listId, listName) {
            const { global: globalTmpls, list: listTmpls } = loadTemplates(listId);

            const overlay = document.createElement('div');
            overlay.className = 'gus-overlay';
            dismissOnEscapeOrClickOutside(overlay);

            let editingScope = null; // 'global' or 'list'
            let editingIndex = -1;
            let addingScope = null;

            function render() {
                const modal = document.createElement('div');
                modal.className = 'gus-modal';
                modal.innerHTML = `
                    <h2>SMS Templates</h2>
                    <div class="gus-list-label">List: ${escapeHtml(listName || listId)}</div>
                `;

                function buildSection(title, templates, scope) {
                    const section = document.createElement('div');
                    section.className = 'gus-tmpl-section';
                    section.innerHTML = `<h3>${escapeHtml(title)}</h3>`;

                    const list = document.createElement('div');
                    list.className = 'gus-tmpl-list';

                    if (templates.length === 0 && addingScope !== scope) {
                        list.innerHTML = '<div class="gus-tmpl-empty">No templates yet</div>';
                    }

                    templates.forEach((tmpl, idx) => {
                        if (editingScope === scope && editingIndex === idx) {
                            const editor = buildEditor(tmpl.name, tmpl.body, (name, body) => {
                                templates[idx] = { name, body };
                                if (scope === 'global') saveGlobalTemplates(templates);
                                else saveListTemplates(listId, templates);
                                editingScope = null; editingIndex = -1;
                                render();
                            }, () => { editingScope = null; editingIndex = -1; render(); });
                            list.appendChild(editor);
                        } else {
                            const row = document.createElement('div');
                            row.className = 'gus-tmpl-row';
                            row.innerHTML = `
                                <span class="gus-tmpl-name" title="${escapeHtml(tmpl.name)}">${escapeHtml(tmpl.name)}</span>
                                <div class="gus-tmpl-actions">
                                    <button class="gus-tmpl-edit" title="Edit">&#9998;</button>
                                    <button class="gus-tmpl-delete" title="Delete">&#10005;</button>
                                </div>
                            `;
                            row.querySelector('.gus-tmpl-edit').addEventListener('click', () => {
                                editingScope = scope; editingIndex = idx; addingScope = null;
                                render();
                            });
                            row.querySelector('.gus-tmpl-delete').addEventListener('click', (e) => {
                                const btn = e.currentTarget;
                                if (btn.dataset.confirming) {
                                    templates.splice(idx, 1);
                                    if (scope === 'global') saveGlobalTemplates(templates);
                                    else saveListTemplates(listId, templates);
                                    render();
                                } else {
                                    btn.dataset.confirming = 'true';
                                    btn.innerHTML = 'Delete?';
                                    btn.style.color = '#d32f2f';
                                    btn.style.fontSize = '12px';
                                    setTimeout(() => {
                                        if (btn.isConnected) {
                                            btn.innerHTML = '&#10005;';
                                            btn.style.color = '';
                                            btn.style.fontSize = '';
                                            delete btn.dataset.confirming;
                                        }
                                    }, 3000);
                                }
                            });
                            list.appendChild(row);
                        }
                    });

                    if (addingScope === scope) {
                        const editor = buildEditor('', '', (name, body) => {
                            templates.push({ name, body });
                            if (scope === 'global') saveGlobalTemplates(templates);
                            else saveListTemplates(listId, templates);
                            addingScope = null;
                            render();
                        }, () => { addingScope = null; render(); });
                        list.appendChild(editor);
                    }

                    section.appendChild(list);

                    if (addingScope !== scope) {
                        const addBtn = document.createElement('button');
                        addBtn.className = 'gus-tmpl-add';
                        addBtn.textContent = '+ Add template';
                        addBtn.addEventListener('click', () => {
                            addingScope = scope; editingScope = null; editingIndex = -1;
                            render();
                        });
                        section.appendChild(addBtn);
                    }

                    return section;
                }

                function buildEditor(initialName, initialBody, onSave, onCancel) {
                    const editor = document.createElement('div');
                    editor.className = 'gus-tmpl-editor';
                    editor.innerHTML = `
                        <input type="text" placeholder="Template name" value="${escapeHtml(initialName)}">
                        <textarea placeholder="Message body — use [their name], [your name], [electorate], [suburb]">${escapeHtml(initialBody)}</textarea>
                        <div class="gus-tmpl-editor-actions">
                            <button class="gus-tmpl-cancel-btn">Cancel</button>
                            <button class="gus-tmpl-save-btn">Save</button>
                        </div>
                    `;
                    editor.querySelector('.gus-tmpl-cancel-btn').addEventListener('click', onCancel);
                    editor.querySelector('.gus-tmpl-save-btn').addEventListener('click', () => {
                        const name = editor.querySelector('input').value.trim();
                        const body = editor.querySelector('textarea').value.trim();
                        if (!name) { editor.querySelector('input').style.borderColor = '#d32f2f'; return; }
                        if (!body) { editor.querySelector('textarea').style.borderColor = '#d32f2f'; return; }
                        onSave(name, body);
                    });
                    setTimeout(() => editor.querySelector('input').focus(), 50);
                    return editor;
                }

                modal.appendChild(buildSection('Global Templates', globalTmpls, 'global'));
                modal.appendChild(buildSection(`Templates for "${escapeHtml(listName || listId)}"`, listTmpls, 'list'));

                const actions = document.createElement('div');
                actions.className = 'gus-modal-actions';
                actions.innerHTML = '<button class="gus-cancel">Close</button>';
                actions.querySelector('.gus-cancel').addEventListener('click', () => overlay.remove());
                modal.appendChild(actions);

                overlay.innerHTML = '';
                overlay.appendChild(modal);
            }

            render();
            document.body.appendChild(overlay);
        }

        function updateButtonState(listId) {
            const btn = document.querySelector('.gus-template-btn');
            if (!btn) return;
            const { global: g, list: l } = loadTemplates(listId);
            const hasTemplates = g.length > 0 || l.length > 0;
            btn.classList.toggle('has-template', hasTemplates);
            btn.title = hasTemplates ? 'Manage SMS templates' : 'Set up SMS templates';
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

            const { global: g, list: l } = loadTemplates(listId);
            const hasTemplates = g.length > 0 || l.length > 0;
            btn.classList.toggle('has-template', hasTemplates);
            btn.title = hasTemplates ? 'Manage SMS templates' : 'Set up SMS templates';

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
        const TOTAL_TARGET = 1602;
        const EV_TARGET = 552;
        const PD_TARGET = 1050;
        const HEYSEN_ID = 140532;
        const PD_COLOR = '#1565c0';
        const EV_COLOR = '#7b1fa2';
        const HEYSEN_COLOR = '#2e7d32';
        let pdConfirmed = null;
        let pdSelfRostered = null;
        let pdHeysen = null;
        let evConfirmed = null;
        let evSelfRostered = null;
        let evHeysen = null;
        let pdCaptains = null;
        let evCaptains = null;
        const CAPTAIN_COLOR = '#e65100';
        let rosterLoading = false;
        let breakdownCache = null; // { results: [...], timestamp: Date.now() }
        let boothCoverageCache = null; // { results: [...], timestamp: Date.now() }
        let rosterError = null;

        const ALL_ELECTORATES = [
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
            ['West Torrens', 140555], ['Wright', 140556]
        ];

        const BOOTH_TIME_SLOTS = [
            { label: '8-10', start: 480, end: 600 },
            { label: '10-12', start: 600, end: 720 },
            { label: '12-2', start: 720, end: 840 },
            { label: '2-4', start: 840, end: 960 },
            { label: '4-6', start: 960, end: 1080 }
        ];
        const PRIORITY_STARS = { 3: '\u2605\u2605\u2605', 2: '\u2605\u2605', 1: '\u2605' };

        function getPrioritisedElectorates() {
            const saved = GM_getValue('electorateOrder', null);
            if (!saved) return ALL_ELECTORATES;
            const idOrder = new Map(saved.map((id, i) => [id, i]));
            return [...ALL_ELECTORATES].sort((a, b) =>
                (idOrder.get(a[1]) ?? 999) - (idOrder.get(b[1]) ?? 999)
            );
        }

        function saveElectorateOrder(results) {
            const sorted = [...results].sort((a, b) => b.count - a.count);
            GM_setValue('electorateOrder', sorted.map(r => r.id));
        }

        function buildTotalTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [], rosterTypes: ['Rostered'], shiftStatus: 'Confirmed', votingPeriod: 'Polling Day' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function buildSelfRosteredTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [], rosterTypes: ['Self-rostered'], shiftStatus: 'Any', votingPeriod: 'Polling Day' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function buildEvConfirmedTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [], rosterTypes: ['Rostered'], shiftStatus: 'Confirmed', votingPeriod: 'Early voting' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function buildEvSelfRosteredTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [], rosterTypes: ['Self-rostered'], shiftStatus: 'Any', votingPeriod: 'Early voting' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function buildPdHeysenTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [HEYSEN_ID], rosterTypes: ['Rostered', 'Self-rostered'], shiftStatus: 'Any', votingPeriod: 'Polling Day' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function buildEvHeysenTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [HEYSEN_ID], rosterTypes: ['Rostered', 'Self-rostered'], shiftStatus: 'Any', votingPeriod: 'Early voting' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function buildPdCaptainsTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [], rosterTypes: ['Captain'], shiftStatus: 'Confirmed', votingPeriod: 'Polling Day' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function buildEvCaptainsTree() {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [], rosterTypes: ['Captain'], shiftStatus: 'Confirmed', votingPeriod: 'Early voting' } } }
                ],
                printTime: false,
                useAdvancedSearchII: false
            });
        }

        function buildElectorateTree(electorateId) {
            return JSON.stringify({
                op: 'intersection',
                nodes: [
                    { op: 'filter', filter: { name: 'roster', value: { electionId: 182, electorateIds: [electorateId], rosterTypes: ['Rostered', 'Self-rostered'], shiftStatus: 'Any', votingPeriod: 'Any' } } }
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
                        cb(data.count ?? null, null, data.entities ?? null);
                    } catch (e) { cb(null, 'Parse error', null); }
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
            pdConfirmed = null;
            pdSelfRostered = null;
            pdHeysen = null;
            evConfirmed = null;
            evSelfRostered = null;
            evHeysen = null;
            pdCaptains = null;
            evCaptains = null;
            updateRosterWidget();

            let done = 0;
            let authExpired = false;

            function checkDone() {
                done++;
                if (done < 8) { updateRosterWidget(); return; }
                rosterLoading = false;
                if (authExpired) {
                    capturedJwt = null;
                    rosterError = 'Auth expired, refreshing...';
                    updateRosterWidget();
                    waitForJwtAndRetry(callback);
                    return;
                }
                updateRosterWidget();
                if (callback) callback(pdConfirmed, rosterError);
            }

            fetchOneRoster(buildTotalTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { rosterError = err; }
                else { pdConfirmed = count; }
                checkDone();
            });

            fetchOneRoster(buildSelfRosteredTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { if (!rosterError) rosterError = err; }
                else { pdSelfRostered = count; }
                checkDone();
            });

            fetchOneRoster(buildPdHeysenTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { if (!rosterError) rosterError = err; }
                else { pdHeysen = count; }
                checkDone();
            });

            fetchOneRoster(buildEvConfirmedTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { if (!rosterError) rosterError = err; }
                else { evConfirmed = count; }
                checkDone();
            });

            fetchOneRoster(buildEvSelfRosteredTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { if (!rosterError) rosterError = err; }
                else { evSelfRostered = count; }
                checkDone();
            });

            fetchOneRoster(buildEvHeysenTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { if (!rosterError) rosterError = err; }
                else { evHeysen = count; }
                checkDone();
            });

            fetchOneRoster(buildPdCaptainsTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { if (!rosterError) rosterError = err; }
                else { pdCaptains = count; }
                checkDone();
            });

            fetchOneRoster(buildEvCaptainsTree(), function(count, err) {
                if (err === 'auth_expired') { authExpired = true; }
                else if (err) { if (!rosterError) rosterError = err; }
                else { evCaptains = count; }
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

        function buildRingSegments(segments, r) {
            const circ = 2 * Math.PI * r;
            let circles = '';
            let rotation = 0;
            for (const seg of segments) {
                const len = (seg.pct / 100) * circ;
                if (len < 0.1) continue;
                circles += `<circle class="gus-ring-seg" cx="50" cy="50" r="${r}"
                    stroke="${escapeHtml(seg.color)}" stroke-dasharray="${len} ${circ - len}"
                    data-hover-text="${escapeHtml(seg.label)}"
                    style="transform: rotate(${rotation}deg); transform-origin: 50% 50%;"/>`;
                rotation += (seg.pct / 100) * 360;
            }
            return circles;
        }

        function buildRingHtml(segments, centerText) {
            const r = 40;
            return `
                <div class="gus-roster-ring" style="cursor:pointer;" title="Click for full breakdown">
                    <svg viewBox="0 0 100 100">
                        <circle class="gus-ring-bg" cx="50" cy="50" r="${r}"/>
                        ${buildRingSegments(segments, r)}
                    </svg>
                    <span class="gus-roster-pct" data-default="${centerText}">${centerText}</span>
                </div>
            `;
        }

        function attachRingHover(container) {
            const ring = container.querySelector('.gus-roster-ring');
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

        function sortedColor(sortIndex) {
            const hue = (sortIndex * 137.508) % 360;
            return `hsl(${hue}, 65%, 45%)`;
        }

        function openBreakdownPopup() {
            if (!capturedJwt || isJwtExpired(capturedJwt)) return;
            if (document.querySelector('.gus-breakdown-overlay')) return;

            const overlay = document.createElement('div');
            overlay.className = 'gus-breakdown-overlay';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

            const popup = document.createElement('div');
            popup.className = 'gus-breakdown-popup';
            popup.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <strong style="font-size:16px;">Roster Breakdown by Electorate</strong>
                    <span class="gus-breakdown-close" title="Close">&times;</span>
                </div>
                <div class="gus-breakdown-content">
                    <div class="gus-breakdown-rings">
                        <div class="gus-breakdown-ring-wrap">
                            <div class="gus-roster-ring gus-breakdown-ring">
                                <svg viewBox="0 0 100 100">
                                    <circle class="gus-ring-bg" cx="50" cy="50" r="40"/>
                                </svg>
                                <span class="gus-roster-pct" data-default="${((pdConfirmed ?? 0) + (pdSelfRostered ?? 0) + (evConfirmed ?? 0) + (evSelfRostered ?? 0)).toLocaleString()}">${((pdConfirmed ?? 0) + (pdSelfRostered ?? 0) + (evConfirmed ?? 0) + (evSelfRostered ?? 0)).toLocaleString()}</span>
                            </div>
                            <div class="gus-breakdown-ring-label">By electorate</div>
                        </div>
                        <div class="gus-breakdown-ring-wrap">
                            <div class="gus-roster-ring gus-total-ring">
                                <svg viewBox="0 0 100 100">
                                    <circle class="gus-ring-bg" cx="50" cy="50" r="40"/>
                                </svg>
                                <span class="gus-roster-pct gus-total-pct">0%</span>
                            </div>
                            <div class="gus-breakdown-ring-label" style="text-align:center;line-height:1.3;">
                                <div><span style="color:${EV_COLOR};font-weight:600;">EV:</span> <strong>${((evConfirmed ?? 0) + (evSelfRostered ?? 0)).toLocaleString()}</strong> <span style="color:${HEYSEN_COLOR};">(${(evHeysen ?? 0).toLocaleString()})</span> <span style="color:#999;">(${(evSelfRostered ?? 0).toLocaleString()})</span> <span style="color:${CAPTAIN_COLOR};">(${(evCaptains ?? 0).toLocaleString()})</span> / ${EV_TARGET.toLocaleString()}</div>
                                <div><span style="color:${PD_COLOR};font-weight:600;">PD:</span> <strong>${((pdConfirmed ?? 0) + (pdSelfRostered ?? 0)).toLocaleString()}</strong> <span style="color:${HEYSEN_COLOR};">(${(pdHeysen ?? 0).toLocaleString()})</span> <span style="color:#999;">(${(pdSelfRostered ?? 0).toLocaleString()})</span> <span style="color:${CAPTAIN_COLOR};">(${(pdCaptains ?? 0).toLocaleString()})</span> / ${PD_TARGET.toLocaleString()}</div>
                                <div style="font-size:11px;color:#888;margin-top:2px;"><span class="gus-dot" style="background:${HEYSEN_COLOR};display:inline-block;width:7px;height:7px;border-radius:50%;"></span> Heysen &nbsp;<span style="color:#999;">Self</span> &nbsp;<span class="gus-dot" style="background:${CAPTAIN_COLOR};display:inline-block;width:7px;height:7px;border-radius:50%;"></span> Capt</div>
                            </div>
                        </div>
                    </div>
                    <div class="gus-breakdown-status">Loading 0 / ${ALL_ELECTORATES.length}...</div>
                    <div class="gus-breakdown-list"></div>
                    <div style="font-size:11px;color:#999;margin-top:12px;line-height:1.4;">
                        Note: Electorate counts include all rostered and self-rostered volunteers (any shift status, any voting period).
                        Some polling booths span multiple electorates, so volunteers at border booths may appear in multiple counts.
                    </div>
                </div>
            `;

            popup.querySelector('.gus-breakdown-close').addEventListener('click', () => overlay.remove());
            overlay.appendChild(popup);
            document.body.appendChild(overlay);

            const listEl = popup.querySelector('.gus-breakdown-list');
            const statusEl = popup.querySelector('.gus-breakdown-status');
            const svgEl = popup.querySelector('.gus-breakdown-ring svg');
            const pctEl = popup.querySelector('.gus-breakdown-ring .gus-roster-pct');
            const totalSvg = popup.querySelector('.gus-total-ring svg');
            const totalPctEl = popup.querySelector('.gus-total-pct');

            function updateTotalRing() {
                const pdTotal = (pdConfirmed ?? 0) + (pdSelfRostered ?? 0);
                const evTotal = (evConfirmed ?? 0) + (evSelfRostered ?? 0);
                const grandTotal = pdTotal + evTotal;

                totalPctEl.textContent = grandTotal.toLocaleString();
                totalPctEl.dataset.default = grandTotal.toLocaleString();

                totalSvg.querySelectorAll('.gus-ring-seg').forEach(el => el.remove());

                const r = 40;
                const circ = 2 * Math.PI * r;
                const segs = [
                    { color: PD_COLOR, count: pdTotal, label: `PD: ${pdTotal}` },
                    { color: EV_COLOR, count: evTotal, label: `EV: ${evTotal}` }
                ];
                let rotation = 0;
                for (const seg of segs) {
                    const segPct = seg.count / TOTAL_TARGET;
                    const len = Math.min(segPct, 1) * circ;
                    if (len < 0.1) continue;
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('class', 'gus-ring-seg');
                    circle.setAttribute('cx', '50');
                    circle.setAttribute('cy', '50');
                    circle.setAttribute('r', r);
                    circle.setAttribute('stroke', seg.color);
                    circle.setAttribute('stroke-dasharray', `${len} ${circ - len}`);
                    circle.dataset.hoverText = seg.label;
                    circle.style.transform = `rotate(${rotation}deg)`;
                    circle.style.transformOrigin = '50% 50%';
                    totalSvg.appendChild(circle);
                    circle.addEventListener('mouseenter', () => { totalPctEl.textContent = seg.label; });
                    circle.addEventListener('mouseleave', () => { totalPctEl.textContent = totalPctEl.dataset.default; });
                    rotation += segPct * 360;
                }
            }

            function updateLegendList(resultData) {
                const sorted = [...resultData].sort((a, b) => b.count - a.count);
                listEl.innerHTML = sorted.map((r, i) =>
                    `<div class="gus-breakdown-row">
                        <span class="gus-dot" style="background:${escapeHtml(sortedColor(i))};"></span>
                        <span class="gus-breakdown-name">${escapeHtml(r.name)}</span>
                        <span class="gus-breakdown-count">${escapeHtml('' + r.count)}</span>
                    </div>`
                ).join('');
            }

            function renderBreakdownRing(resultData) {
                const sorted = [...resultData].sort((a, b) => b.count - a.count);
                svgEl.querySelectorAll('.gus-ring-seg').forEach(el => el.remove());

                const total = sorted.reduce((sum, r) => sum + r.count, 0) || 1;
                const segments = sorted.map((r, i) => ({
                    color: sortedColor(i),
                    pct: (r.count / total) * 100,
                    label: `${r.name}: ${r.count}`
                }));

                const r = 40;
                const circ = 2 * Math.PI * r;
                let rotation = 0;
                for (const seg of segments) {
                    const len = (seg.pct / 100) * circ;
                    if (len < 0.1) continue;
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('class', 'gus-ring-seg');
                    circle.setAttribute('cx', '50');
                    circle.setAttribute('cy', '50');
                    circle.setAttribute('r', r);
                    circle.setAttribute('stroke', seg.color);
                    circle.setAttribute('stroke-dasharray', `${len} ${circ - len}`);
                    circle.dataset.hoverText = seg.label;
                    circle.style.transform = `rotate(${rotation}deg)`;
                    circle.style.transformOrigin = '50% 50%';
                    svgEl.appendChild(circle);

                    circle.addEventListener('mouseenter', () => { pctEl.textContent = seg.label; });
                    circle.addEventListener('mouseleave', () => { pctEl.textContent = pctEl.dataset.default; });

                    rotation += (seg.pct / 100) * 360;
                }

                updateLegendList(resultData);
                updateTotalRing();
            }

            function cacheAgeText(ts) {
                const mins = Math.floor((Date.now() - ts) / 60000);
                if (mins < 1) return 'just now';
                return mins === 1 ? '1 min ago' : `${mins} min ago`;
            }

            function showStatus(text, showRefresh, hint) {
                statusEl.innerHTML = escapeHtml(text) +
                    (showRefresh ? ' <button class="gus-breakdown-refresh">Refresh</button> <button class="gus-breakdown-download">Download JSON</button>' : '') +
                    (hint ? `<div style="font-size:11px;color:#999;margin-top:4px;">${escapeHtml(hint)}</div>` : '');
                if (showRefresh) {
                    statusEl.querySelector('.gus-breakdown-refresh').addEventListener('click', () => {
                        breakdownCache = null;
                        fetchAllElectorates();
                    });
                    statusEl.querySelector('.gus-breakdown-download').addEventListener('click', downloadFullData);
                }
            }

            function downloadFullData() {
                if (!breakdownCache) return;
                const allData = {};
                for (const r of breakdownCache.results) {
                    allData[r.name] = { count: r.count, entities: r.entities || [] };
                }
                const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'electorate-roster-data.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(a.href);
            }

            function fetchAllElectorates() {
                const results = [];
                let loaded = 0;
                const ordered = getPrioritisedElectorates();
                const loadingHint = 'You can close this and come back — data loads in the background';
                showStatus(`Loading 0 / ${ordered.length}...`, false, loadingHint);
                updateTotalRing();

                ordered.forEach(([name, id], i) => {
                    setTimeout(() => {
                        fetchOneRoster(buildElectorateTree(id), function(count, err, entities) {
                            loaded++;
                            results.push({ name, id, count: count ?? 0, entities: entities || [] });
                            renderBreakdownRing(results);
                            showStatus(`Loading ${loaded} / ${ordered.length}...`, false, loadingHint);
                            if (loaded >= ordered.length) {
                                saveElectorateOrder(results);
                                breakdownCache = { results: [...results], timestamp: Date.now() };
                                showStatus(`${ordered.length} electorates loaded — ${cacheAgeText(breakdownCache.timestamp)}`, true);
                            }
                        });
                    }, i * 100);
                });
            }

            // Show progress ring immediately (pdConfirmed already known)
            updateTotalRing();

            // Use cache if fresh (< 30 min), otherwise fetch
            const CACHE_TTL = 30 * 60 * 1000;
            if (breakdownCache && (Date.now() - breakdownCache.timestamp) < CACHE_TTL) {
                renderBreakdownRing(breakdownCache.results);
                showStatus(`${ALL_ELECTORATES.length} electorates loaded — ${cacheAgeText(breakdownCache.timestamp)}`, true);
            } else {
                fetchAllElectorates();
            }
        }

        // --- Booth Coverage Dashboard ---

        function fetchBoothRoster(electorateId, callback) {
            let called = false;
            const once = (data, err) => { if (!called) { called = true; callback(data, err); } };
            const cmd = JSON.stringify({ requests: { electorateroster: [String(electorateId)] } });
            const url = 'https://contact-sa.greens.org.au/agc/ajax?commands=' + encodeURIComponent(cmd);
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function(response) {
                    if (response.status >= 300) {
                        once(null, 'not_logged_in');
                        return;
                    }
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.is_error) {
                            once(null, 'api_error');
                            return;
                        }
                        once(data.commands, null);
                    } catch (e) {
                        once(null, 'not_logged_in');
                    }
                },
                onerror: function() {
                    once(null, 'network_error');
                }
            });
        }

        function parseElectionDayBooths(commands) {
            if (!commands || !commands.booths) return [];
            const edBooths = commands.booths.filter(b => b.info && b.info.prepoll === '0');
            return edBooths
                .map(b => {
                    const info = b.info;
                    const pr = info.people_required;
                    const needKnown = pr !== null && pr !== undefined && pr !== '';
                    const need = needKnown ? parseInt(pr) : -1;
                    const slotCoverage = BOOTH_TIME_SLOTS.map(slotDef => {
                        const covering = (b.slots || []).filter(vol => {
                            const vs = parseInt(vol.time_start);
                            const ve = parseInt(vol.time_end);
                            return vs < slotDef.end && ve > slotDef.start;
                        }).map(vol => ({
                            name: vol.name,
                            timeStart: parseInt(vol.time_start),
                            timeEnd: parseInt(vol.time_end)
                        }));
                        return {
                            have: covering.length,
                            need: need,
                            volunteers: covering
                        };
                    });
                    return {
                        id: info.id,
                        name: info.name,
                        premises: info.premises,
                        priority: parseInt(info.priority) || 1,
                        peopleRequired: need,
                        estTotal: parseInt(info.est_total) || 0,
                        estGreen: parseInt(info.est_green) || 0,
                        isShared: info.isshared === '1',
                        slotCoverage
                    };
                });
        }

        function computeElectorateSummary(booths) {
            const totalBooths = booths.length;
            const slotSummaries = BOOTH_TIME_SLOTS.map((_, si) => {
                let totalHave = 0, totalNeed = 0, allHave = 0;
                for (const b of booths) {
                    allHave += b.slotCoverage[si].have;
                    if (b.slotCoverage[si].need < 0) continue;
                    totalHave += b.slotCoverage[si].have;
                    totalNeed += b.slotCoverage[si].need;
                }
                return { totalHave, totalNeed, allHave, pct: totalNeed > 0 ? Math.round((totalHave / totalNeed) * 100) : 0 };
            });
            const grandHave = slotSummaries.reduce((s, v) => s + v.totalHave, 0);
            const grandNeed = slotSummaries.reduce((s, v) => s + v.totalNeed, 0);
            const overallPct = grandNeed > 0 ? Math.round((grandHave / grandNeed) * 100) : 0;
            const hasAnyKnownNeed = grandNeed > 0;
            return { totalBooths, slotSummaries, overallPct, hasAnyKnownNeed };
        }

        function bcSlotClass(have, need) {
            if (need === 0) return 'gus-bc-slot-none';
            if (have >= need) return 'gus-bc-slot-full';
            if (have > 0) return 'gus-bc-slot-partial';
            return 'gus-bc-slot-empty';
        }

        function bcPctClass(pct) {
            if (pct >= 80) return 'gus-bc-pct-good';
            if (pct >= 40) return 'gus-bc-pct-warn';
            return 'gus-bc-pct-bad';
        }

        function minsToTime(mins) {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            const period = h >= 12 ? 'pm' : 'am';
            const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return m === 0 ? `${hr}${period}` : `${hr}:${String(m).padStart(2, '0')}${period}`;
        }

        let bcTooltipEl = null;
        function showBcTooltip(e, volunteers) {
            hideBcTooltip();
            if (!volunteers || volunteers.length === 0) return;
            const tip = document.createElement('div');
            tip.className = 'gus-bc-tooltip';
            tip.innerHTML = volunteers.map(v =>
                `${escapeHtml(v.name)} <span style="color:#aaa;">${minsToTime(v.timeStart)}\u2013${minsToTime(v.timeEnd)}</span>`
            ).join('<br>');
            document.body.appendChild(tip);
            bcTooltipEl = tip;
            const rect = e.target.getBoundingClientRect();
            tip.style.left = Math.min(rect.left, window.innerWidth - 230) + 'px';
            tip.style.top = (rect.bottom + 6) + 'px';
        }

        function hideBcTooltip() {
            if (bcTooltipEl) { bcTooltipEl.remove(); bcTooltipEl = null; }
        }

        let bcSortCol = 'pct';
        let bcSortAsc = true;

        function bcSortResults(results) {
            return [...results].sort((a, b) => {
                let va, vb;
                if (bcSortCol === 'name') { va = a.name; vb = b.name; return bcSortAsc ? va.localeCompare(vb) : vb.localeCompare(va); }
                if (bcSortCol === 'booths') { va = a.summary.totalBooths; vb = b.summary.totalBooths; }
                else if (bcSortCol === 'pct') { va = a.summary.overallPct; vb = b.summary.overallPct; }
                else if (bcSortCol.startsWith('slot')) {
                    const si = parseInt(bcSortCol.slice(4));
                    va = a.summary.slotSummaries[si].pct; vb = b.summary.slotSummaries[si].pct;
                } else { va = 0; vb = 0; }
                return bcSortAsc ? va - vb : vb - va;
            });
        }

        function renderCoverageTable(results, tableEl, statusEl) {
            const sorted = bcSortResults(results);

            let grandBooths = 0, grandHave = 0, grandNeed = 0;
            for (const r of results) {
                grandBooths += r.summary.totalBooths;
                for (const ss of r.summary.slotSummaries) {
                    grandHave += ss.totalHave;
                    grandNeed += ss.totalNeed;
                }
            }
            const grandPct = grandNeed > 0 ? Math.round((grandHave / grandNeed) * 100) : 0;

            if (statusEl) {
                statusEl.innerHTML = `${results.length} electorates \u00b7 ${grandBooths} booths \u00b7 <span class="${bcPctClass(grandPct)}">${grandPct}% coverage</span>`;
            }

            const arrow = (col) => bcSortCol === col ? (bcSortAsc ? ' \u25B2' : ' \u25BC') : '';
            let html = '<thead><tr>';
            html += `<th class="gus-bc-sortable" data-col="name" style="cursor:pointer;">Electorate${arrow('name')}</th>`;
            html += `<th class="gus-bc-sortable" data-col="booths" style="cursor:pointer;">Booths${arrow('booths')}</th>`;
            BOOTH_TIME_SLOTS.forEach((slot, si) => {
                html += `<th class="gus-bc-sortable" data-col="slot${si}" style="cursor:pointer;">${slot.label}${arrow('slot' + si)}</th>`;
            });
            html += `<th class="gus-bc-sortable" data-col="pct" style="cursor:pointer;">%${arrow('pct')}</th>`;
            html += '</tr></thead><tbody>';

            for (const r of sorted) {
                const s = r.summary;
                html += `<tr class="gus-bc-row" data-eid="${r.id}">`;
                html += `<td><span class="gus-bc-expand-icon">\u25B6</span> ${escapeHtml(r.name)}</td>`;
                html += `<td>${s.totalBooths}</td>`;
                for (let si = 0; si < BOOTH_TIME_SLOTS.length; si++) {
                    const ss = s.slotSummaries[si];
                    if (ss.totalNeed > 0) {
                        const cls = bcSlotClass(ss.totalHave, ss.totalNeed);
                        html += `<td><span class="gus-bc-slot ${cls}">${ss.totalHave}/${ss.totalNeed}</span></td>`;
                    } else if (ss.allHave > 0) {
                        html += `<td><span class="gus-bc-slot gus-bc-slot-unknown">${ss.allHave}</span></td>`;
                    } else {
                        html += `<td><span class="gus-bc-slot gus-bc-slot-none">\u00b7</span></td>`;
                    }
                }
                if (s.hasAnyKnownNeed) {
                    html += `<td class="gus-bc-pct ${bcPctClass(s.overallPct)}">${s.overallPct}%</td>`;
                } else {
                    html += `<td class="gus-bc-pct">\u2014</td>`;
                }
                html += '</tr>';
            }
            html += '</tbody>';
            tableEl.innerHTML = html;

            tableEl.querySelectorAll('.gus-bc-sortable').forEach(th => {
                th.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const col = th.dataset.col;
                    if (bcSortCol === col) { bcSortAsc = !bcSortAsc; }
                    else { bcSortCol = col; bcSortAsc = true; }
                    renderCoverageTable(results, tableEl, statusEl);
                });
            });

            tableEl.querySelectorAll('.gus-bc-row').forEach(row => {
                row.addEventListener('click', () => {
                    const eid = row.dataset.eid;
                    const existing = tableEl.querySelectorAll(`.gus-bc-booth-row[data-parent="${eid}"]`);
                    if (existing.length > 0) {
                        existing.forEach(el => el.remove());
                        row.classList.remove('gus-bc-row-expanded');
                        return;
                    }
                    row.classList.add('gus-bc-row-expanded');
                    const electorate = sorted.find(r => String(r.id) === eid);
                    if (!electorate) return;
                    console.log(`[GUS] ${electorate.name} — raw API data:`, electorate._raw);
                    console.log(`[GUS] ${electorate.name} — parsed booths:`, electorate.booths);

                    const booths = [...electorate.booths].sort((a, b) => {
                        if (b.priority !== a.priority) return b.priority - a.priority;
                        return a.name.localeCompare(b.name);
                    });

                    const frag = document.createDocumentFragment();
                    for (const booth of booths) {
                        const tr = document.createElement('tr');
                        tr.className = 'gus-bc-booth-row';
                        tr.dataset.parent = eid;
                        let cells = `<td><span class="gus-bc-priority">${PRIORITY_STARS[booth.priority] || '\u2605'}</span>${escapeHtml(booth.name)}</td>`;
                        cells += `<td style="font-size:10px;color:#999;" title="${escapeHtml(booth.premises || '')}">${booth.peopleRequired < 0 ? '\u2014' : booth.peopleRequired}</td>`;
                        const isUnknownNeed = booth.peopleRequired < 0;
                        for (let si = 0; si < BOOTH_TIME_SLOTS.length; si++) {
                            const sc = booth.slotCoverage[si];
                            if (isUnknownNeed) {
                                const label = sc.have === 0 ? '\u00b7' : String(sc.have);
                                const cls = sc.have > 0 ? 'gus-bc-slot-unknown' : 'gus-bc-slot-none';
                                cells += `<td><span class="gus-bc-slot ${cls}" data-si="${si}" data-bid="${booth.id}">${label}</span></td>`;
                            } else {
                                const cls = bcSlotClass(sc.have, sc.need);
                                const label = sc.need === 0 ? '\u00b7' : `${sc.have}/${sc.need}`;
                                cells += `<td><span class="gus-bc-slot ${cls}" data-si="${si}" data-bid="${booth.id}">${label}</span></td>`;
                            }
                        }
                        let boothPctLabel;
                        if (isUnknownNeed) {
                            boothPctLabel = '\u2014';
                        } else {
                            const boothPct = booth.peopleRequired > 0
                                ? Math.round(booth.slotCoverage.reduce((s, c) => s + Math.min(c.have, c.need), 0) / (booth.peopleRequired * BOOTH_TIME_SLOTS.length) * 100)
                                : 0;
                            boothPctLabel = `<span class="${bcPctClass(boothPct)}">${boothPct}%</span>`;
                        }
                        cells += `<td class="gus-bc-pct">${boothPctLabel}</td>`;
                        tr.innerHTML = cells;

                        tr.querySelectorAll('.gus-bc-slot[data-bid]').forEach(span => {
                            const si = parseInt(span.dataset.si);
                            const bid = span.dataset.bid;
                            const b = booths.find(x => x.id === bid);
                            if (b) {
                                span.addEventListener('mouseenter', (e) => showBcTooltip(e, b.slotCoverage[si].volunteers));
                                span.addEventListener('mouseleave', hideBcTooltip);
                            }
                        });

                        frag.appendChild(tr);
                    }
                    row.after(frag);
                });
            });
        }

        function openBoothCoverageModal() {
            if (document.querySelector('.gus-bc-overlay')) return;

            const overlay = document.createElement('div');
            overlay.className = 'gus-breakdown-overlay gus-bc-overlay';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) { hideBcTooltip(); overlay.remove(); } });

            const popup = document.createElement('div');
            popup.className = 'gus-bc-popup';
            popup.innerHTML = `
                <div class="gus-bc-header">
                    <span class="gus-bc-title">Booth Coverage \u2014 Election Day</span>
                    <span class="gus-bc-close" title="Close">&times;</span>
                </div>
                <div class="gus-bc-summary"></div>
                <div class="gus-bc-status"><span class="gus-spinner"></span> Loading...</div>
                <div class="gus-bc-table-wrap"><table class="gus-bc-table"></table></div>
                <div class="gus-bc-actions" style="margin-top:12px;text-align:center;"></div>
            `;

            popup.querySelector('.gus-bc-close').addEventListener('click', () => { hideBcTooltip(); overlay.remove(); });
            overlay.appendChild(popup);
            document.body.appendChild(overlay);

            const tableEl = popup.querySelector('.gus-bc-table');
            const statusEl = popup.querySelector('.gus-bc-status');
            const summaryEl = popup.querySelector('.gus-bc-summary');
            const actionsEl = popup.querySelector('.gus-bc-actions');

            const BC_CACHE_TTL = 30 * 60 * 1000;
            if (boothCoverageCache && (Date.now() - boothCoverageCache.timestamp) < BC_CACHE_TTL) {
                renderCoverageTable(boothCoverageCache.results, tableEl, summaryEl);
                statusEl.innerHTML = `${boothCoverageCache.results.length} electorates loaded \u2014 ${cacheAgeText(boothCoverageCache.timestamp)}`;
                actionsEl.innerHTML = '<button class="gus-bc-btn gus-bc-refresh-btn">Refresh</button>';
                actionsEl.querySelector('.gus-bc-refresh-btn').addEventListener('click', () => {
                    boothCoverageCache = null;
                    overlay.remove();
                    openBoothCoverageModal();
                });
                return;
            }

            const results = [];
            let loaded = 0;
            let authFails = 0;
            const ordered = ALL_ELECTORATES;

            ordered.forEach(([name, id], i) => {
                setTimeout(() => {
                    fetchBoothRoster(id, function(data, err) {
                        loaded++;
                        if (err === 'not_logged_in') {
                            authFails++;
                        } else {
                            const booths = data ? parseElectionDayBooths(data) : [];
                            const summary = computeElectorateSummary(booths);
                            results.push({ name, id, booths, summary, _raw: data });
                            renderCoverageTable(results, tableEl, summaryEl);
                        }
                        statusEl.textContent = `Loading ${loaded} / ${ordered.length}...`;
                        if (loaded >= ordered.length) {
                            if (results.length === 0 && authFails > 0) {
                                statusEl.innerHTML = '';
                                summaryEl.innerHTML = `<div class="gus-bc-auth-error">Not logged into Rocket.<br>Open <a href="https://contact-sa.greens.org.au" target="_blank">contact-sa.greens.org.au</a> in another tab, log in, then try again.</div>`;
                                return;
                            }
                            boothCoverageCache = { results: [...results], timestamp: Date.now() };
                            const warn = authFails > 0 ? ` (${authFails} failed)` : '';
                            statusEl.innerHTML = `${results.length} electorates loaded${warn} \u2014 ${cacheAgeText(boothCoverageCache.timestamp)}`;
                            actionsEl.innerHTML = '<button class="gus-bc-btn gus-bc-refresh-btn">Refresh</button>';
                            actionsEl.querySelector('.gus-bc-refresh-btn').addEventListener('click', () => {
                                boothCoverageCache = null;
                                overlay.remove();
                                openBoothCoverageModal();
                            });
                        }
                    });
                }, i * 100);
            });
        }

        function updateRosterWidget() {
            const widget = document.querySelector('.gus-roster-widget');
            if (!widget) return;

            const body = widget.querySelector('.gus-roster-body');
            if (!body) return;

            if (rosterLoading) {
                const all = [pdConfirmed, pdSelfRostered, pdHeysen, pdCaptains, evConfirmed, evSelfRostered, evHeysen, evCaptains];
                const done = all.filter(v => v !== null).length;
                body.innerHTML = `<span class="gus-roster-loading" style="display:flex;align-items:center;gap:8px;"><span class="gus-spinner"></span><span style="font-size:12px;color:#999;">Loading ${done}/8</span></span>`;
                return;
            }
            if (rosterError) {
                body.innerHTML = `<span class="gus-roster-error">${escapeHtml(rosterError)}</span>`;
                return;
            }
            if (pdConfirmed !== null) {
                const pdTotal = (pdConfirmed ?? 0) + (pdSelfRostered ?? 0);
                const evTotal = (evConfirmed ?? 0) + (evSelfRostered ?? 0);
                const grandTotal = pdTotal + evTotal;
                const totalPct = Math.round(Math.min((grandTotal / TOTAL_TARGET) * 100, 100));
                const pdPct = Math.min((pdTotal / TOTAL_TARGET) * 100, 100);
                const evPct = Math.min((evTotal / TOTAL_TARGET) * 100, Math.max(100 - pdPct, 0));

                const segments = [
                    { color: PD_COLOR, pct: pdPct, label: `PD: ${pdTotal}` },
                    { color: EV_COLOR, pct: evPct, label: `EV: ${evTotal}` }
                ];

                body.innerHTML = `
                    ${buildRingHtml(segments, grandTotal.toLocaleString())}
                    <div class="gus-roster-count">
                        <div><span style="color:${EV_COLOR};font-weight:600;">EV:</span> <strong>${evTotal.toLocaleString()}</strong> <span style="color:${HEYSEN_COLOR};">(${(evHeysen ?? 0).toLocaleString()})</span> <span style="color:#999;">(${(evSelfRostered ?? 0).toLocaleString()})</span> <span style="color:${CAPTAIN_COLOR};">(${(evCaptains ?? 0).toLocaleString()})</span> / ${EV_TARGET.toLocaleString()}</div>
                        <div><span style="color:${PD_COLOR};font-weight:600;">PD:</span> <strong>${pdTotal.toLocaleString()}</strong> <span style="color:${HEYSEN_COLOR};">(${(pdHeysen ?? 0).toLocaleString()})</span> <span style="color:#999;">(${(pdSelfRostered ?? 0).toLocaleString()})</span> <span style="color:${CAPTAIN_COLOR};">(${(pdCaptains ?? 0).toLocaleString()})</span> / ${PD_TARGET.toLocaleString()}</div>
                    </div>
                    <div class="gus-roster-legend">
                        <span><span class="gus-dot" style="background:${HEYSEN_COLOR};"></span>Heysen</span>
                        <span><span class="gus-dot" style="background:#999;"></span>Self</span>
                        <span><span class="gus-dot" style="background:${CAPTAIN_COLOR};"></span>Capt</span>
                    </div>
                    <button class="gus-bc-btn" style="margin-top:6px;" title="Booth Coverage Dashboard">Booth Coverage</button>
                `;
                attachRingHover(widget);

                const bcBtn = body.querySelector('.gus-bc-btn');
                if (bcBtn && !bcBtn.dataset.gusClick) {
                    bcBtn.dataset.gusClick = '1';
                    bcBtn.addEventListener('click', () => openBoothCoverageModal());
                }

                const ring = widget.querySelector('.gus-roster-ring');
                if (ring && !ring.dataset.gusClick) {
                    ring.dataset.gusClick = '1';
                    ring.addEventListener('click', () => openBreakdownPopup());
                }

                // Show percentage on ring hover, revert on leave
                if (ring && !ring.dataset.gusRingHover) {
                    ring.dataset.gusRingHover = '1';
                    const pctEl = ring.querySelector('.gus-roster-pct');
                    ring.addEventListener('mouseenter', () => { pctEl.textContent = totalPct + '%'; });
                    ring.addEventListener('mouseleave', () => { pctEl.textContent = grandTotal.toLocaleString(); });
                }
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
            if (capturedJwt && pdConfirmed === null && !rosterLoading) {
                fetchRosterCount();
            }
            rosterJwtCheckCount++;
            if (pdConfirmed !== null || rosterJwtCheckCount > 30) {
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

        // --- Quick action buttons (No Answer / MI) ---
        GM_addStyle(`
            .gus-quick-actions {
                display: inline-flex;
                gap: 6px;
                margin-left: 6px;
                align-items: center;
            }
            .gus-quick-btn {
                padding: 5px 14px;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                border: 1px solid;
                transition: background 0.15s, opacity 0.15s;
                font-family: inherit;
                line-height: 1.5;
                white-space: nowrap;
            }
            .gus-quick-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .gus-quick-btn-na {
                background: #fff;
                color: #d32f2f;
                border-color: #d32f2f;
            }
            .gus-quick-btn-na:hover:not(:disabled) {
                background: #ffebee;
            }
            .gus-quick-btn-mi {
                background: #fff;
                color: #2e7d32;
                border-color: #2e7d32;
            }
            .gus-quick-btn-mi:hover:not(:disabled) {
                background: #e8f5e9;
            }
        `);

        function injectQuickActions() {
            const skipBtn = Array.from(document.querySelectorAll('button.MuiButton-outlined')).find(b => b.textContent.trim() === 'Skip');
            if (!skipBtn) return;
            if (skipBtn.parentElement.querySelector('.gus-quick-actions')) return;

            const wrap = document.createElement('span');
            wrap.className = 'gus-quick-actions';

            const ACTIONS = [
                { label: 'No Answer', value: 'No answer', cls: 'gus-quick-btn-na' },
                { label: 'MI', value: 'Meaningful interaction', cls: 'gus-quick-btn-mi' },
            ];

            ACTIONS.forEach(action => {
                const btn = document.createElement('button');
                btn.className = 'gus-quick-btn ' + action.cls;
                btn.textContent = action.label;
                btn.title = action.value;
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    btn.disabled = true;
                    btn.textContent = '...';

                    const selectDiv = document.querySelector('div[role="combobox"].MuiSelect-select');
                    const nativeInput = document.querySelector('input.MuiSelect-nativeInput');
                    if (!selectDiv || !nativeInput) {
                        btn.textContent = action.label;
                        btn.disabled = false;
                        debugLog('Quick action: could not find MUI Select');
                        return;
                    }

                    selectDiv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

                    setTimeout(() => {
                        const option = document.querySelector(`li[role="option"][data-value="${action.value}"]`);
                        if (option) {
                            option.click();
                            setTimeout(() => {
                                const saveBtn = Array.from(document.querySelectorAll('button.MuiButton-contained')).find(b => b.textContent.trim() === 'Save');
                                if (saveBtn) {
                                    saveBtn.click();
                                    debugLog('Quick action: set', action.value, 'and saved');
                                }
                                btn.textContent = action.label;
                                btn.disabled = false;
                            }, 100);
                        } else {
                            debugLog('Quick action: option not found:', action.value);
                            document.body.click();
                            btn.textContent = action.label;
                            btn.disabled = false;
                        }
                    }, 150);
                });
                wrap.appendChild(btn);
            });

            skipBtn.after(wrap);
        }

        const lmObserver = new MutationObserver(() => {
            checkNavigation();
            injectButton();
            injectVersionBadge();
            injectRosterWidget();
            injectQuickActions();
        });
        lmObserver.observe(document.body, { childList: true, subtree: true });

        injectButton();
        injectVersionBadge();
        injectRosterWidget();
        injectQuickActions();
    }

    // --- Rocket ---
    if (IS_ROCKET) {

        GM_addStyle(`
            .panel-body > p {
                margin-bottom: 6px !important;
            }
            .panel-body > p > label {
                margin-bottom: 0;
            }
            .gus-sms-link, .gus-copy-phone, .gus-copy-email {
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
            .gus-sms-link svg, .gus-copy-phone svg, .gus-copy-email svg {
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
            .gus-copy-phone.gus-copied, .gus-copy-email.gus-copied {
                background: #2e7d32;
            }
            .gus-copy-email {
                background: #1565c0;
                color: #fff;
            }
            .gus-copy-email:hover {
                background: #0d47a1;
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
            .gus-modal .gus-preview .gus-fallback {
                background: #e3f2fd;
                color: #1565c0;
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
            .gus-ppb-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
            }
            .gus-ppb-row label {
                font-size: 13px;
                font-weight: 500;
                color: #555;
                white-space: nowrap;
                margin: 0;
            }
            .gus-ppb-select {
                flex: 1;
                padding: 6px 8px;
                border: 1px solid #aaa;
                border-radius: 4px;
                font-size: 14px;
                font-weight: 600;
                font-family: inherit;
                background: #fff;
                color: #1b5e20;
                cursor: pointer;
            }
            .gus-ppb-select:focus {
                outline: none;
                border-color: #2e7d32;
            }
            .gus-ppb-single {
                font-size: 14px;
                color: #2e7d32;
                font-weight: 600;
            }
            .gus-ppb-loading {
                font-size: 12px;
                color: #999;
                font-style: italic;
            }
            .gus-tasks-table-wrap {
                margin-top: 10px;
                padding: 0 15px;
                width: 100%;
            }
            .gus-tasks-table {
                border-collapse: collapse;
                font-size: 11px;
                color: #ccc;
                border-radius: 4px;
                overflow: hidden;
            }
            .gus-tasks-table th,
            .gus-tasks-table td {
                padding: 3px 8px;
                text-align: center;
                white-space: nowrap;
                border: 1px solid #4a4a4a;
                background: #3a3a3a;
            }
            .gus-tasks-table th {
                background: #2e2e2e;
                font-weight: 600;
                font-size: 10px;
                color: #aaa;
            }
            .gus-tasks-table th:first-child,
            .gus-tasks-table td:first-child {
                text-align: left;
                font-weight: 500;
                color: #ddd;
                padding-left: 6px;
                padding-right: 12px;
            }
            .gus-tasks-table td[data-s="Y"],
            .gus-tasks-table td[data-s="D"],
            .gus-tasks-table td[data-s="R"] { background: #2e7d32; }
            .gus-tasks-table td[data-s="E"],
            .gus-tasks-table td[data-s="L"] { background: #1565c0; }
            .gus-tasks-table td[data-s="T"] { background: #e65100; }
            .gus-tasks-table td[data-s="I"],
            .gus-tasks-table td[data-s="U"] { background: #555; }
            .gus-tasks-table td[data-s="N"],
            .gus-tasks-table td[data-s="X"] { background: #c62828; }
            .gus-meta-strip {
                display: flex;
                flex-wrap: wrap;
                gap: 2px 10px;
                font-size: 12px;
                color: #ccc;
                padding: 0 15px;
                margin-top: 2px;
            }
            .gus-meta-strip span { white-space: nowrap; }
            .gus-meta-strip .gus-meta-label {
                color: #888;
                font-size: 11px;
            }
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

        const DEFAULT_TEMPLATE_ROCKET = DEFAULT_TEMPLATE_BODY;

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

        function getCoordsFromDom() {
            const mapLink = document.querySelector('span[agc-maplink] a[href*="maps.google.com"]');
            if (!mapLink) return null;
            const match = mapLink.href.match(/[?&]q=([-\d.]+),([-\d.]+)/);
            if (!match) return null;
            const lat = parseFloat(match[1]), lng = parseFloat(match[2]);
            if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
            return { lat, lng };
        }

        function matchElectorate(lat, lng, callback) {
            loadEcsaData((districts) => {
                if (!districts) { callback(null); return; }
                for (const district of districts) {
                    if (district.name === 'All Districts') continue;
                    try {
                        for (const encodedPath of district.paths) {
                            const polygon = decodePolyline(encodedPath);
                            if (pointInPolygon(lat, lng, polygon)) {
                                const name = district.name.charAt(0).toUpperCase() +
                                    district.name.slice(1).toLowerCase();
                                callback(name);
                                return;
                            }
                        }
                    } catch (e) {}
                }
                callback(null);
            });
        }

        function findElectorate(address, callback) {
            // Prefer Nominatim geocoding of the actual address text (more accurate)
            geocodeAddress(address, (lat, lng) => {
                if (lat !== null) {
                    debugLog('Geocoded via Nominatim');
                    matchElectorate(lat, lng, callback);
                    return;
                }
                // Fall back to DOM coords (NationBuilder's pre-geocoded point)
                const domCoords = getCoordsFromDom();
                if (domCoords) {
                    debugLog('Nominatim failed, using DOM map link coords');
                    matchElectorate(domCoords.lat, domCoords.lng, callback);
                    return;
                }
                callback(null);
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
                if (electorate) fetchPpbBooths(electorate, () => {});
            });
        }

        function getRocketTemplate() {
            const m = window.location.pathname.match(/\/lists\/(\d+)/);
            const listId = m ? m[1] : null;
            const templates = resolveTemplates(listId);
            if (listId) {
                const lastUsedName = GM_getValue(getLastTemplateKey(listId), null);
                if (lastUsedName) {
                    const found = templates.find(t => t.name === lastUsedName);
                    if (found) return found.body;
                }
            }
            return templates[0].body;
        }

        function sameIgnoreCase(a, b) {
            return a && b && a.toLowerCase() === b.toLowerCase();
        }

        const FALLBACK_REGION = 'South Australia';

        function fillTemplate(template, name, suburb, electorate, yourName, ppb) {
            let filled = template;
            const eVal = electorate || FALLBACK_REGION;
            const sVal = suburb || '';
            if (sameIgnoreCase(eVal, sVal) || !sVal) {
                filled = filled.replace(/\[electorate\]\s*\(\s*\[suburb\]\s*\)/gi, '[electorate]');
            }
            filled = filled.replace(/\[their name\]/gi, name || '');
            filled = filled.replace(/\[your name\]/gi, yourName || '');
            filled = filled.replace(/\[suburb\]/gi, sVal || eVal);
            filled = filled.replace(/\[electorate\]/gi, eVal);
            filled = filled.replace(/\[ppb_address\]/gi, ppb ? ppb.full : '');
            filled = filled.replace(/\[ppb\]/gi, ppb ? ppb.name : '');
            filled = filled.replace(/\s*\(\s*\)\s*/g, ' ');
            filled = filled.replace(/  +/g, ' ');
            return filled.trim();
        }

        function fillTemplateForPreview(template, name, suburb, electorate, yourName, ppb) {
            let tmpl = template;
            const eVal = electorate || FALLBACK_REGION;
            const sVal = suburb || '';
            if (sameIgnoreCase(eVal, sVal) || !sVal) {
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
            const subVal = sVal || eVal;
            html = html.replace(/\[suburb\]/gi, suburb
                ? `<span class="gus-filled">${escapeHtml(suburb)}</span>`
                : `<span class="gus-filled gus-fallback">${escapeHtml(subVal)}</span>`);
            html = html.replace(/\[electorate\]/gi, electorate
                ? `<span class="gus-filled">${escapeHtml(electorate)}</span>`
                : `<span class="gus-filled gus-fallback">${escapeHtml(eVal)}</span>`);

            html = html.replace(/\[ppb_address\]/gi, ppb
                ? `<span class="gus-filled">${escapeHtml(ppb.full)}</span>`
                : '<span class="gus-placeholder">[ppb_address]</span>');
            html = html.replace(/\[ppb\]/gi, ppb
                ? `<span class="gus-filled">${escapeHtml(ppb.name)}</span>`
                : '<span class="gus-placeholder">[ppb]</span>');

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
            const listMatch = window.location.pathname.match(/\/lists\/(\d+)/);
            const listId = listMatch ? listMatch[1] : null;
            const templates = resolveTemplates(listId);

            // Restore last-used template
            const lastUsedName = listId ? GM_getValue(getLastTemplateKey(listId), null) : null;
            let activeIndex = 0;
            if (lastUsedName) {
                const idx = templates.findIndex(t => t.name === lastUsedName);
                if (idx >= 0) activeIndex = idx;
            }

            let currentTemplate = templates[activeIndex].body;
            const showNameInput = templates.some(t => /\[your name\]/i.test(t.body));
            let yourName = getYourName();

            const overlay = document.createElement('div');
            overlay.className = 'gus-overlay';
            let currentElectorate = null;
            let ppbBooths = [];
            let selectedPpbIndex = 0;

            function getSelectedPpb() {
                return ppbBooths.length > 0 ? ppbBooths[selectedPpbIndex] : null;
            }

            function updatePreview() {
                const ppb = getSelectedPpb();
                const filled = fillTemplate(currentTemplate, contactName.preferred, suburb, currentElectorate, yourName, ppb);
                const previewHtml = fillTemplateForPreview(currentTemplate, contactName.preferred, suburb, currentElectorate, yourName, ppb);
                const preview = overlay.querySelector('.gus-preview');
                const sendLink = overlay.querySelector('.gus-send');
                if (preview) preview.innerHTML = previewHtml;
                if (sendLink) sendLink.href = buildSmsUrl(phone.digits, filled);
            }

            function renderModal(electorate) {
                currentElectorate = electorate;
                const nameInputVal = overlay.querySelector('.gus-your-name-input');
                if (nameInputVal) yourName = nameInputVal.value.trim() || null;

                const ppb = getSelectedPpb();
                const filled = fillTemplate(currentTemplate, contactName.preferred, suburb, electorate, yourName, ppb);
                const previewHtml = fillTemplateForPreview(currentTemplate, contactName.preferred, suburb, electorate, yourName, ppb);

                // Build pill bar
                let pillsHtml = '';
                if (templates.length > 1) {
                    pillsHtml = '<div class="gus-tmpl-pills">' +
                        templates.map((t, i) =>
                            `<button class="gus-tmpl-pill${i === activeIndex ? ' gus-tmpl-pill-active' : ''}" data-idx="${i}" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</button>`
                        ).join('') +
                        '</div>';
                } else if (templates.length === 1 && templates[0].scope !== 'default') {
                    pillsHtml = `<div class="gus-tmpl-pills"><span class="gus-tmpl-pill gus-tmpl-pill-single">${escapeHtml(templates[0].name)}</span></div>`;
                }

                // Build PPB row
                const hasPpbPlaceholder = /\[ppb(_address)?\]/i.test(currentTemplate);
                let ppbRowHtml = '';
                if (hasPpbPlaceholder) {
                    if (ppbBooths.length > 1) {
                        ppbRowHtml = `<div class="gus-ppb-row">
                            <label>Pre-poll booth:</label>
                            <select class="gus-ppb-select">
                                ${ppbBooths.map((b, i) => `<option value="${i}"${i === selectedPpbIndex ? ' selected' : ''}>${escapeHtml(b.full)}</option>`).join('')}
                            </select>
                        </div>`;
                    } else if (ppbBooths.length === 1) {
                        ppbRowHtml = `<div class="gus-ppb-row">
                            <label>Pre-poll booth:</label>
                            <span class="gus-ppb-single">${escapeHtml(ppbBooths[0].name)}</span>
                        </div>`;
                    } else if (electorate) {
                        ppbRowHtml = `<div class="gus-ppb-row">
                            <label>Pre-poll booth:</label>
                            <span class="gus-ppb-loading">Loading...</span>
                        </div>`;
                    }
                }

                overlay.innerHTML = `
                    <div class="gus-modal">
                        <h2>Send SMS</h2>
                        <div class="gus-to">To: ${escapeHtml(contactName.preferred)} (${escapeHtml(phone.display)})</div>
                        ${pillsHtml}
                        ${showNameInput ? `
                            <div class="gus-name-row">
                                <label>Your name:</label>
                                <input type="text" class="gus-your-name-input" value="${escapeHtml(yourName || '')}" placeholder="Enter your name">
                            </div>
                        ` : ''}
                        ${ppbRowHtml}
                        <div class="gus-preview-label">Message preview:</div>
                        <div class="gus-preview">${previewHtml}</div>
                        <div class="gus-modal-actions">
                            <button class="gus-cancel">Cancel</button>
                            <button class="gus-copy-sms">Copy SMS</button>
                            <a class="gus-send" href="${escapeHtml(buildSmsUrl(phone.digits, filled))}">Send SMS</a>
                        </div>
                    </div>
                `;

                // Pill click handlers
                overlay.querySelectorAll('.gus-tmpl-pill[data-idx]').forEach(pill => {
                    pill.addEventListener('click', () => {
                        const idx = parseInt(pill.dataset.idx, 10);
                        if (idx === activeIndex) return;
                        activeIndex = idx;
                        currentTemplate = templates[activeIndex].body;
                        if (listId) GM_setValue(getLastTemplateKey(listId), templates[activeIndex].name);
                        renderModal(currentElectorate);
                    });
                });

                overlay.querySelector('.gus-cancel').addEventListener('click', () => overlay.remove());
                overlay.querySelector('.gus-copy-sms').addEventListener('click', (e) => {
                    const currentFilled = fillTemplate(currentTemplate, contactName.preferred, suburb, currentElectorate, yourName, getSelectedPpb());
                    GM_setValue('smsTemplate_current', currentTemplate);
                    copyToClipboard(currentFilled).then(() => {
                        e.target.textContent = 'Copied!';
                        setTimeout(() => { e.target.textContent = 'Copy SMS'; }, 1500);
                    });
                });
                overlay.querySelector('.gus-send').addEventListener('click', () => {
                    GM_setValue('smsTemplate_current', currentTemplate);
                    if (listId) GM_setValue(getLastTemplateKey(listId), templates[activeIndex].name);
                    setTimeout(() => overlay.remove(), 300);
                });

                const ppbSelect = overlay.querySelector('.gus-ppb-select');
                if (ppbSelect) {
                    ppbSelect.addEventListener('change', () => {
                        selectedPpbIndex = parseInt(ppbSelect.value, 10);
                        updatePreview();
                    });
                }

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
                if (!electorate || !document.body.contains(overlay)) return;
                renderModal(electorate);

                const hasPpbInAnyTemplate = templates.some(t => /\[ppb(_address)?\]/i.test(t.body));
                if (hasPpbInAnyTemplate) {
                    fetchPpbBooths(electorate, (booths) => {
                        if (!document.body.contains(overlay)) return;
                        ppbBooths = booths;
                        selectedPpbIndex = 0;
                        renderModal(electorate);
                    });
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

        function injectEmailCopyButtons() {
            const copySvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
            const checkSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

            document.querySelectorAll('li[ng-repeat*="email in"] > span').forEach(span => {
                if (span.querySelector('.gus-copy-email')) return;
                const emailText = span.childNodes[0]?.textContent?.trim();
                if (!emailText || !emailText.includes('@')) return;

                const copyLink = document.createElement('span');
                copyLink.className = 'gus-copy-email';
                copyLink.innerHTML = copySvg;
                copyLink.title = 'Copy email address';
                copyLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    copyToClipboard(emailText).then(() => {
                        copyLink.innerHTML = checkSvg;
                        copyLink.classList.add('gus-copied');
                        setTimeout(() => { copyLink.innerHTML = copySvg; copyLink.classList.remove('gus-copied'); }, 1500);
                    });
                });

                const icons = span.querySelector('span[agc-civi-icons]');
                if (icons) icons.after(copyLink);
                else span.appendChild(copyLink);
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

        // --- PPB (Pre-Poll Booth) data ---
        let ppbCache = {};

        function getElectorateIdByName(name) {
            if (!name) return null;
            const entry = ELECTORATES.find(([n]) => n.toLowerCase() === name.toLowerCase());
            return entry ? entry[1] : null;
        }

        function sentenceCase(str) {
            if (!str) return '';
            return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        }

        function extractPpbBooths(data) {
            const booths = data?.commands?.booths || [];
            const seen = new Map();
            for (const b of booths) {
                if (b.info.prepoll === '0' || b.info.defunct === '1') continue;
                const name = b.info.premises || b.info.name;
                const addr1 = b.info.address1 || '';
                const suburb = b.info.address_suburb || '';
                const key = (name + '|' + addr1 + '|' + suburb).toLowerCase();
                if (!seen.has(key)) {
                    const addrParts = [addr1, sentenceCase(suburb)].filter(Boolean);
                    seen.set(key, {
                        name: name,
                        addressLine: addrParts.join(', '),
                        full: name + (addrParts.length ? ' (' + addrParts.join(', ') + ')' : '')
                    });
                }
            }
            return Array.from(seen.values());
        }

        function fetchPpbBooths(electorateName, callback) {
            if (!electorateName) { callback([]); return; }

            const cached = ppbCache[electorateName];
            if (cached && !cached.loading) { callback(cached.booths); return; }
            if (cached && cached.loading) { cached.callbacks.push(callback); return; }

            const electorateId = getElectorateIdByName(electorateName);
            if (!electorateId) { callback([]); return; }

            ppbCache[electorateName] = { booths: [], loading: true, callbacks: [callback] };

            const cmd = JSON.stringify({ requests: { electorateroster: [String(electorateId)] } });
            const url = '/agc/ajax?commands=' + encodeURIComponent(cmd);

            pageWindow.fetch(url, { credentials: 'same-origin' })
                .then(r => r.json())
                .then(data => {
                    const booths = extractPpbBooths(data);
                    const entry = ppbCache[electorateName];
                    entry.booths = booths;
                    entry.loading = false;
                    const cbs = entry.callbacks;
                    entry.callbacks = [];
                    cbs.forEach(cb => cb(booths));
                })
                .catch(() => {
                    const entry = ppbCache[electorateName];
                    entry.booths = [];
                    entry.loading = false;
                    const cbs = entry.callbacks;
                    entry.callbacks = [];
                    cbs.forEach(cb => cb([]));
                });
        }

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
                        const title = CHOICE_TITLES[safeChoice] || 'Unknown';
                        html += `<td data-s="${safeChoice}" title="${escapeHtml(title)}"></td>`;
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

        function injectMetaStrip() {
            const panelBody = document.querySelector('.panel-body');
            if (!panelBody || panelBody.querySelector('.gus-meta-strip')) return;

            const META_FIELDS = [
                { label: 'Age', ng: 'shared.contact.rec.age_years' },
                { label: 'Pronouns', ng: 'shared.contact.rec.pronouns' },
                { label: 'Status', ng: 'true || fields.show_pending_status' },
                { label: 'Updated', ng: 'fields.show_when_updated' },
                { label: 'Created', ng: 'fields.show_when_created' },
                { label: 'Membership', ng: 'fields.show_membership' },
            ];

            const parts = [];
            const toHide = [];

            for (const p of panelBody.querySelectorAll(':scope > p')) {
                const lbl = p.querySelector('label');
                if (!lbl) continue;
                const labelText = lbl.textContent.trim().replace(/:$/, '');

                if (labelText === 'Age' || labelText === 'Pronouns') {
                    const val = p.textContent.replace(lbl.textContent, '').trim();
                    if (val) parts.push(`<span><span class="gus-meta-label">${escapeHtml(labelText)}</span> ${escapeHtml(val)}</span>`);
                    toHide.push(p);
                } else if (labelText === 'Current status') {
                    const val = p.textContent.replace(lbl.textContent, '').trim();
                    if (val) parts.push(`<span><span class="gus-meta-label">Status</span> ${escapeHtml(val)}</span>`);
                    toHide.push(p);
                } else if (labelText === 'Updated' || labelText === 'Created') {
                    const timeEl = p.querySelector('[am-time-ago]');
                    const val = timeEl ? timeEl.textContent.trim() : '';
                    if (val) parts.push(`<span><span class="gus-meta-label">${escapeHtml(labelText)}</span> ${escapeHtml(val)}</span>`);
                    toHide.push(p);
                } else if (labelText === 'Membership expiry') {
                    const timeEl = p.querySelector('[am-time-ago]');
                    const val = timeEl ? timeEl.textContent.trim() : '';
                    if (val) parts.push(`<span><span class="gus-meta-label">Membership due</span> ${escapeHtml(val)}</span>`);
                    toHide.push(p);
                } else if (labelText === 'Contact ID') {
                    const link = p.querySelector('a');
                    const val = link ? link.textContent.trim() : '';
                    const href = link ? link.getAttribute('href') : '';
                    if (val) parts.push(`<span><span class="gus-meta-label">ID</span> <a href="${escapeHtml(href)}" style="color:#7ab8d9">${escapeHtml(val)}</a></span>`);
                    toHide.push(p);
                }
            }

            if (parts.length === 0) return;

            toHide.forEach(el => el.style.display = 'none');

            const strip = document.createElement('div');
            strip.className = 'gus-meta-strip';
            strip.innerHTML = parts.join('<span style="color:#555">·</span>');

            const tasksWrap = panelBody.querySelector('.gus-tasks-table-wrap');
            if (tasksWrap) {
                panelBody.insertBefore(strip, tasksWrap);
            } else {
                panelBody.appendChild(strip);
            }
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

        const DATE_FORMATS = [
            { value: 'd/m', label: 'd/m', fn: d => d.getDate() + '/' + (d.getMonth() + 1) },
            { value: 'dd/mm', label: 'dd/mm', fn: d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') },
            { value: 'd/m/yy', label: 'd/m/yy', fn: d => d.getDate() + '/' + (d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2) },
            { value: 'dd/mm/yy', label: 'dd/mm/yy', fn: d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2) },
        ];

        function getDateSettings() {
            try {
                const saved = GM_getValue('gus_date_settings');
                if (saved) return JSON.parse(saved);
            } catch (e) {}
            return { format: 'd/m', sep: ', ' };
        }

        function saveDateSettings(settings) {
            GM_setValue('gus_date_settings', JSON.stringify(settings));
        }

        function formatDate(fmt) {
            const now = new Date();
            const entry = DATE_FORMATS.find(f => f.value === fmt) || DATE_FORMATS[0];
            return entry.fn(now);
        }

        function appendToNotes(textarea, text) {
            const cur = textarea.value;
            if (cur && cur.trim()) {
                // If text already ends with non-alphanumeric separator (e.g. " - ", ", "), just append
                if (/[^\w]\s*$/.test(cur)) {
                    textarea.value = cur.replace(/\s*$/, '') + ' ' + text;
                } else {
                    textarea.value = cur.trimEnd() + ', ' + text;
                }
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
                const ds = getDateSettings();
                const dateStr = formatDate(ds.format);
                dateChip.textContent = dateStr;
                dateChip.title = 'Insert today\'s date';
                dateChip.addEventListener('click', () => {
                    const cur = textarea.value;
                    if (cur && cur.trim()) {
                        appendToNotes(textarea, dateStr);
                    } else {
                        textarea.value = dateStr + ds.sep;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
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
                // Date settings
                const curDs = getDateSettings();
                const dateDivider = document.createElement('div');
                dateDivider.style.cssText = 'border-top: 1px solid #444; margin: 4px 0; padding-top: 6px; font-size: 11px; color: #888;';
                dateDivider.textContent = 'Date format';
                editorEl.appendChild(dateDivider);

                const fmtRow = document.createElement('div');
                fmtRow.className = 'gus-chips-editor-row';
                const fmtLabel = document.createElement('span');
                fmtLabel.style.cssText = 'font-size: 11px; color: #999; min-width: 50px;';
                fmtLabel.textContent = 'Format';
                const fmtSelect = document.createElement('select');
                fmtSelect.style.cssText = 'padding: 2px 4px; border: 1px solid #555; border-radius: 3px; background: #3a3a3a; color: #ccc; font-size: 12px;';
                for (const f of DATE_FORMATS) {
                    const opt = document.createElement('option');
                    opt.value = f.value;
                    opt.textContent = f.label + ' \u2192 ' + f.fn(new Date());
                    if (f.value === curDs.format) opt.selected = true;
                    fmtSelect.appendChild(opt);
                }
                fmtRow.appendChild(fmtLabel);
                fmtRow.appendChild(fmtSelect);
                editorEl.appendChild(fmtRow);

                const sepRow = document.createElement('div');
                sepRow.className = 'gus-chips-editor-row';
                const sepLabel = document.createElement('span');
                sepLabel.style.cssText = 'font-size: 11px; color: #999; min-width: 50px;';
                sepLabel.textContent = 'After';
                const sepInput = document.createElement('input');
                sepInput.type = 'text';
                sepInput.value = curDs.sep;
                sepInput.placeholder = ', ';
                sepInput.style.width = '60px';
                const sepPreview = document.createElement('span');
                sepPreview.style.cssText = 'font-size: 11px; color: #7cb342; margin-left: 4px;';
                function updatePreview() {
                    const fmt = DATE_FORMATS.find(f => f.value === fmtSelect.value) || DATE_FORMATS[0];
                    sepPreview.textContent = fmt.fn(new Date()) + (sepInput.value || ', ') + 'Called';
                }
                updatePreview();
                fmtSelect.addEventListener('change', updatePreview);
                sepInput.addEventListener('input', updatePreview);
                sepRow.appendChild(sepLabel);
                sepRow.appendChild(sepInput);
                sepRow.appendChild(sepPreview);
                editorEl.appendChild(sepRow);

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
                    saveDateSettings({ format: fmtSelect.value, sep: sepInput.value || ', ' });
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
            injectEmailCopyButtons();
            injectElectorateDropdown();
            convertShiftTimes();
            prefetchElectorate();
            injectTaskSummary();
            injectMetaStrip();
            injectNoteChips();
        });
        rocketObserver.observe(document.body, { childList: true, subtree: true });

        injectSmsLinks();
        injectEmailCopyButtons();
        injectElectorateDropdown();
        convertShiftTimes();
        prefetchElectorate();
        injectTaskSummary();
        injectMetaStrip();
        injectNoteChips();
    }

})();
