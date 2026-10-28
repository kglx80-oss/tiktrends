'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSpatial } from '../../coquille/contexte';
import { Ic } from '../../communs';
import { avatarToDataUri } from '../../../lib/avatar';

/**
 * « Mon profil » · l'identité, INTERACTIVE · photo (recadrée dans le
 * navigateur, `avatarToDataUri`), nom, confidentialité. L'enregistrement passe
 * par l'action serveur EXISTANTE `saveProfileAction` (mêmes champs que l'écran
 * V5 · `name`, `avatarUrl`, `hidePersonalInfo`), passée en props · la réussite
 * ne s'annonce qu'au retour sans erreur. Un module client n'exporte que des
 * composants et des types (garde `spatial-fondation`).
 */

export type EnregistrerProfil = (prev: { ok?: boolean; error?: string } | null, fd: FormData) => Promise<{ ok?: boolean; error?: string }>;

export interface IdentiteInitiale { nom: string; email: string; avatar: string; masquer: boolean }

export function IdentiteProfil({ init, enregistrer }: { init: IdentiteInitiale; enregistrer: EnregistrerProfil | null }) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [nom, setNom] = useState(init.nom);
  const [avatar, setAvatar] = useState(init.avatar);
  const [masquer, setMasquer] = useState(init.masquer);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState('');
  const [encours, demarrer] = useTransition();
  const fichier = useRef<HTMLInputElement>(null);
  const initiale = (init.nom || init.email).slice(0, 1).toUpperCase();

  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErreur('');
    if (!/^image\//.test(f.type)) { setErreur('Choisis un fichier image (jpg, png, webp).'); return; }
    setLecture(true);
    try { setAvatar(await avatarToDataUri(f)); }
    catch { setErreur('Impossible de lire cette image.'); }
    finally { setLecture(false); if (fichier.current) fichier.current.value = ''; }
  }

  return (
    <form style={{ display: 'grid', gap: 14 }} onSubmit={(e) => {
      e.preventDefault();
      if (!enregistrer || encours) return;
      const fd = new FormData();
      fd.set('name', nom.trim());
      fd.set('avatarUrl', avatar);
      if (masquer) fd.set('hidePersonalInfo', 'on');
      demarrer(async () => {
        const r = await enregistrer(null, fd).catch(() => ({ error: 'L’action a échoué. Réessaie.' }));
        if (r.error) { toast(r.error); return; }
        toast('Profil mis à jour.');
        router.refresh();
      });
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span className="me" data-avatar style={{ width: 66, height: 66, overflow: 'hidden', fontSize: 24 }}>
          {avatar.trim() ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initiale}
        </span>
        <div style={{ display: 'grid', gap: 6, flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input ref={fichier} type="file" accept="image/*" onChange={choisir} style={{ display: 'none' }} aria-label="Photo de profil" />
            <button className="btn sm" type="button" onClick={() => fichier.current?.click()} disabled={lecture}><Ic n="img" />{lecture ? 'Traitement…' : 'Téléverser une photo'}</button>
            {avatar.trim() && <button className="btn sm" type="button" onClick={() => setAvatar('')}>Retirer</button>}
          </div>
          {erreur && <small role="alert" style={{ color: 'var(--bad)', fontSize: 12 }}>{erreur}</small>}
          <small className="faint" style={{ fontSize: 11.5 }}>JPG, PNG ou WebP · recadrée en carré et optimisée automatiquement.</small>
        </div>
      </div>
      <div className="fields" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))' }}>
        <label className="field">Nom complet<input name="name" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ton nom" /></label>
        <label className="field">E-mail · identifiant de connexion<input value={init.email} disabled readOnly /></label>
      </div>
      <div className="npr" data-geste="masquer">
        <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}><strong>Masquer les informations personnelles</strong><small>Cache ton nom et ton e-mail dans les vues partagées (captures, démos).</small></div>
        <button className="sw2" type="button" role="switch" aria-checked={masquer} aria-label="Masquer les informations personnelles" onClick={() => setMasquer((v) => !v)} />
      </div>
      <div>
        <button className="btn pri" type="submit" disabled={!enregistrer || encours || lecture}>{encours ? 'Enregistrement…' : 'Enregistrer le profil'}</button>
      </div>
    </form>
  );
}
