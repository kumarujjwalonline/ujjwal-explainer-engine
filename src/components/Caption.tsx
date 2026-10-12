import React from 'react';
import {useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import {colors, fonts} from '../theme';
import {useBox, useUnit} from './Box';

// Short English on-screen line at the foot of the canvas region.
export const Caption: React.FC<{text: string}> = ({text}) => {
  const b = useBox();
  const u = useUnit();
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const o = interpolate(f, [6, 16, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: b.x,
        width: b.w,
        top: b.y + b.h - 92 * u,
        display: 'flex',
        justifyContent: 'center',
        opacity: o,
      }}
    >
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 700,
          fontSize: 34 * u,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: colors.text,
          background: 'rgba(11,23,38,0.82)',
          border: `2px solid ${colors.orange}`,
          padding: `${10 * u}px ${26 * u}px`,
          borderRadius: 10 * u,
          maxWidth: b.w - 40,
          textAlign: 'center',
        }}
      >
        {text}
      </div>
    </div>
  );
};
