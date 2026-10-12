import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {colors} from '../theme';

// Quiet navy ground with a slow-drifting grid so frames never sit perfectly still.
export const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const shift = (f * 0.25) % 80;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 35% 40%, ${colors.bg2} 0%, ${colors.bg} 70%)`}} />
      <AbsoluteFill
        style={{
          opacity: 0.18,
          backgroundImage: `linear-gradient(${colors.border} 1px, transparent 1px), linear-gradient(90deg, ${colors.border} 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
          backgroundPosition: `${shift}px ${shift}px`,
        }}
      />
    </AbsoluteFill>
  );
};
