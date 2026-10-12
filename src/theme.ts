import {loadFont} from '@remotion/google-fonts/Inter';
import {loadFont as loadDisplay} from '@remotion/google-fonts/Poppins';
import type {Format, Tone} from './types';

// Production rules: deep navy ground, white primary text, orange/yellow emphasis,
// other colours only where they carry meaning.
export const colors = {
  bg: '#0B1726',
  bg2: '#0F1E33',
  panel: '#13243B',
  land: '#16263A',
  border: '#2E4562',
  text: '#FFFFFF',
  sub: '#B8C4D6',
  muted: '#5B6B82',
  orange: '#FF8A1F',
  yellow: '#F2C94C',
  green: '#3BB273',
  red: '#E5383B',
  blue: '#5B7DA6',
};

export const toneColor = (t: Tone = 'accent') =>
  ({neutral: colors.text, accent: colors.orange, warn: colors.yellow, good: colors.green, bad: colors.red, muted: colors.muted}[t]);

const inter = loadFont('normal', {weights: ['400', '500', '600', '700', '800'], subsets: ['latin']});
const poppins = loadDisplay('normal', {weights: ['600', '700', '800'], subsets: ['latin']});
export const fonts = {body: inter.fontFamily, display: poppins.fontFamily};

export const FPS = 30;
export const size = (f: Format) => (f === '9:16' ? {width: 1080, height: 1920} : {width: 1920, height: 1080});

// Regions. The tracker owns its box; content never enters it (boundary rule).
export const layout = (f: Format) =>
  f === '9:16'
    ? {canvas: {x: 60, y: 300, w: 960, h: 1340}, tracker: {x: 60, y: 90, w: 960, h: 170}}
    : {canvas: {x: 70, y: 70, w: 1390, h: 940}, tracker: {x: 1500, y: 70, w: 350, h: 940}};
