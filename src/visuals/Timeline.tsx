import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts, toneColor} from '../theme';
import {Region, revealTimes, useBox, useFade, useUnit} from '../components/Box';
import type {Tone} from '../types';

// Dated nodes on a line that draws itself; horizontal on 16:9, vertical on 9:16.
export const Timeline: React.FC<{heading?: string; nodes: {date: string; label: string; tone?: Tone}[]}> = ({heading, nodes}) => {
  const u = useUnit();
  const b = useBox();
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const times = revealTimes(nodes.length, durationInFrames, 12);
  const vertical = b.h > b.w;
  const lineP = interpolate(f, [6, times[times.length - 1] + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const h = useFade(0);
  return (
    <Region style={{display: 'flex', flexDirection: 'column', padding: 60 * u, boxSizing: 'border-box', gap: 40 * u}}>
      {heading ? <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 60 * u, opacity: h}}>{heading}</div> : null}
      <div style={{position: 'relative', flex: 1, display: 'flex', flexDirection: vertical ? 'column' : 'row', justifyContent: 'space-around', alignItems: 'center'}}>
        <div style={{position: 'absolute', background: colors.border, ...(vertical ? {left: '50%', top: 0, width: 6 * u, height: '100%'} : {top: '50%', left: 0, height: 6 * u, width: '100%'})}}>
          <div style={{background: colors.orange, ...(vertical ? {width: '100%', height: `${lineP * 100}%`} : {height: '100%', width: `${lineP * 100}%`})}} />
        </div>
        {nodes.map((n, i) => {
          const e = spring({frame: f - times[i], fps, config: {damping: 14}});
          const c = toneColor(n.tone || 'accent');
          const up = i % 2 === 0;
          return (
            <div key={i} style={{position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: e}}>
              <div style={{width: 34 * u, height: 34 * u, borderRadius: '50%', background: colors.bg, border: `${6 * u}px solid ${c}`, transform: `scale(${e})`, zIndex: 1}} />
              <div style={{position: 'absolute', ...(vertical ? {left: '58%', top: '50%', transform: 'translateY(-50%)', textAlign: 'left'} : up ? {bottom: 60 * u, textAlign: 'center'} : {top: 60 * u, textAlign: 'center'}), width: vertical ? 380 * u : 300 * u}}>
                <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 40 * u, color: c}}>{n.date}</div>
                <div style={{fontSize: 30 * u, lineHeight: 1.3, fontWeight: 500, marginTop: 6 * u}}>{n.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Region>
  );
};
