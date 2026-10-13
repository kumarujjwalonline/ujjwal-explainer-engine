import React, {useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {interpolate, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {colors, fonts} from '../theme';
import {Region, useBox, useUnit} from '../components/Box';
import {threeAA, threeDpr} from './Body3D';

// Production rule 17: 3D motion graphics for science. Ball-and-stick molecules from a
// built-in library (so the AI never has to invent coordinates), slowly turning; a reaction
// shows the reactants, breaks them into atoms and rebuilds the products.

type Atom = {e: string; p: [number, number, number]};
type Mol = {atoms: Atom[]; bonds: [number, number, number?][]; label: string};

const EL: Record<string, {c: string; r: number}> = {
  C: {c: '#8D9BB0', r: 0.34}, H: {c: '#F5F7FA', r: 0.22}, O: {c: '#E5383B', r: 0.32}, N: {c: '#4C7BF4', r: 0.32},
  Na: {c: '#B388FF', r: 0.42}, Cl: {c: '#3BB273', r: 0.4}, P: {c: '#FF8A1F', r: 0.38}, S: {c: '#F2C94C', r: 0.38},
};

const chain = (n: number, x0: number, y: number, dir: number): Atom[] =>
  Array.from({length: n}, (_, i) => ({e: 'C', p: [x0 + dir * i * 0.68, y + (i % 2 ? 0.28 : -0.1), 0] as [number, number, number]}));

const tri = (): Mol => {
  const atoms: Atom[] = [
    {e: 'C', p: [-1.4, 1.1, 0]}, {e: 'C', p: [-1.4, 0, 0]}, {e: 'C', p: [-1.4, -1.1, 0]},
    {e: 'O', p: [-0.7, 1.1, 0]}, {e: 'O', p: [-0.7, 0, 0]}, {e: 'O', p: [-0.7, -1.1, 0]},
  ];
  const bonds: [number, number, number?][] = [[0, 1], [1, 2], [0, 3], [1, 4], [2, 5]];
  [1.1, 0, -1.1].forEach((y, k) => {
    const start = atoms.length;
    chain(7, 0, y, 1).forEach((a) => atoms.push(a));
    bonds.push([3 + k, start]);
    for (let i = start; i < start + 6; i++) bonds.push([i, i + 1]);
    atoms.push({e: 'O', p: [0.1, y + 0.55, 0]});
    bonds.push([start, atoms.length - 1, 2]);
  });
  return {atoms, bonds, label: 'Triglyceride (fat)'};
};

const ring = (): Mol => {
  const atoms: Atom[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    atoms.push({e: i === 0 ? 'O' : 'C', p: [Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0]});
  }
  const bonds: [number, number, number?][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]];
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    atoms.push({e: 'O', p: [Math.cos(a) * 2.1, Math.sin(a) * 2.1, i % 2 ? 0.4 : -0.4]});
    bonds.push([i, atoms.length - 1]);
  }
  return {atoms, bonds, label: 'Glucose'};
};

