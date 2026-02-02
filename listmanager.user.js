// ==UserScript==
// @name         List Manager Tweaks
// @namespace    https://github.com/choujar/greens-userscripts
// @version      1.1.0
// @description  UX improvements for List Manager
// @author       Sahil Choujar
// @match        https://listmanager.greens.org.au/*
// @grant        GM_addStyle
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
    // Next fix goes here...
    // =========================================================================

})();
