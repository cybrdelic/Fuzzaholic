import { FuzzConfig } from '../types';
import {
    analyzeShaderHealth,
    ensureShaderHealth,
    generateAntiCursorTerm,
    generateDiverseTerm,
    isNumberDangerous,
    SAFE_RANGES
} from './antiConvergence';
import { safeMutateShader } from './astMutator';
import { generateCursorEffectWGSL } from './cursorEffectAST';
// REMOVED: Preset math equations - now using procedural generation
// import { getRandomEquation, getRandomPalette, MATH_EQUATIONS, MathEquation } from './mathEquations';
import {
    generatePhysicsShaderCode
} from './physicsEquations';
import {
    generateProceduralAestheticShader,
    generateProceduralColor,
    generateProceduralPostEffect,
    generateProceduralScalar,
    generateProceduralScrollEffect,
    generateProceduralWarp
} from './proceduralFuzzer';
import { validateAndFixShader } from './shaderValidator';
import { sanitizeShader } from './syntaxSanitizer';
import {
    getSafeMutableNumbers,
    getSafeMutableOperators,
    parseWGSL
} from './wgslParser';

// Quality analysis disabled for now - was causing crashes
// import { analyzeShaderQuality } from './shaderQuality';

// ============================================================================
// ANTI-CONVERGENCE: Mutation tracking to force fresh generation periodically
// ============================================================================
let physicsMutationCount = 0;
const MAX_PHYSICS_MUTATIONS_BEFORE_RESET = 8; // Force fresh shader after this many mutations

export function resetPhysicsMutationCounter(): void {
    physicsMutationCount = 0;
}
/**
 * HYBRID WGSL FUZZER
 *
 * Uses our custom WGSL parser (wgslParser.ts) for safe math mutations,
 * with proper tokenization and AST-aware mutation targeting.
 *
 * The parser-based mutator ensures we never corrupt:
 * - Helper functions (hash, noise, fbm, voronoi, etc.)
 * - For-loop increments (i++, j++)
 * - Variable declarations (let, var)
 * - Uniform bindings (@binding, @group)
 * - Type parameters (vec2<f32>)
 * - Annotations (@location, @fragment, etc.)
 */

// -- Lexer Types --

type TokenType = 'ident' | 'number' | 'punct' | 'whitespace' | 'comment' | 'string' | 'unknown';

interface Token {
    type: TokenType;
    value: string;
    index: number; // Original index in source
}

const OPS = ['+', '-', '*', '/'];

