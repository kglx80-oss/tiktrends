'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Remontee } from '@tiktrends/core';
import { syncAdsMapAction } from '../../../app/actions/adsmap';
import { applyImportAction, previewImportAction, type PreviewResult } from '../../../app/actions/adsmap-import';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import type { SousNavResultats } from './communs';

/**
 * « Importer des résultats » · `docs/spatial/reference/importer.html`, balisage à
 * l'identique. Réel de bout en bout :
 *  · Meta Ads · la connexion de la marque (compte + jeton) · « Mesurer
 *    maintenant » lance la vraie synchro (`syncAdsMapAction`), son compte rendu
 *    est affiché tel quel, décevant compris ;
 *  · TikTok et Google · aucun connecteur publicitaire n'existe · « Bientôt »,
 *    sans bouton actif ;
 *  · le dépôt · le tableau historique (CSV de Google Sheets) · analysé d'abord
 *    (`previewImportAction`, rien n'est écrit), importé ensuite seulement
 *    (`applyImportAction`, admin) ;
 *  · les remontées · la dernière mesure Meta et les lots repris du tableau.
 */

const COULEUR = { meta: '#0467df', tableau: '#34a853' } as const;
const LETTRE = { meta: 'M', tableau: 'S' } as const;

export interface PropsImporter {
  sousNav: SousNavResultats;
  meta: { connecte: boolean; mesure: string | null };
  remontees: ReadonlyArray<Remontee & { quand: string }>;
}

function choisirFichier(): Promise<File | null> {
  // Un champ fichier créé à la demande · aucun élément ajouté au balisage de la maquette.
  return new Promise((ok) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = '.csv,text/csv';
    champ.onchange = () => ok(champ.files?.[0] ?? null);
    champ.click();
  });
}

export function Importer(p: PropsImporter) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [mesure, setMesure] = useState<{ occupe: boolean; texte: string | null }>({ occupe: false, texte: null });
  const [csv, setCsv] = useState<{ nom: string; texte: string } | null>(null);
  const [apercu, setApercu] = useState<PreviewResult | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);

  async function mesurer() {
    if (mesure.occupe) return;
    setMesure({ occupe: true, texte: null });
    const r = await syncAdsMapAction();
    setMesure({ occupe: false, texte: r.error ?? r.summary ?? 'Mesure terminée.' });
    if (!r.error) router.refresh();
  }

  async function lire(f: File | null) {
    if (!f) return;
    setErreur(null); setApercu(null); setFait(false);
    const texte = await f.text();
    setCsv({ nom: f.name, texte });
    setOccupe(true);
    const r = await previewImportAction(texte);
    setOccupe(false);
    if (r.error) { setErreur(r.error); return; }
    setApercu(r);
  }

  async function importer() {
    if (occupe || !csv) return;
    setOccupe(true); setErreur(null);
    const r = await applyImportAction(csv.texte);
    setOccupe(false);
    if (r.error) { setErreur(r.error); return; }
    setFait(true);
    toast(`Tableau importé · ${r.report?.ads ?? 0} variantes reprises`);
    router.refresh();
  }

  const rep = apercu?.report;
  return (
    <Vue>
      <EnTete titre="Importer des résultats" sous="Les mesures remontent dans tes lots : c’est ce qui permet de conclure, puis d’itérer" />
      <SousNav items={p.sousNav} actif="/adsmap/import" />
      <div className="lbl" style={{ marginBottom: 10 }}>Connexion automatique · lecture seule · mesure chaque nuit</div>
      <div className="grid3">
        <div className="tile conn2">
          <span className="logo2" style={{ background: COULEUR.meta }}>M</span>
          <div className="t"><strong>Meta Ads</strong><small>Facebook et Instagram</small>
            <span className={`pill ${p.meta.connecte ? 'g' : ''}`} style={{ marginTop: 6 }}>{p.meta.connecte ? (p.meta.mesure ? `Mesuré ${p.meta.mesure}` : 'Connecté · jamais mesuré') : 'Non connecté'}</span>
          </div>
          {p.meta.connecte
            ? <button className="btn sm" type="button" disabled={mesure.occupe} onClick={mesurer} title={mesure.texte ?? undefined}>{mesure.occupe ? 'Mesure…' : 'Mesurer maintenant'}</button>
            : <Lien className="btn sm pri" href="/connections">Connecter</Lien>}
        </div>
        {([['T', '#111', 'TikTok Ads', 'TikTok for Business'], ['G', '#34a853', 'Google Ads', 'YouTube et Demand Gen']] as const).map(([l, c, t, s]) => (
          <div className="tile conn2" key={t}>
            <span className="logo2" style={{ background: c }}>{l}</span>
            <div className="t"><strong>{t}</strong><small>{s}</small><span className="pill" style={{ marginTop: 6 }}>Bientôt</span></div>
            <button className="btn sm" type="button" disabled title="Aucun connecteur publicitaire pour cette régie pour l’instant">Bientôt</button>
          </div>
        ))}
      </div>
      {mesure.texte && <p className="faint" role="status" style={{ fontSize: '12.5px', marginTop: 8 }}>{mesure.texte}</p>}
      <section className="sec grid2">
        <div className="drop" role="button" tabIndex={0} aria-label="Choisir le tableau historique (CSV)"
          onClick={() => { void choisirFichier().then(lire); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void choisirFichier().then(lire); } }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void lire(e.dataTransfer.files?.[0] ?? null); }}>
          <Ic n="down" s={false} />
          <strong>{csv ? csv.nom : 'Déposer le tableau historique (CSV)'}</strong>
          <span className="faint" style={{ fontSize: '12.5px' }}>
            {occupe ? 'Lecture…'
              : erreur ?? (fait ? 'Import terminé · les lots repris apparaissent dans la liste.'
                : rep ? `${rep.rowsRead} lignes lues · ${rep.concepts} concepts, ${rep.ads} variantes, ${rep.batches} lots, ${rep.verdicts} verdicts · ${rep.warnings.length} écart${rep.warnings.length > 1 ? 's' : ''} signalé${rep.warnings.length > 1 ? 's' : ''}. Rien n’est écrit avant de confirmer.`
                  : 'Export CSV de Google Sheets · chaque écart est listé avant que quoi que ce soit ne soit écrit')}
          </span>
          <div className="seg" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-pressed="true">Tableau</button>
            <button type="button" disabled title="La mesure Meta passe par la connexion, pas par un export">Export Meta</button>
            <button type="button" disabled title="Aucun connecteur TikTok pour l’instant">Export TikTok</button>
          </div>
          {rep && !fait && (
            <button className="btn sm pri" type="button" disabled={occupe} onClick={(e) => { e.stopPropagation(); void importer(); }}>Importer {rep.ads} variantes</button>
          )}
        </div>
        <div className="tile">
          <div className="lbl">Dernières remontées</div>
          <div className="tl">
            {p.remontees.map((r) => (
              <div className="ev" key={`${r.source}-${r.le}-${r.texte}`}>
                <span className="logo2" style={{ background: COULEUR[r.source], width: 32, height: 32, fontSize: '11.5px' }}>{LETTRE[r.source]}</span>
                <span>{r.texte}</span><span className="faint" style={{ fontSize: '11.5px' }}>{r.quand}</span>
              </div>
            ))}
            {p.remontees.length === 0 && <div className="ev"><span /><span className="faint">Aucune mesure remontée pour cette marque.</span><span /></div>}
          </div>
        </div>
      </section>
    </Vue>
  );
}
