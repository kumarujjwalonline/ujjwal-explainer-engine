import React, {useEffect, useMemo, useState} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {continueRender, delayRender, getInputProps, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, useBox, useUnit} from '../components/Box';

// Production rule 14: 3D human body walkthrough for health and fitness topics.
// Real anatomical meshes (BodyParts3D): see-through skin, skeleton, muscles, organs and vessels.
// The camera flies to each step's organ in turn while the narration explains it, and
// glowing particles travel the route in "flow" (e.g. fat -> blood -> lungs -> breath out).

export type Organ =
  | 'brain' | 'nose' | 'lungs' | 'heart' | 'liver' | 'stomach' | 'intestines' | 'kidneys'
  | 'bladder' | 'fat' | 'muscle' | 'blood' | 'skin' | 'pancreas' | 'bones';

export type BodySpec = {
  focus?: Organ;
  steps?: {organ: Organ; label: string}[];
  flow?: {path: Organ[]; particle?: 'CO2' | 'O2' | 'fat' | 'water' | 'glucose' | 'blood' | 'signal'; label?: string};
  caption?: string;
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
// Internal 3D resolution: GitHub has no GPU, so WebGL runs in software and cost grows with pixels.
export const THREE_DPR = 0.6;
// Benchmark overrides (job.bench = {dpr, aa}) so render settings can be compared on GitHub.
const bench = () => ((getInputProps() as {job?: {bench?: {dpr?: number; aa?: boolean}}}).job?.bench || {});
export const threeDpr = () => bench().dpr ?? THREE_DPR;
export const threeAA = () => bench().aa ?? true;

// Real anatomy: meshes from BodyParts3D (DBCLS, CC BY 4.0), built by scripts/build_anatomy.py into
// public/anatomy/*.glb. Metres, Y up, feet at y = 0, the person faces +z (towards the camera).
const GROUPS = ['skin', 'skeleton', 'muscles', 'brain', 'nose', 'airways', 'lungs', 'heart', 'liver', 'gallbladder', 'stomach', 'esophagus', 'pancreas', 'intestines', 'kidneys', 'bladder', 'diaphragm', 'arteries', 'veins'] as const;
type Group = (typeof GROUPS)[number];
type Anatomy = Partial<Record<Group, THREE.BufferGeometry>>;
let anatomyPromise: Promise<Anatomy> | null = null;
const loadAnatomy = () => {
  if (!anatomyPromise) {
    const loader = new GLTFLoader();
    anatomyPromise = Promise.all(
      GROUPS.map((g) =>
        loader
          .loadAsync(staticFile(`anatomy/${g}.glb`))
          .then((gltf) => {
            let geo: THREE.BufferGeometry | undefined;
            gltf.scene.traverse((o) => {
              if (!geo && (o as THREE.Mesh).isMesh) geo = (o as THREE.Mesh).geometry;
            });
            if (geo) {
              geo.computeVertexNormals();
              geo.computeBoundingBox();
            }
            return [g, geo] as const;
          })
          .catch(() => [g, undefined] as const),
      ),
    ).then((pairs) => Object.fromEntries(pairs.filter(([, geo]) => geo)) as Anatomy);
  }
  return anatomyPromise;
};
const useAnatomy = () => {
  const [handle] = useState(() => delayRender('Loading anatomy models', {timeoutInMilliseconds: 120000}));
  const [a, setA] = useState<Anatomy | null>(null);
  useEffect(() => {
    loadAnatomy().then((r) => {
      setA(r);
      continueRender(handle);
    });
  }, [handle]);
  return a;
};

const PARTICLE: Record<string, string> = {CO2: '#D9E2EC', O2: '#5BC0FF', fat: '#F2C94C', water: '#4FC3F7', glucose: '#FF8A1F', blood: '#E5383B', signal: '#B388FF'};

// Which meshes each organ in the script lights up.
const ORGAN_GROUPS: Record<Organ, Group[]> = {
  brain: ['brain'], nose: ['nose', 'airways'], lungs: ['lungs', 'airways'], heart: ['heart'], liver: ['liver', 'gallbladder'],
  stomach: ['stomach', 'esophagus'], pancreas: ['pancreas'], intestines: ['intestines'], kidneys: ['kidneys'], bladder: ['bladder'],
  fat: ['skin'], muscle: ['muscles'], blood: ['arteries', 'veins', 'heart'], skin: ['skin'], bones: ['skeleton'],
};
// Natural tissue colours.
const LOOK: Record<Group, {color: string; base: number}> = {
  skin: {color: '#9CC8F0', base: 0.1},
  skeleton: {color: '#EDE3CF', base: 0.5},
  muscles: {color: '#B8433A', base: 0.16},
  brain: {color: '#E9B7BE', base: 0.95},
  nose: {color: '#E7B9A3', base: 0.6},
  airways: {color: '#F3C6C0', base: 0.85},
  lungs: {color: '#E58C8F', base: 0.62},
  heart: {color: '#B3202E', base: 0.97},
  liver: {color: '#7A2A22', base: 0.95},
  gallbladder: {color: '#5E8C3A', base: 0.95},
  stomach: {color: '#D98C7A', base: 0.95},
  esophagus: {color: '#D9978A', base: 0.9},
  pancreas: {color: '#E8C083', base: 0.95},
  intestines: {color: '#E3A08F', base: 0.92},
  kidneys: {color: '#8E2D36', base: 0.95},
  bladder: {color: '#E9C46A', base: 0.9},
  diaphragm: {color: '#B5554A', base: 0.35},
  arteries: {color: '#D62828', base: 0.85},
  veins: {color: '#3A5BA0', base: 0.75},
};
const center = (a: Anatomy, gs: Group[]) => {
  const box = new THREE.Box3();
  gs.forEach((g) => a[g]?.boundingBox && box.union(a[g]!.boundingBox!));
  return box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
};
// Camera / route anchor for each organ, worked out from the real meshes.
const anchors = (a: Anatomy): Record<Organ, THREE.Vector3> => {
  const H = a.skin?.boundingBox ? a.skin.boundingBox.max.y : 1.7;
  const c = (gs: Group[], fallback: THREE.Vector3) => center(a, gs) || fallback;
  const heart = c(['heart'], V(0.02, H * 0.72, 0.03));
  const front = a.skin?.boundingBox ? a.skin.boundingBox.max.z : 0.15;
  return {
    brain: c(['brain'], V(0, H * 0.93, 0)),
    nose: c(['nose'], V(0, H * 0.9, 0.09)),
    lungs: c(['lungs'], V(0, H * 0.74, 0)),
    heart,
    liver: c(['liver'], V(-0.08, H * 0.64, 0.03)),
    stomach: c(['stomach'], V(0.06, H * 0.63, 0.04)),
    pancreas: c(['pancreas'], V(0.02, H * 0.6, 0)),
    intestines: c(['intestines'], V(0, H * 0.54, 0.04)),
    kidneys: c(['kidneys'], V(0, H * 0.6, -0.05)),
    bladder: c(['bladder'], V(0, H * 0.48, 0.03)),
    fat: V(0, H * 0.57, front * 0.75),
    muscle: V(-0.1, H * 0.38, 0.01),
    blood: heart,
    skin: V(-0.15, H * 0.62, front * 0.6),
    bones: c(['skeleton'], V(0, H * 0.75, 0)),
  };
};

const Part: React.FC<{geo: THREE.BufferGeometry; group: Group; state: 'focus' | 'dim' | 'normal'; pulse: number}> = ({geo, group, state, pulse}) => {
  const look = LOOK[group];
  const shell = group === 'skin';
  const opacity = state === 'focus' ? (shell ? 0.35 : 1) : state === 'dim' ? look.base * (shell ? 0.9 : 0.3) : look.base;
  return (
    <mesh geometry={geo} renderOrder={shell ? 10 : group === 'muscles' ? 5 : 0}>
      <meshStandardMaterial
        color={state === 'focus' && shell ? '#F2C94C' : look.color}
        emissive={state === 'focus' ? colors.orange : shell ? '#2A5A8A' : look.color}
        emissiveIntensity={state === 'focus' ? 0.25 + pulse * 0.6 : shell ? 0.35 : 0.08}
        roughness={shell ? 0.25 : 0.55}
        metalness={0.05}
        transparent={opacity < 0.99}
        opacity={opacity}
        depthWrite={opacity > 0.6}
        side={shell ? THREE.FrontSide : THREE.DoubleSide}
      />
    </mesh>
  );
};

const Anatomy3D: React.FC<{a: Anatomy; active?: Organ; pulse: number}> = ({a, active, pulse}) => {
  const lit = new Set<Group>(active ? ORGAN_GROUPS[active] : []);
  return (
    <group>
      {GROUPS.map((g) => {
        const geo = a[g];
        if (!geo) return null;
        // Faint full-body layers cost a lot to draw in software and add little when dim: draw them only when they are the subject.
        if ((g === 'muscles' || g === 'veins') && !lit.has(g)) return null;
        const state = lit.has(g) ? 'focus' : active ? 'dim' : 'normal';
        return <Part key={g} geo={geo} group={g} state={state} pulse={pulse} />;
      })}
    </group>
  );
};

// Route through the body; "blood" passes through the main vessels via the heart.
const routePoints = (path: Organ[], POS: Record<Organ, THREE.Vector3>) => {
  const pts: THREE.Vector3[] = [];
  path.forEach((o, i) => {
    if (o === 'blood') {
      const prev = path[i - 1] ? POS[path[i - 1]] : POS.heart;
      pts.push(V((prev.x + POS.heart.x) / 2 + 0.03, (prev.y + POS.heart.y) / 2, POS.heart.z), POS.heart.clone());
    } else if (o === 'lungs') {
      // into the right lung, then up the windpipe
      pts.push(V(POS.lungs.x + 0.07, POS.lungs.y - 0.02, POS.lungs.z), V(POS.heart.x * 0, POS.lungs.y + 0.16, POS.lungs.z + 0.01));
    } else pts.push(POS[o].clone());
  });
  if (path[path.length - 1] === 'nose') pts.push(POS.nose.clone().add(V(0, -0.01, 0.25)), POS.nose.clone().add(V(0, 0, 0.6))); // breathed out
  if (pts.length === 1) pts.push(pts[0].clone().add(V(0, 0.1, 0.1)));
  return pts;
};

const Flow: React.FC<{path: Organ[]; pos: Record<Organ, THREE.Vector3>; color: string; t: number; show: number}> = ({path, pos, color, t, show}) => {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(routePoints(path, pos), false, 'catmullrom', 0.3), [path.join(','), pos]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 100, 0.005, 6, false), [curve]);
  const N = 22;
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color={color} transparent opacity={0.45 * show} depthTest={false} />
      </mesh>
      {Array.from({length: N}, (_, i) => {
        const u = (t * 0.35 + i / N) % 1;
        if (u > show) return null;
        const p = curve.getPointAt(u);
        const fadeOut = path[path.length - 1] === 'nose' ? interpolate(u, [0.82, 1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
        return (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.011, 8, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} transparent opacity={fadeOut} depthTest={false} />
          </mesh>
        );
      })}
    </group>
  );
};

