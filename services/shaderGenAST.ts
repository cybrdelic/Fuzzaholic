// =============================================================================
// TRULY UNLIMITED SHADER FUZZER
// =============================================================================
// Generates ANY possible WebGPU shader through pure generative composition
// Includes: 2D, 3D, raymarching, volumetrics, physics, fractals, everything
// Uses AST-based cursor effects for true procedural cursor interaction
// =============================================================================

import { generateCursorEffectWGSL } from './cursorEffectAST';

// Random with high entropy
let _s = Date.now();
const R = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return (_s / 0xFFFFFFFF + Math.random()) / 2; };
const RI = (a: number, b: number) => Math.floor(R() * (b - a + 1)) + a;
const RF = (a: number, b: number) => R() * (b - a) + a;
const P = <T>(a: T[]): T => a[Math.floor(R() * a.length)];

// All WGSL math functions that take 1 arg
const UNARY_F32 = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'exp', 'exp2', 'log', 'log2', 'sqrt', 'inverseSqrt', 'abs', 'sign', 'floor', 'ceil',
  'round', 'trunc', 'fract', 'saturate'];

// All WGSL math functions that take 2 args (safe for scalar operands)
const BINARY_F32_SCALAR = ['min', 'max', 'pow', 'step'];
// Note: atan2 and ldexp are also binary but need careful type matching

// All WGSL math functions that take 3 args
const TERNARY_F32 = ['clamp', 'mix', 'smoothstep', 'fma'];

// Vector operations (for reference - using inline for better type safety)
// const VEC_UNARY = ['normalize', 'length', 'abs', 'sign', 'floor', 'ceil', 'fract', 'sin', 'cos', 'exp'];
// const VEC_BINARY = ['dot', 'distance', 'cross', 'reflect', 'min', 'max', 'step', 'pow'];

// Random identifier generator
const randId = () => '_' + Math.random().toString(36).substr(2, 6);

// =============================================================================
// EXPRESSION GENERATOR - Builds random math expressions recursively
// =============================================================================
function genExprF32(d: number = 0, vars: string[] = ['p.x', 'p.y', 'time', 'length(p)', 'atan2(p.y,p.x)']): string {
  if (d > 6 || R() < 0.15) {
    // Terminals - NOTE: mouse excluded to prevent cursor affecting shader pattern
    return P([...vars, RF(-3, 3).toFixed(3), 'time', 'uv.x', 'uv.y']);
  }
  const op = RI(0, 10);
  switch(op) {
    case 0: return `${P(UNARY_F32)}(${genExprF32(d+1, vars)})`;
    case 1: return `(${genExprF32(d+1, vars)} ${P(['+','-','*'])} ${genExprF32(d+1, vars)})`;
    case 2: return `(${genExprF32(d+1, vars)} / (abs(${genExprF32(d+1, vars)}) + 0.001))`;
    case 3: return `${P(BINARY_F32_SCALAR)}(${genExprF32(d+1, vars)}, ${genExprF32(d+1, vars)})`;
    case 4: return `mix(${genExprF32(d+1, vars)}, ${genExprF32(d+1, vars)}, clamp(${genExprF32(d+1, vars)}, 0.0, 1.0))`;
    case 5: return `smoothstep(${genExprF32(d+1, vars)}, ${genExprF32(d+1, vars)}, ${genExprF32(d+1, vars)})`;
    case 6: return `dot(${genExprVec2(d+1, vars)}, ${genExprVec2(d+1, vars)})`;
    case 7: return `length(${genExprVec2(d+1, vars)})`;
    case 8: return `length(${genExprVec3(d+1, vars)})`;
    case 9: return `fract(${genExprF32(d+1, vars)})`;
    default: return `abs(${genExprF32(d+1, vars)})`;
  }
}

function genExprVec2(d: number = 0, vars: string[] = ['p', 'uv']): string {
  if (d > 5 || R() < 0.2) {
    // NOTE: mouse excluded to prevent cursor affecting shader pattern
    return P([...vars, `vec2<f32>(${RF(-2,2).toFixed(2)}, ${RF(-2,2).toFixed(2)})`]);
  }
  const op = RI(0, 7);
  switch(op) {
    case 0: return `vec2<f32>(${genExprF32(d+1)}, ${genExprF32(d+1)})`;
    case 1: return `(${genExprVec2(d+1, vars)} ${P(['+','-','*'])} ${genExprVec2(d+1, vars)})`;
    case 2: return `(${genExprVec2(d+1, vars)} * ${genExprF32(d+1)})`;
    case 3: return `${P(['sin','cos','abs','fract','normalize'])}(${genExprVec2(d+1, vars)})`;
    case 4: return `mix(${genExprVec2(d+1, vars)}, ${genExprVec2(d+1, vars)}, clamp(${genExprF32(d+1)}, 0.0, 1.0))`;
    case 5: return `reflect(${genExprVec2(d+1, vars)}, normalize(${genExprVec2(d+1, vars)}))`;
    case 6: return `fract(${genExprVec2(d+1, vars)} * ${RF(2,20).toFixed(1)})`;
    default: return `floor(${genExprVec2(d+1, vars)} * ${RF(2,15).toFixed(1)})`;
  }
}

function genExprVec3(d: number = 0, vars: string[] = ['ro', 'rd']): string {
  if (d > 4 || R() < 0.25) {
    return P([...vars, `vec3<f32>(${RF(0,1).toFixed(2)}, ${RF(0,1).toFixed(2)}, ${RF(0,1).toFixed(2)})`,
      'vec3<f32>(p, 0.0)', `vec3<f32>(uv, time*${RF(0.1,0.5).toFixed(2)})`]);
  }
  const op = RI(0, 6);
  switch(op) {
    case 0: return `vec3<f32>(${genExprF32(d+1)}, ${genExprF32(d+1)}, ${genExprF32(d+1)})`;
    case 1: return `vec3<f32>(${genExprVec2(d+1)}, ${genExprF32(d+1)})`;
    case 2: return `(${genExprVec3(d+1, vars)} ${P(['+','-','*'])} ${genExprVec3(d+1, vars)})`;
    case 3: return `cross(${genExprVec3(d+1, vars)}, ${genExprVec3(d+1, vars)})`;
    case 4: return `normalize(${genExprVec3(d+1, vars)})`;
    case 5: return `mix(${genExprVec3(d+1, vars)}, ${genExprVec3(d+1, vars)}, clamp(${genExprF32(d+1)}, 0.0, 1.0))`;
    default: return `${P(['sin','cos','abs','fract'])}(${genExprVec3(d+1, vars)})`;
  }
}

