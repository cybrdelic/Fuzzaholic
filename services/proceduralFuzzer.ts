/**
 * Procedural Fuzzer - TRUE FUZZING with NO PRESETS
 *
 * This module provides procedural generation functions that build
 * random GLSL/WGSL expressions from atomic building blocks.
 * NO hardcoded patterns, NO preset effects - just pure procedural generation.
 */

// =============================================
// UNIQUE ID GENERATOR - Prevents variable name collisions
// =============================================
let globalIdCounter = 0;
export function getUniqueId(): number {
  return globalIdCounter++;
}
export function resetUniqueIdCounter(): void {
  globalIdCounter = 0;
}

// =============================================
// ATOMIC BUILDING BLOCKS
// =============================================

// Random value generators
const randFloat = (min: number, max: number): number => min + Math.random() * (max - min);
const randInt = (min: number, max: number): number => Math.floor(randFloat(min, max + 1));
const randBool = (p: number = 0.5): boolean => Math.random() < p;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Generate safe number that avoids edge cases
const generateNumber = (): string => {
  const type = randInt(0, 5);
  let val: number;
  switch (type) {
    case 0: val = randFloat(0.1, 1.0); break;
    case 1: val = randFloat(1.0, 10.0); break;
    case 2: val = randFloat(0.01, 0.1); break;
    case 3: val = randInt(1, 20); break;
    case 4: val = Math.PI * randFloat(0.5, 2.0); break;
    case 5: val = 6.28318 * randFloat(0.5, 2.0); break;
    default: val = 1.0;
  }
  // Ensure we never generate exactly 0 (division issues)
  if (Math.abs(val) < 0.001) val = 0.1;
  return val.toFixed(4);
};

// Atomic vec2 terminals
const generateVec2Terminal = (uvName: string = 'uv'): string => {
  const terminals = [
    () => uvName,
    () => `vec2<f32>(${generateNumber()}, ${generateNumber()})`,
    () => `vec2<f32>(${generateNumber()})`,
    () => `(${uvName} - 0.5)`,
    () => `(${uvName} * ${generateNumber()})`,
    () => `fract(${uvName})`,
    () => `vec2<f32>(time * ${generateNumber()}, time * ${generateNumber()})`,
  ];
  return pick(terminals)();
};

// Atomic scalar terminals
const generateScalarTerminal = (uvName: string = 'uv'): string => {
  const terminals = [
    () => generateNumber(),
    () => `${uvName}.x`,
    () => `${uvName}.y`,
    () => 'time',
    () => `(time * ${generateNumber()})`,
    () => `length(${uvName} - 0.5)`,
    () => `(${uvName}.x + ${uvName}.y)`,
    () => `(${uvName}.x * ${uvName}.y)`,
    () => `atan2(${uvName}.y - 0.5, ${uvName}.x - 0.5)`,
  ];
  return pick(terminals)();
};

// Unary scalar operations
const unaryScalarOps = [
  (x: string) => `sin(${x})`,
  (x: string) => `cos(${x})`,
  (x: string) => `abs(${x})`,
  (x: string) => `fract(${x})`,
  (x: string) => `(1.0 - ${x})`,
  (x: string) => `(${x} * ${x})`,
  (x: string) => `sqrt(abs(${x}))`,
  (x: string) => `exp(-${x})`,
  (x: string) => `(${x} * 0.5 + 0.5)`,
  (x: string) => `smoothstep(0.0, 1.0, ${x})`,
  (x: string) => `clamp(${x}, 0.0, 1.0)`,
];

// Binary scalar operations - all designed to be type-safe
const binaryScalarOps = [
  (a: string, b: string) => `(${a} + ${b})`,
  (a: string, b: string) => `(${a} * ${b})`,
  (a: string, b: string) => `(${a} - ${b})`,
  (a: string, b: string) => `mix(${a}, ${b}, 0.5)`,
  (a: string, b: string) => `min(${a}, ${b})`,
  (a: string, b: string) => `max(${a}, ${b})`,
  (a: string, b: string) => `f_smin(${a}, ${b}, 0.3)`,
  // FIXED: smoothstep with guaranteed low < high using min/max
  (a: string, b: string) => `smoothstep(min(${a}, ${b}), max(${a}, ${b}) + 0.001, 0.5)`,
  (a: string, b: string) => `pow(abs(${a}), clamp(${b}, 0.1, 3.0))`,
];