const Camera: React.FC<{target: THREE.Vector3; dist: number; orbit: number; aspect: number}> = ({target, dist, orbit, aspect}) => {
  const {camera} = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = 32;
  cam.aspect = aspect;
  cam.position.set(target.x + Math.sin(orbit) * dist, target.y + dist * 0.08, target.z + Math.cos(orbit) * dist);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  return null;
};

export const Body3D: React.FC<BodySpec> = ({focus, steps = [], flow, caption}) => {
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const b = useBox();
  const u = useUnit();
  const portrait = b.w < b.h;
  const a = useAnatomy();
  const POS = useMemo(() => (a ? anchors(a) : null), [a]);
  const n = steps.length;
  // Steps share the first 85 % of the scene; the camera eases from one organ to the next.
  const intro0 = Math.round(durationInFrames * 0.18); // establishing shot of the whole body
  const span = (durationInFrames * 0.85 - intro0) / Math.max(1, n);
  const idx = n ? (f < intro0 ? 0 : Math.min(n - 1, Math.floor((f - intro0) / span))) : -1;
  const active: Organ | undefined = n ? (f < intro0 ? undefined : steps[idx].organ) : focus;
  const H = a?.skin?.boundingBox?.max.y || 1.7;
  const whole = {t: V(0, H * 0.5, 0), d: H * 2.15};
  const far: Partial<Record<Organ, number>> = {muscle: 1.7, bones: 2.0, blood: 2.6, skin: 1.6, intestines: 1.15, lungs: 1.25, fat: 1.2};
  const shot = (o?: Organ) => (o && POS ? {t: POS[o], d: far[o] || 0.95} : whole);
  const intro = interpolate(f, [0, Math.min(40, durationInFrames * 0.25)], [0, 1], {extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const prev = idx > 0 ? shot(steps[idx - 1].organ) : whole;
  const cur = shot(active);
  const k = n ? interpolate(f - intro0 - idx * span, [0, Math.min(24, span * 0.6)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)}) : intro;
  const from = idx === 0 || !n ? whole : prev;
  const target = from.t.clone().lerp(cur.t, k);
  const dist = from.d + (cur.d - from.d) * k;
  const orbit = interpolate(f, [0, durationInFrames], [-0.35, 0.35]);
  const pulse = 0.35 + 0.35 * Math.abs(Math.sin(f / 8));
  const showFlow = flow ? interpolate(f, [8, durationInFrames * 0.5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const panelW = portrait ? b.w : b.w * 0.34;
  return (
    <Region>
      <ThreeCanvas width={b.w} height={b.h} dpr={threeDpr()} style={{position: 'absolute', inset: 0}} gl={{antialias: threeAA(), preserveDrawingBuffer: true}}>
        <Camera target={portrait ? target : target.clone().add(V(-0.12 * dist, 0, 0))} dist={dist} orbit={orbit} aspect={b.w / b.h} />
        <ambientLight intensity={0.45} />
        <hemisphereLight args={['#DDEBFF', '#2B1B12', 0.6]} />
        <directionalLight position={[1.5, 3, 3]} intensity={1.3} />
        <directionalLight position={[-2, 1.5, -2]} intensity={0.7} color="#8EC5FF" />
        <group rotation={[0, interpolate(f, [0, durationInFrames], [-0.12, 0.12]), 0]}>
          {a ? <Anatomy3D a={a} active={active} pulse={pulse} /> : null}
          {flow && POS ? <Flow path={flow.path} pos={POS} color={PARTICLE[flow.particle || 'CO2'] || '#D9E2EC'} t={f / fps} show={showFlow} /> : null}
        </group>
      </ThreeCanvas>
      {n ? (
        <div style={portrait ? {position: 'absolute', left: 0, right: 0, bottom: 0, padding: 28 * u, background: 'linear-gradient(to top, rgba(11,23,38,0.95), rgba(11,23,38,0))'} : {position: 'absolute', left: 0, top: 0, bottom: 0, width: panelW, padding: `${40 * u}px ${30 * u}px`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 * u, background: 'linear-gradient(to right, rgba(11,23,38,0.92), rgba(11,23,38,0))'}}>
          {steps.map((s, i) => {
            const state = f < intro0 ? 'next' : i < idx ? 'done' : i === idx ? 'now' : 'next';
            const c = state === 'now' ? colors.orange : state === 'done' ? colors.green : colors.muted;
            if (portrait && i !== idx) return null;
            return (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 14 * u, opacity: state === 'next' ? 0.55 : 1}}>
                <div style={{width: 34 * u, height: 34 * u, borderRadius: 17 * u, border: `2px solid ${c}`, background: state === 'done' ? colors.green : 'transparent', color: state === 'now' ? colors.orange : colors.bg, fontWeight: 800, fontSize: 18 * u, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'}}>{i + 1}</div>
                <div style={{fontFamily: fonts.display, fontWeight: state === 'now' ? 700 : 600, fontSize: (state === 'now' ? 30 : 24) * u, color: state === 'now' ? colors.text : colors.sub, lineHeight: 1.2}}>{s.label}</div>
              </div>
            );
          })}
        </div>
      ) : null}
      {flow?.label || caption ? (
        <div style={{position: 'absolute', right: 30 * u, bottom: 26 * u, maxWidth: '58%', textAlign: 'right', fontSize: 26 * u, fontWeight: 700, color: colors.text, opacity: interpolate(f, [10, 24], [0, 1], {extrapolateRight: 'clamp'})}}>
          {flow?.label ? <span style={{display: 'inline-flex', alignItems: 'center', gap: 10 * u}}><span style={{width: 16 * u, height: 16 * u, borderRadius: 8 * u, background: PARTICLE[flow.particle || 'CO2']}} />{flow.label}</span> : caption}
        </div>
      ) : null}
    </Region>
  );
};