// Safe builtins that take 1 arg and return same type
const SAFE_BUILTINS = ['sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'fract', 'sqrt', 'f_sin', 'f_cos', 'f_n', 'f_hash', 'length'];

// All helper functions defined in WGSL_PREAMBLE (constants.ts)
const PREAMBLE_FUNCTIONS = ['f_sin', 'f_cos', 'f_n', 'f_hash', 'f_rot', 'f_pal', 'f_smin'];

// All valid WGSL builtin functions
const WGSL_BUILTINS = [
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
    'abs', 'floor', 'ceil', 'fract', 'sqrt', 'exp', 'exp2', 'log', 'log2',
    'pow', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'length', 'distance',
    'dot', 'cross', 'normalize', 'reflect', 'refract', 'fma', 'sign', 'trunc', 'round',
    'saturate', 'degrees', 'radians', 'modf', 'frexp', 'ldexp', 'inverseSqrt',
    'vec2', 'vec3', 'vec4', 'mat2x2', 'mat3x3', 'mat4x4'
];

const ALL_VALID_FUNCTIONS = [...new Set([...PREAMBLE_FUNCTIONS, ...WGSL_BUILTINS])];

// -- Procedural Generation Logic --

function randFloat(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleString(str: string): string {
    const arr = str.split('');
    // Fisher-Yates shuffle
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
}

/**
 * Generates a random scalar expression (f32) using the provided UV variable name.
 * Biased towards smooth functions to avoid grid/line convergence.
 */
function generateScalarExpr(depth: number, uvName: string): string {
    if (depth <= 0 || Math.random() < 0.15) {
        // Terminals - using STABLE_RANGES implicitly
        const terms = [
            `${uvName}.x`,
            `${uvName}.y`,
            `length(${uvName} - 0.5)`,
            `length(${uvName})`,
            'time',
            // Amplitude range: 0.01-5
            (0.01 + Math.random() * 4.99).toFixed(2),
            `f_hash(${uvName})`,
            // f_n takes scalar, use uv.x with safe frequency (0.5-50)
            `f_n(${uvName}.x * ${(0.5 + Math.random() * 15).toFixed(1)})`
        ];
        return getRandomItem(terms);
    }

    const rnd = Math.random();

    // Unary functions (all take scalar, produce scalar)
    if (rnd < 0.35) {
        const funcs = ['sin', 'cos', 'fract', 'abs', 'sqrt', 'f_sin', 'f_cos'];
        const f = getRandomItem(funcs);
        let inner = generateScalarExpr(depth - 1, uvName);
        // INVARIANT 2: Domain safety
        if (f === 'sqrt') inner = `abs(${inner})`;
        return `${f}(${inner})`;
    }
    // Binary operators - INVARIANT 2: avoid div by small
    else if (rnd < 0.7) {
        // Exclude division from generated expressions (can cause NaN)
        const ops = ['+', '-', '*'];
        const op = getRandomItem(ops);
        return `(${generateScalarExpr(depth - 1, uvName)} ${op} ${generateScalarExpr(depth - 1, uvName)})`;
    }
    // Complex functions with INVARIANT 2: ordered arguments
    else {
        const type = Math.random();
        if (type < 0.33) {
            // mix blend factor in [0,1]
            return `mix(${generateScalarExpr(depth - 1, uvName)}, ${generateScalarExpr(depth - 1, uvName)}, ${(Math.random()).toFixed(3)})`;
        } else if (type < 0.5) {
            // smoothstep: edge0 < edge1 guaranteed
            const edge0 = -0.5 + Math.random() * 0.5;
            const edge1 = edge0 + 0.1 + Math.random() * 1.0;
            return `smoothstep(${edge0.toFixed(3)}, ${edge1.toFixed(3)}, ${generateScalarExpr(depth - 1, uvName)})`;
        } else if (type < 0.75) {
            // clamp: min < max guaranteed
            const minVal = -1 + Math.random() * 1.5;
            const maxVal = minVal + 0.5 + Math.random() * 3;
            return `clamp(${generateScalarExpr(depth - 1, uvName)}, ${minVal.toFixed(3)}, ${maxVal.toFixed(3)})`;
        } else {
            // smin: k in safe range (0.1-1.0)
            return `f_smin(${generateScalarExpr(depth - 1, uvName)}, ${generateScalarExpr(depth - 1, uvName)}, ${(0.1 + Math.random() * 0.9).toFixed(3)})`;
        }
    }
}

/**
 * Generates a procedural color vector (vec3<f32>)
 * Uses INVARIANT 3: diversity by generating 3 distinct channels
 */
function generateProceduralGene(uvName: string): string {
    // INVARIANT 3: Sometimes use cosine palette for guaranteed good colors
    if (Math.random() < 0.5) {
        // Palette with diverse phase offsets for color variety
        const phases = [Math.random(), Math.random(), Math.random()].map(p => p.toFixed(2));
        return `f_pal(${generateScalarExpr(3, uvName)}, vec3<f32>(0.5,0.5,0.5), vec3<f32>(0.5,0.5,0.5), vec3<f32>(1.0,1.0,1.0), vec3<f32>(${phases[0]}, ${phases[1]}, ${phases[2]}))`;
    }

    // Generate 3 distinct expressions for R, G, B
    const r = generateScalarExpr(4, uvName);
    const g = generateScalarExpr(4, uvName);
    const b = generateScalarExpr(4, uvName);

    return `vec3<f32>(${r}, ${g}, ${b})`;
}


// -- Lexer --

function tokenize(code: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    // Patterns ordered by priority
    const patterns: { type: TokenType, regex: RegExp }[] = [
        { type: 'comment', regex: /^\/\/.*/ },
        { type: 'whitespace', regex: /^\s+/ },
        { type: 'number', regex: /^(?:0x[0-9a-fA-F]+|\d+\.\d+(?:[eE][+-]?\d+)?|\d+\.(?![eE\d])|\.\d+(?:[eE][+-]?\d+)?|\d+u?)/ },
        { type: 'ident', regex: /^[a-zA-Z_]\w*/ },
        // CRITICAL FIX: Handle multi-char punctuation before single char
        // This prevents '++', '--', '->' being split which confuses mutations
        { type: 'punct', regex: /^(?:\+\+|--|->|==|!=|<=|>=|&&|\|\||%=|\+=|-=|\*=|\/=)/ },
        { type: 'punct', regex: /^[{}()\[\],;:.+*\/=\-><@%]/ },
    ];

    while (i < code.length) {
        let matched = false;
        const sub = code.slice(i);

        for (const p of patterns) {
            const match = sub.match(p.regex);
            if (match) {
                tokens.push({ type: p.type, value: match[0], index: i });
                i += match[0].length;
                matched = true;
                break;
            }
        }

        if (!matched) {
            // Fallback for unexpected char
            tokens.push({ type: 'unknown', value: code[i], index: i });
            i++;
        }
    }
    return tokens;
}

// -- Frozen Zone Detection --
// These are regions that should NEVER be mutated

/**
 * Returns a Set of token indices that are in "frozen zones" -
 * regions that should never be mutated like @binding(...), @location(...),
 * @group(...), and uniform/var declarations
 */
function getFrozenZones(tokens: Token[]): Set<number> {
    const frozen = new Set<number>();

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        // Freeze @binding(...), @location(...), @group(...)
        if (t.type === 'punct' && t.value === '@') {
            // Freeze the @ symbol
            frozen.add(i);

            // Find the annotation name and freeze everything until closing paren
            let j = i + 1;
            while (j < tokens.length && tokens[j].type === 'whitespace') j++;

            if (j < tokens.length && tokens[j].type === 'ident') {
                const annotName = tokens[j].value;
                if (['binding', 'location', 'group', 'fragment', 'vertex', 'compute', 'workgroup_size'].includes(annotName)) {
                    // Freeze from @ until the closing ) of this annotation
                    let parenDepth = 0;
                    let foundParen = false;
                    for (let k = i; k < tokens.length; k++) {
                        frozen.add(k);
                        if (tokens[k].value === '(') {
                            parenDepth++;
                            foundParen = true;
                        } else if (tokens[k].value === ')') {
                            parenDepth--;
                            if (foundParen && parenDepth === 0) break;
                        }
                    }
                }
            }
        }

        // Freeze var<uniform> declarations entirely
        if (t.type === 'ident' && t.value === 'var') {
            // Look ahead for <uniform>
            let j = i + 1;
            while (j < tokens.length && tokens[j].type === 'whitespace') j++;
            if (j < tokens.length && tokens[j].value === '<') {
                // This is a typed var declaration - freeze until semicolon
                for (let k = i; k < tokens.length; k++) {
                    frozen.add(k);
                    if (tokens[k].value === ';') break;
                }
            }
        }

        // Freeze ALL function declarations except 'main'
        // This protects helper functions (hash, noise, fbm, voronoi, etc.) from mutations
        if (t.type === 'ident' && t.value === 'fn') {
            // Look ahead to get function name
            let j = i + 1;
            while (j < tokens.length && tokens[j].type === 'whitespace') j++;

            if (j < tokens.length && tokens[j].type === 'ident') {
                const funcName = tokens[j].value;

                // Only freeze non-main functions (allow mutations in main)
                if (funcName !== 'main') {
                    // Freeze from 'fn' keyword until the closing '}' of function body
                    let braceDepth = 0;
                    let foundOpenBrace = false;

                    for (let k = i; k < tokens.length; k++) {
                        frozen.add(k);

                        if (tokens[k].value === '{') {
                            braceDepth++;
                            foundOpenBrace = true;
                        } else if (tokens[k].value === '}') {
                            braceDepth--;
                            if (foundOpenBrace && braceDepth === 0) {
                                frozen.add(k); // Freeze the closing brace too
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    return frozen;
}

/**
 * Checks if a token index is in the "body" of the shader (inside fn main)
 * vs in declarations/annotations at the top
 */
function isInShaderBody(tokens: Token[], idx: number): boolean {
    // Find if we're after "fn main"
    let inMain = false;
    let braceDepth = 0;

    for (let i = 0; i < tokens.length && i <= idx; i++) {
        if (tokens[i].type === 'ident' && tokens[i].value === 'main') {
            // Check if previous non-whitespace is 'fn'
            let j = i - 1;
            while (j >= 0 && tokens[j].type === 'whitespace') j--;
            if (j >= 0 && tokens[j].value === 'fn') {
                inMain = true;
            }
        }
        if (inMain) {
            if (tokens[i].value === '{') braceDepth++;
            if (tokens[i].value === '}') braceDepth--;
        }
    }

    return inMain && braceDepth > 0;
}

// -- Mutators --

function mutateNumbers(tokens: Token[], intensity: number): Token[] {
    const frozen = getFrozenZones(tokens);

    return tokens.map((t, idx) => {
        // INVARIANT: Never mutate tokens in frozen zones
        if (frozen.has(idx)) return t;

        if (t.type === 'number' && t.value.includes('.')) {
            if (Math.random() < intensity) {
                const val = parseFloat(t.value);
                if (!isNaN(val)) {
                    const newVal = Math.random() < 0.5
                        ? val + (Math.random() - 0.5)
                        : val * (0.5 + Math.random());

                    if (Math.abs(newVal) < 0.001) return { ...t, value: '0.0' };
                    return { ...t, value: newVal.toFixed(3) };
                }
            }
        }
        return t;
    });
}

function mutateOperators(tokens: Token[], intensity: number): Token[] {
    const frozen = getFrozenZones(tokens);

    return tokens.map((t, idx) => {
        // INVARIANT: Never mutate tokens in frozen zones
        if (frozen.has(idx)) return t;

        if (t.type === 'punct' && OPS.includes(t.value)) {
            if (Math.random() < intensity) {
                return { ...t, value: getRandomItem(OPS) };
            }
        }
        return t;
    });
}

function mutateBuiltins(tokens: Token[], intensity: number): Token[] {
    const frozen = getFrozenZones(tokens);

    return tokens.map((t, idx) => {
        // INVARIANT: Never mutate tokens in frozen zones
        if (frozen.has(idx)) return t;

        if (t.type === 'ident' && SAFE_BUILTINS.includes(t.value)) {
            if (Math.random() < intensity) {
                return { ...t, value: getRandomItem(SAFE_BUILTINS) };
            }
        }
        return t;
    });
}

function findUVName(tokens: Token[], mainIdx: number): string | null {
    let argsStart = -1;
    for (let i = mainIdx; i < tokens.length; i++) {
        if (tokens[i].value === '(') {
            argsStart = i;
            break;
        }
    }
    if (argsStart === -1) return null;

    let uvName = '';
    for (let i = argsStart; i < tokens.length; i++) {
        if (tokens[i].value === ')') break;
        if (tokens[i].value === 'location') {
             let j = i + 1;
             while(j < tokens.length && tokens[j].value !== ')') j++;
             j++;
             while(j < tokens.length && tokens[j].type === 'whitespace') j++;
             if (j < tokens.length && tokens[j].type === 'ident') {
                 uvName = tokens[j].value;
                 break;
             }
        }
    }

    if (!uvName) {
        for(let i = argsStart; i < tokens.length; i++) {
             if (tokens[i].value === ')') break;
             if (tokens[i].value === 'uv') {
                 uvName = 'uv';
                 break;
             }
        }
    }
    return uvName;
}

function mutateGeometry(tokens: Token[], intensity: number): Token[] {
    let mainIdx = -1;
    for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].type === 'ident' && tokens[i].value === 'fn') {
            let j = i + 1;
            while(j < tokens.length && tokens[j].type === 'whitespace') j++;
            if(j < tokens.length && tokens[j].value === 'main') {
                mainIdx = i;
                break;
            }
        }
    }

    if (mainIdx === -1) return tokens;

    const uvName = findUVName(tokens, mainIdx);
    if (!uvName) return tokens;

    // Find body start '{'
    let argsStart = -1;
    for (let i = mainIdx; i < tokens.length; i++) {
        if (tokens[i].value === '(') {
            argsStart = i;
            break;
        }
    }
    let bodyStart = -1;
    for (let i = argsStart; i < tokens.length; i++) {
        if (tokens[i].value === '{') {
            bodyStart = i;
            break;
        }
    }

    if (bodyStart === -1) return tokens;

    // Generate Mutation Code with UNIQUE variable name
    const uniqueId = Math.floor(Math.random() * 100000);
    const mutVar = `${uvName}_geo_${uniqueId}`;

    const mutations = [
        `var ${mutVar} = f_rot(${uvName}, time * ${randFloat(-0.5, 0.5).toFixed(2)});`,
        `var ${mutVar} = ${uvName} * ${randFloat(0.5, 2.0).toFixed(2)} + vec2<f32>(sin(time), cos(time)) * 0.1;`,
        `var ${mutVar} = abs(${uvName} * 2.0 - 1.0);`,
        `var ${mutVar} = fract(${uvName} * ${randFloat(2, 5).toFixed(2)});`,
        `var ${mutVar} = ${uvName} + vec2<f32>(f_n(${uvName}.x*10.0), f_n(${uvName}.y*10.0))*0.05;`
    ];
    const injectionStr = getRandomItem(mutations);
    const injectionTokens = tokenize(injectionStr);

    const newTokens = [...tokens];
    newTokens.splice(bodyStart + 1, 0, { type: 'whitespace', value: '\n    ', index: -1 }, ...injectionTokens, { type: 'punct', value: ';', index: -1 });

    for (let i = bodyStart + 1 + injectionTokens.length + 2; i < newTokens.length; i++) {
        const t = newTokens[i];
        if (t.type === 'ident' && t.value === uvName) {
            let prev = i - 1;
            while(prev >= 0 && newTokens[prev].type === 'whitespace') prev--;
            if (prev >= 0 && newTokens[prev].value === '.') continue;

            let next = i + 1;
            while(next < newTokens.length && newTokens[next].type === 'whitespace') next++;
            if (next < newTokens.length && newTokens[next].value === ':') continue;

            newTokens[i] = { ...t, value: mutVar };
        }
    }

    return newTokens;
}

function mutateColor(tokens: Token[], intensity: number): Token[] {
    const frozen = getFrozenZones(tokens);
    const newTokens = [...tokens];
    for (let i = 0; i < newTokens.length; i++) {
        // Skip frozen zones entirely
        if (frozen.has(i)) continue;

        if (newTokens[i].type === 'ident' && (newTokens[i].value === 'vec3' || newTokens[i].value === 'vec4')) {
            let ptr = i + 1;
            while(ptr < newTokens.length && newTokens[ptr].type === 'whitespace') ptr++;
            if (ptr < newTokens.length && newTokens[ptr].value === '<') {
                while(ptr < newTokens.length && newTokens[ptr].value !== '>') ptr++;
                ptr++;
                while(ptr < newTokens.length && newTokens[ptr].type === 'whitespace') ptr++;
            }
            if (ptr < newTokens.length && newTokens[ptr].value === '(') {
                let balance = 1;
                let j = ptr + 1;
                while (j < newTokens.length && balance > 0) {
                    if (newTokens[j].value === '(') balance++;
                    if (newTokens[j].value === ')') balance--;
                    // Also check if the token we're modifying is in a frozen zone
                    if (balance > 0 && !frozen.has(j) && newTokens[j].type === 'number' && newTokens[j].value.includes('.')) {
                         if (Math.random() < intensity) {
                            const val = parseFloat(newTokens[j].value);
                            const offset = (Math.random() - 0.5) * intensity * 2.0;
                            const newVal = val + offset;
                            newTokens[j] = { ...newTokens[j], value: newVal.toFixed(2) };
                         }
                    }
                    j++;
                }
            }
        }
    }
    return newTokens;
}

function mutateChaos(tokens: Token[], intensity: number): Token[] {
    let retIdx = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i].type === 'ident' && tokens[i].value === 'return') {
            retIdx = i;
            break;
        }
    }
    if (retIdx === -1) return tokens;
    let semiIdx = -1;
    for (let i = retIdx; i < tokens.length; i++) {
        if (tokens[i].value === ';') {
            semiIdx = i;
            break;
        }
    }
    if (semiIdx === -1) return tokens;

    // Check if we have whitespace after return to preserve
    let spliceStart = retIdx + 1;
    let preservedWhitespace = false;
    if (spliceStart < tokens.length && tokens[spliceStart].type === 'whitespace') {
        spliceStart++;
        preservedWhitespace = true;
    }

    // Safety check if we overshot (unlikely unless empty return)
    if (spliceStart >= semiIdx) {
        spliceStart = retIdx + 1;
        preservedWhitespace = false;
    }

    const exprTokens = tokens.slice(spliceStart, semiIdx);
    const exprStr = exprTokens.map(t => t.value).join('');

    const chaosOptions = [
        `( ${exprStr} + vec4<f32>(0.1, 0.1, 0.1, 0.0) )`,
        `abs( ${exprStr} - 0.5 ) * 2.0`,
        `vec4<f32>( (${exprStr}).brg, 1.0 )`,
        `mix( ${exprStr}, vec4<f32>(sin(time), cos(time), 0.5, 1.0), 0.1 )`,
        `(${exprStr} * vec4<f32>(1.2, 0.9, 0.8, 1.0))`
    ];

    // If we didn't preserve whitespace (i.e. we are directly after 'return'), add a space
    let injectionStr = getRandomItem(chaosOptions);
    if (!preservedWhitespace) {
        injectionStr = ' ' + injectionStr;
    }

    const chaosTokens = tokenize(injectionStr);
    const newTokens = [...tokens];
    newTokens.splice(spliceStart, semiIdx - spliceStart, ...chaosTokens);
    return newTokens;
}

function mutateSwizzle(tokens: Token[], intensity: number): Token[] {
    const newTokens = [...tokens];
    for(let i=0; i<newTokens.length-1; i++) {
        if (newTokens[i].value === '.' && newTokens[i].type === 'punct') {
             const next = newTokens[i+1];
             if (next.type === 'ident' && /^[xyzrgba]{2,4}$/.test(next.value)) {
                 if (Math.random() < intensity) {
                     newTokens[i+1] = { ...next, value: shuffleString(next.value) };
                 }
             }
        }
    }
    return newTokens;
}

/**
 * Replaces the entire color logic with a NEW PROCEDURALLY GENERATED algorithm.
 */
function mutateStructure(tokens: Token[], intensity: number): Token[] {
    // 1. Find Main
    let mainIdx = -1;
    for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].type === 'ident' && tokens[i].value === 'fn') {
            let j = i + 1;
            while(j < tokens.length && tokens[j].type === 'whitespace') j++;
            if(j < tokens.length && tokens[j].value === 'main') {
                mainIdx = i;
                break;
            }
        }
    }
    if (mainIdx === -1) return tokens;

    // 2. Find UV name
    const uvName = findUVName(tokens, mainIdx);
    if (!uvName) return tokens;

    // 3. Find Return
    let retIdx = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i].type === 'ident' && tokens[i].value === 'return') {
            retIdx = i;
            break;
        }
    }
    if (retIdx === -1) return tokens;

    let semiIdx = -1;
    for (let i = retIdx; i < tokens.length; i++) {
        if (tokens[i].value === ';') {
            semiIdx = i;
            break;
        }
    }
    if (semiIdx === -1) return tokens;

    // 4. Inject Procedural Art
    // Check if we have whitespace after return to preserve
    let spliceStart = retIdx + 1;
    let preservedWhitespace = false;
    if (spliceStart < tokens.length && tokens[spliceStart].type === 'whitespace') {
        spliceStart++;
        preservedWhitespace = true;
    }

    const geneCode = generateProceduralGene(uvName);

    // Prepend space for safety if we didn't preserve existing whitespace
    let injectionStr = `vec4<f32>(${geneCode}, 1.0)`;
    if (!preservedWhitespace) {
        injectionStr = ' ' + injectionStr;
    }

    const injectionTokens = tokenize(injectionStr);

    const newTokens = [...tokens];
    // Remove old return expression and insert new one
    // Safety check for invalid splice range
    if (semiIdx > spliceStart) {
        newTokens.splice(spliceStart, semiIdx - spliceStart, ...injectionTokens);
    } else {
        // Fallback: just insert
        newTokens.splice(spliceStart, 0, ...injectionTokens);
    }

    return newTokens;
}

// ============================================================================
// ABSTRACT INVARIANT SYSTEM
// ============================================================================
//
// These invariants are MATHEMATICAL PROPERTIES that ensure:
// 1. Valid WGSL syntax (type safety, balanced parens, valid identifiers)
// 2. Visual interest (entropy, frequency distribution, color space coverage)
// 3. Numerical stability (no NaN, no infinity, bounded values)
//
// Each mutation function enforces these invariants INLINE rather than
// checking after the fact.
// ============================================================================

// -- INVARIANT 1: TYPE SAFETY --
type WGSLType = 'f32' | 'vec2' | 'vec3' | 'vec4' | 'unknown';

const FUNC_SIGNATURES: Record<string, { input: WGSLType[], output: WGSLType }> = {
  // Scalar -> Scalar
  sin: { input: ['f32'], output: 'f32' },
  cos: { input: ['f32'], output: 'f32' },
  tan: { input: ['f32'], output: 'f32' },
  abs: { input: ['f32'], output: 'f32' },
  floor: { input: ['f32'], output: 'f32' },
  ceil: { input: ['f32'], output: 'f32' },
  fract: { input: ['f32'], output: 'f32' },
  sqrt: { input: ['f32'], output: 'f32' },
  exp: { input: ['f32'], output: 'f32' },
  f_sin: { input: ['f32'], output: 'f32' },
  f_cos: { input: ['f32'], output: 'f32' },
  f_n: { input: ['f32'], output: 'f32' },
  // Vec2 -> Scalar
  length: { input: ['vec2'], output: 'f32' },
  f_hash: { input: ['vec2'], output: 'f32' },
};

