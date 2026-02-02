// ==UserScript==
// @name         Rocket Tweaks
// @namespace    https://github.com/choujar/campaign-userscripts
// @version      1.0.0
// @description  UX improvements for Rocket (contact-sa) inside List Manager iframe
// @author       Sahil Choujar
// @match        https://contact-sa.greens.org.au/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_info
// @updateURL    https://cdn.jsdelivr.net/gh/choujar/campaign-userscripts@main/rocket.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/choujar/campaign-userscripts@main/rocket.user.js
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // Styles
    // =========================================================================
    GM_addStyle(`
        .gus-sms-link {
            display: inline-block;
            margin-left: 6px;
            padding: 1px 6px;
            font-size: 11px;
            font-weight: 600;
            color: #2e7d32;
            border: 1px solid #2e7d32;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            vertical-align: middle;
            transition: background 0.15s, color 0.15s;
        }
        .gus-sms-link:hover {
            background: #2e7d32;
            color: white;
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
            margin: 0 0 16px 0;
            font-size: 18px;
            font-weight: 600;
            color: #333;
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
        .gus-modal .gus-to {
            font-size: 13px;
            color: #666;
            margin-bottom: 16px;
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
        .gus-modal-actions .gus-send {
            background: #2e7d32;
            color: white;
            border-color: #2e7d32;
        }
        .gus-modal-actions .gus-send:hover {
            background: #256b29;
        }
        .gus-modal-actions button:not(.gus-send):hover {
            background: #f5f5f5;
        }
    `);

    // =========================================================================
    // Helpers
    // =========================================================================

    function getContactName() {
        const h2 = document.querySelector('h2.ng-binding');
        if (!h2) return null;

        const text = h2.childNodes[0]?.textContent?.trim();
        if (!text) return null;

        // Format: "Pamela Alethea Smith ~ Pam" - preferred name after ~
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

    function getPhoneNumbers() {
        const phones = [];
        document.querySelectorAll('span[agc-phone]').forEach(span => {
            const text = span.childNodes[0]?.textContent?.trim();
            if (text) {
                const digits = text.replace(/\s/g, '');
                phones.push({
                    display: text,
                    digits: digits,
                    isMobile: /^04\d{8}$/.test(digits)
                });
            }
        });
        return phones;
    }

    function getSuburb() {
        const addrSpan = document.querySelector('span[agc-address]');
        if (!addrSpan) return null;

        const text = addrSpan.textContent.trim();
        // Format: "2 Jack Fox Drive, Apartment 221, NORTH BRIGHTON, 5048, SA"
        // Suburb is the part before the 4-digit postcode
        const parts = text.split(',').map(p => p.trim());
        for (let i = 0; i < parts.length; i++) {
            if (/^\d{4}$/.test(parts[i])) {
                // The part before the postcode is the suburb
                const suburb = parts[i - 1];
                if (suburb) {
                    // Title case it (it's usually ALL CAPS)
                    return suburb.replace(/\b\w+/g, w =>
                        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                    );
                }
            }
        }
        return null;
    }

    function getTemplate() {
        // Read from parent's List Manager storage
        // The listId comes from the parent URL which we can extract from the referrer
        // or we read from GM storage with a known key pattern
        // For now, try all stored templates and use the most recent one
        // The template is stored by listmanager.user.js using GM_getValue
        const template = GM_getValue('rocketSmsTemplate', null);
        if (template) return template;

        // Default fallback
        return `Hi [their name], this is [your name] from the SA Greens.

The election has now been called! We need people to hand out 'How to Vote' cards at polling booths across [electorate] ([suburb]) on election day (21st of March). If you are able to help I can roster you on at a time and place that suits.`;
    }

    function fillTemplate(template, contactName, suburb) {
        let filled = template;
        filled = filled.replace(/\[their name\]/gi, contactName || '[their name]');
        filled = filled.replace(/\[suburb\]/gi, suburb || '[suburb]');
        return filled;
    }

    function highlightPlaceholders(text) {
        return text.replace(/\[([^\]]+)\]/g, '<span class="gus-placeholder">[$1]</span>');
    }

    function buildSmsUrl(phoneDigits, message) {
        // sms: protocol - use & for iOS, ? for Android
        // Using &body= works on both iOS and macOS Messages
        const encoded = encodeURIComponent(message);
        return `sms:${phoneDigits}&body=${encoded}`;
    }

    // =========================================================================
    // SMS Modal
    // =========================================================================

    function showSmsModal(phone, contactName, suburb) {
        const template = getTemplate();
        const filled = fillTemplate(template, contactName.preferred, suburb);

        const overlay = document.createElement('div');
        overlay.className = 'gus-overlay';

        const previewHtml = highlightPlaceholders(
            filled.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        );

        overlay.innerHTML = `
            <div class="gus-modal">
                <h2>Send SMS</h2>
                <div class="gus-to">To: ${contactName.preferred} (${phone.display})</div>
                <div class="gus-preview-label">Message preview:</div>
                <div class="gus-preview">${previewHtml}</div>
                <div class="gus-modal-actions">
                    <button class="gus-cancel">Cancel</button>
                    <a class="gus-send" href="${buildSmsUrl(phone.digits, filled)}" target="_blank">Send SMS</a>
                </div>
            </div>
        `;

        overlay.querySelector('.gus-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        overlay.querySelector('.gus-send').addEventListener('click', () => {
            // Small delay to let the sms: link open before removing modal
            setTimeout(() => overlay.remove(), 300);
        });

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handler);
            }
        });

        document.body.appendChild(overlay);
    }

    // =========================================================================
    // Inject SMS link next to mobile numbers
    // =========================================================================

    function injectSmsLinks() {
        const phones = getPhoneNumbers();
        const contactName = getContactName();
        const suburb = getSuburb();

        if (!contactName) return;

        document.querySelectorAll('span[agc-phone]').forEach(span => {
            // Skip if already injected
            if (span.querySelector('.gus-sms-link')) return;

            const text = span.childNodes[0]?.textContent?.trim();
            if (!text) return;

            const digits = text.replace(/\s/g, '');
            if (!/^04\d{8}$/.test(digits)) return;

            const phone = { display: text, digits: digits, isMobile: true };

            const smsLink = document.createElement('span');
            smsLink.className = 'gus-sms-link';
            smsLink.textContent = 'SMS';
            smsLink.title = 'Send SMS to ' + text;

            smsLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showSmsModal(phone, contactName, suburb);
            });

            // Insert after the phone icon
            const phoneIcon = span.querySelector('a[href^="tel:"]');
            if (phoneIcon) {
                phoneIcon.after(smsLink);
            } else {
                span.appendChild(smsLink);
            }
        });
    }

    // =========================================================================
    // Init
    // =========================================================================

    const observer = new MutationObserver(() => {
        injectSmsLinks();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    injectSmsLinks();
})();
