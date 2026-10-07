'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  champsACompleter, preremplissageProduit, texteApresCompletude, VARIABLES_A_TESTER, COMPLETER_LE_TEST, BORNES_COMPLETUDE,
  CIBLE_TACTILE_MIN, type ProduitMarque,
} from '@tiktrends/core';
import { completerTestAction, produitsCompletionAction } from '../../actions/adsmap-completer';
import { cadreSignal, tuile, vide } from '../../../components/ui';

/**
 * « Compléter le test » · le formulaire du tiroir d'une ad incomplète (lot 21).
 *
 * Il ne montre QUE ce qui manque (`champsACompleter`, même règle que la
 * préparation d'un lot). L'offre est celle du PRODUIT vendu dans la pub ·
 * prix et adresse se préremplissent depuis un produit de la marque, restent
 * modifiables, et ne s'écrivent qu'une fois confirmés (case par valeur ·
 * modifier la valeur décoche la case). L'hypothèse n'est jamais préremplie.
 *
 * Opération différée · le focus et la saisie restent où ils sont, l'erreur est
 * annoncée (`role="alert"`), un second clic pendant l'envoi ne part pas. Si
 * l'enregistrement retire le champ qui portait le focus, il est rendu au
 * message d'état · jamais pris à un autre élément.
 */
