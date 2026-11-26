// ==UserScript==
// @name         Auto Sync Scanner V10 ke QianYi Weigh & Ship (QUEUE V3.0)
// @namespace    http://tampermonkey.net
// @version      3.0
// @description  Sistem antrean FIFO anti-hilang untuk meneruskan seluruh resi VALID ke QianYi WMS
// @match        *://*.github.io/*
// @match        *://*.best-inc.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const currentUrl = window.location.href;

    // =========================================================================
    // BAGIAN 1: PENGIRIM ANTREAN (MEMBACA SELURUH BARIS BARU TANPA TERTIMPA)
    // =========================================================================
    if (currentUrl.includes('github.io')) {
        const sudahDikirim = new Set();
        let inisialisasiSelesai = false;

        const v10Badge = document.createElement('div');
        v10Badge.style.cssText = 'position:fixed;bottom:15px;right:15px;background:#16a34a;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:bold;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        v10Badge.innerText = '📦 Antrean V3.0 Siap';
        document.body.appendChild(v10Badge);

        const tambahKeAntreanWMS = (noResi, keyUnik) => {
            const rawQueue = GM_getValue('wms_resi_queue', '[]');
            let queue = [];
            try { queue = JSON.parse(rawQueue); } catch (e) { queue = []; }

            queue.push({
                id: keyUnik,
                resi: noResi,
                time: Date.now()
            });

            // Batasi maksimal 100 antrean terakhir agar memori tetap ringan
            if (queue.length > 100) queue = queue.slice(-100);

            GM_setValue('wms_resi_queue', JSON.stringify(queue));
            v10Badge.style.background = '#2563eb';
            v10Badge.innerText = '📤 Masuk Antrean: ' + noResi;
        };

        const pindaiSemuaBarisTabel = () => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            if (rows.length === 0) return;

            // Balik urutan (dari bawah ke atas) agar urutan scan masuk sesuai kronologi
            const barisUrut = rows.reverse();

            for (const row of barisUrut) {
                const cells = row.querySelectorAll('td');
                if (cells.length < 3) continue;

                const waktu = cells[0].innerText.trim();
                const noResi = cells[1].innerText.trim().replace(/\s+/g, '');
                const status = cells[2].innerText.trim().toUpperCase();

                if (!noResi || noResi.length < 6) continue;
                const keyUnik = waktu + '_' + noResi;

                if (sudahDikirim.has(keyUnik)) continue;
                sudahDikirim.add(keyUnik);

                // Jangan kirim ulang data lama yang sudah ada sebelum halaman di-refresh
                if (!inisialisasiSelesai) continue;

                if (status.includes('CANCEL') || status.includes('DOUBLE') || status.includes('DUPLIKAT')) {
                    v10Badge.style.background = '#dc2626';
                    v10Badge.innerText = '⛔ Diblokir: ' + noResi;
                    continue;
                }

                if (status.includes('VALID') || status.includes('OK')) {
                    tambahKeAntreanWMS(noResi, keyUnik);
                }
            }
        };

        // Catat semua baris lama saat halaman pertama dibuka
        setTimeout(() => {
            pindaiSemuaBarisTabel();
            inisialisasiSelesai = true;

            const tbody = document.querySelector('table tbody');
            if (tbody) {
                const observer = new MutationObserver(pindaiSemuaBarisTabel);
                observer.observe(tbody, { childList: true, subtree: true, characterData: true });
            }
        }, 500);

        setInterval(pindaiSemuaBarisTabel, 60);
    }

    // =========================================================================
    // BAGIAN 2: EKSEKUTOR ANTREAN DI QIANYI WMS (SATU PER SATU ANTI-TERLEWAT)
    // =========================================================================
    if (currentUrl.includes('best-inc.com')) {
        const wmsSelesai = new Set();
        let sedangInput = false;
        let inisialisasiWMS = false;

        const wmsBadge = document.createElement('div');
        wmsBadge.style.cssText = 'position:fixed;bottom:15px;right:15px;background:#16a34a;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:bold;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        wmsBadge.innerText = '📦 WMS Antrean V3.0 Aktif';
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

        // Tandai antrean lama yang sudah ada sebelum tab WMS di-refresh
        setTimeout(() => {
            const rawQueue = GM_getValue('wms_resi_queue', '[]');
            try {
                const queue = JSON.parse(rawQueue);
                queue.forEach(item => wmsSelesai.add(item.id));
            } catch (e) {}
            inisialisasiWMS = true;
        }, 400);

        setInterval(() => {
            if (!inisialisasiWMS || sedangInput) return;

            const rawQueue = GM_getValue('wms_resi_queue', '[]');
            let queue = [];
            try { queue = JSON.parse(rawQueue); } catch (e) { return; }

            // Cari item pertama dalam antrean yang belum diproses oleh WMS
            const nextItem = queue.find(item => !wmsSelesai.has(item.id));
            if (!nextItem) return;

            const targetInput = getTargetInput();
            if (!targetInput) {
                wmsBadge.style.background = '#dc2626';
                wmsBadge.innerText = '❌ Kotak Tracking# tidak ditemukan!';
                return;
            }

            // Kunci proses sementara agar WMS selesai memproses 1 resi sebelum lanjut ke resi berikutnya
            sedangInput = true;
            wmsSelesai.add(nextItem.id);

            targetInput.focus();
            nativeSetter.call(targetInput, nextItem.resi);
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));

            targetInput.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
            targetInput.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
            targetInput.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

            const sisaAntrean = queue.filter(item => !wmsSelesai.has(item.id)).length;
            wmsBadge.style.background = '#16a34a';
            wmsBadge.innerText = sisaAntrean > 0
                ? `✅ Masuk: ${nextItem.resi} (Sisa antrean: ${sisaAntrean})`
                : `✅ Masuk WMS: ${nextItem.resi}`;

            // Beri jeda 180ms agar QianYi WMS selesai menyimpan & mengosongkan kotak sebelum resi berikutnya masuk
            setTimeout(() => {
                sedangInput = false;
            }, 180);

        }, 40);
    }
})();
