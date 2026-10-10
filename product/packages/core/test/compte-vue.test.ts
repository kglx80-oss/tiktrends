import { describe, expect, it } from 'vitest';
import { familleMouvement, libelleMotif, repartitionConsommation, partConsommeeCycle, etatInvitation } from '../src/compte-vue';

describe('Usage · familles et motifs lisibles', () => {
  it('allocation, ajustement, remboursement ont leur famille · plus de « Autre »', () => {
    expect(familleMouvement('Allocation mensuelle (plan)').label).toBe('Allocation');
    expect(familleMouvement('Ajustement manuel').label).toBe('Ajustement');
    expect(familleMouvement('Remboursement · génération échouée').label).toBe('Remboursement');
    expect(familleMouvement('Studio · génération créative').label).toBe('Studios');
    expect(familleMouvement('adsmap:propose:abc').label).toBe('Adsmap');
    expect(familleMouvement('market:analyze:123').label).toBe('Veille');
  });
  it('« test » seul ne classe plus en Abonnement (« Fin de période de test » oui)', () => {
    expect(familleMouvement('Fin de période de test (révoquée)').label).toBe('Abonnement');
    expect(familleMouvement('Adsmap · lot de test').label).not.toBe('Abonnement');
  });
  it('les clés machine deviennent une phrase', () => {
    expect(libelleMotif('adsmap:propose:9f2')).toBe('Adsmap · propositions de concepts');
    expect(libelleMotif('market:analyze:uuid')).toBe('Veille · analyse du marché');
    expect(libelleMotif('foo:bar:baz')).toBe('Action interne');
    expect(libelleMotif('Pubs IA · 4 statiques')).toBe('Pubs IA · 4 statiques');
  });
});

describe('Usage · répartition honnête', () => {
  const j = (n: number) => new Date(Date.now() - n * 86_400_000);
  it('120 lignes toutes dans la fenêtre · tronquée (le total 30 j peut être plus grand)', () => {
    const lignes = Array.from({ length: 120 }, (_, i) => ({ delta: -1, reason: 'Pubs IA', createdAt: j(i / 10) }));
    expect(repartitionConsommation(lignes, j(30), 120).tronquee).toBe(true);
  });
  it('moins de lignes que la limite · complète ; remboursements exclus de la consommation', () => {
    const r = repartitionConsommation([{ delta: -5, reason: 'Pubs IA', createdAt: j(1) }, { delta: 5, reason: 'Remboursement', createdAt: j(1) }], j(30), 120);
    expect(r).toEqual({ familles: [{ label: 'Studios', icon: 'sparkles', total: 5 }], tronquee: false });
  });
});

describe('Crédits · « Consommé ce cycle » jamais faux', () => {
  it('historique vide · non affiché (plus de 100 % fantôme)', () => {
    expect(partConsommeeCycle({ allocation: 24000, solde: 0, illimite: false, mouvements: 0 }).pct).toBeNull();
  });
  it('au-delà de l’allocation · 0 % et la raison, jamais négatif', () => {
    const r = partConsommeeCycle({ allocation: 1000, solde: 1500, illimite: false, mouvements: 3 });
    expect(r.pct).toBe(0); expect(r.note).toContain('au-dessus');
  });
  it('illimité · non affiché ; cas courant · borné', () => {
    expect(partConsommeeCycle({ allocation: 1000, solde: 0, illimite: true, mouvements: 3 }).pct).toBeNull();
    expect(partConsommeeCycle({ allocation: 1000, solde: 250, illimite: false, mouvements: 3 }).pct).toBe(75);
  });
});

describe('Équipe · invitation expirée', () => {
  it('date passée · expirée ; future ou absente · en attente', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(etatInvitation(new Date('2026-09-30T12:00:00Z'), now)).toBe('expiree');
    expect(etatInvitation(new Date('2026-10-05T12:00:00Z'), now)).toBe('en_attente');
    expect(etatInvitation(null, now)).toBe('en_attente');
  });
});
