import React, {useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {interpolate, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, useBox, useUnit} from '../components/Box';

// Production rule 14: 3D human body walkthrough for health and fitness topics.
// A see-through, stylised body (no licensed model needed) with organs placed anatomically.
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
// Viewer faces the body: the person's right side is at negative x.
const POS: Record<Organ, THREE.Vector3> = {
  brain: V(0, 1.53, 0),
  nose: V(0, 1.42, 0.16),
  lungs: V(0, 0.7, 0),
  heart: V(0.05, 0.62, 0.07),
  liver: V(-0.12, 0.4, 0.05),
  stomach: V(0.11, 0.36, 0.06),
  pancreas: V(0.04, 0.29, 0.02),
  intestines: V(0, 0.12, 0.05),
  kidneys: V(0, 0.26, -0.08),
  bladder: V(0, -0.1, 0.05),
  fat: V(0, 0.17, 0.2),
  muscle: V(0.11, -0.58, 0.02),
  blood: V(0, 0.45, 0.02),
  skin: V(0.29, 0.25, 0.12),
  bones: V(0, -0.9, 0),
};
const PARTICLE: Record<string, string> = {CO2: '#D9E2EC', O2: '#5BC0FF', fat: '#F2C94C', water: '#4FC3F7', glucose: '#FF8A1F', blood: '#E5383B', signal: '#B388FF'};

const Ellipsoid: React.FC<{p: THREE.Vector3; r: [number, number, number]; color: string; glow: number; dim: boolean}> = ({p, r, color, glow, dim}) => (
  <mesh position={p} scale={r}>
    <sphereGeometry args={[1, 22, 16]} />
    <meshStandardMaterial color={color} emissive={glow > 0 ? colors.orange : color} emissiveIntensity={glow > 0 ? 0.6 + glow : 0.12} transparent opacity={dim ? 0.28 : 0.92} roughness={0.45} />
  </mesh>
);

const Organs: React.FC<{active?: Organ; pulse: number}> = ({active, pulse}) => {
  const g = (o: Organ) => (active === o ? pulse : 0);
  const d = (o: Organ) => !!active && active !== o;
  return (
    <group>
      <Ellipsoid p={POS.brain} r={[0.13, 0.1, 0.14]} color="#E8A0B4" glow={g('brain')} dim={d('brain')} />
      <Ellipsoid p={V(-0.14, 0.7, 0)} r={[0.11, 0.2, 0.09]} color="#F08A8A" glow={g('lungs')} dim={d('lungs')} />
      <Ellipsoid p={V(0.14, 0.7, 0)} r={[0.1, 0.19, 0.09]} color="#F08A8A" glow={g('lungs')} dim={d('lungs')} />
      <mesh position={V(0, 0.98, 0)}>
        <cylinderGeometry args={[0.025, 0.025, 0.28, 12]} />
        <meshStandardMaterial color="#F0B0B0" transparent opacity={d('lungs') ? 0.25 : 0.8} />
      </mesh>
      <Ellipsoid p={POS.heart} r={[0.07, 0.08, 0.06]} color="#D7263D" glow={g('heart')} dim={d('heart')} />
      <Ellipsoid p={POS.liver} r={[0.16, 0.08, 0.08]} color="#8B3A3A" glow={g('liver')} dim={d('liver')} />
      <Ellipsoid p={POS.stomach} r={[0.09, 0.07, 0.06]} color="#E39B7B" glow={g('stomach')} dim={d('stomach')} />
      <Ellipsoid p={POS.pancreas} r={[0.09, 0.025, 0.03]} color="#E8C27A" glow={g('pancreas')} dim={d('pancreas')} />
      <mesh position={POS.intestines}>
        <torusKnotGeometry args={[0.1, 0.03, 64, 8, 2, 5]} />
        <meshStandardMaterial color="#E7A6A1" emissive={g('intestines') ? colors.orange : '#E7A6A1'} emissiveIntensity={g('intestines') ? 0.6 + g('intestines') : 0.1} transparent opacity={d('intestines') ? 0.28 : 0.9} />
      </mesh>
      <Ellipsoid p={V(-0.1, 0.26, -0.08)} r={[0.04, 0.07, 0.035]} color="#9C2F3F" glow={g('kidneys')} dim={d('kidneys')} />
      <Ellipsoid p={V(0.1, 0.26, -0.08)} r={[0.04, 0.07, 0.035]} color="#9C2F3F" glow={g('kidneys')} dim={d('kidneys')} />
      <Ellipsoid p={POS.bladder} r={[0.05, 0.045, 0.045]} color="#F2D16B" glow={g('bladder')} dim={d('bladder')} />
      {/* Belly fat: a soft yellow layer with visible fat cells */}
      <mesh position={V(0, 0.17, 0.04)} scale={[0.27, 0.2, 0.19]}>
        <sphereGeometry args={[1, 22, 16]} />
        <meshStandardMaterial color="#F2C94C" emissive={g('fat') ? colors.orange : '#F2C94C'} emissiveIntensity={g('fat') ? 0.4 + g('fat') : 0.08} transparent opacity={d('fat') ? 0.08 : 0.22} depthWrite={false} />
      </mesh>
      {Array.from({length: 14}, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <mesh key={i} position={V(Math.cos(a) * 0.12, 0.17 + Math.sin(a * 2) * 0.07, 0.19 + (i % 3) * 0.01)}>
            <sphereGeometry args={[0.028, 10, 8]} />
            <meshStandardMaterial color="#F7D774" emissive="#F2C94C" emissiveIntensity={g('fat') ? 0.5 + g('fat') : 0.15} transparent opacity={d('fat') ? 0.25 : 0.95} />
          </mesh>
        );
      })}
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={V(x, -0.58, 0.02)}>
          <capsuleGeometry args={[0.075, 0.42, 8, 16]} />
          <meshStandardMaterial color="#C0392B" emissive={g('muscle') ? colors.orange : '#C0392B'} emissiveIntensity={g('muscle') ? 0.5 + g('muscle') : 0.1} transparent opacity={d('muscle') ? 0.22 : 0.75} />
        </mesh>
      ))}
    </group>
  );
};

