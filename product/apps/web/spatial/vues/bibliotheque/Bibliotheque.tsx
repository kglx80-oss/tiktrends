'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  vueDrive, cheminVers, dossiersRangement, pastilleDroit, formatTaille, libelleJour, ETAT_DRIVE_INITIAL, SECTIONS_DRIVE, DROITS_ASSET,
  LIBELLE_TYPE_FICHIER, FILTRES_TYPE_DRIVE, resumeImportDrive, TYPES_IMPORT_LIEN, type FiltreTypeDrive, lireImportLiens, type TypeImportLien, type DonneesDrive, type EtatDrive, type ConnexionDriveSpatiale, type FichierDrive, type DroitAsset, type SectionDrive, type TriDrive,
} from '@tiktrends/core';
import { uploadImageAssetsAction, presignAssetUploadAction, registerUploadedAssetAction, deleteAssetAction, importAssetAction, toggleAssetAiAction, basculerTemplateAction, tagAssetAction, tagUntaggedImagesAction } from '../../../app/actions/assets';
import { creerDossierAction, supprimerDossierAction, restaurerDossierAction, affecterAssetDossierAction, definirDroitsAssetAction } from '../../../app/actions/bibliotheque-dossiers';
import { syncDriveNowAction } from '../../../app/actions/drive';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { LogoApp, ICONE_TYPE } from './logos';
import { useSelecteurDrive } from './selecteur-drive';
import { DialogueSpatial } from '../marque/interactifs';

/**
 * « Bibliothèque » · `docs/spatial/reference/bibliotheque.html`, balisage à
 * l'identique. Ce que montre l'écran (onglets, arbre, fil d'Ariane, dossiers,
 * fichiers, vide) est décidé par le noyau (`vueDrive`) · ici, l'état de
 * navigation et les gestes, chacun branché sur une action serveur EXISTANTE :
 * créer, mettre à la corbeille, restaurer un dossier (`bibliotheque-dossiers`),
 * ranger un média et fixer ses droits, téléverser (`assets` · bucket ou image
 * compressée), supprimer un média (définitif, comme aujourd'hui · confirmé),
 * connecter et synchroniser Google Drive (`drive`).
 *
 * Absents faute de source réelle · Favoris et « Partagés avec le client »
 * (aucune donnée), les tags de couleur (aucune colonne), Dropbox (aucun
 * connecteur · rendu désactivé), le quota (aucun quota n'existe · le volume
 * réellement mesuré est affiché), « Exports Meta » (aucun export conservé).
 */


export interface PropsBibliotheque {
  donnees: DonneesDrive;
  /** Raison de la lecture seule (offre ou rôle) · null = écriture ouverte. */
  lectureSeule: string | null;
  stockage: boolean;
  drive: ConnexionDriveSpatiale;
  maintenant: string;
  /** Message de retour de la connexion Google (succès ou erreur client). */
  retourDrive?: string | null;
  /**
   * Les gestes de l'écran V5 `/assets` sans fragment de maquette (vague 2) ·
   * import par lien, asset commun à toutes les marques, usage par l'IA et
   * template, analyse des images (payante, prix annoncé), sélecteur Google
   * Drive. Absents, l'écran est celui de la maquette (garde de parité).
   */
  gestion?: GestionBibliotheque;
}

export interface GestionBibliotheque {
  /** L'analyse d'images par l'IA · `cout` par image (`null` · illimité), `raison` quand elle est fermée. */
  analyse: { cout: number | null; raison: string | null; sansTags: number; maxLot: number };
  /** Le sélecteur Google Drive est configuré sur la plateforme. */
  selecteurDrive: boolean;
  /** Administrateur de l'espace · seul à ranger un fichier en template (coulisses, garde serveur identique). */
  admin: boolean;
  /**
   * Google Drive pas activé (ou son sélecteur) pour l'espace · ce qui manque,
   * qui agit, le repli par lien et le ticket interne (copie client, recette #106).
   */
  messageDrive: { constat: string; suite: string; action: { libelle: string; href: string } | null } | null;
}

const style = (s: Record<string, string | number>) => s as CSSProperties;

/** Compresse une image navigateur en data URI léger (sans bucket) · même règle que l'écran V5. */
function fichierEnDataUri(file: File, cote = 1400, qualite = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture impossible.'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        const k = Math.min(1, cote / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const ctx = c.getContext('2d'); if (!ctx) return reject(new Error('Canvas indisponible.'));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', qualite));
      };
      img.src = lecteur.result as string;
    };
    lecteur.readAsDataURL(file);
  });
}

/** Le `Content-Type` envoyé est celui que le serveur a retenu et SIGNÉ (`decisionDepot`) · un autre type, le bucket refuse. */
function envoyerVersBucket(url: string, file: File, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', contentType);
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error('HTTP ' + x.status)));
    x.onerror = () => reject(new Error('Réseau'));
    x.send(file);
  });
}

