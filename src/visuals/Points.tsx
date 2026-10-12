import React from 'react';
import {useCurrentFrame, useVideoConfig, spring} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, revealTimes, useFade, useUnit} from '../components/Box';
import {Highlight} from '../components/Highlight';

// Key points revealed one by one in step with the narration; the newest is in focus.
export const Points: React.FC<{heading?: string; items: string[]; highlight?: string[]}> = ({heading, items, highlight}) => {
  const u = useUnit();
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const times = revealTimes(items.length, durationInFrames, heading ? 14 : 6);
  const h = useFade(0);
  const latest = times.filter((t) => f >= t).length - 1;
  return (
    <Region style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 70 * u, boxSizing: 'border-box', gap: 34 * u}}>
      {heading ? <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 64 * u, opacity: h}}>{heading}</div> : null}
      {items.map((it, i) => {
        const e = spring({frame: f - times[i], fps, config: {damping: 18, mass: 0.7}});
        const focus = i === latest;
        return (
          <div key={i} style={{display: 'flex', gap: 26 * u, alignItems: 'flex-start', opacity: e * (focus || latest < i ? 1 : 0.55), transform: `translateX(${(1 - e) * -60 * u}px)`}}>
            <div style={{flex: 'none', width: 46 * u, height: 46 * u, marginTop: 6 * u, borderRadius: 12 * u, background: focus ? colors.orange : colors.panel, border: `2px solid ${focus ? colors.orange : colors.border}`, color: focus ? colors.bg : colors.sub, fontWeight: 800, fontSize: 26 * u, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{i + 1}</div>
            <div style={{fontSize: 46 * u, lineHeight: 1.3, fontWeight: 600}}>
              <Highlight text={it} words={highlight} />
            </div>
          </div>
        );
      })}
    </Region>
  );
};