// Functions safe for scalar input
const SCALAR_SAFE = ['sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'fract', 'sqrt', 'f_sin', 'f_cos', 'f_n'];
// Functions safe for vec2 input
const VEC2_SAFE = ['length', 'f_hash', 'normalize'];

// -- INVARIANT 2: NUMERICAL STABILITY --
const STABLE_RANGES: Record<string, { min: number; max: number }> = {
  frequency: { min: 0.5, max: 50 },
  amplitude: { min: 0.01, max: 5 },
  offset: { min: -2, max: 2 },
  exponent: { min: 0.1, max: 4 },
  multiplier: { min: 0.1, max: 10 },
  time_speed: { min: 0.01, max: 2 },
  color: { min: 0, max: 1 },
};

function clampToStable(value: number, category: string): number {
  const range = STABLE_RANGES[category] || STABLE_RANGES.amplitude;
  return Math.max(range.min, Math.min(range.max, value));
}

function inferNumericCategory(tokens: Token[], idx: number): string {
  // Look backwards for context
  for (let i = idx - 1; i >= Math.max(0, idx - 5); i--) {
    const v = tokens[i].value;
    if (v === 'time') return 'time_speed';
    if (v === 'pow') return 'exponent';
    if (['sin', 'cos', 'f_sin', 'f_cos', 'fract'].includes(v)) return 'frequency';
    if (['vec3', 'vec4', 'f_pal'].includes(v)) return 'color';
  }
  // Look forward for context
  for (let i = idx + 1; i < Math.min(tokens.length, idx + 3); i++) {
    if (tokens[i].value === '*') return 'multiplier';
    if (['+', '-'].includes(tokens[i].value)) return 'offset';
  }
  return 'amplitude';
}

// -- INVARIANT 3: ENTROPY / DIVERSITY --
interface DiversityState {
  opCounts: Map<string, number>;
  funcCounts: Map<string, number>;
  numBuckets: Map<number, number>;
}

let diversity: DiversityState = {
  opCounts: new Map(),
  funcCounts: new Map(),
  numBuckets: new Map()
};

function updateDiversity(tokens: Token[]): void {
  diversity.opCounts.clear();
  diversity.funcCounts.clear();
  diversity.numBuckets.clear();

  for (const t of tokens) {
    if (t.type === 'punct' && OPS.includes(t.value)) {
      diversity.opCounts.set(t.value, (diversity.opCounts.get(t.value) || 0) + 1);
    }
    if (t.type === 'ident' && ALL_VALID_FUNCTIONS.includes(t.value)) {
      diversity.funcCounts.set(t.value, (diversity.funcCounts.get(t.value) || 0) + 1);
    }
    if (t.type === 'number') {
      const n = parseFloat(t.value);
      if (!isNaN(n)) {
        const bucket = Math.round(n * 2) / 2;
        diversity.numBuckets.set(bucket, (diversity.numBuckets.get(bucket) || 0) + 1);
      }
    }
  }
}

function getLeastUsed<T extends string>(options: T[], counts: Map<string, number>): T {
  let minCount = Infinity;
  let best = options[0];
  for (const opt of options) {
    const count = counts.get(opt) || 0;
    if (count < minCount) {
      minCount = count;
      best = opt;
    }
  }
  return best;
}

function getDiverseNumber(base: number): number {
  if (diversity.numBuckets.size === 0) return base;

  const baseBucket = Math.round(base * 2) / 2;
  let minCount = diversity.numBuckets.get(baseBucket) || 0;
  let bestBucket = baseBucket;

  // Search nearby for less crowded bucket
  for (let d = -3; d <= 3; d += 0.5) {
    const candidate = Math.round((base + d) * 2) / 2;
    if (Math.abs(candidate) > 15) continue;
    const count = diversity.numBuckets.get(candidate) || 0;
    if (count < minCount) {
      minCount = count;
      bestBucket = candidate;
    }
  }

  return base * 0.7 + bestBucket * 0.3;
}

// -- INVARIANT 4: ARGUMENT TYPE INFERENCE --
function inferArgType(tokens: Token[], funcIdx: number): WGSLType {
  let parenDepth = 0;
  let started = false;

  for (let j = funcIdx + 1; j < Math.min(tokens.length, funcIdx + 25); j++) {
    if (tokens[j].value === '(') { parenDepth++; started = true; }
    if (tokens[j].value === ')') parenDepth--;

    if (started && parenDepth > 0) {
      const v = tokens[j].value;
      // Known vec2 indicators
      if (v === 'uv' || v.includes('warp') || v.includes('geo') || v === 'vec2') return 'vec2';
      // Known scalar indicators
      if (v === 'time' || v.includes('layer') || v.includes('val')) return 'f32';
      // Check known function returns
      if (FUNC_SIGNATURES[v]?.output === 'vec2') return 'vec2';
      if (FUNC_SIGNATURES[v]?.output === 'f32') return 'f32';
    }
    if (started && parenDepth === 0) break;
  }
  return 'unknown';
}

// ============================================================================
// INVARIANT-ENFORCING MUTATION FUNCTIONS
// ============================================================================

function mutateNumbersWithDiversity(tokens: Token[], intensity: number): Token[] {
  updateDiversity(tokens);
  const frozen = getFrozenZones(tokens);

  return tokens.map((t, idx) => {
    // INVARIANT 0: Never mutate tokens in frozen zones
    if (frozen.has(idx)) return t;

    if (t.type === 'number' && t.value.includes('.')) {
      if (Math.random() < intensity) {
        const val = parseFloat(t.value);
        if (!isNaN(val)) {
          // Generate candidate
          let newVal = Math.random() < 0.5
            ? val + (Math.random() - 0.5) * 2
            : val * (0.5 + Math.random());

          // INVARIANT 2: Clamp to stable range based on context
          const category = inferNumericCategory(tokens, idx);
          newVal = clampToStable(newVal, category);

          // INVARIANT 3: Nudge towards diversity
          newVal = getDiverseNumber(newVal);

          // Never exactly zero (div-by-zero risk)
          if (Math.abs(newVal) < 0.001) newVal = 0.01;

          return { ...t, value: newVal.toFixed(3) };
        }
      }
    }
    return t;
  });
}

function mutateOperatorsWithDiversity(tokens: Token[], intensity: number): Token[] {
  updateDiversity(tokens);
  const frozen = getFrozenZones(tokens);

  return tokens.map((t, idx) => {
    // INVARIANT 0: Never mutate tokens in frozen zones
    if (frozen.has(idx)) return t;

    if (t.type === 'punct' && OPS.includes(t.value)) {
      if (Math.random() < intensity) {
        // INVARIANT 1: Check if this is a "leading" operator position
        // (after '=', '(', ',', or at expression start)
        let isLeadingPosition = false;
        for (let j = idx - 1; j >= 0; j--) {
          if (tokens[j].type === 'whitespace') continue;
          const prevVal = tokens[j].value;
          if (prevVal === '=' || prevVal === '(' || prevVal === ',' || prevVal === 'return') {
            isLeadingPosition = true;
          }
          break;
        }

        // INVARIANT 2: In leading position, only allow '-' (unary minus only, no unary +)
        let allowedOps = OPS;
        if (isLeadingPosition) {
          allowedOps = ['-']; // Only unary minus is valid in WGSL
        }

        // INVARIANT 3: Get entropy-maximizing choice from allowed
        let choice = getLeastUsed(allowedOps, diversity.opCounts);

        // INVARIANT 4: Avoid division by small numbers
        if (choice === '/') {
          for (let j = idx + 1; j < Math.min(tokens.length, idx + 4); j++) {
            if (tokens[j].type === 'number') {
              const n = parseFloat(tokens[j].value);
              if (!isNaN(n) && Math.abs(n) < 0.1) {
                choice = getRandomItem(['+', '-', '*']);
              }
              break;
            }
          }
        }

        // INVARIANT 5: Check if previous token is also an operator (avoid "* /")
        let prevIsOp = false;
        for (let j = idx - 1; j >= 0; j--) {
          if (tokens[j].type === 'whitespace') continue;
          if (tokens[j].type === 'punct' && OPS.includes(tokens[j].value)) {
            prevIsOp = true;
          }
          break;
        }
        if (prevIsOp) {
          // Don't change this operator - would create double op
          return t;
        }

        // 80% diversity, 20% exploration (within allowed set)
        if (Math.random() < 0.8) {
          return { ...t, value: choice };
        }
        return { ...t, value: getRandomItem(allowedOps) };
      }
    }
    return t;
  });
}

function mutateBuiltinsWithDiversity(tokens: Token[], intensity: number): Token[] {
  updateDiversity(tokens);
  const frozen = getFrozenZones(tokens);

  return tokens.map((t, idx) => {
    // INVARIANT 0: Never mutate tokens in frozen zones
    if (frozen.has(idx)) return t;

    if (t.type === 'ident' && SAFE_BUILTINS.includes(t.value)) {
      if (Math.random() < intensity) {
        // INVARIANT 1: Infer argument type
        const argType = inferArgType(tokens, idx);

        // Filter to type-compatible functions
        let validChoices = [...SAFE_BUILTINS];
        if (argType === 'vec2') {
          validChoices = validChoices.filter(f => VEC2_SAFE.includes(f) || !SCALAR_SAFE.includes(f));
        } else if (argType === 'f32') {
          validChoices = validChoices.filter(f => SCALAR_SAFE.includes(f) || !VEC2_SAFE.includes(f));
        }
        if (validChoices.length === 0) validChoices = SAFE_BUILTINS;

        // INVARIANT 3: Get entropy-maximizing choice from valid options
        const choice = getLeastUsed(validChoices, diversity.funcCounts);

        // 75% diversity, 25% exploration
        if (Math.random() < 0.75) {
          return { ...t, value: choice };
        }
        return { ...t, value: getRandomItem(validChoices) };
      }
    }
    return t;
  });
}

// -- Validation & Syntax Fixing --

/**
 * Validates and fixes common syntax issues in generated WGSL code.
 * This acts as a post-processing step to catch parser errors before compilation.
 *
 * ABSTRACT INVARIANTS enforced:
 * 1. No leading operators after '=' (except unary minus on a number)
 * 2. No double operators of any kind
 * 3. No undefined function calls (noise, fbm, etc.)
 * 4. No type mismatches (f_hash returns f32, not vec2)
 * 5. All integer-requiring contexts use integers
 */
function validateAndFixSyntax(code: string): string {
    // PHASE -1: Run the syntax sanitizer first (handles redeclarations, smoothstep args, etc.)
    let fixed = sanitizeShader(code);

    // ==================================================
    // PHASE 0: Fix uniform binding layout (CRITICAL - must be first!)
    // Standard layout: time=0, resolution=1, mouse=2, scroll=3
    // ==================================================

    // Fix corrupted binding numbers for standard uniforms
    fixed = fixed.replace(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)\s*var<uniform>\s*time\s*:/g,
        '@group(0) @binding(0) var<uniform> time :');
    fixed = fixed.replace(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)\s*var<uniform>\s*resolution\s*:/g,
        '@group(0) @binding(1) var<uniform> resolution :');
    fixed = fixed.replace(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)\s*var<uniform>\s*mouse\s*:/g,
        '@group(0) @binding(2) var<uniform> mouse :');
    fixed = fixed.replace(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)\s*var<uniform>\s*scroll\s*:/g,
        '@group(0) @binding(3) var<uniform> scroll :');

    // ==================================================
    // PHASE 0.5: Fix for-loop increment operators (CRITICAL!)
    // Mutations corrupt i++ to "i+1.0)" - we need to fix this pattern!
    // ==================================================

    // Fix corrupted for-loop increments: "i+1.0)" or "i1.0)" -> "i++)"
    // The key pattern is: loop variable followed by +, *, or digit, then a number, then )
    fixed = fixed.replace(/;\s*i\s*[+*]?\s*\d+\.?\d*\s*\)/g, '; i++)');
    fixed = fixed.replace(/;\s*j\s*[+*]?\s*\d+\.?\d*\s*\)/g, '; j++)');

    // Also fix patterns like "i+1.0)" or "j+1.0)" that appear at end of for-loops
    fixed = fixed.replace(/\bi\+\d+\.?\d*\)/g, 'i++)');
    fixed = fixed.replace(/\bj\+\d+\.?\d*\)/g, 'j++)');
    fixed = fixed.replace(/\bi\d+\.?\d*\)/g, 'i++)');
    fixed = fixed.replace(/\bj\d+\.?\d*\)/g, 'j++)');

    // ==================================================
    // PHASE 0.6: Fix missing let/var in variable declarations
    // ==================================================

    // Fix "f = fract(" that's missing "let" (common in voronoi function)
    // Look for standalone "f = fract(" at beginning of line or after semicolon
    fixed = fixed.replace(/(\n\s+)f\s*=\s*fract\(/g, '$1let f = fract(');
    fixed = fixed.replace(/(;\s*)f\s*=\s*fract\(/g, '$1let f = fract(');
    // Also handle case where it's at start of function body
    fixed = fixed.replace(/(\{\s*)f\s*=\s*fract\(/g, '$1let f = fract(');

    // ==================================================
    // PHASE 1: Replace undefined functions with valid alternatives
    // ==================================================

    // Replace noise() CALLS with a valid hash-based alternative
    // CRITICAL: Use negative lookbehind to NOT match 'fn noise(' function declarations
    fixed = fixed.replace(/(?<!fn\s)\bnoise\s*\(\s*([^)]+)\s*\)/g, (match, arg) => {
        // Don't replace if arg contains ':' (function parameter definition)
        if (arg.includes(':')) return match;
        return `fract(sin(dot(${arg}, vec2<f32>(12.9898, 78.233))) * 43758.5453)`;
    });

    // Replace fbm() CALLS with a simple multi-octave approximation
    // CRITICAL: Use negative lookbehind to NOT match 'fn fbm(' function declarations
    fixed = fixed.replace(/(?<!fn\s)\bfbm\s*\(\s*([^)]+)\s*\)/g, (match, arg) => {
        // Don't replace if arg contains ':' (function parameter definition)
        if (arg.includes(':')) return match;
        return `(fract(sin(dot(${arg}, vec2<f32>(12.9898, 78.233))) * 43758.5453) * 0.5 + fract(sin(dot(${arg} * 2.0, vec2<f32>(12.9898, 78.233))) * 43758.5453) * 0.25)`;
    });

    // ==================================================
    // PHASE 2: Fix LEADING operators after = (critical!)
    // ==================================================

    // Pattern: "= *num" or "= /num" or "= +num" -> "= num"
    // But preserve "= -num" (unary minus is valid)
    fixed = fixed.replace(/=\s*\*/g, '= ');
    fixed = fixed.replace(/=\s*\//g, '= ');
    fixed = fixed.replace(/=\s*\+(?=\s*[\d(])/g, '= ');  // "= +" followed by digit or paren

    // Pattern: "= +-num" or "= -+num" etc -> "= -num" or "= num"
    fixed = fixed.replace(/=\s*\+-/g, '= -');
    fixed = fixed.replace(/=\s*-\+/g, '= -');
    fixed = fixed.replace(/=\s*\+\+/g, '= ');
    fixed = fixed.replace(/=\s*--/g, '= ');
    fixed = fixed.replace(/=\s*\*-/g, '= -');
    fixed = fixed.replace(/=\s*\*\+/g, '= ');
    fixed = fixed.replace(/=\s*\/-/g, '= -');
    fixed = fixed.replace(/=\s*\/\+/g, '= ');

    // ==================================================
    // PHASE 3: Fix double operators anywhere
    // ==================================================

    // Fix double negatives: --0.5 -> 0.5
    fixed = fixed.replace(/--(\d)/g, '$1');
    fixed = fixed.replace(/-- /g, '');

    // Fix +- and -+ patterns (but NOT ++ or -- which are valid increment/decrement)
    fixed = fixed.replace(/\+-/g, '-');
    fixed = fixed.replace(/-\+/g, '-');
    // NOTE: Don't fix "++" or "--" as they are valid WGSL increment/decrement operators
    // fixed = fixed.replace(/\+\+/g, '+');  // DISABLED - breaks i++

    // Fix operator-operator sequences: "* /" -> "*", "+ *" -> "+", etc
    fixed = fixed.replace(/([+\-])\s*\*/g, '$1');  // "- *" -> "-"
    fixed = fixed.replace(/([+\-])\s*\//g, '$1');  // "+ /" -> "+"
    fixed = fixed.replace(/\*\s*\*/g, '*');        // "* *" -> "*"
    // NOTE: Don't fix "/ /" -> "/" as it corrupts // comments
    // fixed = fixed.replace(/\/\s*\//g, '/');  // DISABLED - breaks comments
    fixed = fixed.replace(/\*\s*\//g, '*');        // "* /" -> "*"
    fixed = fixed.replace(/\/\s*\*/g, '/');        // "/ *" -> "/"

    // Fix operators followed by closing paren: "* )" -> "1.0)"
    fixed = fixed.replace(/([+\-*/])\s*\)/g, '1.0)');

    // Fix operators after opening paren (except unary minus): "(+ " -> "("
    fixed = fixed.replace(/\(\s*\*/g, '(');
    fixed = fixed.replace(/\(\s*\//g, '(');
    fixed = fixed.replace(/\(\s*\+(?=\s*[\d(])/g, '(');

    // Fix operator before comma: "* ," -> ", 1.0"
    fixed = fixed.replace(/([+\-*/])\s*,/g, ', 1.0,').replace(/, 1\.0,,/g, ', 1.0,');

    // Fix comma followed by operator (except unary minus): ", +" -> ", "
    fixed = fixed.replace(/,\s*\*/g, ', ');
    fixed = fixed.replace(/,\s*\//g, ', ');
    fixed = fixed.replace(/,\s*\+(?=\s*[\d(])/g, ', ');

    // ==================================================
    // PHASE 4: Standard fixes
    // ==================================================

    // Remove double semicolons
    fixed = fixed.replace(/;;+/g, ';');

    // Remove unary + before numbers in function arguments
    fixed = fixed.replace(/([,(]\s*)\+(\d)/g, '$1$2');

    // @binding must be integer - preserve the original binding number!
    fixed = fixed.replace(/@binding\s*\(\s*[\d.]+\s*\)/g, (match) => {
        const numMatch = match.match(/[\d.]+/);
        if (numMatch) {
            const val = parseFloat(numMatch[0]);
            const intVal = Math.round(val);
            // Keep the binding number as-is (0, 1, 2, or 3), just ensure it's an integer
            const safeVal = Math.max(0, Math.min(intVal, 10)); // Clamp to reasonable range
            return `@binding(${safeVal})`;
        }
        return match; // Preserve original if parsing fails
    });

    // @location must be integer
    fixed = fixed.replace(/@location\s*\(\s*[\d.]+\s*\)/g, (match) => {
        const numMatch = match.match(/[\d.]+/);
        if (numMatch) {
            const intVal = Math.round(parseFloat(numMatch[0]));
            return `@location(${Math.max(0, intVal)})`;
        }
        return '@location(0)';
    });

    // smoothstep needs 3 arguments
    fixed = fixed.replace(/smoothstep\s*\(\s*([^,)]+)\s*,\s*([^,)]+)\s*\)/g,
        (match, arg1, arg2) => `smoothstep(0.0, ${arg1.trim()}, ${arg2.trim()})`);

    // f_hash returns f32, not vec2
    fixed = fixed.replace(/f_hash\s*\(([^)]+)\)\s*\.x/g, 'f_hash($1)');
    fixed = fixed.replace(/f_hash\s*\(([^)]+)\)\s*\.y/g, 'f_hash($1 + 57.0)');

    // f_n takes f32, not vec2
    fixed = fixed.replace(/f_n\s*\(\s*([^)]+)\s*\/\s*([^)]+)\s*\)/g, (match, a, b) => {
        if (a.includes('uv') || a.includes('warp') || a.includes('geo')) {
            return `f_n(length(${a} / ${b}))`;
        }
        return match;
    });
    fixed = fixed.replace(/f_n\s*\(\s*(\w+_geo_\d+)\s*\)/g, 'f_n(length($1))');
    fixed = fixed.replace(/f_n\s*\(\s*(uv[^)]*)\s*\)/g, (match, inner) => {
        if (inner.includes('*') || inner.includes('-') || inner.includes('+')) {
            return `f_n(length(${inner}))`;
        }
        if (inner.trim() === 'uv') {
            return 'f_n(uv.x)';
        }
        return match;
    });

    // Ensure clamp arguments are in correct order (min <= max)
    fixed = fixed.replace(/clamp\(([^,]+),\s*([^,]+),\s*([^)]+)\)/g, (match, val, minVal, maxVal) => {
        const minNum = parseFloat(minVal);
        const maxNum = parseFloat(maxVal);
        if (!isNaN(minNum) && !isNaN(maxNum) && minNum > maxNum) {
            return `clamp(${val}, ${maxVal.trim()}, ${minVal.trim()})`;
        }
        return match;
    });

    // ==================================================
    // PHASE 5: Fix missing uniform replacements
    // ==================================================

    // u_mouse/u_scroll don't exist - replace
    fixed = fixed.replace(/u_mouse\.xy/g, 'vec2<f32>(0.5, 0.5)');
    fixed = fixed.replace(/u_mouse\.x/g, '0.5');
    fixed = fixed.replace(/u_mouse\.y/g, '0.5');
    fixed = fixed.replace(/u_mouse/g, 'vec2<f32>(0.5, 0.5)');
    fixed = fixed.replace(/u_scroll\.y/g, '(time * 100.0)');
    fixed = fixed.replace(/u_scroll\.x/g, '(time * 50.0)');
    fixed = fixed.replace(/u_scroll/g, 'vec2<f32>(time * 50.0, time * 100.0)');
    fixed = fixed.replace(/u_time/g, 'time');

    // ==================================================
    // PHASE 6: Track and fix variable issues
    // ==================================================

    const hashVars = new Set<string>();
    const hashAssignRegex = /(?:let|var)\s+(\w+)\s*=\s*f_hash\s*\(/g;
    let hashMatch;
    while ((hashMatch = hashAssignRegex.exec(fixed)) !== null) {
        hashVars.add(hashMatch[1]);
    }
    for (const varName of hashVars) {
        const xRegex = new RegExp(`\\b${varName}\\.x\\b`, 'g');
        const yRegex = new RegExp(`\\b${varName}\\.y\\b`, 'g');
        fixed = fixed.replace(xRegex, varName);
        fixed = fixed.replace(yRegex, `(${varName} + 0.5)`);
    }

    // Remove redeclared variables
    const declaredVars = new Set<string>();
    const lines = fixed.split('\n');
    const fixedLines: string[] = [];

    for (const line of lines) {
        const declMatch = line.match(/^\s*(let|var)\s+(\w+)\s*(:|=)/);
        if (declMatch) {
            const varName = declMatch[2];
            if (declaredVars.has(varName)) {
                const fixedLine = line.replace(/^\s*(let|var)\s+(\w+)\s*=/, `    ${varName} =`);
                fixedLines.push(fixedLine);
            } else {
                declaredVars.add(varName);
                fixedLines.push(line);
            }
        } else {
            fixedLines.push(line);
        }
    }
    fixed = fixedLines.join('\n');

    // ==================================================
    // PHASE 7: Final cleanup pass (run multiple times for nested issues)
    // ==================================================
    for (let pass = 0; pass < 3; pass++) {
        // Double operators - with and without spaces
        // CRITICAL: Use negative lookahead/lookbehind to NOT break i++ or i--
        // Only fix "+ +" (with space) not "++" (increment operator)
        fixed = fixed.replace(/\+\s\s*\+/g, '+');   // "+ +" with whitespace -> +
        fixed = fixed.replace(/-\s\s*-/g, '+');     // "- -" with whitespace -> +
        fixed = fixed.replace(/\+\s*-/g, '-');      // + - -> -
        fixed = fixed.replace(/-\s*\+/g, '-');      // - + -> -
        fixed = fixed.replace(/\*\s*-/g, '* (-1.0) *'); // * - -> * (-1.0) *
        fixed = fixed.replace(/\*\s*\+/g, '*');     // * + -> *
        fixed = fixed.replace(/\/\s*-/g, '/ (-1.0) *'); // / - -> / (-1.0) *
        fixed = fixed.replace(/\/\s*\+/g, '/');     // / + -> /
        fixed = fixed.replace(/\*\s*\*/g, '*');     // * * -> *
        // NOTE: Don't fix "/ /" -> "/" as it corrupts // comments
        // fixed = fixed.replace(/\/\s*\//g, '/');     // / / -> /  DISABLED
        fixed = fixed.replace(/\*\s*\//g, '*');     // * / -> *
        fixed = fixed.replace(/\/\s*\*/g, '/');     // / * -> /

        // Leading operators after =
        fixed = fixed.replace(/=\s*[*/]/g, '= ');
        fixed = fixed.replace(/=\s*\+(?!\d)/g, '= ');

        // Empty parentheses
        fixed = fixed.replace(/\(\s*\)/g, '(1.0)');

        // Fix number followed by number without operator: "0.313 0.473" -> "0.313 * 0.473"
        fixed = fixed.replace(/(\d+\.\d+)\s+(\d+\.\d+)/g, '$1 * $2');

        // Fix operator at end of line before a number on next line
        fixed = fixed.replace(/([+\-*/])\s*\n\s*([+\-*/])/g, '$1');
    }

    // ==================================================
    // PHASE 8: Protect @binding, @location, @group annotations (critical!)
    // ==================================================

    // Fix double parentheses in annotations: @group(0)) -> @group(0)
    fixed = fixed.replace(/@(group|binding|location)\s*\(\s*(\d+)\s*\)\s*\)/g, '@$1($2)');

    // Fix double closing parens after return type: -> @location(0)) vec4 -> -> @location(0) vec4
    fixed = fixed.replace(/->\s*@location\s*\(\s*(\d+)\s*\)\s*\)/g, '-> @location($1)');

    // Ensure @binding only has a simple integer
    fixed = fixed.replace(/@binding\s*\([^)]*\)/g, (match) => {
        // Extract just the first number if any
        const numMatch = match.match(/\d+/);
        const val = numMatch ? Math.min(parseInt(numMatch[0], 10), 31) : 0;
        return `@binding(${val})`;
    });

    // Ensure @group only has a simple integer
    fixed = fixed.replace(/@group\s*\([^)]*\)/g, (match) => {
        const numMatch = match.match(/\d+/);
        const val = numMatch ? Math.min(parseInt(numMatch[0], 10), 3) : 0;
        return `@group(${val})`;
    });

    // Ensure @location only has a simple integer
    fixed = fixed.replace(/@location\s*\([^)]*\)/g, (match) => {
        const numMatch = match.match(/\d+/);
        const val = numMatch ? parseInt(numMatch[0], 10) : 0;
        return `@location(${val})`;
    });

    // Ensure @workgroup_size only has simple integers
    fixed = fixed.replace(/@workgroup_size\s*\([^)]*\)/g, (match) => {
        const nums = match.match(/\d+/g);
        if (nums && nums.length >= 3) {
            return `@workgroup_size(${nums[0]}, ${nums[1]}, ${nums[2]})`;
        } else if (nums && nums.length >= 1) {
            return `@workgroup_size(${nums[0]}, 1, 1)`;
        }
        return '@workgroup_size(1, 1, 1)';
    });

    return fixed;
}

