import { describe, it, expect, afterEach, vi } from 'vitest';
import { isPrivateAddress, assertPublicUrl, safeFetch } from '../src/safe-fetch';

describe('adresses non routables', () => {
  const privees = [
    '127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '169.254.169.254',           // métadonnées cloud
    '100.64.0.1',                                // CGNAT
    '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12::3', 'ff02::1',
    '::ffff:127.0.0.1',                          // IPv4 encapsulée
    'pas-une-ip',
  ];
  for (const ip of privees) {
    it(`refuse ${ip}`, () => expect(isPrivateAddress(ip)).toBe(true));
  }

  const publiques = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '2001:4860:4860::8888'];
  for (const ip of publiques) {
    it(`accepte ${ip}`, () => expect(isPrivateAddress(ip)).toBe(false));
  }
});

describe('validation d’URL', () => {
  it('refuse les schémas non web', async () => {
    expect(await assertPublicUrl('file:///etc/passwd')).toBeNull();
    expect(await assertPublicUrl('gopher://evil/')).toBeNull();
    expect(await assertPublicUrl('pas une url')).toBeNull();
  });

  it('refuse une IP interne littérale, sans résolution DNS', async () => {
    expect(await assertPublicUrl('http://127.0.0.1/admin')).toBeNull();
    expect(await assertPublicUrl('http://169.254.169.254/latest/meta-data/')).toBeNull();
    expect(await assertPublicUrl('http://[::1]:80/')).toBeNull();
  });

  it('refuse un port qui n’est pas du web (Postgres, Redis…)', async () => {
    expect(await assertPublicUrl('http://8.8.8.8:5432/')).toBeNull();
    expect(await assertPublicUrl('http://8.8.8.8:6379/')).toBeNull();
  });

  it('accepte une IP publique sur un port web', async () => {
    expect(await assertPublicUrl('https://8.8.8.8/x.png')).not.toBeNull();
  });
});

describe('safeFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  const rep = (body: string, headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/plain', ...headers } });

  it('suit une redirection vers un hôte public', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: URL) => {
      calls.push(u.toString());
      if (calls.length === 1) return new Response(null, { status: 302, headers: { location: 'https://1.1.1.1/final' } });
      return rep('ok');
    }));
    const r = await safeFetch('https://8.8.8.8/start');
    expect(r?.body.toString()).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  it('bloque une redirection vers une adresse interne', async () => {
    // C’est le cas qui rend un contrôle « à l’entrée seulement » inutile :
    // l’hôte est public, mais il renvoie un 302 vers la boucle locale.
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8080/secret' } }));
    vi.stubGlobal('fetch', f);
    expect(await safeFetch('https://8.8.8.8/start')).toBeNull();
    expect(f).toHaveBeenCalledTimes(1); // la cible interne n’est jamais appelée
  });

  it('s’arrête après trop de redirections', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://8.8.8.8/loop' } })));
    expect(await safeFetch('https://8.8.8.8/loop')).toBeNull();
  });

  it('refuse un corps annoncé trop gros', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => rep('x', { 'content-length': '99999999' })));
    expect(await safeFetch('https://8.8.8.8/big', { maxBytes: 1000 })).toBeNull();
  });

  it('refuse un corps réellement trop gros malgré un content-length menteur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => rep('x'.repeat(5000), { 'content-length': '10' })));
    expect(await safeFetch('https://8.8.8.8/menteur', { maxBytes: 1000 })).toBeNull();
  });

  it('renvoie null au lieu de lever si le réseau tombe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await safeFetch('https://8.8.8.8/x')).toBeNull();
  });
});
