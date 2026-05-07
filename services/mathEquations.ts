/**
 * MATHEMATICAL EQUATIONS LIBRARY
 *
 * An extensive collection of mathematical equations, fractals, and patterns
 * that can be used to generate stunning shader visualizations.
 * Each equation is a template that can be parameterized with UV coordinates and time.
 */

// Type for equation templates
export interface MathEquation {
  name: string;
  category: 'fractal' | 'wave' | 'geometric' | 'noise' | 'field' | 'spiral' | 'cellular' | 'exotic' | '3d' | 'pro';
  // Expression template - uses placeholders: {uv}, {time}, {x}, {y}
  scalarExpr: string;
  // Optional color expression
  colorExpr?: string;
}

/**
 * Extensive library of mathematical equations for shader generation
 */
export const MATH_EQUATIONS: MathEquation[] = [
  // === WAVE EQUATIONS ===
  {
    name: 'Sine Wave',
    category: 'wave',
    scalarExpr: 'sin({x} * 10.0 + {time})',
  },
  {
    name: 'Cosine Ripple',
    category: 'wave',
    scalarExpr: 'cos(length({uv} - 0.5) * 20.0 - {time} * 3.0)',
  },
  {
    name: 'Standing Wave',
    category: 'wave',
    scalarExpr: 'sin({x} * 8.0) * cos({y} * 8.0 + {time})',
  },
  {
    name: 'Interference Pattern',
    category: 'wave',
    scalarExpr: 'sin({x} * 10.0 + {time}) + sin({y} * 10.0 - {time}) + sin(({x} + {y}) * 7.07)',
  },
  {
    name: 'Damped Oscillation',
    category: 'wave',
    scalarExpr: 'exp(-length({uv} - 0.5) * 3.0) * sin(length({uv} - 0.5) * 30.0 - {time} * 5.0)',
  },
  {
    name: 'Bessel Wave',
    category: 'wave',
    scalarExpr: 'sin(length({uv} - 0.5) * 25.0 - {time}) / (length({uv} - 0.5) + 0.1)',
  },
  {
    name: 'Superposition',
    category: 'wave',
    scalarExpr: 'sin({x} * 5.0 + {time}) * 0.5 + sin({x} * 13.0 - {time} * 1.5) * 0.3 + sin({x} * 29.0 + {time} * 0.7) * 0.2',
  },
  {
    name: 'Doppler Wave',
    category: 'wave',
    scalarExpr: 'sin((length({uv} - vec2<f32>(0.5 + sin({time}) * 0.3, 0.5)) * 20.0) - {time} * 8.0)',
  },

  // === SPIRAL EQUATIONS ===
  {
    name: 'Archimedean Spiral',
    category: 'spiral',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) * 5.0 + length({uv} - 0.5) * 20.0 - {time} * 2.0)',
  },
  {
    name: 'Logarithmic Spiral',
    category: 'spiral',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) * 3.0 + log(length({uv} - 0.5) + 0.01) * 10.0 - {time})',
  },
  {
    name: 'Fermat Spiral',
    category: 'spiral',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) * 8.0 + sqrt(length({uv} - 0.5)) * 25.0 - {time} * 1.5)',
  },
  {
    name: 'Golden Spiral',
    category: 'spiral',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) * 1.618 + log(length({uv} - 0.5) + 0.001) * 6.18 - {time})',
  },
  {
    name: 'Double Spiral',
    category: 'spiral',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) * 2.0 + length({uv} - 0.5) * 15.0 - {time}) * sin(atan2({y} - 0.5, {x} - 0.5) * 7.0 - length({uv} - 0.5) * 10.0 + {time})',
  },
  {
    name: 'Hyperbolic Spiral',
    category: 'spiral',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) + 1.0 / (length({uv} - 0.5) + 0.1) - {time} * 0.5)',
  },

  // === GEOMETRIC PATTERNS ===
  {
    name: 'Checkerboard',
    category: 'geometric',
    scalarExpr: 'step(0.5, fract({x} * 5.0 + floor({y} * 5.0) * 0.5))',
  },
  {
    name: 'Concentric Circles',
    category: 'geometric',
    scalarExpr: 'step(0.5, fract(length({uv} - 0.5) * 10.0 - {time} * 0.5))',
  },
  {
    name: 'Radial Rays',
    category: 'geometric',
    scalarExpr: 'step(0.5, fract(atan2({y} - 0.5, {x} - 0.5) * 3.183 + {time} * 0.2))',
  },
  {
    name: 'Hexagonal Grid',
    category: 'geometric',
    scalarExpr: 'sin(({x} * 10.0) + sin({y} * 17.32)) * sin(({y} * 10.0) + sin({x} * 17.32))',
  },
  {
    name: 'Triangular Lattice',
    category: 'geometric',
    scalarExpr: 'max(max(sin({x} * 10.0 + {y} * 5.77), sin({y} * 11.55)), sin({x} * 10.0 - {y} * 5.77))',
  },
  {
    name: 'Voronoi Distance',
    category: 'geometric',
    scalarExpr: 'min(min(length(fract({uv} * 4.0) - 0.5), length(fract({uv} * 4.0 + 0.5) - 0.5)), length(fract({uv} * 4.0 - vec2<f32>(0.5, 0.0)) - 0.5))',
  },
  {
    name: 'Diamond Pattern',
    category: 'geometric',
    scalarExpr: 'abs(fract({x} * 5.0) - 0.5) + abs(fract({y} * 5.0) - 0.5)',
  },
  {
    name: 'Moire Pattern',
    category: 'geometric',
    scalarExpr: 'sin(length({uv} * 20.0) * 3.0) * sin(length(({uv} - 0.1) * 20.0) * 3.0)',
  },
  {
    name: 'Star Polygon',
    category: 'geometric',
    scalarExpr: 'cos(atan2({y} - 0.5, {x} - 0.5) * 5.0) * 0.3 + 0.2 - length({uv} - 0.5)',
  },
  {
    name: 'Truchet Tiles',
    category: 'geometric',
    scalarExpr: 'abs(sin(floor({x} * 5.0) * 127.1 + floor({y} * 5.0) * 311.7) - 0.5) * 2.0 * (fract({x} * 5.0) - 0.5) + (fract({y} * 5.0) - 0.5)',
  },

  // === FRACTAL-LIKE PATTERNS ===
  {
    name: 'Mandelbrot Approximation',
    category: 'fractal',
    scalarExpr: 'sin(({x} * {x} - {y} * {y} + {x}) * 10.0) * cos(2.0 * {x} * {y} + {y} + {time}) * 5.0',
  },
  {
    name: 'Julia Set Trace',
    category: 'fractal',
    scalarExpr: 'length(vec2<f32>({x} * {x} - {y} * {y} + sin({time}) * 0.3, 2.0 * {x} * {y} + cos({time}) * 0.3)) - 0.5',
  },
  {
    name: 'Fractal Noise Sum',
    category: 'fractal',
    scalarExpr: 'f_n({x} * 2.0) * 0.5 + f_n({x} * 4.0) * 0.25 + f_n({x} * 8.0) * 0.125 + f_n({y} * 2.0 + {time}) * 0.5',
  },
  {
    name: 'Sierpinski Carpet',
    category: 'fractal',
    scalarExpr: 'step(0.33, max(abs(fract({x} * 3.0) - 0.5), abs(fract({y} * 3.0) - 0.5))) * step(0.33, max(abs(fract({x} * 9.0) - 0.5), abs(fract({y} * 9.0) - 0.5)))',
  },
  {
    name: 'Cantor Dust',
    category: 'fractal',
    scalarExpr: 'step(0.33, fract({x} * 3.0)) * step(0.33, fract({y} * 3.0)) * step(0.33, fract({x} * 9.0)) * step(0.33, fract({y} * 9.0))',
  },
  {
    name: 'Koch Snowflake Approx',
    category: 'fractal',
    scalarExpr: 'abs(sin(atan2({y} - 0.5, {x} - 0.5) * 6.0) * length({uv} - 0.5) * 3.0 - 0.5)',
  },
  {
    name: 'IFS Fern Pattern',
    category: 'fractal',
    scalarExpr: 'sin(f_n({x} * 10.0 + {time}) * 20.0 + {y} * 30.0) * f_n({y} * 5.0)',
  },
  {
    name: 'Apollonian Gasket',
    category: 'fractal',
    scalarExpr: '1.0 / (length({uv} - 0.3) + 0.1) + 1.0 / (length({uv} - 0.7) + 0.1) + 1.0 / (length({uv} - vec2<f32>(0.5, 0.8)) + 0.1)',
  },

  // === NOISE PATTERNS ===
  {
    name: 'Value Noise',
    category: 'noise',
    scalarExpr: 'f_n({x} * 5.0 + {time}) * f_n({y} * 5.0)',
  },
  {
    name: 'Gradient Noise',
    category: 'noise',
    scalarExpr: 'f_hash({uv} * 5.0 + vec2<f32>({time}, 0.0))',
  },
  {
    name: 'FBM Noise',
    category: 'noise',
    scalarExpr: 'f_hash({uv} * 2.0) * 0.5 + f_hash({uv} * 4.0) * 0.25 + f_hash({uv} * 8.0) * 0.125 + f_hash({uv} * 16.0) * 0.0625',
  },
  {
    name: 'Turbulence',
    category: 'noise',
    scalarExpr: 'abs(f_hash({uv} * 2.0) - 0.5) + abs(f_hash({uv} * 4.0) - 0.5) * 0.5 + abs(f_hash({uv} * 8.0) - 0.5) * 0.25',
  },
  {
    name: 'Worley Noise',
    category: 'noise',
    scalarExpr: 'min(length(fract({uv} * 3.0) - 0.5), min(length(fract({uv} * 3.0 + 0.33) - 0.5), length(fract({uv} * 3.0 - 0.33) - 0.5)))',
  },
  {
    name: 'Ridged Noise',
    category: 'noise',
    scalarExpr: '1.0 - abs(f_n({x} * 5.0 + {time}) * 2.0 - 1.0)',
  },
  {
    name: 'Domain Warped Noise',
    category: 'noise',
    scalarExpr: 'f_hash({uv} + vec2<f32>(f_hash({uv} * 2.0 + {time}), f_hash({uv} * 2.0 + 5.0)))',
  },
  {
    name: 'Marble Texture',
    category: 'noise',
    scalarExpr: 'sin({x} * 10.0 + f_n({x} * 5.0) * 5.0 + f_n({y} * 5.0) * 5.0)',
  },
  {
    name: 'Wood Grain',
    category: 'noise',
    scalarExpr: 'sin(length({uv} - 0.5) * 50.0 + f_hash({uv} * 3.0) * 10.0)',
  },

  // === FIELD EQUATIONS ===
  {
    name: 'Electric Field',
    category: 'field',
    scalarExpr: '1.0 / (length({uv} - vec2<f32>(0.3, 0.5)) + 0.05) - 1.0 / (length({uv} - vec2<f32>(0.7, 0.5)) + 0.05)',
  },
  {
    name: 'Magnetic Dipole',
    category: 'field',
    scalarExpr: 'atan2({y} - 0.5, {x} - 0.3) - atan2({y} - 0.5, {x} - 0.7)',
  },
  {
    name: 'Gravitational Lens',
    category: 'field',
    scalarExpr: 'length({uv} - 0.5 + 0.2 / (length({uv} - 0.5) + 0.1) * ({uv} - 0.5))',
  },
  {
    name: 'Vector Field Curl',
    category: 'field',
    scalarExpr: 'sin({x} * 6.283) * cos({y} * 6.283 + {time})',
  },
  {
    name: 'Potential Field',
    category: 'field',
    scalarExpr: 'sin(1.0 / (length({uv} - 0.3) + 0.1) + 1.0 / (length({uv} - 0.7) + 0.1) + {time})',
  },
  {
    name: 'Flow Lines',
    category: 'field',
    scalarExpr: 'sin(atan2({y} - 0.5 + sin({x} * 6.0) * 0.1, {x} - 0.5) * 10.0 + {time})',
  },
  {
    name: 'Vortex Field',
    category: 'field',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) * 3.0 + log(length({uv} - 0.5) + 0.01) * 5.0 - {time} * 2.0)',
  },
  {
    name: 'Saddle Point',
    category: 'field',
    scalarExpr: '({x} - 0.5) * ({y} - 0.5) * 4.0',
  },

  // === CELLULAR PATTERNS ===
  {
    name: 'Cell Division',
    category: 'cellular',
    scalarExpr: 'smoothstep(0.4, 0.5, length(fract({uv} * 5.0) - 0.5))',
  },
  {
    name: 'Bubble Field',
    category: 'cellular',
    scalarExpr: 'max(0.0, 0.3 - length(fract({uv} * 4.0 + vec2<f32>(sin({time} + floor({uv}.x * 4.0)), cos({time} + floor({uv}.y * 4.0))) * 0.1) - 0.5))',
  },
  {
    name: 'Reaction Diffusion',
    category: 'cellular',
    scalarExpr: 'sin(f_hash({uv} * 3.0) * 20.0 + {time}) * cos(f_hash({uv} * 3.0 + 0.5) * 20.0 - {time})',
  },
  {
    name: 'Organic Cells',
    category: 'cellular',
    scalarExpr: 'f_smin(length(fract({uv} * 3.0) - 0.5), length(fract({uv} * 3.0 + 0.5) - 0.5), 0.3)',
  },
  {
    name: 'Neural Network',
    category: 'cellular',
    scalarExpr: 'sin(f_hash({uv} * 2.0) * 6.283 + {time}) * 0.5 + sin(f_hash({uv} * 4.0) * 6.283 - {time}) * 0.3',
  },
  {
    name: 'Crystalline',
    category: 'cellular',
    scalarExpr: 'min(min(abs({x} * 5.0 - floor({x} * 5.0 + 0.5)), abs({y} * 5.0 - floor({y} * 5.0 + 0.5))), abs(({x} + {y}) * 3.53 - floor(({x} + {y}) * 3.53 + 0.5)))',
  },

  // === EXOTIC / SPECIAL FUNCTIONS ===
  {
    name: 'Lissajous Curve',
    category: 'exotic',
    scalarExpr: 'length({uv} - vec2<f32>(sin({time} * 3.0) * 0.3 + 0.5, sin({time} * 2.0) * 0.3 + 0.5)) - 0.1',
  },
  {
    name: 'Harmonograph',
    category: 'exotic',
    scalarExpr: 'sin({x} * 10.0 + sin({time}) * 5.0) * sin({y} * 10.0 + cos({time} * 1.1) * 5.0) * exp(-length({uv} - 0.5) * 0.5)',
  },
  {
    name: 'Rose Curve',
    category: 'exotic',
    scalarExpr: 'cos(atan2({y} - 0.5, {x} - 0.5) * 5.0 + {time}) * 0.3 - length({uv} - 0.5) + 0.2',
  },
  {
    name: 'Butterfly Curve',
    category: 'exotic',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5)) * (exp(cos(atan2({y} - 0.5, {x} - 0.5))) - 2.0 * cos(4.0 * atan2({y} - 0.5, {x} - 0.5))) * 0.1 - length({uv} - 0.5) + 0.3',
  },
  {
    name: 'Superellipse',
    category: 'exotic',
    scalarExpr: 'pow(abs({x} - 0.5) * 2.0, 2.5) + pow(abs({y} - 0.5) * 2.0, 2.5) - 0.5',
  },
  {
    name: 'Astroid',
    category: 'exotic',
    scalarExpr: 'pow(abs({x} - 0.5), 0.666) + pow(abs({y} - 0.5), 0.666) - 0.6',
  },
  {
    name: 'Epitrochoid',
    category: 'exotic',
    scalarExpr: 'length({uv} - vec2<f32>(0.5 + cos({time}) * 0.2 + cos({time} * 5.0) * 0.1, 0.5 + sin({time}) * 0.2 + sin({time} * 5.0) * 0.1)) - 0.05',
  },
  {
    name: 'Cardioid',
    category: 'exotic',
    scalarExpr: 'length({uv} - 0.5) - (1.0 - cos(atan2({y} - 0.5, {x} - 0.5))) * 0.15',
  },
  {
    name: 'Limacon',
    category: 'exotic',
    scalarExpr: 'length({uv} - 0.5) - (0.15 + 0.1 * cos(atan2({y} - 0.5, {x} - 0.5) + {time}))',
  },
  {
    name: 'Hypocycloid',
    category: 'exotic',
    scalarExpr: 'length({uv} - vec2<f32>(0.5 + cos({time}) * 0.15 - cos({time} * 3.0) * 0.05, 0.5 + sin({time}) * 0.15 - sin({time} * 3.0) * 0.05)) - 0.03',
  },
  {
    name: 'Zeta Function',
    category: 'exotic',
    scalarExpr: 'sin(1.0 / ({x} - 0.5 + 0.001) + {time}) * sin(1.0 / ({y} - 0.5 + 0.001))',
  },
  {
    name: 'Weierstrass',
    category: 'exotic',
    scalarExpr: 'cos({x} * 3.14159) + cos({x} * 6.28318) * 0.5 + cos({x} * 12.56637) * 0.25 + cos({x} * 25.13274) * 0.125',
  },
  {
    name: 'Plasma Membrane',
    category: 'exotic',
    scalarExpr: 'sin({x} * 10.0 + sin({y} * 10.0 + {time}) * 2.0) * sin({y} * 10.0 + sin({x} * 10.0 - {time}) * 2.0)',
  },
  {
    name: 'Quantum Interference',
    category: 'exotic',
    scalarExpr: 'cos(length({uv} - 0.3) * 30.0 - {time} * 3.0) + cos(length({uv} - 0.7) * 30.0 - {time} * 3.0)',
  },
  {
    name: 'Strange Attractor',
    category: 'exotic',
    scalarExpr: 'sin(sin({x} * 10.0) * 3.0 + {y} * 10.0 + {time}) * cos(sin({y} * 10.0) * 3.0 + {x} * 10.0 - {time})',
  },
  {
    name: 'Moebius Transform',
    category: 'exotic',
    scalarExpr: 'atan2(({y} - 0.5) / (({x} - 0.5) * ({x} - 0.5) + ({y} - 0.5) * ({y} - 0.5) + 0.01), (({x} - 0.5) / (({x} - 0.5) * ({x} - 0.5) + ({y} - 0.5) * ({y} - 0.5) + 0.01) - 0.5))',
  },
  {
    name: 'Hyperbolic Paraboloid',
    category: 'exotic',
    scalarExpr: '({x} - 0.5) * ({x} - 0.5) - ({y} - 0.5) * ({y} - 0.5) + sin({time}) * 0.2',
  },
  {
    name: 'Klein Bottle Projection',
    category: 'exotic',
    scalarExpr: 'sin(({x} - 0.5) * 6.283 + sin(({y} - 0.5) * 6.283 + {time}) * 2.0)',
  },
  {
    name: 'Torus Knot',
    category: 'exotic',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) * 3.0 + {time}) * sin(atan2({y} - 0.5, {x} - 0.5) * 2.0 + length({uv} - 0.5) * 10.0)',
  },

  // === 3D PROJECTIONS & RAYMARCHING-INSPIRED ===
  {
    name: '3D Sphere',
    category: '3d',
    scalarExpr: 'sqrt(max(0.0, 0.25 - ({x} - 0.5) * ({x} - 0.5) - ({y} - 0.5) * ({y} - 0.5)))',
  },
  {
    name: '3D Torus',
    category: '3d',
    scalarExpr: 'sin(length(vec2<f32>(length({uv} - 0.5) - 0.25, sin(atan2({y} - 0.5, {x} - 0.5) * 3.0 + {time}) * 0.1)) * 30.0)',
  },
  {
    name: '3D Gyroid',
    category: '3d',
    scalarExpr: 'sin({x} * 15.0) * cos({y} * 15.0) + sin({y} * 15.0) * cos({time} * 2.0) + sin({time} * 2.0) * cos({x} * 15.0)',
  },
  {
    name: '3D Schwarz P Surface',
    category: '3d',
    scalarExpr: 'cos({x} * 12.0 + {time}) + cos({y} * 12.0) + cos(({x} + {y}) * 8.0 - {time})',
  },
  {
    name: '3D Diamond Surface',
    category: '3d',
    scalarExpr: 'sin({x} * 10.0) * sin({y} * 10.0) * sin(({x} + {y}) * 7.0 + {time}) + cos({x} * 10.0) * cos({y} * 10.0) * cos(({x} - {y}) * 7.0)',
  },
  {
    name: '3D Neovius Surface',
    category: '3d',
    scalarExpr: '3.0 * (cos({x} * 10.0) + cos({y} * 10.0) + cos({time})) + 4.0 * cos({x} * 10.0) * cos({y} * 10.0) * cos({time} * 0.5)',
  },
  {
    name: '3D SDF Box',
    category: '3d',
    scalarExpr: 'max(max(abs({x} - 0.5) - 0.2, abs({y} - 0.5) - 0.2), abs(sin({time}) * 0.3) - 0.15)',
  },
  {
    name: '3D SDF Octahedron',
    category: '3d',
    scalarExpr: '(abs({x} - 0.5) + abs({y} - 0.5) + abs(sin({time} * 0.5) * 0.3)) * 0.577 - 0.2',
  },
  {
    name: '3D Metaballs',
    category: '3d',
    scalarExpr: '1.0 / (length({uv} - vec2<f32>(0.3 + sin({time}) * 0.1, 0.5)) + 0.1) + 1.0 / (length({uv} - vec2<f32>(0.7 - sin({time}) * 0.1, 0.5)) + 0.1) + 1.0 / (length({uv} - vec2<f32>(0.5, 0.3 + cos({time}) * 0.1)) + 0.1)',
  },
  {
    name: '3D Infinite Cylinders',
    category: '3d',
    scalarExpr: 'min(length(fract({uv} * 3.0) - 0.5), min(length(fract({uv} * 3.0 + 0.5) - 0.5), length(fract({uv}.yx * 3.0) - 0.5))) - 0.15 + sin({time}) * 0.05',
  },
  {
    name: '3D Twist',
    category: '3d',
    scalarExpr: 'length(vec2<f32>(({x} - 0.5) * cos({y} * 6.0 + {time}) - sin({y} * 6.0 + {time}) * 0.2, ({x} - 0.5) * sin({y} * 6.0 + {time}) + cos({y} * 6.0 + {time}) * 0.2)) - 0.15',
  },
  {
    name: '3D Fractal Pyramid',
    category: '3d',
    scalarExpr: 'max(abs({x} - 0.5) + abs({y} - 0.5) - 0.4, max(abs(fract({x} * 2.0) - 0.5) + abs(fract({y} * 2.0) - 0.5) - 0.2, abs(fract({x} * 4.0) - 0.5) + abs(fract({y} * 4.0) - 0.5) - 0.1))',
  },
  {
    name: '3D Helix',
    category: '3d',
    scalarExpr: 'length(vec2<f32>(length({uv} - 0.5) - 0.2, fract(atan2({y} - 0.5, {x} - 0.5) / 6.283 + {y} * 2.0 - {time} * 0.2) - 0.5)) - 0.05',
  },
  {
    name: '3D Möbius Strip',
    category: '3d',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) + length({uv} - 0.5) * 5.0 + {time}) * cos(atan2({y} - 0.5, {x} - 0.5) * 0.5) * (length({uv} - 0.5) - 0.2)',
  },
  {
    name: '3D Klein Surface',
    category: '3d',
    scalarExpr: 'sin(({x} - 0.5) * 8.0 + cos(({y} - 0.5) * 8.0 + {time}) * 2.0) * cos(({y} - 0.5) * 4.0 + sin(({x} - 0.5) * 4.0 - {time}) * 2.0)',
  },
  {
    name: '3D Perlin Terrain',
    category: '3d',
    scalarExpr: 'f_n({x} * 4.0) * 0.5 + f_n({x} * 8.0 + {time} * 0.1) * 0.25 + f_n({y} * 4.0) * 0.5 + f_n({y} * 8.0) * 0.25 - {y}',
  },

  // === PRO DESIGNER PATTERNS ===
  {
    name: 'Pro Chromatic Aberration',
    category: 'pro',
    scalarExpr: 'sin(length({uv} - 0.5 + vec2<f32>(0.02, 0.0)) * 20.0 - {time}) * 0.33 + sin(length({uv} - 0.5) * 20.0 - {time}) * 0.34 + sin(length({uv} - 0.5 - vec2<f32>(0.02, 0.0)) * 20.0 - {time}) * 0.33',
  },
  {
    name: 'Pro Fluid Dynamics',
    category: 'pro',
    scalarExpr: 'sin(f_n({x} * 3.0 + {time} * 0.2) * 10.0 + {y} * 8.0 + f_n({y} * 3.0) * 10.0) * cos(f_n({y} * 3.0 - {time} * 0.15) * 10.0 + {x} * 8.0)',
  },
  {
    name: 'Pro Caustics',
    category: 'pro',
    scalarExpr: 'pow(0.5 + 0.5 * sin(({x} * 10.0 + sin({y} * 5.0 + {time})) * 3.0) * sin(({y} * 10.0 + sin({x} * 5.0 - {time} * 0.7)) * 3.0), 2.0)',
  },
  {
    name: 'Pro Volumetric Light',
    category: 'pro',
    scalarExpr: 'exp(-length({uv} - vec2<f32>(0.5 + sin({time} * 0.3) * 0.2, 0.3)) * 4.0) * (1.0 + sin(atan2({y} - 0.3, {x} - 0.5 - sin({time} * 0.3) * 0.2) * 8.0 + {time}) * 0.3)',
  },
  {
    name: 'Pro Glass Refraction',
    category: 'pro',
    scalarExpr: 'sin(({x} + sin({y} * 10.0 + {time}) * 0.05) * 15.0) * sin(({y} + sin({x} * 10.0 - {time} * 0.7) * 0.05) * 15.0)',
  },
  {
    name: 'Pro Iridescence',
    category: 'pro',
    scalarExpr: 'sin(length({uv} - 0.5) * 30.0 + atan2({y} - 0.5, {x} - 0.5) * 3.0 - {time} * 2.0) * sin(length({uv} - 0.5) * 15.0 - atan2({y} - 0.5, {x} - 0.5) * 5.0 + {time})',
  },
  {
    name: 'Pro Holographic',
    category: 'pro',
    scalarExpr: 'sin({x} * 50.0 + sin({y} * 3.0 + {time}) * 5.0) * 0.5 + sin({y} * 50.0 + sin({x} * 3.0 - {time} * 0.7) * 5.0) * 0.5',
  },
  {
    name: 'Pro Subsurface Scatter',
    category: 'pro',
    scalarExpr: 'exp(-length({uv} - 0.5) * 2.0) * (0.7 + 0.3 * f_n(length({uv} - 0.5) * 10.0 + {time} * 0.5)) + exp(-length({uv} - vec2<f32>(0.6, 0.4)) * 4.0) * 0.3',
  },
  {
    name: 'Pro Anisotropic',
    category: 'pro',
    scalarExpr: 'sin(atan2({y} - 0.5, {x} - 0.5) * 20.0 + length({uv} - 0.5) * 5.0 - {time}) * exp(-abs(length({uv} - 0.5) - 0.25) * 10.0)',
  },
  {
    name: 'Pro Film Grain',
    category: 'pro',
    scalarExpr: 'f_hash({uv} * 100.0 + {time}) * 0.15 + smoothstep(0.0, 1.0, 1.0 - length({uv} - 0.5) * 1.5) * 0.85',
  },
  {
    name: 'Pro Depth of Field',
    category: 'pro',
    scalarExpr: 'mix(sin(length({uv} - 0.5) * 40.0 - {time}), sin(length({uv} - 0.5) * 10.0 - {time} * 0.5), smoothstep(0.1, 0.4, length({uv} - 0.5)))',
  },
  {
    name: 'Pro Motion Blur',
    category: 'pro',
    scalarExpr: '(sin(length({uv} - 0.5) * 20.0 - {time}) + sin(length({uv} - 0.5 + vec2<f32>(0.02, 0.0)) * 20.0 - {time}) + sin(length({uv} - 0.5 + vec2<f32>(0.04, 0.0)) * 20.0 - {time})) * 0.333',
  },
  {
    name: 'Pro Bloom',
    category: 'pro',
    scalarExpr: 'max(sin(length({uv} - 0.5) * 15.0 - {time}), 0.0) + exp(-length({uv} - 0.5) * 5.0) * max(sin(length({uv} - 0.5) * 15.0 - {time}), 0.0) * 2.0',
  },
  {
    name: 'Pro Godrays',
    category: 'pro',
    scalarExpr: 'exp(-length({uv} - vec2<f32>(0.5, 0.0)) * 2.0) * (0.5 + 0.5 * sin(atan2({y}, {x} - 0.5) * 12.0 - {time})) * (1.0 - {y})',
  },
  {
    name: 'Pro Fresnel',
    category: 'pro',
    scalarExpr: 'pow(1.0 - sqrt(max(0.0, 0.25 - ({x} - 0.5) * ({x} - 0.5) - ({y} - 0.5) * ({y} - 0.5))) * 2.0, 3.0) + 0.1',
  },
  {
    name: 'Pro PBR Roughness',
    category: 'pro',
    scalarExpr: 'mix(pow(max(0.0, sin(atan2({y} - 0.5, {x} - 0.5) * 2.0 + {time})), 32.0), pow(max(0.0, sin(atan2({y} - 0.5, {x} - 0.5) * 2.0 + {time})), 4.0), f_hash({uv} * 5.0))',
  },
  {
    name: 'Pro Normal Map',
    category: 'pro',
    scalarExpr: '0.5 + 0.5 * (sin({x} * 20.0 + sin({y} * 10.0 + {time}) * 2.0) * cos({y} * 20.0 + sin({x} * 10.0 - {time} * 0.7) * 2.0))',
  },
  {
    name: 'Pro Ambient Occlusion',
    category: 'pro',
    scalarExpr: '1.0 - (f_hash({uv} * 10.0) * 0.1 + smoothstep(0.0, 0.2, min(min({x}, 1.0 - {x}), min({y}, 1.0 - {y}))) * 0.3 + 0.6)',
  },
  {
    name: 'Pro Displacement',
    category: 'pro',
    scalarExpr: 'sin(({x} + f_n({y} * 5.0 + {time} * 0.3) * 0.1) * 15.0) * sin(({y} + f_n({x} * 5.0 - {time} * 0.2) * 0.1) * 15.0)',
  },
  {
    name: 'Pro Tessellation',
    category: 'pro',
    scalarExpr: 'min(min(abs(fract({x} * 5.0) - 0.5), abs(fract({y} * 5.0) - 0.5)), abs(fract(({x} + {y}) * 3.54) - 0.5)) * 2.0 + f_hash({uv} * 5.0) * 0.1',
  },
];

