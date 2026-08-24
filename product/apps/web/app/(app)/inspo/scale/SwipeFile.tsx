'use client';

import { useMemo, useState } from 'react';
import type { InspoAd } from '@tiktrends/integrations';
import { ANGLE_LABEL, ANGLE_KEYS, type AngleKey } from '@tiktrends/core';
import { SaveButton, FollowButton } from '../../../../components/InspoButtons';

export interface SwipeItem { ad: InspoAd; angle: AngleKey; saved: boolean; following: boolean }
export interface SwipeStats { total: number; videos: number; advertisers: number; spendCumul: string; medianDuration: number; medianGrowth: number }

const compact = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k' : String(Math.round(n));
const growthOf = (a: InspoAd) => a.reachDelta30d ?? a.reachDelta7d ?? a.reach ?? 0;
const isVideo = (a: InspoAd) => (a.mediaType || '').toLowerCase().includes('vid');

const ANGLE_COLOR: Record<AngleKey, string> = {
  testimonial: '#c084fc', social_proof: '#38bdf8', objection: '#fb7185', offer: '#f5a623',
  gift: '#f472b6', product_feature: '#22d3ee', educational: '#34d399', problem: '#f97316',
  lifestyle: '#a3e635', other: '#94a3b8',
};

export function SwipeFile({ items, stats, advertisers, niche, country }: {
  items: SwipeItem[]; stats: SwipeStats; advertisers: string[]; niche: string; country: string;
}) {
  const [type, setType] = useState<'all' | 'video' | 'static'>('all');
  const [adv, setAdv] = useState('all');
  const [angle, setAngle] = useState<'all' | AngleKey>('all');
  const [sort, setSort] = useState<'growth' | 'reach' | 'duration' | 'spend'>('growth');
  const [qText, setQText] = useState('');

  const anglePresent = useMemo(() => {
    const set = new Set(items.map((i) => i.angle));
    return ANGLE_KEYS.filter((k) => set.has(k));
  }, [items]);

  const shown = useMemo(() => {
    let list = items.filter((i) => {
      if (type === 'video' && !isVideo(i.ad)) return false;
      if (type === 'static' && isVideo(i.ad)) return false;
      if (adv !== 'all' && i.ad.advertiserName !== adv) return false;
      if (angle !== 'all' && i.angle !== angle) return false;
      if (qText.trim() && !((i.ad.body || '') + (i.ad.advertiserName || '')).toLowerCase().includes(qText.toLowerCase())) return false;
      return true;
    });
    const key = { growth: growthOf, reach: (a: InspoAd) => a.reach ?? 0, duration: (a: InspoAd) => a.daysRunning ?? 0, spend: (a: InspoAd) => a.estimatedSpend ?? 0 }[sort];
    list = [...list].sort((a, b) => key(b.ad) - key(a.ad));
    return list;
  }, [items, type, adv, angle, sort, qText]);

  const prompts = buildPrompts(niche, country);

  return (
    <div>
      {/* Bandeau stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 18 }}>
        <Stat n={String(stats.total)} label="Créas" />
        <Stat n={String(stats.videos)} label="Vidéos" />
        <Stat n={String(stats.advertisers)} label="Annonceurs" />
        <Stat n={stats.spendCumul} label="Spend estimé cumulé" />
        <Stat n={compact(stats.medianGrowth)} label="Croissance médiane 30j" />
        <Stat n={stats.medianDuration + ' j'} label="Durée médiane" />
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <Seg value={type} set={setType} opts={[['all', 'Tout'], ['static', 'Statiques'], ['video', 'Vidéos']]} />
        <select value={adv} onChange={(e) => setAdv(e.target.value)} style={sel}>
          <option value="all">Tous les annonceurs</option>
          {advertisers.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={angle} onChange={(e) => setAngle(e.target.value as 'all' | AngleKey)} style={sel}>
          <option value="all">Tous les angles</option>
          {anglePresent.map((k) => <option key={k} value={k}>{ANGLE_LABEL[k]}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={sel}>
          <option value="growth">Tri : croissance reach 30j</option>
          <option value="reach">Tri : reach</option>
          <option value="duration">Tri : durée de diffusion</option>
          <option value="spend">Tri : spend estimé</option>
        </select>
        <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Chercher dans le copy…" style={{ ...sel, flex: '1 1 180px', cursor: 'text' }} />
        <span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 'auto' }}>{shown.length} créa(s)</span>
      </div>

      {/* Grille */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {shown.map((it) => <Card key={it.ad.platform + it.ad.id} it={it} />)}
      </div>

      {/* Bonus : requêtes prêtes à copier */}
      <section style={{ marginTop: 40, borderTop: '1px solid var(--line)', paddingTop: 26 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Bonus · 6 requêtes de veille prêtes à copier</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>À coller dans le Studio ou l'assistant une fois l'IA branchée, pour continuer seul sur cette niche.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
          {prompts.map((p, i) => <PromptCard key={i} n={i + 1} text={p} />)}
        </div>
      </section>
    </div>
  );
}

function Card({ it }: { it: SwipeItem }) {
  const { ad, angle } = it;
  const [open, setOpen] = useState(false);
  const g = growthOf(ad);
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 5', background: ad.thumbnailUrl ? `center/cover no-repeat url(${ad.thumbnailUrl})` : '#140f18' }}>
        {isVideo(ad) && <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,.6)', color: '#fff' }}>VIDÉO</span>}
        {/* Angle en évidence sur le visuel */}
        <span style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999, color: '#0d070c', background: ANGLE_COLOR[angle], boxShadow: '0 2px 8px rgba(0,0,0,.4)' }}>{ANGLE_LABEL[angle]}</span>
        <div style={{ position: 'absolute', top: 8, right: 8 }}><SaveButton ad={ad} initialSaved={it.saved} /></div>
        {!ad.thumbnailUrl && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 12 }}>Aperçu indisponible</div>}
      </div>

      {/* Bande d'analyse — mise en évidence */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: 'var(--paper, rgba(255,255,255,.03))', borderBottom: '1px solid var(--line)' }}>
        <Cell v={'▲ ' + compact(g)} label="Croiss. 30j" accent />
        <Cell v={compact(ad.reach ?? 0)} label="Reach" />
        <Cell v={ad.estimatedSpend != null ? compact(ad.estimatedSpend) + '€' : '—'} label="Spend" />
        <Cell v={(ad.daysRunning ?? 0) + 'j'} label="Diffusion" />
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.advertiserName || 'Marque'}</span>
          <FollowButton ad={ad} initialFollowing={it.following} />
        </div>

        {ad.body && (
          <div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>{ad.body}</p>
            {ad.body.length > 120 && <button type="button" onClick={() => setOpen((o) => !o)} style={{ marginTop: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{open ? 'Réduire' : 'Voir tout le copy'}</button>}
          </div>
        )}

        {siteHref(ad) && (
          <a href={siteHref(ad)!} target="_blank" rel="noreferrer noopener" style={{
            marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'transparent',
            color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, textDecoration: 'none',
          }}>
            {ctaLabel(ad)} <span style={{ color: 'var(--accent-strong)' }}>↗</span>
          </a>
        )}
      </div>
    </div>
  );
}

