import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { presignGetUrl, presignPutUrl } from '../src/storage';

/**
 * Dépôt direct · le `Content-Type` est SIGNÉ dans l'adresse présignée. On ne
 * lit pas le code du signataire : on rejoue la vérification que fait le bucket
 * (SigV4 en paramètres d'URL, AWS et OVH) avec les en-têtes que le navigateur
 * enverrait. Le bon type passe, un autre type (HTML, SVG) ou son absence échoue.
 */
const cfg = { endpoint: 's3.gra.io.cloud.ovh.net', bucket: 'media', region: 'gra', accessKeyId: 'test-id', secretAccessKey: 'test-secret' };
const enc = (s: string) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const hmac = (k: Buffer | string, v: string) => createHmac('sha256', k).update(v).digest();

/** Ce que fait le bucket · recalcule la signature à partir des en-têtes REÇUS. */
function bucketAccepte(url: string, method: string, entetesRecus: Record<string, string>): boolean {
  const u = new URL(url);
  const p = Object.fromEntries(u.searchParams.entries());
  const signes = (p['X-Amz-SignedHeaders'] ?? '').split(';');
  const recus = Object.fromEntries(Object.entries({ ...entetesRecus, host: u.host }).map(([k, v]) => [k.toLowerCase(), v.trim()]));
  if (signes.some((h) => recus[h] === undefined)) return false;
  const query = Object.keys(p).filter((k) => k !== 'X-Amz-Signature').sort().map((k) => `${enc(k)}=${enc(p[k]!)}`).join('&');
  const canon = [method, u.pathname, query, signes.map((h) => `${h}:${recus[h]}`).join('\n') + '\n', signes.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const [, date, region, service] = (p['X-Amz-Credential'] ?? '').split('/');
  const aSigner = ['AWS4-HMAC-SHA256', p['X-Amz-Date'], `${date}/${region}/${service}/aws4_request`, createHash('sha256').update(canon).digest('hex')].join('\n');
  const cle = hmac(hmac(hmac(hmac('AWS4' + cfg.secretAccessKey, date!), region!), service!), 'aws4_request');
  return createHmac('sha256', cle).update(aSigner).digest('hex') === p['X-Amz-Signature'];
}

afterEach(() => { vi.useRealTimers(); });

describe('presignPutUrl · Content-Type signé', () => {
  it('les en-têtes signés nomment content-type, et le bucket n’accepte que le type retenu', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T10:00:00Z'));
    const { uploadUrl } = presignPutUrl(cfg, 'assets/ws-a/1-logo.png', 'image/png', 300);
    expect(new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(bucketAccepte(uploadUrl, 'PUT', { 'Content-Type': 'image/png' })).toBe(true);
    for (const autre of ['text/html', 'image/svg+xml', 'image/png; charset=utf-8', 'application/octet-stream']) {
      expect(bucketAccepte(uploadUrl, 'PUT', { 'Content-Type': autre }), autre).toBe(false);
    }
    expect(bucketAccepte(uploadUrl, 'PUT', {}), 'sans en-tête').toBe(false);
  });

  it('refuse de signer un type absent, mal formé ou paramétré', () => {
    for (const t of ['', 'image/png; charset=utf-8', 'IMAGE/PNG', 'image', 'text/html\nx-amz-acl: public-read', undefined as unknown as string]) {
      expect(() => presignPutUrl(cfg, 'assets/ws-a/x.png', t), String(t)).toThrow('Type de contenu invalide');
    }
  });

  it('la lecture signée reste sur host seul', () => {
    const get = presignGetUrl(cfg, 'assets/ws-a/x.png', 60);
    expect(new URL(get).searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(bucketAccepte(get, 'GET', {})).toBe(true);
  });
});