// Unary vec2 operations
const unaryVec2Ops = [
  (v: string) => `fract(${v})`,
  (v: string) => `abs(${v})`,
  (v: string) => `(${v} * ${generateNumber()})`,
  (v: string) => `(${v} + ${generateNumber()})`,
  (v: string) => `normalize(${v} + 0.001)`,
];

// =============================================
// PROCEDURAL EXPRESSION GENERATORS
// =============================================

/**
 * Generate a random scalar expression procedurally.
 * This is the core recursive expression builder.
 */
export function generateProceduralScalar(uvName: string = 'uv', depth: number = 3): string {
  // Base case - return terminal
  if (depth <= 0 || randBool(0.2)) {
    return generateScalarTerminal(uvName);
  }

  const choice = randInt(0, 4);

  switch (choice) {
    case 0: // Unary operation on recursive expr
      const unaryOp = pick(unaryScalarOps);
      return unaryOp(generateProceduralScalar(uvName, depth - 1));

    case 1: // Binary operation on two recursive exprs
      const binaryOp = pick(binaryScalarOps);
      return binaryOp(
        generateProceduralScalar(uvName, depth - 1),
        generateProceduralScalar(uvName, depth - 1)
      );

    case 2: // Length/distance pattern
      return `length(${generateVec2Terminal(uvName)} - ${generateVec2Terminal(uvName)})`;

    case 3: // Trigonometric composite
      return `sin(${generateProceduralScalar(uvName, depth - 1)} * ${generateNumber()} + ${generateProceduralScalar(uvName, depth - 1)})`;

    case 4: {
      // Smoothstep pattern - FIXED: ensure low < high
      const low = randFloat(0.0, 0.4);
      const high = randFloat(0.6, 1.0);
      return `smoothstep(${low.toFixed(3)}, ${high.toFixed(3)}, ${generateProceduralScalar(uvName, depth - 1)})`;
    }

    default:
      return generateScalarTerminal(uvName);
  }
}

/**
 * Generate a random vec2 warp expression.
 * Used for UV distortion/warping effects.
 */
export function generateProceduralWarp(uvName: string = 'uv', depth: number = 2): string {
  const choice = randInt(0, 5);

  switch (choice) {
    case 0: // Sine wave displacement
      return `${uvName} + vec2<f32>(sin(${generateProceduralScalar(uvName, depth)}) * ${generateNumber()}, cos(${generateProceduralScalar(uvName, depth)}) * ${generateNumber()})`;

    case 1: // Radial warp
      return `0.5 + (${uvName} - 0.5) * (1.0 + ${generateProceduralScalar(uvName, depth)} * ${generateNumber()})`;

    case 2: // Swirl warp
      const angle = `${generateProceduralScalar(uvName, depth)} * ${generateNumber()}`;
      return `vec2<f32>(cos(${angle}), sin(${angle})) * length(${uvName} - 0.5) + 0.5`;

    case 3: // Hash-based noise warp
      return `${uvName} + (vec2<f32>(f_hash(${uvName} * ${generateNumber()} + time * ${generateNumber()}), f_hash(${uvName} * ${generateNumber()} + 50.0)) - 0.5) * ${generateNumber()}`;

    case 4: // Tiling warp
      return `fract(${uvName} * ${generateNumber()} + vec2<f32>(${generateProceduralScalar(uvName, depth - 1)}, ${generateProceduralScalar(uvName, depth - 1)}) * ${generateNumber()})`;

    case 5: // Combined offset
      const op = pick(unaryVec2Ops);
      return op(uvName);

    default:
      return uvName;
  }
}

/**
 * Generate a random vec3 color expression.
 * Builds color computations procedurally.
 */
