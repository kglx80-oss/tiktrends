import { describe, it, expect } from 'vitest';
import { validerContenuVersion, validerDocument, type ContenuVersion, type DocumentStudio } from '../src/studios/document';
import { empreinteContenu, jsonCanonique } from '../src/studios/version';
import { ajouterTexte, ajouterForme, dupliquerCalque } from '../src/studios/calques/operations';
import { planRendu } from '../src/studios/rendu/plan';
import { contenuEchelle, contenuSynthetique, documentSynthetique, plansSynthetiques } from '../src/studios/perf/synthetique';
import {
  CALQUES_MAX, PLANS_MAX_PROJET, LIBELLE_LIMITES_STUDIO, depassementCalques, depassementPlans, messageLimiteCalques, messageLimitePlans,
} from '../src/studios/perf/limites';
import { ECHELLES_SYNTHETIQUES } from '../src/studios/perf/synthetique';

/**
 * L8-C · limites explicites (UX-06) · on vérifie le RÉSULTAT :
 *  · l'échelle du cahier (200 plans, 1000 calques) PASSE, entière ;
 *  · un calque ou un plan de plus est REFUSÉ, par une seule violation ciblée
 *    qui dit le compte, la limite et quoi faire ;
 *  · le geste de l'éditeur qui ferait dépasser rend un refus et laisse le
 *    document d'entrée intact (empreinte inchangée) ;
 *  · un contenu déjà au-delà peut DESCENDRE, jamais grandir.
 */

const avecCalques = (n: number): DocumentStudio => documentSynthetique(n, 3);
const contenuAvecPlans = (n: number): ContenuVersion => contenuSynthetique({ plans: n, calques: 0, graine: 5 });

describe('les limites sont l’échelle de stress du cahier', () => {
  it('200 plans et 1000 calques · ce que mesure UX-06', () => {
    expect(CALQUES_MAX).toBe(ECHELLES_SYNTHETIQUES.grand.calques);
    expect(PLANS_MAX_PROJET).toBe(ECHELLES_SYNTHETIQUES.grand.plans);
    expect(LIBELLE_LIMITES_STUDIO).toBe('Jusqu’à 1000 calques par document et 200 plans par projet.');
    expect(LIBELLE_LIMITES_STUDIO).not.toContain('—');
  });

  it('à la limite exacte, le contenu synthétique complet est VALIDE (aucune violation)', () => {
    expect(validerContenuVersion(contenuEchelle('grand'))).toEqual([]);
    expect(validerDocument(avecCalques(CALQUES_MAX))).toEqual([]);
  });
});

describe('au-delà · refus ciblé, qui dit la limite et quoi faire', () => {
  it('1001 calques · UNE violation sur /document/layers, rien d’autre', () => {
    const c = { ...contenuEchelle('grand'), document: avecCalques(CALQUES_MAX + 1) };
    const v = validerContenuVersion(c);
    expect(v).toEqual([{ chemin: '/document/layers', raison: messageLimiteCalques(1001) }]);
    expect(v[0]!.raison).toBe('Le document compterait 1001 calques · la limite est de 1000 par document. Supprime ou regroupe des calques avant d’en ajouter ; rien d’autre n’est modifié.');
    expect(validerDocument(c.document)).toEqual([{ chemin: '/document/layers', raison: messageLimiteCalques(1001) }]);
  });

  it('201 plans · UNE violation sur /shots', () => {
    const v = validerContenuVersion(contenuAvecPlans(PLANS_MAX_PROJET + 1));
    expect(v).toEqual([{ chemin: '/shots', raison: messageLimitePlans(201) }]);
    expect(v[0]!.raison).toContain('la limite est de 200 par projet');
    expect(v[0]!.raison).toContain('scinde la vidéo en plusieurs projets');
  });

  it('un ordre gonflé (plans fantômes) compte aussi', () => {
    const c = contenuAvecPlans(PLANS_MAX_PROJET);
    const gonfle = { ...c, shots: { ...c.shots, order: [...c.shots.order, 'x_fantome'] } };
    expect(validerContenuVersion(gonfle)).toEqual([{ chemin: '/shots', raison: messageLimitePlans(201) }]);
  });

  it('le plan de rendu refuse aussi, avec la même phrase (aucun rendu de 1001 calques)', () => {
    const r = planRendu(avecCalques(CALQUES_MAX + 1));
    expect(r).toEqual({ ok: false, violations: [{ chemin: '/document/layers', raison: messageLimiteCalques(1001) }] });
  });
});

