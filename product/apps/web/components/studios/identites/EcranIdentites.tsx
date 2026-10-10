'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CATEGORIES_ATTRIBUT, LIBELLES_CATEGORIE, etatEchecStudio, messageHorsLigneStudio, ECHEC_RESEAU_STUDIO, VUES_IDENTITE, LIBELLES_VUE, BORNES_IDENTITE, formatSecondes,
  type CategorieAttribut, type VueIdentite, type ErreurStudio, type ModeParole,
} from '@tiktrends/core';
import type { VueIdentites, IdentiteVue } from '../../../lib/studios/identites/commandes';
import { enregistrerIdentite, lierIdentite, resoudreContradiction, choisirModeParole } from '../../../app/actions/studios/identites';
import { useFocusApresGeste, cleRetour } from '../projet/focus-geste';
import { panneau, carte, titre, sousTitre, etiquette, texte, mini, boutonPrimaire, boutonSecondaire, desactive, champ, signal, pastille, rangee } from '../propositions/styles';

/**
 * Identités de personnages et voix d'un projet (cahier §4.5, §4.6).
 *
 *  · Contradictions d'abord : tant qu'un plan contredit sa fiche, le devis de
 *    ce plan est REFUSÉ par le serveur. Chaque contradiction propose deux
 *    résolutions explicites ; aucune n'est appliquée sans clic.
 *  · Fiches : attributs immuables (élément + couleur du lexique), version,
 *    plans liés. Enregistrer crée une version du projet (409 si elle a bougé).
 *  · Voix : la synthèse vocale et la parole synchronisée sont dites
 *    indisponibles ; la voix off est proposée ; l'option lipsync n'est jamais
 *    activable. Les durées affichées sont LUES dans les prises existantes.
 *
 * Aucun geste de cet écran ne coûte : aucun appel modèle, aucun devis.
 */

type Ligne = { id?: string; categorie: CategorieAttribut; element: string; couleur: string; detail: string };
type Edition = { identityId: string | null; nom: string; description: string; vues: VueIdentite[]; attributs: Ligne[] };

const vide = (): Edition => ({ identityId: null, nom: '', description: '', vues: ['front'], attributs: [{ categorie: 'tenue', element: '', couleur: '', detail: '' }] });
const depuis = (i: IdentiteVue): Edition => ({
  identityId: i.identityId, nom: i.nom, description: i.description, vues: i.vues,
  attributs: i.attributs.map((a) => ({ id: a.id, categorie: a.categorie, element: a.element, couleur: a.couleur ?? '', detail: a.detail })),
});

function messageErreur(r: ErreurStudio): string {
  if (r.code === 'VERSION_CONFLICT') return 'Le projet a changé depuis l’ouverture de cette page · rien n’a été écrasé. Recharge pour repartir de la version courante.';
  if (r.violations?.length) return r.violations.map((v) => v.raison).join(' · ');
  return r.message;
}

/** « Tenue · veste verte », mais « Cheveux bruns » (pas « Cheveux · cheveux bruns »). */
function libelleAttributVue(a: IdentiteVue['attributs'][number]): string {
  if (a.libelle.toLowerCase().startsWith(a.libelleCategorie.toLowerCase())) return a.libelle[0]!.toUpperCase() + a.libelle.slice(1);
  return `${a.libelleCategorie} · ${a.libelle}`;
}

const LIBELLE_MODE: Readonly<Record<ModeParole, string>> = { voiceover: 'Voix off', lipsync: 'Parole synchronisée (lipsync)', none: 'Sans voix' };