function genExprVec4(d: number = 0): string {
  if (d > 3 || R() < 0.3) {
    return `vec4<f32>(${RF(0,1).toFixed(2)}, ${RF(0,1).toFixed(2)}, ${RF(0,1).toFixed(2)}, 1.0)`;
  }
  return P([
    `vec4<f32>(${genExprVec3(d+1)}, 1.0)`,
    `vec4<f32>(${genExprF32(d+1)}, ${genExprF32(d+1)}, ${genExprF32(d+1)}, 1.0)`,
  ]);
}

// =============================================================================
// HELPER FUNCTION GENERATORS - Creates random reusable functions
// =============================================================================
function genHashFn(): string {
  const variant = RI(0, 3);
  const c1 = RF(100, 400).toFixed(1);
  const c2 = RF(100, 400).toFixed(1);
  const c3 = RF(40000, 50000).toFixed(1);
  switch(variant) {
    case 0: return `fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(${c1}, ${c2}))) * ${c3});
}`;
    case 1: return `fn hash(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * ${RF(0.1,0.2).toFixed(3)});
  p3 += dot(p3, p3.yzx + ${RF(30,40).toFixed(1)});
  return fract((p3.x + p3.y) * p3.z);
}`;
    case 2: return `fn hash(p: vec2<f32>) -> f32 {
  let n = u32(p.x * ${c1} + p.y * ${c2});
  var h = n * 0x9e3779b9u;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967295.0;
}`;
    default: return `fn hash(p: vec2<f32>) -> f32 {
  let k = dot(p, vec2<f32>(${c1}, ${c2}));
  return fract(sin(k) * ${c3});
}`;
  }
}

function genHash2Fn(): string {
  return `fn hash2(p: vec2<f32>) -> vec2<f32> {
  let k = vec2<f32>(${RF(0.3,0.4).toFixed(4)}, ${RF(0.35,0.4).toFixed(4)});
  var q = p * k + k.yx;
  return fract(sin(vec2<f32>(dot(q, q.yx), dot(q.yx, q))) * ${RF(40000,50000).toFixed(1)});
}`;
}

function genHash3Fn(): string {
  return `fn hash3(p: vec3<f32>) -> vec3<f32> {
  var q = vec3<f32>(
    dot(p, vec3<f32>(${RF(100,300).toFixed(1)}, ${RF(100,400).toFixed(1)}, ${RF(50,150).toFixed(1)})),
    dot(p, vec3<f32>(${RF(200,300).toFixed(1)}, ${RF(150,250).toFixed(1)}, ${RF(200,300).toFixed(1)})),
    dot(p, vec3<f32>(${RF(100,200).toFixed(1)}, ${RF(200,350).toFixed(1)}, ${RF(100,200).toFixed(1)}))
  );
  return fract(sin(q) * ${RF(40000,50000).toFixed(1)});
}`;
}

function genNoiseFn(): string {
  return `fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), u.x),
             mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}`;
}

function genNoise3DFn(): string {
  return `fn noise3D(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dot(hash3(i), f), dot(hash3(i + vec3<f32>(1,0,0)), f - vec3<f32>(1,0,0)), u.x),
        mix(dot(hash3(i + vec3<f32>(0,1,0)), f - vec3<f32>(0,1,0)), dot(hash3(i + vec3<f32>(1,1,0)), f - vec3<f32>(1,1,0)), u.x), u.y),
    mix(mix(dot(hash3(i + vec3<f32>(0,0,1)), f - vec3<f32>(0,0,1)), dot(hash3(i + vec3<f32>(1,0,1)), f - vec3<f32>(1,0,1)), u.x),
        mix(dot(hash3(i + vec3<f32>(0,1,1)), f - vec3<f32>(0,1,1)), dot(hash3(i + vec3<f32>(1,1,1)), f - vec3<f32>(1,1,1)), u.x), u.y), u.z);
}`;
}

function genFBMFn(): string {
  const oct = RI(3, 10);
  const lac = RF(1.8, 2.5).toFixed(2);
  const gain = RF(0.4, 0.6).toFixed(2);
  return `fn fbm(p: vec2<f32>) -> f32 {
  var v = 0.0; var a = 0.5; var pos = p;
  for (var i = 0; i < ${oct}; i++) {
    v += a * noise(pos);
    pos = pos * ${lac};
    a *= ${gain};
  }
  return v;
}`;
}

function genFBM3DFn(): string {
  const oct = RI(3, 8);
  return `fn fbm3D(p: vec3<f32>) -> f32 {
  var v = 0.0; var a = 0.5; var pos = p;
  for (var i = 0; i < ${oct}; i++) {
    v += a * noise3D(pos);
    pos = pos * ${RF(1.8,2.3).toFixed(2)} + vec3<f32>(0.0, 0.0, time * 0.1);
    a *= ${RF(0.4,0.6).toFixed(2)};
  }
  return v;
}`;
}

function genVoronoiFn(): string {
  return `fn voronoi(p: vec2<f32>) -> vec2<f32> {
  let n = floor(p); let f = fract(p);
  var md = 8.0; var mr = vec2<f32>(0.0);
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = vec2<f32>(f32(i), f32(j));
      let o = hash2(n + g);
      let r = g + o - f;
      let d = dot(r, r);
      if (d < md) { md = d; mr = r; }
    }
  }
  return vec2<f32>(sqrt(md), dot(mr, mr));
}`;
}

function genRotFn(): string {
  return `fn rot2(a: f32) -> mat2x2<f32> {
  let c = cos(a); let s = sin(a);
  return mat2x2<f32>(c, -s, s, c);
}`;
}

// =============================================================================
// SDF PRIMITIVES - For 3D raymarching
// Returns both the code and which SDFs are available for scene generation
// =============================================================================
interface SDFResult {
  code: string;
  available: string[];  // List of SDF function names that were included
}

