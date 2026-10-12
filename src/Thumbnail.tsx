import React from 'react';
import {AbsoluteFill} from 'remotion';
import {colors, fonts} from './theme';
import type {Job} from './types';
import {Icon} from './components/Icon';

// 1280x720 thumbnail: one bold English headline, one emphasis word in orange,
// a supporting line, and the strongest icon from the video's first flow/hub scene.
export const Thumbnail: React.FC<{job: Job}> = ({job}) => {
  const t = job.thumbnail || {headline: job.title};
  const words = t.headline.split(' ');
  const emph = words.reduce((a, w) => (w.length > a.length ? w : a), '');
  const firstIcon = job.scenes
    .map((s) => (s.visual.type === 'hub' ? s.visual.center.icon : s.visual.type === 'flow' ? s.visual.steps.find((x) => x.icon)?.icon : undefined))
    .find(Boolean);
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 75% 50%, #173153 0%, ${colors.bg} 65%)`, fontFamily: fonts.display, padding: 64, boxSizing: 'border-box', justifyContent: 'center'}}>
      {firstIcon ? (
        <div style={{position: 'absolute', right: 70, top: '50%', transform: 'translateY(-50%)', width: 360, height: 360, borderRadius: '50%', background: colors.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 90px rgba(255,138,31,0.55)'}}>
          <Icon name={firstIcon} size={220} color={colors.bg} stroke={2.2} />
        </div>
      ) : null}
      <div style={{width: firstIcon ? 760 : 1150, display: 'flex', flexDirection: 'column', gap: 22}}>
        <div style={{width: 120, height: 10, background: colors.orange, borderRadius: 5}} />
        <div style={{fontWeight: 800, fontSize: words.length > 5 ? 82 : 100, lineHeight: 1.02, color: colors.text, textTransform: 'uppercase'}}>
          {words.map((w, i) => (
            <span key={i} style={{color: w === emph ? colors.orange : colors.text}}>
              {w}{' '}
            </span>
          ))}
        </div>
        {t.sub ? <div style={{fontFamily: fonts.body, fontWeight: 700, fontSize: 40, color: colors.yellow}}>{t.sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
