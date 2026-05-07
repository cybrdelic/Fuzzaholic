/**
 * Anti-Convergence System for Shader Fuzzing
 *
 * Prevents degenerate states:
 * - Blank screens (values → 0 or infinity)
 * - Cursor-only effects (everything just follows mouse)
 * - Static images (no time/animation dependency)
 * - Single-color outputs (no variation)
 * - Blinking/flashing (harsh on/off with fast time)
 * - Boring patterns (just stripes, grids, or simple gradients)
 */

// ============================================================================
// SHADER HEALTH ANALYSIS
// ============================================================================

export interface ShaderHealth {
  hasTimeDependency: boolean;
  hasUVDependency: boolean;
  hasCursorDependency: boolean;
  cursorDominance: number; // 0-1, how much cursor vs other inputs
  hasColorVariation: boolean;
  hasNonTrivialMath: boolean;
  riskOfBlank: number; // 0-1
  riskOfCursorOnly: number; // 0-1
  riskOfStatic: number; // 0-1
  riskOfFlashing: number; // 0-1, blinking/strobing
  riskOfBoring: number; // 0-1, simple repetitive patterns
  overallHealth: number; // 0-1
  issues: string[];
}

/**
 * Analyze shader code for convergence risks
 */
export function analyzeShaderHealth(code: string): ShaderHealth {
  const issues: string[] = [];

  // Count different input dependencies in the main fragment body
  const fragMain = extractFragmentMain(code);

  // Time dependency analysis
  const timeMatches = (fragMain.match(/\btime\b/g) || []).length;
  const hasTimeDependency = timeMatches > 0;
  if (!hasTimeDependency) {
    issues.push('No time dependency - shader will be static');
  }

  // UV/position dependency
  const uvMatches = (fragMain.match(/\b(uv|p_raw|pos|position|p\.)/g) || []).length;
  const hasUVDependency = uvMatches > 0;
  if (!hasUVDependency) {
    issues.push('No UV/position dependency - uniform color risk');
  }

  // Cursor dependency
  const cursorMatches = (fragMain.match(/\b(mouse|cursor|mouseVel|mouseVelocity|mouse\.)/g) || []).length;
  const hasCursorDependency = cursorMatches > 0;

  // Calculate cursor dominance (cursor refs vs other input refs)
  const totalInputRefs = timeMatches + uvMatches + cursorMatches;
  const cursorDominance = totalInputRefs > 0 ? cursorMatches / totalInputRefs : 0;

  if (cursorDominance > 0.7 && hasCursorDependency) {
    issues.push('High cursor dominance - may converge to cursor-only effect');
  }

  // Check for color variation
  const hasColorVariation =
    fragMain.includes('vec3') ||
    fragMain.includes('vec4') ||
    fragMain.includes('f_pal') ||
    fragMain.includes('palette') ||
    (fragMain.match(/\.rgb|\.xyz|\.r\b|\.g\b|\.b\b/g) || []).length > 0;

  // Check for non-trivial math (not just simple assignments)
  const mathFunctions = ['sin', 'cos', 'tan', 'exp', 'pow', 'sqrt', 'abs', 'fract', 'floor', 'ceil',
                         'mix', 'smoothstep', 'length', 'dot', 'cross', 'normalize', 'noise', 'fbm',
                         'f_sin', 'f_cos', 'f_n', 'f_hash', 'voronoi'];
  const mathMatches = mathFunctions.reduce((count, fn) => {
    return count + (fragMain.match(new RegExp(`\\b${fn}\\b`, 'g')) || []).length;
  }, 0);
  const hasNonTrivialMath = mathMatches > 2;

  if (!hasNonTrivialMath) {
    issues.push('Limited mathematical complexity');
  }

  // Risk calculations

  // Blank screen risk: high if no UV dependency, or suspicious patterns
  let riskOfBlank = 0;
  if (!hasUVDependency) riskOfBlank += 0.3;
  if (!hasColorVariation) riskOfBlank += 0.3;
  if (fragMain.includes('* 0.0') || fragMain.includes('*0.0')) riskOfBlank += 0.2;
  if ((fragMain.match(/0\.00/g) || []).length > 3) riskOfBlank += 0.2;
  // Check for division chains that could explode
  if ((fragMain.match(/\/ \d+\.\d+ \//g) || []).length > 2) riskOfBlank += 0.1;
  riskOfBlank = Math.min(1, riskOfBlank);

  // Cursor-only risk
  let riskOfCursorOnly = cursorDominance;
  if (!hasTimeDependency && hasCursorDependency) riskOfCursorOnly += 0.2;
  if (!hasUVDependency && hasCursorDependency) riskOfCursorOnly += 0.3;
  riskOfCursorOnly = Math.min(1, riskOfCursorOnly);

  // Static risk
  let riskOfStatic = 0;
  if (!hasTimeDependency) riskOfStatic += 0.5;
  if (!hasCursorDependency && !hasTimeDependency) riskOfStatic += 0.3;
  riskOfStatic = Math.min(1, riskOfStatic);

  // Flashing/Blinking risk - harsh on/off patterns with fast time
  let riskOfFlashing = 0;
  // Detect step() with time - causes hard on/off
  const stepTimeMatches = (fragMain.match(/step\s*\([^)]*time/gi) || []).length;
  if (stepTimeMatches > 0) {
    riskOfFlashing += 0.4;
    issues.push('step() with time may cause harsh blinking');
  }
  // Detect fract(time * large) - causes fast flashing
  const fractTimeMatches = fragMain.match(/fract\s*\(\s*time\s*\*\s*(\d+\.?\d*)/gi) || [];
  for (const match of fractTimeMatches) {
    const numMatch = match.match(/(\d+\.?\d*)/);
    if (numMatch && parseFloat(numMatch[1]) > 5) {
      riskOfFlashing += 0.3;
      issues.push('fract(time * large) causes fast flashing');
    }
  }
  // Detect floor/ceil with fast time - causes stepping/flickering
  const floorTimeMatches = (fragMain.match(/(floor|ceil)\s*\([^)]*time\s*\*\s*(\d+\.?\d*)/gi) || []).length;
  if (floorTimeMatches > 0) riskOfFlashing += 0.3;
  // Detect sign(sin(time * large)) - binary flashing
  if (fragMain.match(/sign\s*\(\s*sin\s*\([^)]*time/gi)) {
    riskOfFlashing += 0.5;
    issues.push('sign(sin(time)) causes binary on/off flashing');
  }
  // Detect mod with time producing 0/1 patterns
  if (fragMain.match(/mod\s*\([^)]*time[^)]*\)\s*[<>]/gi)) {
    riskOfFlashing += 0.2;
  }
  // Detect very fast time multipliers in general
  const fastTimeMatches = fragMain.match(/time\s*\*\s*(\d+\.?\d*)/g) || [];
  for (const match of fastTimeMatches) {
    const numMatch = match.match(/(\d+\.?\d*)/);
    if (numMatch && parseFloat(numMatch[1]) > 20) {
      riskOfFlashing += 0.2;
      issues.push(`Very fast time multiplier (${numMatch[1]}) may cause strobing`);
    }
  }
  riskOfFlashing = Math.min(1, riskOfFlashing);

  // Boring/repetitive pattern risk
  let riskOfBoring = 0;
  // Simple stripe patterns (just uv.x or uv.y)
  const simpleUVPatterns = (fragMain.match(/\b(uv|p)\.(x|y)\s*\*/g) || []).length;
  const complexPatterns = (fragMain.match(/(noise|fbm|voronoi|spiral|length\s*\(\s*uv|dot|atan2)/gi) || []).length;
  if (simpleUVPatterns > 2 && complexPatterns === 0) {
    riskOfBoring += 0.4;
    issues.push('Simple stripe/grid patterns without complexity');
  }
  // Just fract of UV - boring grid
  if (fragMain.match(/fract\s*\(\s*(uv|p)\s*\*/gi) && complexPatterns === 0) {
    riskOfBoring += 0.3;
    issues.push('Simple fract(uv) grid without interesting transforms');
  }
  // No color mixing or palette
  if (!fragMain.includes('mix') && !fragMain.includes('f_pal') && !fragMain.includes('palette')) {
    riskOfBoring += 0.2;
  }
  // Very few math operations (too simple)
  if (mathMatches < 3) {
    riskOfBoring += 0.3;
    issues.push('Too few mathematical operations');
  }
  riskOfBoring = Math.min(1, riskOfBoring);

  // Overall health (inverse of risks)
  const overallHealth = Math.max(0, 1 - (
    riskOfBlank * 0.3 +
    riskOfCursorOnly * 0.2 +
    riskOfStatic * 0.2 +
    riskOfFlashing * 0.15 +
    riskOfBoring * 0.15
  ));

  return {
    hasTimeDependency,
    hasUVDependency,
    hasCursorDependency,
    cursorDominance,
    hasColorVariation,
    hasNonTrivialMath,
    riskOfBlank,
    riskOfCursorOnly,
    riskOfStatic,
    riskOfFlashing,
    riskOfBoring,
    overallHealth,
    issues,
  };
}

/**
 * Extract the main fragment function body
 */
function extractFragmentMain(code: string): string {
  // Find @fragment function
  const fragMatch = code.match(/@fragment[\s\S]*?fn\s+\w+\s*\([^)]*\)[^{]*\{([\s\S]*)/);
  if (!fragMatch) return code;

  // Find matching brace
  let depth = 1;
  let end = 0;
  const body = fragMatch[1];
  for (let i = 0; i < body.length && depth > 0; i++) {
    if (body[i] === '{') depth++;
    if (body[i] === '}') depth--;
    end = i;
  }

  return body.substring(0, end);
}

// ============================================================================
// SAFE VALUE RANGES
// ============================================================================

export const SAFE_RANGES = {
  // Amplitude/scale values (multipliers)
  amplitude: { min: 0.05, max: 5.0 },

  // Frequency values (for sin/cos periods)
  frequency: { min: 0.5, max: 20.0 },

  // Offset values (additive)
  offset: { min: -3.0, max: 3.0 },

  // Color components
  color: { min: 0.0, max: 1.5 },

  // Time multipliers
  timeScale: { min: 0.1, max: 5.0 },

  // Division denominators (avoid div by zero)
  denominator: { min: 0.1, max: 100.0 },
};

/**
 * Clamp a numeric value to safe ranges based on context
 */
export function clampToSafeRange(value: number, context: 'amplitude' | 'frequency' | 'offset' | 'color' | 'timeScale' | 'denominator'): number {
  const range = SAFE_RANGES[context];
  return Math.max(range.min, Math.min(range.max, value));
}

/**
 * Check if a number is in dangerous territory
 */
export function isNumberDangerous(value: number): boolean {
  return (
    !isFinite(value) ||
    isNaN(value) ||
    Math.abs(value) < 0.001 || // Too small - might cause visual loss
    Math.abs(value) > 1000 ||  // Too large - might cause overflow
    value === 0
  );
}

// ============================================================================
// DIVERSITY INJECTION
// ============================================================================

/**
 * Generate a diversity-preserving expression that won't converge
 */
export function generateDiverseTerm(type: 'scalar' | 'vec2' | 'vec3'): string {
  const terms: Record<string, string[]> = {
    scalar: [
      'sin(time * 2.0 + length(uv) * 5.0)',
      'cos(time * 1.5) * 0.5 + 0.5',
      'fract(time * 0.3 + uv.x * 3.0)',
      'smoothstep(0.3, 0.7, sin(time + length(uv - 0.5) * 6.28))',
      'abs(sin(time * 0.7 + uv.y * 4.0))',
      '(1.0 - length(uv - 0.5) * 1.5)',
      'sin(uv.x * 10.0 + time) * cos(uv.y * 10.0 + time * 0.7)',
      'f_n(uv * 5.0 + time * 0.3)',
    ],
    vec2: [
      'vec2(sin(time), cos(time)) * 0.3',
      'uv * 2.0 - 1.0',
      'vec2(cos(time * 1.3), sin(time * 0.9)) * 0.5',
      'normalize(uv - 0.5)',
      'vec2(f_n(uv + time * 0.1), f_n(uv * 1.3 + time * 0.15))',
    ],
    vec3: [
      'f_pal(time * 0.1 + length(uv - 0.5))',
      'vec3(0.5) + 0.5 * cos(6.28 * (time * 0.1 + uv.x + vec3(0.0, 0.33, 0.67)))',
      'mix(vec3(0.1, 0.2, 0.4), vec3(0.9, 0.6, 0.3), sin(time + length(uv) * 3.0) * 0.5 + 0.5)',
      'vec3(sin(time), cos(time * 1.3), sin(time * 0.7 + 1.0)) * 0.5 + 0.5',
    ],
  };

  const options = terms[type];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate an anti-cursor term (reduces cursor influence)
 */
export function generateAntiCursorTerm(): string {
  const terms = [
    'sin(time * 2.0 + uv.x * 10.0)',
    'cos(length(uv - 0.5) * 15.0 - time * 3.0)',
    'f_n(uv * 8.0 + time * 0.2)',
    'smoothstep(0.0, 1.0, fract(uv.y * 5.0 + time * 0.5))',
    'abs(sin(uv.x * 20.0 + time) * cos(uv.y * 20.0 - time * 0.8))',
    'length(fract(uv * 5.0) - 0.5)',
  ];
  return terms[Math.floor(Math.random() * terms.length)];
}

// ============================================================================
// MUTATION SAFETY WRAPPERS
// ============================================================================

/**
 * Safe number mutation that prevents convergence to dangerous values
 */
export function safeMutateNumber(
  currentValue: number,
  intensity: number,
  context?: 'amplitude' | 'frequency' | 'offset' | 'color' | 'timeScale' | 'denominator'
): number {
  // Choose mutation strategy
  const strategy = Math.random();
  let newValue: number;

  if (strategy < 0.3) {
    // Additive mutation
    const delta = (Math.random() - 0.5) * 2 * intensity * Math.abs(currentValue || 1);
    newValue = currentValue + delta;
  } else if (strategy < 0.6) {
    // Multiplicative mutation (biased away from 0)
    const factor = 0.5 + Math.random() * 1.5; // 0.5 to 2.0
    newValue = currentValue * factor;
  } else if (strategy < 0.8) {
    // Replace with fresh value
    newValue = (Math.random() * 4 - 2) * (1 + intensity);
  } else {
    // Small perturbation
    newValue = currentValue * (1 + (Math.random() - 0.5) * 0.3);
  }

  // Apply context-specific clamping
  if (context) {
    newValue = clampToSafeRange(newValue, context);
  } else {
    // General safety clamp
    if (Math.abs(newValue) < 0.01) newValue = Math.sign(newValue || 1) * 0.1;
    if (Math.abs(newValue) > 100) newValue = Math.sign(newValue) * 50;
  }

  return newValue;
}

// ============================================================================
// POST-MUTATION HEALTH CHECK & REPAIR
// ============================================================================

/**
 * Repair a shader that has convergence problems
 */
export function repairShader(code: string, health: ShaderHealth): string {
  let result = code;

  // Find the color assignment line (usually `let col = ...` or `col = ...`)
  const colorLineMatch = result.match(/(let\s+col\s*=|var\s+col\s*=|col\s*=)\s*([^;]+);/);

  // If no time dependency, inject time into the color calculation
  if (!health.hasTimeDependency && colorLineMatch) {
    const beforeAssign = colorLineMatch[1];
    const currentExpr = colorLineMatch[2];

    // Add time-based modulation
    const timeModulation = ` * (0.8 + 0.2 * sin(time * 2.0))`;
    const newLine = `${beforeAssign} ${currentExpr}${timeModulation};`;
    result = result.replace(colorLineMatch[0], newLine);
  }

  // If high cursor dominance, dilute cursor effect
  if (health.cursorDominance > 0.6) {
    // Replace some mouse references with UV-based alternatives
    const mouseCount = (result.match(/\bmouse\b/g) || []).length;
    if (mouseCount > 2) {
      // Replace half of mouse refs with uv
      let replaced = 0;
      result = result.replace(/\bmouse\b/g, (match) => {
        if (replaced < Math.floor(mouseCount / 2)) {
          replaced++;
          return '(uv * 0.5 + 0.25)'; // Centers in 0.25-0.75 range
        }
        return match;
      });
    }
  }

  // If risk of blank is high, ensure minimum color
  if (health.riskOfBlank > 0.5) {
    // Find the final color output and add minimum brightness
    const returnMatch = result.match(/return\s+vec4\s*\(\s*([^,]+)\s*,/);
    if (returnMatch) {
      const colorExpr = returnMatch[1];
      // Ensure minimum brightness
      const safeColor = `max(${colorExpr}, vec3(0.05))`;
      result = result.replace(returnMatch[0], `return vec4(${safeColor},`);
    }
  }

  // FIX FLASHING: ALWAYS replace harsh step/sign patterns with smooth versions
  // (even at low risk - prevention is better than cure)

  // step(x, time) -> smoothstep(x - 0.2, x + 0.2, time) - ALWAYS fix
  result = result.replace(/\bstep\s*\(\s*([^,]+)\s*,\s*time\s*\)/gi, (match, threshold) => {
    return `smoothstep(${threshold} - 0.2, ${threshold} + 0.2, time)`;
  });

  // step(time, x) -> smoothstep(x - 0.2, x + 0.2, time) - ALWAYS fix
  result = result.replace(/\bstep\s*\(\s*time\s*,\s*([^)]+)\s*\)/gi, (match, threshold) => {
    return `smoothstep(${threshold} - 0.2, ${threshold} + 0.2, time)`;
  });

  // sign(sin(time * X)) -> sin(time * min(X, 2.0)) for MUCH smoother transitions
  result = result.replace(/\bsign\s*\(\s*sin\s*\(\s*time\s*\*\s*(\d+\.?\d*)\s*\)\s*\)/gi, (match, mult) => {
    const clampedMult = Math.min(parseFloat(mult), 2.0).toFixed(2);
    return `sin(time * ${clampedMult})`;
  });

  // sign(sin(time)) without multiplier
  result = result.replace(/\bsign\s*\(\s*sin\s*\(\s*time\s*\)\s*\)/gi, () => {
    return `sin(time * 0.5)`;
  });

  // sign(cos(time * X)) -> cos(time * min(X, 2.0))
  result = result.replace(/\bsign\s*\(\s*cos\s*\(\s*time\s*\*\s*(\d+\.?\d*)\s*\)\s*\)/gi, (match, mult) => {
    const clampedMult = Math.min(parseFloat(mult), 2.0).toFixed(2);
    return `cos(time * ${clampedMult})`;
  });

  // fract(time * X) where X > 3 -> fract(time * clamped)
  result = result.replace(/\bfract\s*\(\s*time\s*\*\s*(\d+\.?\d*)\s*\)/gi, (match, mult) => {
    const val = parseFloat(mult);
    if (val > 3) {
      const clampedMult = Math.min(val, 2.0).toFixed(2);
      return `fract(time * ${clampedMult})`;
    }
    return match;
  });

  // floor/ceil(time * X) -> sin-based equivalent (ALWAYS flash-prone)
  result = result.replace(/\b(floor|ceil)\s*\(\s*time\s*\*\s*(\d+\.?\d*)\s*\)/gi, (match, fn, mult) => {
    const val = parseFloat(mult);
    return `sin(time * ${Math.min(val * 0.15, 1.5).toFixed(2)})`;
  });

  // floor/ceil(time) without multiplier
  result = result.replace(/\b(floor|ceil)\s*\(\s*time\s*\)/gi, () => {
    return `sin(time * 0.5)`;
  });

  // time * X where X > 10 -> time * clamped (ALWAYS clamp fast time)
  result = result.replace(/\btime\s*\*\s*(\d+\.?\d*)/g, (match, mult) => {
    const val = parseFloat(mult);
    if (val > 10) {
      return `time * ${Math.min(val, 5.0).toFixed(2)}`;
    }
    return match;
  });

  // mod(time, small) can cause rapid cycling
  result = result.replace(/\bmod\s*\(\s*time\s*,\s*(\d+\.?\d*)\s*\)/gi, (match, period) => {
    const val = parseFloat(period);
    if (val < 1.0) {
      return `mod(time, ${Math.max(val, 2.0).toFixed(2)})`;
    }
    return match;
  });

  // FIX BORING: Add complexity if pattern looks too simple
  if (health.riskOfBoring > 0.3) {
    // Try to inject some variation before the return statement
    const returnMatch = result.match(/(\s*)(return\s+vec4)/);
    if (returnMatch) {
      const indent = returnMatch[1];
      // Add subtle organic variation that makes ANY shader more interesting
      const variation = `${indent}// Anti-boring injection: organic noise and subtle animation
${indent}col = col + vec3<f32>(
${indent}  sin(length(p) * 8.0 + time * 1.2) * 0.06,
${indent}  cos(length(p) * 6.0 - time * 0.8) * 0.06,
${indent}  sin(p.x * p.y * 10.0 + time * 0.5) * 0.04
${indent});
${indent}col = col * (0.9 + 0.1 * sin(atan2(p.y, p.x) * 3.0 + time));
${indent}`;
      result = result.replace(returnMatch[0], variation + returnMatch[0]);
    }
  }

  return result;
}

/**
 * Analyze and optionally repair a mutated shader
 *
 * ZERO TOLERANCE POLICY:
 * - NEVER allow blank screens
 * - NEVER allow flashing/blinking
 * - NEVER allow boring patterns
 * - NEVER allow cursor-only effects
 * - ALWAYS ensure animation and visual interest
 */
export function ensureShaderHealth(code: string, autoRepair: boolean = true): { code: string; health: ShaderHealth; wasRepaired: boolean } {
  const health = analyzeShaderHealth(code);

  // ZERO TOLERANCE: Repair if ANY risk is above VERY LOW threshold
  const needsRepair = autoRepair && (
    health.overallHealth < 0.7 ||       // Overall health threshold (higher = more aggressive)
    health.riskOfFlashing > 0.1 ||      // ZERO TOLERANCE for flashing
    health.riskOfBoring > 0.2 ||        // Very low tolerance for boring
    health.riskOfBlank > 0.1 ||         // ZERO TOLERANCE for blank
    health.riskOfStatic > 0.3 ||        // Low tolerance for static
    health.cursorDominance > 0.4 ||     // Don't let cursor dominate
    !health.hasTimeDependency ||        // MUST have animation
    !health.hasUVDependency ||          // MUST have spatial variation
    !health.hasNonTrivialMath           // MUST have interesting math
  );

  if (needsRepair) {
    let repairedCode = repairShader(code, health);
    let newHealth = analyzeShaderHealth(repairedCode);

    // If still not healthy enough, apply more aggressive repairs
    let attempts = 0;
    while (newHealth.overallHealth < 0.5 && attempts < 3) {
      repairedCode = applyAggressiveRepairs(repairedCode, newHealth);
      newHealth = analyzeShaderHealth(repairedCode);
      attempts++;
    }

    return {
      code: repairedCode,
      health: newHealth,
      wasRepaired: true,
    };
  }

  return {
    code,
    health,
    wasRepaired: false,
  };
}

/**
 * Apply aggressive repairs when standard repairs aren't enough
 */
function applyAggressiveRepairs(code: string, health: ShaderHealth): string {
  let result = code;

  // FORCE time dependency if missing
  if (!health.hasTimeDependency) {
    const returnMatch = result.match(/(\s*)(return\s+vec4)/);
    if (returnMatch) {
      const indent = returnMatch[1];
      const timeInjection = `${indent}// Forced time animation
${indent}col = col * (0.8 + 0.2 * sin(time * 1.5)) + vec3<f32>(sin(time * 0.7) * 0.05, cos(time * 0.9) * 0.05, sin(time * 1.1) * 0.05);
${indent}`;
      result = result.replace(returnMatch[0], timeInjection + returnMatch[0]);
    }
  }

  // FORCE UV dependency if missing
  if (!health.hasUVDependency) {
    const returnMatch = result.match(/(\s*)(return\s+vec4)/);
    if (returnMatch) {
      const indent = returnMatch[1];
      const uvInjection = `${indent}// Forced UV variation
${indent}col = col + vec3<f32>(sin(uv.x * 10.0 + time) * 0.1, sin(uv.y * 8.0 - time) * 0.1, sin(length(uv - 0.5) * 12.0) * 0.08);
${indent}`;
      result = result.replace(returnMatch[0], uvInjection + returnMatch[0]);
    }
  }

  // REMOVE cursor dominance by reducing mouse references
  if (health.cursorDominance > 0.5) {
    // Replace many mouse refs with UV-based alternatives
    let mouseCount = 0;
    result = result.replace(/\bmouse\b/g, (match) => {
      mouseCount++;
      if (mouseCount % 2 === 0) {
        return '(uv * 0.5 + vec2<f32>(0.25 + sin(time * 0.5) * 0.1, 0.25 + cos(time * 0.3) * 0.1))';
      }
      return match;
    });
  }

  // FORCE complexity if too simple
  if (!health.hasNonTrivialMath || health.riskOfBoring > 0.3) {
    const returnMatch = result.match(/(\s*)(return\s+vec4)/);
    if (returnMatch) {
      const indent = returnMatch[1];
      const complexityInjection = `${indent}// Forced complexity
${indent}let wave = sin(length(uv - 0.5) * 15.0 - time * 2.0) * 0.5 + 0.5;
${indent}let ripple = smoothstep(0.0, 0.1, abs(sin(length(uv - 0.5) * 20.0 - time * 3.0)));
${indent}col = mix(col, col * wave, 0.2) + vec3<f32>(ripple * 0.05);
${indent}`;
      result = result.replace(returnMatch[0], complexityInjection + returnMatch[0]);
    }
  }

  // ELIMINATE any remaining flashing
  if (health.riskOfFlashing > 0.1) {
    // Clamp ALL time multipliers to safe range
    result = result.replace(/time\s*\*\s*(\d+\.?\d*)/g, (match, mult) => {
      const val = parseFloat(mult);
      return `time * ${Math.min(val, 3.0).toFixed(2)}`;
    });

    // Replace all step() with smoothstep()
    result = result.replace(/\bstep\s*\(/g, 'smoothstep(0.0, 0.1, ');

    // Replace all sign() with smooth alternatives
    result = result.replace(/\bsign\s*\(/g, 'tanh(3.0 * ');
  }

  // ENSURE minimum brightness (no blank screens)
  if (health.riskOfBlank > 0.1) {
    // Find the return statement and ensure minimum brightness
    result = result.replace(
      /return\s+vec4<f32>\s*\(\s*([^,]+)\s*,\s*(\d+\.?\d*)\s*\)/g,
      (match, colorExpr, alpha) => {
        return `return vec4<f32>(max(${colorExpr}, vec3<f32>(0.02 + sin(time) * 0.01)), ${alpha})`;
      }
    );
  }

  return result;
}

// ============================================================================
// PRE-MUTATION FILTERS
// ============================================================================

/**
 * Check if a mutation target should be skipped to preserve diversity
 */
export function shouldSkipMutation(
  value: string,
  context: string,
  cursorDominance: number
): boolean {
  // Never mutate the only time reference
  if (value === 'time' && context.includes('only_time_ref')) {
    return true;
  }

  // If cursor dominance is already high, don't mutate UV terms to cursor
  if (cursorDominance > 0.5 && (value.includes('uv') || value.includes('pos'))) {
    return Math.random() > 0.3; // 70% chance to skip
  }

  // Don't zero out color terms
  if (context.includes('color') && parseFloat(value) < 0.1) {
    return true;
  }

  return false;
}

/**
 * Filter mutation candidates to preserve shader diversity
 */
export function filterMutationTargets(
  targets: Array<{ value: string; range: { start: number; end: number }; context?: string }>,
  health: ShaderHealth
): Array<{ value: string; range: { start: number; end: number }; context?: string }> {
  // If health is good, allow all mutations
  if (health.overallHealth > 0.7) {
    return targets;
  }

  return targets.filter(target => {
    // Protect time references if shader lacks time dependency
    if (!health.hasTimeDependency && target.value.includes('time')) {
      return false;
    }

    // Protect UV references if shader lacks UV dependency
    if (!health.hasUVDependency && (target.value.includes('uv') || target.value.includes('pos'))) {
      return false;
    }

    // If high cursor dominance, protect non-cursor terms
    if (health.cursorDominance > 0.5) {
      const isCursorTerm = target.value.includes('mouse') || target.value.includes('cursor');
      if (!isCursorTerm) {
        return Math.random() > 0.3; // 30% chance to still allow
      }
    }

    return true;
  });
}
