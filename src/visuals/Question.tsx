import React from 'react';
import {useCurrentFrame} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, useEnter, useUnit} from '../components/Box';
import {Highlight} from '../components/Highlight';

// Rhetorical question card: a large outlined "?" and the question rising in.
export const Question: React.FC<{text: string; highlight?: string[]}> = ({text, highlight}) => {
  const u = useUnit();
  const f = useCurrentFrame();
  const q = useEnter(0, 12);
  const t = useEnter(8);
  return (
    <Region style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'absolute', fontFamily: fonts.display, fontWeight: 800, fontSize: 620 * u, color: 'transparent', WebkitTextStroke: `${4 * u}px ${colors.orange}`, opacity: 0.22 * q, transform: `scale(${0.8 + 0.2 * q}) rotate(${Math.sin(f / 40) * 3}deg)`}}>?</div>
      <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 78 * u, lineHeight: 1.15, textAlign: 'center', maxWidth: 1150 * u, opacity: t, transform: `translateY(${(1 - t) * 40 * u}px)`}}>
        <Highlight text={text} words={highlight} />
      </div>
    </Region>
  );
};
