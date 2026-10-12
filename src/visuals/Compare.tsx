import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts, toneColor} from '../theme';
import {Region, revealTimes, useBox, useUnit} from '../components/Box';
import type {Tone} from '../types';

type Side = {heading: string; items: string[]; tone?: Tone};

// Two columns (stacked on 9:16) with an animated divider; left fills first, then right.
export const Compare: React.FC<{left: Side; right: Side}> = ({left, right}) => {
  const u = useUnit();
  const b = useBox();
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const vertical = b.h > b.w;
  const n = left.items.length + right.items.length + 2;
  const times = revealTimes(n, durationInFrames, 6);
  const div = interpolate(f, [0, 14], [0, 1], {extrapolateRight: 'clamp'});
  const col = (s: Side, offset: number, defTone: Tone) => {
    const c = toneColor(s.tone || defTone);
    const he = spring({frame: f - times[offset], fps, config: {damping: 16}});
    return (
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 22 * u, padding: 40 * u, minWidth: 0}}>
        <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 52 * u, color: c, opacity: he, transform: `translateY(${(1 - he) * 20}px)`}}>{s.heading}</div>
        <div style={{height: 5 * u, width: `${he * 100}%`, background: c, borderRadius: 3}} />
        {s.items.map((it, i) => {
          const e = spring({frame: f - times[offset + 1 + i], fps, config: {damping: 16}});
          return (
            <div key={i} style={{display: 'flex', gap: 16 * u, alignItems: 'flex-start', fontSize: 38 * u, lineHeight: 1.3, fontWeight: 500, opacity: e, transform: `translateX(${(1 - e) * 30}px)`}}>
              <span style={{flex: 'none', width: 14 * u, height: 14 * u, borderRadius: 7 * u, background: c, marginTop: 16 * u}} />
              <span>{it}</span>
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <Region style={{display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'stretch', justifyContent: 'center'}}>
      {col(left, 0, 'muted')}
      <div style={{flex: 'none', background: colors.border, ...(vertical ? {height: 4, width: `${div * 100}%`, alignSelf: 'center'} : {width: 4, height: `${div * 100}%`, alignSelf: 'center'})}} />
      {col(right, left.items.length + 1, 'accent')}
    </Region>
  );
};
