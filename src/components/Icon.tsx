import React from 'react';
import type {IconName} from '../types';

// In-house line icons (own artwork, 24x24 grid, stroke only).
const P: Record<IconName, string> = {
  ship: 'M3 15 L21 15 L18 20 L6 20 Z M7 15 L7 9 L13 9 L13 15 M13 11 L17 11 L17 15 M10 9 L10 5',
  truck: 'M2 7 H14 V16 H2 Z M14 10 H18 L21 13 V16 H14 M6 18 a1.6 1.6 0 1 0 0.01 0 M17 18 a1.6 1.6 0 1 0 0.01 0',
  train: 'M6 3 H18 V16 H6 Z M6 10 H18 M9 16 L7 20 M15 16 L17 20 M9 13 h0.01 M15 13 h0.01',
  plane: 'M2 13 L10 11 L14 3 L16 3 L14 11 L21 11 L21 13 L14 13 L16 21 L14 21 L10 13 Z',
  person: 'M12 4 a3.5 3.5 0 1 0 0.01 0 M5 20 C5 15 8 13 12 13 C16 13 19 15 19 20',
  people: 'M9 5 a3 3 0 1 0 0.01 0 M3 19 C3 15 5.5 13 9 13 C12.5 13 15 15 15 19 M16 6 a2.5 2.5 0 1 0 0.01 0 M16 13 C19 13 21 15 21 18',
  robot: 'M5 8 H19 V19 H5 Z M12 8 V4 M9 13 h0.01 M15 13 h0.01 M9 16 H15 M3 12 V15 M21 12 V15',
  code: 'M8 7 L3 12 L8 17 M16 7 L21 12 L16 17 M13 5 L11 19',
  chat: 'M4 5 H20 V15 H10 L5 19 V15 H4 Z',
  post: 'M4 4 H20 V20 H4 Z M4 15 L9 10 L13 14 L16 11 L20 15 M15 8 h0.01',
  invoice: 'M6 3 H18 V21 L15 19 L12 21 L9 19 L6 21 Z M9 8 H15 M9 12 H15 M9 16 H13',
  whatsapp: 'M12 3 a9 9 0 1 1 -7.8 13.5 L3 21 L7.6 19.8 A9 9 0 0 0 12 3 M9 8.5 C9 12 11.5 15 15 15.5',
  gear: 'M12 9 a3 3 0 1 0 0.01 0 M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9',
  link: 'M10 14 L14 10 M8 12 L5.5 14.5 a3 3 0 0 0 4 4 L12 16 M16 12 L18.5 9.5 a3 3 0 0 0 -4 -4 L12 8',
  brain: 'M9 4 a3 3 0 0 0 -3 3 a3 3 0 0 0 -2 5 a3 3 0 0 0 2 5 a3 3 0 0 0 3 3 a3 3 0 0 0 3 -2 V6 a3 3 0 0 0 -3 -2 M15 4 a3 3 0 0 1 3 3 a3 3 0 0 1 2 5 a3 3 0 0 1 -2 5 a3 3 0 0 1 -3 3 a3 3 0 0 1 -3 -2',
  check: 'M4 12.5 L9.5 18 L20 6',
  cross: 'M5 5 L19 19 M19 5 L5 19',
  money: 'M3 6 H21 V18 H3 Z M12 9 a3 3 0 1 0 0.01 0 M6 9 h0.01 M18 15 h0.01',
  chart: 'M4 20 V4 M4 20 H20 M8 16 V11 M12 16 V7 M16 16 V13',
  globe: 'M12 3 a9 9 0 1 0 0.01 0 M3 12 H21 M12 3 C9 6 9 18 12 21 M12 3 C15 6 15 18 12 21',
  lock: 'M6 11 H18 V20 H6 Z M8.5 11 V8 a3.5 3.5 0 0 1 7 0 V11',
  bolt: 'M13 2 L5 13 H11 L10 22 L19 10 H13 Z',
  doc: 'M6 3 H14 L18 7 V21 H6 Z M14 3 V7 H18 M9 12 H15 M9 16 H15',
  phone: 'M7 2 H17 V22 H7 Z M11 18 H13',
  factory: 'M3 20 V10 L9 13 V10 L15 13 V6 H20 V20 Z M7 17 h0.01 M12 17 h0.01 M17 17 h0.01',
  home: 'M3 11 L12 4 L21 11 M6 9 V20 H18 V9',
};

export const Icon: React.FC<{name?: IconName; size: number; color: string; stroke?: number}> = ({name, size, color, stroke = 1.8}) =>
  name && P[name] ? (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{display: 'block', overflow: 'visible'}}>
      <path d={P[name]} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : null;

export const iconPath = (name: IconName) => P[name];
