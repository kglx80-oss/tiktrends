import { describe, expect, it } from 'vitest';
import {
  ACTIONS_JOURNAL_CONNUES, ETAPES_TECHNIQUES_JOURNAL, LONGUEUR_MAX_COMMENTAIRE, MODIFICATIONS_MAX_COMMENTAIRE, PAR_PAGE_JOURNAL, PHRASE_EVENEMENT_INCONNU, RAISON_LECTEUR_COMMENTAIRE, TYPES_JOURNAL,
  cibleCommentaire, droitsCommentaire, entreeJournal, etatPublicationCommentaire, extraitCommentaire, faitsSansDoublon, filtrerCommentaires,
  etapeTechniqueJournal, historiqueApresModification, journalProjet, lireHistoriqueCommentaire, pageJournal, quandJournal, resumeJournal, typeJournal, validerTexteCommentaire,
  type FaitAudit, type FaitJournal,
} from '../src';

/**
 * Lot 10 V5 · Projet · activité, journal et commentaires · les règles PURES
 * (PC D13, D15, F9, F14, F15, F16 · RJ AC01).
 *
 *  · chaque événement connu devient UNE phrase française, jamais son code ·
 *    un événement inconnu se dit NEUTRE, ses détails ne sortent pas ;
 *  · aucune répétition · une version dite par l'audit, une tâche lancée dite
 *    par `job.enqueue` ;
 *  · tri du plus récent, filtre par type, pagination bornée ;
 *  · commentaires · texte normalisé et borné, vide refusé, qui modifie (soi,
 *    ouvert), qui résout / rouvre (qui propose), historique gardé.
 */

const P = 'p-1';
let n = 0;
const audit = (action: string, o: Partial<FaitAudit> = {}): FaitAudit => ({
  source: 'audit', id: `e${(n += 1)}`, le: `2026-11-0${Math.min(9, 1 + (n % 9))}T10:00:00.000Z`, acteur: 'Toi', action,
  cible: { type: 'studio_project', id: P }, versionApresId: null, versionN: null, etatApres: null, raison: '', raisonVersion: null, details: null, ...o,
});

