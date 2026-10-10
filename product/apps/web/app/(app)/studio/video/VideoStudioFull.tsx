'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { startVideoAction, startImageVideoAction, pollVideoAction, deleteVideoAction, suggestVideoBriefAction, pageVideosMarque, type BrandVideo, type PageVideos, type AnimatableAsset } from '../../../actions/video';
import { VIDEO_DURATIONS, generationOutcome, premiereVideoIncomplete, manqueVideo, VIDEO_DIRECTIONS, costFor, CIBLE_TACTILE_MIN, compteurGalerie, type VideoDuration, type EtatAssistantVideo } from '@tiktrends/core';
import { Icon } from '../../../../components/Icon';
import { surface, tuile } from '../../../../components/ui';
import { Pager } from '../../../../components/Pager';
import { useGaleriePaginee } from '../../../../components/useGaleriePaginee';
import { focusApresRetrait } from '../../../../components/focusApresRetrait';
import { DropZone } from '../../../../components/DropZone';
import { CreativeActions } from '../../../../components/CreativeActions';
import { Empty } from '../../../../components/Empty';
import { Composer } from '../../../../components/Composer';
import { usePreflight } from '../../../../components/usePreflight';
import { useScenes } from '../../../../components/useScenes';
import { VignetteDepart } from '../../../../components/VignetteDepart';
import { AssistantVideo } from './AssistantVideo';

type Ratio = '9:16' | '1:1' | '16:9';
const RATIOS: Ratio[] = ['9:16', '1:1', '16:9'];
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  processing: { label: 'Génération', color: '#7aa2ff' }, queued: { label: 'En file', color: '#f5a623' },
  completed: { label: 'Prête', color: '#18cc8c' }, failed: { label: 'Échec', color: '#ff4d6d' },
};

const fld = { width: '100%', minHeight: CIBLE_TACTILE_MIN, boxSizing: 'border-box', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 16, outline: 'none' } as const; // L8-B · 16 px (14 avant)

