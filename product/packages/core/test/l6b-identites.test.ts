import { describe, it, expect } from 'vitest';
import { contenuVide, validerContenuVersion, type ContenuVersion } from '../src/studios/document';
import { appliquerPatch } from '../src/studios/patch';
import { calculerPlanImpact } from '../src/studios/impact';
import {
  lireIdentites, validerIdentite, construireFiche, changementFiche, changementsLiaison, libelleAttribut,
  detecterContradictions, constatsContradictions, changementsResolution, contradictionsDuDevis, messageRefusDevis,
  FENETRE_COULEUR, lireCouleur,
} from '../src/studios/identites';
import { accorder } from '../src/studios/identites/lexique';
import { lea, tom, planVideo, contenuContradictoire, copie } from './l6b-fixtures';

/**
 * L6-B · identités de personnages et contradictions (VIDEO-02), règles pures.
 * On lit le RÉSULTAT : contradictions rendues, texte corrigé, contenu après
 * patch (validé par L1), plan d'impact.
 */

const appliquer = (c: ContenuVersion, r: { changes: unknown; allowedPaths: string[] }) => {
  const a = appliquerPatch(c, r.changes, r.allowedPaths);
  if (!a.ok) throw new Error(JSON.stringify(a.violations));
  expect(validerContenuVersion(a.resultat)).toEqual([]);
  return a.resultat;
};

describe('lexique · accord des couleurs', () => {
  it('reconnaît les formes accordées et accorde une couleur au genre et au nombre voulus', () => {
    expect(lireCouleur('Vertes')).toMatchObject({ canon: 'vert', genre: 'f', nombre: 'p' });
    expect(lireCouleur('jaune')).toMatchObject({ canon: 'jaune', genre: null, nombre: 's' });
    expect(lireCouleur('châtains')).toMatchObject({ canon: 'châtain', nombre: 'p' });
    expect(lireCouleur('verdâtre')).toBeNull();
    expect(accorder('vert', 'f', 's')).toBe('verte');
    expect(accorder('vert', 'f', 'p')).toBe('vertes');
    expect(accorder('jaune', 'f', 'p')).toBe('jaunes');
    expect(accorder('blanc', 'f', 's')).toBe('blanche');
    expect(accorder('gris', 'm', 'p')).toBe('gris');
  });
});

