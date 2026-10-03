# Integrasi perangkat — 2 Oktober 2026

## Implementasi awal
- Akun & privasi → Koneksi kesehatan & GPS.
- Android: Health Connect 4.x, hanya READ_STEPS, agregat langkah sejak tengah malam perangkat. Izin ditolak berarti tidak ada pembacaan.
- iOS: HealthKit, hanya izin baca StepCount. Data kosong tidak dianggap izin diberikan atau angka nol.
- Lokasi: Expo Location, izin foreground, satu pengambilan posisi berakurasi Balanced. Tidak ada background task, penyimpanan koordinat, atau pengiriman ke server/AI.
- Data layar dibersihkan saat meninggalkan halaman. Perubahan ini tidak memanggil recordCareMoment atau mengubah Bloom.
- Pengguna dapat mencabut izin melalui pengaturan perangkat. Cabut akses HealthKit lewat Apple Health, Health Connect lewat pengaturan Health Connect.
- Web: kesehatan menampilkan keterangan bahwa build native diperlukan; lokasi bergantung izin browser. Tidak ada data contoh yang dianggap hasil sensor.

## Batas verifikasi
TypeScript, unit tests, config introspection, dan build web tidak membuktikan integrasi native bekerja di perangkat. Uji preview APK dan build iOS sebelum rilis. Expo Go tidak menyertakan modul kesehatan ini.

## Pengujian perangkat wajib
1. Pastikan tolak izin tidak menyebabkan crash, pembacaan, atau perubahan Bloom.
2. Berikan baca langkah saja; bandingkan angka dengan sumber kesehatan hari ini dan beberapa sumber perangkat.
3. Cabut izin di sistem, kembali ke app, baca ulang; pastikan data lama tidak muncul sebagai hasil baru.
4. Uji data HealthKit kosong, Health Connect tidak terpasang, GPS mati, dan koneksi server tidak tersedia.
5. Tinggalkan halaman saat permintaan sedang berjalan; hasil terlambat tidak boleh muncul kembali.
6. Audit manifest hasil build: tidak ada izin tulis kesehatan/background location. Minimum Android 26.
7. Selesaikan halaman kebijakan privasi dan handling layar rationale Health Connect sebelum publikasi store. Plugin membuka main activity; belum ada kebijakan publik final.

## Belum dibangun
Sinkronisasi cloud, tidur/detak jantung/siklus, pengingat berbasis lokasi, peta dan rekomendasi rute, tracking jalan. Penambahan ini memerlukan tujuan penggunaan dan izin terpisah.

## Audit dependensi
`npm audit --omit=dev` menemukan 15 advisory termasuk 4 high dalam rantai Expo (antara lain node-forge). Jangan gunakan audit fix --force: resolver menyarankan downgrade Expo ke 44 yang tidak kompatibel. Review advisory dan versi perbaikan upstream sebelum rilis produksi; belum diklaim aman untuk rilis store.

Referensi: https://matinzd.github.io/react-native-health-connect/docs/get-started/ ; https://github.com/kingstinct/react-native-healthkit ; https://docs.expo.dev/versions/v57.0.0/sdk/location/
