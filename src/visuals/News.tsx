import React from 'react';
import {colors, fonts} from '../theme';
import {Region, useEnter, useFade, useUnit} from '../components/Box';

// Headline card in our own typography; never a screenshot of a publication.
export const News: React.FC<{headline: string; outlet: string; date: string}> = ({headline, outlet, date}) => {
  const u = useUnit();
  const e = useEnter(2, 16);
  const meta = useFade(14);
  return (
    <Region style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{width: '82%', background: colors.panel, border: `2px solid ${colors.border}`, borderRadius: 22 * u, padding: 54 * u, boxSizing: 'border-box', transform: `translateY(${(1 - e) * 60}px) scale(${0.94 + 0.06 * e})`, opacity: e}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 14 * u, marginBottom: 26 * u}}>
          <span style={{background: colors.red, color: colors.text, fontWeight: 800, fontSize: 22 * u, letterSpacing: 2, padding: `${6 * u}px ${14 * u}px`, borderRadius: 6 * u}}>REPORTED</span>
          <span style={{fontSize: 26 * u, color: colors.sub, opacity: meta}}>{outlet} · {date}</span>
        </div>
        <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 64 * u, lineHeight: 1.15}}>{headline}</div>
      </div>
    </Region>
  );
};
