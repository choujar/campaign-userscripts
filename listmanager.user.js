// ==UserScript==
// @name         List Manager Tweaks
// @namespace    https://github.com/choujar/campaign-userscripts
// @version      1.6.3
// @description  UX improvements for List Manager and Rocket
// @author       Sahil Choujar
// @match        https://listmanager.greens.org.au/*
// @match        https://contact-sa.greens.org.au/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @updateURL    https://cdn.jsdelivr.net/gh/choujar/campaign-userscripts@main/listmanager.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/choujar/campaign-userscripts@main/listmanager.user.js
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
            badge.href = 'https://cdn.jsdelivr.net/gh/choujar/campaign-userscripts@main/listmanager.user.js';
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

        function getRocketTemplate() {
            // Try shared template from List Manager, fall back to default
            const shared = GM_getValue('smsTemplate_current', null);
            return shared || DEFAULT_TEMPLATE_ROCKET;
        }

        function fillTemplate(template, name, suburb) {
            let filled = template;
            filled = filled.replace(/\[their name\]/gi, name || '[their name]');
            filled = filled.replace(/\[suburb\]/gi, suburb || '[suburb]');
            return filled;
        }

        function fillTemplateForPreview(template, name, suburb) {
            let html = template
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            // Replace known placeholders with filled+highlighted or unfilled+orange
            html = html.replace(/\[their name\]/gi, name
                ? `<span class="gus-filled">${name}</span>`
                : '<span class="gus-placeholder">[their name]</span>');
            html = html.replace(/\[suburb\]/gi, suburb
                ? `<span class="gus-filled">${suburb}</span>`
                : '<span class="gus-placeholder">[suburb]</span>');

            // Any remaining placeholders stay orange
            html = html.replace(/\[([^\]]+)\]/g, '<span class="gus-placeholder">[$1]</span>');

            return html;
        }

        function buildSmsUrl(phoneDigits, message) {
            const encoded = encodeURIComponent(message);
            return `sms:${phoneDigits}&body=${encoded}`;
        }

        function showSmsModal(phone, contactName, suburb) {
            const template = getRocketTemplate();
            const filled = fillTemplate(template, contactName.preferred, suburb);

            const overlay = document.createElement('div');
            overlay.className = 'gus-overlay';

            const previewHtml = fillTemplateForPreview(template, contactName.preferred, suburb);

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
            dismissOnEscapeOrClickOutside(overlay);

            overlay.querySelector('.gus-send').addEventListener('click', () => {
                setTimeout(() => overlay.remove(), 300);
            });

            document.body.appendChild(overlay);
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
        });
        rocketObserver.observe(document.body, { childList: true, subtree: true });

        injectSmsLinks();
    }

})();
