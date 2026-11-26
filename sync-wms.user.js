// ==UserScript==
// @name         Auto Sync Scanner V10 ke QianYi Weigh & Ship
// @namespace    http://tampermonkey.net
// @version      1.6
// @description  Meneruskan resi VALID dari Scanner Filter V10 ke QianYi WMS secara instan (Anti-Jam)
// @match        *://*.github.io/*
// @match        *://*.best-inc.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const currentUrl = window.location.href;

    // =========================================================================
    // BAGIAN 1: PENGIRIM INSTAN (DENGAN FILTER ANTI-JAM & ANTI-TANGGAL)
    // =========================================================================
    if (currentUrl.includes('github.io')) {
        let lastSentRowText = '';

        const v10Badge = document.createElement('div');
        v10Badge.style.cssText = 'position:fixed;bottom:15px;right:15px;background:#16a34a;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:bold;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        v10Badge.innerText = '⚡ Pengirim Instan V1.6 Siap';
        document.body.appendChild(v10Badge);

        const cekDanKirimBarisBaru = () => {
            const latestRow = document.querySelector('table tbody tr');
            if (!latestRow) return;

            const fullText = latestRow.innerText.trim();
            if (!fullText || fullText === lastSentRowText) return;

            const upperText = fullText.toUpperCase();
            if (upperText.includes('CANCEL') || upperText.includes('DOUBLE') || upperText.includes('DUPLIKAT')) {
                lastSentRowText = fullText;
                v10Badge.style.background = '#dc2626';
                v10Badge.innerText = '⛔ Diblokir (Cancel/Double)';
                return;
            }

            const cells = Array.from(latestRow.querySelectorAll('td')).map(td => td.innerText.trim());
            let noResi = '';
            for (const cellText of cells) {
                const clean = cellText.replace(/\s+/g, '');
                
                // ABAIKAN FORMAT JAM (misal: 05.20.57 atau 05:20:57) & TANGGAL
                const isJamAtauTanggal = /^\d{1,2}[:.]\d{2}([:.]\d{2})?$/.test(clean) || /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(clean);
                const isKataStatus = /^(VALID|LOLOS|OK|AMAN|SUKSES|CANCEL|DOUBLE|PDA|PC|CONVEYOR)$/i.test(clean);

                // Nomor resi asli: minimal 6 karakter, hanya huruf/angka/strip, bukan jam/status
                if (clean.length >= 6 && !isJamAtauTanggal && !isKataStatus && /^[A-Za-z0-9-]+$/.test(clean)) {
                    noResi = clean;
                    break;
                }
            }

            if (noResi) {
                lastSentRowText = fullText;
                v10Badge.style.background = '#2563eb';
                v10Badge.innerText = '⚡ Terkirim Instan: ' + noResi;

                GM_setValue('resi_valid_terbaru', JSON.stringify({
                    resi: noResi,
                    id: Date.now() + Math.random()
                }));
            }
        };

        setTimeout(() => {
            const initRow = document.querySelector('table tbody tr');
            if (initRow) lastSentRowText = initRow.innerText.trim();

            const tbody = document.querySelector('table tbody');
            if (tbody) {
                const observer = new MutationObserver(() => cekDanKirimBarisBaru());
                observer.observe(tbody, { childList: true, subtree: true, characterData: true });
            }
        }, 600);

        setInterval(cekDanKirimBarisBaru, 80);
    }

    // =========================================================================
    // BAGIAN 2: PENERIMA CEPAT DI QIANYI WMS (50ms POLLING)
    // =========================================================================
    if (currentUrl.includes('best-inc.com')) {
        let lastProcessedId = 0;

        const wmsBadge = document.createElement('div');
        wmsBadge.style.cssText = 'position:fixed;bottom:15px;right:15px;background:#16a34a;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:bold;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        wmsBadge.innerText = '⚡ Bridge V1.6 Aktif - Menunggu Scan...';
        document.body.appendChild(wmsBadge);

        let cachedInput = null;
        const getTargetInput = () => {
            if (cachedInput && document.body.contains(cachedInput) && !cachedInput.disabled && cachedInput.offsetParent !== null) {
                return cachedInput;
            }
            const inputs = Array.from(document.querySelectorAll('input'));
            cachedInput = inputs.find(inp =>
                !inp.disabled &&
                !inp.readOnly &&
                inp.offsetParent !== null &&
                inp.offsetWidth > 200 &&
                inp.value !== 'SHIPPING01' &&
                !inp.value.startsWith('LOAD')
            );
            return cachedInput;
        };

        setInterval(() => {
            const rawData = GM_getValue('resi_valid_terbaru', '');
            if (!rawData) return;

            let data;
            try { data = JSON.parse(rawData); } catch (e) { return; }

            if (!data || !data.resi || data.id === lastProcessedId) return;
            if (lastProcessedId === 0) {
                lastProcessedId = data.id;
                return;
            }

            lastProcessedId = data.id;
            const resiMasuk = data.resi;
            const targetInput = getTargetInput();

            if (targetInput) {
                targetInput.focus();
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(targetInput, resiMasuk);
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));

                setTimeout(() => {
                    const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
                    targetInput.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
                    targetInput.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
                    targetInput.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
                    wmsBadge.style.background = '#16a34a';
                    wmsBadge.innerText = '✅ Masuk WMS: ' + resiMasuk;
                }, 30);
            } else {
                wmsBadge.style.background = '#dc2626';
                wmsBadge.innerText = '❌ Kotak Tracking# tidak ditemukan!';
            }
        }, 50);
    }
})();