function genSDFPrimitives(): SDFResult {
  const prims: string[] = [];
  const available: string[] = [];

  // Always include sphere as fallback
  prims.push(`fn sdSphere(p: vec3<f32>, r: f32) -> f32 { return length(p) - r; }`);
  available.push('sdSphere');

  if (R() > 0.3) {
    prims.push(`fn sdBox(p: vec3<f32>, b: vec3<f32>) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}`);
    available.push('sdBox');
  }
  if (R() > 0.5) {
    prims.push(`fn sdTorus(p: vec3<f32>, t: vec2<f32>) -> f32 {
  let q = vec2<f32>(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}`);
    available.push('sdTorus');
  }
  if (R() > 0.5) {
    prims.push(`fn sdCylinder(p: vec3<f32>, h: f32, r: f32) -> f32 {
  let d = abs(vec2<f32>(length(p.xz), p.y)) - vec2<f32>(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2<f32>(0.0)));
}`);
    available.push('sdCylinder');
  }
  if (R() > 0.6) {
    prims.push(`fn sdOctahedron(p: vec3<f32>, s: f32) -> f32 {
  let q = abs(p);
  return (q.x + q.y + q.z - s) * 0.57735027;
}`);
    available.push('sdOctahedron');
  }
  if (R() > 0.6) {
    prims.push(`fn sdCapsule(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, r: f32) -> f32 {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}`);
    available.push('sdCapsule');
  }
  if (R() > 0.7) {
    prims.push(`fn sdCone(p: vec3<f32>, c: vec2<f32>, h: f32) -> f32 {
  let q = length(p.xz);
  return max(dot(c.xy, vec2<f32>(q, p.y)), -h - p.y);
}`);
    available.push('sdCone');
  }
  if (R() > 0.7) {
    prims.push(`fn sdPyramid(p: vec3<f32>, h: f32) -> f32 {
  let m2 = h * h + 0.25;
  var q = abs(p.xz);
  if (q.y > q.x) { q = q.yx; }
  q = q - vec2<f32>(0.5);
  let v = vec3<f32>(q.x, h * q.y - 0.5 * p.y, h * p.y + 0.5 * q.y);
  let a = max(v.x, 0.0);
  return sqrt(a * a + v.y * v.y + v.z * v.z);
}`);
    available.push('sdPyramid');
  }

  return { code: prims.join('\n\n'), available };
}

function genSDFOps(): string {
  return `fn opU(d1: f32, d2: f32) -> f32 { return min(d1, d2); }
fn opS(d1: f32, d2: f32) -> f32 { return max(-d1, d2); }
fn opI(d1: f32, d2: f32) -> f32 { return max(d1, d2); }
fn opSU(d1: f32, d2: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}
fn opRep(p: vec3<f32>, c: vec3<f32>) -> vec3<f32> { return p - c * round(p / c); }
fn opTwist(p: vec3<f32>, k: f32) -> vec3<f32> {
  let c = cos(k * p.y); let s = sin(k * p.y);
  return vec3<f32>(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}`;
}

// =============================================================================
// SCENE GENERATORS - Random 3D scenes
// Now takes available SDFs as parameter to avoid calling undefined functions
// =============================================================================
function genRandomScene(availableSDFs: string[]): string {
  const numObjects = RI(1, 6);
  const useTwist = R() > 0.6;
  const useRep = R() > 0.5;
  const useNoise = R() > 0.4;

  let code = 'fn scene(p: vec3<f32>) -> f32 {\n  var pos = p;\n';

  if (useTwist) code += `  pos = opTwist(pos, ${RF(0.1, 0.8).toFixed(2)});\n`;
  if (useRep) code += `  pos = opRep(pos, vec3<f32>(${RF(2,5).toFixed(1)}));\n`;

  // Build shape calls only from available SDFs
  const shapeGenerators: (() => string)[] = [];

  if (availableSDFs.includes('sdSphere')) {
    shapeGenerators.push(() =>
      `sdSphere(pos + vec3<f32>(${RF(-1,1).toFixed(2)},${RF(-1,1).toFixed(2)},${RF(-1,1).toFixed(2)}), ${RF(0.2,1).toFixed(2)})`
    );
  }
  if (availableSDFs.includes('sdBox')) {
    shapeGenerators.push(() =>
      `sdBox(pos + vec3<f32>(${RF(-1,1).toFixed(2)},${RF(-1,1).toFixed(2)},${RF(-1,1).toFixed(2)}), vec3<f32>(${RF(0.2,0.8).toFixed(2)}))`
    );
  }
  if (availableSDFs.includes('sdTorus')) {
    shapeGenerators.push(() =>
      `sdTorus(pos, vec2<f32>(${RF(0.5,1.2).toFixed(2)}, ${RF(0.1,0.4).toFixed(2)}))`
    );
  }
  if (availableSDFs.includes('sdCylinder')) {
    shapeGenerators.push(() =>
      `sdCylinder(pos + vec3<f32>(${RF(-1,1).toFixed(2)},0.0,${RF(-1,1).toFixed(2)}), ${RF(0.3,1).toFixed(2)}, ${RF(0.1,0.5).toFixed(2)})`
    );
  }
  if (availableSDFs.includes('sdOctahedron')) {
    shapeGenerators.push(() =>
      `sdOctahedron(pos, ${RF(0.5,1.2).toFixed(2)})`
    );
  }
  if (availableSDFs.includes('sdCapsule')) {
    shapeGenerators.push(() =>
      `sdCapsule(pos, vec3<f32>(${RF(-0.5,0.5).toFixed(2)},0.0,0.0), vec3<f32>(${RF(-0.5,0.5).toFixed(2)},${RF(0.5,1.5).toFixed(2)},0.0), ${RF(0.1,0.3).toFixed(2)})`
    );
  }
  if (availableSDFs.includes('sdCone')) {
    shapeGenerators.push(() =>
      `sdCone(pos, vec2<f32>(${RF(0.3,0.8).toFixed(2)}, ${RF(0.3,0.8).toFixed(2)}), ${RF(0.5,1.5).toFixed(2)})`
    );
  }
  if (availableSDFs.includes('sdPyramid')) {
    shapeGenerators.push(() =>
      `sdPyramid(pos, ${RF(0.5,1.5).toFixed(2)})`
    );
  }

  // Fallback: ensure we have at least sphere (which is always included)
  if (shapeGenerators.length === 0) {
    shapeGenerators.push(() => `sdSphere(pos, ${RF(0.5,1).toFixed(2)})`);
  }

  const shapes: string[] = [];
  for (let i = 0; i < numObjects; i++) {
    // Pick a random generator and call it
    const gen = P(shapeGenerators);
    shapes.push(gen());
  }

  let combined = shapes[0];
  for (let i = 1; i < shapes.length; i++) {
    const op = P(['opU', 'opSU', 'opS', 'opI']);
    if (op === 'opSU') {
      combined = `${op}(${combined}, ${shapes[i]}, ${RF(0.1,0.5).toFixed(2)})`;
    } else {
      combined = `${op}(${combined}, ${shapes[i]})`;
    }
  }

  code += `  var d = ${combined};\n`;

  if (useNoise) {
    code += `  d += noise3D(pos * ${RF(2,8).toFixed(1)}) * ${RF(0.02,0.15).toFixed(3)};\n`;
  }

  // Maybe add ground plane
  if (R() > 0.4) {
    code += `  d = opU(d, pos.y + ${RF(0.5,2).toFixed(2)});\n`;
  }

  code += '  return d;\n}';
  return code;
}

