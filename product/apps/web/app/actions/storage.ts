'use server';

import { storageFromEnv, putBucketPublicRead, putBucketCors, storageSelfTest } from '@tiktrends/integrations';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';

function appOrigins(): string[] {
  const out = new Set<string>();
  const app = process.env.APP_URL?.replace(/\/+$/, '');
  if (app) out.add(app);
  out.add('https://app.tiktrends.co');
  return [...out];
}

/** Applique lecture publique + CORS sur le bucket (une fois les clés posées). Admin+. */
export async function configureBucketAction(): Promise<{ ok?: true; steps?: Array<{ label: string; ok: boolean; detail: string }>; error?: string }> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée.' };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Réservé aux administrateurs.' };
  const cfg = storageFromEnv();
  if (!cfg) return { error: 'Clés S3 absentes du serveur (.env.deploy).' };

  const origins = appOrigins();
  const steps: Array<{ label: string; ok: boolean; detail: string }> = [];
  try {
    const pol = await putBucketPublicRead(cfg);
    steps.push({ label: 'Lecture publique (bucket policy)', ok: pol.ok, detail: pol.ok ? 'OK' : `HTTP ${pol.status} · ${pol.detail}` });
    const cors = await putBucketCors(cfg, origins);
    steps.push({ label: `CORS (${origins.join(', ')})`, ok: cors.ok, detail: cors.ok ? 'OK' : `HTTP ${cors.status} · ${cors.detail}` });
    return { ok: true, steps };
  } catch (e) {
    return { error: (e as Error).message, steps };
  }
}

/** Test bout en bout du stockage (upload -> lecture publique -> suppression). Admin+. */
export async function testStorageAction(): Promise<{ put?: boolean; publicRead?: boolean; deleted?: boolean; error?: string }> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée.' };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Réservé aux administrateurs.' };
  const cfg = storageFromEnv();
  if (!cfg) return { error: 'Clés S3 absentes du serveur (.env.deploy).' };
  const r = await storageSelfTest(cfg);
  return { put: r.put, publicRead: r.publicRead, deleted: r.deleted, error: r.error };
}
