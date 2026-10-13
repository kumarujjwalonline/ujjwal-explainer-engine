import React from 'react';
import {OffthreadVideo, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, useFade, useUnit} from '../components/Box';

// Production rule 19: real, copyright-free footage (Pexels licence), fetched on GitHub by
// scripts/fetch_footage.py. Muted (no music rule), slow push-in, caption and credit.
export type FootageSpec = {query: string; caption?: string; src?: string; credit?: string};

export const Footage: React.FC<FootageSpec> = ({caption, src, credit, query}) => {
  const u = useUnit();
  const f = useCurrentFrame();
  const c = useFade(10);
  const wipe = interpolate(f, [0, 14], [0, 100], {extrapolateRight: 'clamp'});
  if (!src) {
    return (
      <Region style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 56 * u, textAlign: 'center', maxWidth: '80%', opacity: c}}>{caption || query}</div>
      </Region>
    );
  }
  return (
    <Region>
      <div style={{position: 'absolute', inset: 0, borderRadius: 18 * u, overflow: 'hidden', clipPath: `inset(0 ${100 - wipe}% 0 0)`}}>
        <OffthreadVideo src={staticFile(src)} muted style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(f, [0, 300], [1, 1.06], {extrapolateRight: 'clamp'})})`}} />
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,23,38,0.85) 0%, rgba(11,23,38,0) 45%)'}} />
      </div>
      {caption ? <div style={{position: 'absolute', left: 40 * u, bottom: 64 * u, fontSize: 40 * u, fontWeight: 800, fontFamily: fonts.display, opacity: c}}>{caption}</div> : null}
      {credit ? <div style={{position: 'absolute', left: 40 * u, bottom: 24 * u, fontSize: 18 * u, color: colors.sub, opacity: c}}>{credit}</div> : null}
    </Region>
  );
};
