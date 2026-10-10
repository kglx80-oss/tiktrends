import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FICHIER_JOURNAL, FICHIER_REGISTRE, bilanRegistre, ecrireRegistre, engagerEssai, lireRegistre, registreVierge, type LectureBase, type PointsSuspension } from '../scripts/recette/registre';
import { COMMANDE_DEVERROUILLER, FICHIER_VERROU, sousVerrou } from '../scripts/recette/verrou';
import { deverrouiller } from '../scripts/recette/deverrouiller';

/**
 * E4 (contre-recette Codex sur 150c17c, P1) · « Un verrou âgé de 30 s est
 * reprenable même si le détenteur peut encore reprendre. A suspendu après
 * confirmer(), B reprend le verrou et écrit son engagement, A reprend puis
 * renomme son ancien registre : engagement B perdu. »
 *
 * Scénario DÉTERMINISTE (aucun hasard de timing) : A est SUSPENDU par un
 * point injecté (après sa confirmation du verrou, puis juste avant la
 * publication) ; B part avec une horloge avancée de dix minutes (bien
 * au-delà des 30 s d'autrefois), puis se termine ; A est repris. On lit le
 * RÉSULTAT sur disque : chaque engagement accepté est toujours au registre,
 * et le total engagé reste ≤ 15 $.
 *
 * Puis `recette:budget:deverrouiller` · le seul chemin de récupération d'un
 * verrou dont la mort du détenteur ne peut pas être établie.
 */

const dossiers: string[] = [];
const nouveau = () => { const d = mkdtempSync(join(tmpdir(), 'e4-verrou-')); dossiers.push(d); return d; };
afterAll(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });

const lecture = (base: string): LectureBase => ({ lignes: [], base, depenseFenetreUsd: 0 });
const registreSurDisque = (d: string) => lireRegistre(readFileSync(join(d, FICHIER_REGISTRE), 'utf8'))!;
const SIX = 6_000_000;

/** Un point de suspension · `arrive` se résout quand A y est, `reprendre()` le relâche. */
function suspension() {
  let signaler!: () => void;
  let liberer!: () => void;
  const arrive = new Promise<void>((ok) => { signaler = ok; });
  const porte = new Promise<void>((ok) => { liberer = ok; });
  return { arrive, reprendre: () => liberer(), point: async () => { signaler(); await porte; } };
}

describe('E4 · A suspendu sous verrou, horloge avancée, B lancé et terminé, A repris', () => {
  it.each(['apresConfirmation', 'avantPublication'] as const)('suspension « %s » ⇒ B n’obtient pas le verrou ; aucun engagement accepté ne disparaît ; total ≤ 15 $', async (point) => {
    const d = nouveau();
    await sousVerrou(d, (v) => ecrireRegistre(d, registreVierge(new Date('2026-10-09T09:00:00Z')), v));
    const s = suspension();
    const points: PointsSuspension = { [point]: s.point };
    const acceptes: string[] = [];

    // A · engage 6 $ et se fige APRÈS avoir confirmé qu'il tient le verrou.
    const a = engagerEssai(d, { commande: 'A', reservationMicros: SIX, lu: lecture('base-a@1'), id: 'A', suspension: points });
    await s.arrive;

    // B · une autre base, horloge à +10 min · ni âge ni horloge ne lui donnent le verrou d'un détenteur vivant.
    const b = await engagerEssai(d, { commande: 'B', reservationMicros: SIX, lu: lecture('base-b@2'), id: 'B', maintenant: new Date(Date.now() + 10 * 60_000), attenteVerrouMs: 300 })
      .catch((e: unknown) => ({ ok: false as const, raison: (e as Error).message }));
    if (b.ok) acceptes.push(b.engagement.id);

    // A est repris et publie.
    s.reprendre();
    const ra = await a;
    expect(ra.ok).toBe(true);
    if (ra.ok) acceptes.push(ra.engagement.id);

    const reg = registreSurDisque(d);
    expect(acceptes.filter((id) => !reg.engagements[id]), 'un engagement ACCEPTÉ a disparu du registre (verrou repris sur son âge ?)').toEqual([]);
    expect(b.ok, 'B a pris le verrou d’un détenteur vivant et suspendu').toBe(false);
    if (!b.ok) expect(b.raison).toContain(`Registre du budget d’essai verrouillé par le processus ${process.pid}`);

    // B relancé après A ⇒ accepté (6 + 6 ≤ 15) et présent ; C (6 de plus) ⇒ refusé : 18 > 15.
    const b2 = await engagerEssai(d, { commande: 'B', reservationMicros: SIX, lu: lecture('base-b@2'), id: 'B2' });
    expect(b2.ok).toBe(true);
    const c = await engagerEssai(d, { commande: 'C', reservationMicros: SIX, lu: lecture('base-c@3'), id: 'C' });
    expect(c.ok).toBe(false);
    const fin = registreSurDisque(d);
    expect(Object.keys(fin.engagements).sort()).toEqual(['A', 'B2']);
    const bilan = bilanRegistre(fin);
    expect(bilan.anterieuresMicros + bilan.regleMicros + bilan.incertainMicros).toBeLessThanOrEqual(15_000_000);
    expect(existsSync(join(d, FICHIER_VERROU)), 'verrou laissé derrière').toBe(false);
  });
});

