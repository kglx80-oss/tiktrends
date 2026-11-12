'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { TEXTES_HORS_LIGNE, TEXTES_MES_MENTIONS, type LigneMention, type VueMesMentions } from '@tiktrends/core';
import { markNotificationRead } from '../../../app/actions/notifications';
import { lireMesMentionsAction } from '../../../app/actions/mes-mentions';
import { useSpatial } from '../../coquille/contexte';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { CIBLE, Message, RaisonFermee } from '../projet/briques';
import { boutonAction, replacerFocus, type OptionsBoutonAction } from '../projet/action-serveur';
import { useHorsLigne } from '../projet/hors-ligne';

/**
 * « Mes mentions » (`/studio/mentions`) · les commentaires et les notes de la
 * lignée où l'on mentionne la personne · la vue de `lireMesMentions` (règles
 * au noyau, `C/studios/activite/mes-mentions.ts`).
 *
 *  · chaque ligne · le genre, quand, qui, le projet, l'extrait BORNÉ du fil
 *    (texte, les mentions sous le nom courant · jamais du HTML), son état
 *    (ouvert / résolu, et qui l'a résolu) et le lien direct vers le fil
 *    (l'ancre du commentaire, ou la note sur son nœud) · un fil hors de la
 *    portée · « Fil hors de ta portée », rien de lui, le lien fermé avec sa
 *    raison écrite à côté ;
 *  · filtres et pages · des LIENS (l'adresse garde l'état, rien n'est écrit) ;
 *  · « Marquer comme lue » · l'action EXISTANTE des notifications
 *    (`markNotificationRead`) par la brique (`boutonAction`), puis la page
 *    RELUE (`lireMesMentionsAction`) · le focus replacé dans un EFFET sur la
 *    vue rendue (modèle #1065), jamais sur `<body>`.
 *
 * Aucune touche lue · tout passe par des liens et des boutons natifs. Gratuit.
 */

/** La brique, avec la cible tactile de 44 px gardée même fermée. */
const actionCible = (o: OptionsBoutonAction) => { const a = boutonAction(o); return { ...a, style: { ...CIBLE, ...a.style } }; };
const LIEN_CIBLE = { ...CIBLE, display: 'inline-flex', alignItems: 'center' } as const;

