import { describe, expect, it } from 'vitest';
import {
  ACTIONS_AUDIT, ACTIONS_SENSIBLES, ACTION_RAPPROCHEMENT_DEPENSE, DUREE_TACHE_PIRE_CAS_MS, ETATS_JOB, IMAGE_MODELS, LONGUEUR_MAX_DETAILS_AUDIT,
  LONGUEUR_MAX_ERREUR_TACHE, LONGUEUR_MAX_TEXTE_INCIDENT, LONGUEUR_MAX_TITRE_INCIDENT, OPERATION_JOB_STUDIO, PHASES_DUREE_TACHE, PHRASE_ACTION_NON_CLASSEE,
  SEUIL_TACHE_BLOQUEE_MIN, acteurAudit, cellulesRegistreAudit, cellulesTacheAdmin, cibleAudit, classeActionAudit, coutEngageTache, dansRegistrePlateforme,
  detailsAudit, erreurTache, incidentDepuisTache, libelleOperationJob, ligneTacheAdmin, segmentTache, tableRegistreAudit, tableTachesAdmin, tacheBloquee,
  type EvenementAuditLu, type TacheLue,
} from '../src';

/**
 * Suivi opérationnel · tâches de génération (JB01) et registre d'audit (AR06)
 * · les règles pures, contre une horloge INJECTÉE (jamais `Date.now()`).
 */
const T0 = new Date('2026-03-02T10:00:00.000Z');
const MIN = 60_000;
const avant = (ms: number) => new Date(T0.getTime() - ms);
const tache = (o: Partial<TacheLue> = {}): TacheLue => ({
  id: '11111111-2222-4333-8444-555555555555', operation: OPERATION_JOB_STUDIO, etat: 'completed', lignes: [{ operation: 'keyframe:s1' }],
  projet: 'Sérum éclat', espace: 'Maison Éclat', creeLe: avant(5 * MIN), erreur: null, registre: [], ...o,
});

describe('le seuil « bloquée » · dérivé des délais du worker, écrit dans le module', () => {
  it('le pire cumul des phases vaut 1 132 s, le seuil retenu (30 min) le couvre avec marge', () => {
    expect(PHASES_DUREE_TACHE.map((p) => p.ms)).toEqual([2_000, 60_000, 30_000, 300_000, 20_000, 720_000]);
    expect(DUREE_TACHE_PIRE_CAS_MS).toBe(1_132_000);
    // Le délai du fournisseur est LU dans le catalogue (le plus long), jamais recopié.
    expect(PHASES_DUREE_TACHE[3]!.ms).toBe(Math.max(...IMAGE_MODELS.map((m) => m.timeoutMs ?? 0)));
    expect(SEUIL_TACHE_BLOQUEE_MIN * MIN, 'le seuil « bloquée » ne couvre plus 1,5 fois le pire cumul des délais du worker').toBeGreaterThanOrEqual(1.5 * DUREE_TACHE_PIRE_CAS_MS);
  });

  it('active au-delà de 30 min · bloquée · à 30 min pile ou en deçà · en cours · terminée, jamais bloquée', () => {
    for (const etat of ['queued', 'claimed', 'running', 'persisting', 'cancel_requested']) {
      expect(tacheBloquee({ etat, creeLe: avant(30 * MIN + 1) }, T0), `${etat} au-delà`).toBe(true);
      expect(tacheBloquee({ etat, creeLe: avant(30 * MIN) }, T0), `${etat} à 30 min pile`).toBe(false);
      expect(segmentTache({ etat, creeLe: avant(30 * MIN + 1) }, T0)).toBe('bloquees');
      expect(segmentTache({ etat, creeLe: avant(29 * MIN) }, T0)).toBe('en-cours');
    }
    for (const etat of ['completed', 'failed', 'cancelled', 'reconciliation_required']) expect(tacheBloquee({ etat, creeLe: avant(3 * 86_400_000) }, T0), etat).toBe(false);
    expect(['completed', 'failed', 'cancelled', 'reconciliation_required'].map((etat) => segmentTache({ etat, creeLe: avant(MIN) }, T0))).toEqual(['terminees', 'echec', 'annulees', 'rapprochement']);
    expect(segmentTache({ etat: 'etat_inconnu', creeLe: avant(MIN) }, T0)).toBeNull();
    // Chaque état réel tombe dans un segment.
    expect(ETATS_JOB.filter((etat) => segmentTache({ etat, creeLe: avant(MIN) }, T0) === null)).toEqual([]);
  });
});

