'use client';

import { useCallback, useEffect, useState, useTransition, type CSSProperties } from 'react';
import {
  listPresetsAction, savePresetAction, archivePresetAction,
  type PresetsView, type PresetRow,
} from '../../../actions/presets';

/**
 * Tes prompts.
 *
 * ── Ce que l'écran met en avant ──────────────────────────────────────────────
 *
 * Pas le prompt · **ce qu'il a donné**. Un générateur d'images te montre des
 * styles ; ici chaque prompt porte son bilan, parce que c'est la seule chose
 * qu'un générateur ne saura jamais dire : « ton univers sombre, 3 gagnantes sur
 * 9 tests tranchés ».
 *
 * C'est ce qui transforme un goût en hypothèse, et une hypothèse se compare.
 *
 * ── Pourquoi les univers fournis restent visibles ────────────────────────────
 *
 * Les huit univers d'origine ne disparaissent pas · ils servent de point de
 * départ, et on peut en copier un pour le modifier. Partir d'une page blanche
 * pour écrire un prompt de direction artistique est décourageant · partir d'un
 * exemple qui marche ne l'est pas.
 */

const carte: CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px',
  background: 'var(--surface)', display: 'grid', gap: 8,
};

const champ: CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line-2)',
  background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit',
};

interface Brouillon { id?: string; name: string; prompt: string; negative: string; scope: 'brand' | 'workspace' }

const VIDE: Brouillon = { name: '', prompt: '', negative: '', scope: 'brand' };

export function Prompts() {
  const [view, setView] = useState<PresetsView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [busy, lance] = useTransition();

  const charger = useCallback(async () => {
    const r = await listPresetsAction();
    if (r.error) setErr(r.error); else { setErr(null); setView(r.view ?? null); }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const enregistrer = () => {
    if (!brouillon) return;
    lance(async () => {
      const r = await savePresetAction({
        id: brouillon.id, name: brouillon.name, prompt: brouillon.prompt,
        negative: brouillon.negative || null, scope: brouillon.scope, kind: 'both',
      });
      if (r.error) { setMsg(r.error); return; }
      setMsg(brouillon.id ? 'Prompt mis à jour.' : 'Prompt enregistré · il apparaît maintenant dans le Studio.');
      setBrouillon(null);
      await charger();
    });
  };

  const archiver = (p: PresetRow) => lance(async () => {
    if (!confirm(`Archiver « ${p.name} » ? Les créas déjà produites gardent leur rattachement.`)) return;
    const r = await archivePresetAction(p.id);
    if (r.error) { setMsg(r.error); return; }
    setMsg('Prompt archivé.');
    await charger();
  });

  if (err) return <div style={{ ...carte, borderColor: '#ff8095', color: '#ff8095', fontSize: 13 }}>{err}</div>;
  if (!view) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</div>;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', flex: '1 1 320px', lineHeight: 1.6 }}>
          {view.mine.length === 0
            ? 'Aucun prompt maison pour l’instant · le Studio n’utilise donc que les univers fournis.'
            : `${view.mine.length} prompt(s) maison · disponibles dans le Studio Pubs.`}
        </p>
        {!brouillon && (
          <button onClick={() => setBrouillon(VIDE)} style={{
            padding: '9px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
            color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
          }}>
            Écrire un prompt
          </button>
        )}
      </div>

      {msg && <p style={{ margin: 0, fontSize: 12.5, color: msg.includes('·') || msg.includes('archivé') ? '#7ee8bf' : '#ff8095' }}>{msg}</p>}

      {brouillon && (
        <div style={{ ...carte, borderColor: 'var(--accent-strong)' }}>
          <label style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>Nom · ce que tu reverras dans la liste</label>
          <input
            value={brouillon.name} onChange={(e) => setBrouillon({ ...brouillon, name: e.target.value })}
            placeholder="Sombre cinématique maison" style={champ}
          />

          <label style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700, marginTop: 4 }}>
            Le prompt · décris la lumière, le décor, le cadrage, l’ambiance
          </label>
          <textarea
            value={brouillon.prompt} onChange={(e) => setBrouillon({ ...brouillon, prompt: e.target.value })}
            rows={5}
            placeholder="Scène nocturne, lumière rasante bleutée, contre-jour marqué sur le produit, grain argentique léger, palette froide…"
            style={{ ...champ, resize: 'vertical', lineHeight: 1.5 }}
          />
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            Il dit <b>comment ça doit ressembler</b>, jamais ce qu’on montre · le sujet vient du concept.
            Écris-le dans la langue que tu veux, les moteurs d’image comprennent les deux.
          </p>

          <label style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700, marginTop: 4 }}>
            À éviter · facultatif
          </label>
          <input
            value={brouillon.negative} onChange={(e) => setBrouillon({ ...brouillon, negative: e.target.value })}
            placeholder="texte à l’écran, mains déformées, fond blanc" style={champ}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)', marginTop: 4 }}>
            <input
              type="checkbox" checked={brouillon.scope === 'workspace'}
              onChange={(e) => setBrouillon({ ...brouillon, scope: e.target.checked ? 'workspace' : 'brand' })}
            />
            Disponible pour toutes les marques de l’espace
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={enregistrer} disabled={busy} style={{
              padding: '9px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
              color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer',
            }}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => { setBrouillon(null); setMsg(null); }} style={{
              padding: '9px 16px', borderRadius: 999, border: '1px solid var(--line-2)',
              background: 'transparent', color: 'var(--muted)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
            }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {view.mine.length > 0 && (
        <div style={{ display: 'grid', gap: 11 }}>
          {view.mine.map((p) => (
            <div key={p.id} style={carte}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>{p.name}</strong>
                {p.brandId === null && (
                  <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--muted)' }}>
                    toutes les marques
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button onClick={() => setBrouillon({
                  id: p.id, name: p.name, prompt: p.prompt, negative: p.negative ?? '',
                  scope: p.brandId ? 'brand' : 'workspace',
                })} style={lien}>Modifier</button>
                <button onClick={() => archiver(p)} style={lien}>Archiver</button>
              </div>

              {/* Le bilan AVANT le prompt · c'est lui qu'on vient chercher. */}
              {p.performance && (
                <p style={{
                  margin: 0, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5,
                  color: p.performance.hitRate === null ? 'var(--muted)'
                    : p.performance.winners > 0 ? '#7ee8bf' : '#ff8095',
                }}>
                  {p.performance.summary}
                </p>
              )}

              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {p.prompt}
              </p>
              {p.negative && (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>À éviter · {p.negative}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Les univers fournis · un point de départ, plus le seul choix. */}
      <div>
        <h2 style={{ margin: '6px 0 4px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Univers fournis</h2>
        <p style={{ margin: '0 0 11px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, maxWidth: 700 }}>
          Ils restent disponibles. Copie celui qui s’approche le plus de ta direction artistique et
          modifie-le · partir d’une page blanche pour écrire un prompt est décourageant, partir d’un
          exemple qui tient ne l’est pas.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {view.builtin.map((b) => (
            <div key={b.id} style={{ ...carte, padding: '12px 14px', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 12.5, color: 'var(--ink)', flex: 1 }}>{b.name}</strong>
                <button onClick={() => setBrouillon({
                  name: `${b.name} (ma version)`, prompt: b.prompt, negative: '', scope: 'brand',
                })} style={lien}>Copier</button>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{b.prompt}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const lien: CSSProperties = {
  padding: 0, border: 'none', background: 'transparent', color: 'var(--accent-strong)',
  fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
};
