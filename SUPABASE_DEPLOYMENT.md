# Database deployment — 1 Oktober 2026

Project: `nilwzpznijtiqpksdtkf` (Singapore).

Applied through Supabase SQL Editor in a single BEGIN/COMMIT transaction:
- `20261001000000_init.sql`
- `20261001010000_assistant_and_rest.sql`

Before deployment, public schema table query returned zero rows. Both migrations completed successfully. Verification returned 10 tables, all 10 with RLS enabled, care function present, AI quota function present, resting column present, and authenticated SELECT access to bloom_state false.

These migrations were executed manually, not through CLI migration tracking. Do not rerun them or run `supabase db push` blindly against this project. Reconcile CLI migration history with the two applied versions before future CLI deployments.

This installs the database only. App environment configuration, email authentication verification, Edge Function deployment, OpenAI secrets, and native health/GPS integrations remain separate steps.