function genRaymarchFn(): string {
  const steps = RI(50, 200);
  const minD = RF(0.0001, 0.002).toFixed(5);
  const maxD = RF(50, 200).toFixed(0);
  return `fn raymarch(ro: vec3<f32>, rd: vec3<f32>) -> f32 {
  var t = 0.0;
  for (var i = 0; i < ${steps}; i++) {
    let p = ro + rd * t;
    let d = scene(p);
    if (d < ${minD}) { break; }
    if (t > ${maxD}.0) { break; }
    t += d * ${RF(0.5,1).toFixed(2)};
  }
  return t;
}`;
}

function genNormalFn(): string {
  const eps = RF(0.0001, 0.002).toFixed(5);
  return `fn getNormal(p: vec3<f32>) -> vec3<f32> {
  let e = vec2<f32>(${eps}, 0.0);
  return normalize(vec3<f32>(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}`;
}

function genAOFn(): string {
  return `fn calcAO(p: vec3<f32>, n: vec3<f32>) -> f32 {
  var occ = 0.0; var sca = 1.0;
  for (var i = 0; i < ${RI(3,6)}; i++) {
    let h = 0.01 + ${RF(0.1,0.2).toFixed(2)} * f32(i);
    let d = scene(p + h * n);
    occ += (h - d) * sca;
    sca *= ${RF(0.9,0.98).toFixed(2)};
  }
  return clamp(1.0 - ${RF(2,4).toFixed(1)} * occ, 0.0, 1.0);
}`;
}

function genSoftShadowFn(): string {
  return `fn softShadow(ro: vec3<f32>, rd: vec3<f32>, mint: f32, maxt: f32, k: f32) -> f32 {
  var res = 1.0; var t = mint;
  for (var i = 0; i < ${RI(32,64)}; i++) {
    let h = scene(ro + rd * t);
    if (h < 0.001) { return 0.0; }
    res = min(res, k * h / t);
    t += h;
    if (t > maxt) { break; }
  }
  return res;
}`;
}

// =============================================================================
// LIGHTING GENERATORS
// =============================================================================
function genLighting(): string {
  const numLights = RI(1, 4);
  let code = '';

  for (let i = 0; i < numLights; i++) {
    code += `  let light${i} = normalize(vec3<f32>(${RF(-5,5).toFixed(1)}, ${RF(2,10).toFixed(1)}, ${RF(-5,5).toFixed(1)}) - pos);\n`;
  }

  code += `  let albedo = vec3<f32>(${RF(0.1,1).toFixed(2)}, ${RF(0.1,1).toFixed(2)}, ${RF(0.1,1).toFixed(2)});\n`;

  if (R() > 0.5) {
    code += `  let roughness = ${RF(0.1,0.9).toFixed(2)};\n`;
    code += `  let metallic = ${RF(0,1).toFixed(2)};\n`;
    code += `  let F0 = mix(vec3<f32>(0.04), albedo, metallic);\n`;
  }

  code += '  var col = vec3<f32>(0.0);\n';

  for (let i = 0; i < numLights; i++) {
    const lc = `vec3<f32>(${RF(0.5,1).toFixed(2)}, ${RF(0.5,1).toFixed(2)}, ${RF(0.5,1).toFixed(2)})`;
    code += `  let diff${i} = max(dot(n, light${i}), 0.0);\n`;
    code += `  let spec${i} = pow(max(dot(reflect(-light${i}, n), -rd), 0.0), ${RF(8,64).toFixed(1)});\n`;
    code += `  col += ${lc} * (albedo * diff${i} + ${RF(0.2,0.8).toFixed(2)} * spec${i});\n`;
  }

  if (R() > 0.4) {
    code += `  let fresnel = pow(1.0 - max(dot(n, -rd), 0.0), ${RF(2,5).toFixed(1)});\n`;
    code += `  col += fresnel * ${RF(0.1,0.4).toFixed(2)};\n`;
  }

  code += `  col += albedo * ${RF(0.02,0.1).toFixed(3)};\n`;

  return code;
}