describe('geste de l’éditeur · refus sans perte', () => {
  it.each([
    ['ajouter un texte', (d: DocumentStudio) => ajouterTexte(d)],
    ['ajouter une forme', (d: DocumentStudio) => ajouterForme(d)],
    ['dupliquer un calque', (d: DocumentStudio) => dupliquerCalque(d, Object.values(d.layers).find((l) => !l.locked)!.id)],
  ])('%s au 1001e calque · refus qui nomme la limite, document d’entrée intact', (_nom, geste) => {
    const d = avecCalques(CALQUES_MAX);
    const avant = empreinteContenu(d);
    const r = geste(d);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('DOCUMENT_INVALIDE');
    expect(r.message).toBe('La modification rendrait le document invalide · rien n’a changé.');
    expect(r.violations).toEqual([{ chemin: '/document/layers', raison: messageLimiteCalques(1001) }]);
    expect(empreinteContenu(d)).toBe(avant);
    expect(Object.keys(d.layers)).toHaveLength(CALQUES_MAX);
  });

  it('au 1000e calque, ajouter passe encore', () => {
    const r = ajouterTexte(avecCalques(CALQUES_MAX - 1));
    expect(r.ok && Object.keys(r.document.layers).length).toBe(CALQUES_MAX);
  });
});

describe('un contenu déjà au-delà peut descendre, jamais grandir', () => {
  const base = avecCalques(CALQUES_MAX + 5);

  it('retirer un calque d’un document de 1005 calques · accepté avec la base', () => {
    const layers = { ...base.layers };
    delete layers[Object.keys(layers)[0]!];
    const apres = { ...base, layers };
    expect(Object.keys(apres.layers)).toHaveLength(CALQUES_MAX + 4);
    expect(validerDocument(apres, '/document', { base })).toEqual([]);
    expect(depassementCalques(apres, base)).toBeNull();
  });

  it('même taille que la base (ouverture, retouche d’un champ) · accepté', () => {
    expect(validerDocument(base, '/document', { base })).toEqual([]);
    const c = { ...contenuEchelle('petit'), document: base };
    expect(validerContenuVersion(c, { base: c })).toEqual([]);
  });

  it('grandir au-delà d’une base déjà au-delà · refusé', () => {
    const plus = avecCalques(CALQUES_MAX + 6);
    expect(validerDocument(plus, '/document', { base })).toEqual([{ chemin: '/document/layers', raison: messageLimiteCalques(1006) }]);
    const c = { ...contenuEchelle('petit'), document: base };
    expect(validerContenuVersion({ ...c, document: plus }, { base: c })).toEqual([{ chemin: '/document/layers', raison: messageLimiteCalques(1006) }]);
  });

  it('plans · 205 → 204 accepté avec la base, 205 → 206 refusé', () => {
    const b = contenuAvecPlans(PLANS_MAX_PROJET + 5);
    const moins: ContenuVersion = JSON.parse(jsonCanonique(b));
    const retire = moins.shots.order.pop()!;
    delete moins.shots.byId[retire];
    expect(depassementPlans(moins, b)).toBeNull();
    const plus: ContenuVersion = JSON.parse(jsonCanonique(b));
    const p = plansSynthetiques(1, 9)[0]!;
    plus.shots.byId.s_neuf = { ...p, shotId: 's_neuf' };
    plus.shots.order.push('s_neuf');
    expect(depassementPlans(plus, b)).toEqual({ chemin: '/shots', raison: messageLimitePlans(206) });
  });
});
