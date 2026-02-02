// ==UserScript==
// @name         List Manager Tweaks
// @namespace    https://github.com/choujar/greens-userscripts
// @version      1.2.0
// @description  UX improvements for List Manager
// @author       Sahil Choujar
// @match        https://listmanager.greens.org.au/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/choujar/greens-userscripts/main/listmanager.user.js
// @downloadURL  https://raw.githubusercontent.com/choujar/greens-userscripts/main/listmanager.user.js
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // Pointer cursor on clickable rows
    // =========================================================================
    GM_addStyle(`
        .MuiDataGrid-row {
            cursor: pointer !important;
        }
        .MuiDataGrid-row .MuiDataGrid-cell span[role="presentation"] {
            cursor: pointer !important;
        }
    `);

    // =========================================================================
    // SMS Template Manager
    // =========================================================================

    const DEFAULT_TEMPLATE = `Hi [their name], this is [your name] from the SA Greens.

The election has now been called! We need people to hand out 'How to Vote' cards at polling booths across [electorate] ([suburb]) on election day (21st of March). If you are able to help I can roster you on at a time and place that suits.`;

    function getListId() {
        const match = window.location.pathname.match(/\/lists\/(\d+)/);
        return match ? match[1] : null;
    }

    function getListName() {
        const heading = document.querySelector('h5, h4, h3');
        return heading ? heading.textContent.trim() : null;
    }

    function getStorageKey(listId) {
        return 'smsTemplate_' + listId;
    }

    function getListNameKey(listId) {
        return 'smsTemplateListName_' + listId;
    }

    function loadTemplate(listId) {
        return GM_getValue(getStorageKey(listId), null);
    }

    function saveTemplate(listId, template, listName) {
        GM_setValue(getStorageKey(listId), template);
        if (listName) {
            GM_setValue(getListNameKey(listId), listName);
        }
    }

    function injectStyles() {
        GM_addStyle(`
            .gus-template-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                border: 1px solid #ccc;
                border-radius: 8px;
                background: white;
                cursor: pointer;
                font-size: 18px;
                margin-left: 12px;
                transition: background 0.15s, border-color 0.15s;
            }
            .gus-template-btn:hover {
                background: #f5f5f5;
                border-color: #999;
            }
            .gus-template-btn.has-template {
                border-color: #2e7d32;
                color: #2e7d32;
            }
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
            .gus-modal .gus-list-label {
                font-size: 13px;
                color: #666;
                margin-bottom: 16px;
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
            .gus-modal-actions button {
                padding: 8px 16px;
                border-radius: 6px;
                border: 1px solid #ccc;
                background: white;
                cursor: pointer;
                font-size: 14px;
            }
            .gus-modal-actions button.gus-save {
                background: #2e7d32;
                color: white;
                border-color: #2e7d32;
            }
            .gus-modal-actions button.gus-save:hover {
                background: #256b29;
            }
            .gus-modal-actions button:not(.gus-save):hover {
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
    }

    function createModal(listId, listName, showListChangeWarning) {
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
                ${(showListChangeWarning || nameChanged) ? `
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
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        overlay.querySelector('.gus-save').addEventListener('click', () => {
            const val = overlay.querySelector('#gus-sms-template').value;
            saveTemplate(listId, val, listName);
            updateButtonState(listId);
            overlay.remove();
        });

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handler);
            }
        });

        document.body.appendChild(overlay);
        overlay.querySelector('#gus-sms-template').focus();
    }

    let templateBtn = null;

    function updateButtonState(listId) {
        if (!templateBtn) return;
        const hasTemplate = loadTemplate(listId) !== null;
        templateBtn.classList.toggle('has-template', hasTemplate);
        templateBtn.title = hasTemplate ? 'Edit SMS template' : 'Set up SMS template';
    }

    function injectButton() {
        const listId = getListId();
        if (!listId) return;

        if (document.querySelector('.gus-template-btn')) return;

        // Target the h5 heading element (list name like "0202 Boothby All Interested")
        const heading = document.querySelector('h5.MuiTypography-h5');
        if (!heading) return;

        const headingContainer = heading.parentElement;

        templateBtn = document.createElement('button');
        templateBtn.className = 'gus-template-btn';
        templateBtn.innerHTML = '&#9881;';
        templateBtn.title = 'SMS template';

        updateButtonState(listId);

        templateBtn.addEventListener('click', () => {
            const listName = getListName();
            createModal(listId, listName, false);
        });

        headingContainer.style.display = 'flex';
        headingContainer.style.alignItems = 'flex-start';
        headingContainer.style.gap = '10px';

        // Insert after the heading, before the subtitle
        heading.after(templateBtn);
    }

    // =========================================================================
    // List change detection
    // =========================================================================

    let lastListId = getListId();
    let lastListName = getListName();

    function checkListChange() {
        const currentId = getListId();
        const currentName = getListName();

        if (currentId && currentId !== lastListId) {
            const savedName = GM_getValue(getListNameKey(currentId), null);
            if (savedName && currentName && savedName !== currentName) {
                // list changed - next time modal opens it'll show the warning
            }
            lastListId = currentId;
            lastListName = currentName;

            // re-inject button for new list
            const oldBtn = document.querySelector('.gus-template-btn');
            if (oldBtn) oldBtn.remove();
            templateBtn = null;
            injectButton();
        }
    }

    // =========================================================================
    // Init
    // =========================================================================

    injectStyles();

    const observer = new MutationObserver(() => {
        injectButton();
        checkListChange();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    injectButton();
})();