describe('fiche d’identité · structure, versions, liaison aux plans', () => {
  it('une fiche valide passe ; une couleur hors lexique, un doublon d’attribut ou une clé différente sont refusés', () => {
    expect(validerIdentite(lea(), 'perso_lea')).toEqual([]);
    const v = validerIdentite({ ...lea(), attributs: [...lea().attributs, { id: 'attr_1', categorie: 'tenue', element: 'pantalon', couleur: 'verdâtre', detail: '' }] }, 'perso_tom');
    expect(v.map((x) => x.chemin)).toEqual(expect.arrayContaining(['/identityId', '/attributs/3/id', '/attributs/3/couleur']));
  });

  it('construireFiche garde les identifiants existants, alloue les nouveaux, et n’avance la version que sur un vrai changement', () => {
    const p = lea();
    const meme = construireFiche('perso_lea', { nom: 'Léa', attributs: p.attributs, vues: p.vues, description: p.description }, p);
    expect(meme).toMatchObject({ ok: true, inchangee: true, fiche: { version: 1 } });
    const r = construireFiche('perso_lea', { nom: 'Léa', attributs: [...p.attributs.map((a) => (a.id === 'attr_1' ? { ...a, couleur: 'Jaune' } : a)), { categorie: 'accessoire', element: 'casquette', couleur: 'blanche' }], vues: p.vues, description: p.description }, p);
    if (!r.ok) throw new Error(JSON.stringify(r.violations));
    expect(r.fiche.version).toBe(2);
    expect(r.fiche.attributs.map((a) => [a.id, a.couleur])).toEqual([['attr_1', 'jaune'], ['attr_2', 'bruns'], ['attr_3', null], ['attr_4', 'blanche']]);
    const neuve = construireFiche('perso_zoe', { nom: 'Zoé', attributs: [{ categorie: 'cheveux', element: 'cheveux', couleur: 'roux' }] }, null);
    expect(neuve).toMatchObject({ ok: true, fiche: { version: 1, identityId: 'perso_zoe', attributs: [{ id: 'attr_1' }] } });
    expect(construireFiche('perso_zoe', { nom: '', attributs: [{ categorie: 'cape', element: '', couleur: 'fuchsia' }] }, null)).toMatchObject({ ok: false });
  });

  it('poser la fiche puis la lier à un plan · contenu valide, références du plan gardées, liaison retirée proprement', () => {
    let c: ContenuVersion = { ...contenuVide(), shots: { order: ['s1', 's2'], byId: { s1: planVideo('s1', ['p_produit']), s2: planVideo('s2', []) } } };
    const ch = changementFiche(c, lea(), 'fiche');
    expect(ch.op).toBe('add');
    c = appliquer(c, { changes: [ch], allowedPaths: [ch.path] });
    const l = changementsLiaison(c, 'perso_lea', ['s1', 's2']);
    if (!l.ok) throw new Error('liaison');
    c = appliquer(c, l);
    expect(c.shots.byId.s1!.referenceIds).toEqual(['p_produit', 'perso_lea']);
    expect(lireIdentites(c)).toEqual([expect.objectContaining({ identityId: 'perso_lea', structuree: true, plans: ['s1', 's2'] })]);
    const r = changementsLiaison(c, 'perso_lea', ['s2']);
    if (!r.ok) throw new Error('retrait');
    expect(r.changes.map((x) => x.path)).toEqual(['/shots/byId/s1/referenceIds']);
    expect(appliquer(c, r).shots.byId.s1!.referenceIds).toEqual(['p_produit']);
    expect(changementsLiaison(c, 'perso_lea', ['s9'])).toMatchObject({ ok: false });
  });

  it('une fiche ancienne (`{ tenue: \'pull bleu\' }`) est relue, pas réécrite, et reste contrôlée', () => {
    const c: ContenuVersion = { ...contenuVide(), characterRefs: { c_lea: { tenue: 'pull bleu', cheveux: 'blonds' } }, shots: { order: ['s1'], byId: { s1: planVideo('s1', ['c_lea'], { subject: 'Léa en pull rouge' }) } } };
    const [i] = lireIdentites(c);
    expect(i).toMatchObject({ structuree: false, fiche: null });
    expect(i!.attributs.map((a) => [a.categorie, libelleAttribut(a), a.couleur])).toEqual([['tenue', 'pull bleu', 'bleu'], ['cheveux', 'cheveux blonds', 'blonds']]);
    const [k] = detecterContradictions(c);
    expect(k).toMatchObject({ shotId: 's1', extrait: 'pull rouge', attendu: 'pull bleu' });
    expect(k!.resolutions.map((r) => r.type)).toEqual(['plan']);
  });
});