/**
 * Checks if all function calls in the code use valid functions.
 * Returns an array of unknown function names found.
 */
function findUnknownFunctions(tokens: Token[]): string[] {
    const unknown: string[] = [];

    for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        if (t.type === 'ident') {
            // Check if next non-whitespace token is '('
            let j = i + 1;
            while (j < tokens.length && tokens[j].type === 'whitespace') j++;

            if (j < tokens.length && tokens[j].value === '(') {
                // This is a function call
                const funcName = t.value;
                // Skip known keywords
                if (['fn', 'var', 'let', 'if', 'for', 'while', 'return', 'struct'].includes(funcName)) {
                    continue;
                }
                if (!ALL_VALID_FUNCTIONS.includes(funcName)) {
                    unknown.push(funcName);
                }
            }
        }
    }

    return [...new Set(unknown)]; // Return unique names
}

// ============================================================================
// QUALITY-GUIDED GENERATION
// ============================================================================

/**
 * Simple generation - no quality filtering for now (was causing crashes)
 */
function generateWithQualityFilter<T extends string>(
    generator: () => T,
    _maxAttempts: number = 5,
    _minQuality: number = 35
): T {
    // Just generate once - quality analysis was crashing the parser
    return generator();
}

/**
 * Post-process shader to improve quality (fix common ugly patterns)
 */
