import React, {useEffect, useState} from 'react';
import {continueRender, delayRender, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {geoInterpolate, geoMercator, geoOrthographic, geoPath, type GeoProjection} from 'd3-geo';
import {colors, toneColor} from '../theme';
import {Region, useBox, useUnit} from '../components/Box';
import {iconPath} from '../components/Icon';
import type {LonLat, MapSpec} from '../types';

// Borders come only from the dataset: Natural Earth 1:10m admin-0, India point-of-view
// edition (public domain), simplified for video. Never hand-drawn.
type Feature = {type: 'Feature'; properties: {iso3: string; name: string}; geometry: any};
let cache: Feature[] | null = null;
let pending: Promise<Feature[]> | null = null;
const loadCountries = () => {
  if (cache) return Promise.resolve(cache);
  if (!pending)
    pending = fetch(staticFile('maps/countries_ind.json'))
      .then((r) => r.json())
      .then((j) => (cache = j.features as Feature[]));
  return pending;
};

const useCountries = () => {
  const [data, setData] = useState<Feature[] | null>(cache);
  const [handle] = useState(() => (cache ? null : delayRender('Loading map data')));
  useEffect(() => {
    if (cache) return;
    loadCountries().then((d) => {
      setData(d);
      if (handle !== null) continueRender(handle);
    });
  }, [handle]);
  return data;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const MapScene: React.FC<{spec: MapSpec}> = ({spec}) => {
  const countries = useCountries();
  const b = useBox();
  const u = useUnit();
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  if (!countries) return null;

  const from = spec.from || spec.focus;
  const moveEnd = Math.min(durationInFrames * 0.45, 75);
  const t = interpolate(f, [0, moveEnd], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const center: LonLat = [lerp(from.center[0], spec.focus.center[0], t), lerp(from.center[1], spec.focus.center[1], t)];
  const zoom = Math.exp(lerp(Math.log(from.zoom), Math.log(spec.focus.zoom), t));

  const W = b.w;
  const H = b.h;
  const mercator = geoMercator()
    .center(center)
    .scale((W / (2 * Math.PI)) * zoom)
    .translate([W / 2, H / 2]);

  const globeMode = spec.projection === 'globe-to-flat';
  // Globe phase: rotate the Earth to the focus, then cross-fade to the flat map.
  const globeFade = globeMode ? interpolate(f, [moveEnd * 0.7, moveEnd], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const globe = geoOrthographic()
    .rotate([-center[0], -center[1]])
    .scale(Math.min(W, H) * 0.42 * Math.min(1.6, 1 + t * 0.6))
    .translate([W / 2, H / 2])
    .clipAngle(90);

  const layer = (proj: GeoProjection, opacity: number, isGlobe: boolean) => {
    const path = geoPath(proj);
    const hl = new Map((spec.highlights || []).map((h) => [h.iso3, h]));
    const dim = new Set(spec.dim || []);
    return (
      <g opacity={opacity}>
        {isGlobe ? <path d={path({type: 'Sphere'}) || ''} fill={colors.bg2} stroke={colors.border} strokeWidth={2} /> : null}
        {countries.map((c) => {
          const h = hl.get(c.properties.iso3);
          const d = path(c as any);
          if (!d) return null;
          const ha = h ? interpolate(f, [(h.delay || 0) + 6, (h.delay || 0) + 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
          const fill = h ? toneColor(h.tone || 'accent') : colors.land;
          return (
            <g key={c.properties.iso3 + c.properties.name}>
              {h && h.wall && !isGlobe
                ? [6, 4, 2].map((dy) => <path key={dy} d={d} fill="#5c1517" opacity={ha} transform={`translate(0 ${dy * u * ha})`} />)
                : null}
              <path d={d} fill={colors.land} stroke={colors.border} strokeWidth={1.1} opacity={dim.has(c.properties.iso3) ? 0.35 : 1} />
              {h ? <path d={d} fill={fill} fillOpacity={0.85 * ha} stroke={fill} strokeWidth={2 * ha} style={{filter: `drop-shadow(0 0 ${10 * ha}px ${fill})`}} /> : null}
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <Region style={{borderRadius: 18 * u}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        {globeMode && globeFade > 0 ? layer(globe, globeFade, true) : null}
        {layer(mercator, globeMode ? 1 - globeFade : 1, false)}
        {(1 - globeFade) > 0.5 ? (
          <>
            {(spec.routes || []).map((r, i) => (
              <Route key={i} proj={mercator} r={r} u={u} />
            ))}
            {(spec.markers || []).map((m, i) => {
              const p = mercator(m.at);
              if (!p) return null;
              const e = spring({frame: f - (m.delay || 0) - 8, fps, config: {damping: 10}});
              const c = toneColor(m.tone || 'accent');
              const ring = ((f - (m.delay || 0)) % 60) / 60;
              return (
                <g key={i} transform={`translate(${p[0]} ${p[1]})`} opacity={Math.min(1, e)}>
                  <circle r={(14 + 40 * ring) * u} fill="none" stroke={c} strokeWidth={3 * u} opacity={1 - ring} />
                  <circle r={12 * u * e} fill={c} stroke={colors.bg} strokeWidth={3 * u} />
                  <text x={20 * u} y={-18 * u} fill={colors.text} fontSize={30 * u} fontWeight={700} style={{paintOrder: 'stroke', stroke: colors.bg, strokeWidth: 6 * u}}>
                    {m.label}
                  </text>
                </g>
              );
            })}
            {(spec.labels || []).map((l, i) => {
              const p = mercator(l.at);
              if (!p) return null;
              const o = interpolate(f, [10, 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              return (
                <text key={i} x={p[0]} y={p[1]} textAnchor="middle" fill={colors.sub} fontSize={26 * u} fontWeight={600} letterSpacing={3} opacity={o} style={{paintOrder: 'stroke', stroke: colors.bg, strokeWidth: 5 * u}}>
                  {l.text.toUpperCase()}
                </text>
              );
            })}
          </>
        ) : null}
      </svg>
    </Region>
  );
};

type RouteSpec = NonNullable<MapSpec['routes']>[number];

const Route: React.FC<{proj: GeoProjection; r: RouteSpec; u: number}> = ({proj, r, u}) => {
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const start = (r.delay ?? Math.min(durationInFrames * 0.35, 50)) as number;
  const len = r.duration ?? Math.max(30, durationInFrames * 0.35);
  const p = interpolate(f, [start, start + len], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad)});
  if (p <= 0) return null;
  // Great-circle segments sampled densely, then projected.
  const pts: [number, number][] = [];
  for (let i = 0; i < r.points.length - 1; i++) {
    const g = geoInterpolate(r.points[i], r.points[i + 1]);
    for (let k = 0; k <= 24; k++) {
      const q = proj(g(k / 24) as [number, number]);
      if (q) pts.push(q as [number, number]);
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = cum[cum.length - 1] * p;
  const drawn: [number, number][] = [pts[0]];
  let head = pts[0];
  let angle = 0;
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] <= target) {
      drawn.push(pts[i]);
      head = pts[i];
      angle = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    } else {
      const k = (target - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      head = [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)];
      angle = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
      drawn.push(head);
      break;
    }
  }
  const c = toneColor(r.tone || 'accent');
  const d = 'M' + drawn.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L');
  const flip = Math.abs(angle) > Math.PI / 2;
  return (
    <g>
      <path d={d} fill="none" stroke={c} strokeWidth={10 * u} opacity={0.18} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={c} strokeWidth={4.5 * u} strokeDasharray={r.dashed ? `${14 * u} ${10 * u}` : undefined} strokeLinecap="round" strokeLinejoin="round" />
      {r.vehicle ? (
        <g transform={`translate(${head[0]} ${head[1]}) rotate(${(angle * 180) / Math.PI}) ${flip ? 'scale(1 -1)' : ''}`}>
          <circle r={26 * u} fill={colors.bg} stroke={c} strokeWidth={3 * u} />
          <g transform={`translate(${-14 * u} ${-14 * u}) scale(${(28 * u) / 24})`}>
            <path d={iconPath(r.vehicle)} fill="none" stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      ) : null}
      {r.label && p > 0.98 ? (
        <text x={head[0] + 34 * u} y={head[1] + 10 * u} fill={c} fontSize={28 * u} fontWeight={700} style={{paintOrder: 'stroke', stroke: colors.bg, strokeWidth: 6 * u}}>
          {r.label}
        </text>
      ) : null}
    </g>
  );
};