export function generateProceduralColor(uvName: string = 'uv', depth: number = 3): string {
  const choice = randInt(0, 6);

  switch (choice) {
    case 0: // Scalar to color via vec3
      const scalar = generateProceduralScalar(uvName, depth);
      return `vec3<f32>(${scalar})`;

    case 1: // Three independent channels
      return `vec3<f32>(${generateProceduralScalar(uvName, depth)}, ${generateProceduralScalar(uvName, depth)}, ${generateProceduralScalar(uvName, depth)})`;

    case 2: // Cosine palette style
      const t = generateProceduralScalar(uvName, depth);
      return `vec3<f32>(0.5) + vec3<f32>(0.5) * cos(6.28318 * (vec3<f32>(${generateNumber()}, ${generateNumber()}, ${generateNumber()}) * ${t} + vec3<f32>(${generateNumber()}, ${generateNumber()}, ${generateNumber()})))`;

    case 3: // Mix two colors
      const factor = generateProceduralScalar(uvName, depth);
      return `mix(vec3<f32>(${generateNumber()}, ${generateNumber()}, ${generateNumber()}), vec3<f32>(${generateNumber()}, ${generateNumber()}, ${generateNumber()}), ${factor})`;

    case 4: // HSV-style computation
      const h = generateProceduralScalar(uvName, depth);
      return `vec3<f32>(abs(${h} * 6.0 - 3.0) - 1.0, 2.0 - abs(${h} * 6.0 - 2.0), 2.0 - abs(${h} * 6.0 - 4.0))`;

    case 5: // Swizzle operation
      const baseScalar = generateProceduralScalar(uvName, depth);
      const swizzles = ['xyz', 'zyx', 'xzy', 'yzx', 'yxz', 'zxy'];
      return `vec3<f32>(${baseScalar}, ${generateProceduralScalar(uvName, depth - 1)}, ${generateProceduralScalar(uvName, depth - 1)}).${pick(swizzles)}`;

    case 6: // Gradient blend
      return `mix(vec3<f32>(${generateNumber()}, ${generateNumber()}, ${generateNumber()}), vec3<f32>(${generateNumber()}, ${generateNumber()}, ${generateNumber()}), smoothstep(0.0, 1.0, ${generateProceduralScalar(uvName, depth)}))`;

    default:
      return `vec3<f32>(${generateProceduralScalar(uvName, depth)})`;
  }
}

/**
 * Generate a random post-processing effect expression.
 * Applied to existing color 'col'.
 */
export function generateProceduralPostEffect(uvName: string = 'uv', depth: number = 2): string {
  const choice = randInt(0, 7);

  switch (choice) {
    case 0: // Vignette
      const vignetteStrength = generateNumber();
      return `col * (1.0 - ${vignetteStrength} * length(${uvName} - 0.5))`;

    case 1: // Contrast adjustment
      return `pow(col, vec3<f32>(${generateNumber()}))`;

    case 2: // Saturation shift
      const luma = `dot(col, vec3<f32>(0.299, 0.587, 0.114))`;
      return `mix(vec3<f32>(${luma}), col, ${generateNumber()})`;

    case 3: // Color tint
      return `col * vec3<f32>(${generateNumber()}, ${generateNumber()}, ${generateNumber()})`;

    case 4: // Additive blend
      return `col + vec3<f32>(${generateProceduralScalar(uvName, depth)}) * ${generateNumber()}`;

    case 5: // Mix with pattern
      return `mix(col, col.zyx, ${generateProceduralScalar(uvName, depth)} * ${generateNumber()})`;

    case 6: // Soft clamp
      return `smoothstep(vec3<f32>(0.0), vec3<f32>(1.0), col * ${generateNumber()})`;

    case 7: // Chromatic shift
      return `vec3<f32>(col.r * ${generateNumber()}, col.g, col.b * ${generateNumber()})`;

    default:
      return 'col';
  }
}

/**
 * Generate a random scroll effect expression.
 * Uses scroll uniform for scroll-reactive effects.
 */
export function generateProceduralScrollEffect(uvName: string = 'uv', depth: number = 2): string {
  const choice = randInt(0, 5);

  switch (choice) {
    case 0: // Scroll-based sine modulation
      return `col * (0.85 + 0.15 * sin(scroll.y * ${generateNumber()} + time * ${generateNumber()}))`;

    case 1: // Fract scroll pattern
      return `col * (0.9 + 0.1 * fract(scroll.y * ${generateNumber()} + time * ${generateNumber()}))`;

    case 2: // Smoothstep scroll
      return `col * smoothstep(0.7, 1.3, 1.0 + ${generateProceduralScalar(uvName, depth)} * sin(scroll.y * ${generateNumber()}))`;

    case 3: // Mixed scroll/UV
      return `col * (0.8 + 0.2 * ${generateProceduralScalar(uvName, depth)} * (0.5 + 0.5 * sin(scroll.y * ${generateNumber()})))`;

    case 4: // Scroll color shift
      return `mix(col, col.zyx, sin(scroll.y * ${generateNumber()} + time * ${generateNumber()}) * ${generateNumber()})`;

    case 5: // Layered scroll
      return `col * (0.9 + 0.1 * sin(scroll.y * ${generateNumber()}) * cos(scroll.x * ${generateNumber()} + time))`;

    default:
      return 'col';
  }
}

/**
 * Generate a random cursor effect expression.
 * Uses mouse uniform for cursor-reactive effects.
 */