// =============================================================================
// 2D PATTERN GENERATORS - Infinite variety
// =============================================================================
function gen2DPattern(): string {
  const type = RI(0, 30);
  switch(type) {
    case 0: // Random expression
      return `  var t = ${genExprF32(4)};\n  t = fract(abs(t));`;
    case 1: // Layered expressions
      return `  var t = ${genExprF32(3)} * 0.5 + ${genExprF32(3)} * 0.3 + ${genExprF32(3)} * 0.2;\n  t = fract(abs(t));`;
    case 2: // Polar
      return `  let r = length(p); let a = atan2(p.y, p.x);\n  var t = sin(a * ${RI(2,12)}.0 + r * ${RF(3,20).toFixed(1)} + time * ${RF(0.5,3).toFixed(1)}) * 0.5 + 0.5;`;
    case 3: // Grid
      return `  let cell = floor(p * ${RF(3,20).toFixed(1)});\n  let local = fract(p * ${RF(3,20).toFixed(1)}) - 0.5;\n  var t = hash(cell) * length(local) * 2.0;`;
    case 4: // Distance
      return `  let d = length(p - ${genExprVec2(2)});\n  var t = sin(d * ${RF(5,30).toFixed(1)} + time * ${RF(1,5).toFixed(1)}) * 0.5 + 0.5;`;
    case 5: // Fractal iteration
      return `  var z = p; var t = 0.0;\n  for (var i = 0; i < ${RI(5,20)}; i++) {\n    z = abs(z) - ${RF(0.3,0.8).toFixed(2)};\n    z = z * ${RF(1.5,2.5).toFixed(2)};\n    t += length(z) / f32(i + 1);\n  }\n  t = fract(t * ${RF(0.05,0.2).toFixed(3)});`;
    case 6: // Spiral
      return `  let r = length(p); let a = atan2(p.y, p.x);\n  var t = sin(a * ${RI(2,10)}.0 + r * ${RF(5,20).toFixed(1)} - time * ${RF(1,4).toFixed(1)});\n  t = t * 0.5 + 0.5;`;
    case 7: // Waves interference
      const waves = RI(2, 6);
      let wc = '  var t = 0.0;\n';
      for (let i = 0; i < waves; i++) {
        wc += `  t += sin(length(p - vec2<f32>(${RF(-2,2).toFixed(2)}, ${RF(-2,2).toFixed(2)})) * ${RF(5,30).toFixed(1)} + time + ${RF(0,6.28).toFixed(2)});\n`;
      }
      wc += `  t = t / ${waves}.0 * 0.5 + 0.5;`;
      return wc;
    case 8: // Domain warp
      return `  var q = p;\n  q += vec2<f32>(sin(p.y * ${RF(2,8).toFixed(1)} + time) * ${RF(0.2,1).toFixed(2)}, cos(p.x * ${RF(2,8).toFixed(1)} + time * 0.7) * ${RF(0.2,1).toFixed(2)});\n  var t = sin(length(q) * ${RF(5,20).toFixed(1)}) * 0.5 + 0.5;`;
    case 9: // XOR pattern
      return `  let ix = i32(floor((p.x + 2.0) * ${RF(5,30).toFixed(1)}));\n  let iy = i32(floor((p.y + 2.0) * ${RF(5,30).toFixed(1)}));\n  var t = f32((ix ^ iy) % 256) / 255.0;`;
    case 10: // SDF circles
      const shapes = RI(2, 6);
      let sdfCode = '  var t = 1000.0;\n';
      for (let i = 0; i < shapes; i++) {
        sdfCode += `  t = min(t, length(p - vec2<f32>(${RF(-1.5,1.5).toFixed(2)}, ${RF(-1.5,1.5).toFixed(2)})) - ${RF(0.1,0.6).toFixed(2)});\n`;
      }
      sdfCode += '  t = smoothstep(-0.05, 0.05, t);';
      return sdfCode;
    case 11: // Sine product
      return `  var t = sin(p.x * ${RF(5,30).toFixed(1)} + time) * sin(p.y * ${RF(5,30).toFixed(1)} + time * 0.7) * sin((p.x + p.y) * ${RF(3,15).toFixed(1)} + time * 0.5);\n  t = t * 0.5 + 0.5;`;
    case 12: // Rings
      return `  let r = length(p);\n  var t = exp(-r * ${RF(0.5,2).toFixed(1)}) * sin(r * ${RF(10,40).toFixed(1)} - time * ${RF(2,8).toFixed(1)});\n  t = t * 0.5 + 0.5;`;
    case 13: // Hyperbolic
      return `  let h = p.x * p.y;\n  var t = sin(h * ${RF(5,30).toFixed(1)} + time) * 0.5 + 0.5;`;
    case 14: // Voronoi
      return `  let v = voronoi(p * ${RF(3,15).toFixed(1)} + time * ${RF(0.05,0.3).toFixed(2)});\n  var t = v.x * ${RF(1,4).toFixed(1)};\n  t = 1.0 - exp(-t * ${RF(2,8).toFixed(1)});`;
    case 15: // FBM
      return `  var t = fbm(p * ${RF(2,10).toFixed(1)} + time * ${RF(0.05,0.3).toFixed(2)});\n  t = abs(t * 2.0 - 1.0);`;
    case 16: // Julia
      return `  var z = p * ${RF(1.5,3).toFixed(1)}; let c = vec2<f32>(${RF(-0.8,0.4).toFixed(3)}, ${RF(-0.5,0.5).toFixed(3)});\n  var iter = 0;\n  for (var i = 0; i < ${RI(30,100)}; i++) {\n    z = vec2<f32>(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;\n    if (dot(z, z) > 4.0) { break; }\n    iter = i;\n  }\n  var t = f32(iter) / ${RI(30,100)}.0;`;
    case 17: // Mandelbrot
      return `  var z = vec2<f32>(0.0); let c = p * ${RF(1,3).toFixed(1)} + vec2<f32>(${RF(-0.5,0.5).toFixed(2)}, ${RF(-0.5,0.5).toFixed(2)});\n  var iter = 0;\n  for (var i = 0; i < ${RI(40,120)}; i++) {\n    z = vec2<f32>(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;\n    if (dot(z, z) > 4.0) { break; }\n    iter = i;\n  }\n  var t = f32(iter) / ${RI(40,120)}.0;`;
    case 18: // Truchet
      return `  let sc = ${RF(4,15).toFixed(1)}; let cell = floor(p * sc); let local = fract(p * sc) - 0.5;\n  let flip = step(0.5, hash(cell));\n  let arc = min(length(local - mix(vec2<f32>(-0.5), vec2<f32>(0.5), flip)) - 0.5, length(local - mix(vec2<f32>(0.5, -0.5), vec2<f32>(-0.5, 0.5), flip)) - 0.5);\n  var t = smoothstep(0.02, 0.0, abs(arc));`;
    case 19: // Kaleidoscope
      return `  let angle = atan2(p.y, p.x); let radius = length(p);\n  let ka = ${(Math.PI / RI(3,12)).toFixed(5)};\n  let a = abs(((angle + 3.14159) % (ka * 2.0)) - ka);\n  let kp = vec2<f32>(cos(a), sin(a)) * radius;\n  var t = sin(kp.x * ${RF(10,30).toFixed(1)} + time) * cos(kp.y * ${RF(10,30).toFixed(1)} + time * 0.7) * 0.5 + 0.5;`;
    case 20: // Reaction diffusion
      let rd = '  var t = 0.0;\n';
      for (let i = 0; i < RI(4, 10); i++) {
        const s = (i + 1) * RF(1, 2);
        rd += `  t += sin(p.x * ${s.toFixed(1)} + time * ${RF(0.3,1).toFixed(2)}) * cos(p.y * ${(s * RF(0.8,1.2)).toFixed(1)} + time * ${RF(0.2,0.8).toFixed(2)}) / ${(i + 1).toFixed(1)};\n`;
      }
      rd += '  t = t * 0.5 + 0.5;';
      return rd;
    case 21: // Glitch
      return `  let gx = floor(p.x * ${RF(10,50).toFixed(1)} + time * ${RF(5,20).toFixed(1)});\n  let gy = floor(p.y * ${RF(3,10).toFixed(1)});\n  var t = hash(vec2<f32>(gx, gy));\n  t = step(${RF(0.3,0.7).toFixed(2)}, t);`;
    case 22: // Stripes
      return `  let a = atan2(p.y, p.x);\n  var t = sin(a * ${RI(6,30)}.0 + time * ${RF(0.5,3).toFixed(1)}) * 0.5 + 0.5;\n  t = pow(t, ${RF(0.5,2).toFixed(2)});`;
    case 23: // Moire
      return `  let d1 = sin(length(p - vec2<f32>(${RF(-0.5,0.5).toFixed(2)}, 0.0)) * ${RF(15,50).toFixed(1)});\n  let d2 = sin(length(p - vec2<f32>(${RF(-0.5,0.5).toFixed(2)}, 0.0)) * ${RF(15,50).toFixed(1)});\n  var t = (d1 + d2) * 0.5 + 0.5;`;
    case 24: // Hexagonal
      return `  let s = vec2<f32>(1.0, 1.732);\n  let a = (p % s) - s * 0.5;\n  let b = ((p - s * 0.5) % s) - s * 0.5;\n  let hex = min(dot(a, a), dot(b, b));\n  var t = smoothstep(0.0, ${RF(0.1,0.3).toFixed(2)}, sqrt(hex));`;
    case 25: // Noise ridges
      return `  var t = noise(p * ${RF(3,10).toFixed(1)} + time * ${RF(0.1,0.5).toFixed(2)});\n  t = abs(t * 2.0 - 1.0);\n  t = pow(t, ${RF(0.3,1).toFixed(2)});`;
    case 26: // Double spiral
      return `  let r = length(p); let a = atan2(p.y, p.x);\n  var t = sin(a * ${RI(2,6)}.0 + r * ${RF(5,15).toFixed(1)} - time * ${RF(1,4).toFixed(1)});\n  t += sin(a * ${RI(2,6)}.0 - r * ${RF(5,15).toFixed(1)} + time * ${RF(1,4).toFixed(1)});\n  t = t * 0.25 + 0.5;`;
    case 27: // Bokeh circles
      const bcount = RI(10, 30);
      let bc = '  var t = 0.0;\n';
      for (let i = 0; i < bcount; i++) {
        const bx = RF(-2, 2).toFixed(2);
        const by = RF(-2, 2).toFixed(2);
        const br = RF(0.05, 0.3).toFixed(2);
        bc += `  t += smoothstep(${br}, ${br} * 0.7, length(p - vec2<f32>(${bx} + sin(time * ${RF(0.1,0.5).toFixed(2)}) * 0.3, ${by} + cos(time * ${RF(0.1,0.5).toFixed(2)} * 1.3) * 0.3)));\n`;
      }
      bc += `  t = clamp(t * ${RF(0.3,0.8).toFixed(2)}, 0.0, 1.0);`;
      return bc;
    case 28: // Stars
      let starCode = '  var t = 0.0;\n';
      for (let i = 0; i < RI(3, 6); i++) {
        starCode += `  {\n    let sp = p * ${RF(10,50).toFixed(1)} + vec2<f32>(time * ${RF(0.1,0.5).toFixed(2)}, time * ${RF(0.05,0.3).toFixed(2)});\n    let cell = floor(sp); let f = fract(sp) - 0.5;\n    let h = hash(cell);\n    if (h > 0.95) { t += exp(-length(f) * ${RF(10,30).toFixed(1)}) * h; }\n  }\n`;
      }
      starCode += '  t = clamp(t, 0.0, 1.0);';
      return starCode;
    case 29: // Plasma
      return `  var t = sin(p.x * ${RF(5,15).toFixed(1)} + time);\n  t += sin(p.y * ${RF(5,15).toFixed(1)} + time * ${RF(0.5,1.5).toFixed(2)});\n  t += sin((p.x + p.y) * ${RF(3,10).toFixed(1)} + time * ${RF(0.3,0.8).toFixed(2)});\n  t += sin(length(p) * ${RF(8,20).toFixed(1)} - time * ${RF(1,3).toFixed(1)});\n  t = t * 0.25 + 0.5;`;
    default: // Recursive squares
      return `  var q = abs(p); var t = 0.0;\n  for (var i = 0; i < ${RI(5,12)}; i++) {\n    let s = max(q.x, q.y);\n    t += smoothstep(${RF(0.45,0.55).toFixed(2)}, ${RF(0.35,0.45).toFixed(2)}, s);\n    q = abs(fract(q * ${RF(1.8,2.5).toFixed(2)} + ${RF(0,0.5).toFixed(2)}) - 0.5);\n  }\n  t = fract(t + time * ${RF(0.05,0.2).toFixed(2)});`;
  }
}

