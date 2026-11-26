// ==UserScript==
// @name         Auto Sync Scanner V10 ke QianYi Weigh & Ship (TURBO)
// @namespace    http://tampermonkey.net
// @version      2.0
// @description  Pengiriman resi VALID super cepat (0ms Bypass + Turbo Enter) ke QianYi WMS
// @match        *://*.github.io/*
// @match        *://*.best-inc.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const currentUrl = window.location.href;

    // =========================================================================
    // BAGIAN 1: PENGIRIM TURBO DI TAB SCANNER FILTER V10
    // =========================================================================
    if (currentUrl.includes('github.io')) {
        let lastSentResi = '';
        let lastSentTime = 0;

        const v10Badge = document.createElement('div');
        v10Badge.style.cssText = 'position:fixed;bottom:15px;right:15px;background:#16a34a;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:bold;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        v10Badge.innerText = '🚀 Turbo V2.0 Aktif';
        document.body.appendChild(v10Badge);

        const kirimKeWMS = (noResi) => {
            const cleanResi = noResi.trim().replace(/\s+/g, '');
            if (!cleanResi || cleanResi.length < 6) return;

            // Cegah pengiriman ganda dalam 1.5 detik untuk resi yang sama
            const now = Date.now();
            if (cleanResi === lastSentResi && (now - lastSentTime) < 1500) return;

            lastSentResi = cleanResi;
            lastSentTime = now;

            v10Badge.style.background = '#2563eb';
            v10Badge.innerText = '⚡ Kirim Cepat: ' + cleanResi;

            GM_setValue('resi_valid_terbaru', JSON.stringify({
                resi: cleanResi,
                id: now + Math.random()
            }));
        };

        // JALUR 1: Pantau tabel riwayat (untuk kiriman dari PDA / Cloud Sync)
        let lastRowSignature = '';
        const cekTabelRiwayat = () => {
            const latestRow = document.querySelector('table tbody tr');
            if (!latestRow) return;

            const cells = latestRow.querySelectorAll('td');
            if (cells.length < 3) return;

            // Di tabel V10: Kolom 0 = Waktu, Kolom 1 = No. Resi, Kolom 2 = Status
            const waktu = cells[0].innerText.trim();
            const noResi = cells[1].innerText.trim();
            const status = cells[2].innerText.trim().toUpperCase();
            const signature = waktu + '_' + noResi;

            if (!noResi || signature === lastRowSignature) return;
            lastRowSignature = signature;

            if (status.includes('CANCEL') || status.includes('DOUBLE') || status.includes('DUPLIKAT')) {
                v10Badge.style.background = '#dc2626';
                v10Badge.innerText = '⛔ Diblokir: ' + noResi;
                return;
            }

            if (status.includes('VALID') || status.includes('OK')) {
                kirimKeWMS(noResi);
            }
        };

        setTimeout(() => {
            const initRow = document.querySelector('table tbody tr');
            if (initRow) {
                const cells = initRow.querySelectorAll('td');
                if (cells.length >= 2) {
                    lastRowSignature = cells[0].innerText.trim() + '_' + cells[1].innerText.trim();
                }
            }

            const tbody = document.querySelector('table tbody');
            if (tbody) {
                const observer = new MutationObserver(cekTabelRiwayat);
                observer.observe(tbody, { childList: true, subtree: true, characterData: true });
            }
        }, 400);

        setInterval(cekTabelRiwayat, 40);
    }

    // =========================================================================
    // BAGIAN 2: PENERIMA TURBO DI QIANYI WMS (TANPA JEDA / ZERO-TIMEOUT)
    // =========================================================================
    if (currentUrl.includes('best-inc.com')) {
        let lastProcessedId = 0;

        const wmsBadge = document.createElement('div');
        wmsBadge.style.cssText = 'position:fixed;bottom:15px;right:15px;background:#16a34a;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:bold;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        wmsBadge.innerText = '🚀 WMS Turbo V2.0 Siap';
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

        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };

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
                nativeSetter.call(targetInput, resiMasuk);
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));

                // Eksekusi Enter langsung tanpa setTimeout
                targetInput.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
                targetInput.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
                targetInput.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

                wmsBadge.style.background = '#16a34a';
                wmsBadge.innerText = '✅ Masuk WMS: ' + resiMasuk;
            } else {
                wmsBadge.style.background = '#dc2626';
                wmsBadge.innerText = '❌ Kotak Tracking# tidak ditemukan!';
            }
        }, 25);
    }
})();
