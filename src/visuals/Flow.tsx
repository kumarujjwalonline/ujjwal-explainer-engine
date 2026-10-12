import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, revealTimes, useBox, useFade, useUnit} from '../components/Box';
import {Icon} from '../components/Icon';
import type {IconName} from '../types';

// Process diagram: each step appears, then the arrow to the next one draws in.
// Wraps into rows when there are many steps; stacks vertically on 9:16.
export const Flow: React.FC<{heading?: string; steps: {label: string; sub?: string; icon?: IconName}[]; layout?: 'row' | 'cycle'}> = ({heading, steps}) => {
  const u = useUnit();
  const b = useBox();
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const times = revealTimes(steps.length, durationInFrames, heading ? 14 : 6);
  const vertical = b.h > b.w;
  const perRow = vertical ? 1 : steps.length <= 4 ? steps.length : Math.ceil(steps.length / 2);
  const rows: number[][] = [];
  steps.forEach((_, i) => {
    const r = Math.floor(i / perRow);
    (rows[r] = rows[r] || []).push(i);
  });
  const h = useFade(0);
  const card = vertical ? 760 * u : Math.min(300, (b.w - 140 - (perRow - 1) * 90) / perRow) * (vertical ? 1 : 1);
  return (
    <Region style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 50 * u, boxSizing: 'border-box', gap: 44 * u}}>
      {heading ? <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 60 * u, opacity: h, alignSelf: 'flex-start'}}>{heading}</div> : null}
      {rows.map((row, ri) => (
        <div key={ri} style={{display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: 0}}>
          {row.map((i, k) => {
            const e = spring({frame: f - times[i], fps, config: {damping: 15, mass: 0.7}});
            const active = f >= times[i] && (i === steps.length - 1 || f < times[i + 1]);
            const s = steps[i];
            const arrowP = i < steps.length - 1 && k < row.length - 1 ? interpolate(f, [times[i + 1] - 8, times[i + 1]], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
            return (
              <React.Fragment key={i}>
                <div style={{width: vertical ? card : card, minHeight: vertical ? 120 * u : 220 * u, boxSizing: 'border-box', padding: 22 * u, borderRadius: 20 * u, background: colors.panel, border: `3px solid ${active ? colors.orange : f >= times[i] ? colors.border : 'transparent'}`, boxShadow: active ? `0 0 ${30 * u}px rgba(255,138,31,0.35)` : 'none', display: 'flex', flexDirection: vertical ? 'row' : 'column', alignItems: 'center', gap: 16 * u, opacity: e, transform: `scale(${0.85 + 0.15 * e})`}}>
                  {s.icon ? <Icon name={s.icon} size={(vertical ? 64 : 78) * u} color={active ? colors.orange : colors.text} /> : null}
                  <div style={{textAlign: vertical ? 'left' : 'center'}}>
                    <div style={{fontSize: 34 * u, fontWeight: 700, lineHeight: 1.2}}>{s.label}</div>
                    {s.sub ? <div style={{fontSize: 24 * u, color: colors.sub, marginTop: 6 * u, lineHeight: 1.3}}>{s.sub}</div> : null}
                  </div>
                </div>
                {k < row.length - 1 ? <Arrow p={arrowP} u={u} vertical={vertical} /> : null}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </Region>
  );
};

const Arrow: React.FC<{p: number; u: number; vertical: boolean}> = ({p, u, vertical}) => {
  const L = 90 * u;
  return (
    <svg width={vertical ? 40 * u : L} height={vertical ? 60 * u : 40 * u} viewBox={vertical ? '0 0 40 60' : '0 0 90 40'} style={{flex: 'none'}}>
      {vertical ? (
        <>
          <line x1="20" y1="4" x2="20" y2={4 + 44 * p} stroke={colors.orange} strokeWidth="4" strokeLinecap="round" />
          {p > 0.95 ? <path d="M10 42 L20 54 L30 42" stroke={colors.orange} strokeWidth="4" fill="none" strokeLinecap="round" /> : null}
        </>
      ) : (
        <>
          <line x1="8" y1="20" x2={8 + 68 * p} y2="20" stroke={colors.orange} strokeWidth="4" strokeLinecap="round" />
          {p > 0.95 ? <path d="M66 10 L80 20 L66 30" stroke={colors.orange} strokeWidth="4" fill="none" strokeLinecap="round" /> : null}
        </>
      )}
    </svg>
  );
};
