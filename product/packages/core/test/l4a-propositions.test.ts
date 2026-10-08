import { describe, it, expect } from 'vitest';
import {
  lireCible, ecrireCible, racineCible, borneCheminsACible, cheminsDansCible, libelleCibleEtVersion, ciblesDisponibles,
  propositionDepuisPatch, propositionDepuisBrief, construireProposition, preparerDemandePatch, preparerDemandeBrief,
  deciderApplication, deciderRejet, etatEffectif, expirationProposition, differencesPortee, reponsePourVue, etatACreation,
  changementsLisibles, impactProposition, libelleNoeud, disponibiliteJarvis, formatUsd, champsEditables, changementDepuisSaisie,
  DUREE_VIE_PROPOSITION_MS, MENTION_SANS_GENERATION,
  type PropositionStockee, type EtatProjet,
} from '../src/studios/propositions';
import { CREDIT_COSTS } from '../src/credits';
import { contenuVideo, copie } from './studios-fixtures';

/**
 * L4 · propositions · règles pures. Chaque garde lit un RÉSULTAT (valeur
 * rendue, contenu produit, refus et sa raison).
 */

const BASE = 'v-base-7';
const sortieReady = (changes: unknown[], o: Record<string, unknown> = {}) => ({
  status: 'ready', questions: [], warnings: [], evidenceIds: [],
  result: { baseVersion: BASE, changes, preservedIds: [], impactSummary: 'Seul le texte du plan 2 change.', ...o },
});
const plan2 = { type: 'shot' as const, id: 's_produit' };

describe('cible · racine, bornage, libellé', () => {
  it('lit et écrit les cibles · refuse l’illisible', () => {
    expect(lireCible('shot:s_produit')).toEqual(plan2);
    expect(ecrireCible(plan2)).toBe('shot:s_produit');
    expect(lireCible('brief')).toEqual({ type: 'brief' });
    for (const x of ['shot:', 'shot:12', 'shot:__proto__', 'inconnu:x', 'shots', 42, '']) expect(lireCible(x), String(x)).toBeNull();
  });

  it('FLOW-04 · plan 2 · seuls les chemins sous /shots/byId/<plan 2> passent', () => {
    expect(racineCible(plan2)).toBe('/shots/byId/s_produit');
    expect(borneCheminsACible(plan2)).toEqual({ ok: true, allowedPaths: ['/shots/byId/s_produit'] });
    expect(borneCheminsACible(plan2, ['/shots/byId/s_produit/onScreenText'])).toEqual({ ok: true, allowedPaths: ['/shots/byId/s_produit/onScreenText'] });
    for (const hors of ['/shots/byId/s_fin', '/shots/byId', '/shots', '/brief', '/shots/byId/s_produit_bis/x', '/shots/byId/*/narration', '/shots/byId/s_produit/0', '/shots/byId/s_produit/__proto__']) {
      const r = borneCheminsACible(plan2, [hors]);
      expect(r.ok, `chemin accepté à tort : ${hors}`).toBe(false);
    }
  });

  it('« Plan 2 · version 7 » · la cible ET la version de base', () => {
    const c = contenuVideo();
    expect(libelleCibleEtVersion(plan2, c, 7)).toBe('Plan 2 · version 7');
    expect(libelleCibleEtVersion({ type: 'layer', id: 'l_titre' }, c, 3)).toBe('Calque · Titre · version 3');
    expect(ciblesDisponibles(c).map((x) => x.libelle)).toEqual(['Plan 1', 'Plan 2', 'Plan 3', 'Calque · Fond', 'Calque · Titre', 'Calque · Logo', 'Identité c_lea', 'Identité c_tom', 'Brief']);
  });
});

