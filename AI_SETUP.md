# Mengaktifkan Bloome AI

Kode aplikasi dan fungsi server sudah tersedia. Layanan AI belum diaktifkan pada paket ini karena belum ada proyek Supabase dan kunci OpenAI yang dikonfigurasi.

## Konfigurasi

1. Pada proyek Supabase milik Anda, jalankan kedua migrasi SQL dalam urutan nama file di `supabase/migrations/`. Untuk proyek yang sudah memakai migrasi pertama, jalankan migrasi kedua saja. Alternatif: gunakan Supabase CLI yang sudah terhubung ke proyek tersebut lalu `supabase db push`.
2. Aktifkan autentikasi Email OTP. Isi `.env` aplikasi memakai `.env.example`: URL proyek dan anon key publik. Jangan memasukkan kunci OpenAI atau service-role key ke aplikasi.
3. Di Supabase Dashboard → Edge Functions → Secrets, masukkan `OPENAI_API_KEY` dan `OPENAI_MODEL=gpt-5-mini`. Model dapat diganti dengan model Responses yang mendukung konfigurasi reasoning pada handler.
4. Deploy dari folder aplikasi: `supabase functions deploy bloome-assistant`. Pertahankan pemeriksaan JWT. Handler juga memverifikasi token ke Auth dan memastikan profil onboarding tersedia.
5. Jalankan ulang Expo setelah mengubah `.env`, masuk dengan akun dewasa yang sudah onboarding, buka Asisten dan setujui pengiriman pesan.
6. Izin AI tersimpan di tabel `consents` dan diperiksa oleh server (`has_consent`), bukan dari isi request. User bisa mencabutnya di **Akun & privasi**.

Kode fungsi berada di `supabase/functions/bloome-assistant/index.ts`. Handler dan aturan Asisten ada di `supabase/functions/_shared/` (pola resmi Supabase untuk kode bersama), dan app mengimpor aturan yang sama lewat `src/domain/assistant.ts`.

## Perilaku

- OpenAI Responses API, moderasi input, batas 5 permintaan/menit dan 30/hari per akun.
- Batas pesan 2.000 karakter; maksimal 12 pesan konteks per permintaan.
- Riwayat obrolan hanya di memori layar dan hilang saat layar dilepas atau aplikasi dimuat ulang. Tidak ada tabel obrolan di database.
- `store:false` digunakan untuk Responses. Ini bukan jaminan tanpa retensi oleh penyedia: kebijakan OpenAI/Supabase tetap berlaku. Jangan aktifkan logging isi percakapan.
- Tanpa layanan, panduan lokal diberi label jelas. Percakapan tidak mencatat Care Moment atau mengubah Bloom.
- Deteksi bahasa krisis memberi arahan keselamatan dan akses Healing119.id. Ini tidak menjamin semua bahasa krisis terdeteksi.

## Verifikasi setelah deployment

Uji dengan akun percobaan: izin pesan, jawaban normal, kegagalan koneksi, token kedaluwarsa, batas permintaan, dan arahan keselamatan. Uji kualitas jawaban model sebelum rilis. Pengujian otomatis dalam paket memakai respons penyedia tiruan; belum ada panggilan OpenAI langsung atau deployment Supabase yang diverifikasi.

Pemeriksaan Deno tambahan tidak dijalankan karena peninjauan persetujuan otomatis gagal akibat batas penggunaan akun. TypeScript handler dan pengujian HTTP sudah lulus.

Referensi: [Responses](https://developers.openai.com/api/docs/guides/text), [Moderation](https://developers.openai.com/api/docs/guides/moderation), [Supabase Auth](https://supabase.com/docs/reference/javascript/auth-getuser), [Healing119 Kemenkes](https://kesprimkom.kemkes.go.id/assets/uploads/contents/others/FAQ_Cegah_Bunuh_Diri,_Dukung_Kesehatan_Jiwa__Kenali_Layanan_Healing119.id.pdf).