describe('VIDEO-02 · fiche « veste verte », plan qui dit « jaune »', () => {
  it('la contradiction est trouvée sur le plan 2 seulement, avec deux résolutions explicites', () => {
    const k = detecterContradictions(contenuContradictoire());
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({
      shotId: 's2', identityId: 'perso_lea', champ: 'subject', extrait: 'veste jaune', attendu: 'veste verte', nature: 'couleur',
      message: 'Plan s2 (sujet) : « veste jaune » contredit la fiche de Léa (tenue : veste verte).',
    });
    expect(k[0]!.resolutions).toEqual([
      { type: 'plan', libelle: 'Corriger le plan · « veste jaune » devient « veste verte »', chemin: '/shots/byId/s2/subject', avant: 'Léa court en veste jaune, cheveux au vent', apres: 'Léa court en veste verte, cheveux au vent' },
      { type: 'identite', libelle: 'Changer la fiche · tenue de Léa : « veste jaune » (version 2)', chemin: '/characterRefs/perso_lea', plansTouches: ['s1', 's2'], contradictionsApres: 1 },
    ]);
  });

  it('résolution « plan » · plus aucune contradiction, seul le plan 2 est à refaire', () => {
    const c = contenuContradictoire();
    const [k] = detecterContradictions(c);
    const r = changementsResolution(c, k!.id, 'plan');
    if (!r.ok) throw new Error(r.raison);
    expect(r.allowedPaths).toEqual(['/shots/byId/s2/subject']);
    const apres = appliquer(c, r);
    expect(detecterContradictions(apres)).toEqual([]);
    const impact = calculerPlanImpact(c, apres, { sortiesExistantes: ['keyframe:s1', 'keyframe:s2', 'identite:perso_lea'] });
    expect(impact.obsoletes).toEqual(['keyframe:s2']);
    expect(impact.reutilisees).toEqual(['identite:perso_lea', 'keyframe:s1']);
  });

  it('résolution « fiche » · nouvelle version de la fiche, plan 1 désormais contradictoire, tout ce qui cite Léa est à refaire', () => {
    const c = contenuContradictoire();
    const [k] = detecterContradictions(c);
    const r = changementsResolution(c, k!.id, 'identite');
    if (!r.ok) throw new Error(r.raison);
    const apres = appliquer(c, r);
    const f = apres.characterRefs.perso_lea as unknown as ReturnType<typeof lea>;
    expect(f.version).toBe(2);
    expect(f.attributs[0]).toMatchObject({ id: 'attr_1', element: 'veste', couleur: 'jaune' });
    expect(detecterContradictions(apres).map((x) => [x.shotId, x.extrait])).toEqual([['s1', 'veste verte']]);
    const impact = calculerPlanImpact(c, apres, { sortiesExistantes: ['keyframe:s1', 'keyframe:s2', 'identite:perso_lea'] });
    expect(impact.obsoletes).toEqual(['identite:perso_lea', 'keyframe:s1', 'keyframe:s2']);
  });

  it('une contradiction déjà résolue (page périmée) est refusée, rien n’est rendu à appliquer', () => {
    const c = contenuContradictoire();
    const [k] = detecterContradictions(c);
    const r = changementsResolution(c, k!.id, 'plan');
    if (!r.ok) throw new Error(r.raison);
    expect(changementsResolution(appliquer(c, r), k!.id, 'plan')).toEqual({ ok: false, raison: 'cette contradiction n’existe plus dans la version courante · recharge la page' });
  });

  it('le devis est concerné seulement par les opérations qui lisent le plan contradictoire', () => {
    const c = contenuContradictoire();
    expect(contradictionsDuDevis(c, ['keyframe:s2']).map((k) => k.shotId)).toEqual(['s2']);
    expect(contradictionsDuDevis(c, ['identite:perso_lea']).map((k) => k.shotId)).toEqual(['s2']);
    expect(contradictionsDuDevis(c, ['keyframe:s1'])).toEqual([]);
    expect(contradictionsDuDevis(c, ['montage', 'export'])).toEqual([]);
    expect(messageRefusDevis(contradictionsDuDevis(c, ['keyframe:s1', 'keyframe:s2']))).toBe('Contradiction d’identité · Plan s2 (sujet) : « veste jaune » contredit la fiche de Léa (tenue : veste verte). Corrige le plan ou change la fiche dans « Identités », puis redemande le devis. Rien n’a été devisé ni débité.');
  });

  it('absence · « sans ses lunettes » contredit l’accessoire ; la résolution « plan » écrit « avec ses lunettes »', () => {
    const c = contenuContradictoire();
    c.shots.byId.s1!.action = 'Elle repart sans ses lunettes';
    const k = detecterContradictions(c).find((x) => x.nature === 'absence')!;
    expect(k).toMatchObject({ shotId: 's1', champ: 'action', extrait: 'sans ses lunettes', attendu: 'lunettes' });
    expect(k.resolutions[0]).toMatchObject({ apres: 'Elle repart avec ses lunettes' });
    expect(k.resolutions[1]).toMatchObject({ libelle: 'Changer la fiche · Léa n’a plus « lunettes » (version 2)' });
  });

  it('silences voulus · lumière jaune (champ non lu), texte écran, plan qui ne cite pas Léa, couleur de l’autre personnage', () => {
    const c = contenuContradictoire();
    c.shots.byId.s2!.subject = 'Léa en veste verte';
    c.shots.byId.s2!.lighting = 'lumière jaune sur la veste';
    c.shots.byId.s2!.onScreenText = ['Veste jaune -20 %'];
    c.shots.byId.s1!.referenceIds = [];
    c.shots.byId.s1!.subject = 'Une passante en veste jaune';
    c.characterRefs.perso_tom = tom() as unknown as Record<string, unknown>;
    c.shots.byId.s2!.referenceIds = ['perso_lea', 'perso_tom'];
    c.shots.byId.s2!.action = 'Tom en veste rouge la rattrape';
    expect(detecterContradictions(c)).toEqual([]);
    // « Tom en veste verte » se tairait aussi (le vert est la couleur de Léa : ambigu, silence) ; une couleur qui n'est à personne contredit les deux fiches.
    c.shots.byId.s2!.action = 'Tom en veste bleue la rattrape';
    expect(detecterContradictions(c).map((k) => [k.identityId, k.extrait])).toEqual([['perso_lea', 'veste bleue'], ['perso_tom', 'veste bleue']]);
  });
});