export function generateProceduralCursorEffect(uvName: string = 'uv', depth: number = 3): string {
  // Build procedural cursor influence
  const cursorDist = `length(${uvName} - mouse)`;
  const cursorAngle = `atan2(${uvName}.y - mouse.y, ${uvName}.x - mouse.x)`;

  const choice = randInt(0, 6);

  switch (choice) {
    case 0: // Distance-based color modulation
      const influence0 = `exp(-${cursorDist} * ${generateNumber()})`;
      return `col + vec3<f32>(${generateProceduralScalar(uvName, depth)}, ${generateProceduralScalar(uvName, depth)}, ${generateProceduralScalar(uvName, depth)}) * ${influence0}`;

    case 1: // Angular pattern
      const angularPattern = `sin(${cursorAngle} * ${generateNumber()} + time * ${generateNumber()} + ${cursorDist} * ${generateNumber()})`;
      return `mix(col, col.zyx, ${angularPattern} * 0.5 + 0.5 * exp(-${cursorDist} * ${generateNumber()}))`;

    case 2: // Ripple effect
      const ripple = `sin(${cursorDist} * ${generateNumber()} - time * ${generateNumber()}) * exp(-${cursorDist} * ${generateNumber()})`;
      return `col + vec3<f32>(${ripple} * ${generateNumber()})`;

    case 3: // Swirl influence
      const swirl = `sin(${cursorAngle} * ${generateNumber()} + ${cursorDist} * ${generateNumber()} - time * ${generateNumber()})`;
      return `col * (1.0 + ${swirl} * ${generateNumber()} * exp(-${cursorDist} * ${generateNumber()}))`;

    case 4: // Multi-layer cursor
      const layer1 = `sin(${cursorDist} * ${generateNumber()})`;
      const layer2 = `cos(${cursorAngle} * ${generateNumber()} + time)`;
      return `col + vec3<f32>(${layer1} * ${layer2}) * ${generateNumber()} * smoothstep(${generateNumber()}, 0.0, ${cursorDist})`;

    case 5: // Fractal cursor distance
      const fractalDist = `fract(${cursorDist} * ${generateNumber()} - time * ${generateNumber()})`;
      return `mix(col, vec3<f32>(${generateNumber()}, ${generateNumber()}, ${generateNumber()}), smoothstep(0.4, 0.6, ${fractalDist}) * exp(-${cursorDist} * ${generateNumber()}))`;

    case 6: // Complex procedural
      const complexInfluence = generateProceduralScalar(uvName, depth);
      return `col * (1.0 + (${complexInfluence} - 0.5) * ${generateNumber()} * exp(-${cursorDist} * ${generateNumber()}))`;

    default:
      return 'col';
  }
}

/**
 * Generate a complete procedural layer pattern.
 * Returns WGSL code for a pattern layer with unique variable name.
 */
export function generateProceduralLayer(uvName: string = 'uv', layerId: number): string {
  const varName = `layer_${layerId}`;
  const expr = generateProceduralScalar(uvName, 3);
  return `let ${varName} = ${expr};`;
}

/**
 * Generate procedural UV transformation code.
 * Returns WGSL code that transforms UV coordinates.
 */
export function generateProceduralUVTransform(uvName: string = 'uv', transformId: number): string {
  const warpedName = `warp_${transformId}`;
  const warpExpr = generateProceduralWarp(uvName, 2);
  return `var ${warpedName} = ${warpExpr};`;
}

// =============================================
// COMPLETE SHADER GENERATORS
// =============================================

/**
 * Generate a complete procedural shader from scratch.
 * NO PRESETS - purely procedural generation.
 * Uses unique IDs to prevent variable name collisions.
 */
