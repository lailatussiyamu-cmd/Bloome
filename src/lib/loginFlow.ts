import { withDeadline } from './requestTimeout';

export const LOGIN_RETRY = 'Verifikasi belum berhasil. Buka Bloome di browser tempat kamu meminta email, lalu gunakan link terbaru. Jika link sudah digunakan atau kedaluwarsa, minta email baru dari browser itu.';

/** Never display raw auth errors: they can contain callback credentials. */
export async function readLoginSession<T>(auth: {
  initialize(): Promise<{ error: unknown }>;
  getSession(): Promise<{ data: { session: T | null }; error: unknown }>;
}, callbackAttempt = false): Promise<T | null> {
  return withDeadline((async () => {
    const initialized = await auth.initialize();
    const { data, error } = await auth.getSession();
    if (data.session && !error) return data.session;
    if (initialized.error || error || callbackAttempt) throw new Error(LOGIN_RETRY);
    return null;
  })());
}

/** Only allow this project's email verification endpoint, never arbitrary pasted URLs. */
export function validatedEmailLink(input: string, projectUrl: string, appOrigin: string): string {
  const url = new URL(input.trim());
  const project = new URL(projectUrl);
  if (url.protocol !== 'https:' || url.origin !== project.origin || url.username || url.password ||
      url.pathname !== '/auth/v1/verify' || url.searchParams.get('type') !== 'magiclink' ||
      !url.searchParams.get('token')) throw new Error('invalid_login_link');
  const safe = new URL('/auth/v1/verify', project.origin);
  safe.searchParams.set('token', url.searchParams.get('token')!);
  safe.searchParams.set('type', 'magiclink');
  safe.searchParams.set('redirect_to', new URL('/', appOrigin).href);
  return safe.href;
}