// =============================================================================
// COLOR PALETTE GENERATORS - Infinite variety
// =============================================================================
function genColorPalette(): string {
  const type = RI(0, 25);
  switch(type) {
    case 0: // IQ cosine palette
      return `  col = vec3<f32>(${RF(0.2,0.8).toFixed(2)},${RF(0.2,0.8).toFixed(2)},${RF(0.2,0.8).toFixed(2)}) + vec3<f32>(${RF(0.2,0.8).toFixed(2)},${RF(0.2,0.8).toFixed(2)},${RF(0.2,0.8).toFixed(2)}) * cos(6.28318 * (vec3<f32>(${RF(0.5,2).toFixed(2)},${RF(0.5,2).toFixed(2)},${RF(0.5,2).toFixed(2)}) * t + vec3<f32>(${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)})));`;
    case 1: // HSV
      return `  let h = fract(${genExprF32(2)}); let s = ${RF(0.5,1).toFixed(2)}; let v = ${RF(0.6,1).toFixed(2)};\n  let c = v * s; let x = c * (1.0 - abs(((h * 6.0) % 2.0) - 1.0)); let m = v - c;\n  let hi = i32(h * 6.0) % 6;\n  if (hi == 0) { col = vec3<f32>(c, x, 0.0) + m; }\n  else if (hi == 1) { col = vec3<f32>(x, c, 0.0) + m; }\n  else if (hi == 2) { col = vec3<f32>(0.0, c, x) + m; }\n  else if (hi == 3) { col = vec3<f32>(0.0, x, c) + m; }\n  else if (hi == 4) { col = vec3<f32>(x, 0.0, c) + m; }\n  else { col = vec3<f32>(c, 0.0, x) + m; }`;
    case 2: // Gradient 3-color
      return `  if (t < 0.5) { col = mix(vec3<f32>(${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)}), vec3<f32>(${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)}), t * 2.0); }\n  else { col = mix(vec3<f32>(${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)}), vec3<f32>(${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)},${RF(0,1).toFixed(2)}), (t - 0.5) * 2.0); }`;
    case 3: // Power curves
      return `  col = vec3<f32>(pow(abs(t), ${RF(0.3,3).toFixed(2)}), pow(abs(t), ${RF(0.3,3).toFixed(2)}), pow(abs(t), ${RF(0.3,3).toFixed(2)}));`;
    case 4: // Fire
      return `  col = vec3<f32>(min(t * 2.0, 1.0), t * t, t * t * t);`;
    case 5: // Ocean
      return `  col = mix(vec3<f32>(0.0, 0.1, 0.3), vec3<f32>(0.1, 0.7, 0.9), pow(t, 0.7));`;
    case 6: // Neon
      return `  let neon = sin(t * 3.14159) * ${RF(0.5,1.5).toFixed(2)};\n  col = mix(vec3<f32>(${RF(0.8,1).toFixed(2)}, 0.0, ${RF(0.5,1).toFixed(2)}), vec3<f32>(0.0, ${RF(0.8,1).toFixed(2)}, ${RF(0.8,1).toFixed(2)}), t) * (1.0 + neon);`;
    case 7: // Sunset
      return `  col = mix(mix(vec3<f32>(0.1, 0.0, 0.2), vec3<f32>(0.9, 0.3, 0.1), t), vec3<f32>(1.0, 0.9, 0.5), pow(t, 3.0));`;
    case 8: // Forest
      return `  col = mix(vec3<f32>(0.05, 0.15, 0.05), vec3<f32>(0.4, 0.8, 0.3), pow(t, ${RF(0.5,1.5).toFixed(2)}));`;
    case 9: // Aurora
      return `  let aurora = sin(t * 6.28318 * ${RF(2,5).toFixed(1)} + time) * 0.5 + 0.5;\n  col = mix(vec3<f32>(0.0, 0.3, 0.2), vec3<f32>(0.2, 0.9, 0.5), aurora);\n  col = mix(col, vec3<f32>(0.5, 0.2, 0.8), sin(t * 3.14159) * 0.5);`;
    case 10: // Lava
      return `  col = vec3<f32>(pow(t, 0.5), pow(t, 2.0) * ${RF(0.5,0.8).toFixed(2)}, pow(t, 4.0) * ${RF(0.1,0.3).toFixed(2)}) * ${RF(1.2,2).toFixed(1)};`;
    case 11: // Ice
      return `  col = mix(vec3<f32>(0.6, 0.7, 0.9), vec3<f32>(0.95, 0.98, 1.0), pow(t, 0.5));\n  col = mix(col, vec3<f32>(0.3, 0.5, 0.9), (1.0 - t) * ${RF(0.2,0.5).toFixed(2)});`;
    case 12: // Synthwave
      return `  let band = floor(t * 5.0) / 5.0;\n  col = mix(vec3<f32>(0.1, 0.0, 0.2), mix(vec3<f32>(1.0, 0.0, 0.5), vec3<f32>(0.0, 0.8, 1.0), band), t);`;
    case 13: // Chromatic
      return `  col = vec3<f32>(sin(t * ${RF(3,10).toFixed(1)} + ${RF(0,6.28).toFixed(2)}) * 0.5 + 0.5, sin(t * ${RF(3,10).toFixed(1)} + ${RF(0,6.28).toFixed(2)}) * 0.5 + 0.5, sin(t * ${RF(3,10).toFixed(1)} + ${RF(0,6.28).toFixed(2)}) * 0.5 + 0.5);`;
    case 14: // Rainbow
      return `  col = vec3<f32>(abs(t * 6.0 - 3.0) - 1.0, 2.0 - abs(t * 6.0 - 2.0), 2.0 - abs(t * 6.0 - 4.0));\n  col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));`;
    case 15: // Gold
      return `  col = mix(vec3<f32>(0.3, 0.2, 0.05), vec3<f32>(1.0, 0.85, 0.4), pow(t, ${RF(0.5,1.5).toFixed(2)}));`;
    case 16: // Purple haze
      return `  col = mix(vec3<f32>(0.1, 0.0, 0.15), vec3<f32>(0.6, 0.2, 0.8), t);\n  col = mix(col, vec3<f32>(0.9, 0.5, 1.0), pow(t, 2.0));`;
    case 17: // Blood
      return `  col = mix(vec3<f32>(0.1, 0.0, 0.0), vec3<f32>(0.8, 0.1, 0.05), pow(t, ${RF(0.5,1.5).toFixed(2)}));`;
    case 18: // Electric
      return `  col = vec3<f32>(0.2, 0.5, 1.0) * (1.0 + sin(t * ${RF(10,30).toFixed(1)} + time * ${RF(2,8).toFixed(1)}) * 0.5);`;
    case 19: // Thermal
      return `  if (t < 0.25) { col = mix(vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), t * 4.0); }\n  else if (t < 0.5) { col = mix(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), (t - 0.25) * 4.0); }\n  else if (t < 0.75) { col = mix(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 0.0), (t - 0.5) * 4.0); }\n  else { col = mix(vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 1.0, 1.0), (t - 0.75) * 4.0); }`;
    case 20: // Matrix
      return `  col = vec3<f32>(0.0, pow(t, ${RF(0.5,1.5).toFixed(2)}), 0.0) * ${RF(1,2).toFixed(1)};`;
    case 21: // Candy
      return `  col = vec3<f32>(1.0, ${RF(0.3,0.7).toFixed(2)}, ${RF(0.5,0.9).toFixed(2)}) * t + vec3<f32>(0.0, ${RF(0.5,1).toFixed(2)}, ${RF(0.5,1).toFixed(2)}) * (1.0 - t);`;
    case 22: // Steel
      return `  col = vec3<f32>(${RF(0.4,0.6).toFixed(2)}) + vec3<f32>(${RF(0.1,0.3).toFixed(2)}) * sin(t * ${RF(5,20).toFixed(1)});`;
    case 23: // Random expression colors
      return `  col = vec3<f32>(abs(${genExprF32(2)}), abs(${genExprF32(2)}), abs(${genExprF32(2)}));\n  col = fract(col);`;
    case 24: // Stepped random
      const steps = RI(3, 8);
      let stepped = `  let si = i32(abs(t) * ${steps}.0) % ${steps};\n`;
      for (let i = 0; i < steps; i++) {
        stepped += `  ${i === 0 ? '' : 'else '}if (si == ${i}) { col = vec3<f32>(${RF(0,1).toFixed(2)}, ${RF(0,1).toFixed(2)}, ${RF(0,1).toFixed(2)}); }\n`;
      }
      return stepped;
    default: // Grayscale
      return `  col = vec3<f32>(t);`;
  }
}

