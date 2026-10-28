'use client';

import { useId, useRef, useState, type RefObject } from 'react';
import {
  TYPES_CONNAISSANCE, LIBELLE_TYPE, LIBELLE_ETAT, LIBELLE_ORIGINE, LIMITE_TEXTE, LIMITE_TITRE, EXTENSIONS_FICHIER,
  verifierFichierTexte, libellePortee, familleType, changementPortee, AVERTISSEMENT_CONFIDENTIALITE,
  avertissementPublication, publicationExigeConfirmation, CONFIRMATION_PUBLICATION_PLATEFORME, REFUS_PUBLICATION_PLATEFORME,
  type TypeConnaissance, type EtatVersion, type ModeOrigine, type PorteeConnaissance, type SaisieConnaissance,
} from '@tiktrends/core';
import {
  creerConnaissanceAction, nouvelleVersionAction, publierConnaissanceAction, retirerConnaissanceAction,
  type VueAdminConnaissances,
} from '../../../app/actions/connaissances';
import { Barre } from './base';

/**
 * Les Connaissances dans Spatial (ancien `/admin/connaissances`) · déposer,
 * publier, éditer, retirer, et voir ce que Jarvis lit réellement. Mêmes
 * actions (`actions/connaissances` · garde « accès total » reposée), mêmes
 * règles du noyau (portée, confirmation plateforme, fichier lu dans le
 * navigateur). Aucun geste n'est payant · rien ici n'appelle un modèle.
 *
 * Trois mots, trois choses · PUBLIÉE (en service), INCLUSE (dans le contexte
 * d'une réponse), CITÉE (la réponse s'en est réclamée).
 */

type Marque = { id: string; name: string; workspaceId: string };
type Espace = { id: string; name: string };
type Item = VueAdminConnaissances['items'][number];

interface Brouillon {
  titre: string; type: TypeConnaissance; texte: string; mode: ModeOrigine; fichier: string | null;
  niveau: PorteeConnaissance['niveau']; workspaceId: string; brandId: string;
}
const VIDE: Brouillon = { titre: '', type: 'instruction', texte: '', mode: 'saisie', fichier: null, niveau: 'plateforme', workspaceId: '', brandId: '' };

const nf = (n: number) => n.toLocaleString('fr-FR');
const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const TON_ETAT: Record<EtatVersion, '' | 'g' | 'r'> = { publie: 'g', brouillon: '', retire: 'r' };

