import { describe, expect, it } from 'vitest';
import { detailSansEtat, etatProduitPret, resumeVersionPhoto, vueJob, LIBELLES_ETAT_IMAGE, type EtatJob } from '../src';

/**
 * Planche finale · D3 · atelier Produit. Trois règles pures :
 *  · « prêt » = au moins un mode passe le contrôle avant compilation ;
 *  · le message d'un job ne répète pas l'état que la pastille dit déjà ;
 *  · la version de la photo épinglée se dit en clair, jamais par son empreinte.
 */

const bloque = (chemin: string) => ({ ok: false, violations: [{ chemin }] });
const passe = { ok: true, violations: [] };

describe('etatProduitPret · une seule règle décide « prêt »', () => {
  it('rien d’épinglé · le titre neutre, aucun remède', () => {
    expect(etatProduitPret({ epingle: false, peutModifier: true, modes: [passe, passe] })).toEqual({ pret: false, titre: 'Produit du visuel', remede: null });
  });

  it('un mode passe · prêt (c’est la condition de « Préparer mon visuel »)', () => {
    expect(etatProduitPret({ epingle: true, peutModifier: true, modes: [bloque('/brief/references'), passe] })).toEqual({ pret: true, titre: 'Ton produit est prêt', remede: null });
  });

  it('les deux modes bloqués · jamais « prêt », et le geste qui répare est nommé', () => {
    const r = etatProduitPret({ epingle: true, peutModifier: true, modes: [bloque('/brief/references'), bloque('/brief/references')] });
    expect(r.pret).toBe(false);
    expect(r.titre).toBe('Ton produit n’est pas encore prêt');
    expect(r.remede).toContain('« Utiliser cette photo et continuer »');
  });

  it('le remède suit la cause · brief absent, photo changée, lecteur seul', () => {
    expect(etatProduitPret({ epingle: true, peutModifier: true, modes: [bloque('/brief'), bloque('/brief')] }).remede).toContain('pas encore de brief');
    expect(etatProduitPret({ epingle: true, peutModifier: true, modes: [bloque('/productRef/photo'), bloque('/brief/references')] }).remede).toContain('a changé dans le catalogue');
    expect(etatProduitPret({ epingle: true, peutModifier: false, modes: [bloque('/brief/references'), bloque('/brief')] }).remede).toContain('Une personne qui peut modifier');
    expect(etatProduitPret({ epingle: true, peutModifier: true, modes: [bloque('/brief/references/0'), bloque('/brief/references/0')] }).remede).toContain('contrôle avant compilation');
  });
});

describe('detailSansEtat · la pastille dit l’état, le message le détail', () => {
  it('chaque message de `vueJob` perd le préfixe de son propre état, jamais son détail', () => {
    const etats: EtatJob[] = ['queued', 'claimed', 'running', 'persisting', 'completed', 'failed', 'cancel_requested', 'cancelled', 'reconciliation_required'];
    const bilan = { reserve: { credits: 4 }, release: { credits: 0 }, settle: { credits: 0 }, regle: false } as never;
    for (const etat of etats) {
      const libelle = LIBELLES_ETAT_IMAGE[etat];
      const d = detailSansEtat(libelle, vueJob({ etat, qualite: 'passed', preuve: 'aucune', bilan }).message);
      expect(d.startsWith(`${libelle} ·`), `${etat} · « ${d} »`).toBe(false);
    }
  });

  it('exemples · Échec, Terminé, Annulé seul, message sans préfixe', () => {
    expect(detailSansEtat('Échec', 'Échec · aucun crédit consommé en plus de ce qui est indiqué.')).toBe('Aucun crédit consommé en plus de ce qui est indiqué.');
    expect(detailSansEtat('Terminé', 'Terminé · fichier enregistré et accepté.')).toBe('Fichier enregistré et accepté.');
    expect(detailSansEtat('Annulé', 'Annulé.')).toBe('');
    expect(detailSansEtat('Réconciliation', 'Vérification en cours chez le fournisseur.')).toBe('Vérification en cours chez le fournisseur.');
  });
});

describe('resumeVersionPhoto · aucune empreinte à l’écran', () => {
  it('les deux natures se disent en clair, sans identifiant technique', () => {
    for (const n of ['contenu', 'adresse'] as const) expect(resumeVersionPhoto(n)).not.toMatch(/sha|empreinte|[0-9a-f]{8}/i);
    expect(resumeVersionPhoto('adresse')).toContain('distante');
  });
});
