'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ajouterRegleMarque, lireReglesMarque, reglesParType, retirerRegleMarque, TYPES_REGLE_MARQUE, type TypeRegleMarque } from '@tiktrends/core';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';

/**
 * Le formulaire « Ajouter une règle » et la liste des règles actives · lues et
 * écrites dans `brands.creative_rules` (le texte que Jarvis reçoit) par
 * `saveJarvisRulesAction`. Une règle n'apparaît ajoutée ou retirée qu'une fois
 * l'enregistrement revenu sans erreur.
 */
export function ReglesMarque({ texte, enregistrer, raison, jarvis, sources }: {
  texte: string;
  enregistrer: ((i: { creativeRules: string }) => Promise<{ ok?: true; error?: string }>) | null;
  /** Pourquoi l'écriture est fermée (autre marque active, rôle, formule). */
  raison: string | null;
  jarvis: string | null;
  sources: { lignes: ReadonlyArray<{ libelle: string; branchee: boolean }>; manquantes: string | null };
}) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [type, setType] = useState<TypeRegleMarque>('ban');
  const [actuel, setActuel] = useState(texte);
  const [encours, demarrer] = useTransition();
  const champ = useRef<HTMLInputElement>(null);
  const T = TYPES_REGLE_MARQUE.find((x) => x.type === type)!;
  const groupes = reglesParType(lireReglesMarque(actuel));

  const ecrire = (suivant: string, message: string) => {
    if (!enregistrer) return;
    demarrer(async () => {
      const r = await enregistrer({ creativeRules: suivant }).catch(() => ({ error: 'L’enregistrement a échoué. Réessaie.' }));
      if (r.error) { toast(r.error); return; }
      setActuel(suivant);
      toast(message);
      router.refresh();
    });
  };
  const ajouter = (e: FormEvent) => {
    e.preventDefault();
    const v = champ.current?.value ?? '';
    if (!v.trim()) { champ.current?.focus(); return; }
    const suivant = ajouterRegleMarque(actuel, type, v);
    if (suivant === null) { toast('Les règles dépassent la longueur maximale · retires-en une avant d’ajouter.'); return; }
    ecrire(suivant, `${T.libelle} ajouté · Jarvis l’applique dès la prochaine génération`);
    if (champ.current) champ.current.value = '';
  };

  return (
    <>
      <form className="tile" id="rform" autoComplete="off" onSubmit={ajouter} style={{ display: 'grid', gap: 12, marginBottom: 16, borderColor: 'color-mix(in srgb,var(--acc) 45%,transparent)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, flex: 1, minWidth: 200 }}>Ajouter une règle</h2>
          {jarvis
            ? <Lien className="btn sm" href={jarvis}><Ic n="spark" />Jarvis propose</Lien>
            : <button className="btn sm" type="button" disabled title="Jarvis n’est pas ouvert à ton rôle ou à ta formule"><Ic n="spark" />Jarvis propose</button>}
        </div>
        <div className="seg" role="group" aria-label="Type de règle" style={{ flexWrap: 'wrap', justifySelf: 'start', maxWidth: '100%' }}>
          {TYPES_REGLE_MARQUE.map((x) => (
            <button key={x.type} type="button" aria-pressed={x.type === type} onClick={() => { setType(x.type); champ.current?.focus(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}><Ic n={x.icone} />{x.libelle}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={champ} id="rin" placeholder={T.exemple} disabled={!enregistrer || encours} title={!enregistrer ? raison ?? undefined : undefined} style={{ flex: '1 1 260px', minWidth: 0, boxSizing: 'border-box', padding: '12px 16px', borderRadius: 16, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 14px var(--sf)', outline: 0 }} />
          <button className="btn pri" type="submit" disabled={!enregistrer || encours} title={!enregistrer ? raison ?? undefined : undefined}><Ic n="plus" />Ajouter</button>
        </div>
        <small className="faint" style={{ fontSize: '11.5px' }}>{enregistrer ? `${T.consigne} · s’applique dès la prochaine génération.` : raison}</small>
      </form>
      <div className="grid2">
        <section className="tile" style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <h2 style={{ margin: 0 }}>Règles actives</h2>
          {TYPES_REGLE_MARQUE.map((x) => {
            const R = groupes[x.type];
            return (
              <div key={x.type} style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}><h3 style={{ margin: 0 }}>{x.libelle}{R.length > 1 ? 's' : ''}</h3><span className="faint" style={{ fontSize: '11.5px' }}>{x.consigne}</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {R.length === 0 && <span className="faint" style={{ fontSize: '12.5px' }}>Aucune règle</span>}
                  {R.map((r) => (
                    <span key={r.ligne} className={`pill ${x.classe}`.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'normal' }}>
                      {r.texte}
                      <button type="button" aria-label="Retirer cette règle" disabled={!enregistrer || encours} title={!enregistrer ? raison ?? undefined : undefined}
                        onClick={() => ecrire(retirerRegleMarque(actuel, r.ligne), `Règle retirée · ${r.texte}`)}
                        style={{ all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center', opacity: 0.7 } as React.CSSProperties}><Ic n="x" /></button>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
        <section className="tile">
          <div className="sech" style={{ margin: '0 0 10px' }}><h2>Sources de Jarvis</h2>{sources.manquantes && <span className="pill w" style={{ marginLeft: 'auto' }}>{sources.manquantes}</span>}</div>
          <div className="tl">
            {sources.lignes.map((s) => (
              <div className="ev" key={s.libelle}><span className="ico"><Ic n={s.branchee ? 'check' : 'warn'} /></span><span>{s.libelle}</span><span className={`pill ${s.branchee ? 'g' : 'w'}`}>{s.branchee ? 'Branchée' : 'Manquante'}</span></div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
