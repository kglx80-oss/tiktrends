'use client';

import { useId, useRef, useState, type CSSProperties, type RefObject } from 'react';
import {
  TYPES_CONNAISSANCE, LIBELLE_TYPE, LIBELLE_ETAT, LIBELLE_ORIGINE, LIMITE_TEXTE, LIMITE_TITRE, EXTENSIONS_FICHIER,
  CIBLE_TACTILE_MIN, verifierFichierTexte, libellePortee, familleType, changementPortee, AVERTISSEMENT_CONFIDENTIALITE,
  avertissementPublication, publicationExigeConfirmation, CONFIRMATION_PUBLICATION_PLATEFORME, REFUS_PUBLICATION_PLATEFORME,
  type TypeConnaissance, type EtatVersion, type ModeOrigine, type PorteeConnaissance, type SaisieConnaissance,
} from '@tiktrends/core';
import {
  creerConnaissanceAction, nouvelleVersionAction, publierConnaissanceAction, retirerConnaissanceAction,
  type VueAdminConnaissances,
} from '../../../actions/connaissances';
import { cadreSignal } from '../../../../components/ui';

/**
 * L'écran des Connaissances · déposer, publier, éditer, retirer, et voir ce que
 * Jarvis lit réellement.
 *
 * Trois mots, trois choses distinctes, et l'écran ne les confond jamais :
 *  - PUBLIÉE · la version est en service, elle a le droit d'entrer ;
 *  - INCLUSE · elle était dans le contexte d'une réponse de Jarvis (compté à
 *    chaque réponse) ;
 *  - CITÉE · la réponse s'en est réclamée (marqueur de source).
 *
 * Aucun geste n'est payant · rien ici n'appelle un modèle. Le fichier est lu
 * dans le navigateur, sans service tiers.
 */

type Marque = { id: string; name: string; workspaceId: string };
type Espace = { id: string; name: string };
type Item = VueAdminConnaissances['items'][number];

interface Brouillon {
  titre: string;
  type: TypeConnaissance;
  texte: string;
  mode: ModeOrigine;
  fichier: string | null;
  niveau: PorteeConnaissance['niveau'];
  workspaceId: string;
  brandId: string;
}

const VIDE: Brouillon = { titre: '', type: 'instruction', texte: '', mode: 'saisie', fichier: null, niveau: 'plateforme', workspaceId: '', brandId: '' };