export const LIBRARY: Record<string, () => Mol> = {
  H2O: () => ({atoms: [{e: 'O', p: [0, 0, 0]}, {e: 'H', p: [0.76, 0.59, 0]}, {e: 'H', p: [-0.76, 0.59, 0]}], bonds: [[0, 1], [0, 2]], label: 'H₂O (water)'}),
  CO2: () => ({atoms: [{e: 'C', p: [0, 0, 0]}, {e: 'O', p: [1.16, 0, 0]}, {e: 'O', p: [-1.16, 0, 0]}], bonds: [[0, 1, 2], [0, 2, 2]], label: 'CO₂ (carbon dioxide)'}),
  O2: () => ({atoms: [{e: 'O', p: [0.6, 0, 0]}, {e: 'O', p: [-0.6, 0, 0]}], bonds: [[0, 1, 2]], label: 'O₂ (oxygen)'}),
  N2: () => ({atoms: [{e: 'N', p: [0.55, 0, 0]}, {e: 'N', p: [-0.55, 0, 0]}], bonds: [[0, 1, 3]], label: 'N₂ (nitrogen)'}),
  CH4: () => ({atoms: [{e: 'C', p: [0, 0, 0]}, {e: 'H', p: [0.63, 0.63, 0.63]}, {e: 'H', p: [-0.63, -0.63, 0.63]}, {e: 'H', p: [-0.63, 0.63, -0.63]}, {e: 'H', p: [0.63, -0.63, -0.63]}], bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], label: 'CH₄ (methane)'}),
  NH3: () => ({atoms: [{e: 'N', p: [0, 0.2, 0]}, {e: 'H', p: [0.9, -0.2, 0]}, {e: 'H', p: [-0.45, -0.2, 0.78]}, {e: 'H', p: [-0.45, -0.2, -0.78]}], bonds: [[0, 1], [0, 2], [0, 3]], label: 'NH₃ (ammonia)'}),
  NaCl: () => ({atoms: [{e: 'Na', p: [-0.7, 0, 0]}, {e: 'Cl', p: [0.7, 0, 0]}], bonds: [[0, 1]], label: 'NaCl (salt)'}),
  glucose: ring,
  triglyceride: tri,
  fat: tri,
};
const norm = (k: string) => {
  const key = Object.keys(LIBRARY).find((x) => x.toLowerCase() === k.replace(/[₀-₉]/g, (d) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d))).replace(/\s+/g, '').toLowerCase());
  return key ? LIBRARY[key]() : LIBRARY.CO2();
};
const centre = (m: Mol): Mol => {
  const c = m.atoms.reduce((a, x) => [a[0] + x.p[0], a[1] + x.p[1], a[2] + x.p[2]], [0, 0, 0]).map((v) => v / m.atoms.length);
  return {...m, atoms: m.atoms.map((a) => ({...a, p: [a.p[0] - c[0], a.p[1] - c[1], a.p[2] - c[2]] as [number, number, number]}))};
};
const radius = (m: Mol) => Math.max(1, ...m.atoms.map((a) => Math.hypot(...a.p)));