export function EcranIdentites({ vue, voixActive = true }: { vue: VueIdentites; voixActive?: boolean }) {
  const id = useId();
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string; conflit?: boolean; code?: string } | null>(null);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [liaisons, setLiaisons] = useState<Record<string, string[]>>(() => Object.fromEntries(vue.identites.map((i) => [i.identityId, i.plans])));
  const peut = vue.peutProposer && enCours === null;
  // F1 · « Voix » coupée pour l'espace : les modes de parole se lisent, ne se changent pas.
  const peutVoix = peut && voixActive;
  const base = vue.version.id;

  async function geste(cle: string, action: () => Promise<{ ok: true; version: { n: number }; inchange: boolean } | ErreurStudio>, ok: string) {
    setEnCours(cle);
    setRetour(null);
    try {
      const r = await action();
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r), conflit: r.code === 'VERSION_CONFLICT', code: r.code }); return false; }
      setRetour({ ok: true, texte: r.inchange ? 'Aucun changement à enregistrer.' : `${ok} · version ${r.version.n}.` });
      router.refresh();
      return true;
    } catch {
      setRetour({ ok: false, texte: messageHorsLigneStudio('enregistrement'), code: ECHEC_RESEAU_STUDIO });
      return false;
    } finally { setEnCours(null); }
  }

  const nomIdentite = (iid: string) => vue.identites.find((i) => i.identityId === iid)?.nom ?? iid;
  const rang = (sid: string) => vue.plans.find((p) => p.shotId === sid)?.rang ?? sid;
  const v = vue.voix;
  // L8-B · UX-02 · le message, le formulaire ouvert, ou le geste d'ouverture reçoivent le focus
  // (mesuré avant : BODY après « Nouvelle fiche », « Annuler » et « Enregistrer la fiche »).
  const ecran = useRef<HTMLDivElement>(null);
  const retourRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusApresGeste({ apercu: false, retour: cleRetour(retour), formulaire: !!edition }, {
    conteneur: ecran, retour: retourRef, formulaire: formRef,
    repli: () => ecran.current?.querySelector<HTMLElement>('[data-geste="nouvelle-fiche"]') ?? null,
  });
  const echec = retour && !retour.ok ? etatEchecStudio(retour.code) : null;

  return (
    <div ref={ecran} style={{ display: 'grid', gap: 18 }}>
      {retour && (
        <div ref={retourRef} tabIndex={-1} role={retour.ok ? 'status' : 'alert'} data-retour={retour.ok ? 'ok' : 'refus'} style={signal(retour.ok ? 'ok' : echec!.ton)}>
          <span style={{ fontWeight: 600 }}>{retour.ok ? 'Fait · ' : `${echec!.mot} · `}</span>{retour.texte}
          {retour.conflit && <div style={{ marginTop: 8 }}><button type="button" style={boutonSecondaire} onClick={() => window.location.reload()}>Recharger la version courante</button></div>}
        </div>
      )}

      <section aria-labelledby={`${id}-contra`} style={panneau} data-zone="contradictions">
        <h2 id={`${id}-contra`} style={titre}>Contradictions avec les fiches</h2>
        {vue.contradictions.length === 0 ? (
          <p style={texte} data-etat="sans-contradiction">Aucune contradiction · chaque plan lié dit la même chose que sa fiche. Les devis de ces plans peuvent être demandés.</p>
        ) : (
          <>
            <div role="alert" style={signal('warn')} data-etat="devis-bloque">
              <span style={{ fontWeight: 600 }}>Devis bloqué · </span>
              {vue.contradictions.length === 1 ? 'un plan contredit sa fiche' : `${vue.contradictions.length} passages contredisent leur fiche`}. Le devis de ces plans est refusé tant que tu n’as pas choisi une résolution. Rien n’est facturé.
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              {vue.contradictions.map((k) => (
                <li key={k.id} style={carte} data-contradiction={k.id}>
                  <p style={{ ...texte, color: 'var(--ink)' }}>{k.message}</p>
                  <p style={mini}>Plan {rang(k.shotId)} · fiche de {k.nomIdentite} · {k.nature === 'absence' ? 'élément absent du plan' : 'couleur différente'}</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {k.resolutions.map((r) => (
                      <div key={r.type} style={{ display: 'grid', gap: 4 }}>
                        <button
                          type="button" data-resolution={r.type} disabled={!peut} style={{ ...(r.type === 'plan' ? boutonPrimaire : boutonSecondaire), ...(peut ? {} : desactive), textAlign: 'left', whiteSpace: 'normal' }}
                          onClick={() => geste(`res-${k.id}-${r.type}`, () => resoudreContradiction({ projectId: vue.projet.id, baseVersionId: base, contradictionId: k.id, choix: r.type }), 'Résolution appliquée')}
                        >
                          {enCours === `res-${k.id}-${r.type}` ? 'Enregistrement…' : r.libelle}
                        </button>
                        {r.type === 'identite' && (
                          <span style={mini}>
                            Touche {r.plansTouches.length} plan{r.plansTouches.length > 1 ? 's' : ''} ({r.plansTouches.map((s) => `plan ${rang(s)}`).join(', ')}) : leurs images seront à refaire.
                            {r.contradictionsApres > 0 ? ` Après ce choix, ${r.contradictionsApres} contradiction${r.contradictionsApres > 1 ? 's resteraient' : ' resterait'} dans le projet.` : ' Plus aucune contradiction ensuite.'}
                          </span>
                        )}
                      </div>
                    ))}
                    {k.resolutions.length === 1 && <span style={mini}>Fiche d’une ancienne forme · seule la correction du plan est proposée. Recrée la fiche pour pouvoir la changer.</span>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby={`${id}-fiches`} style={panneau} data-zone="fiches">
        <div style={{ ...rangee, justifyContent: 'space-between' }}>
          <h2 id={`${id}-fiches`} style={titre}>Fiches d’identité</h2>
          {vue.peutProposer && !edition && <button type="button" data-geste="nouvelle-fiche" style={boutonSecondaire} onClick={() => setEdition(vide())}>Nouvelle fiche</button>}
        </div>
        <p style={sousTitre}>Les attributs d’une fiche sont immuables pour les plans : un plan qui dit autre chose est bloqué avant devis. Changer la fiche crée une nouvelle version, et les plans liés deviennent à refaire.</p>
        {vue.identites.length === 0 && !edition && <p style={texte} data-etat="sans-fiche">Aucun personnage récurrent dans ce projet.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {vue.identites.map((i) => (
            <li key={i.identityId} style={carte} data-identite={i.identityId}>
              <div style={{ ...rangee, justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{i.nom}</h3>
                <span style={pastille(i.structuree ? 'var(--ok)' : 'var(--warn)')}>{i.structuree ? `Fiche version ${i.version}` : 'Ancienne forme · lecture seule'}</span>
              </div>
              {i.description && <p style={mini}>{i.description}</p>}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {i.attributs.map((a) => <li key={a.id} style={pastille('var(--line-2)')}>{libelleAttributVue(a)}{a.detail ? ` · ${a.detail}` : ''}</li>)}
              </ul>
              <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <legend style={etiquette}>Plans liés</legend>
                {vue.plans.length === 0 ? <p style={mini}>Aucun plan · le storyboard crée les plans.</p> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {vue.plans.map((p) => {
                      const coche = (liaisons[i.identityId] ?? []).includes(p.shotId);
                      return (
                        <label key={p.shotId} style={{ ...rangee, minHeight: 44, gap: 6, fontSize: 14, color: 'var(--ink-2)' }}>
                          <input
                            type="checkbox" checked={coche} disabled={!vue.peutProposer} style={{ width: 20, height: 20 }}
                            onChange={() => setLiaisons((l) => ({ ...l, [i.identityId]: coche ? (l[i.identityId] ?? []).filter((s) => s !== p.shotId) : [...(l[i.identityId] ?? []), p.shotId] }))}
                          />
                          Plan {p.rang}
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
              {vue.peutProposer && (
                <div style={rangee}>
                  <button type="button" disabled={!peut} style={{ ...boutonSecondaire, ...(peut ? {} : desactive) }}
                    onClick={() => geste(`lier-${i.identityId}`, () => lierIdentite({ projectId: vue.projet.id, baseVersionId: base, identityId: i.identityId, shotIds: liaisons[i.identityId] ?? [] }), `Liaison de ${i.nom} enregistrée`)}>
                    Enregistrer les plans liés
                  </button>
                  {i.structuree && !edition && <button type="button" style={boutonSecondaire} onClick={() => setEdition(depuis(i))}>Modifier la fiche</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
        {edition && (
          <form
            ref={formRef} style={carte} data-zone="edition-fiche"
            onSubmit={async (ev) => {
              ev.preventDefault();
              const ok = await geste('fiche', () => enregistrerIdentite({
                projectId: vue.projet.id, baseVersionId: base, identityId: edition.identityId ?? undefined, nom: edition.nom, description: edition.description, vues: edition.vues.length ? edition.vues : undefined,
                attributs: edition.attributs.map((a) => ({ id: a.id, categorie: a.categorie, element: a.element, couleur: a.couleur || null, detail: a.detail })),
              }), `Fiche « ${edition.nom} » enregistrée`);
              if (ok) setEdition(null);
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{edition.identityId ? `Modifier ${nomIdentite(edition.identityId)}` : 'Nouvelle fiche'}</h3>
            <label style={{ display: 'grid' }}>
              <span style={etiquette}>Nom du personnage</span>
              <input style={champ} value={edition.nom} maxLength={BORNES_IDENTITE.nom} required onChange={(e) => setEdition({ ...edition, nom: e.target.value })} />
            </label>
            <datalist id={`${id}-couleurs`}>{vue.couleurs.map((c) => <option key={c} value={c} />)}</datalist>
            {edition.attributs.map((a, n) => (
              <fieldset key={n} style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', minWidth: 0 }}>
                <legend style={etiquette}>Attribut {n + 1}</legend>
                <label style={{ display: 'grid' }}>
                  <span style={mini}>Catégorie</span>
                  <select style={champ} value={a.categorie} onChange={(e) => setEdition({ ...edition, attributs: edition.attributs.map((x, k) => (k === n ? { ...x, categorie: e.target.value as CategorieAttribut } : x)) })}>
                    {CATEGORIES_ATTRIBUT.map((c) => <option key={c} value={c}>{LIBELLES_CATEGORIE[c]}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid' }}>
                  <span style={mini}>Élément (veste, cheveux, lunettes)</span>
                  <input style={champ} value={a.element} maxLength={BORNES_IDENTITE.element} onChange={(e) => setEdition({ ...edition, attributs: edition.attributs.map((x, k) => (k === n ? { ...x, element: e.target.value } : x)) })} />
                </label>
                <label style={{ display: 'grid' }}>
                  <span style={mini}>Couleur (liste fermée, facultative)</span>
                  <input style={champ} list={`${id}-couleurs`} value={a.couleur} onChange={(e) => setEdition({ ...edition, attributs: edition.attributs.map((x, k) => (k === n ? { ...x, couleur: e.target.value } : x)) })} />
                </label>
                <label style={{ display: 'grid' }}>
                  <span style={mini}>Précision</span>
                  <input style={champ} value={a.detail} maxLength={BORNES_IDENTITE.detail} onChange={(e) => setEdition({ ...edition, attributs: edition.attributs.map((x, k) => (k === n ? { ...x, detail: e.target.value } : x)) })} />
                </label>
                <button type="button" style={boutonSecondaire} onClick={() => setEdition({ ...edition, attributs: edition.attributs.filter((_, k) => k !== n) })}>Retirer l’attribut {n + 1}</button>
              </fieldset>
            ))}
            <div style={rangee}>
              <button type="button" style={boutonSecondaire} disabled={edition.attributs.length >= BORNES_IDENTITE.attributs} onClick={() => setEdition({ ...edition, attributs: [...edition.attributs, { categorie: 'accessoire', element: '', couleur: '', detail: '' }] })}>Ajouter un attribut</button>
            </div>
            <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <legend style={etiquette}>Vues utiles</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {VUES_IDENTITE.map((w) => (
                  <label key={w} style={{ ...rangee, minHeight: 44, gap: 6, fontSize: 14, color: 'var(--ink-2)' }}>
                    <input type="checkbox" style={{ width: 20, height: 20 }} checked={edition.vues.includes(w)} onChange={() => setEdition({ ...edition, vues: edition.vues.includes(w) ? edition.vues.filter((x) => x !== w) : [...edition.vues, w] })} />
                    {LIBELLES_VUE[w]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label style={{ display: 'grid' }}>
              <span style={etiquette}>Description</span>
              <textarea style={{ ...champ, minHeight: 72 }} value={edition.description} maxLength={BORNES_IDENTITE.description} onChange={(e) => setEdition({ ...edition, description: e.target.value })} />
            </label>
            <div style={rangee}>
              <button type="submit" disabled={!peut} style={{ ...boutonPrimaire, ...(peut ? {} : desactive) }}>{enCours === 'fiche' ? 'Enregistrement…' : 'Enregistrer la fiche'}</button>
              <button type="button" style={boutonSecondaire} onClick={() => setEdition(null)}>Annuler</button>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby={`${id}-voix`} style={panneau} data-zone="voix">
        <h2 id={`${id}-voix`} style={titre}>Voix et temps</h2>
        {!voixActive && (
          <p role="status" data-etat="non-active" data-capacite="voix" style={signal('info')}>
            <span style={{ fontWeight: 600 }}>Voix · non activé pour cet espace. </span>
            Les modes de parole restent lisibles ; les changer s’ouvrira avec la voix, d’abord pour des espaces pilotes.
          </p>
        )}
        <div style={signal('info')} data-capacite="synthese">
          <span style={{ fontWeight: 600 }}>{v.capacites.synthese.disponible ? 'Synthèse vocale disponible · ' : 'Synthèse vocale indisponible · '}</span>
          {v.capacites.synthese.disponible ? 'chaque prise est devisée avant d’être produite.' : v.capacites.synthese.raison.replace(/^La synthèse vocale n’est pas disponible · /, '')} La voix ne prononce que la narration validée de chaque plan.
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {v.modes.map((m) => (
            <li key={m.mode} style={carte} data-mode={m.mode} data-disponible={m.disponible ? 'oui' : 'non'}>
              <div style={{ ...rangee, justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{m.libelle}</strong>
                <span style={pastille(m.disponible ? 'var(--ok)' : 'var(--muted)')}>{m.disponible ? (m.mode === 'voiceover' ? 'Proposé' : 'Possible') : 'Indisponible'}</span>
              </div>
              <p style={mini}>{m.description}</p>
              {m.raison && <p style={{ ...mini, color: 'var(--ink-2)' }}>{m.raison}</p>}
            </li>
          ))}
        </ul>
        {v.plansLipsync.length > 0 && (
          <div role="alert" style={signal('warn')} data-etat="lipsync-indisponible">
            <span style={{ fontWeight: 600 }}>Parole synchronisée demandée sans fournisseur · </span>
            {v.plansLipsync.map((s) => `plan ${rang(s)}`).join(', ')}. Rien n’est simulé : passe {v.plansLipsync.length > 1 ? 'ces plans' : 'ce plan'} en voix off (la voix est posée sur les images) ou retire la parole.
            <div style={{ marginTop: 8 }}>
              <button type="button" disabled={!peutVoix} style={{ ...boutonPrimaire, ...(peutVoix ? {} : desactive) }}
                onClick={() => geste('voixoff', () => choisirModeParole({ projectId: vue.projet.id, baseVersionId: base, shotIds: v.plansLipsync, mode: 'voiceover' }), 'Passage en voix off enregistré')}>
                Passer en voix off
              </button>
            </div>
          </div>
        )}
        {vue.plans.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {vue.plans.map((p) => {
              const t = v.temps.plans.find((x) => x.shotId === p.shotId);
              const prise = v.prises[p.shotId] ?? { etat: 'absente' as const };
              return (
                <li key={p.shotId} style={carte} data-plan={p.shotId}>
                  <div style={{ ...rangee, justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 14, color: 'var(--ink)' }}>Plan {p.rang}</strong>
                    <span style={mini}>{p.identites.length ? p.identites.map(nomIdentite).join(', ') : 'aucune fiche liée'}</span>
                  </div>
                  <p style={texte}>{p.narration ? <>Narration validée : « {p.narration} »</> : 'Pas de narration.'}</p>
                  <label style={{ display: 'grid', maxWidth: 360 }}>
                    <span style={etiquette}>Mode de parole</span>
                    <select
                      style={champ} value={p.mode} disabled={!peutVoix}
                      onChange={(e) => { const mode = e.target.value; void geste(`mode-${p.shotId}`, () => choisirModeParole({ projectId: vue.projet.id, baseVersionId: base, shotIds: [p.shotId], mode }), `Mode du plan ${p.rang} enregistré`); }}
                    >
                      {v.modes.map((m) => <option key={m.mode} value={m.mode} disabled={!m.disponible}>{LIBELLE_MODE[m.mode]}{m.disponible ? '' : ' · indisponible'}</option>)}
                    </select>
                  </label>
                  <p style={mini} data-prise={prise.etat}>
                    {prise.etat === 'mesuree'
                      ? `Prise existante · durée mesurée ${formatSecondes(prise.dureeMs)} (lue dans l’en-tête ${prise.format.toUpperCase()}${prise.tronque ? ', fichier tronqué' : ''}) pour ${formatSecondes(p.estimeMs)} prévues.`
                      : prise.etat === 'illisible'
                        ? `Prise illisible · ${prise.motif}. Durée prévue ${formatSecondes(p.estimeMs)}.`
                        : `Aucune prise · durée prévue ${formatSecondes(p.estimeMs)}, à confirmer par une prise réelle.`}
                    {t && t.depassementMs > 0 ? ` Le plan passe à ${formatSecondes(t.retenuMs)}.` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <p style={{ ...texte, color: v.temps.depassementMs > 0 ? 'var(--ink)' : 'var(--ink-2)' }} data-temps={v.temps.depassementMs > 0 ? 'depassement' : 'dans-la-cible'}>{v.temps.message}</p>
      </section>
    </div>
  );
}