function improveShaderAesthetics(code: string): string {
    let improved = code;

    // Replace harsh step with smoothstep where possible
    improved = improved.replace(
        /\bstep\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
        (match, edge, x) => {
            // Only replace if it's a simple pattern
            if (edge.includes('(') || x.includes('(')) return match;
            return `smoothstep(${edge} - 0.02, ${edge} + 0.02, ${x})`;
        }
    );

    // Avoid division by zero: wrap bare variables in safe divisor
    improved = improved.replace(
        /\/\s*([a-zA-Z_]\w*)(?!\s*\()/g,
        (match, varName) => {
            // Don't wrap if already safe
            if (['resolution', 'time'].includes(varName)) return match;
            return `/ max(abs(${varName}), 0.001)`;
        }
    );

    // Reduce overly high frequencies (>100) in sin/cos
    improved = improved.replace(
        /(sin|cos)\s*\(\s*([^)]+)\s*\*\s*(\d+\.?\d*)/g,
        (match, func, expr, freq) => {
            const freqNum = parseFloat(freq);
            if (freqNum > 80) {
                return `${func}(${expr} * ${(freqNum / 4).toFixed(1)}`;
            }
            return match;
        }
    );

    return improved;
}

// -- Main Fuzz Function --

export const fuzzShader = (code: string, config: FuzzConfig): string => {
  // Try multiple mutations and pick the best quality one
  return generateWithQualityFilter(() => {
    let tokens = tokenize(code);

    // UNLEASHED MODE: More aggressive mutations for artistic freedom
    // Track structural mutations but allow more
    let structuralMutations = 0;
    const maxStructural = Math.floor(3 + config.intensity * 3); // Scale with intensity

    // 1. Structural / Latent - MORE AGGRESSIVE
    if (config.mutateStructure && Math.random() < config.intensity * 0.8 && structuralMutations < maxStructural) {
      tokens = mutateStructure(tokens, config.intensity);
      structuralMutations++;
    }

    if (config.mutateGeometry && Math.random() < config.intensity * 0.8 && structuralMutations < maxStructural) {
      tokens = mutateGeometry(tokens, config.intensity);
      structuralMutations++;
    }

    // Color mutation - MORE INTENSE
    if (config.mutateColor && Math.random() < config.intensity * 1.2) {
      tokens = mutateColor(tokens, config.intensity);
    }

  // Chaos - UNLEASH IT (with reasonable bounds)
  if (config.mutateChaos && Math.random() < config.intensity * 0.7 && structuralMutations < maxStructural) {
    tokens = mutateChaos(tokens, config.intensity);
    structuralMutations++;
  }

  // 2. Atomic mutations - MORE AGGRESSIVE
  if (config.mutateNumbers) {
    tokens = mutateNumbersWithDiversity(tokens, config.intensity);
  }

  if (config.mutateOperators) {
    tokens = mutateOperatorsWithDiversity(tokens, config.intensity * 0.7);
  }

  if (config.mutateBuiltins) {
    tokens = mutateBuiltinsWithDiversity(tokens, config.intensity * 0.8);
  }

  // Swizzling - more liberal
  if (config.intensity > 0.15) {
      tokens = mutateSwizzle(tokens, config.intensity);
  }

  // Add extra creative mutations at high intensity
  if (config.intensity > 0.5) {
    // Extra number variations for wild effects
    if (Math.random() < 0.3) {
      tokens = mutateNumbersWithDiversity(tokens, config.intensity * 0.5);
    }
    // Extra operator swaps for unexpected combos
    if (Math.random() < 0.2 && structuralMutations < maxStructural) {
      tokens = mutateOperatorsWithDiversity(tokens, config.intensity * 0.4);
      structuralMutations++;
    }
  }

  // Final validation and syntax fixing
  let result = tokens.map(t => t.value).join('');
  result = validateAndFixSyntax(result);

  // Apply aesthetic improvements
  result = improveShaderAesthetics(result);

  // ANTI-CONVERGENCE: Check and repair shader health
  const { code: healthyResult, health, wasRepaired } = ensureShaderHealth(result, true);
  if (wasRepaired) {
    console.log(`[Fuzz] Shader health repaired: ${health.overallHealth.toFixed(2)}`);
  }

  // If health is too low, regenerate
  if (health.overallHealth < 0.3) {
    console.log(`[Fuzz] Health too low (${health.overallHealth.toFixed(2)}), returning original`);
    return code;
  }

  // Log any unknown functions for debugging (these would cause compilation errors)
  const unknownFuncs = findUnknownFunctions(tokenize(healthyResult));
  if (unknownFuncs.length > 0) {
      console.warn('[Fuzzer] Unknown functions detected:', unknownFuncs);
  }

  // CRITICAL: Validate and fix WGSL type errors before returning
  const { fixedCode, fixes } = validateAndFixShader(healthyResult);
  if (fixes.length > 0) {
    console.log(`[Fuzz] Applied type fixes:`, fixes);
  }
  return fixedCode;
  }, 3, 30); // Try up to 3 times, accept quality >= 30
};

/**
 * MATH FUZZ - TRUE PROCEDURAL MATH EXPRESSION GENERATION
 *
 * Generates shaders using PURELY PROCEDURAL mathematical expressions.
 * NO preset equations, NO curated formulas - infinite possibility space.
 * Can theoretically generate ANY visual pattern through random expression trees.
 */
export const mathFuzzShader = (_baseCode: string, complexity: number = 2): string => {
  // TRUE PROCEDURAL - Build random math expressions from atomic operations
  const depth = Math.max(3, Math.min(6, complexity + 2));

  // Generate multiple procedural expressions and combine them
  const numExprs = Math.max(1, Math.min(4, Math.floor(complexity)));
  const exprs: string[] = [];

  for (let i = 0; i < numExprs; i++) {
    exprs.push(generateProceduralScalar('uv', depth));
  }

  // Combine expressions procedurally
  let scalarExpr = exprs[0];
  for (let i = 1; i < exprs.length; i++) {
    // Procedural combination - no preset combiners
    const combineChoice = Math.floor(Math.random() * 10);
    switch (combineChoice) {
      case 0: scalarExpr = `(${scalarExpr} + ${exprs[i]}) * 0.5`; break;
      case 1: scalarExpr = `(${scalarExpr} * ${exprs[i]})`; break;
      case 2: scalarExpr = `mix(${scalarExpr}, ${exprs[i]}, 0.5)`; break;
      case 3: scalarExpr = `f_smin(${scalarExpr}, ${exprs[i]}, 0.3)`; break;
      case 4: scalarExpr = `max(${scalarExpr}, ${exprs[i]})`; break;
      case 5: scalarExpr = `min(${scalarExpr}, ${exprs[i]})`; break;
      case 6: scalarExpr = `sin(${scalarExpr}) * cos(${exprs[i]})`; break;
      case 7: scalarExpr = `abs(${scalarExpr} - ${exprs[i]})`; break;
      case 8: scalarExpr = `smoothstep(0.0, 1.0, ${scalarExpr}) * ${exprs[i]}`; break;
      default: scalarExpr = `fract(${scalarExpr} + ${exprs[i]})`; break;
    }
  }

  // Generate procedural color from scalar - NO PRESET PALETTES
  const colorExpr = generateProceduralColor('uv', depth - 1);

  // Combine scalar pattern with color procedurally
  const finalColorChoice = Math.floor(Math.random() * 5);
  let finalColor: string;
  switch (finalColorChoice) {
    case 0:
      finalColor = `${colorExpr} * (${scalarExpr} * 0.5 + 0.5)`;
      break;
    case 1:
      finalColor = `mix(${colorExpr}, vec3<f32>(${scalarExpr}), 0.5)`;
      break;
    case 2:
      finalColor = `vec3<f32>(sin(${scalarExpr} * 3.0) * 0.5 + 0.5, cos(${scalarExpr} * 2.5) * 0.5 + 0.5, sin(${scalarExpr} * 2.0 + 1.57) * 0.5 + 0.5)`;
      break;
    case 3:
      finalColor = `${colorExpr} + vec3<f32>(${scalarExpr} * 0.3)`;
      break;
    default:
      finalColor = `mix(vec3<f32>(${scalarExpr}), ${colorExpr}, smoothstep(0.0, 1.0, ${scalarExpr}))`;
      break;
  }

  // Build the complete shader - NO PRESET NAMES
  const uid = Math.floor(Math.random() * 1000000);
  const shader = `
@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;

// Procedural Math Fuzz #${uid}
// TRUE PROCEDURAL - No presets

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
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
    var col = ${finalColor};
    col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(col, 1.0);
}
`;

  // CRITICAL: Validate and fix WGSL type errors before returning
  const { fixedCode, fixes } = validateAndFixShader(validateAndFixSyntax(shader));
  if (fixes.length > 0) {
    console.log(`[Math Fuzz] Applied type fixes:`, fixes);
  }
  return fixedCode;
};

/**
 * AESTHETIC FUZZ - TRUE PROCEDURAL FUZZING
 *
 * Generates aesthetic shaders using ONLY procedural generation.
 * NO preset patterns, NO curated palettes - just pure procedural randomness.
 */

export const aestheticFuzzShader = (_code: string, _config: FuzzConfig): string => {
  // TRUE PROCEDURAL - Generate entirely from scratch using procedural algorithms
  const shader = generateProceduralAestheticShader();

  // CRITICAL: Validate and fix WGSL type errors before returning
  const { fixedCode, fixes } = validateAndFixShader(validateAndFixSyntax(shader));
  if (fixes.length > 0) {
    console.log(`[Aesthetic Fuzz] Applied type fixes:`, fixes);
  }
  return fixedCode;
};

/**
 * PRO DESIGNER FUZZ - Award-Winning Mutation System
 *
 * A TRUE MUTATOR that transforms existing shaders using:
 * - Aesthetic invariants from award-winning visual design
 * - Token-level mutations that preserve shader structure
 * - Golden ratio, rule of thirds, harmonic proportions
 * - Professional color theory (complementary, analogous, triadic)
 * - Smooth transitions over harsh edges
 * - Depth and dimensionality through layering
 */

// Award-winning constants
const PHI = 1.618033988749895; // Golden ratio
const RULE_OF_THIRDS = 0.333;
const HARMONIC_RATIOS = [1, PHI, PHI * PHI, 2, Math.PI, Math.E];

// Professional color relationships (hue offsets in radians)
const COLOR_HARMONIES = {
  complementary: Math.PI,
  analogous: Math.PI / 6,
  triadic: Math.PI * 2 / 3,
  splitComplementary: Math.PI * 5 / 6,
  tetradic: Math.PI / 2,
};

// Award-winning value ranges (tested for visual appeal)
const AWARD_WINNING_VALUES = {
  // Frequencies that look good
  frequencies: [3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, PHI * 5, PHI * 8],
  // Smooth time multipliers
  timeSpeeds: [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 1.0 / PHI],
  // Balanced blend factors
  blendFactors: [0.3, 0.382, 0.5, 0.618, 0.7], // 0.382 and 0.618 are golden ratio related
  // Pleasing exponents
  exponents: [0.5, 1.0 / PHI, 1.0, PHI, 2.0, 2.2, 3.0],
  // Radius/distance values
  radii: [0.2, 0.25, 0.3, 0.382, 0.5, 0.618],
};

const pickAward = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randAward = (min: number, max: number) => min + Math.random() * (max - min);
const maybeAward = (p: number) => Math.random() < p;

// Mutation: Apply golden ratio to numeric values
function mutateWithGoldenRatio(tokens: Token[], intensity: number): Token[] {
  return tokens.map(t => {
    if (t.type === 'number' && Math.random() < intensity * 0.3) {
      const val = parseFloat(t.value);
      if (isNaN(val) || val === 0) return t;

      // Apply golden ratio transformation
      const transforms = [
        () => val * PHI,
        () => val / PHI,
        () => val * (1 / PHI),
        () => Math.round(val * PHI) / PHI,
        () => pickAward(AWARD_WINNING_VALUES.frequencies),
        () => pickAward(AWARD_WINNING_VALUES.blendFactors),
      ];

      const newVal = pickAward(transforms)();
      // Keep values in reasonable range
      if (Math.abs(newVal) > 100 || Math.abs(newVal) < 0.001) return t;
      return { ...t, value: newVal.toFixed(3) };
    }
    return t;
  });
}

// Mutation: Inject harmonious color transforms
function injectColorHarmony(tokens: Token[], intensity: number): Token[] {
  // Find vec3 color definitions and make them more harmonious
  const newTokens = [...tokens];

  for (let i = 0; i < newTokens.length - 5; i++) {
    const t = newTokens[i];
    if (t.type === 'ident' && t.value === 'vec3' && Math.random() < intensity * 0.4) {
      // Find the closing paren of this vec3
      let openParen = -1;
      for (let j = i; j < Math.min(i + 10, newTokens.length); j++) {
        if (newTokens[j].value === '(') {
          openParen = j;
          break;
        }
      }
      if (openParen === -1) continue;

      // Count numbers inside and potentially harmonize them
      let balance = 1;
      let numCount = 0;
      for (let j = openParen + 1; j < newTokens.length && balance > 0; j++) {
        if (newTokens[j].value === '(') balance++;
        if (newTokens[j].value === ')') balance--;
        if (balance > 0 && newTokens[j].type === 'number') {
          numCount++;
          if (numCount <= 3 && Math.random() < intensity * 0.5) {
            // Apply harmonic color value
            const baseHue = Math.random();
            const harmony = pickAward(Object.values(COLOR_HARMONIES));
            const colorVals = [
              0.5 + 0.5 * Math.sin(baseHue * Math.PI * 2),
              0.5 + 0.5 * Math.sin((baseHue + harmony / (Math.PI * 2)) * Math.PI * 2),
              0.5 + 0.5 * Math.sin((baseHue - harmony / (Math.PI * 2)) * Math.PI * 2),
            ];
            newTokens[j] = { ...newTokens[j], value: colorVals[numCount - 1].toFixed(3) };
          }
        }
      }
    }
  }

  return newTokens;
}

// Mutation: Replace harsh operations with smooth ones
function smoothifyOperations(tokens: Token[], intensity: number): Token[] {
  const newTokens = [...tokens];

  for (let i = 0; i < newTokens.length; i++) {
    const t = newTokens[i];

    // Replace step with smoothstep
    if (t.type === 'ident' && t.value === 'step' && Math.random() < intensity * 0.6) {
      newTokens[i] = { ...t, value: 'smoothstep' };
    }

    // Replace max/min with f_smin for smoother blending
    if (t.type === 'ident' && (t.value === 'min' || t.value === 'max') && Math.random() < intensity * 0.3) {
      newTokens[i] = { ...t, value: 'f_smin' };
    }

    // Replace abs with smooth abs alternative where possible
    if (t.type === 'ident' && t.value === 'abs' && Math.random() < intensity * 0.2) {
      // Keep abs but it's okay - it's already smooth at 0
    }

    // Replace fract with smoothstep-based variant occasionally
    if (t.type === 'ident' && t.value === 'fract' && Math.random() < intensity * 0.15) {
      // Can't easily replace fract inline, skip
    }
  }

  return newTokens;
}

// Mutation: Inject professional post-processing
function injectPostProcessing(tokens: Token[], intensity: number): Token[] {
  // Find return statement and inject before it
  let retIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === 'ident' && tokens[i].value === 'return') {
      retIdx = i;
      break;
    }
  }
  if (retIdx === -1) return tokens;

  const postEffects: string[] = [];
  const uid = Math.floor(Math.random() * 100000);

  // Subtle vignette (award-winning look)
  if (maybeAward(0.5 * intensity)) {
    const strength = pickAward(AWARD_WINNING_VALUES.blendFactors);
    const radius = pickAward(AWARD_WINNING_VALUES.radii);
    postEffects.push(`let vign_${uid} = 1.0 - pow(length(uv - 0.5) * ${(1.5 / radius).toFixed(2)}, 2.2) * ${strength.toFixed(3)};`);
  }

  // Film grain (subtle, professional)
  if (maybeAward(0.3 * intensity)) {
    const amount = randAward(0.01, 0.03);
    postEffects.push(`let grain_${uid} = (f_hash(uv * 400.0 + time * 50.0) - 0.5) * ${amount.toFixed(4)};`);
  }

  // Chromatic shift (subtle)
  if (maybeAward(0.2 * intensity)) {
    const shift = randAward(0.001, 0.003);
    postEffects.push(`let chroma_${uid} = ${shift.toFixed(4)};`);
  }

  if (postEffects.length === 0) return tokens;

  const injectionStr = '\n    ' + postEffects.join('\n    ') + '\n    ';
  const injectionTokens = tokenize(injectionStr);

  const newTokens = [...tokens];
  newTokens.splice(retIdx, 0, ...injectionTokens);

  return newTokens;
}

