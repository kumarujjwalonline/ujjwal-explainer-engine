import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, revealTimes, useFade, useUnit} from '../components/Box';

// Step-by-step working for numericals (rule 10): one line at a time, slow and
// precise, the current line in focus, the final answer boxed. Text is set in
// a monospace-like tabular face so numbers line up.
export const Formula: React.FC<{heading?: string; lines: {text: string; note?: string; final?: boolean}[]}> = ({heading, lines}) => {
  const u = useUnit();
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const times = revealTimes(lines.length, durationInFrames, heading ? 14 : 6);
  const latest = times.filter((t) => f >= t).length - 1;
  const h = useFade(0);
  const size = lines.length > 6 ? 40 : 50;
  return (
    <Region style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 70 * u, boxSizing: 'border-box', gap: 24 * u}}>
      {heading ? <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 56 * u, opacity: h, marginBottom: 10 * u}}>{heading}</div> : null}
      {lines.map((l, i) => {
        const e = spring({frame: f - times[i], fps, config: {damping: 20}});
        const focus = i === latest;
        return (
          <div key={i} style={{display: 'flex', alignItems: 'baseline', gap: 30 * u, opacity: e * (focus ? 1 : 0.6), transform: `translateY(${(1 - e) * 24}px)`}}>
            <div style={{fontSize: size * u, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: l.final ? colors.bg : focus ? colors.yellow : colors.text, background: l.final ? colors.orange : 'transparent', padding: l.final ? `${6 * u}px ${20 * u}px` : 0, borderRadius: 10 * u, whiteSpace: 'pre'}}>
              {l.text}
            </div>
            {l.note ? <div style={{fontSize: 28 * u, color: colors.sub}}>{l.note}</div> : null}
          </div>
        );
      })}
    </Region>
  );
};
