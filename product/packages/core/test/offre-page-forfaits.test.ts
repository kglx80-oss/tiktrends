import { describe, expect, it } from 'vitest';
import { boutonForfaitV2, cartesForfaitsV2, faqForfaitsV2, forfaitRechargesV2, lireFacturation } from '../src';

describe('page Forfaits V2 · règles', () => {
  const base = { proprietaire: true, paiement: true, abonne: false, achetable: true, facturation: 'mensuel' as const };
  it('le bouton · plan actuel, propriétaire, paiement, portail pour un abonné, prix de l’échéance pour un nouvel abonné', () => {
    expect(boutonForfaitV2({ ...base, forfait: 'pro', actuel: 'pro' })).toEqual({ type: 'desactive', libelle: 'Plan actuel' });
    expect(boutonForfaitV2({ ...base, forfait: 'pro', actuel: 'starter', proprietaire: false }).libelle).toBe('Le propriétaire gère la formule');
    expect(boutonForfaitV2({ ...base, forfait: 'pro', actuel: 'starter', paiement: false }).libelle).toBe('Bientôt disponible');
    expect(boutonForfaitV2({ ...base, forfait: 'agence', actuel: 'core', abonne: true })).toEqual({ type: 'portail', libelle: 'Passer à Agence', primaire: true });
    expect(boutonForfaitV2({ ...base, forfait: 'essentiel', actuel: 'plus', abonne: true })).toEqual({ type: 'portail', libelle: 'Revenir à Essentiel', primaire: false });
    expect(boutonForfaitV2({ ...base, forfait: 'pro', actuel: 'starter' }).libelle).toBe('S’abonner · 49 € / mois');
    expect(boutonForfaitV2({ ...base, forfait: 'pro', actuel: 'starter', facturation: 'annuel' }).libelle.replace(/\s/g, ' ')).toBe('S’abonner · 411,60 € / an');
    expect(boutonForfaitV2({ ...base, forfait: 'pro', actuel: 'starter', achetable: false }).libelle).toBe('Bientôt');
  });
  it('les cartes · une seule mise en avant (Pro), la facturation lue telle quelle', () => {
    const c = cartesForfaitsV2({ plan: 'starter', facturation: 'annuel', proprietaire: true, paiement: true, abonne: false, achetable: () => true });
    expect(c.filter((x) => x.miseEnAvant).map((x) => x.cle)).toEqual(['pro']);
    expect(c.map((x) => x.prix)).toEqual(['20,30 €', '34,30 €', '90,30 €']);
    expect(lireFacturation('annuel')).toBe('annuel');
    expect(lireFacturation('nawak')).toBe('mensuel');
    expect(forfaitRechargesV2('core')).toBeNull();
    expect(forfaitRechargesV2('agence')).toBe('agence');
    for (const q of faqForfaitsV2()) expect(q.reponse).not.toMatch(/€|\$/);
  });
  it('les cartes · « Le plus populaire » sur Pro seul, « Sans engagement, annulable à tout moment », fonctions et limites séparées', () => {
    const c = cartesForfaitsV2({ plan: 'starter', facturation: 'mensuel', proprietaire: true, paiement: true, abonne: false, achetable: () => true });
    expect(c.map((x) => x.etiquette)).toEqual([null, 'Le plus populaire', null]);
    expect(new Set(c.map((x) => x.engagement))).toEqual(new Set(['Sans engagement, annulable à tout moment']));
    expect(c.map((x) => x.sousPrix)).toEqual([null, null, null]);
    expect(c[0]!.limites).toEqual(['1 marque', '1 concurrent suivi par marque', 'Vidéo jusqu’à 15 s']);
    expect(c[1]!.fonctions).toEqual(['Tout Essentiel', 'Résultats · Adsmap complet', 'Clone de pubs vidéo', 'Contrôle visuel activable · au coût réel, en crédits', 'Support prioritaire']);
    const a = cartesForfaitsV2({ plan: 'starter', facturation: 'annuel', proprietaire: true, paiement: true, abonne: false, achetable: () => true });
    expect(a[0]!.sousPrix!.replace(/\s/g, ' ')).toBe('soit 243,60 € TTC prélevés une fois par an');
  });
  it('un abonné Core · Essentiel est sa bascule à l’échéance, pas un « retour »', () => {
    expect(boutonForfaitV2({ ...base, forfait: 'essentiel', actuel: 'core', abonne: true })).toEqual({ type: 'desactive', libelle: 'Le tien à ta prochaine échéance' });
    expect(boutonForfaitV2({ ...base, forfait: 'pro', actuel: 'core', abonne: true })).toEqual({ type: 'portail', libelle: 'Passer à Pro', primaire: true });
  });
});