/**
 * Color palettes for mathematical visualizations
 */
export const MATH_COLOR_PALETTES = [
  // Palette 1: Fire
  {
    name: 'Fire',
    a: 'vec3<f32>(0.5, 0.5, 0.5)',
    b: 'vec3<f32>(0.5, 0.5, 0.5)',
    c: 'vec3<f32>(1.0, 1.0, 0.5)',
    d: 'vec3<f32>(0.8, 0.9, 0.3)',
  },
  // Palette 2: Ocean
  {
    name: 'Ocean',
    a: 'vec3<f32>(0.5, 0.5, 0.5)',
    b: 'vec3<f32>(0.5, 0.5, 0.5)',
    c: 'vec3<f32>(1.0, 1.0, 1.0)',
    d: 'vec3<f32>(0.0, 0.1, 0.2)',
  },
  // Palette 3: Rainbow
  {
    name: 'Rainbow',
    a: 'vec3<f32>(0.5, 0.5, 0.5)',
    b: 'vec3<f32>(0.5, 0.5, 0.5)',
    c: 'vec3<f32>(1.0, 1.0, 1.0)',
    d: 'vec3<f32>(0.0, 0.33, 0.67)',
  },
  // Palette 4: Neon
  {
    name: 'Neon',
    a: 'vec3<f32>(0.5, 0.5, 0.5)',
    b: 'vec3<f32>(0.5, 0.5, 0.5)',
    c: 'vec3<f32>(2.0, 1.0, 0.0)',
    d: 'vec3<f32>(0.5, 0.2, 0.25)',
  },
  // Palette 5: Sunset
  {
    name: 'Sunset',
    a: 'vec3<f32>(0.8, 0.5, 0.4)',
    b: 'vec3<f32>(0.2, 0.4, 0.2)',
    c: 'vec3<f32>(2.0, 1.0, 1.0)',
    d: 'vec3<f32>(0.0, 0.25, 0.25)',
  },
  // Palette 6: Cosmic
  {
    name: 'Cosmic',
    a: 'vec3<f32>(0.5, 0.5, 0.5)',
    b: 'vec3<f32>(0.5, 0.5, 0.5)',
    c: 'vec3<f32>(1.0, 0.7, 0.4)',
    d: 'vec3<f32>(0.0, 0.15, 0.2)',
  },
  // Palette 7: Acid
  {
    name: 'Acid',
    a: 'vec3<f32>(0.5, 0.5, 0.5)',
    b: 'vec3<f32>(0.5, 0.5, 0.5)',
    c: 'vec3<f32>(1.0, 1.0, 0.0)',
    d: 'vec3<f32>(0.3, 0.2, 0.2)',
  },
  // Palette 8: Ice
  {
    name: 'Ice',
    a: 'vec3<f32>(0.2, 0.5, 0.8)',
    b: 'vec3<f32>(0.3, 0.3, 0.2)',
    c: 'vec3<f32>(1.0, 1.0, 1.0)',
    d: 'vec3<f32>(0.0, 0.0, 0.2)',
  },
];