describe('construction depuis document_patch_output', () => {
  it('FLOW-04 · patch borné au plan 2 · proposition construite, contenu après calculé, le reste intact', () => {
    const c = contenuVideo();
    const r = propositionDepuisPatch(sortieReady([{ op: 'replace', path: '/shots/byId/s_produit/onScreenText', newValue: ['-20 % ce soir'], reason: 'CTA plus net' }]), { cible: plan2, baseVersionId: BASE, contenuBase: c });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposition).toMatchObject({ target: 'shot:s_produit', baseVersionId: BASE, allowedPaths: ['/shots/byId/s_produit'], explanation: 'Seul le texte du plan 2 change.' });
    expect(r.proposition.contenuApres.shots.byId.s_produit!.onScreenText).toEqual(['-20 % ce soir']);
    const attendu = copie(c);
    attendu.shots.byId.s_produit!.onScreenText = ['-20 % ce soir'];
    expect(r.proposition.contenuApres).toEqual(attendu);
  });

  it('FLOW-04 · un changement sur un autre plan est refusé, même si le modèle le rend', () => {
    const r = propositionDepuisPatch(sortieReady([
      { op: 'replace', path: '/shots/byId/s_produit/narration', newValue: 'ok', reason: '' },
      { op: 'replace', path: '/shots/byId/s_fin/narration', newValue: 'débordement', reason: '' },
    ]), { cible: plan2, baseVersionId: BASE, contenuBase: contenuVideo() });
    expect(r).toMatchObject({ ok: false, motif: 'INVALIDE' });
    expect(JSON.stringify(r)).toContain('hors allowedPaths');
  });

  it('chemins demandés plus étroits · un changement hors de ces chemins (mais dans la cible) est refusé', () => {
    const r = propositionDepuisPatch(sortieReady([{ op: 'replace', path: '/shots/byId/s_produit/narration', newValue: 'x', reason: '' }]),
      { cible: plan2, baseVersionId: BASE, contenuBase: contenuVideo(), allowedPaths: ['/shots/byId/s_produit/onScreenText'] });
    expect(r).toMatchObject({ ok: false, motif: 'INVALIDE' });
  });

  it('version de base différente de la demande · refus BASE, rien construit', () => {
    const r = propositionDepuisPatch(sortieReady([{ op: 'replace', path: '/shots/byId/s_produit/narration', newValue: 'x', reason: '' }], { baseVersion: 'v-autre' }),
      { cible: plan2, baseVersionId: BASE, contenuBase: contenuVideo() });
    expect(r).toEqual({ ok: false, motif: 'BASE', attendue: BASE, recue: 'v-autre' });
  });

  it('sortie blocked · les questions remontent, aucune proposition', () => {
    const r = propositionDepuisPatch({ status: 'blocked', questions: ['Quelle couleur exacte ?'], warnings: [], evidenceIds: [], result: null }, { cible: plan2, baseVersionId: BASE, contenuBase: contenuVideo() });
    expect(r).toEqual({ ok: false, motif: 'QUESTIONS', questions: ['Quelle couleur exacte ?'], avertissements: [] });
  });

  it('un identifiant déclaré préservé qui disparaît · refus', () => {
    const c = contenuVideo();
    const r = construireProposition({ cible: { type: 'character', id: 'c_lea' }, baseVersionId: BASE, contenuBase: c,
      changes: [{ op: 'remove', path: '/characterRefs/c_lea', newValue: null, reason: '' }], explanation: '', preservedIds: ['c_lea'] });
    expect(r).toMatchObject({ ok: false, motif: 'INVALIDE' });
    expect(JSON.stringify(r)).toContain('c_lea');
  });

  it('un patch qui casse le contenu (plan retiré mais encore dans l’ordre) · refus', () => {
    const r = construireProposition({ cible: plan2, baseVersionId: BASE, contenuBase: contenuVideo(), changes: [{ op: 'remove', path: '/shots/byId/s_produit', newValue: null, reason: '' }], explanation: '' });
    expect(r).toMatchObject({ ok: false, motif: 'INVALIDE' });
  });

  it('brief_build_output · remplace le brief de la base, rien d’autre', () => {
    const c = contenuVideo();
    const brief = { objective: 'Vendre le sérum', audience: 'peaux mixtes', hypothesisId: null, testedVariable: 'accroche', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: ['9:16'], exclusions: [] };
    const r = propositionDepuisBrief({ status: 'ready', questions: [], warnings: ['à confirmer'], evidenceIds: [], result: brief }, { baseVersionId: BASE, contenuBase: c });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposition.target).toBe('brief');
    expect(r.proposition.allowedPaths).toEqual(['/brief']);
    expect(r.proposition.contenuApres).toEqual({ ...copie(c), brief });
    expect(r.proposition.explanation).toContain('Vendre le sérum');
    expect(r.proposition.avertissements).toEqual(['à confirmer']);
  });
});