function Vignette({ f }: { f: FichierDrive }) {
  if (f.vignette && (f.type === 'image' || f.type === 'video')) {
    return <div className="dth img"><img src={f.vignette} alt="" style={{ objectPosition: '50% 50%' }} /></div>;
  }
  const k = ICONE_TYPE[f.type]!;
  return <div className="dth file" style={style({ '--fc': k.couleur })}><span className="fi"><Ic n={k.icone} s={false} /></span><b>{k.libelle}</b></div>;
}

const IconeFichier = ({ f }: { f: FichierDrive }) => {
  const k = ICONE_TYPE[f.type]!;
  return <span className="dfold" style={style({ '--fc': k.couleur })}><Ic n={k.icone} /></span>;
};

function PastilleFichier({ f }: { f: FichierDrive }) {
  if (f.lectureSeule) return <span className="pill c">{f.projet ? 'Studios' : 'Ancien studio'}</span>;
  const p = pastilleDroit(f.droit);
  return <span className={`pill ${p.classe}`}>{p.libelle}</span>;
}

export function Bibliotheque(p: PropsBibliotheque) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [etat, setEtat] = useState<EtatDrive>(ETAT_DRIVE_INITIAL);
  const [affichage, setAffichage] = useState<'grille' | 'liste'>('grille');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [apercu, setApercu] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [glisse, setGlisse] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [commun, setCommun] = useState(false);
  const [dialogueLien, setDialogueLien] = useState(false);
  const [lien, setLien] = useState<{ texte: string; nom: string; type: TypeImportLien }>({ texte: '', nom: '', type: 'video' });
  const fichierRef = useRef<HTMLInputElement>(null);
  const maintenant = useMemo(() => new Date(p.maintenant), [p.maintenant]);
  const ecriture = p.lectureSeule === null;

  // Le retour de la connexion Google · dit une fois, à l'arrivée.
  const retourDit = useRef(false);
  useEffect(() => { if (p.retourDrive && !retourDit.current) { retourDit.current = true; toast(p.retourDrive); } }, [p.retourDrive, toast]);

  const v = vueDrive(p.donnees, etat);
  const rangements = useMemo(() => dossiersRangement(p.donnees), [p.donnees]);
  const fichierApercu = apercu ? p.donnees.fichiers.find((f) => f.id === apercu) ?? null : null;
  const dossierDe = (id: string) => p.donnees.dossiers.find((d) => d.id === id);
  const corbeille = etat.section === 'corbeille';
  const nTrash = p.donnees.dossiers.filter((d) => d.reel && d.supprime && !dossierDe(d.parent ?? '')?.supprime).length;
  const rafraichir = () => router.refresh();
  const g = p.gestion;
  const selecteur = useSelecteurDrive(toast, rafraichir);
  const prixImage = (n: number) => (g?.analyse.cout != null ? ` · ${g.analyse.cout * n} crédit${g.analyse.cout * n > 1 ? 's' : ''}` : '');

  const aller = (id: string) => {
    const chemin = cheminVers(p.donnees, id);
    setEtat((e) => ({ ...e, section: 'drive', recherche: '', chemin, ouverts: new Set([...e.ouverts, ...chemin]) }));
    setSelection(new Set()); setApercu(null);
  };
  const section = (s: SectionDrive) => {
    setEtat((e) => ({ ...e, section: s, recherche: '', chemin: s === 'drive' ? [] : e.chemin }));
    setSelection(new Set()); setApercu(null);
  };
  const basculerNoeud = (id: string) => setEtat((e) => { const o = new Set(e.ouverts); if (o.has(id)) o.delete(id); else o.add(id); return { ...e, ouverts: o }; });
  const basculerSel = (id: string) => setSelection((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function nouveauDossier() {
    setMenu(false);
    if (!ecriture || occupe) return;
    const nom = window.prompt('Nom du nouveau dossier', 'Nouveau dossier');
    if (nom == null) return;
    const parentId = v.nouveau?.parentId ?? null;
    setOccupe(true);
    const r = await creerDossierAction({ nom, parentId });
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(`Dossier créé dans « ${v.nouveau?.dans ?? v.depot} »`);
    rafraichir();
  }

  async function importer(files: File[]) {
    if (!ecriture || !files.length || occupe) return;
    setOccupe(true);
    let ok = 0; const echecs: string[] = [];
    try {
      if (p.stockage) {
        for (const f of files) {
          const pre = await presignAssetUploadAction({ filename: f.name, contentType: f.type || 'application/octet-stream', sizeBytes: f.size });
          if (pre.error || !pre.uploadUrl || !pre.publicUrl || !pre.contentType) { echecs.push(pre.error ?? f.name); continue; }
          try { await envoyerVersBucket(pre.uploadUrl, f, pre.contentType); } catch { echecs.push(f.name); continue; }
          const reg = await registerUploadedAssetAction({ name: f.name, url: pre.publicUrl, mimeType: f.type, sizeBytes: f.size, common: commun });
          if (reg.error) echecs.push(reg.error); else ok++;
        }
      } else {
        const images = files.filter((f) => f.type.startsWith('image/'));
        if (images.length < files.length) echecs.push('sans stockage, seules les images se téléversent');
        if (images.length) {
          const items = await Promise.all(images.map(async (f) => ({ name: f.name, dataUri: await fichierEnDataUri(f) })));
          const r = await uploadImageAssetsAction({ items, common: commun });
          if (r.error) echecs.push(r.error); else ok = r.count ?? images.length;
        }
      }
    } catch { echecs.push('échec du téléversement'); }
    setOccupe(false);
    toast(ok ? `${ok} fichier${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''} dans « ${v.depot} »${echecs.length ? ` · ${echecs[0]}` : ''}` : (echecs[0] ?? 'Aucun fichier importé'));
    if (ok) { setEtat((e) => ({ ...e, section: 'drive', recherche: '', chemin: ['r:assets'] })); rafraichir(); }
  }

  async function importerLiens() {
    if (!ecriture || occupe) return;
    const lu = lireImportLiens(lien.texte, lien.nom);
    if (!lu.liens.length) { toast(lu.erreur ?? 'Aucun lien à importer'); return; }
    setOccupe(true);
    let ok = 0; let echec: string | null = null;
    for (const l of lu.liens) {
      const r = await importAssetAction({ name: l.nom, url: l.url, kind: lien.type, common: commun }).catch(() => ({ error: 'L’import a échoué.' }));
      if (r.error) echec = echec ?? r.error; else ok++;
    }
    setOccupe(false);
    toast(ok ? `${ok} élément${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}${echec ? ` · ${echec}` : lu.erreur ? ` · ${lu.erreur}` : ''}` : (echec ?? 'Aucun élément importé'));
    if (ok) { setDialogueLien(false); setLien({ texte: '', nom: '', type: lien.type }); setEtat((e) => ({ ...e, section: 'drive', recherche: '', chemin: ['r:assets'] })); rafraichir(); }
  }

  async function analyserLot() {
    setMenu(false);
    if (!g || g.analyse.raison || occupe) return;
    setOccupe(true);
    const r = await tagUntaggedImagesAction().catch(() => ({ error: 'L’analyse a échoué.' } as { tagged?: number; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(`${r.tagged ?? 0} image${(r.tagged ?? 0) > 1 ? 's' : ''} analysée${(r.tagged ?? 0) > 1 ? 's' : ''}`);
    rafraichir();
  }

  async function analyserUne(f: FichierDrive) {
    if (!g || g.analyse.raison || occupe) return;
    setOccupe(true);
    const r = await tagAssetAction({ id: f.id }).catch(() => ({ error: 'L’analyse a échoué.' } as { tags?: string[]; error?: string }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(r.tags?.length ? `Tags posés · ${r.tags.slice(0, 4).join(', ')}` : 'Aucun tag retenu pour cette image');
    rafraichir();
  }

  async function basculerIa(f: FichierDrive, cle: 'utilisable' | 'template') {
    if (!f.ia || occupe) return;
    setOccupe(true);
    const r = cle === 'utilisable'
      ? await toggleAssetAiAction({ id: f.id, useForAi: !f.ia.utilisable }).catch(() => ({ error: 'L’enregistrement a échoué.' }))
      : await basculerTemplateAction({ id: f.id, on: !f.ia.template }).catch(() => ({ error: 'L’enregistrement a échoué.' }));
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    toast(cle === 'utilisable' ? (f.ia.utilisable ? 'Ce fichier ne servira plus à l’IA' : 'Ce fichier peut servir à l’IA') : (f.ia.template ? 'Retiré des templates' : 'Rangé dans les templates'));
    rafraichir();
  }

  async function synchroniser() {
    if (occupe) return;
    setOccupe(true); setMenu(false);
    const r = await syncDriveNowAction();
    setOccupe(false);
    if (r.error) { toast(r.error); return; }
    // Le résumé commun (N09) · trouvés, importés, déjà là, en erreur · un dossier vide s'explique.
    toast(`Google Drive synchronisé · ${resumeImportDrive({ found: r.found ?? 0, added: r.added ?? 0, skipped: r.skipped ?? 0 })}`);
    rafraichir();
  }

  async function corbeilleOuRestaurer() {
    const ids = [...selection];
    if (!ids.length || occupe) return;
    if (!corbeille && !window.confirm(`Mettre ${ids.length} dossier${ids.length > 1 ? 's' : ''} à la corbeille ? Ils restent restaurables, avec leur contenu.`)) return;
    setOccupe(true);
    const res = await Promise.all(ids.map((id) => (corbeille ? restaurerDossierAction({ id }) : supprimerDossierAction({ id }))));
    setOccupe(false);
    const err = res.find((r) => r.error)?.error;
    const n = res.filter((r) => r.ok).length;
    setSelection(new Set());
    if (n) toast(corbeille ? `${n} dossier${n > 1 ? 's' : ''} restauré${n > 1 ? 's' : ''}` : `${n} dossier${n > 1 ? 's' : ''} placé${n > 1 ? 's' : ''} dans la corbeille`);
    if (err) toast(err);
    rafraichir();
  }

  async function changerDroit(f: FichierDrive, valeur: string) {
    const r = await definirDroitsAssetAction({ assetId: f.id, droit: valeur ? (valeur as DroitAsset) : null });
    if (r.error) { toast(r.error); return; }
    toast('Droits d’usage enregistrés');
    rafraichir();
  }

  async function ranger(f: FichierDrive, valeur: string) {
    const r = await affecterAssetDossierAction({ assetId: f.id, folderId: valeur || null });
    if (r.error) { toast(r.error); return; }
    toast('Fichier rangé');
    rafraichir();
  }

  async function supprimerFichier(f: FichierDrive) {
    if (!window.confirm(`Supprimer définitivement « ${f.nom} » ? Il ne pourra pas être restauré et ne servira plus aux Studios.`)) return;
    const r = await deleteAssetAction({ id: f.id });
    if (r.error) { toast(r.error); return; }
    setApercu(null);
    toast('Fichier supprimé');
    rafraichir();
  }

  const surDepot = (e: DragEvent) => { if (!ecriture) return; e.preventDefault(); setGlisse(true); };
  const deposer = (e: DragEvent) => { if (!ecriture) return; e.preventDefault(); setGlisse(false); void importer([...e.dataTransfer.files]); };

  const boutonDrive = p.drive.etat === 'connecte'
    ? <span className="pill g"><Ic n="check" />Google Drive connecté</span>
    : <button type="button" className="btn" disabled={p.drive.etat !== 'a-connecter' || !ecriture} title={p.drive.etat === 'a-connecter' ? undefined : p.drive.resume} onClick={() => { window.location.href = '/api/oauth/google'; }}><LogoApp app="gdrive" taille={28} interieur={16} />Connecter Google Drive</button>;

  const tuileDrive = p.drive.etat === 'connecte' ? (
    <div className="dapp on">
      <LogoApp app="gdrive" taille={30} interieur={18} />
      <div className="dapp-t"><strong>Google Drive</strong><small>{p.drive.resume}</small></div>
      {!p.drive.peutSynchroniser && g?.selecteurDrive
        ? <button className="dapp-ic" type="button" onClick={selecteur.choisirDossier} disabled={!!selecteur.occupe || !ecriture} aria-label="Choisir le dossier Google Drive" title="Choisir le dossier à synchroniser"><Ic n="folder" /></button>
        : <button className="dapp-ic" type="button" onClick={() => void synchroniser()} disabled={!p.drive.peutSynchroniser || occupe || !ecriture} aria-label="Synchroniser Google Drive" title={p.drive.peutSynchroniser ? 'Synchroniser maintenant' : 'Choisis d’abord un dossier Drive'}><Ic n="loop" /></button>}
    </div>
  ) : (
    <button type="button" className="dapp" disabled={p.drive.etat !== 'a-connecter' || !ecriture} title={p.drive.etat === 'a-connecter' ? undefined : p.drive.resume} onClick={() => { window.location.href = '/api/oauth/google'; }}>
      <LogoApp app="gdrive" taille={30} interieur={18} />
      <div className="dapp-t"><strong>Google Drive</strong><small>{p.drive.etat === 'a-connecter' ? 'Connecter' : p.drive.resume}</small></div>
      <span className="dapp-ic"><Ic n="plus" /></span>
    </button>
  );

  const fsel = (id: string) => { const on = selection.has(id); return <button type="button" className={`fsel ${on ? 'on' : ''}`} aria-pressed={on} aria-label={`Sélectionner ${p.donnees.dossiers.find((d) => d.id === id)?.nom ?? ''}`} onClick={() => basculerSel(id)}>{on && <Ic n="check" />}</button>; };

  const grille = (
    <>
      {(v.dossiers.length > 0 || v.nouveau) && (
        <>
          <div className="dsub">Dossiers</div>
          <div className="fgrid2">
            {v.dossiers.map((d) => {
              const sel = selection.has(d.id);
              return (
                <div className={`fcard ${sel ? 'sel' : ''}`} key={d.id}>
                  <button type="button" className="fopen" onClick={() => (corbeille ? d.selectionnable && basculerSel(d.id) : aller(d.id))}>
                    <span className="fic"><Ic n="folder" s={false} /></span>
                    <span className="ftx"><strong>{d.nom}</strong><small>{d.compte} élément{d.compte > 1 ? 's' : ''}{d.sousDossiers ? ` · ${d.sousDossiers} sous-dossier${d.sousDossiers > 1 ? 's' : ''}` : ''}{corbeille ? ' · restaurable' : ''}</small></span>
                    <span className="fths">
                      {d.vignettes.map((t, i) => (t.url
                        ? <i key={i} className="fth" style={{ backgroundImage: `url(${JSON.stringify(t.url)})`, backgroundPosition: '50% 50%' }} />
                        : <i key={i} className="fth fi" style={style({ '--fc': ICONE_TYPE[t.type]!.couleur })}><Ic n={ICONE_TYPE[t.type]!.icone} /></i>))}
                    </span>
                  </button>
                  <div className="facts">{d.selectionnable && ecriture && fsel(d.id)}</div>
                </div>
              );
            })}
            {v.nouveau && ecriture && (
              <button type="button" className="fcard fnew" onClick={() => void nouveauDossier()} disabled={occupe}>
                <span className="fic"><Ic n="plus" s={false} /></span>
                <span className="ftx"><strong>Nouveau sous-dossier</strong><small>dans « {v.nouveau.dans} »</small></span>
              </button>
            )}
          </div>
        </>
      )}
      {v.fichiers.length > 0 && (
        <>
          <div className="dsub">Fichiers</div>
          <div className="dfiles">
            {v.fichiers.map((f) => (
              <div className={`dcard ${apercu === f.id ? 'cur' : ''}`} key={f.id}>
                <button type="button" className="dopen" onClick={() => setApercu(apercu === f.id ? null : f.id)} aria-label={`Aperçu de ${f.nom}`}><Vignette f={f} /></button>
                <div className="dmeta"><IconeFichier f={f} /><span className="nm" title={f.nom}>{f.nom}</span></div>
                <div className="dsub2"><PastilleFichier f={f} /><span className="faint">{formatTaille(f.tailleOctets)}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  const liste = (
    <div className="dtbl">
      <div className="dtr h"><span /><span>Nom</span><span>Origine</span><span>Ajouté</span><span>Taille</span><span>Droits</span><span /></div>
      {v.dossiers.map((d) => (
        <div className={`dtr ${selection.has(d.id) ? 'sel' : ''}`} key={d.id}>
          {d.selectionnable && ecriture ? <button type="button" className={`dchk ${selection.has(d.id) ? 'on' : ''}`} aria-pressed={selection.has(d.id)} aria-label={`Sélectionner ${d.nom}`} onClick={() => basculerSel(d.id)}>{selection.has(d.id) && <Ic n="check" />}</button> : <span />}
          <button type="button" className="dname" onClick={() => (corbeille ? undefined : aller(d.id))}><span className="dfold" style={style({ '--fc': '#94a3b8' })}><Ic n="folder" /></span><span className="nm">{d.nom}</span></button>
          <span className="downer">Bibliothèque</span>
          <span className="faint" />
          <span className="faint num">{d.compte} élém.</span>
          <span /><span />
        </div>
      ))}
      {v.fichiers.map((f) => (
        <div className={`dtr ${apercu === f.id ? 'cur' : ''}`} key={f.id}>
          <span />
          <button type="button" className="dname" onClick={() => setApercu(apercu === f.id ? null : f.id)}><IconeFichier f={f} /><span className="nm">{f.nom}</span></button>
          <span className="downer">{f.source}</span>
          <span className="faint">{libelleJour(f.creeLe, maintenant)}</span>
          <span className="faint num">{formatTaille(f.tailleOctets)}</span>
          <span><PastilleFichier f={f} /></span>
          <span />
        </div>
      ))}
    </div>
  );

  const fa = fichierApercu;
  const dossierFichier = fa ? dossierDe(fa.parent) : undefined;

  return (
    <Vue>
      <EnTete titre="Bibliothèque" sous="Assets de la marque, créations et exports, rangés comme dans un drive" />
      <nav className="btabs" aria-label="Espaces">
        {v.onglets.map((o) => (
          <button type="button" className={o.actif ? 'on' : ''} key={o.id} onClick={() => aller(o.id)}><Ic n={o.icone} /><span>{o.nom}</span><b>{o.compte}</b></button>
        ))}
      </nav>
      <div className="bpre">
        {p.lectureSeule && <div className="bbanner"><Ic n="lock" /><p><b>Lecture seule.</b> {p.lectureSeule}</p></div>}
        {g?.messageDrive && (
          <div className="bbanner" data-geste="drive-inactif">
            <LogoApp app="gdrive" taille={28} interieur={16} />
            <p><b>{g.messageDrive.constat}</b> {g.messageDrive.suite}</p>
            {g.messageDrive.action && <Lien className="btn sm" href={g.messageDrive.action.href}>{g.messageDrive.action.libelle}</Lien>}
          </div>
        )}
        {v.banniere && (
          <div className="bbanner">
            <Ic n="shield" />
            <p><b>Les assets de la marque alimentent les Studios.</b> Seuls les fichiers aux droits autorisés servent dans une publicité · « À préciser » les bloque.</p>
            {boutonDrive}
          </div>
        )}
      </div>
      <div className={`drive ${fa ? 'withprev' : ''}`}>
        <aside className="dside tile">
          <div className="dnew">
            <button className="btn pri" type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)} disabled={!ecriture}><Ic n="plus" />Nouveau</button>
            {menu && ecriture && (
              <div className="dmenu glass">
                <button type="button" onClick={() => void nouveauDossier()}><Ic n="folder" />Nouveau dossier</button>
                <button type="button" onClick={() => { setMenu(false); fichierRef.current?.click(); }}><Ic n="down" />Importer des fichiers</button>
                {p.drive.etat === 'connecte' && p.drive.peutSynchroniser && <button type="button" onClick={() => void synchroniser()}><LogoApp app="gdrive" taille={18} interieur={12} />Synchroniser Google Drive</button>}
                {p.drive.etat === 'a-connecter' && <button type="button" onClick={() => { window.location.href = '/api/oauth/google'; }}><LogoApp app="gdrive" taille={18} interieur={12} />Connecter Google Drive</button>}
                {g && (
                  <>
                    <button type="button" onClick={() => { setMenu(false); setDialogueLien(true); }}><Ic n="plus" />Importer par lien</button>
                    {p.drive.etat === 'connecte' && g.selecteurDrive && <button type="button" onClick={() => { setMenu(false); selecteur.choisirDossier(); }} disabled={!!selecteur.occupe}><LogoApp app="gdrive" taille={18} interieur={12} />{p.drive.peutSynchroniser ? 'Changer de dossier Drive' : 'Choisir le dossier Drive'}</button>}
                    {p.drive.etat === 'connecte' && g.selecteurDrive && <button type="button" onClick={() => { setMenu(false); selecteur.choisirFichiers(); }} disabled={!!selecteur.occupe}><LogoApp app="gdrive" taille={18} interieur={12} />Importer des fichiers Drive</button>}
                    {g.analyse.sansTags > 0 && <button type="button" onClick={() => void analyserLot()} disabled={!!g.analyse.raison || occupe} title={g.analyse.raison ?? undefined}><Ic n="spark" />Analyser {Math.min(g.analyse.sansTags, g.analyse.maxLot)} image{Math.min(g.analyse.sansTags, g.analyse.maxLot) > 1 ? 's' : ''} sans tags{g.analyse.cout != null ? ` · jusqu’à ${g.analyse.cout * Math.min(g.analyse.sansTags, g.analyse.maxLot)} crédits` : ''}</button>}
                    <button type="button" aria-pressed={commun} onClick={() => setCommun((c) => !c)}><Ic n={commun ? 'check' : 'users'} />{commun ? 'Import commun à toutes les marques · activé' : 'Importer comme commun à toutes les marques'}</button>
                  </>
                )}
              </div>
            )}
          </div>
          <nav className="dsec" aria-label="Sections">
            {SECTIONS_DRIVE.map((s) => (
              <button type="button" key={s.cle} className={etat.section === s.cle && !etat.recherche.trim() ? 'on' : ''} onClick={() => section(s.cle)}>
                <Ic n={s.icone} /><span>{s.nom}</span>{s.cle === 'corbeille' && nTrash > 0 && <span className="faint">{nTrash}</span>}
              </button>
            ))}
          </nav>
          <div className="dconn">
            <span className="g">Importer tes assets</span>
            {tuileDrive}
            <button type="button" className="dapp" disabled title="Dropbox · bientôt, aucun connecteur n’existe encore">
              <LogoApp app="dropbox" taille={30} interieur={18} />
              <div className="dapp-t"><strong>Dropbox</strong><small>Bientôt</small></div>
              <span className="dapp-ic"><Ic n="plus" /></span>
            </button>
            <Lien className="dmore" href="/connections">Toutes les connexions <Ic n="arrow" /></Lien>
          </div>
          <div className="dtree">
            {v.arbre.map((n) => (
              <Fragment key={n.id}>
                {n.separateurAvant && <span className="tnsep" />}
                <div className={`tnr lv${Math.min(n.niveau, 2)} ${n.actif ? 'on' : ''}`} style={style({ '--lv': n.niveau })}>
                  {n.aEnfants
                    ? <button type="button" className={`tnc ${n.ouvert ? 'op' : ''}`} aria-label={`${n.ouvert ? 'Replier' : 'Déplier'} ${n.nom}`} aria-expanded={n.ouvert} onClick={() => basculerNoeud(n.id)}><i className="tchev" /></button>
                    : <span className="tnc" />}
                  <button type="button" className="tnb" onClick={() => aller(n.id)}>
                    {n.racine ? <span className="tni"><Ic n={n.icone} /></span> : <span className="tno"><Ic n="folder" /></span>}
                    <span className="tnn">{n.nom}</span><span className="tnk">{n.compte}</span>
                  </button>
                </div>
              </Fragment>
            ))}
            <div className="tgf"><span className="g">Tags</span><div className="tgl"><small className="faint">Tags de couleur · bientôt</small></div></div>
          </div>
          <div className="dquota"><small className="faint">{v.volume}</small></div>
        </aside>
        <section className="dmain" id="dmain" onDragOver={surDepot} onDrop={deposer}>
          <div className="dbar">
            <nav className="crumb" aria-label="Emplacement">
              {v.fil.map((c, i) => (i < v.fil.length - 1
                ? <Fragment key={i}><button type="button" onClick={() => setEtat((e) => ({ ...e, chemin: e.chemin.slice(0, c.index ?? 0) }))}>{c.libelle}</button><span className="faint">›</span></Fragment>
                : <strong key={i}>{c.libelle}</strong>))}
            </nav>
            <label className="dsearch"><Ic n="search" /><input id="libq" value={etat.recherche} onChange={(e) => { const q = e.target.value; setEtat((x) => ({ ...x, recherche: q })); }} placeholder="Rechercher dans le drive" autoComplete="off" /></label>
            <div className="seg" role="group" aria-label="Affichage">
              <button type="button" aria-pressed={affichage === 'grille'} aria-label="Grille" onClick={() => setAffichage('grille')}><Ic n="grid" /></button>
              <button type="button" aria-pressed={affichage === 'liste'} aria-label="Liste" onClick={() => setAffichage('liste')}><Ic n="text" /></button>
            </div>
            <select className="dsort" id="dsort" aria-label="Trier" value={etat.tri} onChange={(e) => { const tri = e.target.value as TriDrive; setEtat((x) => ({ ...x, tri })); }}>
              <option value="nom">Trier : Nom</option><option value="date">Trier : Ajouté</option><option value="taille">Trier : Taille</option>
            </select>
            {g && (
              <select className="dsort" aria-label="Type de fichier" value={etat.type ?? 'tous'} onChange={(e) => { const type = e.target.value as FiltreTypeDrive; setEtat((x) => ({ ...x, type })); }}>
                {FILTRES_TYPE_DRIVE.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
              </select>
            )}
          </div>
          {selection.size > 0 && (
            <div className="dbulk">
              <strong>{selection.size} sélectionné{selection.size > 1 ? 's' : ''}</strong>
              <button className="btn sm" type="button" onClick={() => void corbeilleOuRestaurer()} disabled={occupe}><Ic n={corbeille ? 'check' : 'x'} />{corbeille ? 'Restaurer' : 'Mettre à la corbeille'}</button>
              <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} onClick={() => setSelection(new Set())}>Désélectionner</button>
            </div>
          )}
          {v.vide && <div className="dempty"><span className="ico"><Ic n={v.vide.icone} s={false} /></span><h3>{v.vide.titre}</h3><p className="muted">{v.vide.texte}</p></div>}
          {affichage === 'grille' ? grille : liste}
          <input type="file" id="dfile" ref={fichierRef} multiple accept={p.stockage ? 'image/*,video/*,audio/*,application/pdf' : 'image/*'} hidden onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ''; void importer(l); }} />
          <div className="ddrop" id="ddrop" hidden={!glisse} onDragLeave={() => setGlisse(false)}><Ic n="down" s={false} /><strong>Dépose pour importer dans « {v.depot} »</strong></div>
        </section>
        {fa && (
          <aside className="tile dprev" aria-label="Aperçu">
            <div className="sech" style={{ margin: 0 }}><strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fa.nom}</strong><button className="btn icon sm" style={{ width: 34, marginLeft: 'auto' }} type="button" onClick={() => setApercu(null)} aria-label="Fermer l’aperçu"><Ic n="x" /></button></div>
            <div className="dbig"><Vignette f={fa} /></div>
            <div className="kc"><PastilleFichier f={fa} />{fa.ia?.template && <span className="pill c" data-badge="template">Template</span>}</div>
            {fa.droit === 'a_preciser' && <div className="banner" style={{ margin: 0 }}><Ic n="warn" /><span>Droits à préciser : ce fichier ne peut pas encore servir dans une publicité.</span></div>}
            <dl className="kv2" style={{ gridTemplateColumns: '110px minmax(0,1fr)', margin: 0 }}>
              <dt>Type</dt><dd>{LIBELLE_TYPE_FICHIER[fa.type]}</dd>
              <dt>Taille</dt><dd>{formatTaille(fa.tailleOctets)}</dd>
              <dt>Ajouté</dt><dd>{libelleJour(fa.creeLe, maintenant)}</dd>
              <dt>Source</dt><dd>{fa.source}</dd>
              <dt>Dossier</dt><dd>{dossierFichier?.nom ?? v.depot}</dd>
            </dl>
            <div style={{ display: 'grid', gap: 8 }}>
              {!fa.lectureSeule && ecriture && (
                <>
                  <span className="lbl" style={{ margin: 0 }}>Droits d’usage</span>
                  <select className="dsort" aria-label="Droits d’usage" value={fa.droit ?? ''} onChange={(e) => void changerDroit(fa, e.target.value)}>
                    <option value="">Non classé</option>
                    {DROITS_ASSET.map((d) => <option key={d.cle} value={d.cle}>{d.libelle}</option>)}
                  </select>
                  <span className="lbl" style={{ margin: 0 }}>Ranger dans</span>
                  <select className="dsort" aria-label="Ranger dans un dossier" value={dossierFichier?.reel ? fa.parent : ''} onChange={(e) => void ranger(fa, e.target.value)}>
                    {rangements.map((r) => <option key={r.id ?? 'racine'} value={r.id ?? ''}>{r.nom}</option>)}
                  </select>
                </>
              )}
              {fa.ia && ecriture && g && (
                <div data-geste="ia-fichier" style={{ display: 'grid', gap: 8 }}>
                  <span className="lbl" style={{ margin: 0 }}>Usage par l’IA</span>
                  <label className="npr" style={{ cursor: 'pointer' }}><input type="checkbox" checked={fa.ia.utilisable} disabled={occupe} onChange={() => void basculerIa(fa, 'utilisable')} /><div><strong>Utilisable par l’IA</strong><small>Les Studios peuvent s’en servir pour composer</small></div></label>
                  {g.admin && <label className="npr" style={{ cursor: 'pointer' }}><input type="checkbox" checked={fa.ia.template} disabled={occupe} onChange={() => void basculerIa(fa, 'template')} /><div><strong>Template</strong><small>Visible du client comme modèle</small></div></label>}
                  {fa.ia.tags.length > 0 && <div className="chips" style={{ marginTop: 0 }}>{fa.ia.tags.map((t) => <span className="pill" key={t}>{t}</span>)}</div>}
                  {fa.type === 'image' && (
                    <button className="btn" type="button" onClick={() => void analyserUne(fa)} disabled={!!g.analyse.raison || occupe} title={g.analyse.raison ?? undefined}><Ic n="spark" />{fa.ia.tags.length ? 'Analyser à nouveau' : 'Analyser l’image'}{prixImage(1)}</button>
                  )}
                </div>
              )}
              {fa.projet && <Lien className="btn pri" href={fa.projet.href}><Ic n="brush" />Ouvrir le projet</Lien>}
              <a className="btn" href={fa.telecharger ?? fa.url} target="_blank" rel="noopener noreferrer" download><Ic n="down" />Télécharger</a>
              {!fa.lectureSeule && ecriture && <button className="btn" type="button" onClick={() => void supprimerFichier(fa)}><Ic n="x" />Supprimer définitivement</button>}
            </div>
          </aside>
        )}
      </div>
      {g && (
        <DialogueSpatial titre="Importer par lien" ouvert={dialogueLien} fermer={() => setDialogueLien(false)}>
          <form style={{ display: 'grid', gap: 10 }} onSubmit={(e) => { e.preventDefault(); void importerLiens(); }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Une adresse par ligne · rushs, vidéos ou liens de partage Google Drive (« Tous les utilisateurs disposant du lien »). Ils arrivent dans « {v.depot} »{commun ? ', communs à toutes les marques' : ''}.</p>
            <textarea value={lien.texte} onChange={(e) => setLien((x) => ({ ...x, texte: e.target.value }))} rows={4} required aria-label="Adresses à importer" placeholder="https://…" style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)', resize: 'vertical' }} />
            <input value={lien.nom} onChange={(e) => setLien((x) => ({ ...x, nom: e.target.value }))} aria-label="Nom (une seule adresse)" placeholder="Nom (facultatif, pour une seule adresse)" style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)' }} />
            <select className="dsort" aria-label="Type de fichier" value={lien.type} onChange={(e) => setLien((x) => ({ ...x, type: e.target.value as TypeImportLien }))}>
              {TYPES_IMPORT_LIEN.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
            </select>
            <div className="pbtns"><button className="btn" type="button" onClick={() => setDialogueLien(false)}>Annuler</button><button className="btn pri" type="submit" disabled={occupe || !lien.texte.trim()}>Importer</button></div>
          </form>
        </DialogueSpatial>
      )}
    </Vue>
  );
}
