# TIWI COOKING TUTORIAL — FIXED MOBILE EDITION

## Yang diperbaiki
- CSS dan JavaScript menggunakan jalur relatif, agar desain tidak hilang saat file dibuka langsung.
- Mode lokal bisa menyusun storyboard dan prompt tanpa API key atau server.
- Formulir, salin prompt, unduh TXT/JSON, dan pratinjau foto referensi tetap tersedia.

## Cara mencoba di HP
1. Ekstrak ZIP.
2. Buka folder hasil ekstrak.
3. Buka `index.html` dengan browser.
4. Isi nama menu dan resep, lalu tekan **Buat tutorial & storyboard**.

## Batasan yang dijelaskan dengan jujur
Mode lokal menghasilkan kerangka storyboard dan prompt berdasarkan teks resep; ia bukan model AI dan tidak menganalisis foto referensi. Pembuatan gambar AI sungguhan memerlukan aplikasi di-host pada layanan web dengan server dan penyedia model gambar. API key tidak pernah dimasukkan ke halaman browser.

## Hosting/server
Untuk server Node.js, jalankan `npm start` pada lingkungan yang mendukung Node.js 18+. Konfigurasikan `OPENROUTER_API_KEY` di environment server, serta model yang benar-benar mendukung input gambar atau output gambar. Jangan menyimpan API key di file HTML/JavaScript.
