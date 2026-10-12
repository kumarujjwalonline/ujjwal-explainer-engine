import React from 'react';
import {colors} from '../theme';

// Renders text with chosen words in the emphasis colour.
export const Highlight: React.FC<{text: string; words?: string[]; color?: string}> = ({text, words, color = colors.orange}) => {
  if (!words || !words.length) return <>{text}</>;
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const parts = text.split(new RegExp(`(${esc})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        words.some((w) => w.toLowerCase() === p.toLowerCase()) ? (
          <span key={i} style={{color}}>{p}</span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
};
