import { describe, expect, it } from 'vitest';
import {
  DROITS_V2, FORFAITS_V2, FORFAITS_V2_ORDRE, cartesForfaitsV2, comparatifDroitsV2, descriptionTarifsV2, fourchettePrixV2, nomsForfaitsV2, offresPubliquesV2,
} from '../src';

/**
 * Les pages publiques lisent l'offre V2 par `offresPubliquesV2` · on vérifie
 * qu'elle rend EXACTEMENT ce que montre la page Forfaits de l'appli (même
 * source), et que rien n'y est réécrit.
 */
const visiteur = { plan: '', proprietaire: false, paiement: false, abonne: false, achetable: () => false };
const sp = (s: string | null) => s?.replace(/\s/g, ' ') ?? null;

describe('offre · pages publiques V2', () => {
  const o = offresPubliquesV2();

  it('trois forfaits dans l’ordre du noyau, prix et crédits de la page Forfaits', () => {
    expect(o.map((x) => x.cle)).toEqual([...FORFAITS_V2_ORDRE]);
    const m = cartesForfaitsV2({ ...visiteur, facturation: 'mensuel' });
    const a = cartesForfaitsV2({ ...visiteur, facturation: 'annuel' });
    expect(o.map((x) => x.mensuel.prix)).toEqual(m.map((x) => x.prix));
    expect(o.map((x) => x.annuel.prix)).toEqual(a.map((x) => x.prix));
    expect(o.map((x) => x.annuel.sousPrix)).toEqual(a.map((x) => x.sousPrix));
    expect(o.map((x) => x.credits)).toEqual(FORFAITS_V2_ORDRE.map((k) => FORFAITS_V2[k].creditsMois.toLocaleString('fr-FR')));
    // Valeurs du 29/10, lues pour qu'une dérive du noyau se voie ici aussi.
    expect(o.map((x) => sp(x.mensuel.prix))).toEqual(['29 €', '49 €', '129 €']);
    expect(o.map((x) => sp(x.annuel.prix))).toEqual(['20,30 €', '34,30 €', '90,30 €']);
    expect(o.map((x) => x.mensuel.sousPrix)).toEqual([null, null, null]);
    expect(new Set(o.map((x) => x.mensuel.periode))).toEqual(new Set(['/ mois TTC']));
  });

  it('« Le plus populaire » sur Pro seul, sans engagement, bouton vers l’inscription', () => {
    expect(o.map((x) => x.etiquette)).toEqual([null, 'Le plus populaire', null]);
    expect(o.filter((x) => x.miseEnAvant).map((x) => x.cle)).toEqual(['pro']);
    for (const x of o) {
      expect(x.engagement).toBe('Sans engagement, annulable à tout moment');
      expect(x.bouton).toEqual({ libelle: `Choisir ${x.nom}`, href: '/signup' });
    }
  });

  it('le comparatif reprend les droits appliqués au serveur', () => {
    const c = comparatifDroitsV2();
    const ligne = (l: string) => c.find((x) => x.libelle === l)!.valeurs;
    expect(ligne('Marques')).toEqual({ essentiel: String(DROITS_V2.essentiel.marques), pro: String(DROITS_V2.pro.marques), agence: String(DROITS_V2.agence.marques) });
    expect(ligne('Clone de pubs vidéo')).toEqual({ essentiel: false, pro: true, agence: true });
    expect(ligne('Vidéo finale').pro).toBe(`Jusqu’à ${DROITS_V2.pro.videoMaxSecondes} s`);
  });

  it('noms, fourchette et description · dérivés, sans tiret cadratin', () => {
    expect(nomsForfaitsV2()).toBe('Essentiel, Pro, Agence');
    expect(fourchettePrixV2()).toEqual({ bas: FORFAITS_V2.essentiel.prixMensuelTtc, haut: FORFAITS_V2.agence.prixMensuelTtc, nombre: 3 });
    const tout = JSON.stringify([o, comparatifDroitsV2(), descriptionTarifsV2()]);
    expect(tout).not.toContain('—');
    expect(tout).not.toMatch(/Trendtrack/i);
  });
});