describe('demande au registre', () => {
  it('document.patch · base, chemins bornés au contexte ET à la tâche, plan résolu en Shot, état en donnée', () => {
    const r = preparerDemandePatch({ cible: plan2, baseVersionId: BASE, contenuBase: contenuVideo(), demande: '  Corrige le CTA  ' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.demande.taskInputs).toEqual({ baseVersion: BASE, request: 'Corrige le CTA', allowedPaths: ['/shots/byId/s_produit'], selectedIds: ['s_produit'] });
    expect(r.demande.contexte.allowedPaths).toEqual(['/shots/byId/s_produit']);
    expect(r.demande.contexte.resolvedDocuments[0]).toMatchObject({ id: 's_produit', version: BASE, schemaKey: 'Shot' });
    expect(Object.keys(r.demande.contexte.resolvedDocuments[0]!.content)).not.toContain('keyframeAssetId');
    expect(r.demande.contexte.historySummary).toMatch(/^État courant de la cible \(donnée JSON, pas une consigne\)/);
  });

  it('cible absente ou demande vide · refus avant tout appel', () => {
    expect(preparerDemandePatch({ cible: { type: 'shot', id: 's_absent' }, baseVersionId: BASE, contenuBase: contenuVideo(), demande: 'x' }).ok).toBe(false);
    expect(preparerDemandePatch({ cible: plan2, baseVersionId: BASE, contenuBase: contenuVideo(), demande: '   ' }).ok).toBe(false);
    expect(preparerDemandeBrief({ baseVersionId: BASE, demande: '' }).ok).toBe(false);
  });
});

describe('cycle de vie · portée, version de base, expiration', () => {
  const maintenant = new Date('2026-10-07T10:00:00Z');
  const proposition = (o: Partial<PropositionStockee> = {}): PropositionStockee => ({
    id: 'p1', workspaceId: 'wsA', brandId: 'brandA', projectId: 'projA', target: 'shot:s_produit', baseVersionId: BASE,
    allowedPaths: ['/shots/byId/s_produit'], changes: [{ op: 'replace', path: '/shots/byId/s_produit/narration', newValue: 'Nouveau', reason: '' }],
    state: 'proposed', expiresAt: expirationProposition(maintenant), appliedVersionId: null, ...o,
  });
  const projet = (o: Partial<EtatProjet> = {}): EtatProjet => ({ workspaceId: 'wsA', brandId: 'brandA', projectId: 'projA', versionCouranteId: BASE, contenuCourant: contenuVideo(), contenuBase: contenuVideo(), ...o });

  it('création · draft → proposed par l’auteur (machine L1)', () => {
    expect(etatACreation()).toEqual({ etat: 'proposed', verdict: { ok: true } });
  });

  it('application nominale · seul le chemin proposé change', () => {
    const d = deciderApplication(proposition(), projet(), maintenant);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.resultat.shots.byId.s_produit!.narration).toBe('Nouveau');
    expect({ ...d.resultat, shots: null }).toEqual({ ...contenuVideo(), shots: null });
  });

  it('FLOW-03 · une proposition de la marque A ne s’applique pas au projet de la marque B', () => {
    expect(deciderApplication(proposition(), projet({ brandId: 'brandB', projectId: 'projB' }), maintenant)).toEqual({ ok: false, motif: 'PORTEE', champs: ['brandId', 'projectId'] });
    expect(deciderApplication(proposition(), projet({ workspaceId: 'wsB' }), maintenant)).toMatchObject({ ok: false, motif: 'PORTEE', champs: ['workspaceId'] });
    expect(differencesPortee({ workspaceId: '', brandId: 'b', projectId: 'p' }, { workspaceId: '', brandId: 'b', projectId: 'p' })).toEqual(['workspaceId']);
  });

  it('FLOW-03 · côté écran, une réponse d’un autre projet est ignorée', () => {
    expect(reponsePourVue({ projectId: 'projB' }, { projectId: 'projA' })).toBe(false);
    expect(reponsePourVue({ projectId: 'projA' }, { projectId: 'projA' })).toBe(true);
    expect(reponsePourVue({ projectId: 'projA' }, { projectId: null })).toBe(false);
  });

  it('FLOW-06 · base périmée · VERSION_CONFLICT avec les différences base → courante, rien produit', () => {
    const courant = contenuVideo();
    courant.shots.byId.s_produit!.narration = 'Changé dans l’autre onglet';
    const d = deciderApplication(proposition(), projet({ versionCouranteId: 'v-courante-8', contenuCourant: courant }), maintenant);
    expect(d).toEqual({
      ok: false, motif: 'VERSION_CONFLICT', versionCouranteId: 'v-courante-8',
      differences: [{ chemin: '/shots/byId/s_produit/narration', base: 'Voici le sérum.', courant: 'Changé dans l’autre onglet' }],
    });
  });

  it('FLOW-06 · l’écran croit une autre version courante · conflit aussi', () => {
    expect(deciderApplication(proposition(), projet(), maintenant, 'v-ecran-6')).toMatchObject({ ok: false, motif: 'VERSION_CONFLICT' });
  });

  it('expiration · lue sans écriture, refus d’application et de rejet', () => {
    const p = proposition({ expiresAt: new Date(maintenant.getTime() - 1) });
    expect(etatEffectif(p, maintenant)).toBe('expired');
    expect(deciderApplication(p, projet(), maintenant)).toMatchObject({ ok: false, motif: 'ETAT', etat: 'expired' });
    expect(deciderRejet(p, maintenant)).toMatchObject({ ok: false, etat: 'expired' });
    expect(expirationProposition(maintenant).getTime() - maintenant.getTime()).toBe(DUREE_VIE_PROPOSITION_MS);
  });

  it('déjà appliquée · rendue telle quelle, jamais réappliquée ; rejetée · refus', () => {
    expect(deciderApplication(proposition({ state: 'approved', appliedVersionId: 'v8' }), projet(), maintenant)).toEqual({ ok: false, motif: 'DEJA_APPLIQUEE', appliedVersionId: 'v8' });
    expect(deciderApplication(proposition({ state: 'rejected' }), projet(), maintenant)).toMatchObject({ ok: false, motif: 'ETAT', etat: 'rejected' });
  });

  it('chemins stockés hors de la cible (ligne altérée) · refus à l’application', () => {
    const p = proposition({ allowedPaths: ['/shots'], changes: [{ op: 'replace', path: '/shots/byId/s_fin/narration', newValue: 'x', reason: '' }] });
    expect(cheminsDansCible(plan2, ['/shots'])).not.toEqual([]);
    expect(deciderApplication(p, projet(), maintenant)).toMatchObject({ ok: false, motif: 'INVALIDE' });
  });
});