/**
 * Gets a random equation from the library
 */
export function getRandomEquation(): MathEquation {
  return MATH_EQUATIONS[Math.floor(Math.random() * MATH_EQUATIONS.length)];
}

/**
 * Gets a random equation from a specific category
 */
export function getRandomEquationByCategory(category: MathEquation['category']): MathEquation {
  const filtered = MATH_EQUATIONS.filter(eq => eq.category === category);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

/**
 * Gets a random color palette
 */
export function getRandomPalette() {
  return MATH_COLOR_PALETTES[Math.floor(Math.random() * MATH_COLOR_PALETTES.length)];
}

/**
 * Combines multiple equations into a complex expression
 */
export function combineEquations(count: number = 2): string {
  const equations: MathEquation[] = [];
  for (let i = 0; i < count; i++) {
    equations.push(getRandomEquation());
  }

  const combiners = [
    (a: string, b: string) => `(${a} + ${b}) * 0.5`,
    (a: string, b: string) => `${a} * ${b}`,
    (a: string, b: string) => `mix(${a}, ${b}, 0.5)`,
    (a: string, b: string) => `f_smin(${a}, ${b}, 0.3)`,
    (a: string, b: string) => `max(${a}, ${b})`,
    (a: string, b: string) => `sin(${a} * 3.0) * cos(${b} * 3.0)`,
  ];

  let result = equations[0].scalarExpr;
  for (let i = 1; i < equations.length; i++) {
    const combiner = combiners[Math.floor(Math.random() * combiners.length)];
    result = combiner(result, equations[i].scalarExpr);
  }

  return result;
}