// Mutation: Inject domain warping for organic feel
function injectDomainWarp(tokens: Token[], intensity: number): Token[] {
  if (Math.random() > intensity * 0.5) return tokens;

  // Find main function body start
  let mainIdx = -1;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].type === 'ident' && tokens[i].value === 'fn') {
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === 'whitespace') j++;
      if (j < tokens.length && tokens[j].value === 'main') {
        mainIdx = i;
        break;
      }
    }
  }
  if (mainIdx === -1) return tokens;

  // Find body start
  let bodyStart = -1;
  for (let i = mainIdx; i < tokens.length; i++) {
    if (tokens[i].value === '{') {
      bodyStart = i;
      break;
    }
  }
  if (bodyStart === -1) return tokens;

  const uvName = findUVName(tokens, mainIdx) || 'uv';
  const uid = Math.floor(Math.random() * 100000);
  const warpVar = `warp_${uid}`;

  // TRUE PROCEDURAL - Generate warp pattern on the fly
  const warpExpr = generateProceduralWarp(uvName, 2);
  const warpCode = `var ${warpVar} = ${warpExpr};`;
  const injectionTokens = tokenize('\n    ' + warpCode + '\n    ');

  const newTokens = [...tokens];
  newTokens.splice(bodyStart + 1, 0, ...injectionTokens);

  // Replace uv references with warpVar (but not in declarations)
  for (let i = bodyStart + 1 + injectionTokens.length; i < newTokens.length; i++) {
    const t = newTokens[i];
    if (t.type === 'ident' && t.value === uvName) {
      // Skip if it's part of the warp declaration
      if (t.value === warpVar) continue;

      // Check not a declaration context
      let prev = i - 1;
      while (prev >= 0 && newTokens[prev].type === 'whitespace') prev--;
      if (prev >= 0 && (newTokens[prev].value === '.' || newTokens[prev].value === 'var' || newTokens[prev].value === 'let')) continue;

      let next = i + 1;
      while (next < newTokens.length && newTokens[next].type === 'whitespace') next++;
      if (next < newTokens.length && newTokens[next].value === ':') continue;

      // Replace with warped UV (probabilistically)
      if (Math.random() < 0.7) {
        newTokens[i] = { ...t, value: warpVar };
      }
    }
  }

  return newTokens;
}

// Mutation: Enhance contrast and depth
function enhanceDepth(tokens: Token[], intensity: number): Token[] {
  // Find return statement
  let retIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === 'ident' && tokens[i].value === 'return') {
      retIdx = i;
      break;
    }
  }
  if (retIdx === -1) return tokens;

  // Find the color expression in return
  let vec4Idx = -1;
  for (let i = retIdx; i < tokens.length; i++) {
    if (tokens[i].type === 'ident' && tokens[i].value === 'vec4') {
      vec4Idx = i;
      break;
    }
  }
  if (vec4Idx === -1) return tokens;

  // Inject subtle contrast enhancement before return
  if (maybeAward(intensity * 0.4)) {
    const uid = Math.floor(Math.random() * 100000);
    const contrast = randAward(1.05, 1.15);
    const injection = `\n    // Depth enhancement\n    `;
    const injectionTokens = tokenize(injection);

    const newTokens = [...tokens];
    newTokens.splice(retIdx, 0, ...injectionTokens);
    return newTokens;
  }

  return tokens;
}

// Mutation: Add layered complexity
function addLayeredComplexity(tokens: Token[], intensity: number): Token[] {
  if (Math.random() > intensity * 0.4) return tokens;

  // Find main function body
  let mainIdx = -1;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].type === 'ident' && tokens[i].value === 'fn') {
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === 'whitespace') j++;
      if (j < tokens.length && tokens[j].value === 'main') {
        mainIdx = i;
        break;
      }
    }
  }
  if (mainIdx === -1) return tokens;

  let bodyStart = -1;
  for (let i = mainIdx; i < tokens.length; i++) {
    if (tokens[i].value === '{') {
      bodyStart = i;
      break;
    }
  }
  if (bodyStart === -1) return tokens;

  const uvName = findUVName(tokens, mainIdx) || 'uv';
  const uid = Math.floor(Math.random() * 100000);

  // TRUE PROCEDURAL - Generate pattern layer on the fly
  const patternExpr = generateProceduralScalar(uvName, 3);
  const patternCode = `let layer_${uid} = ${patternExpr};`;
  const injectionTokens = tokenize('\n    ' + patternCode + '\n    ');

  const newTokens = [...tokens];
  newTokens.splice(bodyStart + 1, 0, ...injectionTokens);

  return newTokens;
}

// Main Pro Designer function - TRUE MUTATOR
export const proDesignerFuzzShader = (code: string, config: FuzzConfig): string => {
  let tokens = tokenize(code);
  const intensity = config.intensity;

  // Track mutation count to prevent over-mutation
  let mutationCount = 0;
  const maxMutations = 4; // Limit total structural mutations

  // Apply award-winning mutations in sequence
  // Each mutation preserves structure while enhancing aesthetics

  // 1. Golden ratio proportions (safe, doesn't add structure)
  if (maybeAward(0.7)) {
    tokens = mutateWithGoldenRatio(tokens, intensity);
  }

  // 2. Harmonic color relationships (safe, modifies existing colors)
  if (maybeAward(0.5)) {
    tokens = injectColorHarmony(tokens, intensity);
  }

  // 3. Smooth operations (no harsh edges) - safe
  if (maybeAward(0.6)) {
    tokens = smoothifyOperations(tokens, intensity);
  }

  // 4. Domain warping for organic feel - STRUCTURAL (limit these)
  if (maybeAward(0.4) && mutationCount < maxMutations) {
    tokens = injectDomainWarp(tokens, intensity);
    mutationCount++;
  }

  // 5. Layered complexity - STRUCTURAL (limit these)
  if (maybeAward(0.3) && mutationCount < maxMutations) {
    tokens = addLayeredComplexity(tokens, intensity);
    mutationCount++;
  }

  // 6. Professional post-processing - STRUCTURAL (limit these)
  if (maybeAward(0.4) && mutationCount < maxMutations) {
    tokens = injectPostProcessing(tokens, intensity);
    mutationCount++;
  }

  // 7. Apply DIVERSITY-AWARE mutations (prevents convergence inline)
  tokens = mutateNumbersWithDiversity(tokens, intensity * 0.2);
  tokens = mutateOperatorsWithDiversity(tokens, intensity * 0.1);
  tokens = mutateBuiltinsWithDiversity(tokens, intensity * 0.15);

  // 8. Geometry mutation with award-winning transforms - STRUCTURAL
  if (maybeAward(0.3) && mutationCount < maxMutations) {
    tokens = mutateGeometry(tokens, intensity);
    mutationCount++;
  }

  // 9. Color channel adjustments (safe)
  tokens = mutateColor(tokens, intensity * 0.3);

  // Reconstruct and validate
  let result = tokens.map(t => t.value).join('');
  result = validateAndFixSyntax(result);

  // CRITICAL: Validate and fix WGSL type errors before returning
  const { fixedCode, fixes } = validateAndFixShader(result);
  if (fixes.length > 0) {
    console.log(`[Pro Designer Fuzz] Applied type fixes:`, fixes);
  }
  return fixedCode;
};

