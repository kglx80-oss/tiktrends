import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ErreurFournisseurCertaine, ErreurFournisseurIncertaine, idDepenseControleParole, reserveControleParoleMicros } from '@tiktrends/core';
import { TranscripteurFal, type DemandeTranscription } from '../src/transcription-fal';
import { BarriereDepenseStudio, DepenseRefusee, type PortDepense } from '../src/plafond-depense';

/**
 * Contrôle de la parole · le transcripteur RÉEL (Scribe v2 sur fal) contre un
 * FAUX serveur Scribe local (node:http, 127.0.0.1, `connection: 'close'`) ·
 * on compte les requêtes REÇUES, la seule mesure qui dise combien de fois on
 * aurait été facturé. Aucun réseau sortant, aucune clé réelle, 0 $.
 *
 * Forme des réponses : page fal du modèle relevée le 16/11 (`text`,
 * `language_code`, `words: [{ text, start, end, type, speaker_id }]`, temps en
 * secondes), écrite à la main · jamais capturée (fal est bloqué depuis la session).
 */

const CLE = 'cle-fal-de-test:secret-0123456789';
const JOB = '0b8a7e8e-5b2c-4f0e-9d5e-4b1c2a3d4e5f';
const ESPACE = '11111111-2222-4333-8444-555555555555';

type Comportement = { type: 'ok'; corps: unknown } | { type: 'statut'; statut: number } | { type: 'coupure' };
let comportement: Comportement = { type: 'coupure' };
let recus: Array<{ entetes: Record<string, unknown>; corps: unknown; url: string }> = [];
let srv: Server;
let url = '';

const REPONSE_SCRIBE = {
  text: 'Un shampooing sans sulfate.',
  language_code: 'fra',
  language_probability: 0.99,
  words: [
    { text: 'Un', start: 0.12, end: 0.3, type: 'word', speaker_id: 'speaker_0' },
    { text: ' ', start: 0.3, end: 0.32, type: 'spacing', speaker_id: 'speaker_0' },
    { text: 'shampooing', start: 0.32, end: 0.9, type: 'word', speaker_id: 'speaker_0' },
    { text: ' ', start: 0.9, end: 0.95, type: 'spacing', speaker_id: 'speaker_0' },
    { text: 'sans', start: 0.95, end: 1.2, type: 'word', speaker_id: 'speaker_0' },
    { text: ' ', start: 1.2, end: 1.22, type: 'spacing', speaker_id: 'speaker_0' },
    { text: 'sulfate.', start: 1.22, end: 1.8, type: 'word', speaker_id: 'speaker_0' },
  ],
};