describe('journal · une phrase française par événement, jamais le code brut', () => {
  it('les trente actions de projet écrites par les studios ont une phrase, aucune ne contient son code ni un identifiant', () => {
    expect(ACTIONS_JOURNAL_CONNUES.length).toBe(30);
    for (const a of ACTIONS_JOURNAL_CONNUES) {
      const e = entreeJournal(audit(a, { versionN: 2, versionApresId: 'v2' }), { projectId: P });
      expect(e.phrase, a).not.toBe(PHRASE_EVENEMENT_INCONNU);
      expect(e.type, a).not.toBe('autre');
      expect(`${e.phrase} ${e.detail ?? ''}`, a).not.toContain(a);
      expect(e.phrase, a).not.toMatch(/[a-z]+\.[a-z_]+/);
      expect(e.phrase, a).not.toContain('—');
    }
  });

  it('un événement inconnu se dit neutre · ni son code, ni ses détails, ni sa raison', () => {
    const e = entreeJournal(audit('secret.payload', { raison: '<script>alert(1)</script>', details: { cle: 'sk_live_123', apres: 'X' }, versionN: 3, versionApresId: 'v3' }), { projectId: P });
    expect(e).toMatchObject({ type: 'autre', phrase: PHRASE_EVENEMENT_INCONNU, detail: null, lien: null, acteur: 'Toi' });
    expect(JSON.stringify(e)).not.toMatch(/secret|payload|sk_live|script/);
  });

  it('les phrases disent ce qui s’est passé, avec les détails lus défensivement', () => {
    const phrase = (f: FaitAudit) => { const e = entreeJournal(f, { projectId: P }); return [e.type, e.phrase, e.detail, e.lien?.libelle ?? null]; };
    expect(phrase(audit('project.rename', { details: { avant: 'Crème', apres: 'Crème · été' } }))).toEqual(['projet', 'Projet renommé', '« Crème » devient « Crème · été »', null]);
    expect(phrase(audit('project.rename', { details: { avant: 3 } }))).toEqual(['projet', 'Projet renommé', null, null]);
    expect(phrase(audit('project.create', { versionN: 1, versionApresId: 'v1', raisonVersion: 'Copie de « Sérum » (version 2) · structure seule' })))
      .toEqual(['projet', 'Projet créé par duplication', 'Copie de « Sérum » (version 2) · structure seule', 'Examiner la version 1']);
    expect(phrase(audit('project.create', { versionN: 1, versionApresId: 'v1', raisonVersion: 'création' }))).toEqual(['projet', 'Projet créé', null, 'Examiner la version 1']);
    expect(phrase(audit('project.version.create', { versionN: 2, versionApresId: 'v2', raisonVersion: 'Composition' }))).toEqual(['versions', 'Version 2 enregistrée', 'Composition', 'Examiner la version 2']);
    expect(phrase(audit('project.version.create', { versionN: 3, versionApresId: 'v3', raisonVersion: 'application de la proposition 5f2c1b7e-1111-4111-8111-111111111111', details: { proposalId: 'x' } })))
      .toEqual(['versions', 'Version 3 enregistrée', 'En appliquant une proposition', 'Examiner la version 3']);
    expect(phrase(audit('project.export', { versionN: 1, versionApresId: 'v1', details: { format: 'png', largeur: 1080, hauteur: 1350, nomFichier: 'creme-v1-png.png' } })))
      .toEqual(['exports', 'Version 1 exportée', 'PNG · 1080 × 1350 · creme-v1-png.png', 'Voir le livrable']);
    expect(phrase(audit('project.export.review', { versionN: 1, versionApresId: 'v1', details: { points: ['a', 'b', 'c', 'd', 'e'] } })))
      .toEqual(['relectures', 'Relecture humaine validée · version 1', '5 points relus avant export', 'Voir le livrable']);
    expect(phrase(audit('quote.create', { details: { credits: 4 } }))).toEqual(['devis', 'Devis préparé', '4 crédits au plus', null]);
    expect(phrase(audit('quote.create', { details: { credits: '4' } }))).toEqual(['devis', 'Devis préparé', null, null]);
    expect(phrase(audit('job.enqueue', { details: { credits: 1 } }))).toEqual(['generations', 'Génération lancée · devis approuvé', '1 crédit débité', null]);
    expect(phrase(audit('variant.test.link', { raison: 'Image 1 du lot 1', details: { variable: 'accroche' } })))
      .toEqual(['tests', 'Variante rattachée à un test Adsmap', 'Image 1 du lot 1 · variable · accroche', 'Voir le livrable']);
    expect(phrase(audit('media.quality.control', { etatApres: 'requires_review' }))).toEqual(['relectures', 'Contrôle qualité d’une sortie', 'Résultat · à relire', 'Voir le livrable']);
    expect(phrase(audit('proposal.create', { details: { origine: 'jarvis' } }))[1]).toBe('Proposition de Jarvis');
    expect(phrase(audit('proposal.create', { details: { origine: 'human' } }))[1]).toBe('Proposition saisie');
  });

  it('les liens visent CE projet et CETTE version, adresse encodée · sans version, pas de lien de version', () => {
    const e = entreeJournal(audit('project.export', { versionN: 1, versionApresId: 'v 1/x' }), { projectId: 'p/1' });
    expect(e.lien).toEqual({ href: '/studio/projets/p%2F1/export?version=v%201%2Fx', libelle: 'Voir le livrable' });
    expect(entreeJournal(audit('project.version.create', { versionN: null, versionApresId: null }), { projectId: P }).lien).toBeNull();
  });

  it('acteur absent · « Automatique » · tâches et commentaires ont leur phrase', () => {
    const t = (etat: string, fini: boolean) => entreeJournal({ source: 'tache', id: `j:${etat}`, jobId: 'j', le: '2026-11-02T10:00:00Z', operation: 'keyframe:s1', etat, fini }, { projectId: P });
    expect([t('completed', true), t('failed', true), t('cancelled', true), t('reconciliation_required', true), t('queued', false)].map((e) => [e.phrase, e.detail, e.acteur, e.lien?.libelle ?? null])).toEqual([
      ['Génération terminée', 'Image', 'Automatique', 'Voir le livrable'], ['Génération en échec', 'Image', 'Automatique', null], ['Génération annulée', 'Image', 'Automatique', null],
      ['Génération interrompue · coût en rapprochement', 'Image', 'Automatique', null], ['Génération lancée', 'Image', 'Automatique', null],
    ]);
    const c = entreeJournal({ source: 'commentaire', id: 'c1', le: '2026-11-02T10:00:00Z', acteur: 'Léa', geste: 'ecrit', cible: { type: 'version', versionId: 'v2', versionN: 2 } }, { projectId: P });
    expect([c.type, c.phrase, c.acteur, c.lien?.href]).toEqual(['commentaires', 'Commentaire sur la version 2', 'Léa', '/studio/projets/p-1?version=v2']);
    const r = entreeJournal({ source: 'commentaire', id: 'c2', le: '2026-11-02T10:00:00Z', acteur: null, geste: 'resolu', cible: { type: 'creation', libelle: 'Lot 1 · Image 1' } }, { projectId: P });
    expect([r.phrase, r.detail, r.acteur]).toEqual(['Commentaire résolu sur une création', 'Lot 1 · Image 1', 'Automatique']);
  });

  it('les étapes internes du moteur se taisent · ni neutres ni en clair · l’annulation demandée par une personne se dit', () => {
    const etapes = ['job.claimed', 'job.running', 'job.persisting', 'job.completed', 'job.failed', 'job.cancelled', 'job.reconciliation_required', 'job.provider.payload', 'job.provider.blocked', 'webhook.completed'];
    expect(etapes.every(etapeTechniqueJournal)).toBe(true);
    expect(ETAPES_TECHNIQUES_JOURNAL.filter((a) => ACTIONS_JOURNAL_CONNUES.includes(a))).toEqual([]);
    expect(etapeTechniqueJournal('job.cancel_requested')).toBe(false);
    const j = journalProjet([...etapes.map((a) => audit(a)), audit('job.cancel_requested')], { projectId: P });
    expect(j.entrees.map((e) => e.phrase)).toEqual(['Annulation d’une génération demandée']);
    // Une opération sans libellé connu ne se dit pas · jamais un code brut.
    const t = entreeJournal({ source: 'tache', id: 'x', jobId: 'x', le: '2026-11-02T10:00:00Z', operation: 'studio.generation', etat: 'completed', fini: true }, { projectId: P });
    expect([t.phrase, t.detail]).toEqual(['Génération terminée', null]);
  });

  it('l’heure est celle de Paris', () => {
    expect(quandJournal('2026-11-08T13:32:00Z')).toBe('08/11/2026 · 14:32');
    expect(quandJournal('pas une date')).toBe('');
  });
});