// =============================================================================
// VOLUMETRIC RENDERING
// =============================================================================
function genVolumetricCode(): string {
  const steps = RI(30, 100);
  return `  // Volumetric raymarching
  var accumCol = vec3<f32>(0.0);
  var accumAlpha = 0.0;
  let stepSize = ${RF(0.02,0.1).toFixed(3)};

  for (var i = 0; i < ${steps}; i++) {
    let rayPos = ro + rd * (f32(i) * stepSize);
    let dens = fbm3D(rayPos * ${RF(1,4).toFixed(1)} + vec3<f32>(0.0, -time * ${RF(0.1,0.5).toFixed(2)}, 0.0));

    if (dens > ${RF(0.2,0.5).toFixed(2)}) {
      let sampleCol = vec3<f32>(${RF(0.5,1).toFixed(2)}, ${RF(0.3,0.8).toFixed(2)}, ${RF(0.2,0.6).toFixed(2)}) * dens;
      let alpha = dens * ${RF(0.5,2).toFixed(2)} * stepSize;
      accumCol += sampleCol * alpha * (1.0 - accumAlpha);
      accumAlpha += alpha * (1.0 - accumAlpha);
      if (accumAlpha > 0.95) { break; }
    }
  }
  var col = mix(vec3<f32>(${RF(0,0.1).toFixed(2)}, ${RF(0,0.1).toFixed(2)}, ${RF(0.02,0.1).toFixed(2)}), accumCol, accumAlpha);`;
}