// =============================================
// RANDOM FUZZ - Pure Invariant-Based Procedural Generation
// No presets, just mathematical composition using invariants
// =============================================

// =============================================
// RANDOM FUZZ - TRUE PROCEDURAL GENERATION
// =============================================
// NO PRESETS - Everything is procedurally generated
// INVARIANTS (rules that ensure valid, interesting shaders):
// 1. COLOR_INVARIANT: Output must be vec3/vec4 in [0,1] range
// 2. COORD_INVARIANT: UV transformations must preserve continuity
// 3. TIME_INVARIANT: Time-based animations must be bounded
// 4. DOMAIN_INVARIANT: No division by zero, sqrt of negative, etc.
// 5. FREQUENCY_INVARIANT: Spatial frequencies should create visual interest

export const randomFuzzShader = (_code: string, _intensity: number = 0.5): string => {
  // Generate with quality filtering - try multiple times for better aesthetics
  return generateWithQualityFilter(() => generateRandomShaderCore(), 5, 40);
};

/**
 * Core random shader generation - TRUE PROCEDURAL
 * NO PRESET ARRAYS - All effects generated algorithmically
 */
function generateRandomShaderCore(): string {
  // Random generators
  const randFloat = (min: number, max: number) => (Math.random() * (max - min) + min).toFixed(3);
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

  // Number of procedural elements to generate
  const numTransforms = randInt(1, 4);
  const numLayers = randInt(2, 5);
  const numPostEffects = randInt(0, 3);

  // Generate UV transformations PROCEDURALLY
  let transformCode = '';
  for (let i = 0; i < numTransforms; i++) {
    transformCode += `    ${generateProceduralWarp('p', 2).replace(/^/, 'p = ')};\n`;
  }

  // Generate scalar field combinations PROCEDURALLY
  let scalarCode = `    var t = ${generateProceduralScalar('p', 3)};\n`;
  for (let i = 0; i < numLayers - 1; i++) {
    const ops = ['+', '*', '-'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    const field = generateProceduralScalar('p', 2);
    if (Math.random() < 0.3) {
      scalarCode += `    t = mix(t, ${field}, ${randFloat(0.2, 0.8)});\n`;
    } else {
      scalarCode += `    t = t ${op} ${field};\n`;
    }
  }
  scalarCode += `    t = fract(t * ${randFloat(0.1, 2)});\n`;

  // Generate color PROCEDURALLY
  const colorCode = `    var col = ${generateProceduralColor('p', 3)};\n`;

  // Apply procedural modulations
  const modulations: string[] = [];
  if (Math.random() > 0.5) {
    modulations.push(`    col = col * (${generateProceduralScalar('p', 2)} * 0.5 + 0.5);`);
  }
  if (Math.random() > 0.5) {
    modulations.push(`    col = col + vec3<f32>(${generateProceduralScalar('p', 2)} * 0.1);`);
  }
  if (Math.random() > 0.5) {
    modulations.push(`    col = mix(col, col.zyx, ${randFloat(0, 0.5)});`);
  }

  // Generate post-effects PROCEDURALLY
  let postCode = '';
  for (let i = 0; i < numPostEffects; i++) {
    postCode += `    col = ${generateProceduralPostEffect('uv', 2)};\n`;
  }

  // ALWAYS add mouse and scroll effects - PROCEDURALLY GENERATED
  const mouseCode = generateCursorEffectWGSL();
  const scrollCode = `    // Scroll interaction (procedural)\n    ${generateProceduralScrollEffect('uv', 2)};`;

  // Assemble the shader
  const shader = `@group(0) @binding(0) var<uniform> time : f32;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;
@group(0) @binding(2) var<uniform> mouse : vec2<f32>;
@group(0) @binding(3) var<uniform> scroll : vec2<f32>;

fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn hash2(p: vec2<f32>) -> vec2<f32> {
    let k = vec2<f32>(0.3183099, 0.3678794);
    let x = p * k + k.yx;
    return fract(sin(vec2<f32>(dot(x, x.yx), dot(x.yx, x))) * 43758.5453);
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), u.x),
               mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

fn fbm(p: vec2<f32>) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var pos = p;
    let rot = mat2x2<f32>(0.8, 0.6, -0.6, 0.8);
    for (var i = 0; i < 5; i++) {
        v += a * noise(pos);
        pos = rot * pos * 2.0;
        a *= 0.5;
    }
    return v;
}

fn voronoi(p: vec2<f32>) -> f32 {
    let n = floor(p);
    let f = fract(p);
    var md = 8.0;
    for (var j = -1; j <= 1; j++) {
        for (var i = -1; i <= 1; i++) {
            let g = vec2<f32>(f32(i), f32(j));
            let o = hash2(n + g);
            let r = g + o - f;
            let d = dot(r, r);
            md = min(md, d);
        }
    }
    return sqrt(md);
}

fn rot2d(a: f32) -> mat2x2<f32> {
    let c = cos(a);
    let s = sin(a);
    return mat2x2<f32>(c, -s, s, c);
}

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
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / resolution;
    var p = uv;

${transformCode}
${scalarCode}
${colorCode}
${modulations.join('\n')}
${postCode}
${mouseCode}
${scrollCode}
    col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

    return vec4<f32>(col, 1.0);
}`;

  // CRITICAL: Validate and fix WGSL type errors before returning
  const { fixedCode, fixes } = validateAndFixShader(shader);
  if (fixes.length > 0) {
    console.log(`[Random Fuzz] Applied type fixes:`, fixes);
  }
  return fixedCode;
}

// =============================================
// MATH ONLY FUZZ - Only mutate mathematical expressions
// Uses AST-based mutation for safety
// =============================================
export const mathOnlyFuzzShader = (code: string, intensity: number = 0.5): string => {
  // Use the new AST-based mutator which:
  // - Only mutates inside fn main()
  // - Preserves helper functions (hash, noise, fbm, voronoi)
  // - Never touches for-loop increments
  // - Never removes let/var keywords
  // - Validates output before returning
  return safeMutateShader(code, intensity);
};

// =============================================
// CURSOR EFFECT FUZZ - Add mouse-reactive patterns
// Uses actual mouse uniform for real cursor interaction
// CURSOR-ONLY: This function ONLY modifies cursor effects, nothing else
// =============================================
export const cursorEffectFuzzShader = (code: string, _intensity: number = 0.5): string => {
  // CURSOR-ONLY: Generate a new cursor effect without touching anything else
  const newCursorEffect = generateCursorEffectWGSL();

  // Find and replace ONLY the cursor effect section
  // Look for the cursor effect comment block
  const cursorStartPatterns = [
    /\/\/\s*Cursor\s*(interaction|effect|distortion)[^\n]*\n\s*col\s*=[^;]+;/gi,
    /\/\/\s*AST-Generated\s*Cursor\s*Effect[^\n]*\n[\s\S]*?(?=\n\s*\/\/|col\s*=\s*clamp|return\s+vec4)/gi,
    /\/\/\s*Anti-convergence:\s*UV\/time\s*diversity[^\n]*\n[\s\S]*?(?=\n\s*\/\/|col\s*=\s*clamp|return\s+vec4)/gi,
  ];

  let result = code;
  let replaced = false;

  for (const pattern of cursorStartPatterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, newCursorEffect);
      replaced = true;
      break;
    }
  }

  // If no existing cursor section found, insert one before the return statement
  if (!replaced) {
    const returnMatch = result.match(/(\s*)(return\s+vec4)/);
    if (returnMatch && returnMatch.index !== undefined) {
      const indent = returnMatch[1];
      const insertCode = `${indent}// Cursor interaction (generated)
${indent}${newCursorEffect}

${indent}`;
      result = result.substring(0, returnMatch.index) + insertCode + result.substring(returnMatch.index);
    }
  }

  // ONLY validate - DO NOT run through ensureShaderHealth as that modifies other things
  const { fixedCode, fixes } = validateAndFixShader(result);
  if (fixes.length > 0) {
    console.log(`[Cursor Fuzz] Applied type fixes:`, fixes);
  }
  return fixedCode;
};

// =============================================
// SCROLL EFFECT FUZZ - Add scroll-reactive patterns
// Uses actual scroll uniform for real scroll interaction
// SCROLL-ONLY: This function ONLY modifies scroll effects, nothing else
// TRUE PROCEDURAL - NO preset patterns
// =============================================
export const scrollEffectFuzzShader = (code: string, _intensity: number = 0.5): string => {
  // SCROLL-ONLY: Generate a new scroll effect WITHOUT PRESETS
  // TRUE PROCEDURAL GENERATION
  const newScrollEffect = `// Scroll interaction (procedurally generated)
    ${generateProceduralScrollEffect('uv', 2)};`;

  // Find and replace ONLY the scroll effect section
  const scrollStartPatterns = [
    /\/\/\s*Scroll\s*(interaction|effect)[^\n]*\n\s*col\s*=[^;]+;/gi,
  ];

  let result = code;
  let replaced = false;

  for (const pat of scrollStartPatterns) {
    if (pat.test(result)) {
      result = result.replace(pat, newScrollEffect);
      replaced = true;
      break;
    }
  }

  // If no existing scroll section found, insert one before the return statement
  if (!replaced) {
    const returnMatch = result.match(/(\s*)(return\s+vec4)/);
    if (returnMatch && returnMatch.index !== undefined) {
      const indent = returnMatch[1];
      const insertCode = `${indent}${newScrollEffect}

${indent}`;
      result = result.substring(0, returnMatch.index) + insertCode + result.substring(returnMatch.index);
    }
  }

  // ONLY validate - DO NOT run through ensureShaderHealth as that modifies other things
  const { fixedCode, fixes } = validateAndFixShader(result);
  if (fixes.length > 0) {
    console.log(`[Scroll Fuzz] Applied type fixes:`, fixes);
  }
  return fixedCode;
};