const Shell: React.FC = () => {
  const fill = {color: '#6FA8DC', emissive: '#2A4F7A', emissiveIntensity: 0.4, transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.3} as const;
  const part = (key: string, pos: THREE.Vector3, geo: React.ReactNode, scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]) => (
    <group key={key} position={pos} scale={scale} rotation={rot}>
      <mesh>{geo}<meshStandardMaterial {...fill} /></mesh>
    </group>
  );
  return (
    <group>
      {part('head', V(0, 1.52, 0), <sphereGeometry args={[0.17, 32, 24]} />, [1, 1.12, 1.05])}
      {part('neck', V(0, 1.27, 0), <cylinderGeometry args={[0.07, 0.08, 0.18, 20]} />)}
      {part('torso', V(0, 0.5, 0), <capsuleGeometry args={[0.24, 0.62, 12, 24]} />, [1.15, 1, 0.72])}
      {part('pelvis', V(0, -0.05, 0), <sphereGeometry args={[0.26, 28, 20]} />, [1.05, 0.62, 0.72])}
      {part('armL', V(-0.4, 0.55, 0), <capsuleGeometry args={[0.06, 0.62, 8, 16]} />, [1, 1, 1], [0, 0, -0.1])}
      {part('armR', V(0.4, 0.55, 0), <capsuleGeometry args={[0.06, 0.62, 8, 16]} />, [1, 1, 1], [0, 0, 0.1])}
      {part('foreL', V(-0.47, -0.05, 0.02), <capsuleGeometry args={[0.05, 0.5, 8, 16]} />, [1, 1, 1], [0, 0, -0.05])}
      {part('foreR', V(0.47, -0.05, 0.02), <capsuleGeometry args={[0.05, 0.5, 8, 16]} />, [1, 1, 1], [0, 0, 0.05])}
      {part('legL', V(-0.12, -0.62, 0), <capsuleGeometry args={[0.1, 0.56, 8, 16]} />)}
      {part('legR', V(0.12, -0.62, 0), <capsuleGeometry args={[0.1, 0.56, 8, 16]} />)}
      {part('shinL', V(-0.12, -1.32, 0), <capsuleGeometry args={[0.075, 0.6, 8, 16]} />)}
      {part('shinR', V(0.12, -1.32, 0), <capsuleGeometry args={[0.075, 0.6, 8, 16]} />)}
    </group>
  );
};

