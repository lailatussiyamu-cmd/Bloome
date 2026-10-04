# Database deployment — 1 Oktober 2026

Project: `nilwzpznijtiqpksdtkf` (Singapore).

Applied through Supabase SQL Editor in a single BEGIN/COMMIT transaction:
- `20261001000000_init.sql`
- `20261001010000_assistant_and_rest.sql`

Before deployment, public schema table query returned zero rows. Both migrations completed successfully. Verification returned 10 tables, all 10 with RLS enabled, care function present, AI quota function present, resting column present, and authenticated SELECT access to bloom_state false.

These migrations were executed manually, not through CLI migration tracking. Do not rerun them or run `supabase db push` blindly against this project. Reconcile CLI migration history with the two applied versions before future CLI deployments.

This installs the database only. App environment configuration, email authentication verification, Edge Function deployment, OpenAI secrets, and native health/GPS integrations remain separate steps.

## 2 Oktober 2026

- `20261002000000_tz_rebase_and_dedupe.sql` — diterapkan lewat SQL Editor.

## Rencana sebelumnya (sudah diterapkan; lihat verifikasi di bawah)

1. `20261002010000_production_readiness.sql` — jalankan di SQL Editor **sebelum** memakai versi app yang baru (app baru memanggil `submit_check_in`, `has_consent`, `export_my_data`). Jalankan sekali saja: file ini membuat fungsi baru dengan `create function`, jadi menjalankan ulang akan gagal tanpa mengubah apa pun.
2. Deploy Edge Functions: `supabase functions deploy bloome-assistant` dan `supabase functions deploy delete-account`. `delete-account` memakai `SUPABASE_SERVICE_ROLE_KEY` yang otomatis tersedia di Edge Functions; jangan pernah menaruh kunci itu di app atau `.env`.

## Deployment terverifikasi — 2 Oktober 2026

- `20261002010000_production_readiness.sql` diterapkan melalui SQL Editor dalam BEGIN/COMMIT. Jangan jalankan ulang.
- Verifikasi: `submit_check_in(jsonb)` tersedia; authenticated tidak dapat menjalankan `_export_my_data(uuid)`; anon tidak dapat menjalankan `set_consent(text,boolean)`.
- `delete-account` dan `bloome-assistant` berhasil dideploy melalui Dashboard dari kode commit `fd535d5`. Import lokal diratakan menjadi satu index.ts, tanpa perubahan logika.
- Pemeriksaan GET tanpa kredensial pada kedua endpoint menghasilkan HTTP 401. Ini memverifikasi penolakan gateway, bukan alur login end-to-end.
- Verifikasi JWT legacy gateway tetap aktif. Kompatibilitas dengan signing key sesi pengguna perlu diuji sebelum rilis.
- OpenAI API key belum tersedia; jawaban AI belum aktif. SMTP dan pengujian native masih pending.
- Penghapusan akun nyata tidak dilakukan. Tes konfirmasi hapus produksi ditolak automatic approval review; pengujian destruktif tetap memakai mock/unit tests.
- Riwayat migrasi CLI belum direkonsiliasi. Jangan menjalankan db push tanpa rekonsiliasi.


## Login web — 3 Oktober 2026
- Dashboard Free/default mail saat ini menolak pengeditan template tanpa SMTP sendiri atau upgrade. Template bawaan mengirim magic link.
- Login web sekarang menggunakan PKCE dan detectSessionInUrl; signInWithOtp mengirim emailRedirectTo sesuai origin web + `/`.
- Redirect persis `http://localhost:8081/` sudah ditambahkan setelah persetujuan pengguna. Site URL lama tidak diubah.
- Minta email baru setelah perubahan. Buka link di browser/origin yang sama; verifier PKCE tersimpan di browser tersebut. Jangan bagikan link login.
- Kolom kode tetap tersedia bila template SMTP kelak mengirim OTP. Native masih membutuhkan template OTP atau implementasi callback deep link sebelum rilis.
- Keberhasilan login end-to-end menunggu pengguna membuka email; tidak ada OTP atau token pengguna yang dibaca agent.