beforeAll(async () => {
  srv = createServer((req: IncomingMessage, res: ServerResponse) => {
    const morceaux: Buffer[] = [];
    req.on('data', (b: Buffer) => morceaux.push(b));
    req.on('end', () => {
      let corps: unknown = null;
      try { corps = JSON.parse(Buffer.concat(morceaux).toString('utf8')); } catch { corps = null; }
      recus.push({ entetes: req.headers, corps, url: req.url ?? '' });
      const c = comportement;
      if (c.type === 'coupure') { req.socket.destroy(); return; }
      if (c.type === 'statut') {
        res.writeHead(c.statut, { connection: 'close', 'content-type': 'application/json' });
        res.end(JSON.stringify({ detail: `statut simulé ${c.statut}` }));
        return;
      }
      res.writeHead(200, { connection: 'close', 'content-type': 'application/json' });
      res.end(typeof c.corps === 'string' ? c.corps : JSON.stringify(c.corps));
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/fal-ai/elevenlabs/speech-to-text/scribe-v2`;
});
afterAll(() => new Promise<void>((r) => { srv.closeAllConnections?.(); srv.close(() => r()); }));

class PortMemoire implements PortDepense {
  lignes = new Map<string, { usd: number; actual: number; model: string | null; action: string }>();
  depenseExterne = 0;
  async reserver(l: Parameters<PortDepense['reserver']>[0], o: Parameters<PortDepense['reserver']>[1]) {
    if (this.lignes.has(l.id)) return { ok: false as const, raison: 'déjà engagée', dejaEngagee: true };
    const depense = this.depenseExterne + [...this.lignes.values()].reduce((s, x) => s + x.actual, 0);
    const d = o.decider(depense);
    if (!d.allowed) return { ok: false as const, raison: d.reason, dejaEngagee: false };
    this.lignes.set(l.id, { usd: l.usd, actual: l.usd, model: l.model, action: l.action });
    return { ok: true as const, depenseAvantUsd: depense };
  }
  async annuler(id: string) { const x = this.lignes.get(id); if (!x || x.actual === 0) return false; x.actual = 0; return true; }
}

let port: PortMemoire;
beforeEach(() => { port = new PortMemoire(); recus = []; comportement = { type: 'coupure' }; });

const transcripteur = (o: { cap?: string; url?: string } = {}) => new TranscripteurFal({
  apiKey: CLE, fetch, url: o.url ?? url,
  barriere: new BarriereDepenseStudio({ port, env: { AI_SPEND_CAP_USD: o.cap ?? '10' } }),
});
const demande = (o: Partial<DemandeTranscription> = {}): DemandeTranscription => ({
  workspaceId: ESPACE, jobId: JOB, operation: 'clip:s1', essai: 1, audioUrl: 'https://stockage.test/prise.mp4?signature=x', dureeMs: 5000, approuveUsdMicros: 10_000, ...o,
});
const ligne = (essai = 1) => port.lignes.get(idDepenseControleParole(JOB, 'clip:s1', essai));
async function erreurDe(p: Promise<unknown>): Promise<Error> {
  try { await p; } catch (e) { return e as Error; }
  throw new Error('aucune erreur levée');
}

describe('réserve et devis de la transcription', () => {
  it('durée × 0,008 $/min, arrondie au cent supérieur', () => {
    expect(reserveControleParoleMicros(5_000)).toBe(10_000);
    expect(reserveControleParoleMicros(60_000)).toBe(10_000);
    expect(reserveControleParoleMicros(75_001)).toBe(20_000);
    expect(reserveControleParoleMicros(90_000)).toBe(20_000);
    expect(reserveControleParoleMicros(0)).toBeNull();
    expect(reserveControleParoleMicros(90_001)).toBeNull();
    expect(reserveControleParoleMicros(Number.NaN)).toBeNull();
  });
});

describe('transcription · sous la barrière, une seule requête', () => {
  it('acceptée : POST au modèle avec la clé, corps attendu, mots horodatés en ms, réserve de 0,01 $ gardée', async () => {
    comportement = { type: 'ok', corps: REPONSE_SCRIBE };
    const r = await transcripteur().transcrire(demande());
    expect(recus).toHaveLength(1);
    expect(recus[0]!.url).toBe('/fal-ai/elevenlabs/speech-to-text/scribe-v2');
    expect(recus[0]!.entetes.authorization).toBe(`Key ${CLE}`);
    expect(recus[0]!.entetes.connection).toBeDefined();
    expect(recus[0]!.corps).toEqual({ audio_url: 'https://stockage.test/prise.mp4?signature=x', language_code: 'fra', tag_audio_events: false, diarize: false });
    expect(r.reserveUsdMicros).toBe(10_000);
    expect(r.transcription.texte).toBe('Un shampooing sans sulfate.');
    expect(r.transcription.mots).toEqual([
      { texte: 'Un', debutMs: 120, finMs: 300 }, { texte: 'shampooing', debutMs: 320, finMs: 900 },
      { texte: 'sans', debutMs: 950, finMs: 1200 }, { texte: 'sulfate.', debutMs: 1220, finMs: 1800 },
    ]);
    expect(ligne()).toMatchObject({ usd: 0.01, actual: 0.01, model: 'fal_transcription', action: 'studio.generation' });
  });

  it('la même prise au même essai ne se transcrit pas deux fois · aucune seconde requête, issue incertaine', async () => {
    comportement = { type: 'ok', corps: REPONSE_SCRIBE };
    await transcripteur().transcrire(demande());
    const e = await erreurDe(transcripteur().transcrire(demande()));
    expect(e).toBeInstanceOf(ErreurFournisseurIncertaine);
    expect((e as { dejaEngagee?: boolean }).dejaEngagee).toBe(true);
    expect(recus).toHaveLength(1);
    // La reprise (essai 2) a sa propre ligne.
    await transcripteur().transcrire(demande({ essai: 2 }));
    expect(recus).toHaveLength(2);
    expect(ligne(2)?.actual).toBe(0.01);
  });

  it('réserve au-delà de la ligne approuvée ⇒ refus certain AVANT tout appel, aucune dépense', async () => {
    comportement = { type: 'ok', corps: REPONSE_SCRIBE };
    const e = await erreurDe(transcripteur().transcrire(demande({ dureeMs: 80_000, approuveUsdMicros: 10_000 })));
    expect(e).toBeInstanceOf(ErreurFournisseurCertaine);
    expect(e.message).toMatch(/au-delà de la ligne approuvée/);
    expect(recus).toHaveLength(0);
    expect(port.lignes.size).toBe(0);
  });

  it('plafond atteint ⇒ refus de la barrière, 0 requête', async () => {
    port.depenseExterne = 10;
    comportement = { type: 'ok', corps: REPONSE_SCRIBE };
    const e = await erreurDe(transcripteur().transcrire(demande()));
    expect(e).toBeInstanceOf(DepenseRefusee);
    expect(recus).toHaveLength(0);
  });

  it('erreur passagère (429, 503) ⇒ certaine ET marquée passagère (retentée par le worker) ; 422 ne l’est pas', async () => {
    for (const statut of [429, 503]) {
      port = new PortMemoire();
      comportement = { type: 'statut', statut };
      const e = await erreurDe(transcripteur().transcrire(demande()));
      expect(e).toBeInstanceOf(ErreurFournisseurCertaine);
      expect((e as { passagere?: boolean }).passagere, `HTTP ${statut}`).toBe(true);
    }
    comportement = { type: 'statut', statut: 422 };
    port = new PortMemoire();
    expect((await erreurDe(transcripteur().transcrire(demande())) as { passagere?: boolean }).passagere).toBeUndefined();
  });

  it('essai hors borne (0, 4) ⇒ refus avant tout appel', async () => {
    for (const essai of [0, 4]) expect(await erreurDe(transcripteur().transcrire(demande({ essai })))).toBeInstanceOf(ErreurFournisseurCertaine);
    expect(recus).toHaveLength(0);
  });

  it('refus du modèle (422) ⇒ certain, réserve rendue', async () => {
    comportement = { type: 'statut', statut: 422 };
    const e = await erreurDe(transcripteur().transcrire(demande()));
    expect(e).toBeInstanceOf(ErreurFournisseurCertaine);
    expect(e.message).toMatch(/HTTP 422/);
    expect(recus).toHaveLength(1);
    expect(ligne()?.actual).toBe(0);
  });

  it.each([
    ['502 d’un intermédiaire', { type: 'statut', statut: 502 } as Comportement, /HTTP 502/],
    ['connexion coupée après envoi', { type: 'coupure' } as Comportement, /perdue après envoi/],
    ['réponse 2xx sans mots', { type: 'ok', corps: { text: 'Bonjour' } } as Comportement, /sans liste de mots/],
    ['réponse 2xx mal horodatée', { type: 'ok', corps: { words: [{ text: 'Un', start: 2, end: 1, type: 'word' }] } } as Comportement, /mal horodaté/],
    ['réponse 2xx coupée', { type: 'ok', corps: '{"words": [' } as Comportement, /coupée ou illisible/],
  ])('%s ⇒ incertain, réserve gardée', async (_, c, motif) => {
    comportement = c;
    const e = await erreurDe(transcripteur().transcrire(demande()));
    expect(e).toBeInstanceOf(ErreurFournisseurIncertaine);
    expect(e.message).toMatch(motif);
    expect(ligne()?.actual).toBe(0.01);
    expect(e.message).not.toContain(CLE);
  });

  it('serveur injoignable (connexion refusée) ⇒ certain, réserve rendue', async () => {
    // Un port libre, fermé aussitôt · personne n'y écoute.
    const libre = createServer();
    await new Promise<void>((r) => libre.listen(0, '127.0.0.1', () => r()));
    const p = (libre.address() as AddressInfo).port;
    await new Promise<void>((r) => libre.close(() => r()));
    const e = await erreurDe(transcripteur({ url: `http://127.0.0.1:${p}/scribe` }).transcrire(demande()));
    expect(e).toBeInstanceOf(ErreurFournisseurCertaine);
    expect(ligne()?.actual).toBe(0);
  });

  it('clé de simulation ou barrière absente ⇒ refus à la construction', () => {
    expect(() => new TranscripteurFal({ apiKey: 'simule-local', fetch, barriere: new BarriereDepenseStudio({ port }) })).toThrow(/simulation/);
    expect(() => new TranscripteurFal({ apiKey: CLE, fetch, barriere: undefined as never })).toThrow(/barrière/);
  });
});