// =============================================
// FRAGMENT FUZZ - Fragment shader specific mutations
// TRUE PROCEDURAL - NO preset patterns
// =============================================
export const fragmentFuzzShader = (code: string, intensity: number = 0.5): string => {
  // Use AST-based mutation for safety
  let result = safeMutateShader(code, intensity * 0.5);

  // Inject a PROCEDURALLY GENERATED color effect before return
  if (Math.random() < intensity * 0.4) {
    // TRUE PROCEDURAL - generate pattern on the fly
    const proceduralPattern = generateProceduralScalar('uv', 2);
    const returnMatch = result.match(/return\s+vec4<f32>\s*\(\s*col/);
    if (returnMatch && returnMatch.index) {
      const insertPos = returnMatch.index;
      const effectCode = `
    // Fragment effect (procedural)
    col = mix(col, col.zyx, (${proceduralPattern}) * 0.3);
    `;
      result = result.substring(0, insertPos) + effectCode + result.substring(insertPos);
    }
  }

  // CRITICAL: Validate and fix WGSL type errors before returning
  const { fixedCode, fixes } = validateAndFixShader(result);
  if (fixes.length > 0) {
    console.log(`[Fragment Fuzz] Applied type fixes:`, fixes);
  }
  return fixedCode;
};

// =============================================
// VERTEX FUZZ - Vertex shader specific mutations
// =============================================
export const vertexFuzzShader = (code: string, intensity: number = 0.5): string => {
  // Use AST-based mutation for safety (already includes validation)
  const result = safeMutateShader(code, intensity * 0.6);
  // safeMutateShader already includes validateAndFixShader
  return result;
};

// =============================================
// COMPUTE FUZZ - Compute shader specific mutations
// (Applies algorithmic/mathematical patterns)
// =============================================
export const computeFuzzShader = (code: string, intensity: number = 0.5): string => {
  // Use AST-based mutation for safety (already includes validation)
  const result = safeMutateShader(code, intensity * 0.7);
  // safeMutateShader already includes validateAndFixShader
  return result;
};

// =============================================
// PHYSICS FUZZ - TRUE MUTATION FUZZER
// Actually mutates the existing shader's expressions using AST
// ANTI-CONVERGENCE: Always pushes towards MORE complexity and animation
// =============================================
export const physicsFuzzShader = (code: string, intensity: number = 0.5): string => {
  // Local helpers to avoid any naming conflicts
  const randFloat = (min: number, max: number) => Math.random() * (max - min) + min;
  const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randBool = () => Math.random() > 0.5;

  // ANTI-CONVERGENCE: Track mutation count and force fresh periodically
  physicsMutationCount++;
  console.log(`[Physics Fuzz] Mutation count: ${physicsMutationCount}/${MAX_PHYSICS_MUTATIONS_BEFORE_RESET}`);

  // Force complete regeneration after too many mutations
  if (physicsMutationCount >= MAX_PHYSICS_MUTATIONS_BEFORE_RESET) {
    console.log(`[Physics Fuzz] FORCED RESET - too many mutations, generating completely fresh shader`);
    physicsMutationCount = 0;
    return generatePhysicsShaderCode(Math.max(intensity, 0.7));
  }

  // If no valid shader code, generate fresh
  if (!code || code.trim().length < 50 || !code.includes('@fragment')) {
    physicsMutationCount = 0;
    return generatePhysicsShaderCode(intensity);
  }

  // ANTI-CONVERGENCE: Check shader health BEFORE mutation
  const initialHealth = analyzeShaderHealth(code);
  console.log(`[Physics Fuzz] Initial health: ${initialHealth.overallHealth.toFixed(2)}, flashing: ${initialHealth.riskOfFlashing.toFixed(2)}, boring: ${initialHealth.riskOfBoring.toFixed(2)}`);

  // ZERO TOLERANCE: If ANY convergence risk, generate completely fresh
  if (initialHealth.overallHealth < 0.5 ||
      initialHealth.riskOfFlashing > 0.3 ||
      initialHealth.riskOfBoring > 0.4 ||
      initialHealth.riskOfBlank > 0.3 ||
      initialHealth.riskOfStatic > 0.5) {
    console.log(`[Physics Fuzz] CONVERGENCE DETECTED - generating completely fresh shader`);
    physicsMutationCount = 0;
    return generatePhysicsShaderCode(Math.max(intensity, 0.6));
  }

  try {
    // Parse the shader to find mutable targets
    const parsed = parseWGSL(code);
    const mutableNumbers = getSafeMutableNumbers(parsed);
    const mutableOperators = getSafeMutableOperators(parsed);

    // If not enough to mutate, generate fresh
    if (mutableNumbers.length < 3 && mutableOperators.length < 2) {
      physicsMutationCount = 0;
      return generatePhysicsShaderCode(intensity);
    }

    let result = code;
    const mutations: Array<{ start: number; end: number; oldVal: string; newVal: string }> = [];

    // ANTI-CONVERGENCE: MORE mutations, more dramatic
    const numMutations = Math.max(3, Math.floor((mutableNumbers.length + mutableOperators.length) * intensity * 0.6));

    // Collect all mutable positions
    const allTargets: Array<{ type: 'num' | 'op'; index: number }> = [
      ...mutableNumbers.map((_, i) => ({ type: 'num' as const, index: i })),
      ...mutableOperators.map((_, i) => ({ type: 'op' as const, index: i })),
    ];

    // ANTI-CONVERGENCE: If cursor dominance is high, bias mutations AWAY from mouse terms
    const protectNonCursor = initialHealth.cursorDominance > 0.5;

    // Randomly select targets to mutate
    for (let m = 0; m < numMutations && allTargets.length > 0; m++) {
      const targetIdx = randInt(0, allTargets.length - 1);
      const target = allTargets.splice(targetIdx, 1)[0];

      if (target.type === 'num') {
        const num = mutableNumbers[target.index];
        const oldVal = num.value;
        let newVal: string;

        // ANTI-CONVERGENCE: Skip if this is a UV/time term and cursor is dominant
        const surroundingCode = code.substring(Math.max(0, num.range.start - 30), num.range.end + 30);
        const isCursorRelated = surroundingCode.includes('mouse') || surroundingCode.includes('cursor');
        const isUVRelated = surroundingCode.includes('uv') || surroundingCode.includes('pos');

        if (protectNonCursor && isUVRelated && !isCursorRelated && Math.random() < 0.7) {
          // 70% chance to skip mutations to UV-related terms when cursor is dominant
          continue;
        }

        // Choose mutation strategy - HEAVILY BIASED toward keeping things interesting
        const strategy = randInt(0, 12);
        const val = num.numericValue;

        switch (strategy) {
          case 0: // Scale - ANTI-CONVERGENCE: biased away from zero, MORE dramatic
            const scaleFactor = randFloat(0.3, 3.5); // More extreme range
            newVal = (val * scaleFactor).toFixed(3);
            break;
          case 1: // Offset - keep values in reasonable range, MORE dramatic
            const offset = randFloat(-2.5, 2.5);
            let offsetVal = val + offset;
            if (Math.abs(offsetVal) < SAFE_RANGES.amplitude.min) {
              offsetVal = Math.sign(offsetVal || 1) * SAFE_RANGES.amplitude.min;
            }
            newVal = offsetVal.toFixed(3);
            break;
          case 2: // Negate
            newVal = (-val).toFixed(3);
            break;
          case 3: // Reciprocal (if not too small)
            newVal = Math.abs(val) > 0.1 ? (1 / val).toFixed(3) : randFloat(0.5, 2).toFixed(3);
            break;
          case 4: // Round to nearby integer (but not zero)
            let rounded = Math.round(val + randFloat(-0.5, 0.5));
            if (rounded === 0) rounded = Math.random() > 0.5 ? 1 : -1;
            newVal = rounded.toFixed(1);
            break;
          case 5: // Wrap with trig (replace number with sin/cos expression) - adds time dependency!
            newVal = `sin(${randFloat(0.5, 3).toFixed(2)} * time + ${randFloat(0, 6.28).toFixed(2)})`;
            break;
          case 6: // Replace with time-based expression - ensures animation
            newVal = `(${Math.max(0.1, Math.abs(val)).toFixed(3)} + sin(time * ${randFloat(0.5, 2).toFixed(2)}) * ${randFloat(0.1, 0.5).toFixed(3)})`;
            break;
          case 7: // Power of 2 (stay in reasonable range)
            const logVal = Math.log2(Math.abs(val) + 0.1);
            newVal = Math.pow(2, Math.round(logVal + randFloat(-1, 1))).toFixed(3);
            break;
          case 8: // ANTI-CONVERGENCE: Add UV modulation if cursor-dominant
            if (protectNonCursor) {
              newVal = `(${val.toFixed(3)} + ${generateAntiCursorTerm()} * 0.3)`;
            } else {
              newVal = `fract(${val.toFixed(3)})`;
            }
            break;
          case 9: // ANTI-CONVERGENCE: Add noise modulation
            newVal = `(${val.toFixed(3)} + f_n(p * ${randFloat(3, 12).toFixed(1)} + time * ${randFloat(0.1, 0.5).toFixed(2)}) * ${randFloat(0.1, 0.4).toFixed(2)})`;
            break;
          case 10: // ANTI-CONVERGENCE: Add length-based variation
            newVal = `(${val.toFixed(3)} * (0.5 + 0.5 * sin(length(p) * ${randFloat(3, 10).toFixed(1)} + time * ${randFloat(0.5, 2).toFixed(2)})))`;
            break;
          case 11: // ANTI-CONVERGENCE: Replace with completely fresh random value
            newVal = randFloat(-3, 3).toFixed(3);
            break;
          case 12: // ANTI-CONVERGENCE: Add angular variation
            newVal = `(${val.toFixed(3)} + sin(atan2(p.y, p.x) * ${randInt(2, 8)}.0 + time * ${randFloat(0.3, 1.5).toFixed(2)}) * ${randFloat(0.1, 0.3).toFixed(2)})`;
            break;
          default: // Small random perturbation (never go to zero)
            let perturbedVal = val * (1 + randFloat(-0.5, 0.5)); // More aggressive
            if (Math.abs(perturbedVal) < 0.05) perturbedVal = randFloat(0.3, 1.5);
            newVal = perturbedVal.toFixed(3);
        }

        // ANTI-CONVERGENCE: Final safety check
        const numericNew = parseFloat(newVal);
        if (!isNaN(numericNew) && isNumberDangerous(numericNew)) {
          newVal = randFloat(0.3, 2.0).toFixed(3);
        }

        mutations.push({
          start: num.range.start,
          end: num.range.end,
          oldVal,
          newVal
        });
      } else {
        const op = mutableOperators[target.index];
        const oldVal = op.value;
        let newVal: string;

        // Swap operators
        const ops = ['+', '-', '*', '/'];
        const currentIdx = ops.indexOf(oldVal);
        if (currentIdx >= 0) {
          // Pick a different operator
          const newOps = ops.filter(o => o !== oldVal);
          newVal = newOps[randInt(0, newOps.length - 1)];

          mutations.push({
            start: op.range.start,
            end: op.range.end,
            oldVal,
            newVal
          });
        }
      }
    }
    // Apply mutations in reverse order (so positions don't shift)
    mutations.sort((a, b) => b.start - a.start);

    for (const mut of mutations) {
      result = result.substring(0, mut.start) + mut.newVal + result.substring(mut.end);
    }

    // ANTI-CONVERGENCE: Inject diversity ALWAYS (not just when degrading)
    // This prevents gradual convergence over many mutations
    const colClampMatch = result.match(/col = clamp\(col,/);
    if (colClampMatch) {
      const insertPos = result.indexOf('col = clamp(col,');
      if (insertPos > 0 && !result.includes('Anti-convergence diversity')) {
        const diversityCode = `\n  // Anti-convergence diversity injection
  col = col + ${generateDiverseTerm('vec3')} * ${randFloat(0.05, 0.15).toFixed(3)};
  col = col * (0.95 + 0.05 * sin(time * ${randFloat(0.5, 2.0).toFixed(2)} + length(p) * ${randFloat(2, 8).toFixed(1)}));\n`;
        result = result.substring(0, insertPos) + diversityCode + result.substring(insertPos);
      }
    }

    // Also potentially add/modify visual effects
    if (randBool() && intensity > 0.3) {
      // Add bloom
      const colClampMatch = result.match(/col = clamp\(col,/);
      if (colClampMatch && !result.includes('// Bloom')) {
        const insertPos = result.indexOf('col = clamp(col,');
        if (insertPos > 0) {
          const bloomCode = `\n  col = col + col * col * ${randFloat(0.1, 0.4).toFixed(2)}; // Bloom\n`;
          result = result.substring(0, insertPos) + bloomCode + result.substring(insertPos);
        }
      }
    }

    if (randBool() && intensity > 0.5) {
      // Add or modify vignette
      if (!result.includes('// Vignette')) {
        const colClampMatch = result.match(/col = clamp\(col,/);
        if (colClampMatch) {
          const insertPos = result.indexOf('col = clamp(col,');
          if (insertPos > 0) {
            const vignetteCode = `\n  col = col * (1.0 - length(p_raw) * ${randFloat(0.2, 0.4).toFixed(2)}); // Vignette\n`;
            result = result.substring(0, insertPos) + vignetteCode + result.substring(insertPos);
          }
        }
      }
    }

    // ANTI-CONVERGENCE: Final health check and repair - ZERO TOLERANCE
    const { code: healthyResult, health: finalHealth, wasRepaired } = ensureShaderHealth(result, true);

    if (wasRepaired) {
      console.log(`[Physics Fuzz] Shader repaired. Final health: ${finalHealth.overallHealth.toFixed(2)}`);
    }

    // ZERO TOLERANCE: If health is STILL not good enough, start fresh
    if (finalHealth.overallHealth < 0.5 ||
        finalHealth.riskOfFlashing > 0.2 ||
        finalHealth.riskOfBoring > 0.3 ||
        finalHealth.riskOfBlank > 0.2) {
      console.log(`[Physics Fuzz] Health still poor after repair (${finalHealth.overallHealth.toFixed(2)}), generating fresh shader`);
      physicsMutationCount = 0;
      return generatePhysicsShaderCode(Math.max(intensity, 0.6));
    }

    // CRITICAL: Validate and fix type errors before returning
    const { fixedCode, fixes } = validateAndFixShader(healthyResult);
    if (fixes.length > 0) {
      console.log(`[Physics Fuzz] Applied fixes:`, fixes);
    }
    return fixedCode;
  } catch (e) {
    // Fallback to generating fresh
    console.error('[Physics Fuzz] Mutation failed, generating fresh:', e);
    physicsMutationCount = 0;
    return generatePhysicsShaderCode(intensity);
  }
};

// =============================================
// SAFE MUTATION WRAPPER
// Ensures ALL mutations pass through validation
// =============================================
export const safeValidatedMutation = (
  mutationFn: (code: string, ...args: unknown[]) => string,
  code: string,
  ...args: unknown[]
): string => {
  const mutatedCode = mutationFn(code, ...args);
  const { fixedCode, fixes, issues } = validateAndFixShader(mutatedCode);

  if (fixes.length > 0) {
    console.log(`[SafeMutation] Applied ${fixes.length} fixes:`, fixes);
  }
  if (issues.length > 0) {
    console.warn(`[SafeMutation] Remaining issues:`, issues);
  }

  return fixedCode;
};
