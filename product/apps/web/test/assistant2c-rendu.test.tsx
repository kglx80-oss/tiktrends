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
  lectures: 0,
  compiler: [] as unknown[], retenir: [] as unknown[], jeteCompiler: false,
  approuver: [] as unknown[], devisDemande: [] as unknown[], manuel: [] as unknown[], appliquer: [] as unknown[],
  reponseApprouver: null as unknown, reponseDevis: null as unknown, vue: null as VueParcoursImage | null,
  // Mutation PAYANTE dont la RÉPONSE est perdue : la demande est ENREGISTRÉE
  // (le serveur a pu l'accepter et débiter) PUIS l'appel throw (réseau coupé).
  jeteApprouver: false,
  // Mutation GRATUITE (devis) dont la réponse est perdue : enregistrée puis throw.
  jeteDevis: false,
  // Course réseau : réponses retardées, résolues à la main, dans l'ordre choisi.
  lireDiffere: null as null | (() => Promise<unknown>),
}));

vi.mock('../app/actions/studios/image', () => ({
  compilerConsigneImage: async (e: unknown) => { h.compiler.push(e); if (h.jeteCompiler) throw new Error('réseau'); h.vue = { ...h.vue!, enAttente: consigne, retenue: null }; return {ok:true, statut:'compilee'}; },
  retenirConsigneImage: async (e: unknown) => { h.retenir.push(e); h.vue = {...h.vue!, enAttente:null, retenue:{...consigne, verdict:{ok:true}}, version:{id:'v2',n:2}}; return {ok:true}; },
  lireParcoursImage: async () => {
    h.lectures++;
    if (h.lireDiffere) return h.lireDiffere();
    return h.vue ? { ok: true, vue: h.vue } : { ok: false, code: 'UNSUPPORTED_CAPABILITY', message: 'coupée', targetIds: ['generation_image'], recoverable: true, traceId: 't' };
  },
  // Par défaut, le devis créé est corrélé à la vue (id q1) · un test peut le changer.
  demanderDevisImage: async (e: unknown) => { h.devisDemande.push(e); if (h.jeteDevis) throw new Error('réseau coupé après l’envoi'); return h.reponseDevis ?? { ok: true, devis: { id: 'q1', inputHash: 'HASH-ABC' } }; },
  approuverEtLancerImage: async (e: unknown) => {
    h.approuver.push(e); // la demande est enregistrée AVANT tout échec réseau
    if (h.jeteApprouver) throw new Error('réseau coupé après l’envoi');
    return h.reponseApprouver ?? { ok: true, job: { id: 'job-1', etat: 'queued', quoteId: 'q1', idempotencyKey: 'k', brandId: 'b', projectId: 'p' }, deja: false };
  },
}));
vi.mock('../app/actions/studios/propositions', () => ({
  creerPropositionManuelle: async (e: unknown) => { h.manuel.push(e); return { ok: true, statut: 'proposee', projectId: 'proj-1', proposition: { id: 'prop-f' }, runId: null }; },
  appliquerProposition: async (e: unknown) => { h.appliquer.push(e); return { ok: true, projectId: 'proj-1', proposition: { id: 'prop-f' }, version: { id: 'v2', n: 2 }, deja: false }; },
}));

import { EtatCreationAssistant } from '../components/studios/projet/EtatCreationAssistant';
import { EtapeConfirmation } from '../components/studios/projet/EtapeConfirmation';
import { EtapeFormatDevis } from '../components/studios/projet/EtapeFormatDevis';
import { MESSAGE_LANCEMENT_INCERTAIN, MESSAGE_DEVIS_INCONNU, type BriefCanonique } from '@tiktrends/core';

const devis: DevisImageVue = {
  id: 'q1', inputHash: 'HASH-ABC', credits: 4, usdMicros: 600_000,
  expiresAt: '2026-10-18T10:30:00Z',
  qualification: { nature: 'borne', libelle: 'maximum', raison: null },
  lignes: [{ libelle: 'Image · publicité', usdMicros: 600_000, natureCout: 'borne', motifEstimation: null }],
};

const briefVide: BriefCanonique = { objective: 'o', audience: '', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] };