const Bond: React.FC<{a: THREE.Vector3; b: THREE.Vector3; order: number; opacity: number}> = ({a, b, order, opacity}) => {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  const offs = order === 1 ? [0] : order === 2 ? [-0.07, 0.07] : [-0.1, 0, 0.1];
  return (
    <group position={mid} quaternion={q}>
      {offs.map((o) => (
        <mesh key={o} position={[o, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, len, 8]} />
          <meshStandardMaterial color="#C9D3E0" transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const MolMesh: React.FC<{m: Mol; at: THREE.Vector3; spin: number; scale: number; burst: number; seed: number; opacity: number}> = ({m, at, spin, scale, burst, seed, opacity}) => {
  const rnd = (i: number, k: number) => {
    const x = Math.sin((i + 1) * 12.9898 + seed * 78.233 + k * 37.719) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  };
  const pos = m.atoms.map((a, i) => V(...a.p).add(V(rnd(i, 1), rnd(i, 2), rnd(i, 3)).multiplyScalar(burst * 2.2)));
  return (
    <group position={at} rotation={[0.35, spin, 0]} scale={scale}>
      {burst < 0.35 ? m.bonds.map(([i, j, o], k) => <Bond key={k} a={pos[i]} b={pos[j]} order={o || 1} opacity={opacity * (1 - burst / 0.35)} />) : null}
      {m.atoms.map((a, i) => (
        <mesh key={i} position={pos[i]}>
          <sphereGeometry args={[(EL[a.e] || EL.C).r, 16, 12]} />
          <meshStandardMaterial color={(EL[a.e] || EL.C).c} roughness={0.35} metalness={0.05} transparent opacity={opacity} emissive={(EL[a.e] || EL.C).c} emissiveIntensity={0.08 + burst * 0.6} />
        </mesh>
      ))}
    </group>
  );
};

const Cam: React.FC<{z: number; aspect: number}> = ({z, aspect}) => {
  const {camera} = useThree();
  const c = camera as THREE.PerspectiveCamera;
  c.fov = 35;
  c.aspect = aspect;
  c.position.set(0, 0, z);
  c.lookAt(0, 0, 0);
  c.updateProjectionMatrix();
  return null;
};

export type MoleculeSpec = {molecules?: string[]; reaction?: {from: string[]; to: string[]; label?: string}; caption?: string};

export const Molecule3D: React.FC<MoleculeSpec> = ({molecules = ['CO2'], reaction, caption}) => {
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const b = useBox();
  const u = useUnit();
  const portrait = b.w < b.h;
  const left = useMemo(() => (reaction ? reaction.from : molecules).map(norm).map(centre), [JSON.stringify(reaction?.from ?? molecules)]);
  const right = useMemo(() => (reaction ? reaction.to.map(norm).map(centre) : []), [JSON.stringify(reaction?.to)]);
  const spin = interpolate(f, [0, durationInFrames], [0, Math.PI * 1.2]);
  const appear = (d: number) => interpolate(f, [d, d + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.4))});
  const layout = (ms: Mol[], cx: number, width: number) => {
    const sizes = ms.map((m) => radius(m) * 2 + 0.8);
    const total = sizes.reduce((a, s) => a + s, 0);
    const s = Math.min(1, width / total);
    let x = cx - (total * s) / 2;
    return ms.map((m, i) => {
      const p = x + (sizes[i] * s) / 2;
      x += sizes[i] * s;
      return {m, at: portrait ? V(0, -(p - cx), 0) : V(p, 0, 0), s};
    });
  };
  const D = durationInFrames;
  const t1 = D * 0.32, t2 = D * 0.55;
  const burst = reaction ? interpolate(f, [t1, t2], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)}) : 0;
  const build = reaction ? interpolate(f, [t2, t2 + D * 0.2], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)}) : 0;
  const L = layout(left, reaction ? -3.9 : 0, reaction ? 6 : 12);
  const R = layout(right, 3.9, 6);
  const label = (txt: string, o: number) => <div style={{fontFamily: fonts.display, fontWeight: 700, fontSize: 26 * u, color: colors.sub, opacity: o}}>{txt}</div>;
  return (
    <Region>
      <ThreeCanvas width={b.w} height={b.h} dpr={threeDpr()} style={{position: 'absolute', inset: 0}} gl={{antialias: threeAA(), preserveDrawingBuffer: true}}>
        <Cam z={reaction ? 17 : 12} aspect={b.w / b.h} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 4, 6]} intensity={1.2} />
        <pointLight position={[-4, -2, 5]} intensity={0.6} color="#8EC5FF" />
        {L.map(({m, at, s}, i) => (
          <MolMesh key={'l' + i} m={m} at={at} spin={spin + i} scale={s * appear(4 + i * 6)} burst={burst} seed={i + 1} opacity={reaction ? 1 - interpolate(f, [t2 - 6, t2 + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1} />
        ))}
        {f >= t2 - 2 ? R.map(({m, at, s}, i) => <MolMesh key={'r' + i} m={m} at={at} spin={spin - i} scale={s} burst={build} seed={i + 11} opacity={interpolate(f, [t2 - 2, t2 + 8], [0, 1], {extrapolateRight: 'clamp'})} />) : null}
      </ThreeCanvas>
      {reaction ? (
        <div style={{position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: 64 * u, color: colors.orange, fontWeight: 800, opacity: appear(t1 * 0.6)}}>→</div>
      ) : null}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 28 * u, display: 'flex', justifyContent: 'center', gap: 40 * u, flexWrap: 'wrap', textAlign: 'center'}}>
        {reaction
          ? label(reaction.label || `${left.map((m) => m.label.split(' ')[0]).join(' + ')} → ${right.map((m) => m.label.split(' ')[0]).join(' + ')}`, appear(10))
          : left.map((m, i) => <React.Fragment key={i}>{label(m.label, appear(8 + i * 6))}</React.Fragment>)}
      </div>
      {caption ? <div style={{position: 'absolute', left: 0, right: 0, top: 24 * u, textAlign: 'center', fontFamily: fonts.display, fontWeight: 800, fontSize: 40 * u, opacity: appear(4)}}>{caption}</div> : null}
    </Region>
  );
};
