import { describe, expect, it } from 'vitest';
import {
  boutonFormule, economiePack, equivalencePack, formuleSuivante, initialesPersonne, nomCourt, prixFormule, rythmeCredits, texteBaremeCredits,
  messagesRetourConnexions, messagesRetourEquipe, messagesRetourForfaits, CREDIT_COSTS, ecranSpatial,
} from '../src';

const base = { actuelle: 'core' as const, proprietaire: true, paiement: true, abonne: false, achetable: true, libelle: 'Plus', prix: 299 };

describe('Spatial · Forfaits · le bouton de chaque formule (même logique que l’écran V5)', () => {
  it('formule actuelle · fermée, quel que soit le reste', () => {
    expect(boutonFormule({ ...base, formule: 'core' })).toEqual({ type: 'desactive', libelle: 'Plan actuel' });
  });
  it('non-propriétaire · fermée · sans paiement · fermée', () => {
    expect(boutonFormule({ ...base, formule: 'plus', proprietaire: false }).type).toBe('desactive');
    expect(boutonFormule({ ...base, formule: 'plus', paiement: false })).toEqual({ type: 'desactive', libelle: 'Bientôt disponible' });
  });
  it('déjà abonné · le portail, avec le sens réel (monter ou revenir)', () => {
    expect(boutonFormule({ ...base, formule: 'plus', abonne: true })).toEqual({ type: 'portail', libelle: 'Passer à Plus', primaire: true });
    expect(boutonFormule({ ...base, formule: 'starter', abonne: true, libelle: 'Starter' })).toEqual({ type: 'portail', libelle: 'Revenir à Starter', primaire: false });
  });
  it('pas abonné · Checkout avec le prix réel, Starter gratuit, formule non vendable fermée', () => {
    expect(boutonFormule({ ...base, formule: 'plus' })).toEqual({ type: 'abonnement', libelle: 'S’abonner · 299 € / mois' });
    expect(boutonFormule({ ...base, formule: 'starter' })).toEqual({ type: 'desactive', libelle: 'Formule gratuite' });
    expect(boutonFormule({ ...base, formule: 'business', achetable: false })).toEqual({ type: 'desactive', libelle: 'Bientôt' });
  });
  it('formule suivante et prix', () => {
    expect([formuleSuivante('starter'), formuleSuivante('business')]).toEqual(['core', null]);
    expect([prixFormule(0), prixFormule(990)]).toEqual(['Gratuit', '990 €']);
  });
});

describe('Spatial · Forfaits · rythme et recharges', () => {
  it('rythme · moyenne par jour, jours restants, aucun calcul sans consommation', () => {
    expect(rythmeCredits(1200, 2400, 30)).toEqual({ parJour: 80, jours: 15, suffisant: true });
    expect(rythmeCredits(500, 2400, 30)).toEqual({ parJour: 80, jours: 6, suffisant: false });
    expect(rythmeCredits(500, 0, 30)).toEqual({ parJour: 0, jours: null, suffisant: true });
    expect(rythmeCredits(0, 0, 30).suffisant).toBe(false);
  });
  it('économie d’un pack · par rapport au prix du crédit du premier, entier, jamais négative', () => {
    const P = [{ key: 'a', credits: 1000, eur: 19 }, { key: 'b', credits: 5000, eur: 79 }, { key: 'c', credits: 20000, eur: 279 }, { key: 'd', credits: 100, eur: 10 }];
    expect([economiePack(P, 'a'), economiePack(P, 'b'), economiePack(P, 'c'), economiePack(P, 'd'), economiePack(P, 'x')]).toEqual([null, 17, 27, null, null]);
  });
  it('équivalences et barème · au coût réel des actions', () => {
    expect(equivalencePack(1000)).toBe(`≈ ${Math.floor(1000 / CREDIT_COSTS.suggest).toLocaleString('fr-FR')} suggestions IA ou ${Math.floor(1000 / CREDIT_COSTS.image)} images`);
    expect(texteBaremeCredits()).toContain(`${CREDIT_COSTS.video} pour une vidéo IA`);
  });
});

describe('Spatial · Équipe · noms et initiales', () => {
  it('initiales depuis le nom, sinon l’e-mail', () => {
    expect([initialesPersonne('Kim Lee', 'k@x.fr'), initialesPersonne(null, 'jean.dupont@x.fr'), initialesPersonne('', 'zo@x.fr')]).toEqual(['KL', 'JD', 'ZO']);
  });
  it('nom court de la maquette', () => {
    expect([nomCourt('Ana Maria Lopez', 'a@x.fr'), nomCourt('Ana', 'a@x.fr'), nomCourt(null, 'a@x.fr')]).toEqual(['Ana L.', 'Ana', 'a@x.fr']);
    // Vu au banc · « Kevin (banc) » donnait « Kevin (. » et « K( ».
    expect([nomCourt('Kevin (banc)', 'k@x.fr'), initialesPersonne('Kevin (banc)', 'k@x.fr'), nomCourt('Kevin -', 'k@x.fr')]).toEqual(['Kevin B.', 'KB', 'Kevin']);
  });
});

describe('Spatial · Réglages · retours d’action et écrans portés', () => {
  it('les messages reprennent les codes des actions serveur', () => {
    expect(messagesRetourEquipe()['ok:invite_mail']).toMatch(/e-mail est parti/);
    expect(messagesRetourForfaits()['e:cancel']).toBe('Paiement annulé.');
    expect(messagesRetourConnexions()['ok:shopify']).toMatch(/Shopify/);
  });
  it('les six Réglages et les cinq écrans Marque sont servis par Spatial', () => {
    for (const c of ['/settings', '/settings/partenaires', '/team', '/connections', '/usage', '/billing', '/brands/x', '/brands/x/identite', '/brands/x/offre', '/brands/x/personas', '/brands/x/regles']) {
      expect(ecranSpatial(c), c).not.toBeNull();
    }
    // La liste des marques et la création restent à l'ancienne interface.
    expect(ecranSpatial('/brands')).toBeNull();
    expect(ecranSpatial('/brands/x/competitors/y')).toBeNull();
  });
});