describe('journal · sans doublon, trié, filtré, paginé', () => {
  const v1: FaitJournal = { source: 'version', id: 'v1', le: '2026-11-01T09:00:00Z', acteur: 'Toi', versionN: 1, raison: 'création' };
  const v2: FaitJournal = { source: 'version', id: 'v2', le: '2026-11-02T09:00:00Z', acteur: 'Toi', versionN: 2, raison: 'Composition' };
  const v3: FaitJournal = { source: 'version', id: 'v3', le: '2026-11-03T09:00:00Z', acteur: 'Léa', versionN: 3, raison: 'Semée sans audit' };
  const creation = audit('project.create', { le: '2026-11-01T09:00:00Z', versionApresId: 'v1', versionN: 1 });
  const v2Audit = audit('project.version.create', { le: '2026-11-02T09:00:00Z', versionApresId: 'v2', versionN: 2 });
  const lance: FaitJournal = { source: 'tache', id: 'j1:debut', jobId: 'j1', le: '2026-11-04T09:00:00Z', operation: 'keyframe:s1', etat: 'completed', fini: false };
  const fin: FaitJournal = { source: 'tache', id: 'j1:fin', jobId: 'j1', le: '2026-11-04T09:05:00Z', operation: 'keyframe:s1', etat: 'completed', fini: true };
  const enqueue = audit('job.enqueue', { le: '2026-11-04T09:00:00Z', cible: { type: 'studio_job', id: 'j1' } });

  it('une version dite par l’audit ne se répète pas · une version sans audit se dit quand même · une tâche lancée dite par l’audit non plus', () => {
    const f = faitsSansDoublon([v1, v2, v3, creation, v2Audit, lance, fin, enqueue]);
    expect(f.map((x) => `${x.source}:${x.id}`)).toEqual(['version:v3', `audit:${creation.id}`, `audit:${v2Audit.id}`, 'tache:j1:fin', `audit:${enqueue.id}`]);
    // Sans `job.enqueue` (tâche plus ancienne que l'audit), le lancement se dit depuis la tâche.
    expect(faitsSansDoublon([lance, fin]).map((x) => x.id)).toEqual(['j1:debut', 'j1:fin']);
  });

  it('du plus récent au plus ancien · le filtre garde un type · les comptes ne dépendent pas du filtre · pagination bornée', () => {
    const faits: FaitJournal[] = [v1, v2, v3, creation, v2Audit, lance, fin, enqueue];
    const j = journalProjet(faits, { projectId: P });
    expect(j.entrees.map((e) => e.phrase)).toEqual(['Génération terminée', 'Génération lancée · devis approuvé', 'Version 3 enregistrée', 'Version 2 enregistrée', 'Projet créé']);
    expect(j.filtres).toEqual([{ cle: 'versions', libelle: 'Versions', n: 2 }, { cle: 'projet', libelle: 'Projet', n: 1 }, { cle: 'generations', libelle: 'Générations', n: 2 }]);
    const seul = journalProjet(faits, { projectId: P, type: 'versions' });
    expect(seul.entrees.map((e) => e.phrase)).toEqual(['Version 3 enregistrée', 'Version 2 enregistrée']);
    expect([seul.total, seul.tous, seul.filtres.length]).toEqual([2, 5, 3]);
    expect(journalProjet(faits, { projectId: P, type: 'n’importe quoi' }).type).toBeNull();
    // 45 versions · trois pages de 20 · une page hors bornes revient dans les bornes.
    const beaucoup: FaitJournal[] = Array.from({ length: 45 }, (_, i) => ({ source: 'version' as const, id: `x${String(i).padStart(2, '0')}`, le: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), acteur: null, versionN: i + 1, raison: '' }));
    const p2 = journalProjet(beaucoup, { projectId: P, page: 2 });
    expect([p2.page, p2.pages, p2.entrees.length, p2.entrees[0]!.versionN]).toEqual([2, 3, PAR_PAGE_JOURNAL, 25]);
    expect(journalProjet(beaucoup, { projectId: P, page: 99 }).page).toBe(3);
    expect(journalProjet(beaucoup, { projectId: P, page: 99 }).entrees.length).toBe(5);
    expect([pageJournal('2', 3), pageJournal(-1, 3), pageJournal('x', 3), pageJournal(2.5, 3)]).toEqual([2, 1, 1, 1]);
    expect(resumeJournal(p2)).toBe('45 événements · page 2 sur 3');
    expect(resumeJournal({ page: 1, pages: 1, total: 0, type: 'exports' })).toBe('Aucun événement de ce type sur ce projet.');
    expect(resumeJournal({ page: 1, pages: 1, total: 0, type: null })).toBe('Aucun événement sur ce projet pour l’instant.');
  });

  it('les types offerts sont ceux de l’écran, une seule fois chacun', () => {
    expect(new Set(TYPES_JOURNAL.map((t) => t.cle)).size).toBe(TYPES_JOURNAL.length);
    expect(typeJournal('exports')).toBe('exports');
    expect(typeJournal(null)).toBeNull();
  });
});