describe('FENETRE · corpus mesuré (la table écrite dans contradictions.ts)', () => {
  // Fiche : Léa (veste verte, cheveux bruns, lunettes) ; Tom (veste rouge) cité dans certaines phrases.
  const CONTRADICTOIRES = [
    'Léa court en veste jaune',
    'Léa en veste d’un jaune vif',
    'La veste de couleur jaune de Léa',
    'Léa porte sa veste jaune fluo',
    'Léa, cheveux blonds au vent',
    'Léa en tenue orange',
    'Léa enfile une veste très jaune',
    'Léa ajuste sa veste en jaune',
    'Léa repart sans ses lunettes',
    'Léa, veste légère jaune',
  ];
  const COHERENTES = [
    'Léa court en veste verte',
    'Léa en veste verte devant un mur jaune',
    'Léa en veste verte et un sac jaune',
    'La veste verte de Léa, fond jaune',
    'Léa et Tom, Tom en veste rouge',
    'Léa en veste à capuche, ciel orange',
    'Léa ouvre sa veste dans un décor rose',
    'Léa range ses lunettes de soleil jaunes',
    'Léa garde sa veste tout le matin gris',
    'Léa plie sa veste le long du mur jaune',
  ];
  const contenu = (phrase: string): ContenuVersion => ({
    ...contenuVide(),
    characterRefs: { perso_lea: lea() as unknown as Record<string, unknown>, perso_tom: tom() as unknown as Record<string, unknown> },
    shots: { order: ['s'], byId: { s: planVideo('s', ['perso_lea', 'perso_tom'], { subject: phrase }) } },
  });
  const vus = (phrases: string[], f: number) => phrases.filter((p) => constatsContradictions(contenu(p), f).some((k) => k.identite.identityId === 'perso_lea')).length;

  it('table mesurée · contradictions vues / faux blocages par fenêtre ; FENETRE_COULEUR = plus petit rang sans manque ni faux blocage', () => {
    const table = [1, 2, 3, 4, 5].map((f) => [f, vus(CONTRADICTOIRES, f), vus(COHERENTES, f)]);
    expect(table).toEqual([[1, 5, 0], [2, 8, 0], [3, 10, 0], [4, 10, 1], [5, 10, 2]]);
    const meilleur = table.find(([, tp, fp]) => tp === CONTRADICTOIRES.length && fp === 0)![0];
    expect(FENETRE_COULEUR).toBe(meilleur);
  });
});
