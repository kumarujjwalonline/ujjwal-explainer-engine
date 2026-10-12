import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors} from '../theme';
import {Region, revealTimes, useBox, useUnit} from '../components/Box';
import {Icon} from '../components/Icon';
import type {IconName} from '../types';

// Hub and spokes: one centre (e.g. Claude or Zapier) connecting to many apps.
// Spokes connect one by one and a pulse travels along each live link.
export const Hub: React.FC<{center: {label: string; icon?: IconName}; spokes: {label: string; icon?: IconName}[]}> = ({center, spokes}) => {
  const u = useUnit();
  const b = useBox();
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const times = revealTimes(spokes.length, durationInFrames, 14);
  const cx = b.w / 2;
  const cy = b.h / 2;
  const R = Math.min(b.w, b.h) * 0.36;
  const ce = spring({frame: f, fps, config: {damping: 14}});
  return (
    <Region>
      <svg width={b.w} height={b.h} style={{position: 'absolute', inset: 0}}>
        {spokes.map((s, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / spokes.length;
          const x = cx + R * Math.cos(a);
          const y = cy + R * Math.sin(a);
          const p = interpolate(f, [times[i], times[i] + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          const t = ((f - times[i]) % 40) / 40;
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={cx + (x - cx) * p} y2={cy + (y - cy) * p} stroke={colors.orange} strokeWidth={3 * u} strokeDasharray={`${10 * u} ${8 * u}`} opacity={0.8} />
              {p >= 1 ? <circle cx={cx + (x - cx) * t} cy={cy + (y - cy) * t} r={7 * u} fill={colors.yellow} /> : null}
            </g>
          );
        })}
      </svg>
      {spokes.map((s, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / spokes.length;
        const x = cx + R * Math.cos(a);
        const y = cy + R * Math.sin(a);
        const e = spring({frame: f - times[i] - 6, fps, config: {damping: 14}});
        return (
          <div key={i} style={{position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) scale(${e})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 * u}}>
            <div style={{width: 110 * u, height: 110 * u, borderRadius: 24 * u, background: colors.panel, border: `2px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <Icon name={s.icon} size={58 * u} color={colors.text} />
            </div>
            <div style={{fontSize: 28 * u, fontWeight: 600, whiteSpace: 'nowrap'}}>{s.label}</div>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: cx, top: cy, transform: `translate(-50%,-50%) scale(${ce})`, width: 220 * u, height: 220 * u, borderRadius: '50%', background: colors.orange, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 ${60 * u}px rgba(255,138,31,0.45)`, gap: 6 * u}}>
        <Icon name={center.icon} size={70 * u} color={colors.bg} stroke={2.2} />
        <div style={{fontSize: 34 * u, fontWeight: 800, color: colors.bg}}>{center.label}</div>
      </div>
    </Region>
  );
};
