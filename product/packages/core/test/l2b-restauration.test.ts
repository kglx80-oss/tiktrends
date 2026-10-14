import { describe, it, expect } from 'vitest';
import {
  annonceRestauration, comparerPourRestauration, decisionRestauration, libelleAuteurVersion, planRestauration, raisonRestauration,
} from '../src/studios/calques/restauration';
import { transformerCalque, modifierTexte, supprimerCalque } from '../src/studios/calques/operations';
import { validerContenuVersion, contenuVide, type ContenuVersion } from '../src/studios/document';
import { appliquerPatch } from '../src/studios/patch';
import { jsonCanonique } from '../src/studios/version';
import { contenuVideo, documentStudio } from './studios-fixtures';

/**
 * Lot 2b · restauration NON DESTRUCTIVE d'une version, noyau pur. La garde
 * rejoue le patch avec le VRAI `appliquerPatch` du serveur, sur les chemins
 * de l'éditeur, et compare le contenu obtenu à celui de la version restaurée.
 */

const CHEMINS_EDITEUR = ['/brief', '/productRef', '/styleRef', '/characterRefs', '/shots', '/document', '/timeline'];
const canon = (x: unknown) => jsonCanonique(x);
const ok = <T extends { ok: boolean }>(r: T) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }>; };

function versions() {
  const v2: ContenuVersion = { ...contenuVideo(), document: documentStudio() };
  let doc = ok(transformerCalque(v2.document!, 'l_titre', { x: 300 })).document;
  doc = ok(modifierTexte(doc, 'l_titre', { text: 'Nouveau titre' })).document;
  doc = ok(supprimerCalque(doc, 'l_fond')).document;
  const v4: ContenuVersion = { ...v2, brief: { ...(v2.brief ?? {}), objective: 'Autre objectif' }, document: doc };
  return { v2: { id: 'v2', n: 2, contenu: v2 }, v4: { id: 'v4', n: 4, contenu: v4 } };
}

describe('plan · la restauration rejouée par le serveur donne EXACTEMENT le contenu de la version restaurée', () => {
  it('courante v4 → cible v2 : patch par clé de contenu, contenu obtenu = v2, valide', () => {
    const { v2, v4 } = versions();
    const p = planRestauration(v4, v2);
    if (!p.ok) throw new Error(p.message);
    expect(p.cles).toEqual(['brief', 'document']);
    expect(p.changes.every((c) => c.op === 'replace' && c.reason === 'Restauration de la version 2')).toBe(true);
    const r = appliquerPatch(v4.contenu, p.changes, CHEMINS_EDITEUR);
    if (!r.ok) throw new Error(JSON.stringify(r.violations));
    expect(canon(r.resultat)).toBe(canon(v2.contenu));
    expect(validerContenuVersion(r.resultat)).toEqual([]);
    // Rien n'est modifié en place : les deux versions d'entrée restent telles quelles.
    expect(canon(v4.contenu)).toBe(canon(versions().v4.contenu));
    expect(canon(v2.contenu)).toBe(canon(versions().v2.contenu));
  });

  it('restaurer une version SANS document retire le document (et inversement)', () => {
    const { v4 } = versions();
    const v1 = { id: 'v1', n: 1, contenu: contenuVide() };
    for (const [courante, cible] of [[v4, v1], [v1, v4]] as const) {
      const p = planRestauration(courante, cible);
      if (!p.ok) throw new Error(p.message);
      const r = appliquerPatch(courante.contenu, p.changes, CHEMINS_EDITEUR);
      if (!r.ok) throw new Error(JSON.stringify(r.violations));
      expect(canon(r.resultat)).toBe(canon(cible.contenu));
    }
  });

  it('refus · la cible EST la courante, ou a déjà le même contenu', () => {
    const { v4 } = versions();
    expect(planRestauration(v4, v4)).toMatchObject({ ok: false, motif: 'deja-courante' });
    expect(planRestauration(v4, { ...v4, id: 'v3', n: 3, contenu: JSON.parse(JSON.stringify(v4.contenu)) }))
      .toMatchObject({ ok: false, motif: 'identique', message: 'La version 3 a déjà le même contenu que la version courante (4) · restaurer ne créerait rien.' });
    expect(raisonRestauration(7)).toBe('Restauration de la version 7');
  });
});