const consigne = {runId:'run-1', mode:'faithful_composite' as const, libelleMode:'Produit fidèle', generationInstruction:'Placer le flacon au centre sur fond rose', negativeConstraints:['Ne pas inventer de promesse'], protectedComponents:['Logo'], liaisons:[], format:{largeur:1080,hauteur:1350}, compileeLe:'2026-10-21'};
const vueParcours = (devisVu: DevisImageVue | null): VueParcoursImage => ({
  projet: { id: 'proj-1' }, version: { id: 'v1', n: 1 }, modes: [{mode:'faithful_composite',libelle:'Produit fidèle',pret:true}],
  format: { largeur: 1080, hauteur: 1350, libelle: 'Portrait · 4:5', depuisBrief: false },
  disponibilite: {compilation:{disponible:true,raison:''},retenir:{disponible:true,raison:''},devis:{disponible:true,raison:''},lancement:{disponible:true,raison:''}}, coutCompilationUsd: 0.14, prix: { credits: 4, usdMicros: 600_000 },
  enAttente: null, retenue: {...consigne,verdict:{ok:true}}, devis: devisVu, jobs: [],
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

beforeEach(() => { h.lectures=0; h.compiler=[]; h.retenir=[]; h.jeteCompiler=false; h.approuver = []; h.devisDemande = []; h.manuel = []; h.appliquer = []; h.reponseApprouver = null; h.reponseDevis = null; h.vue = null; h.jeteApprouver = false; h.jeteDevis = false; h.lireDiffere = null; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

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

  it('réponse PERDUE sur le lancement payant · message INCERTAIN, DEUX boutons verrouillés, aucun second appel ni navigation', async () => {
    h.jeteApprouver = true; // la demande est enregistrée AVANT la perte réseau
    const lances: unknown[] = [];
    const modifs: number[] = [];
    const { hote, fermer } = await monter(<EtapeConfirmation devis={devis} onModifier={() => modifs.push(1)} onLance={(j) => lances.push(j)} />);
    const confirmer = () => hote.querySelector('[data-bouton="confirmer-generer"]') as HTMLButtonElement;
    const modifier = () => hote.querySelector('[data-bouton="modifier"]') as HTMLButtonElement;

    await cocher(hote.querySelector('[data-champ="verifie"] input'));
    await clic(confirmer());
    await flush();

    // La demande a été transmise une fois · elle a PU être acceptée et débitée.
    expect(h.approuver, 'la première demande doit avoir été transmise').toHaveLength(1);
    // Message honnête EXACT · jamais « rien n’a été débité ».
    const alerte = hote.querySelector('[data-etat="erreur"]');
    expect(alerte, 'le message incertain n’est pas montré').not.toBeNull();
    expect(alerte!.textContent).toBe(MESSAGE_LANCEMENT_INCERTAIN);
    expect(alerte!.textContent).not.toMatch(/rien n’a été (confirmé|débité)/);
    // Les DEUX boutons sont verrouillés (pas de double lancement / double débit).
    expect(confirmer().disabled, 'Confirmer doit rester verrouillé après l’incertitude').toBe(true);
    expect(modifier().disabled, 'Modifier doit être verrouillé après l’incertitude').toBe(true);

    // Un SECOND clic ne déclenche NI nouvel appel NI navigation.
    await clic(confirmer());
    await clic(modifier());
    await flush();
    expect(h.approuver, 'un clic après l’incertitude ne doit RIEN relancer').toHaveLength(1);
    expect(lances, 'aucune navigation après une réponse perdue').toHaveLength(0);
    expect(modifs, 'Modifier verrouillé ne doit pas revenir au format').toHaveLength(0);
    await fermer();
  });
});

describe('étape FORMAT & DEVIS · demande le VRAI devis, ne fabrique rien', () => {
  it('nouveau projet : coût avant compilation explicite, relecture puis retenir avant devis', async () => {
    h.vue = {...vueParcours(null),retenue:null};
    const {hote,fermer}=await monter(<EtapeFormatDevis projectId="proj-1" version={{id:'v1',n:1}} brief={{...briefVide,formats:['4:5']}} onBriefChange={()=>{}} onDevisPret={()=>{}} onRetour={()=>{}} />);
    expect(h.compiler).toHaveLength(0);
    expect((hote.querySelector('[data-bouton="voir-devis"]') as HTMLButtonElement).disabled).toBe(true);
    const cout=hote.querySelector('[data-cout="compilation"]')!; const bouton=hote.querySelector('[data-bouton="compiler-consigne"]')!;
    expect(cout.textContent).toContain('payante'); expect(cout.compareDocumentPosition(bouton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await clic(bouton); await flush(); expect(h.compiler).toHaveLength(1); expect(h.retenir).toHaveLength(0); expect(h.devisDemande).toHaveLength(0);
    expect(hote.textContent).toContain(consigne.generationInstruction);
    await clic(hote.querySelector('[data-bouton="retenir-consigne"]')); await flush(); expect(h.retenir).toHaveLength(1);
    h.vue={...h.vue!,devis}; await clic(hote.querySelector('[data-bouton="voir-devis"]')); await flush(); expect(h.devisDemande).toHaveLength(1); await fermer();
  });
  it('format modifié : enregistré avant préparation, aucun devis ni génération automatique', async()=>{
    h.vue={...vueParcours(null),retenue:null};
    const {hote,fermer}=await monter(<EtapeFormatDevis projectId="proj-1" version={{id:'v1',n:1}} brief={briefVide} onBriefChange={()=>{}} onDevisPret={()=>{}} onRetour={()=>{}} />);
    await clic(hote.querySelector('[data-format="9:16"]')); await clic(hote.querySelector('[data-bouton="compiler-consigne"]'));
    expect(h.manuel[0]).toMatchObject({changes:[{path:'/brief/formats',newValue:['9:16']}]}); expect(h.appliquer).toHaveLength(1); expect(h.compiler).toHaveLength(1); expect(h.devisDemande).toHaveLength(0); expect(h.approuver).toHaveLength(0); await fermer();
  });
  it('réponse compilation perdue : aucune relance payante automatique',async()=>{
    h.vue={...vueParcours(null),retenue:null}; h.jeteCompiler=true;
    const {hote,fermer}=await monter(<EtapeFormatDevis projectId="proj-1" version={{id:'v1',n:1}} brief={{...briefVide,formats:['4:5']}} onBriefChange={()=>{}} onDevisPret={()=>{}} onRetour={()=>{}} />);
    await clic(hote.querySelector('[data-bouton="compiler-consigne"]')); await clic(hote.querySelector('[data-bouton="compiler-consigne"]'));
    expect(h.compiler).toHaveLength(1); expect(hote.querySelector('[role="alert"]')?.textContent).toContain('incertaine'); await fermer();
  });

  it('produit ou photo manquants : lien réel, compilation verrouillée',async()=>{
    h.vue={...vueParcours(null),retenue:null,modes:[{mode:'faithful_composite',libelle:'Produit fidèle',pret:false}],disponibilite:{...vueParcours(null).disponibilite,compilation:{disponible:false,raison:'Choisir une photo produit'}}};
    const {hote,fermer}=await monter(<EtapeFormatDevis projectId="proj-1" version={{id:'v1',n:1}} brief={{...briefVide,formats:['4:5']}} onBriefChange={()=>{}} onDevisPret={()=>{}} onRetour={()=>{}} />);
    expect(hote.querySelector('a[href="/studio/projets/proj-1/produit"]')?.textContent).toContain('photo');
    await clic(hote.querySelector('[data-bouton="compiler-consigne"]')); expect(h.compiler).toHaveLength(0); await fermer();
  });
  it('plafond atteint : motif serveur affiché, aucune préparation payante',async()=>{
    h.vue={...vueParcours(null),retenue:null,disponibilite:{...vueParcours(null).disponibilite,compilation:{disponible:false,raison:'Plafond de dépense atteint'}}};
    const {hote,fermer}=await monter(<EtapeFormatDevis projectId="proj-1" version={{id:'v1',n:1}} brief={{...briefVide,formats:['4:5']}} onBriefChange={()=>{}} onDevisPret={()=>{}} onRetour={()=>{}} />);
    expect(hote.textContent).toContain('Plafond de dépense atteint'); await clic(hote.querySelector('[data-bouton="compiler-consigne"]')); expect(h.compiler).toHaveLength(0); await fermer();
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

  it('réponse de devis PERDUE · état INCONNU honnête (jamais « rien n’a été deviser »), rien remonté', async () => {
    h.vue = vueParcours(null);
    h.jeteDevis = true; // la demande est enregistrée AVANT la perte réseau
    const devisPrets: DevisImageVue[] = [];
    const { hote, fermer } = await monter(
      <EtapeFormatDevis projectId="proj-1" version={{ id: 'v1', n: 1 }} brief={{ ...briefVide, formats: ['4:5'] }}
        onBriefChange={() => {}} onDevisPret={(d) => devisPrets.push(d)} onRetour={() => {}} />,
    );
    await flush();
    await clic(hote.querySelector('[data-bouton="voir-devis"]'));
    await flush();
    const alerte = hote.querySelector('[data-etat="erreur"]');
    expect(alerte, 'aucun message d’état sur la perte réseau').not.toBeNull();
    expect(alerte!.textContent).toBe(MESSAGE_DEVIS_INCONNU);
    expect(alerte!.textContent).not.toMatch(/rien n’a été (deviser|devisé)/);
    expect(devisPrets, 'aucun devis ne doit être remonté sur une réponse perdue').toHaveLength(0);
    await fermer();
  });

  it('course réseau · devis relu NON corrélé à LA demande (« dernier devis du projet ») ⇒ rejeté, rien remonté', async () => {
    // Le projet a un devis plus récent (q-autre) qui n'est PAS celui que cette demande a créé.
    h.vue = vueParcours({ ...devis, id: 'q-autre' });
    h.reponseDevis = { ok: true, devis: { id: 'q-de-cette-demande', inputHash: 'H' } };
    const devisPrets: DevisImageVue[] = [];
    const { hote, fermer } = await monter(
      <EtapeFormatDevis projectId="proj-1" version={{ id: 'v1', n: 1 }} brief={{ ...briefVide, formats: ['4:5'] }}
        onBriefChange={() => {}} onDevisPret={(d) => devisPrets.push(d)} onRetour={() => {}} />,
    );
    await flush();
    await clic(hote.querySelector('[data-bouton="voir-devis"]'));
    await flush();
    expect(devisPrets, 'un devis non corrélé à la demande ne doit JAMAIS être remonté').toHaveLength(0);
    const alerte = hote.querySelector('[data-etat="erreur"]');
    expect(alerte, 'un devis non corrélé doit afficher l’état inconnu').not.toBeNull();
    expect(alerte!.textContent).toBe(MESSAGE_DEVIS_INCONNU);
    await fermer();
  });

  it('course réseau · devis en vol ⇒ format, relecture et Retour sont VERROUILLÉS pendant la demande', async () => {
    h.vue = vueParcours(null);
    const { hote, fermer } = await monter(
      <EtapeFormatDevis projectId="proj-1" version={{ id: 'v1', n: 1 }} brief={{ ...briefVide, formats: ['4:5'] }}
        onBriefChange={() => {}} onDevisPret={() => {}} onRetour={() => {}} />,
    );
    await flush(); // le chargement initial a résolu · la vue est posée (relecture rendue)
    // On diffère SEULEMENT la lecture déclenchée par la demande de devis.
    let resoudre: (v: unknown) => void = () => {};
    h.lireDiffere = () => new Promise((res) => { resoudre = res; }); // lecture EN VOL
    await clic(hote.querySelector('[data-bouton="voir-devis"]'));
    await flush(); // demanderDevisImage résolu, lireParcoursImage reste en vol
    const fmt = () => hote.querySelector('[data-format="9:16"]') as HTMLButtonElement;
    const rel = () => hote.querySelector('[data-champ="relecture"] input') as HTMLInputElement;
    const ret = () => hote.querySelector('[data-bouton="retour-direction"]') as HTMLButtonElement;
    expect(fmt().disabled, 'le format doit être verrouillé pendant la demande').toBe(true);
    expect(rel().disabled, 'la relecture doit être verrouillée pendant la demande').toBe(true);
    expect(ret().disabled, 'Retour doit être verrouillé pendant la demande').toBe(true);
    // Fin de la demande · le verrou se lève.
    await act(async () => { resoudre({ ok: true, vue: vueParcours(devis) }); await Promise.resolve(); });
    await flush();
    expect(ret().disabled, 'le verrou doit se lever à la fin de la demande').toBe(false);
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

describe('création réelle dans l’assistant',()=>{
  it('affiche uniquement le média de la tâche demandée et son statut qualité',async()=>{
    h.vue={...vueParcours(null),jobs:[{id:'job-1',etat:'completed',libelleEtat:'Terminée',message:'Image disponible',raisonEchec:null,annulable:false,terminal:true,qualite:'requires_review',libelleQualite:'À relire',creditsReserves:4,creditsRendus:0,creeLe:'2026-10-21',media:{assetId:'asset-1',url:'/api/asset/asset-1',largeur:1080,hauteur:1350}}]};
    const {hote,fermer}=await monter(<EtatCreationAssistant projectId="proj-1" jobId="job-1" onFermer={()=>{}} />);
    expect(hote.querySelector('img')?.getAttribute('src')).toBe('/api/asset/asset-1'); expect(hote.textContent).toContain('À relire'); expect(hote.querySelector('a')?.getAttribute('href')).toBe('/studio/projets/proj-1/image'); expect(h.approuver).toHaveLength(0); expect(h.compiler).toHaveLength(0); await fermer();
  });
  it('suivi en lecture seule : actualise puis arrête le polling quand la tâche est terminale',async()=>{
    vi.useFakeTimers();
    const job={id:'job-1',etat:'running' as const,libelleEtat:'En cours',message:'Rendu en cours',raisonEchec:null,annulable:false,terminal:false,qualite:'requires_review' as const,libelleQualite:'À relire',creditsReserves:4,creditsRendus:null,creeLe:'2026-10-21',media:null};
    h.vue={...vueParcours(null),jobs:[job]}; const {hote,fermer}=await monter(<EtatCreationAssistant projectId="proj-1" jobId="job-1" onFermer={()=>{}} />);
    expect(h.lectures).toBe(1); expect(hote.textContent).toContain('En cours');
    h.vue={...h.vue,jobs:[{...job,etat:'completed',terminal:true,libelleEtat:'Terminée'}]};
    await act(async()=>{await vi.advanceTimersByTimeAsync(3000)}); expect(h.lectures).toBe(2);
    await act(async()=>{await vi.advanceTimersByTimeAsync(12000)}); expect(h.lectures).toBe(2);
    expect(h.compiler).toHaveLength(0); expect(h.approuver).toHaveLength(0); expect(h.devisDemande).toHaveLength(0); await fermer();
  });
  it('tâche inconnue : erreur visible, aucune création ni relance inventée',async()=>{
    h.vue=vueParcours(null); const {hote,fermer}=await monter(<EtatCreationAssistant projectId="proj-1" jobId="inconnu" onFermer={()=>{}} />);
    expect(hote.querySelector('[role="alert"]')?.textContent).toContain('n’apparaît pas'); expect(hote.querySelector('img')).toBeNull(); expect(h.approuver).toHaveLength(0); await fermer();
  });
});

/*
 * Mutations éprouvées (cassées → test rouge sur la bonne assertion → restaurées) :
 *  · rendre le bouton de confirmation AVANT le bloc devis → « devis avant le clic » tombe (ordre DOM).
 *  · retirer le `disabled={!verifie}` → « verrouillé avant vérification » tombe.
 *  · avaler le BUDGET_EXCEEDED (ne pas afficher l'erreur) → « dépassement montré » tombe.
 *  · ne pas remonter vue.devis (onDevisPret jamais appelé) → « devis réel remonté » tombe.
 *  · catch de confirmation remis à « rien n'a été débité » sans setIncertain → « réponse PERDUE » tombe (message + boutons verrouillés).
 *  · retirer `incertain` du disabled des boutons → « DEUX boutons verrouillés » tombe.
 *  · remonter r.vue.devis sans corréler l'id à d.devis.id → « devis non corrélé rejeté » tombe (onDevisPret appelé à tort).
 *  · retirer `disabled={occupe}` des contrôles format/relecture/Retour → « verrouillés pendant la demande » tombe.
 *  · catch du devis remis à « rien n'a été deviser » → « réponse de devis PERDUE » tombe.
 */
