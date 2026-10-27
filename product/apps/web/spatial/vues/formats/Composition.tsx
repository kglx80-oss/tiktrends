import type { CSSProperties, ReactNode } from 'react';
import type { CleStyle } from '@tiktrends/core';

/**
 * La miniature d'un style (`div.comp` de la maquette, fonction `compS`) ·
 * balisage reproduit À L'IDENTIQUE, style par style · le CSS de la maquette
 * (`.comp .split`, `.comp .chat`…) dessine le gabarit.
 *
 * C'est une ILLUSTRATION du format, pas une annonce · l'image est celle de la
 * marque active (produit, sinon logo), le nom est celui de la marque active, et
 * les textes sont des emplacements neutres (« Ton accroche »…). Aucun chiffre,
 * aucun avis, aucun prénom de la maquette n'est repris · ils étaient fictifs.
 */

/** Un pixel transparent · la miniature garde son balisage sans image cassée quand la marque n'en a pas. */
export const IMAGE_VIDE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/** L'emplacement d'accroche de chaque style · neutre, il dit ce qui va là. */
const ACCROCHE: Record<CleStyle, string> = {
  avap: 'Le résultat, en une phrase', vs: 'Pourquoi nous ?', avis: '« L’avis de ton client, mot pour mot »', callout: 'Ta promesse en une ligne',
  probsol: 'Le problème, en question ?', promo: 'Ton offre du moment', chat: 'Ton accroche, comme un vrai message', mag: 'Un titre éditorial, sans citer la marque',
  ugc: 'POV : ton accroche', packshot: 'Ton produit · ton prix', liste: '3 conseils, ton sujet', demo: 'Le résultat en une ligne',
  benef: 'Ta promesse', logo: 'Ta signature', question: 'Ta grande question ?', collage: 'Ta gamme, en une phrase',
  flatlay: 'Ton univers', story: 'Ton texte de story', notes: 'Le titre de ta note', tweet: 'Un avis spontané, écrit comme un vrai post',
  meme: 'Moi quand…', minimal: 'Trois mots.', presse: 'L’extrait du média', chiffre: 'Ce que mesure ton chiffre',
  social: 'Le nombre de tes clients', texte: 'Ton titre choc.', lifestyle: 'Une phrase courte', trendy: 'Ton accroche',
};

export interface PropsComposition {
  cle: CleStyle;
  /** L'image de la marque active · `null` → pixel transparent. */
  image: string | null;
  /** Le nom de la marque active · `null` → « Ta marque ». */
  marque: string | null;
  /** Remplace l'emplacement d'accroche. */
  texte?: string;
}

interface Img { pos?: string; scale?: number; filter?: string }

