import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, useBox, useEnter, useFade, useUnit} from '../components/Box';

// Production rule 15: a real screenshot of the source, with where it was published, by whom,
// when and why. The screenshot is taken from the live page on GitHub (scripts/fetch_sources.py).
// If the page could not be captured, the card shows the details without a picture: a source is
// never recreated or faked.
export type SourceSpec = {url: string; publisher: string; authors?: string; date?: string; title?: string; why?: string; shot?: string; shotRatio?: number; capturedUrl?: string};

const domain = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

export const SourceCard: React.FC<SourceSpec> = ({url, publisher, authors, date, title, why, shot, shotRatio, capturedUrl}) => {
  const u = useUnit();
  const b = useBox();
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const e = useEnter(2, 16);
  const facts = [
    {k: 'Published in', v: publisher},
    authors ? {k: 'By', v: authors} : null,
    date ? {k: 'When', v: date} : null,
    why ? {k: 'Why', v: why} : null,
  ].filter(Boolean) as {k: string; v: string}[];
  const chips = [useFade(18), useFade(28), useFade(38), useFade(48)];
  const titleFade = useFade(10);
  // Slow scroll down the captured page, like a reader skimming it.
  const scroll = interpolate(f, [12, durationInFrames - 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad)});
  const frameW = 0.6;
  const shown = b.w * frameW * (shotRatio || 1.6); // screenshot height as drawn
  const visible = b.h * 0.86 - 46 * u;
  const travel = Math.max(0, shown - visible) * 0.6;
  return (
    <Region style={{display: 'flex', alignItems: 'center', gap: 34 * u, padding: `0 ${10 * u}px`, boxSizing: 'border-box'}}>
      <div style={{width: `${frameW * 100}%`, height: '86%', borderRadius: 16 * u, overflow: 'hidden', border: `2px solid ${colors.border}`, background: '#FFFFFF', boxShadow: '0 20px 60px rgba(0,0,0,0.45)', transform: `translateY(${(1 - e) * 50}px) scale(${0.95 + 0.05 * e})`, opacity: e, display: 'flex', flexDirection: 'column'}}>
        <div style={{height: 46 * u, flex: 'none', background: '#E9EDF2', display: 'flex', alignItems: 'center', gap: 10 * u, padding: `0 ${16 * u}px`}}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <span key={c} style={{width: 12 * u, height: 12 * u, borderRadius: 6 * u, background: c}} />)}
          <div style={{flex: 1, marginLeft: 12 * u, height: 28 * u, borderRadius: 14 * u, background: '#FFFFFF', color: '#3A4A5E', fontSize: 17 * u, display: 'flex', alignItems: 'center', padding: `0 ${14 * u}px`, overflow: 'hidden', whiteSpace: 'nowrap'}}>🔒 {domain(capturedUrl || url)}</div>
        </div>
        <div style={{flex: 1, position: 'relative', overflow: 'hidden', background: shot ? '#FFFFFF' : colors.panel}}>
          {shot ? (
            <Img src={staticFile(shot)} style={{position: 'absolute', left: 0, width: '100%', top: 0, transform: `translateY(-${scroll * travel}px)`}} />
          ) : (
            <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 40 * u, gap: 18 * u}}>
              <div style={{fontSize: 20 * u, letterSpacing: 2, color: colors.sub, fontWeight: 700}}>SOURCE</div>
              <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 40 * u, lineHeight: 1.2, color: colors.text}}>{title || publisher}</div>
              <div style={{fontSize: 22 * u, color: colors.sub}}>{domain(url)}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 18 * u}}>
        {title && shot ? <div style={{fontFamily: fonts.display, fontWeight: 700, fontSize: 28 * u, lineHeight: 1.25, color: colors.text, opacity: titleFade}}>{title}</div> : null}
        {facts.map((x, i) => (
          <div key={x.k} style={{opacity: chips[i], transform: `translateX(${(1 - chips[i]) * 30}px)`, borderLeft: `4px solid ${i === 0 ? colors.orange : colors.border}`, paddingLeft: 16 * u}}>
            <div style={{fontSize: 18 * u, letterSpacing: 1.5, color: colors.sub, fontWeight: 700, textTransform: 'uppercase'}}>{x.k}</div>
            <div style={{fontSize: 28 * u, fontWeight: 700, color: i === 0 ? colors.orange : colors.text, lineHeight: 1.25}}>{x.v}</div>
          </div>
        ))}
      </div>
    </Region>
  );
};