describe('une ligne de tâche · libellé jamais brut, coût lu, erreur bornée et sans fuite', () => {
  it('« studio.generation » ne s’affiche jamais · la tâche se dit « Génération » et ce qu’elle produit', () => {
    expect(libelleOperationJob(OPERATION_JOB_STUDIO)).toBe('Génération');
    const l = ligneTacheAdmin(tache({ lignes: [{ operation: 'keyframe:s1' }, { operation: 'controle:vision' }] }), T0);
    expect(l.tache).toBe('Génération · Image, Contrôle visuel');
    expect(cellulesTacheAdmin(l).join(' ')).not.toContain(OPERATION_JOB_STUDIO);
    expect(ligneTacheAdmin(tache({ operation: 'code_inconnu_xyz' }), T0).tache).toBe('Tâche');
  });

  it('coût engagé · réglé, sinon réservé, sinon rendu · lu au registre', () => {
    expect(coutEngageTache([])).toBe('n.c.');
    expect(coutEngageTache([{ kind: 'reserve', credits: 8, usdMicros: 80_000 }])).toBe('Réservé · 0,080 $ · 8 crédits');
    expect(coutEngageTache([{ kind: 'reserve', credits: 8, usdMicros: 80_000 }, { kind: 'settle', credits: 8, usdMicros: 60_000 }])).toBe('Réglé · 0,060 $ · 8 crédits');
    expect(coutEngageTache([{ kind: 'reserve', credits: 8, usdMicros: 80_000 }, { kind: 'release', credits: 8, usdMicros: 80_000 }])).toBe('Rendu · rien de réglé');
  });

  it('dernière erreur · motif du worker, sans secret, sans adresse, sans lien ni clé du stockage, bornée', () => {
    const e = erreurTache({ issue: 'facture_sans_livrable', motif: 'résultat introuvable · https://adresse-brute.stockage.test/tt/assets/ws1/a.png · clé sk-ant-api03-SECRETSECRET · écrire à ops@exemple.invalid · assets/1234abcd/sortie.png' });
    expect(e).toContain('résultat introuvable');
    for (const f of ['adresse-brute.stockage.test', 'SECRETSECRET', 'ops@exemple.invalid', 'assets/1234abcd']) expect(e, f).not.toContain(f);
    expect(e).toContain('[lien masqué]');
    expect(e).toContain('[fichier masqué]');
    const long = erreurTache({ code: 'PERSISTENCE_FAILED', motif: 'x'.repeat(900) })!;
    expect(long).toHaveLength(LONGUEUR_MAX_ERREUR_TACHE);
    expect(long.endsWith('…')).toBe(true);
    expect(erreurTache(null)).toBeNull();
    expect(erreurTache({ code: 'PERSISTENCE_FAILED' })).toBe('PERSISTENCE_FAILED');
  });

  it('incident pré-rempli · titre et constat bornés, sans lien ni adresse', () => {
    const l = ligneTacheAdmin(tache({ etat: 'failed', espace: 'x'.repeat(300), erreur: { motif: 'voir https://fal.example/req/9' } }), T0);
    const i = incidentDepuisTache(l);
    expect(i.titre.length).toBeLessThanOrEqual(LONGUEUR_MAX_TITRE_INCIDENT);
    expect(i.constat.length).toBeLessThanOrEqual(LONGUEUR_MAX_TEXTE_INCIDENT);
    expect(i.titre.startsWith('Tâche en échec · Génération · Image')).toBe(true);
    expect(i.constat).toContain(l.id);
    expect(i.constat).not.toContain('fal.example');
    expect(l.declarer).toBe(true);
  });
});

describe('la table des tâches · segments comptés, recherche pliée, page', () => {
  it('segments et recherche · « eclat » trouve « Maison Éclat », chaque mot requis', () => {
    const taches = [
      tache({ id: 'a', etat: 'failed' }), tache({ id: 'b', etat: 'running', creeLe: avant(45 * MIN), espace: 'ATELIER BRUME' }),
      tache({ id: 'c', etat: 'running', creeLe: avant(10 * MIN) }), tache({ id: 'd', etat: 'reconciliation_required' }),
    ];
    const t = tableTachesAdmin(taches, T0, {});
    expect(Object.fromEntries(t.segments.map((s) => [s.cle, s.n]))).toEqual({ tous: 4, echec: 1, bloquees: 1, 'en-cours': 1, rapprochement: 1, annulees: 0, terminees: 0 });
    expect(tableTachesAdmin(taches, T0, { segment: 'bloquees' }).filtrees.map((l) => l.id)).toEqual(['b']);
    expect(tableTachesAdmin(taches, T0, { q: 'BRUME' }).filtrees.map((l) => l.id)).toEqual(['b']);
    expect(tableTachesAdmin(taches, T0, { q: 'eclat echec' }).filtrees.map((l) => l.id)).toEqual(['a']);
    expect(tableTachesAdmin(taches, T0, { segment: 'inconnu' }).segment).toBe('tous');
    expect(tableTachesAdmin(Array.from({ length: 120 }, (_, i) => tache({ id: String(i) })), T0, { page: 3 }).page.lignes).toHaveLength(20);
  });
});