// Route through the body; "blood" passes through the main vessels via the heart.
const routePoints = (path: Organ[]) => {
  const pts: THREE.Vector3[] = [];
  path.forEach((o, i) => {
    if (o === 'blood') {
      const prev = path[i - 1] ? POS[path[i - 1]] : POS.heart;
      pts.push(V((prev.x + POS.heart.x) / 2 + 0.06, (prev.y + POS.heart.y) / 2, 0.02), POS.heart.clone());
    } else if (o === 'lungs') {
      pts.push(V(0.14, 0.66, 0.02), V(0, 0.95, 0.02));
    } else pts.push(POS[o].clone());
  });
  if (path[path.length - 1] === 'nose') pts.push(V(0, 1.42, 0.55), V(0, 1.45, 1.1)); // breathed out
  if (pts.length === 1) pts.push(pts[0].clone().add(V(0, 0.2, 0.2)));
  return pts;
};

const Flow: React.FC<{path: Organ[]; color: string; t: number; show: number}> = ({path, color, t, show}) => {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(routePoints(path), false, 'catmullrom', 0.3), [path.join(',')]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 100, 0.012, 6, false), [curve]);
  const N = 22;
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color={color} transparent opacity={0.35 * show} />
      </mesh>
      {Array.from({length: N}, (_, i) => {
        const u = (t * 0.35 + i / N) % 1;
        if (u > show) return null;
        const p = curve.getPointAt(u);
        const fadeOut = path[path.length - 1] === 'nose' ? interpolate(u, [0.82, 1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
        return (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.022, 8, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} transparent opacity={fadeOut} />
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
  const n = steps.length;
  // Steps share the first 85 % of the scene; the camera eases from one organ to the next.
  const intro0 = Math.round(durationInFrames * 0.18); // establishing shot of the whole body
  const span = (durationInFrames * 0.85 - intro0) / Math.max(1, n);
  const idx = n ? (f < intro0 ? 0 : Math.min(n - 1, Math.floor((f - intro0) / span))) : -1;
  const active: Organ | undefined = n ? (f < intro0 ? undefined : steps[idx].organ) : focus;
  const whole = {t: V(0, 0.15, 0), d: 6.2};
  const shot = (o?: Organ) => (o ? {t: POS[o], d: o === 'muscle' || o === 'bones' ? 3.2 : 2.5} : whole);
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
      <ThreeCanvas width={b.w} height={b.h} dpr={THREE_DPR} style={{position: 'absolute', inset: 0}} gl={{antialias: true, preserveDrawingBuffer: true}}>
        <Camera target={portrait ? target : target.clone().add(V(-0.22 * dist / 1.7, 0, 0))} dist={dist} orbit={orbit} aspect={b.w / b.h} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 3, 4]} intensity={1.1} />
        <pointLight position={[-2, 1, 2]} intensity={0.8} color="#8EC5FF" />
        <group rotation={[0, interpolate(f, [0, durationInFrames], [-0.12, 0.12]), 0]}>
          <Shell />
          <Organs active={active} pulse={pulse} />
          {flow ? <Flow path={flow.path} color={PARTICLE[flow.particle || 'CO2'] || '#D9E2EC'} t={f / fps} show={showFlow} /> : null}
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
