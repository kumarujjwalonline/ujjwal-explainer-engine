// Job schema: what n8n's AI writes for each video. Kept as plain data so a
// script can never break the build. See README.md for field-by-field docs.

export type Format = '16:9' | '9:16';
export type LonLat = [number, number];

export type Objective = {id: string; label: string; children?: Objective[]};

export type Tone = 'neutral' | 'accent' | 'warn' | 'good' | 'bad' | 'muted';

export type Visual =
  | {type: 'title'; title: string; subtitle?: string; kicker?: string}
  | {type: 'question'; text: string; highlight?: string[]}
  | {type: 'points'; heading?: string; items: string[]; highlight?: string[]}
  | {type: 'stat'; value: number; from?: number; prefix?: string; suffix?: string; decimals?: number; label: string; source?: string}
  | {type: 'timeline'; heading?: string; nodes: {date: string; label: string; tone?: Tone}[]}
  | {type: 'flow'; heading?: string; steps: {label: string; sub?: string; icon?: IconName}[]; layout?: 'row' | 'cycle'}
  | {type: 'compare'; left: {heading: string; items: string[]; tone?: Tone}; right: {heading: string; items: string[]; tone?: Tone}}
  | {type: 'formula'; heading?: string; lines: {text: string; note?: string; final?: boolean}[]}
  | {type: 'news'; headline: string; outlet: string; date: string}
  | {type: 'image'; src: string; credit?: string; caption?: string}
  | {type: 'map'; map: MapSpec}
  | {type: 'hub'; center: {label: string; icon?: IconName}; spokes: {label: string; icon?: IconName}[]};

export type IconName =
  | 'ship' | 'truck' | 'train' | 'plane' | 'person' | 'people' | 'robot' | 'code' | 'chat'
  | 'post' | 'invoice' | 'whatsapp' | 'gear' | 'link' | 'brain' | 'check' | 'cross' | 'money'
  | 'chart' | 'globe' | 'lock' | 'bolt' | 'doc' | 'phone' | 'factory' | 'home';

export type MapSpec = {
  projection?: 'flat' | 'globe-to-flat';
  focus: {center: LonLat; zoom: number};
  from?: {center: LonLat; zoom: number};
  highlights?: {iso3: string; tone?: Tone; delay?: number; wall?: boolean}[];
  dim?: string[];
  routes?: {points: LonLat[]; tone?: Tone; dashed?: boolean; vehicle?: 'ship' | 'truck' | 'train' | 'plane'; delay?: number; duration?: number; label?: string}[];
  markers?: {at: LonLat; label: string; tone?: Tone; delay?: number}[];
  labels?: {at: LonLat; text: string}[];
};

export type Sfx = 'whoosh' | 'ping' | 'tick' | 'hit' | 'pop';

export type Scene = {
  id: string;
  narration: string;
  durationSec: number; // filled from the real audio by scripts/voice.mjs
  audio?: string; // path under public/, filled by voice.mjs
  objective?: string; // tracker item being taught now
  completes?: string[]; // tracker items finished when this scene ends
  onScreen?: string; // short English caption, optional
  sfx?: Sfx;
  compact?: boolean; // compact tracker for heavy numerical scenes
  visual: Visual;
};

export type Job = {
  id: string;
  title: string;
  format?: Format;
  tracker: {title?: string; objectives: Objective[]};
  scenes: Scene[];
  shorts?: {id: string; hook: string; scenes: string[]}[];
  thumbnail?: {headline: string; sub?: string; scene?: string};
};

export type RenderProps = {job: Job; format: Format; sceneIds?: string[]; hook?: string};
