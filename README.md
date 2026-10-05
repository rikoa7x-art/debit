# Aplikasi Mobile Monitoring Debit Air - Jalur Pipa Subang ADB

Aplikasi web mobile-first (Progressive Web App - PWA) untuk pemantauan (*monitoring*), inspeksi lapangan, dan verifikasi kesesuaian debit air (*flow rate*) pada seluruh jaringan pipa **Subang Jalur ADB** (`Subang_Jalur_ADB.json`).

---

## 🚀 Cara Membuka di Handphone (Mobile Phone)

Aplikasi ini sudah berjalan di jaringan lokal Anda. Anda dapat langsung membukanya di HP dengan 2 cara:

### Cara 1: Scan QR Code (Paling Cepat)
1. Pastikan HP Anda terhubung ke jaringan **Wi-Fi yang sama** dengan komputer ini.
2. Buka kamera HP atau aplikasi QR Scanner, lalu scan gambar QR Code:
   - [qrcode_mobile.png](file:///c:/Users/Win%2010/Desktop/monitoring/qrcode_mobile.png)
   - Atau klik tombol **"Buka di HP"** di pojok kanan atas aplikasi web.

### Cara 2: Ketik URL di Browser HP
Buka Google Chrome / Safari di HP Anda dan ketik:
```
http://10.38.180.170:5173/
```
*(Atau jika melalui komputer ini, buka [http://localhost:5173/](http://localhost:5173/))*.

> 💡 **Tips Penggunaan Seperti Aplikasi Native di HP:**
> Di Google Chrome (Android) atau Safari (iOS), tekan menu titik tiga / tombol Share lalu pilih **"Tambahkan ke Layar Utama" (Add to Home Screen)**. Aplikasi akan terpasang di HP Anda dan bisa dibuka secara mandiri (*standalone full screen*).

---

## 🎯 Fitur-Fitur Utama Aplikasi

### 1. 🗺️ Peta Interaktif Mobile Jalur Pipa (GIS Map)
- Menampilkan seluruh **235 segmen pipa** dan titik nodus (**Reservoir R1 & R2**, serta Junction) jaringan Subang ADB.
- **Pewarnaan Otomatis Berdasarkan Status Debit:**
  - 🟢 **Hijau**: Sesuai dengan model rencana (toleransi normal $\pm 10\%$).
  - 🟡 **Kuning**: Peringatan deviasi ringan ($\pm 10\% - 25\%$).
  - 🔴 **Merah**: Anomali kritis (debit turun drastis $> 25\%$, indikasi kebocoran pipa atau sumbatan).
  - 🟣 **Ungu**: Anomali debit melonjak (lonjakan konsumsi / katup terbuka).
  - 🔵 **Biru muda**: Pipa belum diukur di lapangan.
- **Dukungan Peta Satelit & Jalan**: Beralih antara peta jalan (*OpenStreetMap*) dan citra satelit (*Esri Satellite*) untuk memudahkan pengenalan lokasi fisik di lapangan (jalan raya, sungai, perumahan).
- **Deteksi GPS & Pipa Terdekat**: Menampilkan posisi petugas di lapangan dan secara otomatis merekomendasikan pipa terdekat untuk diukur.

### 2. 📝 Formulir Verifikasi Lapangan (Mobile Bottom Sheet)
- **Data Desain Rencana (Baseline)**: Menampilkan debit rencana ($Q_{desain}$ L/s), kecepatan alir ($v$ m/s), headloss, diameter pipa, material, dan panjang pipa.
- **Input Data Aktual**:
  - Debit air aktual (pilihan satuan: **L/detik** atau **m³/jam** dengan konversi instan).
  - Tekanan air aktual (bar).
  - Metode pengukuran (Clamp-on Ultrasonic Flowmeter, Electromagnetic, Mechanical, Pitot Tube, dll).
  - Kondisi fisik pipa (Normal, Rembesan di Sambungan, Pipa Retak, Sedimen, Katup Rusak).
  - Nama petugas surveyor.
  - Catatan temuan lapangan.
  - **Foto Bukti Lapangan**: Bisa langsung memotret lewat kamera HP atau mengunggah galeri foto.
- **Diagnosis Real-Time**: Aplikasi langsung menghitung selisih debit ($\Delta Q$), persentase deviasi, dan memberikan rekomendasi teknis otomatis.

### 3. 📋 Daftar & Pencarian Pipa (Filter & Sorting)
- Cari pipa berdasarkan ID, nama nodus (misal `J307`), diameter (misal `150mm`), atau material (`DCI`, `PVC`, dll).
- Filter status: *Semua*, *Bocor/Drop*, *Sesuai*, *Peringatan*, *Belum Diukur*.
- Urutkan berdasarkan *Deviasi Terbesar*, *Jarak GPS Terdekat*, atau *Diameter*.

### 4. 📊 Dashboard Analisis & Rekapitulasi
- **Progres Verifikasi**: Menghitung persentase jaringan pipa yang telah diinspeksi.
- **Neraca Debit Air**: Membandingkan total debit desain vs total debit riil lapangan.
- **Daftar Prioritas Investigasi**: Merangking pipa-pipa yang mengalami penurunan debit paling parah untuk segera diperbaiki tim teknis.
- **Tombol Muat Contoh Data Lapangan (Demo)**: Untuk pengujian cepat dengan 16 pipa simulasi lapangan.
- **Ekspor Laporan (Excel / CSV)**: Unduh seluruh data pengukuran dan rekapitulasi ke format CSV/Excel.

### 5. 📴 Offline-First & Penyimpanan Lokal
- Data pengukuran tersimpan secara aman di memori HP (*LocalStorage / Cache*), sehingga aplikasi tetap dapat digunakan meski berada di titik yang minim sinyal internet.

---

## 🛠️ Perintah Pengembangan (Development Commands)

- **Menjalankan Dev Server:**
  ```bash
  npm run dev
  ```
- **Membangun Versi Rilis Produksi:**
  ```bash
  npm run build
  ```