export function Composition({ cle, image, marque, texte }: PropsComposition) {
  const src = image || IMAGE_VIDE;
  const nom = marque?.trim() || 'Ta marque';
  const bas = nom.toLowerCase();
  const img = (x: Img = {}) => {
    const st: CSSProperties = {};
    if (x.pos) st.objectPosition = x.pos;
    if (x.scale) st.transform = `scale(${x.scale})`;
    if (x.filter) st.filter = x.filter;
    return <img src={src} alt="" style={st} />;
  };
  const T = <span className="band">{texte ?? ACCROCHE[cle]}</span>;
  let c: ReactNode;
  switch (cle) {
    case 'avap': c = <><div className="split"><div>{img()}</div><div>{img()}</div></div><span className="lab" style={{ left: '6%' }}>AVANT</span><span className="lab" style={{ right: '6%', background: '#7ef0b0' }}>APRÈS</span><div className="cap">{T}</div></>; break;
    case 'vs': c = <div className="vs2"><div className="vt">{T}</div><div className="vc"><div><b>{nom}</b>✓ Atout 1<br />✓ Atout 2<br />✓ Atout 3</div><div><b style={{ color: '#888' }}>Les autres</b>✗ Défaut 1<br />✗ Défaut 2<br />✗ Défaut 3</div></div></div>; break;
    case 'avis': c = <>{img()}<div className="cap"><span className="stars">★★★★★</span>{T}<br /><small style={{ opacity: 0.6 }}>Prénom, client</small></div></>; break;
    case 'callout': c = <>{img()}<span className="callout" style={{ left: '6%', top: '10%' }}>Atout 1</span><span className="callout" style={{ right: '6%', top: '30%' }}>Atout 2</span><span className="callout" style={{ left: '8%', top: '52%' }}>Atout 3</span><div className="bandbot">{T}</div></>; break;
    case 'probsol': c = <>{img()}<div className="bandtop">{T}</div><div className="bandbot">{nom}, la solution.</div></>; break;
    case 'promo': c = <>{img()}<div className="promo">Offre<small>ta condition</small></div><div className="cap" style={{ textAlign: 'center' }}>{T}</div></>; break;
    case 'chat': c = <>{img({ filter: 'blur(3px) brightness(.9)' })}<div className="chat"><span className="in">{T}</span><span className="out">Ton produit ?</span><span className="in">La réponse qui le nomme</span></div></>; break;
    case 'mag': c = <>{img()}<div className="mag"><small>LE MAGAZINE</small><div>{T}</div></div></>; break;
    case 'ugc': c = <>{img({ scale: 1.25, pos: '50% 45%' })}<div className="ugct">{T}</div><span className="handle">@createur</span></>; break;
    case 'packshot': c = <><div className="pk">{img({ scale: 1.5, pos: '50% 50%' })}</div><div className="bandbot" style={{ background: '#fff' }}>{T}</div></>; break;
    case 'liste': c = <>{img({ filter: 'blur(4px) brightness(.95)' })}<div className="lst">{T}<span>1 · Premier conseil</span><span>2 · Deuxième conseil</span><span>3 · Le conseil qui mène au produit</span></div></>; break;
    case 'demo': c = <><div className="tri">{([['30% 50%', 1.8], ['50% 50%', 1.8], ['70% 50%', 1.8]] as const).map(([p, s], i) => <div key={i}>{img({ pos: p, scale: s })}<b>{i + 1}</b></div>)}</div><div className="bandbot">{T}</div></>; break;
    case 'benef': c = <div className="bn"><div className="bnv">{img({ scale: 1.35, pos: '45% 55%' })}</div><div className="bnt">{T}<span><i>✓</i>Bénéfice 1</span><span><i>✓</i>Bénéfice 2</span><span><i>✓</i>Bénéfice 3</span></div></div>; break;
    case 'logo': c = <><div className="lg"><b>{bas}</b>{T}</div><div className="lgv">{img({ scale: 1.2 })}</div></>; break;
    case 'question': c = <><div className="qq">{T}</div><div className="qv">{img({ scale: 1.45 })}</div></>; break;
    case 'collage': c = <><div className="cg">{([['30% 40%', 1.6, ''], ['70% 60%', 1.8, 'saturate(1.3)'], ['50% 70%', 1.3, 'hue-rotate(160deg)'], ['40% 50%', 2, 'hue-rotate(300deg)']] as const).map(([p, s, f], i) => <div key={i}>{img({ pos: p, scale: s, filter: f })}</div>)}</div><div className="cgt">{T}</div></>; break;
    case 'flatlay': c = <><span className="fl1" /><span className="fl2" /><span className="fl3" /><div className="flv">{img({ scale: 1.5 })}</div><div className="flt">{T}</div></>; break;
    case 'story': c = <>{img({ scale: 1.15 })}<div className="sb"><i className="on" /><i /><i /></div><div className="sh"><span className="sa">{bas.charAt(0) || 'm'}</span>{bas}<small>maintenant</small></div><div className="stk">{T}</div><div className="spoll"><b>Ta question sondage ?</b><span>Oui</span><span>Pas encore</span></div></>; break;
    case 'notes': c = <div className="nt"><div className="nth"><span>‹ Notes</span><span>•••</span></div><small>Aujourd’hui</small>{T}<span>☑ Premier point</span><span>☑ Deuxième point</span><span>☐ Ton produit, en dernier</span><div className="ntv">{img({ scale: 1.4 })}</div></div>; break;
    case 'tweet': c = <div className="tw"><div className="twh"><span className="twa">P</span><span><b>Prénom</b><small>@pseudo · maintenant</small></span></div><div className="twt">{T}</div><div className="twv">{img({ scale: 1.3 })}</div><div className="twf"><span>Réponses</span><span>Partages</span><span>J’aime</span></div></div>; break;
    case 'meme': c = <><div className="mm">{T}</div><div className="mmv">{img({ scale: 1.25 })}<b className="mmb">ENFIN.</b></div></>; break;
    case 'minimal': c = <><div className="mnv">{img({ scale: 1.6 })}</div><div className="mnt">{T}</div><small className="mnb">{bas}</small></>; break;
    case 'presse': c = <><div className="pr"><span className="prq">“</span>{T}<small>Le média</small></div><div className="prv">{img({ scale: 1.3 })}</div><div className="prl"><span>VU DANS</span><b>Média 1</b><b>Média 2</b><b>Média 3</b></div></>; break;
    case 'chiffre': c = <><div className="ch"><b>Ton<small> chiffre</small></b>{T}<span className="stars">★★★★★</span></div><div className="chv">{img({ scale: 1.3 })}</div></>; break;
    case 'social': c = <>{img({ scale: 1.1, pos: '50% 40%' })}<div className="sp"><div className="spa">{['#ff8fab', '#7cc6dd', '#ffd76a', '#7ef0b0'].map((b) => <i key={b} style={{ background: b }} />)}<span>Tes clients</span></div>{T}<span className="stars">★★★★★ <small>ta note · tes avis</small></span></div></>; break;
    case 'texte': c = <><div className="tx">{T}<p>Deux lignes qui racontent, sans lister.</p></div><div className="txv">{img({ scale: 1.5 })}</div></>; break;
    case 'lifestyle': c = <>{img({ scale: 1.05, filter: 'saturate(1.15) sepia(.12)' })}<div className="ls">{T}<small>{bas}</small></div></>; break;
    case 'trendy': c = <><div className="tdv">{img({ scale: 1.3 })}</div><div className="td">{T}</div><span className="tds" style={{ left: '6%', top: '6%' }}>✦ new</span><span className="tds" style={{ right: '6%', top: '42%', transform: 'rotate(10deg)' }}>Sticker</span></>; break;
  }
  return <div className="comp">{c}</div>;
}
