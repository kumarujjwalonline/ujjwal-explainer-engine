import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {colors, fonts} from '../theme';
import type {Format, Job, Objective} from '../types';
import type {BoxRect} from './Box';

// Right-side learning-progress tracker (production rule 7).
// Completed = green with a check, current = orange with a subtle pulse, upcoming = muted.
// Percentage counts completed objectives, never elapsed time. Everything is drawn
// inside its own box with overflow hidden, so nothing crosses its border.

export type TrackerState = {current?: string; done: string[]; doneAtEnd: string[]};

const leaves = (os: Objective[]): Objective[] => os.flatMap((o) => (o.children && o.children.length ? leaves(o.children) : [o]));

const expand = (ids: string[], os: Objective[]) => {
  // Completing a parent completes its children, and a parent is complete when all its children are.
  const set = new Set(ids);
  const walk = (o: Objective): boolean => {
    if (o.children && o.children.length) {
      if (set.has(o.id)) o.children.forEach((c) => markAll(c));
      const all = o.children.map(walk).every(Boolean);
      if (all) set.add(o.id);
      return set.has(o.id);
    }
    return set.has(o.id);
  };
  const markAll = (o: Objective) => {
    set.add(o.id);
    o.children?.forEach(markAll);
  };
  os.forEach(walk);
  os.forEach(walk);
  return set;
};

export const trackerStates = (job: Job) => {
  const out: Record<string, TrackerState> = {};
  const acc: string[] = [];
  for (const s of job.scenes) {
    const before = [...acc];
    acc.push(...(s.completes || []));
    out[s.id] = {current: s.objective, done: before, doneAtEnd: [...acc]};
  }
  return out;
};

type Props = {
  title?: string;
  objectives: Objective[];
  state?: TrackerState;
  box: BoxRect;
  format: Format;
  compact: boolean;
  durationInFrames: number;
};

export const Tracker: React.FC<Props> = (p) => {
  const f = useCurrentFrame();
  const st = p.state || {done: [], doneAtEnd: []};
  // The scene's objectives tick over in the last 12 frames of the scene.
  const flip = f >= p.durationInFrames - 12;
  const doneSet = expand(flip ? st.doneAtEnd : st.done, p.objectives);
  const prevSet = expand(st.done, p.objectives);
  const nextSet = expand(st.doneAtEnd, p.objectives);
  const all = leaves(p.objectives);
  const pct = (s: Set<string>) => Math.round((all.filter((l) => s.has(l.id)).length / Math.max(1, all.length)) * 100);
  const pctShown = Math.round(
    interpolate(f, [p.durationInFrames - 12, p.durationInFrames - 2], [pct(prevSet), pct(nextSet)], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(f / 9));

  const parentOf = (id?: string) => p.objectives.find((o) => o.id === id || o.children?.some((c) => c.id === id));
  const currentParent = parentOf(st.current);

  if (p.format === '9:16') {
    const cur = all.find((l) => l.id === st.current) || currentParent;
    return (
      <div style={{position: 'absolute', left: p.box.x, top: p.box.y, width: p.box.w, height: p.box.h, overflow: 'hidden', boxSizing: 'border-box', border: `2px solid ${colors.border}`, borderRadius: 18, background: 'rgba(19,36,59,0.92)', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
          <div style={{fontSize: 22, letterSpacing: 2, color: colors.sub, fontWeight: 600}}>{(p.title || 'Lesson progress').toUpperCase()}</div>
          <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: 40, color: colors.green}}>{pctShown}%</div>
        </div>
        <div style={{height: 10, borderRadius: 5, background: colors.border, overflow: 'hidden'}}>
          <div style={{width: `${pctShown}%`, height: '100%', background: colors.green}} />
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 12, fontSize: 28, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
          <span style={{width: 14, height: 14, borderRadius: 7, background: colors.orange, opacity: pulse, flex: 'none'}} />
          <span style={{color: colors.orange, overflow: 'hidden', textOverflow: 'ellipsis'}}>{cur ? cur.label : 'Getting started'}</span>
        </div>
      </div>
    );
  }

  const totalRows = p.objectives.reduce((a, o) => a + 1 + (o.children?.length || 0), 0);
  const showAllChildren = !p.compact && totalRows <= 14;

  return (
    <div style={{position: 'absolute', left: p.box.x, top: p.box.y, width: p.box.w, height: p.box.h, overflow: 'hidden', boxSizing: 'border-box', border: `2px solid ${colors.border}`, borderRadius: 18, background: 'rgba(19,36,59,0.92)', padding: 26, display: 'flex', flexDirection: 'column', gap: 18}}>
      <div style={{fontSize: 18, letterSpacing: 2.5, color: colors.sub, fontWeight: 600}}>{(p.title || 'Lesson progress').toUpperCase()}</div>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
        <div style={{fontFamily: fonts.display, fontWeight: 800, fontSize: p.compact ? 46 : 64, color: colors.green, lineHeight: 1}}>{pctShown}%</div>
        <div style={{fontSize: 18, color: colors.sub}}>complete</div>
      </div>
      <div style={{height: 10, borderRadius: 5, background: colors.border, overflow: 'hidden', flex: 'none'}}>
        <div style={{width: `${pctShown}%`, height: '100%', background: colors.green}} />
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: p.compact ? 8 : 12, marginTop: 6, overflow: 'hidden'}}>
        {p.objectives.map((o) => {
          const open = showAllChildren || o === currentParent;
          return (
            <div key={o.id} style={{display: 'flex', flexDirection: 'column', gap: 8}}>
              <Row label={o.label} state={rowState(o.id, doneSet, st.current, o === currentParent)} pulse={pulse} level={0} compact={p.compact} />
              {open && o.children?.map((c) => (
                <Row key={c.id} label={c.label} state={rowState(c.id, doneSet, st.current, false)} pulse={pulse} level={1} compact={p.compact} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

type RowState = 'done' | 'current' | 'upcoming';
const rowState = (id: string, done: Set<string>, current?: string, isCurrentParent?: boolean): RowState =>
  done.has(id) ? 'done' : id === current || isCurrentParent ? 'current' : 'upcoming';

const Row: React.FC<{label: string; state: RowState; pulse: number; level: number; compact: boolean}> = ({label, state, pulse, level, compact}) => {
  const c = state === 'done' ? colors.green : state === 'current' ? colors.orange : colors.muted;
  const size = level === 0 ? (compact ? 19 : 22) : compact ? 16 : 18;
  return (
    <div style={{display: 'flex', alignItems: 'flex-start', gap: 12, paddingLeft: level * 26}}>
      <div style={{width: 22, height: 22, flex: 'none', marginTop: 2, borderRadius: 6, border: `2px solid ${c}`, background: state === 'done' ? colors.green : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: state === 'current' ? pulse : 1, boxShadow: state === 'current' ? `0 0 ${12 * pulse}px ${colors.orange}` : 'none'}}>
        {state === 'done' ? (
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7.5 L5.5 11 L12 3.5" stroke={colors.bg} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : null}
      </div>
      <div style={{fontSize: size, lineHeight: 1.3, fontWeight: level === 0 ? 600 : 500, color: state === 'upcoming' ? colors.muted : state === 'current' ? colors.orange : colors.text, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
        {label}
      </div>
    </div>
  );
};
