
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
fn f_graphics_surface(uv: vec2<f32>, col: vec3<f32>) -> vec3<f32> {
    let centered = uv * 2.0 - 1.0;
    let normal = normalize(vec3<f32>(centered.x * 0.36, centered.y * 0.36, 1.0));
    let lightDir = normalize(vec3<f32>(-0.42, 0.58, 0.70));
    let viewDir = vec3<f32>(0.0, 0.0, 1.0);
    let ndotl = clamp(dot(normal, lightDir), 0.08, 1.0);
    let halfDir = normalize(lightDir + viewDir);
    let specular = pow(clamp(dot(normal, halfDir), 0.0, 1.0), 28.0) * 0.16;
    let fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
    let ao = clamp(1.0 - length(centered) * 0.32, 0.55, 1.0);
    let skyBounce = mix(vec3<f32>(0.05, 0.06, 0.08), col.yzx * 0.32, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
    let groundBounce = col.zxy * clamp(0.45 - normal.y * 0.35, 0.0, 0.32);
    let gi = skyBounce + groundBounce;
    let lit = (col * (0.30 + ndotl * 0.74) + gi + col.zyx * fresnel * 0.16 + vec3<f32>(specular)) * ao;
    let luma = dot(lit, vec3<f32>(0.2126, 0.7152, 0.0722));
    let bloom = smoothstep(0.58, 1.12, luma);
    let focusDepth = smoothstep(0.16, 1.18, length(centered));
    let dofSoft = mix(lit, vec3<f32>(luma) + col.yzx * 0.18, focusDepth * 0.18);
    let vignette = 1.0 - smoothstep(0.28, 1.42, length(centered)) * 0.42;
    let composed = (dofSoft + lit * bloom * 0.22) * vignette;
    let toneMapped = composed / (composed + vec3<f32>(1.0));
    return pow(clamp(toneMapped, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(0.454545));
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

export const DISPLAY_FRAGMENT_SHADER = `
@group(0) @binding(0) var displaySampler : sampler;
@group(0) @binding(1) var displayTexture : texture_2d<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(displayTexture, displaySampler, uv);
}
`;

export const PRESETS: ShaderPreset[] = [
  {
    name: 'Triangle',
    code: `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;
@group(0) @binding(2) var<uniform> mouse : vec2<f32>;
@group(0) @binding(3) var<uniform> scroll : vec2<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let col = 0.5 + 0.5 * cos(time + uv.xyx + vec3<f32>(0.0, 2.0, 4.0));
    return vec4<f32>(f_graphics_surface(uv, col), 1.0);
}
`
  },
  {
    name: 'Gradient',
    code: `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;
@group(0) @binding(2) var<uniform> mouse : vec2<f32>;
@group(0) @binding(3) var<uniform> scroll : vec2<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let dist = distance(uv, center);
    let wave = sin(dist * 20.0 - time * 2.0);
    let col = vec3<f32>(wave, wave, wave);
    return vec4<f32>(f_graphics_surface(uv, col), 1.0);
}
`
  },
  {
    name: 'Plasma',
    code: `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;
@group(0) @binding(2) var<uniform> mouse : vec2<f32>;
@group(0) @binding(3) var<uniform> scroll : vec2<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let x = uv.x * 10.0;
    let y = uv.y * 10.0;
    let v = sin(x + time) + sin((y + time) * 0.5);
    let cx = x + 0.5 * sin(time / 5.0);
    let cy = y + 0.5 * cos(time / 3.0);
    let v2 = sin(sqrt(100.0 * (cx*cx + cy*cy)) + time);
    let col = sin(vec3<f32>(v + v2, v + v2 + 2.0, v + v2 + 4.0));
    return vec4<f32>(f_graphics_surface(uv, col * 0.5 + 0.5), 1.0);
}
`
  },
  {
    name: 'Grid',
    code: `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;
@group(0) @binding(2) var<uniform> mouse : vec2<f32>;
@group(0) @binding(3) var<uniform> scroll : vec2<f32>;

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    let grid_scale = 10.0;
    let g = fract(uv * grid_scale);
    let line_w = 0.05;
    let lines = step(g.x, line_w) + step(g.y, line_w);
    let col = vec3<f32>(lines, lines * sin(time), lines * cos(time));
    return vec4<f32>(f_graphics_surface(uv, col), 1.0);
}
`
  }
];
