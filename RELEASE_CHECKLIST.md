# Checklist rilis Bloome

Status per 2 Oktober 2026. ✅ = sudah di kode dan teruji otomatis. ☐ = harus dilakukan manusia.

## Sudah di kode
- ✅ Aturan Bloom dijaga database (tidak mundur, tanpa skor tersembunyi, aman dari trik zona waktu); TS dan SQL diuji identik.
- ✅ RLS di semua tabel; fungsi internal tertutup untuk app; consent hanya lewat RPC.
- ✅ Check-in dan istirahat tersimpan atomik (satu panggilan, tidak setengah tersimpan).
- ✅ Izin AI tersimpan di database dan diperiksa server; bisa dicabut.
- ✅ Ekspor data dan hapus akun di dalam app (wajib App Store & Google Play).
- ✅ Build rilis menolak berjalan tanpa Supabase; Android backup dimatikan untuk data kesehatan.
- ✅ Sesi berakhir → kembali ke halaman masuk.
- ✅ CI GitHub Actions: typecheck, lint, 88 tes di setiap PR.

## Harus kamu lakukan sebelum rilis
- ☐ Jalankan migrasi `20261002010000_production_readiness.sql` dan deploy dua Edge Function (lihat SUPABASE_DEPLOYMENT.md).
- ☐ Konfirmasi ID aplikasi `com.lailatussiyamu.bloome` di `app.json`. **Tidak bisa diganti** setelah upload pertama ke store.
- ☐ Ganti warna latar ikon Android (`#E6F4FE`, bawaan Expo) dengan warna brand, lalu cek ikon di HP.
- ☐ Uji di HP Android dan iPhone sungguhan: onboarding, OTP email, check-in, istirahat, mode hari, milestone, AI, ekspor, hapus akun, layar besar/teks besar, screen reader.
- ☐ Supabase Auth: aktifkan SMTP sendiri (email bawaan Supabase dibatasi beberapa email per jam), template kode 6 digit, dan rate limit OTP.
- ☐ Supabase: aktifkan backup harian/PITR (paket berbayar) sebelum ada data pengguna sungguhan.
- ☐ Kebijakan privasi dan syarat layanan (wajib di store). Data kesehatan termasuk data pribadi spesifik menurut UU PDP; server di Singapura berarti ada transfer lintas negara. Sebaiknya ditinjau orang yang paham hukum.
- ☐ Tinjauan ahli gizi dan psikolog untuk batas keamanan (`src/domain/safety.ts`) dan kata-kata sinyal; uji kualitas jawaban AI.
- ☐ Kontak dukungan terverifikasi di layar Dukungan (lihat TODO di `src/app/support.tsx`).
- ☐ EAS: `npx eas-cli@latest init`, isi `EXPO_PUBLIC_SUPABASE_URL` dan `EXPO_PUBLIC_SUPABASE_ANON_KEY` di EAS environment variables (preview & production), lalu `eas build --profile preview` untuk APK uji.
- ☐ Formulir Data Safety (Google Play) dan App Privacy (App Store): data kesehatan, email, isi pesan ke penyedia AI.

## Disarankan, belum wajib
- Pemantauan error (mis. Sentry) supaya crash di HP pengguna terlihat.
- Simpan sesi login di penyimpanan terenkripsi (expo-secure-store) alih-alih AsyncStorage.
- RPC `today_snapshot()` agar layar Today cukup satu permintaan (sekarang lima).