/** URL de la landing à ouvrir : URL complète si dispo, sinon le domaine. */
function siteHref(ad: InspoAd): string | null {
  if (ad.landingUrl && /^https?:\/\//i.test(ad.landingUrl)) return ad.landingUrl;
  if (ad.landingDomain) return 'https://' + ad.landingDomain.replace(/^https?:\/\//i, '');
  return null;
}
function ctaLabel(ad: InspoAd): string {
  const dom = ad.landingDomain?.replace(/^www\./, '');
  return dom ? `Ouvrir ${dom}` : 'Ouvrir le site';
}

function Cell({ v, label, accent }: { v: string; label: string; accent?: boolean }) {
  return (
    <div style={{ padding: '10px 6px', textAlign: 'center', borderRight: '1px solid var(--line)' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: accent ? '#2fd6a0' : 'var(--ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{v}</div>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function PromptCard({ n, text }: { n: number; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-strong)', minWidth: 18 }}>{String(n).padStart(2, '0')}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{text}</span>
      <button type="button" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {}); }}
        style={{ fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'transparent', color: copied ? '#18cc8c' : 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {copied ? '✓ Copié' : 'Copier'}
      </button>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div style={{ background: 'var(--surface)', padding: '14px 16px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginTop: 3 }}>{label}</div>
    </div>
  );
}
function Seg<T extends string>({ value, set, opts }: { value: T; set: (v: T) => void; opts: Array<[T, string]> }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--line-2)', borderRadius: 999, overflow: 'hidden' }}>
      {opts.map(([v, label]) => (
        <button key={v} type="button" onClick={() => set(v)} style={{
          padding: '8px 13px', fontSize: 12.5, fontWeight: value === v ? 800 : 600, cursor: 'pointer', border: 'none',
          background: value === v ? 'var(--grad-accent)' : 'transparent', color: value === v ? '#0d070c' : 'var(--ink-2)',
        }}>{label}</button>
      ))}
    </div>
  );
}

function buildPrompts(niche: string, country: string): string[] {
  const n = niche && niche !== 'échantillon' ? niche : 'ma niche';
  return [
    `Montre-moi les créas ${n} en plus forte croissance de reach sur 30 jours en ${country}, plafonnées à 3 par marque.`,
    `Classe les angles dominants des créas ${n} (témoignage, preuve sociale, réponse à l'objection…) et dis-moi lesquels personne n'exploite encore.`,
    `Donne-moi le copy intégral des 5 meilleures créas ${n} qui utilisent la preuve sociale.`,
    `Quelles marques ${n} lancent des créas depuis moins de 30 jours avec une forte croissance ? Résume leur hook.`,
    `Compare la durée de diffusion médiane par angle pour ${n} : quel angle tient le plus longtemps ?`,
    `À partir des créas ${n} qui scalent, propose-moi 3 concepts de vidéo originaux pour ma marque.`,
  ];
}

const sel = { padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, outline: 'none', cursor: 'pointer' } as const;