export function ConnaissancesSpatiales({ vueInitiale, espaces, marques }: { vueInitiale: VueAdminConnaissances; espaces: Espace[]; marques: Marque[] }) {
  const [vue, setVue] = useState(vueInitiale);
  const [note, setNote] = useState<{ ok: boolean; texte: string } | null>(null);
  const [edition, setEdition] = useState<{ id: string; base: number; porteeAvant: PorteeConnaissance; valeurs: Brouillon } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const portee = (p: PorteeConnaissance) => libellePortee(p, {
    espace: p.niveau === 'plateforme' ? null : espaces.find((e) => e.id === p.workspaceId)?.name ?? null,
    marque: p.niveau === 'marque' ? marques.find((m) => m.id === p.brandId)?.name ?? null : null,
  });

  async function geste(f: () => Promise<{ vue?: VueAdminConnaissances; error?: string }>, ok: string): Promise<boolean> {
    if (occupe) return false;
    setOccupe(true); setNote(null);
    try {
      const r = await f();
      if (r.vue) setVue(r.vue);
      if (r.error) { setNote({ ok: false, texte: r.error }); return false; }
      setNote({ ok: true, texte: ok });
      return true;
    } catch {
      setNote({ ok: false, texte: 'La connexion s’est interrompue · rien n’a été perdu, réessaie.' });
      return false;
    } finally { setOccupe(false); }
  }

  const editer = (it: Item) => {
    const d = it.versions[0]!;
    setEdition({
      id: it.id, base: it.derniere, porteeAvant: d.portee,
      valeurs: { titre: d.titre, type: d.type, texte: d.texte, mode: 'saisie', fichier: null, niveau: d.portee.niveau, workspaceId: d.portee.niveau === 'plateforme' ? '' : d.portee.workspaceId, brandId: d.portee.niveau === 'marque' ? d.portee.brandId : '' },
    });
    setNote(null);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const publies = vue.items.filter((i) => i.etat === 'publie').length;
  const a = vue.apercu;

  return (
    <>
      <section className="tile" aria-labelledby="ctx-titre">
        <div className="sech"><h2 id="ctx-titre">Ce que Jarvis lit à chaque réponse</h2></div>
        <p role="note" className="banner" style={{ margin: '0 0 10px' }}>{AVERTISSEMENT_CONFIDENTIALITE}</p>
        <p className="muted" style={{ margin: 0, fontSize: '12.5px' }}>
          Portée plateforme · <b>{nf(a.taille)} / {nf(a.plafond)}</b> caractères · {a.inclus.length ? `${a.inclus.length} connaissance(s) incluse(s) dans le contexte de chaque réponse.` : 'aucune connaissance publiée en portée plateforme · Jarvis répond sans ce bloc.'}
        </p>
        <div role="meter" aria-label="Place occupée dans le contexte" aria-valuemin={0} aria-valuemax={a.plafond} aria-valuenow={a.taille} style={{ margin: '10px 0' }}><Barre part={(a.taille / Math.max(1, a.plafond)) * 100} over={a.taille >= a.plafond} style={{ width: '100%' }} /></div>
        {a.inclus.some((i) => i.tronquee) && <p className="pill w" style={{ whiteSpace: 'normal' }}>Tronqué · {a.inclus.filter((i) => i.tronquee).map((i) => `« ${i.titre} » (${nf(i.caracteresOmis)} caractères non lus)`).join(', ')}.</p>}
        {a.exclues.length > 0 && <p className="pill w" style={{ whiteSpace: 'normal' }}>Hors place · {a.exclues.map((e) => `« ${e.titre} »`).join(', ')} n’entre(nt) pas dans le contexte · retire ou raccourcis une connaissance.</p>}
        {a.conflits.length > 0 && <p className="pill w" style={{ whiteSpace: 'normal' }}>Conflit · {a.conflits.length} connaissance(s) avaient deux versions publiées · la plus récente est seule retenue.</p>}
        <ul className="faint" style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4, fontSize: 12 }}>
          <li><b>Publiée</b> · la version est en service, elle a le droit d’entrer dans le contexte.</li>
          <li><b>Incluse</b> · elle était dans le contexte d’une réponse de Jarvis (compté à chaque réponse).</li>
          <li><b>Citée</b> · déclarée par le modèle · la réponse s’en est réclamée par un marqueur de source. Ce n’est pas une preuve d’usage, et une question qui dicte le marqueur n’est pas comptée.</li>
          <li>Les connaissances sont lues comme des <b>données</b> · elles ne lèvent pas les règles de Jarvis, et les règles maison d’une marque passent devant.</li>
          <li>Une connaissance <b>retirée</b> n’entre plus dans les réponses suivantes, y compris dans une conversation ouverte. Les réponses déjà données ne sont pas réécrites.</li>
        </ul>
      </section>

      {note && <p role={note.ok ? 'status' : 'alert'} className={`pill ${note.ok ? 'g' : 'r'} sec`} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{note.texte}</p>}

      <div ref={formRef} className="sec">
        <FormulaireConnaissance
          key={edition ? `${edition.id}-${edition.base}` : 'nouveau'}
          initial={edition?.valeurs ?? VIDE}
          porteeAvant={edition?.porteeAvant}
          titreFormulaire={edition ? `Nouvelle version · v${edition.base + 1}` : 'Nouvelle connaissance'}
          espaces={espaces} marques={marques} occupe={occupe}
          onAnnuler={edition ? () => setEdition(null) : undefined}
          onEnvoyer={async (saisie, publier, confirmerPortee, confirmerPlateforme) => {
            if (edition) {
              const ok = await geste(() => nouvelleVersionAction({ id: edition.id, base: edition.base, saisie, publier, confirmerPortee, confirmerPlateforme }),
                publier ? `Version v${edition.base + 1} publiée · elle remplace la précédente dès la prochaine réponse.` : `Version v${edition.base + 1} enregistrée en brouillon · la version en service continue de servir.`);
              if (ok) setEdition(null);
              return ok;
            }
            return geste(() => creerConnaissanceAction({ ...saisie, publier, confirmerPlateforme }),
              publier ? 'Connaissance publiée · elle entre dans le contexte dès la prochaine réponse.' : 'Brouillon enregistré · il n’entre pas dans le contexte tant qu’il n’est pas publié.');
          }}
        />
      </div>

      <section className="tile sec" aria-labelledby="liste-titre">
        <div className="sech"><h2 id="liste-titre">Déposées</h2><span className="faint" style={{ fontSize: '12.5px' }}>{vue.items.length} au total · {publies} publiée(s)</span></div>
        {vue.items.length === 0 ? (
          <div data-etat="vide"><b>Aucune connaissance pour l’instant.</b><p className="muted" style={{ margin: '6px 0 0', fontSize: '12.5px' }}>Jarvis répond aujourd’hui avec ses seules règles et la mémoire de chaque marque. Dépose une première consigne ou une méthode d’itération ci-dessus · saisie, collage ou fichier .md.</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {vue.items.map((it) => (
              <Carte key={it.id} it={it} portee={portee(it.portee)} occupe={occupe}
                inclusion={a.inclus.find((i) => i.id === it.id) ?? null}
                horsPlace={a.exclues.some((e) => it.versions.some((v) => v.ref === e.ref))}
                onEditer={() => editer(it)}
                onPublier={(n, confirmerPlateforme) => geste(() => publierConnaissanceAction({ id: it.id, n, confirmerPlateforme }), `v${n} publiée · elle entre dans le contexte dès la prochaine réponse.`)}
                onRetirer={() => geste(() => retirerConnaissanceAction({ id: it.id }), 'Retirée · elle n’entre plus dans le contexte des réponses suivantes. Les réponses déjà données restent telles quelles.')}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function FormulaireConnaissance({ initial, porteeAvant, titreFormulaire, espaces, marques, occupe, onAnnuler, onEnvoyer }: {
  initial: Brouillon; titreFormulaire: string; espaces: Espace[]; marques: Marque[]; occupe: boolean; onAnnuler?: () => void; porteeAvant?: PorteeConnaissance;
  onEnvoyer: (s: SaisieConnaissance, publier: boolean, confirmerPortee: boolean, confirmerPlateforme: boolean) => Promise<boolean>;
}) {
  const [b, setB] = useState<Brouillon>(initial);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Brouillon>) => setB((x) => ({ ...x, ...p }));
  const aide = TYPES_CONNAISSANCE.find((t) => t.key === b.type)?.aide;
  const trop = b.texte.length > LIMITE_TEXTE;
  const id = useId();

  async function lireFichier(f: File | undefined) {
    setErreurFichier(null);
    if (!f) return;
    const avant = verifierFichierTexte({ nom: f.name, octets: f.size });
    if (!avant.ok) { setErreurFichier(avant.erreur); return; }
    const contenu = await f.text();
    const apres = verifierFichierTexte({ nom: f.name, octets: f.size, contenu });
    if (!apres.ok) { setErreurFichier(apres.erreur); return; }
    const titreFichier = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, LIMITE_TITRE);
    setB((x) => ({ ...x, texte: apres.valeur.texte ?? '', mode: 'fichier', fichier: apres.valeur.nom, titre: x.titre || titreFichier }));
  }

  const saisie = (): SaisieConnaissance => ({
    titre: b.titre, type: b.type, texte: b.texte,
    origine: { mode: b.mode, fichier: b.mode === 'fichier' ? b.fichier : null },
    portee: { niveau: b.niveau, workspaceId: b.workspaceId || null, brandId: b.brandId || null },
  });

  // Élargir ou déplacer la portée expose le texte à d'autres lecteurs · confirmé avant tout envoi (règle du noyau).
  const porteeApres: PorteeConnaissance | null = b.niveau === 'plateforme' ? { niveau: 'plateforme' }
    : b.niveau === 'espace' ? (b.workspaceId ? { niveau: 'espace', workspaceId: b.workspaceId } : null)
    : (b.workspaceId && b.brandId ? { niveau: 'marque', workspaceId: b.workspaceId, brandId: b.brandId } : null);
  const changement = porteeAvant && porteeApres ? changementPortee(porteeAvant, porteeApres) : null;
  const [confirme, setConfirme] = useState(false);
  const bloque = occupe || (!!changement && !confirme);
  const [confirmePub, setConfirmePub] = useState(false);
  const [refusPub, setRefusPub] = useState<string | null>(null);
  const caseRef = useRef<HTMLInputElement>(null);
  const exige = publicationExigeConfirmation(porteeApres ?? { niveau: b.niveau } as PorteeConnaissance);

  const envoyer = async (publier: boolean) => {
    if (changement && !confirme) return;
    if (publier && exige && !confirmePub) { setRefusPub(REFUS_PUBLICATION_PLATEFORME); caseRef.current?.focus(); return; }
    setRefusPub(null);
    const ok = await onEnvoyer(saisie(), publier, !!changement && confirme, publier && exige && confirmePub);
    if (ok && !onAnnuler) { setB(VIDE); setConfirmePub(false); if (fichierRef.current) fichierRef.current.value = ''; }
  };
  const nomsPortee = (p: PorteeConnaissance) => (p.niveau === 'plateforme' ? {} : { espace: espaces.find((e) => e.id === p.workspaceId)?.name ?? null, marque: p.niveau === 'marque' ? marques.find((m) => m.id === p.brandId)?.name ?? null : null });
  const marquesEspace = b.workspaceId ? marques.filter((m) => m.workspaceId === b.workspaceId) : marques;

  return (
    <section className="tile" aria-labelledby={`${id}-titre`} data-formulaire-connaissance={onAnnuler ? 'edition' : 'nouvelle'}>
      <div className="sech"><h2 id={`${id}-titre`}>{titreFormulaire}</h2></div>
      {onAnnuler && <p className="faint" style={{ margin: '0 0 10px', fontSize: 12 }}>Éditer crée une nouvelle version · la version en service continue de servir jusqu’à la publication de celle-ci.</p>}
      <div className="seg" role="group" aria-label="Origine du texte">
        {(['saisie', 'collage', 'fichier'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={b.mode === m} onClick={() => { set({ mode: m }); if (m === 'fichier') fichierRef.current?.click(); }}>
            {m === 'saisie' ? 'Saisir' : m === 'collage' ? 'Coller' : 'Importer un fichier'}
          </button>
        ))}
      </div>
      <input ref={fichierRef} type="file" accept={EXTENSIONS_FICHIER.join(',')} aria-label="Fichier texte ou Markdown" onChange={(e) => void lireFichier(e.target.files?.[0])}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} tabIndex={-1} />
      {b.mode === 'fichier' && <p className="faint" style={{ margin: '8px 0 0', fontSize: 12, overflowWrap: 'anywhere' }}>{b.fichier ? <>Fichier lu · <b>{b.fichier}</b> · le texte reste modifiable avant d’enregistrer.</> : `Choisis un fichier ${EXTENSIONS_FICHIER.join(', ')} · il est lu dans ton navigateur, rien n’est envoyé ailleurs.`}</p>}
      {erreurFichier && <p role="alert" className="pill r" style={{ whiteSpace: 'normal', marginTop: 8 }}>{erreurFichier}</p>}

      <div className="fields" style={{ marginTop: 14 }}>
        <label className="field">Titre · {b.titre.length} / {LIMITE_TITRE}
          <input value={b.titre} maxLength={LIMITE_TITRE} onChange={(e) => set({ titre: e.target.value })} placeholder="Ex. · Itérer une gagnante, une variable à la fois" />
        </label>
        <label className="field">Type
          <select value={b.type} onChange={(e) => set({ type: e.target.value as TypeConnaissance })}>
            <optgroup label="Comment Jarvis répond (éditorial)">{TYPES_CONNAISSANCE.filter((t) => t.famille === 'editorial').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
            <optgroup label="Documents sources">{TYPES_CONNAISSANCE.filter((t) => t.famille === 'source').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
          </select>
        </label>
        <label className="field">Portée
          <select value={b.niveau} onChange={(e) => { set({ niveau: e.target.value as Brouillon['niveau'], workspaceId: '', brandId: '' }); setConfirmePub(false); setRefusPub(null); }}>
            <option value="plateforme">Plateforme · toutes les marques</option>
            <option value="espace">Un espace seulement</option>
            <option value="marque">Une marque seulement</option>
          </select>
        </label>
        {b.niveau !== 'plateforme' && (
          <label className="field">Espace
            <select value={b.workspaceId} onChange={(e) => set({ workspaceId: e.target.value, brandId: '' })}><option value="">Choisir…</option>{espaces.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          </label>
        )}
        {b.niveau === 'marque' && (
          <label className="field">Marque
            <select value={b.brandId} onChange={(e) => set({ brandId: e.target.value })}><option value="">Choisir…</option>{marquesEspace.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </label>
        )}
      </div>
      {aide && <p className="faint" style={{ margin: '8px 0 0', fontSize: 12 }}>{LIBELLE_TYPE[b.type]} · {aide}</p>}
      {b.niveau !== 'plateforme' && <p className="faint" style={{ margin: '6px 0 0', fontSize: 12 }}>Une portée restreinte reste chez elle · aucune autre marque ni aucun autre espace ne la lit.</p>}

      <label className="field" style={{ marginTop: 12 }}>Texte
        <textarea value={b.texte} onChange={(e) => set({ texte: e.target.value })} onPaste={() => { if (b.mode === 'saisie') set({ mode: 'collage' }); }} rows={9}
          placeholder={b.mode === 'collage' ? 'Colle ton texte ici (Ctrl+V)…' : 'Écris la consigne, la méthode ou le savoir tel que l’équipe le formule…'} style={{ minHeight: 180, font: '14px/1.55 var(--sf)' }} />
      </label>
      <p className={trop ? 'pill r' : 'faint'} style={{ margin: '6px 0 0', fontSize: 12 }}>{nf(b.texte.length)} / {nf(LIMITE_TEXTE)} caractères · origine · {LIBELLE_ORIGINE[b.mode]}{b.mode === 'fichier' && b.fichier ? ` (${b.fichier})` : ''}</p>

      {changement && porteeAvant && porteeApres && (
        <div role="alert" className="banner" style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <b style={{ fontSize: '12.5px', overflowWrap: 'anywhere' }}>{changement === 'elargie' ? 'Cette version ÉLARGIT la portée' : 'Cette version DÉPLACE la portée'} · de « {libellePortee(porteeAvant, nomsPortee(porteeAvant))} » à « {libellePortee(porteeApres, nomsPortee(porteeApres))} ».{porteeApres.niveau === 'plateforme' ? ' Jarvis la lira pour tous les clients.' : ' D’autres lecteurs la liront.'}</b>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: '12.5px', cursor: 'pointer' }}><input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} style={{ width: 18, height: 18 }} />Je confirme ce changement de portée</label>
        </div>
      )}

      <AvantPublication niveau={b.niveau} confirme={confirmePub} refus={refusPub} caseRef={caseRef} onConfirme={(x) => { setConfirmePub(x); if (x) setRefusPub(null); }} />

      <div className="kc" style={{ marginTop: 14 }}>
        <button className="btn sm pri" type="button" disabled={bloque} onClick={() => void envoyer(true)}>Publier</button>
        <button className="btn sm" type="button" disabled={bloque} onClick={() => void envoyer(false)}>Enregistrer en brouillon</button>
        {onAnnuler && <button className="btn sm" type="button" onClick={onAnnuler}>Annuler</button>}
      </div>
    </section>
  );
}

function Carte({ it, portee, occupe, inclusion, horsPlace, onEditer, onPublier, onRetirer }: {
  it: Item; portee: string; occupe: boolean; inclusion: { tronquee: boolean; caracteresOmis: number } | null; horsPlace: boolean;
  onEditer: () => void; onPublier: (n: number, confirmerPlateforme: boolean) => Promise<boolean>; onRetirer: () => Promise<boolean>;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [aPublier, setAPublier] = useState<number | null>(null);
  const [confirmePub, setConfirmePub] = useState(false);
  const [refusPub, setRefusPub] = useState<string | null>(null);
  const [historique, setHistorique] = useState(false);
  const caseRef = useRef<HTMLInputElement>(null);
  const versionAPublier = aPublier !== null ? it.versions.find((v) => v.n === aPublier) ?? null : null;
  const publier = async () => {
    if (!versionAPublier) return;
    const exige = publicationExigeConfirmation(versionAPublier.portee);
    if (exige && !confirmePub) { setRefusPub(REFUS_PUBLICATION_PLATEFORME); caseRef.current?.focus(); return; }
    setRefusPub(null);
    if (await onPublier(versionAPublier.n, exige && confirmePub)) { setAPublier(null); setConfirmePub(false); }
  };
  const enService = it.versions.find((v) => v.n === it.enService) ?? null;
  const u = enService ? it.usage[enService.ref] : undefined;

  return (
    <article className="tile" aria-label={it.titre} data-connaissance={it.id} style={{ background: 'var(--glass3)' }}>
      <div className="sech"><h2 style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{it.titre}</h2><span className={`pill ${TON_ETAT[it.etat]}`}>{LIBELLE_ETAT[it.etat]}{enService ? ` · v${enService.n}` : ''}</span></div>
      <div className="kc">
        <span className="pill">{LIBELLE_TYPE[it.type]} · {familleType(it.type) === 'editorial' ? 'éditorial' : 'source'}</span>
        <span className="pill" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{portee}</span>
        {it.brouillon !== null && it.etat !== 'brouillon' && <span className="pill w">Brouillon v{it.brouillon} en attente</span>}
      </div>
      <p className="muted" style={{ margin: '10px 0 0', fontSize: '12.5px' }}>
        {enService
          ? <>{it.portee.niveau === 'plateforme'
              ? (inclusion ? (inclusion.tronquee ? `Dans le contexte · tronquée (${nf(inclusion.caracteresOmis)} caractères non lus)` : 'Dans le contexte · en entier') : horsPlace ? 'Hors place · n’entre pas dans le contexte' : 'Dans le contexte')
              : 'Dans le contexte de sa portée seulement'} · incluse dans {nf(u?.inclus ?? 0)} réponse(s){u?.dernierInclus ? ` (dernière le ${date(u.dernierInclus)})` : ''} · citée {nf(u?.cite ?? 0)} fois</>
          : it.etat === 'retire' ? 'N’entre plus dans le contexte de Jarvis.' : 'Brouillon · n’entre pas dans le contexte tant qu’il n’est pas publié.'}
      </p>
      <div className="kc" style={{ marginTop: 12, alignItems: 'center' }}>
        <button className="btn sm" type="button" disabled={occupe} onClick={onEditer}>Éditer · nouvelle version</button>
        {it.brouillon !== null && it.brouillon === it.derniere && aPublier === null && <button className="btn sm pri" type="button" disabled={occupe} onClick={() => { setAPublier(it.brouillon); setConfirmePub(false); setRefusPub(null); }}>Publier v{it.brouillon}</button>}
        {enService && !confirmer && <button className="btn sm" type="button" disabled={occupe} onClick={() => setConfirmer(true)}>Retirer</button>}
        {enService && confirmer && (
          <>
            <small className="faint">Elle n’entrera plus dans les réponses suivantes.</small>
            <button className="btn sm pri" type="button" autoFocus disabled={occupe} onClick={async () => { if (await onRetirer()) setConfirmer(false); }}>Confirmer le retrait</button>
            <button className="btn sm" type="button" onClick={() => setConfirmer(false)}>Annuler</button>
          </>
        )}
        <button className="btn sm" type="button" aria-expanded={historique} onClick={() => setHistorique((x) => !x)}>{historique ? 'Masquer les versions' : `Versions (${it.versions.length})`}</button>
      </div>
      {versionAPublier && (
        <div>
          <AvantPublication niveau={versionAPublier.portee.niveau} confirme={confirmePub} refus={refusPub} caseRef={caseRef} onConfirme={(x) => { setConfirmePub(x); if (x) setRefusPub(null); }} />
          <div className="kc" style={{ marginTop: 10 }}>
            <button className="btn sm pri" type="button" disabled={occupe} onClick={() => void publier()}>Publier v{versionAPublier.n}</button>
            <button className="btn sm" type="button" onClick={() => { setAPublier(null); setRefusPub(null); }}>Annuler</button>
          </div>
        </div>
      )}
      {historique && (
        <ol className="atable" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
          {it.versions.map((v) => (
            <li className="atr" key={v.n} style={{ gridTemplateColumns: '1fr' }}>
              <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                <b>v{v.n}</b> <span className={`pill ${TON_ETAT[v.etat]}`}>{LIBELLE_ETAT[v.etat]}</span>{' '}
                <small className="faint">{LIBELLE_ORIGINE[v.origine.mode]}{v.origine.fichier ? ` · ${v.origine.fichier}` : ''} · {nf(v.caracteres)} car. · créée le {date(v.creeLe)} par {v.creePar}{v.publieLe ? ` · publiée le ${date(v.publieLe)}` : ''}{v.retireLe ? ` · ${v.motifRetrait ?? 'Retirée'} le ${date(v.retireLe)}` : ''}{it.usage[v.ref] ? ` · incluse ${nf(it.usage[v.ref]!.inclus)} fois, citée ${nf(it.usage[v.ref]!.cite)}` : ''}</small>
                <pre className="muted" style={{ margin: '8px 0 0', maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, fontFamily: 'inherit' }}>{v.texte}</pre>
              </span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/** Juste avant « Publier » · à qui le texte part (texte du noyau) et, pour la plateforme, une case à cocher explicite. */
function AvantPublication({ niveau, confirme, refus, caseRef, onConfirme }: { niveau: PorteeConnaissance['niveau']; confirme: boolean; refus: string | null; caseRef?: RefObject<HTMLInputElement | null>; onConfirme: (x: boolean) => void }) {
  const idRefus = useId();
  const exige = publicationExigeConfirmation({ niveau } as PorteeConnaissance);
  return (
    <div data-avant-publication={niveau} className={exige ? 'banner' : undefined} style={{ marginTop: 12, display: 'grid', gap: 6 }}>
      <p role="note" style={{ margin: 0, fontSize: '12.5px', fontWeight: 600, overflowWrap: 'anywhere' }}>Avant publication · {avertissementPublication(niveau)}</p>
      {exige && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: '12.5px', cursor: 'pointer' }}>
          <input ref={caseRef} type="checkbox" name="confirmer-plateforme" checked={confirme} onChange={(e) => onConfirme(e.target.checked)} aria-describedby={refus ? idRefus : undefined} aria-invalid={refus ? true : undefined} style={{ width: 18, height: 18, flexShrink: 0 }} />
          {CONFIRMATION_PUBLICATION_PLATEFORME}
        </label>
      )}
      {refus && <p id={idRefus} role="alert" className="pill r" style={{ whiteSpace: 'normal', margin: 0 }}>{refus}</p>}
    </div>
  );
}