describe('le registre d’audit · liste fermée, portée, cellules sans fuite', () => {
  it('la liste FERMÉE des actions sensibles · exactement celles-ci', () => {
    expect([...ACTIONS_SENSIBLES].sort()).toEqual([
      'asset.set_rights', 'depense.rapprochement', 'equipe.membre.retire', 'equipe.membre.role', 'prompt.benchmark.approuver', 'prompt.benchmark.approuver_budget',
      'prompt.recette_manuelle.approuver', 'prompt.release.publier', 'prompt.release.retirer', 'prompt.release.revoquer', 'prompt.release.rollback',
      'studios.budget_essai', 'studios.interrupteurs',
    ]);
    for (const a of ACTIONS_SENSIBLES) expect(ACTIONS_AUDIT[a]!.raison, a).toBeTruthy();
    expect(ACTIONS_SENSIBLES).toContain(ACTION_RAPPROCHEMENT_DEPENSE);
  });

  it('classe · exacte, puis la famille · une action non classée se dit sans inventer', () => {
    expect(classeActionAudit('job.completed')!.phrase).toBe('a fait avancer une génération');
    expect(classeActionAudit('job.enqueue')!.phrase).toBe('a lancé une génération');
    expect(classeActionAudit('webhook.succeeded')!.sensible).toBe(false);
    expect(classeActionAudit('nouvelle.action')).toBeNull();
    const l = tableRegistreAudit([evt({ action: 'nouvelle.action', espaceId: null })], {}).filtrees[0]!;
    expect(l.action).toBe(PHRASE_ACTION_NON_CLASSEE);
    expect(l.code).toBe('nouvelle.action');
  });

  it('portée · sans espace, `studios.*`, ou sensible · le bruit des espaces n’entre pas', () => {
    expect(dansRegistrePlateforme({ action: 'prompt.version.brouillon', espaceId: null })).toBe(true);
    expect(dansRegistrePlateforme({ action: 'studios.interrupteurs', espaceId: 'w' })).toBe(true);
    expect(dansRegistrePlateforme({ action: 'equipe.membre.role', espaceId: 'w' })).toBe(true);
    expect(dansRegistrePlateforme({ action: 'project.create', espaceId: 'w' })).toBe(false);
    expect(dansRegistrePlateforme({ action: 'job.completed', espaceId: 'w' })).toBe(false);
  });

  it('cellules · acteur jamais une adresse, détails JSON bornés, clés secrètes et liens masqués', () => {
    expect(acteurAudit('kevin@agence.fr', 'owner')).toBe('Membre sans nom');
    expect(acteurAudit(null, 'systeme:worker')).toBe('Automatique');
    expect(acteurAudit('  Kevin ', 'owner')).toBe('Kevin');
    expect(cibleAudit('prompt_release', '3f2a9c1e-0000-4000-8000-000000000000')).toBe('Release de prompts · 3f2a9c1e');
    expect(cibleAudit('prompt_template', 'jarvis.chat@1.2.0')).toBe('Prompt · jarvis.chat@1.2.0');
    const d = detailsAudit({ token: 'ABCSECRET', imbrique: { apiKey: 'K-SECRET', lien: 'https://bucket.s3.test/assets/w/x.png' }, contact: 'a@b.fr', n: 3 });
    for (const f of ['ABCSECRET', 'K-SECRET', 'bucket.s3.test', 'a@b.fr']) expect(d, f).not.toContain(f);
    expect(d).toContain('"token":"[masqué]"');
    expect(detailsAudit({ texte: 'y'.repeat(2_000) })).toHaveLength(LONGUEUR_MAX_DETAILS_AUDIT);
    expect(detailsAudit(null)).toBe('n.c.');
  });

  it('filtre « sensibles » = la liste fermée · recherche sur acteur, action, cible (identifiant entier)', () => {
    const evts = [
      evt({ id: '1', action: 'prompt.release.publier', acteurNom: 'Kevin' }),
      evt({ id: '2', action: 'prompt.version.brouillon', acteurNom: 'Élodie' }),
      evt({ id: '3', action: 'equipe.membre.role', espaceId: 'w1', espace: 'Maison Éclat', cibleType: 'workspace_member', cibleId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
      evt({ id: '4', action: 'project.create', espaceId: 'w1' }),
    ];
    const t = tableRegistreAudit(evts, {});
    expect(t.filtrees.map((l) => l.id).sort()).toEqual(['1', '2', '3']);
    expect(tableRegistreAudit(evts, { segment: 'sensibles' }).filtrees.map((l) => l.id).sort()).toEqual(['1', '3']);
    expect(tableRegistreAudit(evts, { q: 'elodie' }).filtrees.map((l) => l.id)).toEqual(['2']);
    expect(tableRegistreAudit(evts, { q: 'publie' }).filtrees.map((l) => l.id)).toEqual(['1']);
    expect(tableRegistreAudit(evts, { q: 'eeeeeeeeeeee' }).filtrees.map((l) => l.id)).toEqual(['3']);
    expect(cellulesRegistreAudit(t.filtrees.find((l) => l.id === '3')!).slice(1, 6)).toEqual(['Membre sans nom', 'a changé le rôle d’un membre', 'equipe.membre.role', 'Membre · aaaaaaaa', 'Maison Éclat']);
  });
});

function evt(o: Partial<EvenementAuditLu> = {}): EvenementAuditLu {
  return { id: 'e', le: avant(MIN), acteurNom: null, role: 'owner', action: 'prompt.import', cibleType: 'prompt_pack', cibleId: 'pack@1', espaceId: null, espace: null, motif: '', details: null, ...o };
}
