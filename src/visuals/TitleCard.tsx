import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, useEnter, useFade, useUnit} from '../components/Box';

export const TitleCard: React.FC<{title: string; subtitle?: string; kicker?: string}> = ({title, subtitle, kicker}) => {
  const u = useUnit();
  const f = useCurrentFrame();
  const words = title.split(' ');
  const line = interpolate(f, [4, 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const sub = useFade(16 + words.length * 3);
  const kick = useFade(0);
  return (
    <Region style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 70 * u, boxSizing: 'border-box', gap: 26 * u}}>
      {kicker ? (
        <div style={{fontSize: 28 * u, letterSpacing: 4, fontWeight: 700, color: colors.orange, opacity: kick}}>{kicker.toUpperCase()}</div>
      ) : null}
      <div style={{width: 160 * u * line, height: 8 * u, background: colors.orange, borderRadius: 4}} />
      <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 96 * u, lineHeight: 1.08, display: 'flex', flexWrap: 'wrap', gap: `0 ${24 * u}px`}}>
        {words.map((w, i) => (
          <Word key={i} w={w} delay={6 + i * 3} u={u} />
        ))}
      </div>
      {subtitle ? <div style={{fontSize: 38 * u, color: colors.sub, maxWidth: 1100 * u, lineHeight: 1.35, opacity: sub}}>{subtitle}</div> : null}
    </Region>
  );
};

const Word: React.FC<{w: string; delay: number; u: number}> = ({w, delay, u}) => {
  const e = useEnter(delay);
  return <span style={{display: 'inline-block', transform: `translateY(${(1 - e) * 50 * u}px)`, opacity: e}}>{w}</span>;
};