export function CompleterTest({ adId, manques, onEnregistre }: {
  adId: string;
  manques: string[];
  /** Relit la fiche après une écriture réussie. */
  onEnregistre: () => Promise<void> | void;
}) {
  const champs = champsACompleter(manques);
  const veutProduit = champs.offre || champs.page;
  const id = useId();

  const [produits, setProduits] = useState<ProduitMarque[] | null>(null);
  const [erreurProduits, setErreurProduits] = useState('');
  const [hypothese, setHypothese] = useState('');
  const [variable, setVariable] = useState('');
  const [valeur, setValeur] = useState('');
  const [produitId, setProduitId] = useState('');
  const [prix, setPrix] = useState('');
  const [url, setUrl] = useState('');
  const [offreConfirmee, setOffreConfirmee] = useState(false);
  const [pageConfirmee, setPageConfirmee] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const envoiRef = useRef(false);
  const [erreur, setErreur] = useState('');
  const [etat, setEtat] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const etatRef = useRef<HTMLParagraphElement>(null);

  async function chargerProduits() {
    setErreurProduits('');
    try {
      const r = await produitsCompletionAction(adId);
      if (r.error) { setErreurProduits(r.error); return; }
      setProduits(r.produits ?? []);
    } catch {
      setErreurProduits('Les produits de la marque n’ont pas pu être lus · réessaie.');
    }
  }
  useEffect(() => { if (veutProduit) void chargerProduits(); }, [adId, veutProduit]); // eslint-disable-line react-hooks/exhaustive-deps

  const produit = produits?.find((p) => p.id === produitId) ?? null;

  function choisirProduit(idProduit: string) {
    setProduitId(idProduit);
    const pre = preremplissageProduit(produits?.find((p) => p.id === idProduit) ?? null);
    setPrix(pre.prix); setUrl(pre.url);
    setOffreConfirmee(false); setPageConfirmee(false);
  }

  async function envoyer(e?: FormEvent) {
    e?.preventDefault();
    if (envoiRef.current) return;
    envoiRef.current = true;
    setEnvoi(true); setErreur(''); setEtat('');
    try {
      const r = await completerTestAction({
        adId,
        hypothesis: champs.hypothese ? hypothese : null,
        testedVariable: champs.variable ? variable : null,
        variableValue: champs.variable ? valeur : null,
        produitId: produitId || null,
        offre: champs.offre ? { prix, confirmee: offreConfirmee } : null,
        page: champs.page ? { url, confirmee: pageConfirmee } : null,
      });
      if (r.error) { setErreur(r.error); return; }
      setEtat(texteApresCompletude(r.manques ?? []));
      await onEnregistre();
      // Le champ qui portait le focus a pu disparaître (il ne manque plus) ·
      // on rattrape un focus PERDU, on n'en prend jamais un posé ailleurs.
      requestAnimationFrame(() => {
        const actif = document.activeElement;
        if (!actif || actif === document.body) etatRef.current?.focus({ preventScroll: true });
      });
    } catch {
      setErreur('L’enregistrement n’a pas abouti (connexion) · ta saisie est conservée, réessaie. Un nouvel essai ne crée aucun doublon.');
    } finally {
      envoiRef.current = false;
      setEnvoi(false);
    }
  }

  const complet = manques.length === 0;

  return (
    <section id={COMPLETER_LE_TEST.ancre} aria-labelledby={`${id}-titre`} data-completer-test style={{ ...tuile, marginTop: 12, padding: '14px 16px', background: 'var(--paper)' }}>
      <h4 id={`${id}-titre`} style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{COMPLETER_LE_TEST.titre}</h4>

      {complet ? null : (
        <form ref={formRef} onSubmit={envoyer} noValidate aria-busy={envoi}>
          {champs.hypothese && (
            <>
              <Etiquette htmlFor={`${id}-hyp`}>Hypothèse testée</Etiquette>
              <textarea id={`${id}-hyp`} name="hypothese" value={hypothese} onChange={(e) => setHypothese(e.target.value)} rows={3}
                maxLength={BORNES_COMPLETUDE.hypotheseMax} aria-describedby={`${id}-hyp-aide`}
                placeholder="Ex : une preuve chiffrée en ouverture fera passer le hook rate de 22 % à 28 %."
                style={{ ...champ, resize: 'vertical' }} />
              <Aide id={`${id}-hyp-aide`}>À écrire toi-même · quel KPI, quelle étape du funnel, quelle valeur cible.</Aide>
            </>
          )}

          {champs.variable && (
            <>
              <Etiquette htmlFor={`${id}-var`}>Variable testée · une seule</Etiquette>
              <select id={`${id}-var`} name="variable" value={variable} onChange={(e) => setVariable(e.target.value)} style={champ}>
                <option value="">Choisir ce que cette ad change…</option>
                {VARIABLES_A_TESTER.map((v) => <option key={v.valeur} value={v.valeur}>{v.libelle}</option>)}
              </select>
              <Etiquette htmlFor={`${id}-val`}>Valeur testée · facultatif</Etiquette>
              <input id={`${id}-val`} name="valeur" value={valeur} onChange={(e) => setValeur(e.target.value)} maxLength={BORNES_COMPLETUDE.valeurMax}
                placeholder="Ex : accroche chiffrée « 3 erreurs qui… »" style={champ} />
            </>
          )}

          {veutProduit && (
            <fieldset style={{ margin: '14px 0 0', padding: 0, border: 'none', minWidth: 0 }}>
              <legend style={{ padding: 0, fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>
                Le produit vendu dans la pub
              </legend>
              <Aide>
                L’offre ici, c’est le produit vendu dans cette publicité et son prix · rien à voir avec ton abonnement.
              </Aide>
              {produits === null && !erreurProduits && <Aide>Lecture des produits de la marque…</Aide>}
              {erreurProduits && (
                <div role="alert" style={{ marginTop: 8, padding: '8px 11px', ...cadreSignal('rgba(254,44,85,.3)', 'tuile'), color: '#ff8095', fontSize: 12, lineHeight: 1.5 }}>
                  {erreurProduits}{' '}
                  <button type="button" onClick={() => void chargerProduits()} style={{ ...boutonSecondaire, marginTop: 6 }}>Relire les produits</button>
                </div>
              )}
              {produits !== null && produits.length === 0 && (
                <p data-completer-vide style={{ ...vide, margin: '8px 0 0', padding: '10px 12px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  Aucun produit dans cette marque · ajoute le produit (prix et adresse de sa page) dans la fiche Marque, puis reviens rattacher l’offre et la page. L’hypothèse et la variable s’enregistrent déjà.
                </p>
              )}
              {produits !== null && produits.length > 0 && (
                <>
                  <Etiquette htmlFor={`${id}-prod`}>Produit</Etiquette>
                  <select id={`${id}-prod`} name="produit" value={produitId} onChange={(e) => choisirProduit(e.target.value)} style={champ}>
                    <option value="">Choisir le produit…</option>
                    {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>

                  {produit && champs.offre && (
                    <>
                      <Etiquette htmlFor={`${id}-prix`}>Prix affiché dans la pub (€)</Etiquette>
                      <input id={`${id}-prix`} name="prix" inputMode="decimal" value={prix} aria-describedby={`${id}-prix-aide`}
                        onChange={(e) => { setPrix(e.target.value); setOffreConfirmee(false); }} placeholder="Non renseigné" style={champ} />
                      <Aide id={`${id}-prix-aide`}>
                        {produit.prix === null ? 'Ce produit n’a pas de prix enregistré · saisis celui de la pub, ou laisse vide.' : 'Prérempli avec le prix du produit · corrige-le si la pub montre une promotion.'}
                      </Aide>
                      <Confirmation id={`${id}-conf-offre`} coche={offreConfirmee} onChange={setOffreConfirmee}>
                        Je confirme l’offre · {produit.nom} · {prix.trim() ? `${prix.trim()} €` : 'prix non renseigné'}
                      </Confirmation>
                    </>
                  )}

                  {produit && champs.page && (
                    <>
                      <Etiquette htmlFor={`${id}-url`}>Adresse de la page de destination</Etiquette>
                      <input id={`${id}-url`} name="url" type="url" inputMode="url" value={url} aria-describedby={`${id}-url-aide`}
                        onChange={(e) => { setUrl(e.target.value); setPageConfirmee(false); }} placeholder="https://…" style={champ} />
                      <Aide id={`${id}-url-aide`}>
                        {produit.url ? 'Préremplie avec l’adresse du produit · corrige-la si la pub mène ailleurs.' : 'Ce produit n’a pas d’adresse · la page de destination reste à compléter. Colle l’adresse de la page si tu la connais.'}
                      </Aide>
                      <Confirmation id={`${id}-conf-page`} coche={pageConfirmee} onChange={setPageConfirmee} desactive={!url.trim()}>
                        Je confirme la page de destination{url.trim() ? ` · ${url.trim()}` : ' · aucune adresse'}
                      </Confirmation>
                    </>
                  )}
                </>
              )}
            </fieldset>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            <button type="submit" disabled={envoi} aria-disabled={envoi} style={{ ...bouton, opacity: envoi ? 0.6 : 1 }}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      {erreur && (
        <p role="alert" style={{ margin: '10px 0 0', padding: '8px 11px', ...cadreSignal('rgba(254,44,85,.3)', 'tuile'), color: '#ff8095', fontSize: 12, lineHeight: 1.5 }}>
          {erreur}
        </p>
      )}
      <p ref={etatRef} role="status" tabIndex={-1} style={{ margin: etat || complet ? '10px 0 0' : 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, outline: 'none' }}>
        {etat || (complet ? texteApresCompletude([]) : '')}
      </p>
    </section>
  );
}

function Etiquette({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', margin: '12px 0 5px' }}>{children}</label>;
}

function Aide({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{children}</p>;
}

function Confirmation({ id, coche, onChange, desactive = false, children }: { id: string; coche: boolean; onChange: (v: boolean) => void; desactive?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: CIBLE_TACTILE_MIN, marginTop: 6, fontSize: 12, color: desactive ? 'var(--muted)' : 'var(--ink)', cursor: desactive ? 'not-allowed' : 'pointer', overflowWrap: 'anywhere' }}>
      <input id={id} type="checkbox" checked={coche && !desactive} disabled={desactive} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 20, height: 20, flexShrink: 0, accentColor: 'var(--accent-strong)', cursor: 'inherit' }} />
      <span>{children}</span>
    </label>
  );
}

const champ: CSSProperties = {
  width: '100%', minHeight: CIBLE_TACTILE_MIN, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line-2)',
  background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const bouton: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '9px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
  color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
};

const boutonSecondaire: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '9px 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent',
  color: 'var(--ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
};