const nf = (n: number) => n.toLocaleString('fr-FR');
const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function EcranConnaissances({ vueInitiale, espaces, marques }: { vueInitiale: VueAdminConnaissances; espaces: Espace[]; marques: Marque[] }) {
  const [vue, setVue] = useState(vueInitiale);
  const [note, setNote] = useState<{ ok: boolean; texte: string } | null>(null);
  const [edition, setEdition] = useState<{ id: string; base: number; porteeAvant: PorteeConnaissance; valeurs: Brouillon } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const nomEspace = (id: string) => espaces.find((e) => e.id === id)?.name ?? null;
  const nomMarque = (id: string) => marques.find((m) => m.id === id)?.name ?? null;
  const portee = (p: PorteeConnaissance) => libellePortee(p, {
    espace: p.niveau === 'plateforme' ? null : nomEspace(p.workspaceId),
    marque: p.niveau === 'marque' ? nomMarque(p.brandId) : null,
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
      valeurs: {
        titre: d.titre, type: d.type, texte: d.texte, mode: 'saisie', fichier: null, niveau: d.portee.niveau,
        workspaceId: d.portee.niveau === 'plateforme' ? '' : d.portee.workspaceId,
        brandId: d.portee.niveau === 'marque' ? d.portee.brandId : '',
      },
    });
    setNote(null);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const publies = vue.items.filter((i) => i.etat === 'publie').length;
  const a = vue.apercu;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Ce qui part dans chaque réponse · la vérité de l'écran. */}
      <section aria-labelledby="ctx-titre" style={carte}>
        <h2 id="ctx-titre" style={h2}>Ce que Jarvis lit à chaque réponse</h2>
        {/* Honnêteté d'abord · le panneau client n'affiche que des titres, ce
            qui ne protège pas le texte : Jarvis le lit, un client peut le lui
            demander. La décision de confidentialité appartient au pilotage. */}
        <p role="note" style={{ margin: '8px 0 0', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(245,166,35,.45)', background: 'rgba(245,166,35,.08)', color: '#ffcf8f', fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
          {AVERTISSEMENT_CONFIDENTIALITE}
        </p>
        <p style={{ ...corps, marginTop: 6 }}>
          Portée plateforme · <b style={{ color: 'var(--ink)' }}>{nf(a.taille)} / {nf(a.plafond)}</b> caractères ·{' '}
          {a.inclus.length ? `${a.inclus.length} connaissance(s) incluse(s) dans le contexte de chaque réponse.` : 'aucune connaissance publiée en portée plateforme · Jarvis répond sans ce bloc.'}
        </p>
        <Jauge valeur={a.taille} max={a.plafond} />
        {a.inclus.some((i) => i.tronquee) && (
          <p style={alerte}>
            Tronqué · {a.inclus.filter((i) => i.tronquee).map((i) => `« ${i.titre} » (${nf(i.caracteresOmis)} caractères non lus)`).join(', ')}.
          </p>
        )}
        {a.exclues.length > 0 && (
          <p style={alerte}>Hors place · {a.exclues.map((e) => `« ${e.titre} »`).join(', ')} n’entre(nt) pas dans le contexte · retire ou raccourcis une connaissance.</p>
        )}
        {a.conflits.length > 0 && (
          <p style={alerte}>Conflit · {a.conflits.length} connaissance(s) avaient deux versions publiées · la plus récente est seule retenue.</p>
        )}
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li style={petit}><b>Publiée</b> · la version est en service, elle a le droit d’entrer dans le contexte.</li>
          <li style={petit}><b>Incluse</b> · elle était dans le contexte d’une réponse de Jarvis (compté à chaque réponse).</li>
          <li style={petit}><b>Citée</b> · déclarée par le modèle · la réponse s’en est réclamée par un marqueur de source. Ce n’est pas une preuve d’usage, et une question qui dicte le marqueur n’est pas comptée.</li>
          <li style={petit}>Les connaissances sont lues comme des <b>données</b> · elles ne peuvent pas lever les règles de Jarvis, et les règles maison d’une marque passent devant.</li>
          <li style={petit}>Une connaissance <b>retirée</b> n’entre plus dans les réponses suivantes, y compris dans une conversation déjà ouverte. Les réponses déjà données ne sont pas réécrites · Jarvis n’oublie pas rétroactivement ce qu’il a déjà dit.</li>
        </ul>
      </section>

      {note && (
        <div role={note.ok ? 'status' : 'alert'} style={{
          padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700,
          border: `1px solid ${note.ok ? 'rgba(48,164,108,.4)' : 'rgba(229,72,77,.4)'}`,
          background: note.ok ? 'rgba(48,164,108,.1)' : 'rgba(229,72,77,.1)', color: note.ok ? '#2fa46c' : '#e5484d',
          overflowWrap: 'anywhere',
        }}>{note.texte}</div>
      )}

      <div ref={formRef}>
        <Formulaire
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

      <section aria-labelledby="liste-titre">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 id="liste-titre" style={h2}>Déposées</h2>
          <span style={petit}>{vue.items.length} au total · {publies} publiée(s)</span>
        </div>
        {vue.items.length === 0 ? (
          <div style={{ ...carte, borderStyle: 'dashed', textAlign: 'center', padding: '26px 18px' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Aucune connaissance pour l’instant.</p>
            <p style={{ ...corps, margin: '6px auto 0', maxWidth: 520 }}>
              Jarvis répond aujourd’hui avec ses seules règles et la mémoire de chaque marque. Dépose une première consigne
              ou une méthode d’itération ci-dessus · saisie, collage ou fichier .md.
            </p>
          </div>
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
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Le formulaire · saisir, coller, importer                                  */
/* -------------------------------------------------------------------------- */

export function Formulaire({ initial, porteeAvant, titreFormulaire, espaces, marques, occupe, onAnnuler, onEnvoyer }: {
  initial: Brouillon; titreFormulaire: string; espaces: Espace[]; marques: Marque[]; occupe: boolean;
  onAnnuler?: () => void;
  /** Portée de la version qu'on édite · sert à signaler un élargissement. */
  porteeAvant?: PorteeConnaissance;
  onEnvoyer: (s: SaisieConnaissance, publier: boolean, confirmerPortee: boolean, confirmerPlateforme: boolean) => Promise<boolean>;
}) {
  const [b, setB] = useState<Brouillon>(initial);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Brouillon>) => setB((x) => ({ ...x, ...p }));
  const aide = TYPES_CONNAISSANCE.find((t) => t.key === b.type)?.aide;
  const trop = b.texte.length > LIMITE_TEXTE;

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

  // Élargir (ou déplacer) la portée expose le texte à d'autres lecteurs · ça
  // se confirme, explicitement, avant tout envoi. Règle dans le noyau.
  const porteeApres: PorteeConnaissance | null = b.niveau === 'plateforme' ? { niveau: 'plateforme' }
    : b.niveau === 'espace' ? (b.workspaceId ? { niveau: 'espace', workspaceId: b.workspaceId } : null)
    : (b.workspaceId && b.brandId ? { niveau: 'marque', workspaceId: b.workspaceId, brandId: b.brandId } : null);
  const changement = porteeAvant && porteeApres ? changementPortee(porteeAvant, porteeApres) : null;
  const [confirme, setConfirme] = useState(false);
  const bloque = occupe || (!!changement && !confirme);
  // Avant publication · la portée plateforme se confirme EXPLICITEMENT (règle au
  // noyau, refusée aussi par le serveur). Sans la case, « Publier » ne part pas
  // et le dit, à côté du bouton · le focus revient sur la case.
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

  const marquesEspace = b.workspaceId ? marques.filter((m) => m.workspaceId === b.workspaceId) : marques;

  return (
    <section aria-labelledby="form-titre" style={carte}>
      <h2 id="form-titre" style={h2}>{titreFormulaire}</h2>
      {onAnnuler && <p style={{ ...petit, margin: '4px 0 0' }}>Éditer crée une nouvelle version · la version en service continue de servir jusqu’à la publication de celle-ci.</p>}

      <div role="radiogroup" aria-label="Origine du texte" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {(['saisie', 'collage', 'fichier'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={b.mode === m}
            onClick={() => { set({ mode: m }); if (m === 'fichier') fichierRef.current?.click(); }}
            style={puce(b.mode === m)}>
            {m === 'saisie' ? 'Saisir' : m === 'collage' ? 'Coller' : 'Importer un fichier'}
          </button>
        ))}
        <input ref={fichierRef} type="file" accept={EXTENSIONS_FICHIER.join(',')} aria-label="Fichier texte ou Markdown"
          onChange={(e) => void lireFichier(e.target.files?.[0])}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} tabIndex={-1} />
      </div>
      {b.mode === 'fichier' && (
        <p style={{ ...petit, margin: '8px 0 0', overflowWrap: 'anywhere' }}>
          {b.fichier ? <>Fichier lu · <b style={{ color: 'var(--ink)' }}>{b.fichier}</b> · le texte reste modifiable avant d’enregistrer.</> : `Choisis un fichier ${EXTENSIONS_FICHIER.join(', ')} · il est lu dans ton navigateur, rien n’est envoyé ailleurs.`}
        </p>
      )}
      {erreurFichier && <p role="alert" style={alerte}>{erreurFichier}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12, marginTop: 14 }}>
        <label style={champ}>
          <span style={{ ...etiquette, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>Titre</span>
            <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, color: b.titre.length >= LIMITE_TITRE ? '#ffb35c' : 'var(--muted)' }}>{b.titre.length} / {LIMITE_TITRE}</span>
          </span>
          <input value={b.titre} maxLength={LIMITE_TITRE} onChange={(e) => set({ titre: e.target.value })} placeholder="Ex. · Itérer une gagnante, une variable à la fois" style={entree} />
        </label>
        <label style={champ}>
          <span style={etiquette}>Type</span>
          <select value={b.type} onChange={(e) => set({ type: e.target.value as TypeConnaissance })} style={entree}>
            <optgroup label="Comment Jarvis répond (éditorial)">
              {TYPES_CONNAISSANCE.filter((t) => t.famille === 'editorial').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </optgroup>
            <optgroup label="Documents sources">
              {TYPES_CONNAISSANCE.filter((t) => t.famille === 'source').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </optgroup>
          </select>
        </label>
        <label style={champ}>
          <span style={etiquette}>Portée</span>
          <select value={b.niveau} onChange={(e) => { set({ niveau: e.target.value as Brouillon['niveau'], workspaceId: '', brandId: '' }); setConfirmePub(false); setRefusPub(null); }} style={entree}>
            <option value="plateforme">Plateforme · toutes les marques</option>
            <option value="espace">Un espace seulement</option>
            <option value="marque">Une marque seulement</option>
          </select>
        </label>
        {b.niveau !== 'plateforme' && (
          <label style={champ}>
            <span style={etiquette}>Espace</span>
            <select value={b.workspaceId} onChange={(e) => set({ workspaceId: e.target.value, brandId: '' })} style={entree}>
              <option value="">Choisir…</option>
              {espaces.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        )}
        {b.niveau === 'marque' && (
          <label style={champ}>
            <span style={etiquette}>Marque</span>
            <select value={b.brandId} onChange={(e) => set({ brandId: e.target.value })} style={entree}>
              <option value="">Choisir…</option>
              {marquesEspace.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {aide && <p style={{ ...petit, margin: '8px 0 0' }}>{LIBELLE_TYPE[b.type]} · {aide}</p>}
      {b.niveau !== 'plateforme' && (
        <p style={{ ...petit, margin: '6px 0 0' }}>Une portée restreinte reste chez elle · aucune autre marque ni aucun autre espace ne la lit.</p>
      )}

      <label style={{ ...champ, marginTop: 12 }}>
        <span style={etiquette}>Texte</span>
        <textarea
          value={b.texte}
          onChange={(e) => set({ texte: e.target.value })}
          onPaste={() => { if (b.mode === 'saisie') set({ mode: 'collage' }); }}
          rows={9}
          placeholder={b.mode === 'collage' ? 'Colle ton texte ici (Ctrl+V)…' : 'Écris la consigne, la méthode ou le savoir tel que l’équipe le formule…'}
          style={{ ...entree, minHeight: 180, resize: 'vertical', lineHeight: 1.55, fontFamily: 'inherit' }}
        />
      </label>
      <p style={{ ...petit, margin: '6px 0 0', color: trop ? '#e5484d' : 'var(--muted)' }}>
        {nf(b.texte.length)} / {nf(LIMITE_TEXTE)} caractères · origine · {LIBELLE_ORIGINE[b.mode]}{b.mode === 'fichier' && b.fichier ? ` (${b.fichier})` : ''}
      </p>

      {changement && porteeAvant && porteeApres && (
        <div role="alert" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(229,72,77,.45)', background: 'rgba(229,72,77,.08)' }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#ff8095', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
            {changement === 'elargie' ? 'Cette version ÉLARGIT la portée' : 'Cette version DÉPLACE la portée'} · de « {libellePortee(porteeAvant, nomsPortee(porteeAvant, espaces, marques))} » à « {libellePortee(porteeApres, nomsPortee(porteeApres, espaces, marques))} ».
            {porteeApres.niveau === 'plateforme' ? ' Jarvis la lira pour tous les clients.' : ' D’autres lecteurs la liront.'}
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minHeight: CIBLE_TACTILE_MIN, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} style={{ width: 18, height: 18 }} />
            Je confirme ce changement de portée
          </label>
        </div>
      )}

      <AvantPublication niveau={b.niveau} confirme={confirmePub} refus={refusPub} caseRef={caseRef}
        onConfirme={(x) => { setConfirmePub(x); if (x) setRefusPub(null); }} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button type="button" disabled={bloque} onClick={() => void envoyer(true)} style={bouton(true, bloque)}>Publier</button>
        <button type="button" disabled={bloque} onClick={() => void envoyer(false)} style={bouton(false, bloque)}>Enregistrer en brouillon</button>
        {onAnnuler && <button type="button" onClick={onAnnuler} style={bouton(false, false)}>Annuler</button>}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Une connaissance                                                          */
/* -------------------------------------------------------------------------- */

const TON_ETAT: Record<EtatVersion, { fg: string; bd: string }> = {
  publie: { fg: '#2fa46c', bd: 'rgba(48,164,108,.45)' },
  brouillon: { fg: 'var(--ink-2)', bd: 'var(--line-2)' },
  retire: { fg: '#e5484d', bd: 'rgba(229,72,77,.4)' },
};

function Carte({ it, portee, occupe, inclusion, horsPlace, onEditer, onPublier, onRetirer }: {
  it: Item; portee: string; occupe: boolean;
  inclusion: { tronquee: boolean; caracteresOmis: number } | null; horsPlace: boolean;
  onEditer: () => void; onPublier: (n: number, confirmerPlateforme: boolean) => Promise<boolean>; onRetirer: () => Promise<boolean>;
}) {
  const [confirmer, setConfirmer] = useState(false);
  // Publier un brouillon · l'avertissement de SA portée d'abord, et la case pour la plateforme.
  const [aPublier, setAPublier] = useState<number | null>(null);
  const [confirmePub, setConfirmePub] = useState(false);
  const [refusPub, setRefusPub] = useState<string | null>(null);
  const caseRef = useRef<HTMLInputElement>(null);
  const versionAPublier = aPublier !== null ? it.versions.find((v) => v.n === aPublier) ?? null : null;
  const publier = async () => {
    if (!versionAPublier) return;
    if (publicationExigeConfirmation(versionAPublier.portee) && !confirmePub) { setRefusPub(REFUS_PUBLICATION_PLATEFORME); caseRef.current?.focus(); return; }
    setRefusPub(null);
    if (await onPublier(versionAPublier.n, publicationExigeConfirmation(versionAPublier.portee) && confirmePub)) { setAPublier(null); setConfirmePub(false); }
  };
  const [historique, setHistorique] = useState(false);
  const enService = it.versions.find((v) => v.n === it.enService) ?? null;
  const u = enService ? it.usage[enService.ref] : undefined;

  return (
    <article style={carte} aria-label={it.titre}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, flex: '1 1 260px', minWidth: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{it.titre}</h3>
        <span style={badge(TON_ETAT[it.etat])}>{LIBELLE_ETAT[it.etat]}{enService ? ` · v${enService.n}` : ''}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <span style={badge({ fg: 'var(--ink-2)', bd: 'var(--line-2)' })}>{LIBELLE_TYPE[it.type]} · {familleType(it.type) === 'editorial' ? 'éditorial' : 'source'}</span>
        <span style={{ ...badge({ fg: 'var(--ink-2)', bd: 'var(--line-2)' }), maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{portee}</span>
        {it.brouillon !== null && it.etat !== 'brouillon' && <span style={badge({ fg: '#ffcf8f', bd: 'rgba(245,166,35,.4)' })}>Brouillon v{it.brouillon} en attente</span>}
      </div>

      <p style={{ ...corps, marginTop: 10 }}>
        {enService
          ? <>
              {it.portee.niveau === 'plateforme'
                ? (inclusion ? (inclusion.tronquee ? `Dans le contexte · tronquée (${nf(inclusion.caracteresOmis)} caractères non lus)` : 'Dans le contexte · en entier') : horsPlace ? 'Hors place · n’entre pas dans le contexte' : 'Dans le contexte')
                : 'Dans le contexte de sa portée seulement'}
              {' · '}incluse dans {nf(u?.inclus ?? 0)} réponse(s){u?.dernierInclus ? ` (dernière le ${date(u.dernierInclus)})` : ''}
              {' · '}citée {nf(u?.cite ?? 0)} fois
            </>
          : it.etat === 'retire' ? 'N’entre plus dans le contexte de Jarvis.' : 'Brouillon · n’entre pas dans le contexte tant qu’il n’est pas publié.'}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" disabled={occupe} onClick={onEditer} style={bouton(false, occupe)}>Éditer · nouvelle version</button>
        {it.brouillon !== null && it.brouillon === it.derniere && aPublier === null && (
          <button type="button" disabled={occupe} onClick={() => { setAPublier(it.brouillon); setConfirmePub(false); setRefusPub(null); }} style={bouton(true, occupe)}>Publier v{it.brouillon}</button>
        )}
        {enService && !confirmer && (
          <button type="button" disabled={occupe} onClick={() => setConfirmer(true)} style={boutonDanger}>Retirer</button>
        )}
        {enService && confirmer && (
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={petit}>Elle n’entrera plus dans les réponses suivantes.</span>
            <button type="button" autoFocus disabled={occupe} onClick={async () => { if (await onRetirer()) setConfirmer(false); }} style={boutonDanger}>Confirmer le retrait</button>
            <button type="button" onClick={() => setConfirmer(false)} style={bouton(false, false)}>Annuler</button>
          </span>
        )}
        <button type="button" aria-expanded={historique} onClick={() => setHistorique((x) => !x)} style={bouton(false, false)}>
          {historique ? 'Masquer les versions' : `Versions (${it.versions.length})`}
        </button>
      </div>

      {versionAPublier && (
        <div style={{ marginTop: 4 }}>
          <AvantPublication niveau={versionAPublier.portee.niveau} confirme={confirmePub} refus={refusPub} caseRef={caseRef}
            onConfirme={(x) => { setConfirmePub(x); if (x) setRefusPub(null); }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button type="button" disabled={occupe} onClick={() => void publier()} style={bouton(true, occupe)}>Publier v{versionAPublier.n}</button>
            <button type="button" onClick={() => { setAPublier(null); setRefusPub(null); }} style={bouton(false, false)}>Annuler</button>
          </div>
        </div>
      )}

      {historique && (
        <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 8 }}>
          {it.versions.map((v) => (
            <li key={v.n} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'var(--paper)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>v{v.n}</b>
                <span style={badge(TON_ETAT[v.etat])}>{LIBELLE_ETAT[v.etat]}</span>
                <span style={{ ...petit, overflowWrap: 'anywhere' }}>
                  {LIBELLE_ORIGINE[v.origine.mode]}{v.origine.fichier ? ` · ${v.origine.fichier}` : ''} · {nf(v.caracteres)} car. · créée le {date(v.creeLe)} par {v.creePar}
                  {v.publieLe ? ` · publiée le ${date(v.publieLe)}` : ''}
                  {v.retireLe ? ` · ${v.motifRetrait ?? 'Retirée'} le ${date(v.retireLe)}` : ''}
                  {it.usage[v.ref] ? ` · incluse ${nf(it.usage[v.ref]!.inclus)} fois, citée ${nf(it.usage[v.ref]!.cite)}` : ''}
                </span>
              </div>
              <pre style={{ margin: '8px 0 0', maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-2)', fontFamily: 'inherit' }}>{v.texte}</pre>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/**
 * Juste avant « Publier » · à qui le texte part (texte du noyau, par portée), et
 * pour la plateforme une case de confirmation · une vraie case à cocher, dans
 * son libellé, atteignable au clavier (Tab, Espace). Le refus s'affiche sous
 * la case, relié à elle (`aria-describedby`).
 */
export function AvantPublication({ niveau, confirme, refus, caseRef, onConfirme }: {
  niveau: PorteeConnaissance['niveau']; confirme: boolean; refus: string | null;
  caseRef?: RefObject<HTMLInputElement | null>; onConfirme: (x: boolean) => void;
}) {
  const idRefus = useId();
  const exige = publicationExigeConfirmation({ niveau } as PorteeConnaissance);
  return (
    <div data-avant-publication={niveau} style={{ marginTop: 12, padding: '10px 12px', ...cadreSignal(exige ? 'rgba(245,166,35,.45)' : 'var(--line)', 'tuile'), background: exige ? 'rgba(245,166,35,.08)' : 'var(--paper)' }}>
      <p role="note" style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: exige ? '#ffcf8f' : 'var(--ink-2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        Avant publication · {avertissementPublication(niveau)}
      </p>
      {exige && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, minHeight: CIBLE_TACTILE_MIN, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', lineHeight: 1.4 }}>
          <input ref={caseRef} type="checkbox" name="confirmer-plateforme" checked={confirme} onChange={(e) => onConfirme(e.target.checked)}
            aria-describedby={refus ? idRefus : undefined} aria-invalid={refus ? true : undefined}
            style={{ width: 18, height: 18, flexShrink: 0 }} />
          {CONFIRMATION_PUBLICATION_PLATEFORME}
        </label>
      )}
      {refus && <p id={idRefus} role="alert" style={{ ...alerte, color: '#ff8095' }}>{refus}</p>}
    </div>
  );
}

function Jauge({ valeur, max }: { valeur: number; max: number }) {
  const pct = Math.min(100, Math.round((valeur / max) * 100));
  return (
    <div role="meter" aria-label="Place occupée dans le contexte" aria-valuemin={0} aria-valuemax={max} aria-valuenow={valeur}
      style={{ height: 8, borderRadius: 999, background: 'var(--paper)', border: '1px solid var(--line)', overflow: 'hidden', marginTop: 10 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#e5484d' : 'var(--grad-accent)' }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function nomsPortee(p: PorteeConnaissance, espaces: Espace[], marques: Marque[]): { espace?: string | null; marque?: string | null } {
  if (p.niveau === 'plateforme') return {};
  return { espace: espaces.find((e) => e.id === p.workspaceId)?.name ?? null, marque: p.niveau === 'marque' ? marques.find((m) => m.id === p.brandId)?.name ?? null : null };
}

const carte: CSSProperties = { border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', minWidth: 0 };
const h2: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' };
const corps: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 };
const petit: CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 };
const alerte: CSSProperties = { margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: '#ffb35c', lineHeight: 1.5, overflowWrap: 'anywhere' };
const champ: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 };
const etiquette: CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' };
const entree: CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: CIBLE_TACTILE_MIN, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 14,
};
const badge = (t: { fg: string; bd: string }): CSSProperties => ({
  display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800,
  color: t.fg, border: `1px solid ${t.bd}`, whiteSpace: 'nowrap',
});
const puce = (actif: boolean): CSSProperties => ({
  minHeight: CIBLE_TACTILE_MIN, padding: '0 16px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
  border: `1px solid ${actif ? 'var(--accent-strong)' : 'var(--line-2)'}`,
  background: actif ? 'var(--accent-soft)' : 'transparent', color: actif ? 'var(--ink)' : 'var(--ink-2)',
});
const bouton = (principal: boolean, inactif: boolean): CSSProperties => ({
  minHeight: CIBLE_TACTILE_MIN, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 800,
  cursor: inactif ? 'wait' : 'pointer', opacity: inactif ? 0.6 : 1,
  border: principal ? 'none' : '1px solid var(--line-2)',
  background: principal ? 'var(--grad-accent)' : 'transparent', color: principal ? 'var(--on-accent)' : 'var(--ink)',
});
const boutonDanger: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: 'pointer',
  border: '1px solid rgba(229,72,77,.5)', background: 'transparent', color: '#e5484d',
};