describe('commentaires · texte, droits, historique', () => {
  it('le texte est normalisé et borné · vide refusé avec sa raison · un caractère de contrôle disparaît · le HTML reste du texte', () => {
    expect(validerTexteCommentaire('  Le produit est flou\r\n\r\n\r\n\r\nà reprendre  ')).toEqual({ ok: true, texte: 'Le produit est flou\n\nà reprendre' });
    expect(validerTexteCommentaire('a\u0000b‮c')).toEqual({ ok: true, texte: 'abc' });
    expect(validerTexteCommentaire('<script>alert(1)</script>')).toEqual({ ok: true, texte: '<script>alert(1)</script>' });
    expect(validerTexteCommentaire('   \n\t ')).toEqual({ ok: false, raison: 'Le commentaire est vide · écris ce que tu as vu avant de publier.' });
    expect(validerTexteCommentaire(42)).toMatchObject({ ok: false });
    expect(validerTexteCommentaire('é'.repeat(LONGUEUR_MAX_COMMENTAIRE))).toMatchObject({ ok: true });
    expect(validerTexteCommentaire('é'.repeat(LONGUEUR_MAX_COMMENTAIRE + 1))).toEqual({ ok: false, raison: `Le commentaire fait ${LONGUEUR_MAX_COMMENTAIRE + 1} caractères · ${LONGUEUR_MAX_COMMENTAIRE} au plus, raccourcis-le.` });
    expect([cibleCommentaire('version'), cibleCommentaire('creation'), cibleCommentaire('projet')]).toEqual(['version', 'creation', null]);
  });

  it('modifier · le sien seulement, ouvert, borné · résoudre et rouvrir · qui propose · le lecteur ne fait rien', () => {
    const moi = { userId: 'u1', peutProposer: true };
    expect(droitsCommentaire({ auteurId: 'u1', resolu: false, modifications: 0 }, moi)).toEqual({ modifier: { ok: true, raison: null }, resoudre: { ok: true, raison: null }, rouvrir: { ok: false, raison: 'Ce commentaire est encore ouvert.' } });
    expect(droitsCommentaire({ auteurId: 'u2', resolu: false, modifications: 0 }, moi).modifier).toEqual({ ok: false, raison: 'Seule la personne qui l’a écrit peut le modifier · réponds par un nouveau commentaire.' });
    expect(droitsCommentaire({ auteurId: null, resolu: false, modifications: 0 }, moi).modifier.ok).toBe(false);
    expect(droitsCommentaire({ auteurId: 'u2', resolu: false, modifications: 0 }, moi).resoudre.ok).toBe(true);
    const resolu = droitsCommentaire({ auteurId: 'u1', resolu: true, modifications: 0 }, moi);
    expect([resolu.modifier.raison, resolu.resoudre.ok, resolu.rouvrir.ok]).toEqual(['Ce commentaire est résolu · rouvre-le pour le modifier.', false, true]);
    expect(droitsCommentaire({ auteurId: 'u1', resolu: false, modifications: MODIFICATIONS_MAX_COMMENTAIRE }, moi).modifier.ok).toBe(false);
    expect(droitsCommentaire({ auteurId: 'u1', resolu: false, modifications: MODIFICATIONS_MAX_COMMENTAIRE - 1 }, moi).modifier.ok).toBe(true);
    const lecteur = droitsCommentaire({ auteurId: 'u1', resolu: false, modifications: 0 }, { userId: 'u1', peutProposer: false });
    expect([lecteur.modifier, lecteur.resoudre, lecteur.rouvrir].every((g) => !g.ok && g.raison === RAISON_LECTEUR_COMMENTAIRE)).toBe(true);
  });

  it('l’historique garde chaque texte remplacé · lu défensivement', () => {
    const h1 = historiqueApresModification([], 'Premier', '2026-11-08T10:00:00Z');
    const h2 = historiqueApresModification([...h1, { texte: 1 }, 'x'], 'Deuxième', '2026-11-08T11:00:00Z');
    expect(h2).toEqual([{ texte: 'Premier', remplaceLe: '2026-11-08T10:00:00Z' }, { texte: 'Deuxième', remplaceLe: '2026-11-08T11:00:00Z' }]);
    expect(lireHistoriqueCommentaire('pas un tableau')).toEqual([]);
  });

  it('« Publier » fermé dit pourquoi · filtres ouverts / résolus · extrait coupé au mot', () => {
    expect(etatPublicationCommentaire('', { peutProposer: true, cibleChoisie: true })).toEqual({ ok: false, raison: 'Le commentaire est vide · écris ce que tu as vu avant de publier.' });
    expect(etatPublicationCommentaire('ok', { peutProposer: true, cibleChoisie: false })).toEqual({ ok: false, raison: 'Choisis la version ou la création que tu commentes.' });
    expect(etatPublicationCommentaire('ok', { peutProposer: false, cibleChoisie: true })).toEqual({ ok: false, raison: RAISON_LECTEUR_COMMENTAIRE });
    expect(etatPublicationCommentaire('ok', { peutProposer: true, cibleChoisie: true })).toEqual({ ok: true, raison: null });
    const l = [{ id: 'a', resolu: null }, { id: 'b', resolu: { par: 'Toi' } }];
    expect([filtrerCommentaires(l, 'ouverts'), filtrerCommentaires(l, 'resolus'), filtrerCommentaires(l, 'tous')].map((x) => x.map((c) => c.id))).toEqual([['a'], ['b'], ['a', 'b']]);
    expect(extraitCommentaire('un deux trois quatre cinq', 14)).toBe('un deux trois…');
    expect(extraitCommentaire('  court \n texte ')).toBe('court texte');
  });
});