export function MesMentions({ initiale }: { initiale: VueMesMentions }) {
  const id = useId();
  const { toast } = useSpatial();
  const horsLigne = useHorsLigne();
  const [vue, setVue] = useState<VueMesMentions>(initiale);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<{ texte: string; horsLigne?: boolean } | null>(null);
  // Le focus à replacer quand la vue relue sera RENDUE · l'effet le rejoue après le rendu de la vue.
  const focusApresVue = useRef<string[] | null>(null);
  useEffect(() => {
    const cibles = focusApresVue.current;
    if (!cibles) return;
    focusApresVue.current = null;
    replacerFocus('toujours', ...cibles);
  }, [vue]);

  function marquer(l: LigneMention, i: number) {
    if (enCours || horsLigne) return;
    setEnCours(l.id); setErreur(null);
    void (async () => {
      try {
        await markNotificationRead(l.id);
        const r = await lireMesMentionsAction(vue.filtres);
        if (!r.ok) { setErreur({ texte: r.message }); return; }
        // La ligne relue (« Lue »), sinon la suivante, sinon le titre de la liste.
        const suivante = vue.lignes[i + 1]?.id;
        focusApresVue.current = [
          `[data-mention="${l.id}"] [data-ouvrir-fil]`, `[data-mention="${l.id}"] [data-etat-lecture]`,
          ...(suivante ? [`[data-mention="${suivante}"] [data-geste="marquer-mention"]`] : []), '[data-titre-mentions]',
        ];
        setVue(r.vue);
        toast(TEXTES_MES_MENTIONS.marquee);
      } catch {
        setErreur({ texte: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie.', horsLigne: true });
      } finally { setEnCours(null); }
    })();
  }

  return (
    <Vue>
      <EnTete titre={TEXTES_MES_MENTIONS.titre} sous={TEXTES_MES_MENTIONS.sous} />
      <section className="tile" aria-labelledby={`${id}-titre`} data-mes-mentions="">
        <div className="sech" style={{ margin: 0 }}>
          <h2 id={`${id}-titre`} tabIndex={-1} data-titre-mentions="">Mentions · {vue.total}</h2>
          <span className="faint" style={{ fontSize: '12.5px' }}>{TEXTES_MES_MENTIONS.explication}</span>
          {horsLigne && <span className="pill w" data-hors-ligne="">{TEXTES_HORS_LIGNE.pastille}</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <nav className="seg" aria-label="Filtrer par lecture" data-filtres-lecture="">
            {vue.lecture.map((f) => <Lien key={f.cle} href={f.href} data-lecture={f.cle} aria-current={f.actif ? 'page' : undefined} style={LIEN_CIBLE}>{f.libelle}</Lien>)}
          </nav>
          <nav className="seg" aria-label="Filtrer par fil" data-filtres-type="">
            {vue.types.map((f) => <Lien key={f.cle} href={f.href} data-type-mention={f.cle} aria-current={f.actif ? 'page' : undefined} style={LIEN_CIBLE}>{f.libelle}</Lien>)}
          </nav>
        </div>
        {vue.tronque && <p className="faint" data-mentions-tronque="" style={{ fontSize: '11.5px', marginTop: 8 }}>{vue.tronque}</p>}
        {erreur && <Message ton="err" horsLigne={erreur.horsLigne}>{erreur.texte}</Message>}
        {vue.vide
          ? <p className="muted" data-mentions-vide="" style={{ fontSize: '12.5px', marginTop: 10 }}>{vue.vide}</p>
          : (
            <ul className="tl" data-liste-mentions="" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {vue.lignes.map((l, i) => <Ligne key={l.id} l={l} enCours={enCours} horsLigne={horsLigne} marquer={() => marquer(l, i)} />)}
            </ul>
          )}
        {vue.pages > 1 && (
          <div className="kc" data-pages-mentions="" style={{ marginTop: 10, alignItems: 'center' }}>
            {vue.precedente
              ? <Lien className="btn sm" href={vue.precedente} data-page="precedente" style={LIEN_CIBLE}><Ic n="back" />{TEXTES_MES_MENTIONS.precedente}</Lien>
              : <button className="btn sm" type="button" data-page="precedente" aria-describedby={`${id}-premiere`} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}><Ic n="back" />{TEXTES_MES_MENTIONS.precedente}</button>}
            <span className="faint" data-page-courante="" style={{ fontSize: '12px' }}>Page {vue.page} sur {vue.pages}</span>
            {vue.suivante
              ? <Lien className="btn sm" href={vue.suivante} data-page="suivante" style={LIEN_CIBLE}>{TEXTES_MES_MENTIONS.suivante}<Ic n="arrow" /></Lien>
              : <button className="btn sm" type="button" data-page="suivante" aria-describedby={`${id}-derniere`} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}>{TEXTES_MES_MENTIONS.suivante}<Ic n="arrow" /></button>}
            {!vue.precedente && <RaisonFermee id={`${id}-premiere`} cle="mentions-premiere">{TEXTES_MES_MENTIONS.premiere}</RaisonFermee>}
            {!vue.suivante && <RaisonFermee id={`${id}-derniere`} cle="mentions-derniere">{TEXTES_MES_MENTIONS.derniere}</RaisonFermee>}
          </div>
        )}
      </section>
    </Vue>
  );
}

function Ligne({ l, enCours, horsLigne, marquer }: { l: LigneMention; enCours: string | null; horsLigne: boolean; marquer: () => void }) {
  const id = useId();
  const f = l.fil;
  return (
    <li className="ev" data-mention={l.id} data-genre={l.genre} data-lue={l.lue ? 'oui' : 'non'} data-portee={f ? 'dans' : 'hors'} style={{ fontSize: '12px' }}>
      <span className="ico"><Ic n={l.genre === 'note' ? 'bookmark' : 'chat'} /></span>
      <span>
        <small className="faint" data-entete-mention="" style={{ display: 'block', fontSize: '11.5px' }}>
          {l.libelle} · {l.quand}{f ? ` · ${f.auteur} · projet « ${f.projet} »` : ''}
        </small>
        {f ? (
          <span data-extrait-mention="" style={{ display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '12.5px', marginTop: 2 }}>
            {f.extrait.map((s, i) => (s.type === 'texte'
              ? <span key={i}>{s.texte}</span>
              : <b key={i} data-mention-nom={s.ancien ? 'ancien' : s.id} style={{ fontWeight: 600 }}>{s.nom}</b>))}
          </span>
        ) : <span className="muted" data-hors-portee="" style={{ display: 'block', fontSize: '12.5px', marginTop: 2 }}>{l.horsPortee}</span>}
        {f && <small className="faint" data-etat-fil={f.etat} style={{ display: 'block', fontSize: '11.5px' }}>{f.phraseEtat ?? `Fil ${f.libelleEtat.toLowerCase()}`}</small>}
        <span className="kc" style={{ marginTop: 6, alignItems: 'center' }}>
          {f
            ? <Lien className="btn sm" href={f.href} data-ouvrir-fil="" style={LIEN_CIBLE} aria-label={`${TEXTES_MES_MENTIONS.ouvrir} · ${l.libelle.toLowerCase()} de ${f.auteur}, ${l.quand}`}><Ic n="arrow" />{TEXTES_MES_MENTIONS.ouvrir}</Lien>
            : (
              <>
                <button className="btn sm" type="button" data-ouvrir-fil="" aria-describedby={`${id}-hors`} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}><Ic n="arrow" />{TEXTES_MES_MENTIONS.ouvrir}</button>
                <RaisonFermee id={`${id}-hors`} cle="fil-hors-portee">{TEXTES_MES_MENTIONS.raisonHorsPortee}</RaisonFermee>
              </>
            )}
          {l.lue
            ? <span className="faint" data-etat-lecture="lue" tabIndex={-1} style={{ fontSize: '11.5px' }}>{TEXTES_MES_MENTIONS.lue}</span>
            : (
              <button className="btn sm" type="button" data-geste="marquer-mention" aria-label={`${TEXTES_MES_MENTIONS.marquer} · ${l.libelle.toLowerCase()}, ${l.quand}`}
                title={horsLigne ? TEXTES_HORS_LIGNE.bouton : undefined}
                {...actionCible({ presse: enCours === l.id, occupe: !!enCours, ferme: horsLigne, focalisable: 'tout', surClic: marquer })}><Ic n="check" />{enCours === l.id ? TEXTES_MES_MENTIONS.enCours : TEXTES_MES_MENTIONS.marquer}</button>
            )}
        </span>
      </span>
      <span className="kc" style={{ alignItems: 'start', gap: 4 }}>
        {f && <span className={`pill ${f.etat === 'resolu' ? 'g' : 'c'}`} data-pastille-etat="">{f.libelleEtat}</span>}
        {!l.lue && <span className="pill w" data-pastille-lecture="">{TEXTES_MES_MENTIONS.nonLue}</span>}
      </span>
    </li>
  );
}