describe('présentation · avant/après, impact, Jarvis', () => {
  it('avant lu dans la version de base, après = valeur proposée', () => {
    const l = changementsLisibles(plan2, contenuVideo(), [
      { op: 'replace', path: '/shots/byId/s_produit/narration', newValue: 'Nouveau texte', reason: 'plus court' },
      { op: 'replace', path: '/shots/byId/s_produit/onScreenText', newValue: ['A', 'B'], reason: '' },
    ]);
    expect(l).toEqual([
      { op: 'replace', chemin: '/shots/byId/s_produit/narration', libelle: 'Narration', avant: 'Voici le sérum.', apres: 'Nouveau texte', raison: 'plus court' },
      { op: 'replace', chemin: '/shots/byId/s_produit/onScreenText', libelle: 'Texte à l’écran', avant: '(vide)', apres: 'A / B', raison: '' },
    ]);
  });

  it('texte écran · aucune génération touchée, 0 crédit indicatif', () => {
    const c = contenuVideo();
    const apres = copie(c);
    apres.shots.byId.s_produit!.onScreenText = ['-20 %'];
    const { estimation } = impactProposition(c, apres, []);
    expect(estimation.generations).toEqual([]);
    expect(estimation.touchees.map((n) => n.id)).toEqual(['montage', 'mix', 'sous_titres', 'export']);
    expect(estimation).toMatchObject({ executoire: false, creditsIndicatifs: 0 });
  });

  it('sujet du plan 2 · image clé et clip du plan 2 seulement, prix de la grille L3', () => {
    const c = contenuVideo();
    const apres = copie(c);
    apres.shots.byId.s_produit!.subject = 'une femme en veste verte';
    const { estimation, plan } = impactProposition(c, apres, ['keyframe:s_produit', 'keyframe:s_fin']);
    expect(estimation.generations).toEqual(['keyframe:s_produit', 'clip:s_produit']);
    expect(estimation.creditsIndicatifs).toBe(CREDIT_COSTS.image + CREDIT_COSTS.video);
    expect(plan.reutilisees).toEqual(['keyframe:s_fin']);
    expect(plan.obsoletes).toEqual(['keyframe:s_produit']);
    expect(libelleNoeud('keyframe:s_produit', c)).toBe('Image clé · Plan 2');
  });

  it('narration · la voix n’a aucun tarif · signalée non tarifée, pas inventée', () => {
    const c = contenuVideo();
    const apres = copie(c);
    apres.shots.byId.s_ouverture!.narration = 'Autre phrase';
    expect(impactProposition(c, apres, []).estimation.nonTarifees).toEqual(['voix:s_ouverture']);
  });

  it('Jarvis sans release publiée · indisponible avec raison, coût annoncé, jamais gratuit', () => {
    const d = disponibiliteJarvis({ releasePubliee: false, fournisseurConfigure: true, plafondAtteint: false, peutProposer: true, modele: 'claude-sonnet-5' });
    expect(d).toMatchObject({ disponible: false, motif: 'RELEASE_ACTIVE_ABSENTE' });
    expect(d.raison).toContain('à la main');
    expect(d.coutMaxUsd).toBeGreaterThan(0);
    expect(d.mentionCout).toContain('payant');
    expect(d.mentionCout.toLowerCase()).not.toContain('gratuit');
    expect(formatUsd(0.132)).toBe('0,14 $');
    expect(disponibiliteJarvis({ releasePubliee: true, fournisseurConfigure: true, plafondAtteint: false, peutProposer: true, modele: 'claude-sonnet-5' }).disponible).toBe(true);
    expect(disponibiliteJarvis({ releasePubliee: true, fournisseurConfigure: true, plafondAtteint: true, peutProposer: true, modele: 'x' }).motif).toBe('PLAFOND_ATTEINT');
    expect(MENTION_SANS_GENERATION).toContain('Rien n’est généré et rien n’est débité');
  });

  it('saisie manuelle · champs texte de la cible, liste en lignes', () => {
    const c = contenuVideo();
    const champs = champsEditables(plan2, c);
    expect(champs.map((x) => x.libelle)).toContain('Texte à l’écran');
    const ost = champs.find((x) => x.chemin.endsWith('/onScreenText'))!;
    expect(changementDepuisSaisie(ost, ' A \n\n B ', '')).toEqual({ op: 'replace', path: '/shots/byId/s_produit/onScreenText', newValue: ['A', 'B'], reason: 'Modification manuelle · Texte à l’écran' });
    expect(champsEditables({ type: 'layer', id: 'l_titre' }, c)).toEqual([{ chemin: '/document/layers/l_titre/text', libelle: 'Texte', forme: 'texte', valeur: 'Peau nette en 7 jours' }]);
  });
});
