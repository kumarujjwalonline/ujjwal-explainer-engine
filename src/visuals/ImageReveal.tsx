import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors} from '../theme';
import {Region, useFade, useUnit} from '../components/Box';

// Licensed photo or generated art: mask wipe in, slow 105% push, credit line.
export const ImageReveal: React.FC<{src: string; credit?: string; caption?: string}> = ({src, credit, caption}) => {
  const u = useUnit();
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const wipe = interpolate(f, [0, 16], [0, 100], {extrapolateRight: 'clamp'});
  const zoom = interpolate(f, [0, durationInFrames], [1, 1.05]);
  const c = useFade(14);
  const url = /^https?:/.test(src) ? src : staticFile(src);
  return (
    <Region>
      <div style={{position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - wipe}% 0 0 round ${18 * u}px)`}}>
        <Img src={url} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`}} />
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,23,38,0.85) 0%, rgba(11,23,38,0) 45%)'}} />
      </div>
      {caption ? <div style={{position: 'absolute', left: 40 * u, bottom: 70 * u, fontSize: 40 * u, fontWeight: 700, opacity: c}}>{caption}</div> : null}
      {credit ? <div style={{position: 'absolute', left: 40 * u, bottom: 24 * u, fontSize: 20 * u, color: colors.sub, opacity: c}}>{credit}</div> : null}
    </Region>
  );
};
