// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { DevisImageVue, VueParcoursImage } from '../lib/studios/image/parcours';

/**
 * Raccord V5 · Lot 2c · les étapes FORMAT & DEVIS et CONFIRMATION, au RÉSULTAT
 * (HTML). On monte les VRAIS composants (jsdom) et on LIT ce qu'on voit :
 *
 *  · le DEVIS serveur réel (montant, lignes, échéance) s'affiche AVANT le bouton
 *    de confirmation · on compare l'ordre dans le DOM, pas la présence d'un appel ;
 *  · « Confirmer et générer » est verrouillé tant que « J'ai vérifié le devis »
 *    n'est pas coché, et appelle `approuverEtLancerImage` avec l'identifiant,
 *    l'empreinte et les crédits du devis ;
 *  · un `BUDGET_EXCEEDED` rendu par le serveur est MONTRÉ, et rien n'est lancé ;
 *  · « Modifier » revient au format (invalide le devis côté parcours) ;
 *  · l'étape format demande le VRAI devis et ne fabrique rien : sans consigne
 *    retenue, le message réel du serveur s'affiche.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  approuver: [] as unknown[], devisDemande: [] as unknown[], manuel: [] as unknown[], appliquer: [] as unknown[],
  reponseApprouver: null as unknown, reponseDevis: null as unknown, vue: null as VueParcoursImage | null,
}));

vi.mock('../app/actions/studios/image', () => ({
  lireParcoursImage: async () => (h.vue ? { ok: true, vue: h.vue } : { ok: false, code: 'UNSUPPORTED_CAPABILITY', message: 'coupée', targetIds: ['generation_image'], recoverable: true, traceId: 't' }),
  demanderDevisImage: async (e: unknown) => { h.devisDemande.push(e); return h.reponseDevis ?? { ok: true, devis: {} }; },
  approuverEtLancerImage: async (e: unknown) => { h.approuver.push(e); return h.reponseApprouver ?? { ok: true, job: { id: 'job-1', etat: 'queued', quoteId: 'q1', idempotencyKey: 'k', brandId: 'b', projectId: 'p' }, deja: false }; },
}));
vi.mock('../app/actions/studios/propositions', () => ({
  creerPropositionManuelle: async (e: unknown) => { h.manuel.push(e); return { ok: true, statut: 'proposee', projectId: 'proj-1', proposition: { id: 'prop-f' }, runId: null }; },
  appliquerProposition: async (e: unknown) => { h.appliquer.push(e); return { ok: true, projectId: 'proj-1', proposition: { id: 'prop-f' }, version: { id: 'v2', n: 2 }, deja: false }; },
}));

import { EtapeConfirmation } from '../components/studios/projet/EtapeConfirmation';
import { EtapeFormatDevis } from '../components/studios/projet/EtapeFormatDevis';
import type { BriefCanonique } from '@tiktrends/core';

const devis: DevisImageVue = {
  id: 'q1', inputHash: 'HASH-ABC', credits: 4, usdMicros: 600_000,
  expiresAt: '2026-10-18T10:30:00Z',
  qualification: { nature: 'borne', libelle: 'maximum', raison: null },
  lignes: [{ libelle: 'Image · publicité', usdMicros: 600_000, natureCout: 'borne', motifEstimation: null }],
};

const briefVide: BriefCanonique = { objective: 'o', audience: '', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] };

const vueParcours = (devisVu: DevisImageVue | null): VueParcoursImage => ({
  projet: { id: 'proj-1' }, version: { id: 'v1', n: 1 }, modes: [],
  format: { largeur: 1080, hauteur: 1350, libelle: 'Portrait · 4:5', depuisBrief: false },
  disponibilite: {} as VueParcoursImage['disponibilite'], coutCompilationUsd: 0.14, prix: { credits: 4, usdMicros: 600_000 },
  enAttente: null, retenue: null, devis: devisVu, jobs: [],
  controleVision: { disponible: true, borneParImageUsdMicros: 147_000 }, composantsObligatoires: [], peutRelire: true,
});

async function monter(node: React.ReactElement) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  await act(async () => { racine.render(node); });
  return { hote, fermer: async () => { await act(async () => { racine.unmount(); }); hote.remove(); } };
}
const clic = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click(); await Promise.resolve(); }); };
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
const cocher = async (el: Element | null) => {
  expect(el).not.toBeNull();
  const c = el as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')!.set!.call(c, true);
  await act(async () => { c.dispatchEvent(new Event('click', { bubbles: true })); c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); });
};

beforeEach(() => { h.approuver = []; h.devisDemande = []; h.manuel = []; h.appliquer = []; h.reponseApprouver = null; h.reponseDevis = null; h.vue = null; });
afterEach(() => { document.body.innerHTML = ''; });

describe('étape CONFIRMATION · le devis serveur AVANT le clic, confirmation transactionnelle', () => {
  it('le montant, les lignes et l’échéance du devis s’affichent AVANT le bouton de confirmation', async () => {
    const { hote, fermer } = await monter(<EtapeConfirmation devis={devis} onModifier={() => {}} onLance={() => {}} />);
    const bloc = hote.querySelector('[data-devis="q1"]');
    const bouton = hote.querySelector('[data-bouton="confirmer-generer"]');
    expect(bloc, 'devis non rendu').not.toBeNull();
    expect(bouton, 'bouton de confirmation absent').not.toBeNull();
    // RÉSULTAT lu dans le HTML : le montant réel et l'échéance sont présents…
    const html = (hote.querySelector('[data-prix="devis"]') as HTMLElement).textContent ?? '';
    expect(html).toContain('0,60'); // 600 000 micros = 0,60 $
    expect(html).toMatch(/12:30|10:30|11:30/); // échéance (fuseau Europe/Paris)
    expect(hote.querySelector('[data-lignes="devis"] [data-ligne-nature="borne"]'), 'ligne du devis absente').not.toBeNull();
    // …et ils précèdent le bouton dans l'ordre du document (devis AVANT le clic).
    const pos = bloc!.compareDocumentPosition(bouton!);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING, 'le bouton de confirmation ne suit pas le devis').toBeTruthy();
    await fermer();
  });

  it('« Confirmer » est verrouillé tant que le devis n’est pas vérifié, puis appelle approuverEtLancerImage', async () => {
    const lances: unknown[] = [];
    const { hote, fermer } = await monter(<EtapeConfirmation devis={devis} onModifier={() => {}} onLance={(j) => lances.push(j)} />);
    const bouton = () => hote.querySelector('[data-bouton="confirmer-generer"]') as HTMLButtonElement;
    expect(bouton().disabled, 'le bouton doit être verrouillé avant vérification').toBe(true);
    await clic(bouton()); // clic verrouillé · rien ne part
    expect(h.approuver, 'un clic verrouillé ne doit rien lancer').toHaveLength(0);

    await cocher(hote.querySelector('[data-champ="verifie"] input'));
    expect(bouton().disabled, 'le bouton doit s’activer une fois vérifié').toBe(false);
    await clic(bouton());
    await flush();
    expect(h.approuver, 'la confirmation n’a pas appelé approuverEtLancerImage').toHaveLength(1);
    expect(h.approuver[0]).toMatchObject({ quoteId: 'q1', inputHash: 'HASH-ABC', creditsAnnonces: 4 });
    expect((h.approuver[0] as { idempotencyKey: string }).idempotencyKey, 'clé d’idempotence manquante').toBeTruthy();
    expect(lances, 'onLance non appelé après un lancement réussi').toHaveLength(1);
    await fermer();
  });

  it('un dépassement de plafond (BUDGET_EXCEEDED) est MONTRÉ et rien n’est lancé', async () => {
    h.reponseApprouver = { ok: false, code: 'BUDGET_EXCEEDED', message: 'Le plafond de dépense ne permet pas ce lancement · 2,40 $ > 2,00 $.', targetIds: ['q1'], recoverable: true, traceId: 't' };
    const lances: unknown[] = [];
    const { hote, fermer } = await monter(<EtapeConfirmation devis={devis} onModifier={() => {}} onLance={(j) => lances.push(j)} />);
    await cocher(hote.querySelector('[data-champ="verifie"] input'));
    await clic(hote.querySelector('[data-bouton="confirmer-generer"]'));
    await flush();
    const alerte = hote.querySelector('[data-etat="erreur"]');
    expect(alerte, 'le message de dépassement n’est pas montré').not.toBeNull();
    expect(alerte!.textContent).toContain('plafond');
    expect(lances, 'rien ne doit être lancé sur un dépassement').toHaveLength(0);
    await fermer();
  });

  it('« Modifier » revient au format (invalide le devis)', async () => {
    const modifs: number[] = [];
    const { hote, fermer } = await monter(<EtapeConfirmation devis={devis} onModifier={() => modifs.push(1)} onLance={() => {}} />);
    await clic(hote.querySelector('[data-bouton="modifier"]'));
    expect(modifs, '« Modifier » n’a pas rappelé onModifier').toHaveLength(1);
    await fermer();
  });
});

describe('étape FORMAT & DEVIS · demande le VRAI devis, ne fabrique rien', () => {
  it('« Voir le devis serveur » écrit le format choisi puis demande le devis, et remonte le devis réel', async () => {
    h.vue = vueParcours(null); // pas encore de devis
    const devisPrets: DevisImageVue[] = [];
    const { hote, fermer } = await monter(
      <EtapeFormatDevis projectId="proj-1" version={{ id: 'v1', n: 1 }} brief={briefVide}
        onBriefChange={() => {}} onDevisPret={(d) => devisPrets.push(d)} onRetour={() => {}} />,
    );
    await flush();
    // choisir 9:16 puis demander le devis
    await clic(hote.querySelector('[data-format="9:16"]'));
    // au moment du devis, le serveur a créé le devis · la relecture lue rend vue.devis
    h.vue = vueParcours(devis);
    await clic(hote.querySelector('[data-bouton="voir-devis"]'));
    await flush();
    // le format a été écrit (ratio nu) via une proposition appliquée (gratuit)
    expect((h.manuel[0] as { changes: Array<{ path: string; newValue: unknown }> }).changes[0]!.path).toBe('/brief/formats');
    expect((h.manuel[0] as { changes: Array<{ newValue: unknown }> }).changes[0]!.newValue).toEqual(['9:16']);
    expect(h.appliquer, 'le format n’a pas été appliqué').toHaveLength(1);
    // le devis réel a été demandé puis remonté au parent (pas fabriqué)
    expect(h.devisDemande, 'demanderDevisImage non appelé').toHaveLength(1);
    expect(devisPrets, 'devis réel non remonté').toHaveLength(1);
    expect(devisPrets[0]!.id).toBe('q1');
    await fermer();
  });

  it('relecture décochée ⇒ controleVision:false transmis au devis (ligne retirée)', async () => {
    h.vue = vueParcours(devis);
    const { hote, fermer } = await monter(
      <EtapeFormatDevis projectId="proj-1" version={{ id: 'v1', n: 1 }} brief={{ ...briefVide, formats: ['4:5'] }}
        onBriefChange={() => {}} onDevisPret={() => {}} onRetour={() => {}} />,
    );
    await flush();
    const case_ = hote.querySelector('[data-champ="relecture"] input') as HTMLInputElement;
    expect(case_.checked, 'la relecture est cochée par défaut').toBe(true);
    await clic(case_); // un clic natif la décoche (change avec checked=false)
    expect(case_.checked, 'la relecture doit être décochée après le clic').toBe(false);
    await clic(hote.querySelector('[data-bouton="voir-devis"]'));
    await flush();
    expect((h.devisDemande[0] as { controleVision: unknown }).controleVision).toBe(false);
    await fermer();
  });

  it('génération coupée pour l’espace ⇒ état honnête, aucun bouton de devis', async () => {
    h.vue = null; // lireParcoursImage renvoie UNSUPPORTED_CAPABILITY
    const { hote, fermer } = await monter(
      <EtapeFormatDevis projectId="proj-1" version={{ id: 'v1', n: 1 }} brief={briefVide}
        onBriefChange={() => {}} onDevisPret={() => {}} onRetour={() => {}} />,
    );
    await flush();
    expect(hote.querySelector('[data-zone="format-non-active"]'), 'état « non activé » non rendu').not.toBeNull();
    expect(hote.querySelector('[data-bouton="voir-devis"]'), 'aucun bouton de devis quand c’est coupé').toBeNull();
    await fermer();
  });
});

/*
 * Mutations éprouvées (cassées → test rouge sur la bonne assertion → restaurées) :
 *  · rendre le bouton de confirmation AVANT le bloc devis → « devis avant le clic » tombe (ordre DOM).
 *  · retirer le `disabled={!verifie}` → « verrouillé avant vérification » tombe.
 *  · avaler le BUDGET_EXCEEDED (ne pas afficher l'erreur) → « dépassement montré » tombe.
 *  · ne pas remonter vue.devis (onDevisPret jamais appelé) → « devis réel remonté » tombe.
 */