export function VideoStudioFull({ ready, aiReady, brandName, initialVideos, initialPrompt, assets, adsmap = false }: {
  ready: boolean; aiReady?: boolean; brandName: string | null; initialVideos: PageVideos; initialPrompt?: string; assets: AnimatableAsset[];
  /** L'utilisateur a l'atelier de test · affiche « Suivre dans Adsmap » sur chaque vidéo. */
  adsmap?: boolean;
}) {
  const [mode, setMode] = useState<'t2v' | 'i2v'>(assets.length ? 'i2v' : 't2v');
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [imageUrl, setImageUrl] = useState(assets[0]?.url ?? '');
  const [dropped, setDropped] = useState<AnimatableAsset[]>([]);
  // Vignettes dont l'image n'a pas pu être chargée · elles passent en repli et
  // cessent d'être sélectionnables (on n'anime pas une image fantôme).
  const [casses, setCasses] = useState<Record<string, true>>({});
  const shownAssets = [...dropped, ...assets];

  function onDropImages(uris: string[]) {
    const uri = uris[0];
    if (!uri) return;
    setDropped((l) => [{ url: uri, label: 'Importé', kind: 'asset' }, ...l]);
    setImageUrl(uri);
    setError('');
  }
  const [ratio, setRatio] = useState<Ratio>('9:16');
  // La durée existait de bout en bout mais n'était jamais exposée · un réglage
  // réel qu'on ne pouvait pas régler. Le prix la suit, sinon dix secondes se
  // paieraient au tarif de cinq.
  const [duree, setDuree] = useState<VideoDuration>(5);
  // La direction de mouvement · même logique que les directions d'image, mais
  // pour le geste (caméra, rythme, énergie). Vide = mouvement libre.
  const [direction, setDirection] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggesting, startSuggest] = useTransition();
  // Lot 13 · une page à la fois, lue sur le serveur (toutes les générations,
  // ordre stable) · plus les 24 dernières paginées côté client.
  const galerie = useGaleriePaginee<BrandVideo, PageVideos>(initialVideos, pageVideosMarque);
  const videos = galerie.etat.items;
  const setVideos = galerie.setItems;
  const grilleRef = useRef<HTMLDivElement>(null);
  const titreGalerieRef = useRef<HTMLHeadingElement>(null);
  // La scène reprise · consignée à la génération, c'est ce qui lui bâtit un
  // bilan. Toute frappe la libère : un texte retouché n'est plus la scène.
  const [sceneId, setSceneId] = useState('');
  // Ce que la mémoire dit de la description AVANT de payer la génération ·
  // le brief de pré-lancement n'arrivait qu'une fois la créa posée dans un lot,
  // c'est-à-dire après l'avoir fabriquée. Ici, il économise les deux.
  const preflight = usePreflight(prompt);
  const { scenes, enregistrer, erreur: sceneErreur, conseil } = useScenes('video');
  const [assistantOuvert, setAssistantOuvert] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  function suggestMotion() {
    if (suggesting) return;
    setError('');
    startSuggest(async () => {
      const r = await suggestVideoBriefAction({ fromImage: mode === 'i2v' });
      if (r.error) setError(r.error);
      else if (r.text) { setPrompt(r.text); setSceneId(''); }
    });
  }

  async function removeVideo(id: string) {
    const rang = videos.findIndex((v) => v.id === id);
    setVideos((list) => list.filter((v) => v.id !== id));
    if (!id.startsWith('tmp-')) await deleteVideoAction(id);
    // La page se recomble depuis la suivante · compteurs exacts.
    await galerie.recharger();
    focusApresRetrait(grilleRef.current, Math.max(0, rang), titreGalerieRef.current);
  }

  // Nettoyage des timers au démontage.
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // À chaque page lue : reprendre le suivi des vidéos encore « en cours » de
  // CETTE page (sinon le spinner ne bouge jamais), une seule fois par vidéo.
  const suivies = useRef(new Set<string>());
  useEffect(() => {
    const now = Date.now();
    const perimees: string[] = [];
    videos.forEach((v) => {
      if ((v.status !== 'processing' && v.status !== 'queued') || v.id.startsWith('tmp-')) return;
      const ageMin = (now - new Date(v.createdAt).getTime()) / 60000;
      // Trop vieux : on l'affiche en échec tout de suite (le serveur le confirmera aussi).
      // Le badge « Échec » seul ne disait pas pourquoi · c'est le délai (lot 9).
      if (ageMin > 20) perimees.push(v.id);
      if (v.jobId && !suivies.current.has(v.id)) { suivies.current.add(v.id); poll(v.id, v.jobId); }
    });
    // Ne réécrit que s'il y a quelque chose à changer · pas de boucle.
    if (perimees.length) setVideos((list) => list.map((x) => perimees.includes(x.id) ? { ...x, status: 'failed', error: x.error ?? 'Sans résultat après 20 minutes · considérée comme échouée.' } : x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  function poll(id: string, jobId: string, tries = 0) {
    const t = setTimeout(async () => {
      const r = await pollVideoAction(jobId, id.startsWith('tmp-') ? undefined : id);
      setVideos((list) => list.map((v) => v.id === id ? { ...v, status: r.status === 'unknown' ? v.status : r.status, videoUrl: r.videoUrl ?? v.videoUrl, error: r.error ?? v.error } : v));
      if (r.status === 'completed' || r.status === 'failed') return;
      if (tries > 80) return;
      poll(id, jobId, tries + 1);
    }, 5000);
    timers.current.push(t);
  }

  async function generate() {
    if (busy) return;
    if (mode === 't2v' && !prompt.trim()) { setError('Décris la vidéo à générer.'); return; }
    if (mode === 'i2v' && !imageUrl.trim()) { setError("Ajoute l'URL d'une image de départ."); return; }
    setError(''); setBusy(true);
    const res = mode === 't2v'
      ? await startVideoAction({ prompt, aspectRatio: ratio, durationS: duree, presetId: sceneId || undefined, directionKey: direction || undefined })
      : await startImageVideoAction({ prompt, imageUrl, aspectRatio: ratio, durationS: duree, presetId: sceneId || undefined, directionKey: direction || undefined });
    setBusy(false);
    // Un lancement sans identifiant de tâche ET sans erreur ne laissait aucune
    // trace · la vidéo n'apparaissait pas, et rien ne disait pourquoi.
    const out = generationOutcome({ error: res.error, got: res.jobId ? 1 : 0 });
    if (out.kind === 'error') { setError(out.message); return; }
    if (res.jobId) {
      const id = res.generationId ?? `tmp-${res.jobId}`;
      const fresh: BrandVideo = { id, prompt: prompt.trim() || '(image animée)', mode, status: 'processing', jobId: res.jobId, videoUrl: null, createdAt: new Date().toISOString() };
      setVideos((list) => [fresh, ...list]);
      suivies.current.add(id);
      poll(id, res.jobId);
      // Relire la première page sous une nouvelle borne · compteurs exacts.
      void galerie.depuisLeDebut();
      if (mode === 't2v') setPrompt('');
    }
  }

  function recheck(v: BrandVideo) {
    if (!v.jobId) return;
    setVideos((list) => list.map((x) => x.id === v.id ? { ...x, status: 'processing' } : x));
    poll(v.id, v.jobId);
  }

  // Le bouton dit ce qui manque AVANT le clic · même moteur d'étapes pur que
  // Pubs IA (`assistant-video`). Le refus « ajoute une image » n'apparaissait
  // qu'au clic, dans le bandeau d'erreur, ailleurs sur la page.
  const etatVideo: EtatAssistantVideo = { mode, imagePrete: !!imageUrl.trim(), description: prompt, ratio, duree };
  const premiereManquante = premiereVideoIncomplete(etatVideo);
  const blocage = premiereManquante ? manqueVideo(premiereManquante, etatVideo) : '';

  // La galerie d'images de départ · définie une fois, servie à la barre à plat
  // et à l'étape « départ » de l'assistant guidé.
  const departBlock = (
    <div>
      <label style={lbl}>Image de départ à animer <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· ton produit ou une pub déjà générée · <b style={{ color: 'var(--ink-2)' }}>glisse-dépose une image</b></span></label>
      <DropZone onImages={onDropImages} onError={setError} disabled={!ready || busy} hint="Déposer l'image de départ" style={{ padding: 6, border: tuile.border }}>
        {shownAssets.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {shownAssets.map((a) => (
              <VignetteDepart key={a.url} url={a.url} label={a.label} kind={a.kind}
                selected={imageUrl === a.url} disabled={!ready || busy}
                cassee={!!casses[a.url]} onError={() => setCasses((c) => ({ ...c, [a.url]: true }))}
                onPick={setImageUrl} />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, padding: '18px 8px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Glisse-dépose une image ici, ou génère d'abord une pub (Pubs IA) / ajoute une photo produit.</p>
        )}
      </DropZone>
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>ou coller un lien d'image</summary>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={!ready || busy} placeholder="https://…/mon-image.jpg" style={{ ...fld, marginTop: 8 }} />
      </details>
    </div>
  );

  return (
    <div>
      {/* Générateur */}
      <div style={{ ...surface, background: 'var(--surface)', padding: 22, marginBottom: 28 }}>
        {!ready && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(245,166,35,.4)', background: 'rgba(245,166,35,.10)', marginBottom: 18 }}>
            <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="lock" size={18} /></span>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
              <b style={{ color: 'var(--ink)' }}>Vidéo IA bientôt disponible.</b> La génération vidéo s'active dès que le
              moteur vidéo est branché côté serveur.
              En attendant, le <b>Studio IA</b> (scripts, hooks) et l'<b>assistant</b> fonctionnent déjà.
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {([['t2v', 'Texte → Vidéo'], ['i2v', 'Image → Vidéo']] as const).map(([k, label]) => (
            <button key={k} type="button" disabled={!ready} onClick={() => setMode(k)} aria-pressed={mode === k} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 13, fontWeight: mode === k ? 800 : 600, padding: '9px 15px', borderRadius: 12, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
              border: `1px solid ${mode === k ? 'transparent' : 'var(--line-2)'}`,
              background: mode === k ? 'var(--grad-accent)' : 'transparent', color: mode === k ? 'var(--on-accent)' : 'var(--ink-2)',
            }}>{label}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" disabled={!ready} onClick={() => setAssistantOuvert(true)} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 12.5, fontWeight: 800, padding: '9px 15px', borderRadius: 12, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : .55,
            border: '1px solid var(--accent-strong)', background: 'transparent', color: 'var(--accent-strong)',
          }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}><Icon name="sparkles" size={15} /> Assistant guidé</span></button>
        </div>

        {mode === 'i2v' && <div style={{ marginBottom: 12 }}>{departBlock}</div>}

        {/* Même barre que le studio Image · un studio qui se règle autrement
            qu'un autre oblige à réapprendre la même chose deux fois. */}
        <Composer
          value={prompt}
          onChange={(v) => { setPrompt(v); setSceneId(''); }}
          placeholder={mode === 't2v'
            ? 'Décris la scène que tu imagines · ex : gros plan sur une boisson posée sur un bureau, lumière du matin, léger travelling avant'
            : 'Décris le mouvement · facultatif · ex : léger zoom, la vapeur monte, ambiance chaleureuse'}
          disabled={!ready}
          busy={busy}
          // En animation d'image, la consigne est facultative · le moteur sait
          // animer sans elle, exiger un texte serait une contrainte inventée.
          requireText={mode === 't2v'}
          scenes={scenes}
          onPickScene={(s) => setSceneId(s.id)}
          advice={conseil(sceneId)}
          preflight={preflight}
          onSaveScene={enregistrer}
          controls={[
            {
              key: 'ratio', title: 'Format', icon: 'frame',
              options: RATIOS.map((r) => ({ value: r, label: r })),
              value: ratio, onChange: (v) => setRatio(v as Ratio),
            },
            {
              key: 'duree', title: 'Durée de la vidéo', icon: 'clock',
              options: VIDEO_DURATIONS.map((d) => ({ value: String(d), label: `${d} s` })),
              value: String(duree), onChange: (v) => setDuree(Number(v) as VideoDuration),
            },
            {
              key: 'mouvement', title: 'Type de mouvement', icon: 'film',
              options: [{ value: '', label: 'Libre' }, ...VIDEO_DIRECTIONS.map((d) => ({ value: d.key, label: d.label }))],
              value: direction, onChange: setDirection,
            },
          ]}
          extra={
            <button type="button" onClick={suggestMotion} disabled={!ready || !aiReady || suggesting} title={aiReady ? 'Propose un mouvement à partir de ta marque' : 'IA non configurée'} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, gap: 6, fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 999,
              cursor: ready && aiReady && !suggesting ? 'pointer' : 'default', whiteSpace: 'nowrap',
              border: '1px solid var(--line-2)', background: 'transparent', color: aiReady ? 'var(--accent-strong)' : 'var(--muted)', opacity: ready && aiReady ? 1 : .55,
            }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="sparkles" size={14} /> {suggesting ? 'Rédaction…' : `${mode === 't2v' ? 'Proposer une description' : 'Proposer un mouvement'} · ${costFor('suggest')} cr.`}</span></button>
          }
          cost={{ credits: 20 * (duree / 5), note: `20 crédits par tranche de 5 secondes · une vidéo de ${duree} s en coûte ${20 * (duree / 5)}. Le rendu prend une à trois minutes.` }}
          onGenerate={generate}
          generateLabel="Générer la vidéo"
          blocage={ready ? blocage : ''}
        />
        {sceneErreur && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{sceneErreur}</div>}
        {!ready && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>La vidéo IA s'active dès que le moteur vidéo est branché côté serveur.</p>}
        {error && <div role="alert" style={{ marginTop: 12, padding: '10px 13px', borderRadius: 12, fontSize: 13, border: '1px solid rgba(255,77,109,.4)', background: 'rgba(255,77,109,.10)', color: '#ff9db0' }}>{error}</div>}
      </div>

      {/* Galerie */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 ref={titreGalerieRef} tabIndex={-1} style={{ margin: 0, fontSize: 19, fontWeight: 500, color: 'var(--ink)', outline: 'none' }}>Tes vidéos {brandName ? <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 500 }}>· {brandName}</span> : null}</h2>
        {/* Lot 13 · compteur EXACT de toutes les générations, et des vidéos prêtes. */}
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{compteurGalerie({ generations: galerie.etat.generations, sorties: galerie.etat.sorties, genre: 'video' })}</span>
      </div>

      {galerie.etat.generations === 0 && videos.length === 0 ? (
        <Empty
          tone="wait" title="Aucune vidéo pour l’instant."
          why="Génère la première ci-dessus · les vidéos produites s’empilent ici."
        />
      ) : (
        <>{/* 224 px · la barre d’actions doit loger 4 cases de 44 px + 3 écarts (194 px) DANS la carte (marges et bord déduits), avec de la marge. */}
        <div ref={grilleRef} aria-busy={galerie.chargement} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(224px, 1fr))', gap: 14, opacity: galerie.chargement ? 0.6 : 1 }}>
          {videos.map((v) => {
            const st = STATUS_LABEL[v.status] ?? STATUS_LABEL.processing!;
            const pending = v.status === 'processing' || v.status === 'queued';
            return (
              <div key={v.id} style={{ ...surface, background: 'var(--surface)', overflow: 'hidden' }}>
                <div style={{ aspectRatio: '9 / 16', background: '#120c15', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {v.status === 'completed' && v.videoUrl
                    ? <video src={v.videoUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : v.status === 'failed'
                      ? <span style={{ display: 'inline-flex', color: '#ffb3c0' }}><Icon name="alert" size={24} /></span>
                      : <span style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--line-2)', borderTopColor: 'var(--accent-strong)', animation: 'ttspin 1s linear infinite' }} />}
                  <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 999, color: st.color, background: 'rgba(0,0,0,.55)' }}>{st.label}</span>
                  <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 999, color: 'var(--ink-2)', background: 'rgba(0,0,0,.5)' }}>{v.mode === 'i2v' ? 'IMG' : 'TXT'}</span>
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.prompt}</p>
                  {v.status === 'failed' && v.error && <p style={{ margin: '6px 0 0', fontSize: 11, color: '#ff9db0', lineHeight: 1.4 }}>{v.error}</p>}
                  <div style={{ marginTop: 8 }}>
                    {v.status === 'completed' && v.videoUrl ? (
                      <>
                        <CreativeActions genId={v.id} rating={v.rating} downloadUrl={v.videoUrl} onArchive={() => removeVideo(v.id)} archiveLabel="Supprimer" trackable={adsmap} />
                        {v.prompt && (
                          <button type="button" onClick={() => { setPrompt(v.prompt); window.scrollTo({ top: 0, behavior: 'smooth' }); }} title="Repartir de ce brief pour une nouvelle vidéo" style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, marginTop: 6, width: '100%', padding: '6px 10px', borderRadius: 9, fontSize: 11.5, fontWeight: 700,
                            border: '1px solid rgba(254,44,85,.3)', background: 'transparent', color: 'var(--accent-strong)', cursor: 'pointer',
                          }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="sparkles" size={14} /> Reprendre ce brief</span></button>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        {pending && v.jobId && <button type="button" onClick={() => recheck(v)} style={{ minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Vérifier</button>}
                        {v.status === 'failed' && v.prompt && (
                          <button type="button" onClick={() => { setPrompt(v.prompt); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-strong)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Reprendre ce brief</button>
                        )}
                        <span style={{ flex: 1 }} />
                        <button type="button" onClick={() => removeVideo(v.id)} title="Supprimer" style={{ minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Supprimer ✕</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Pager page={galerie.etat.page} total={galerie.etat.generations} onPage={(p) => { void galerie.aller(p); }} /></>
      )}
      <AssistantVideo
        ouvert={assistantOuvert}
        onFermer={() => setAssistantOuvert(false)}
        etat={etatVideo}
        aiReady={aiReady}
        suggesting={suggesting}
        onMode={setMode}
        slotDepart={departBlock}
        onDescription={(v) => { setPrompt(v); setSceneId(''); }}
        onSuggest={suggestMotion}
        directions={VIDEO_DIRECTIONS.map((d) => ({ key: d.key, label: d.label, hint: d.hint }))}
        directionValue={direction}
        onDirection={setDirection}
        onRatio={(r) => setRatio(r as Ratio)}
        onDuree={(d) => setDuree(d as VideoDuration)}
        ratios={RATIOS}
        durees={VIDEO_DURATIONS as unknown as number[]}
        coutParVideo={20 * (duree / 5)}
        busy={busy}
        onGenerer={() => { setAssistantOuvert(false); void generate(); }}
      />

      <style>{'@keyframes ttspin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}

const lbl = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 } as const;
