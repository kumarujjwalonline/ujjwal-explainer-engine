import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, useFade, useUnit} from '../components/Box';

// Counter that settles on the value; the source/date line always shows (rule: statistics dated).
export const Stat: React.FC<{value: number; from?: number; prefix?: string; suffix?: string; decimals?: number; label: string; source?: string}> = ({value, from = 0, prefix = '', suffix = '', decimals = 0, label, source}) => {
  const u = useUnit();
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const end = Math.min(durationInFrames * 0.6, 60);
  const v = interpolate(f, [6, end], [from, value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const shown = v.toLocaleString('en-IN', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
  const l = useFade(10);
  const s = useFade(end);
  const ring = interpolate(f, [6, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <Region style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 * u}}>
      <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 210 * u, lineHeight: 1, color: colors.orange, fontVariantNumeric: 'tabular-nums', letterSpacing: -2}}>
        {prefix}
        {shown}
        <span style={{fontSize: 110 * u}}>{suffix}</span>
      </div>
      <div style={{width: 520 * u, height: 6 * u, background: colors.border, borderRadius: 3}}>
        <div style={{width: `${ring * 100}%`, height: '100%', background: colors.yellow, borderRadius: 3}} />
      </div>
      <div style={{fontSize: 50 * u, fontWeight: 700, textAlign: 'center', maxWidth: 1100 * u, opacity: l}}>{label}</div>
      {source ? <div style={{fontSize: 26 * u, color: colors.sub, opacity: s}}>Source: {source}</div> : null}
    </Region>
  );
};