// =============================================================================
// POST PROCESSING
// =============================================================================
function genPostProcessing(): string {
  let code = '';
  if (R() > 0.3) code += `  col = pow(col, vec3<f32>(${RF(0.4,0.6).toFixed(2)}));\n`;
  if (R() > 0.4) code += `  col = col * (1.0 - ${RF(0.2,0.5).toFixed(2)} * length(uv - 0.5));\n`;
  if (R() > 0.6) code += `  col = col + (hash(uv * 1000.0 + time) - 0.5) * ${RF(0.02,0.08).toFixed(3)};\n`;
  if (R() > 0.5) code += `  col = (col - 0.5) * ${RF(0.9,1.3).toFixed(2)} + 0.5;\n`;
  if (R() > 0.5) {
    code += `  let luma = dot(col, vec3<f32>(0.299, 0.587, 0.114));\n`;
    code += `  col = mix(vec3<f32>(luma), col, ${RF(0.8,1.4).toFixed(2)});\n`;
  }
  return code;
}

// =============================================================================
// MAIN SHADER GENERATOR - THE ULTIMATE FUNCTION
// =============================================================================
export function generateUnlimitedShader(): string {
  // Reset randomness
  _s = Date.now() ^ (Math.random() * 0xFFFFFFFF);

  const id = Math.floor(R() * 0xFFFFFFFF).toString(16);

  // Choose rendering mode
  const mode = P(['2d', '2d', '2d', '3d_raymarch', '3d_raymarch', 'volumetric', 'hybrid', 'pure_math']);

  let shader = `// Shader ${id} - Mode: ${mode}
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;
@group(0) @binding(2) var<uniform> mouse : vec2<f32>;
@group(0) @binding(3) var<uniform> scroll : vec2<f32>;

`;

  // Add helper functions
  shader += genHashFn() + '\n\n';
  shader += genHash2Fn() + '\n\n';

  if (mode !== 'pure_math') {
    shader += genNoiseFn() + '\n\n';
    if (R() > 0.3) shader += genFBMFn() + '\n\n';
    if (R() > 0.4) shader += genVoronoiFn() + '\n\n';
    if (R() > 0.5) shader += genRotFn() + '\n\n';
  }

  if (mode === '3d_raymarch' || mode === 'hybrid') {
    shader += genHash3Fn() + '\n\n';
    shader += genNoise3DFn() + '\n\n';
    if (R() > 0.5) shader += genFBM3DFn() + '\n\n';

    // Generate SDF primitives and get list of available functions
    const sdfResult = genSDFPrimitives();
    shader += sdfResult.code + '\n\n';
    shader += genSDFOps() + '\n\n';
    // Pass available SDFs to scene generator so it only uses defined functions
    shader += genRandomScene(sdfResult.available) + '\n\n';

    shader += genRaymarchFn() + '\n\n';
    shader += genNormalFn() + '\n\n';
    if (R() > 0.4) shader += genAOFn() + '\n\n';
    if (R() > 0.5) shader += genSoftShadowFn() + '\n\n';
  }

  if (mode === 'volumetric') {
    shader += genHash3Fn() + '\n\n';
    shader += genNoise3DFn() + '\n\n';
    shader += genFBM3DFn() + '\n\n';
  }

  // Main function
  shader += `@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = fragCoord.xy / resolution;
  var p = (uv - 0.5) * 2.0;
  p.x *= resolution.x / resolution.y;

`;

  if (mode === '2d' || mode === 'hybrid') {
    shader += gen2DPattern() + '\n';
    shader += '  var col = vec3<f32>(0.0);\n';
    shader += genColorPalette() + '\n';
  }
  else if (mode === '3d_raymarch') {
    shader += `  // Camera - NOTE: mouse excluded to prevent cursor affecting shader
  let camDist = ${RF(2.5,5).toFixed(1)};
  let camHeight = ${RF(0.5,2).toFixed(1)};
  let camAngle = time * ${RF(0.1,0.3).toFixed(2)};
  let ro = vec3<f32>(sin(camAngle) * camDist, camHeight, cos(camAngle) * camDist);
  let ta = vec3<f32>(0.0, 0.0, 0.0);

  let ww = normalize(ta - ro);
  let uu = normalize(cross(ww, vec3<f32>(0.0, 1.0, 0.0)));
  let vv = cross(uu, ww);
  let rd = normalize(p.x * uu + p.y * vv + ${RF(1.2,2.5).toFixed(1)} * ww);

  let t = raymarch(ro, rd);
  var col = vec3<f32>(0.0);

  if (t < 100.0) {
    let pos = ro + rd * t;
    let n = getNormal(pos);
`;
    shader += genLighting();
    shader += `  } else {
    col = vec3<f32>(${RF(0.3,0.7).toFixed(2)}, ${RF(0.4,0.8).toFixed(2)}, ${RF(0.6,1).toFixed(2)}) - rd.y * ${RF(0.2,0.5).toFixed(2)};
  }
`;
  }
  else if (mode === 'volumetric') {
    shader += `  let ro = vec3<f32>(0.0, 0.0, -${RF(2,4).toFixed(1)});
  let rd = normalize(vec3<f32>(p, ${RF(1.5,2.5).toFixed(1)}));

`;
    shader += genVolumetricCode() + '\n';
  }
  else if (mode === 'pure_math') {
    // Pure mathematical expression-based shader
    shader += `  var t = ${genExprF32(5)};\n`;
    shader += '  t = fract(abs(t));\n';
    shader += '  var col = vec3<f32>(0.0);\n';
    shader += genColorPalette() + '\n';
  }

  shader += genPostProcessing();

  // Add AST-generated cursor effect (truly procedural, not preset)
  shader += generateCursorEffectWGSL();

  shader += `
  col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(col, 1.0);
}`;

  return shader;
}

export { generateUnlimitedShader as generatePhysicsShaderCode };