export function generateFullProceduralShader(): string {
  // Reset the unique ID counter for fresh shader generation
  resetUniqueIdCounter();

  const uvName = 'uv';

  // Generate random number of layers (1-4)
  const numLayers = randInt(1, 4);
  const layers: string[] = [];
  const layerNames: string[] = [];

  for (let i = 0; i < numLayers; i++) {
    const layerId = getUniqueId();
    layers.push(generateProceduralLayer(uvName, layerId));
    layerNames.push(`layer_${layerId}`);
  }

  // Combine layers into color expression
  let colorExpr: string;
  if (layerNames.length === 1) {
    colorExpr = `vec3<f32>(${layerNames[0]})`;
  } else if (layerNames.length === 2) {
    colorExpr = `vec3<f32>(${layerNames[0]}, ${layerNames[1]}, (${layerNames[0]} + ${layerNames[1]}) * 0.5)`;
  } else {
    colorExpr = `vec3<f32>(${layerNames[0]}, ${layerNames[1]}, ${layerNames[2]})`;
  }

  // Add more color complexity
  if (randBool(0.6)) {
    const extraColor = generateProceduralColor(uvName, 2);
    colorExpr = `mix(${colorExpr}, ${extraColor}, ${generateNumber()})`;
  }

  const shader = `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;
@group(0) @binding(2) var<uniform> mouse : vec2<f32>;
@group(0) @binding(3) var<uniform> scroll : vec2<f32>;

fn f_hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.13);
    p3 = p3 + dot(p3, vec3<f32>(p3.y, p3.z, p3.x) + 3.333);
    return fract((p3.x + p3.y) * p3.z);
}

fn f_smin(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

@fragment
fn main(@location(0) ${uvName} : vec2<f32>) -> @location(0) vec4<f32> {
    // Procedurally generated layers
${layers.map(l => '    ' + l).join('\n')}

    // Procedurally generated color
    var col = ${colorExpr};

    // Ensure valid output
    col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

    return vec4<f32>(col, 1.0);
}
`;

  return shader;
}

/**
 * Generate a procedural aesthetic shader.
 * Focused on visually pleasing procedural patterns.
 * Uses unique IDs to prevent variable name collisions.
 */
export function generateProceduralAestheticShader(): string {
  // Reset the unique ID counter for fresh shader generation
  resetUniqueIdCounter();

  const uid = getUniqueId();
  const uvName = 'uv';

  // Generate procedural pattern
  const pattern = generateProceduralScalar(uvName, 4);

  // Generate procedural color
  const colorExpr = generateProceduralColor(uvName, 3);

  // Generate post effect
  const postEffect = generateProceduralPostEffect(uvName, 2);

  const shader = `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;
@group(0) @binding(2) var<uniform> mouse : vec2<f32>;
@group(0) @binding(3) var<uniform> scroll : vec2<f32>;

fn f_hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.13);
    p3 = p3 + dot(p3, vec3<f32>(p3.y, p3.z, p3.x) + 3.333);
    return fract((p3.x + p3.y) * p3.z);
}

fn f_smin(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

@fragment
fn main(@location(0) ${uvName} : vec2<f32>) -> @location(0) vec4<f32> {
    // Procedural pattern: ${uid}
    let pattern = ${pattern};

    // Procedural color mixing
    var col = ${colorExpr};

    // Apply pattern
    col = col * (0.7 + 0.6 * pattern);

    // Post-processing
    col = ${postEffect};

    // Vignette
    let vignette = smoothstep(1.2, 0.5, length(${uvName} - 0.5) * 1.5);
    col = col * (0.7 + 0.3 * vignette);

    return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

  return shader;
}

// =============================================
// SHADER MUTATION HELPERS
// =============================================

/**
 * Generate a procedural warp injection for existing shaders.
 * Returns WGSL code to inject at function body start.
 * Uses unique ID to prevent variable name collisions.
 */
export function generateWarpInjection(uvName: string = 'uv'): { code: string; warpedUvName: string } {
  const uid = getUniqueId();
  const warpedName = `warp_${uid}`;
  const warpExpr = generateProceduralWarp(uvName, 2);

  return {
    code: `var ${warpedName} = ${warpExpr};`,
    warpedUvName: warpedName
  };
}

/**
 * Generate a procedural layer injection.
 * Returns WGSL code to add a new pattern layer.
 * Uses unique ID to prevent variable name collisions.
 */
export function generateLayerInjection(uvName: string = 'uv'): { code: string; layerName: string } {
  const uid = getUniqueId();
  const layerName = `layer_${uid}`;
  const layerExpr = generateProceduralScalar(uvName, 3);

  return {
    code: `let ${layerName} = ${layerExpr};`,
    layerName
  };
}

/**
 * Generate a procedural color modifier.
 * Returns an expression to modify existing col variable.
 */
export function generateColorModifier(uvName: string = 'uv'): string {
  const choice = randInt(0, 4);

  switch (choice) {
    case 0:
      return `mix(col, ${generateProceduralColor(uvName, 2)}, ${generateNumber()})`;
    case 1:
      return `col * (0.8 + 0.4 * ${generateProceduralScalar(uvName, 2)})`;
    case 2:
      return `col + vec3<f32>(${generateProceduralScalar(uvName, 2)} * ${generateNumber()})`;
    case 3:
      return `mix(col, col.zyx, ${generateProceduralScalar(uvName, 2)} * ${generateNumber()})`;
    case 4:
      return generateProceduralPostEffect(uvName, 2);
    default:
      return 'col';
  }
}