/* ───────────────────── recette:budget:deverrouiller ───────────────────── */

const ENV = {
  TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15',
  DATABASE_URL: 'postgres://recette:mdp-e4@127.0.0.1:5432/tiktrends_recette',
};
const boot = (() => { try { return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); } catch { return 'inconnu'; } })();
const pidns = (() => { try { return readlinkSync('/proc/self/ns/pid'); } catch { return 'inconnu'; } })();
const poser = (d: string, c: Record<string, unknown>) => writeFileSync(join(d, FICHIER_VERROU), JSON.stringify({ jeton: 'jeton-du-verrou', hote: hostname(), demarrage: boot, pidns, le: '2026-10-09T09:00:00.000Z', ...c }));
const autreConteneur = { pid: 7, pidns: 'pid:[4026599999]' };
const lu = (d: string, f: string) => (existsSync(join(d, f)) ? readFileSync(join(d, f), 'utf8') : null);
const aucune = async () => 0;

describe('E4 · recette:budget:deverrouiller · retrait seulement après arrêt vérifié', () => {
  it('détenteur VIVANT sondé ici ⇒ refus, verrou intact, même avec le bon jeton', async () => {
    const d = nouveau();
    poser(d, { pid: process.pid });
    const r = await deverrouiller(ENV, ['--confirmer-arret', 'jeton-du-verrou'], { dossier: d, autresCommandes: aucune });
    expect(r.code, 'verrou retiré à un détenteur VIVANT').toBe(2);
    // Linux (conteneur de recette) : le vivant est sondé. Hors Linux (macOS natif, contre-recette ee9c3c9) :
    // l'identité est illisible et le geste est refusé comme plateforme non prise en charge. Le refus et le verrou
    // intact sont exigés PARTOUT ; seule la phrase dépend de la plateforme.
    expect(r.texte).toContain(boot === 'inconnu' || pidns === 'inconnu' ? 'REFUS · plateforme non prise en charge' : 'REFUS · son détenteur est VIVANT');
    expect(JSON.parse(lu(d, FICHIER_VERROU)!).jeton).toBe('jeton-du-verrou');
  });

  it('contre-recette ee9c3c9 · plateforme sans /proc (macOS natif) : détenteur VIVANT, bon jeton, aucune autre commande ⇒ REFUS explicite, verrou intact', async () => {
    const d = nouveau();
    // Ce que voit macOS : le verrou d'un processus vivant porte un démarrage et un espace de PID « inconnu ».
    poser(d, { pid: process.pid, demarrage: 'inconnu', pidns: 'inconnu' });
    const r = await deverrouiller(ENV, ['--confirmer-arret', 'jeton-du-verrou'], { dossier: d, autresCommandes: aucune, ici: { hote: hostname(), demarrage: 'inconnu', pidns: 'inconnu' } });
    expect(r.code, 'verrou retiré à un détenteur vivant sur une plateforme non sondable').toBe(2);
    expect(r.texte).toContain('REFUS · plateforme non prise en charge');
    expect(JSON.parse(lu(d, FICHIER_VERROU)!).jeton).toBe('jeton-du-verrou');
  });

  it('autre conteneur, sans confirmation ⇒ dit qui le tient, comment vérifier, et le jeton à recopier · rien retiré', async () => {
    const d = nouveau();
    poser(d, autreConteneur);
    const r = await deverrouiller(ENV, [], { dossier: d, autresCommandes: aucune });
    expect(r.code).toBe(2);
    expect(r.texte).toContain('tenu par : processus 7');
    expect(r.texte).toContain('le verrou n’est JAMAIS repris sur son âge');
    expect(r.texte).toContain('docker ps --filter label=com.docker.compose.project=tiktrends-recette');
    expect(r.texte).toContain(`${COMMANDE_DEVERROUILLER} -- --confirmer-arret jeton-du-verrou`);
    expect(r.texte).toContain('Rien n’a été retiré.');
    expect(lu(d, FICHIER_VERROU)).not.toBeNull();
  });

  it('autres commandes de recette encore connectées à la base ⇒ refus, même avec le bon jeton', async () => {
    const d = nouveau();
    poser(d, autreConteneur);
    const r = await deverrouiller(ENV, ['--confirmer-arret', 'jeton-du-verrou'], { dossier: d, autresCommandes: async () => 1 });
    expect(r.code).toBe(2);
    expect(r.texte).toContain('REFUS · 1 autre(s) commande(s) de recette encore connectée(s)');
    expect(lu(d, FICHIER_VERROU)).not.toBeNull();
  });

  it('jeton d’un AUTRE verrou (il a changé depuis la vérification) ⇒ refus', async () => {
    const d = nouveau();
    poser(d, { ...autreConteneur, jeton: 'nouveau-verrou' });
    const r = await deverrouiller(ENV, ['--confirmer-arret', 'jeton-du-verrou'], { dossier: d, autresCommandes: aucune });
    expect(r.code, 'verrou retiré sur la confirmation d’un AUTRE verrou').toBe(2);
    expect(r.texte).toContain('la confirmation ne correspond pas au verrou ACTUEL (jeton nouveau-verrou)');
    expect(JSON.parse(lu(d, FICHIER_VERROU)!).jeton).toBe('nouveau-verrou');
  });

  it('bon jeton, aucune commande connectée ⇒ retiré, noté au journal, registre intact ; la commande suivante prend le verrou', async () => {
    const d = nouveau();
    await sousVerrou(d, (v) => ecrireRegistre(d, registreVierge(new Date('2026-10-09T09:00:00Z')), v));
    poser(d, autreConteneur);
    writeFileSync(join(d, `${FICHIER_VERROU}.reprise-vieux`), '');
    const avant = lu(d, FICHIER_REGISTRE);
    const r = await deverrouiller(ENV, ['--confirmer-arret', 'jeton-du-verrou'], { dossier: d, autresCommandes: aucune, maintenant: new Date('2026-10-09T10:00:00Z') });
    expect(r.code, r.texte).toBe(0);
    expect(lu(d, FICHIER_VERROU)).toBeNull();
    expect(lu(d, `${FICHIER_VERROU}.reprise-vieux`)).toBeNull();
    expect(lu(d, FICHIER_REGISTRE), 'le déverrouillage a touché au registre').toBe(avant);
    const journal = lu(d, FICHIER_JOURNAL)!.trim().split('\n').map((l) => JSON.parse(l) as { type: string; jeton: string });
    expect(journal.map((j) => [j.type, j.jeton])).toEqual([['deverrouillage', 'jeton-du-verrou']]);
    const e = await engagerEssai(d, { commande: 'apres', reservationMicros: 1_000_000, lu: lecture('base@1'), attenteVerrouMs: 300 });
    expect(e.ok).toBe(true);
  });

  it('détenteur MORT dans le même espace de PID ⇒ le déverrouillage n’est même pas nécessaire : la commande suivante le reprend seule', async () => {
    if (pidns === 'inconnu' || boot === 'inconnu') return;
    const d = nouveau();
    const mort = spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid!;
    poser(d, { pid: mort });
    const e = await engagerEssai(d, { commande: 'apres', reservationMicros: 1_000_000, lu: lecture('base@1'), attenteVerrouMs: 2_000 });
    expect(e.ok).toBe(true);
  });
});
