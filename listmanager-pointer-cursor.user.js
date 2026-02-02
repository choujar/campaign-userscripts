// ==UserScript==
// @name         List Manager - Pointer Cursor on Rows
// @namespace    https://github.com/choujar/greens-userscripts
// @version      1.0.0
// @description  Adds pointer cursor to clickable data grid rows in List Manager
// @author       Sahil Choujar
// @match        https://listmanager.greens.org.au/*
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/choujar/greens-userscripts/main/listmanager-pointer-cursor.user.js
// @downloadURL  https://raw.githubusercontent.com/choujar/greens-userscripts/main/listmanager-pointer-cursor.user.js
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        .MuiDataGrid-row {
            cursor: pointer !important;
        }
        .MuiDataGrid-row .MuiDataGrid-cell span[role="presentation"] {
            cursor: pointer !important;
        }
    `);
})();