describe('avant le clic · décision et annonce', () => {
  const base = { editable: true, modifie: false, enCours: false, conflit: false, estCourante: false };
  it('permis seulement sans modification en attente, sans enregistrement ni conflit, avec le droit, sur une autre version qui diffère', () => {
    expect(decisionRestauration(base)).toEqual({ permis: true });
    expect(decisionRestauration({ ...base, modifie: true })).toEqual({ permis: false, raison: 'Tu as des modifications non enregistrées · enregistre-les ou annule-les avant de restaurer.' });
    expect(decisionRestauration({ ...base, editable: false })).toMatchObject({ permis: false, raison: 'Ton rôle permet de consulter les versions, pas de les restaurer.' });
    expect(decisionRestauration({ ...base, enCours: true }).permis).toBe(false);
    expect(decisionRestauration({ ...base, conflit: true }).permis).toBe(false);
    expect(decisionRestauration({ ...base, estCourante: true }).permis).toBe(false);
    expect(decisionRestauration({ ...base, sansDifference: true }).permis).toBe(false);
  });

  it('l’annonce dit la version créée, la source, et que rien n’est effacé', () => {
    expect(annonceRestauration(2, 4)).toBe('Restaurer crée la version 5, copie exacte de la version 2 (document, brief et références). Les versions 1 à 4 restent dans l’historique, rien n’est effacé · pour revenir en arrière, restaure la version 4.');
  });
});

describe('comparaison en phrases · ce que la restauration change', () => {
  it('du point de vue de la courante vers la cible · calque remis, texte et position rendus', () => {
    const { v2, v4 } = versions();
    const c = comparerPourRestauration(v4.contenu, v2.contenu, 2);
    expect(c.tronquee).toBe(false);
    expect(c.phrases).toEqual(expect.arrayContaining([
      'Le brief a changé.',
      'Calque « Fond » ajouté.',
      'Calque « Titre » · position horizontale : 300 px → 60 px',
      'Calque « Titre » · texte : « Nouveau titre » → « Peau nette en 7 jours »',
    ]));
  });
  it('document absent d’un côté · phrase dédiée, jamais « l’autre session »', () => {
    const { v4 } = versions();
    const vide = contenuVide();
    expect(comparerPourRestauration(v4.contenu, vide, 1).phrases).toContain('La version 1 n’a pas de document image · restaurer retire le document de la version courante.');
    expect(comparerPourRestauration(vide, v4.contenu, 4).phrases).toContain('La version 4 a un document image · restaurer le remet.');
    expect(comparerPourRestauration(v4.contenu, v4.contenu, 4)).toEqual({ phrases: [], tronquee: false });
  });
});

describe('auteur en mots', () => {
  it('Toi, nom, adresse, membre masqué, création automatique', () => {
    const a = (o: Partial<{ authorId: string | null; nom: string | null; email: string | null; masque: boolean }>) =>
      libelleAuteurVersion({ authorId: 'u2', nom: null, email: null, masque: false, ...o }, 'u1');
    expect(a({ authorId: 'u1', nom: 'Kevin' })).toBe('Toi');
    expect(a({ nom: ' Léa ' })).toBe('Léa');
    expect(a({ email: 'lea@x.fr' })).toBe('lea@x.fr');
    expect(a({ nom: 'Léa', email: 'lea@x.fr', masque: true })).toBe('Un membre de l’espace');
    expect(a({ authorId: null })).toBe('Création automatique');
  });
});
