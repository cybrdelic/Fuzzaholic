import { FuzzConfig } from '../types';

/**
 * TOKENIZER-BASED WGSL FUZZER
 * 
 * Ensures valid syntax by parsing the shader structure rather than doing 
 * blind string replacements. This prevents syntax errors while allowing
 * for deep "latent space" exploration of the shader.
 */

// -- Lexer Types --

type TokenType = 'ident' | 'number' | 'punct' | 'whitespace' | 'comment' | 'string' | 'unknown';

interface Token {
    type: TokenType;
    value: string;
    index: number; // Original index in source
}

const OPS = ['+', '-', '*', '/'];
// Safe builtins that take 1 arg and return 1 arg of same type, or simple math
const SAFE_BUILTINS = ['sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'fract', 'sqrt', 'f_sin', 'f_cos', 'f_n', 'f_hash', 'length'];

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
 */
function generateScalarExpr(depth: number, uvName: string): string {
    if (depth <= 0 || Math.random() < 0.15) {
        // Terminals
        const terms = [
            `${uvName}.x`, 
            `${uvName}.y`, 
            `length(${uvName} - 0.5)`, 
            'time', 
            randFloat(0.1, 5.0).toFixed(2),
            `f_hash(${uvName})`,
            `f_n(${uvName}.x * 10.0)`
        ];
        return getRandomItem(terms);
    }

    const rnd = Math.random();
    
    // Unary functions
    if (rnd < 0.35) {
        const funcs = ['sin', 'cos', 'fract', 'abs', 'sqrt', 'exp', 'f_sin', 'f_cos'];
        const f = getRandomItem(funcs);
        let inner = generateScalarExpr(depth - 1, uvName);
        // Safety for domain-limited functions
        if (f === 'sqrt') inner = `abs(${inner})`;
        if (f === 'exp') inner = `clamp(${inner}, -10.0, 10.0)`; 
        return `${f}(${inner})`;
    } 
    // Binary operators
    else if (rnd < 0.7) {
        const ops = ['+', '-', '*', '*']; // Bias towards multiplication for complexity
        const op = getRandomItem(ops);
        return `(${generateScalarExpr(depth - 1, uvName)} ${op} ${generateScalarExpr(depth - 1, uvName)})`;
    } 
    // Complex functions
    else {
        const type = Math.random();
        if (type < 0.33) {
            return `mix(${generateScalarExpr(depth - 1, uvName)}, ${generateScalarExpr(depth - 1, uvName)}, ${randFloat(0,1).toFixed(2)})`;
        } else if (type < 0.66) {
             return `smoothstep(0.0, 1.0, ${generateScalarExpr(depth - 1, uvName)})`;
        } else {
             // smin (organic blend)
             return `f_smin(${generateScalarExpr(depth - 1, uvName)}, ${generateScalarExpr(depth - 1, uvName)}, 0.5)`;
        }
    }
}

/**
 * Generates a procedural color vector (vec3<f32>)
 */
function generateProceduralGene(uvName: string): string {
    // Generate 3 distinct expressions for R, G, B
    // Depth 3-6 provides good complexity without blowing up string size
    const r = generateScalarExpr(4, uvName);
    const g = generateScalarExpr(4, uvName);
    const b = generateScalarExpr(4, uvName);
    
    // Sometimes use cosine palette logic for better colors
    if (Math.random() < 0.5) {
        return `f_pal(${generateScalarExpr(3, uvName)}, vec3<f32>(0.5,0.5,0.5), vec3<f32>(0.5,0.5,0.5), vec3<f32>(1.0,1.0,1.0), vec3<f32>(0.0, 0.33, 0.67))`;
    }

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
        // CRITICAL FIX: Handle multi-char punctuation (like ->, ==) before single char
        // This prevents '->' being split into '-' and '>' which confuses mutateOperators
        { type: 'punct', regex: /^(?:->|==|!=|<=|>=|&&|\|\|)/ }, 
        { type: 'punct', regex: /^[{}()\[\],;:.+*\/=\-><]/ }, 
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

// -- Mutators --

function mutateNumbers(tokens: Token[], intensity: number): Token[] {
    return tokens.map(t => {
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
    return tokens.map(t => {
        if (t.type === 'punct' && OPS.includes(t.value)) {
            if (Math.random() < intensity) {
                return { ...t, value: getRandomItem(OPS) };
            }
        }
        return t;
    });
}

function mutateBuiltins(tokens: Token[], intensity: number): Token[] {
    return tokens.map(t => {
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
    const newTokens = [...tokens];
    for (let i = 0; i < newTokens.length; i++) {
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
                    if (balance > 0 && newTokens[j].type === 'number' && newTokens[j].value.includes('.')) {
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

// -- Main Fuzz Function --

export const fuzzShader = (code: string, config: FuzzConfig): string => {
  let tokens = tokenize(code);

  // 1. Structural / Latent
  
  if (config.mutateStructure && Math.random() < config.intensity) {
    tokens = mutateStructure(tokens, config.intensity);
  }

  if (config.mutateGeometry && Math.random() < config.intensity) {
    tokens = mutateGeometry(tokens, config.intensity);
  }
  
  if (config.mutateColor && Math.random() < config.intensity) {
    tokens = mutateColor(tokens, config.intensity);
  }

  if (config.mutateChaos && Math.random() < config.intensity) {
    tokens = mutateChaos(tokens, config.intensity);
  }

  // 2. Atomic
  if (config.mutateNumbers) {
    tokens = mutateNumbers(tokens, config.intensity);
  }

  if (config.mutateOperators) {
    tokens = mutateOperators(tokens, config.intensity);
  }

  if (config.mutateBuiltins) {
    tokens = mutateBuiltins(tokens, config.intensity);
  }
  
  // Implicit safe swizzling at high intensity
  if (config.intensity > 0.15) {
      tokens = mutateSwizzle(tokens, config.intensity);
  }

  return tokens.map(t => t.value).join('');
};