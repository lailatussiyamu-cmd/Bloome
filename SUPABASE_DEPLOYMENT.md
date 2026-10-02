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

## Pending

1. `20261002010000_production_readiness.sql` — jalankan di SQL Editor **sebelum** memakai versi app yang baru (app baru memanggil `submit_check_in`, `has_consent`, `export_my_data`). Jalankan sekali saja: file ini membuat fungsi baru dengan `create function`, jadi menjalankan ulang akan gagal tanpa mengubah apa pun.
2. Deploy Edge Functions: `supabase functions deploy bloome-assistant` dan `supabase functions deploy delete-account`. `delete-account` memakai `SUPABASE_SERVICE_ROLE_KEY` yang otomatis tersedia di Edge Functions; jangan pernah menaruh kunci itu di app atau `.env`.
