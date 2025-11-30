
import { ShaderPreset } from './types';

// A library of helper functions injected into every shader to allow
// the fuzzer to generate complex effects safely.
export const WGSL_PREAMBLE = `
// --- INJECTED HELPER LIBRARY ---
fn f_sin(x: f32) -> f32 { return sin(x); }
fn f_cos(x: f32) -> f32 { return cos(x); }
fn f_n(x: f32) -> f32 { return fract(sin(x)*43758.5453); }
fn f_hash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453); }
fn f_rot(p: vec2<f32>, a: f32) -> vec2<f32> {
    let s = sin(a); let c = cos(a);
    return vec2<f32>(c*p.x - s*p.y, s*p.x + c*p.y);
}
fn f_pal(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
    return a + b * cos(6.28318 * (c * t + d));
}
fn f_smin(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
// -------------------------------
`;

export const BASE_VERTEX_SHADER = `
struct VertexOutput {
  @builtin(position) @invariant Position : vec4<f32>,
  @location(0) uv : vec2<f32>,
}

@vertex
fn main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );

  var output : VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  output.uv = pos[VertexIndex] * 0.5 + 0.5;
  return output;
}
`;

export const PRESETS: ShaderPreset[] = [
  {
    name: 'Triangle',
    code: `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let col = 0.5 + 0.5 * cos(time + uv.xyx + vec3<f32>(0.0, 2.0, 4.0));
    return vec4<f32>(col, 1.0);
}
`
  },
  {
    name: 'Gradient',
    code: `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let dist = distance(uv, center);
    let wave = sin(dist * 20.0 - time * 2.0);
    let col = vec3<f32>(wave, wave, wave);
    return vec4<f32>(col, 1.0);
}
`
  },
  {
    name: 'Plasma',
    code: `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let x = uv.x * 10.0;
    let y = uv.y * 10.0;
    let v = sin(x + time) + sin((y + time) * 0.5);
    let cx = x + 0.5 * sin(time / 5.0);
    let cy = y + 0.5 * cos(time / 3.0);
    let v2 = sin(sqrt(100.0 * (cx*cx + cy*cy)) + time);
    let col = sin(vec3<f32>(v + v2, v + v2 + 2.0, v + v2 + 4.0));
    return vec4<f32>(col * 0.5 + 0.5, 1.0);
}
`
  },
  {
    name: 'Grid',
    code: `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let grid_scale = 10.0;
    let g = fract(uv * grid_scale);
    let line_w = 0.05;
    let lines = step(g.x, line_w) + step(g.y, line_w);
    let col = vec3<f32>(lines, lines * sin(time), lines * cos(time));
    return vec4<f32>(col, 1.0);
}
`
  }
];
