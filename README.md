# Bloome v0.3 — Living Bloom & Asisten

Aplikasi Bloome dengan Living Bloom sebagai avatar emosional. Lihat LIVING_BLOOM.md untuk kontrak komponen, integrasi, dan aturan visual.
Semua aturan mengikuti dokumen **Bloome v0.1 — Logika & Aturan Produk**.

## Isi

| Folder | Isi |
| --- | --- |
| `src/domain/` | Logika inti tanpa tampilan: pertumbuhan Bloom, Care Moment, mode hari, Comeback, onboarding, batas keamanan |
| `supabase/migrations/` | Skema database, keamanan per user (RLS), dan fungsi server untuk Bloom |
| `supabase/tests/` | Tes database yang menjalankan migrasi di Postgres tiruan |
| `src/components/LivingBloom.tsx` | Komponen Living Bloom berbasis state (`stage`, `mode`, `interactionState`, `variant`) |
| `src/app/` | Layar (Expo Router): onboarding, pilih mode hari, hari ini, check-in, momen selesai, tonggak, perjalanan, mode kembali, dukungan |
| `src/lib/api.ts` | Satu antarmuka data, dua mesin: Supabase, atau mode demo di HP |

## Menjalankan

Butuh Node.js 22.13+ dan aplikasi **Expo Go** di HP.

```bash
npm install
npx expo start
```

Pindai QR code dengan Expo Go. Tanpa pengaturan Supabase, app berjalan dalam **mode demo**:
data tersimpan di HP saja, dengan aturan yang sama persis. Mode demo hanya untuk mencoba,
bukan untuk data kesehatan pengguna sungguhan.

## Menyambungkan Supabase

1. Buat proyek di supabase.com (pilih region Singapura, paling dekat dengan Indonesia).
2. Buka **SQL Editor**, jalankan semua file dalam `supabase/migrations/` sesuai urutan nama, lalu **Run**.
3. Di **Authentication → Providers**, aktifkan Email. Ubah template email agar mengirim kode 6 digit (`{{ .Token }}`).
4. Salin `.env.example` menjadi `.env`, isi URL dan anon key dari **Project Settings → API**.
5. Jalankan ulang `npx expo start`. App sekarang meminta masuk dengan email.

## Tes

```bash
npm test -- --pool=threads   # 73 tes
npm run typecheck
```

Tes database memastikan antara lain:
- Bloom tidak bisa mundur, bahkan kalau database diubah langsung.
- App tidak bisa membaca jumlah hari peduli (`care_days_total`).
- Care Moment kedua di hari yang sama tidak menambah pertumbuhan.
- Tanggal dihitung dengan zona waktu user (23.30 WIB tetap hari yang sama).
- Mode kembali muncul setelah 4 hari tanpa Care Moment.
- Pendaftar di bawah 18 tahun ditolak; tujuan turun berat mati saat hamil/menyusui.
- Ganti zona waktu tidak bisa menambah hari peduli ekstra.
- Aturan di TypeScript (mode demo) dan SQL (produksi) memberi hasil identik (`supabase/tests/parity.test.ts`).

## Keputusan default yang dipakai (bisa diubah)

| Hal | Nilai | Tempat mengubah |
| --- | --- | --- |
| Ambang tahap Bloom | 1 / 5 / 12 / 25 / 45 hari peduli | `src/domain/bloom.ts` **dan** `bloom_stage_for` di migrasi |
| Mode kembali | setelah 4 hari tanpa Care Moment | `src/domain/dayMode.ts` dan `_app_open` di migrasi |
| Duplikat | pilar sama, selisih kurang dari 30 menit (dua arah) | `src/domain/careMoment.ts` dan `_record_care_moment` |
| Batas aman target berat | IMT 18,5 | `src/domain/safety.ts` |
| Setelah Rimbun | Bloom tetap Rimbun | belum dibangun |
| Teman AI | UI dan fungsi server tersedia; perlu aktivasi | AI_SETUP.md |

## Belum dibangun

- Pengujian runtime native Android/iOS.
- Data kesehatan (Health Connect / Apple Health) — butuh development build, bukan Expo Go.
- Pengingat dan geofence lokasi.
- Aktivasi dan verifikasi AI langsung: lihat AI_SETUP.md.
- Integrasi layanan profesional di luar tautan Healing119.
- Tinjauan ahli gizi dan psikolog untuk batas keamanan dan kata-kata sinyal.



Lihat [AUDIT.md](AUDIT.md) untuk hasil pemeriksaan dan batas verifikasi, serta [AI_SETUP.md](AI_SETUP.md) untuk mengaktifkan Asisten.

