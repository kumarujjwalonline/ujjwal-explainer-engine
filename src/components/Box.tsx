import React, {createContext, useContext} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';

export type BoxRect = {x: number; y: number; w: number; h: number};
export const BoxContext = createContext<BoxRect>({x: 0, y: 0, w: 1920, h: 1080});
export const useBox = () => useContext(BoxContext);

// Everything a visual draws goes inside its canvas region; overflow is clipped so
// nothing can cross into the tracker or the safe margins.
export const Region: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => {
  const b = useBox();
  return (
    <div style={{position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, overflow: 'hidden', ...style}}>
      {children}
    </div>
  );
};

// Unit that scales with the region, so the same visual works in 16:9 and 9:16.
export const useUnit = () => {
  const b = useBox();
  return Math.min(b.w / 1390, b.h / 940) * (b.w < b.h ? 1.5 : 1);
};

export const useEnter = (delay = 0, damping = 18) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: f - delay, fps, config: {damping, mass: 0.7}});
};

export const useFade = (start: number, len = 12) => {
  const f = useCurrentFrame();
  return interpolate(f, [start, start + len], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
};

// Spread n reveals evenly across the scene, leaving a short hold at the end.
export const revealTimes = (n: number, total: number, startAt = 8) => {
  const usable = Math.max(10, total * 0.72 - startAt);
  return Array.from({length: n}, (_, i) => Math.round(startAt + (n <= 1 ? 0 : (usable * i) / (n - 1))));
};
