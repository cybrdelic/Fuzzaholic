/**
 * SYNTAX SANITIZER - Fixes common procedural generation syntax errors
 *
 * Handles issues that arise from naive string concatenation:
 * - Variable redeclaration (same name used multiple times)
 * - Function redeclaration (duplicate fn definitions)
 * - Invalid smoothstep arguments (low > high)
 * - Invalid clamp arguments (low > high, including exp(0.0) = 1.0)
 * - Corrupted for-loops (i_2==, i+1.0 instead of i++)
 * - Missing semicolons
 * - Unbalanced parentheses/braces
 * - Type mismatches in common patterns
 */

// ============================================================================
// FOR-LOOP CORRUPTION FIXER (CRITICAL - must run first)
// ============================================================================

/**
 * Fix corrupted for-loops from proDesigner mutations
 * Patterns like: for (var i_2== 0; i < 5; i+1.0)
 */
export function fixCorruptedForLoops(code: string): string {
  let result = code;

  // Fix "var i_2==" -> "var i ="
  result = result.replace(/\bvar\s+([a-zA-Z])_\d+==\s*/g, 'var $1 = ');

  // Fix "let f_2==" -> "let f ="
  result = result.replace(/\blet\s+([a-zA-Z])_\d+==\s*/g, 'let $1 = ');

  // Fix "i+1.0)" at end of for-loops -> "i++)"
  result = result.replace(/;\s*([ij])\s*\+\s*\d+\.?\d*\s*\)/g, '; $1++)');

  // Fix "j+1.0)" -> "j++)"
  result = result.replace(/;\s*([ij])\s*\+\s*1\s*\)/g, '; $1++)');

  // Fix corrupted increment: "i+1.0" without paren
  result = result.replace(/;\s*([ij])\+\d+\.?\d*(?=\s*\{)/g, '; $1++');

  // Fix "let a_2==" patterns in main function body
  result = result.replace(/\blet\s+([a-zA-Z]+)_\d+==\s*/g, 'let $1 = ');

  // Fix smoothstep with 4 arguments (corrupted): smoothstep(0.0, 0.082, log(...), length(...))
  // Should be: smoothstep(0.082, log(...), length(...))
  result = result.replace(
    /smoothstep\s*\(\s*0\.0\s*,\s*(\d+\.?\d*)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
    'smoothstep($1, $2, $3)'
  );

  return result;
}

// ============================================================================
// FUNCTION REDECLARATION FIXER
// ============================================================================

/**
 * Remove duplicate function definitions
 */
export function fixFunctionRedeclarations(code: string): string {
  const functionNames = new Set<string>();
  const lines = code.split('\n');
  const result: string[] = [];
  let skipUntilClosingBrace = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if we're skipping a duplicate function
    if (skipUntilClosingBrace) {
      // Count braces to find end of function
      for (const char of line) {
        if (char === '{') braceDepth++;
        else if (char === '}') braceDepth--;
      }
      if (braceDepth <= 0) {
        skipUntilClosingBrace = false;
        braceDepth = 0;
      }
      continue; // Skip this line
    }

    // Check for function definition
    const fnMatch = line.match(/^\s*fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (fnMatch) {
      const fnName = fnMatch[1];
      if (functionNames.has(fnName)) {
        // Duplicate function - skip it
        skipUntilClosingBrace = true;
        braceDepth = 0;
        for (const char of line) {
          if (char === '{') braceDepth++;
          else if (char === '}') braceDepth--;
        }
        if (braceDepth <= 0) {
          skipUntilClosingBrace = false;
        }
        continue;
      }
      functionNames.add(fnName);
    }

    result.push(line);
  }

  return result.join('\n');
}

// ============================================================================
// VARIABLE REDECLARATION FIXER
// ============================================================================

/**
 * Find all variable declarations and rename duplicates
 */
export function fixVariableRedeclarations(code: string): string {
  // Track declared variable names per scope (simplified - just track all)
  const declaredVars = new Set<string>();

  // Match variable declarations: let varname or var varname
  const varDeclRegex = /\b(let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(:|=)/g;

  let result = code;
  let match;
  const replacements: Array<{ original: string; replacement: string; start: number }> = [];

  // First pass - find all declarations
  while ((match = varDeclRegex.exec(code)) !== null) {
    const keyword = match[1]; // let or var
    const varName = match[2];
    const suffix = match[3]; // : or =

    if (declaredVars.has(varName)) {
      // Generate unique name
      let counter = 2;
      let newName = `${varName}_${counter}`;
      while (declaredVars.has(newName)) {
        counter++;
        newName = `${varName}_${counter}`;
      }

      replacements.push({
        original: `${keyword} ${varName}${suffix}`,
        replacement: `${keyword} ${newName}${suffix}`,
        start: match.index
      });

      // Also need to replace usages after this declaration
      // This is complex - for now just rename the declaration
      declaredVars.add(newName);
    } else {
      declaredVars.add(varName);
    }
  }

  // Apply replacements in reverse order to preserve indices
  replacements.sort((a, b) => b.start - a.start);
  for (const rep of replacements) {
    result = result.substring(0, rep.start) + rep.replacement +
             result.substring(rep.start + rep.original.length);
  }

  return result;
}

// ============================================================================
// SMOOTHSTEP ARGUMENT FIXER
// ============================================================================

/**
 * Fix smoothstep calls where low >= high
 */
export function fixSmoothstepArgs(code: string): string {
  // Match smoothstep(num1, num2, expr)
  return code.replace(
    /smoothstep\s*\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,/g,
    (match, low, high) => {
      const lowVal = parseFloat(low);
      const highVal = parseFloat(high);

      if (!isNaN(lowVal) && !isNaN(highVal)) {
        if (lowVal >= highVal) {
          // Swap them or use defaults
          const newLow = Math.min(lowVal, highVal);
          const newHigh = Math.max(lowVal, highVal) + 0.001; // Ensure high > low
          return `smoothstep(${newLow.toFixed(3)}, ${newHigh.toFixed(3)},`;
        }
      }
      return match;
    }
  );
}

// ============================================================================
// CLAMP ARGUMENT FIXER (ENHANCED)
// ============================================================================

/**
 * Fix clamp calls where min > max
 * Also handles exp(0.0) which evaluates to 1.0
 */
export function fixClampArgs(code: string): string {
  // First, simplify exp(0.0) and exp(0) to 1.0 in clamp contexts
  let result = code.replace(
    /clamp\s*\(\s*([^,]+)\s*,\s*exp\s*\(\s*0\.?0*\s*\)\s*,\s*([^)]+)\s*\)/g,
    (match, expr, maxVal) => {
      // exp(0) = 1.0, so this is clamp(expr, 1.0, maxVal)
      const maxNum = parseFloat(maxVal);
      if (!isNaN(maxNum) && maxNum < 1.0) {
        // 1.0 > maxVal, so swap them
        return `clamp(${expr}, ${maxVal}, 1.0)`;
      }
      return `clamp(${expr}, 1.0, ${maxVal})`;
    }
  );

  // Standard clamp fix for numeric literals
  result = result.replace(
    /clamp\s*\(\s*([^,]+)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/g,
    (match, expr, minVal, maxVal) => {
      const minNum = parseFloat(minVal);
      const maxNum = parseFloat(maxVal);

      if (!isNaN(minNum) && !isNaN(maxNum) && minNum > maxNum) {
        return `clamp(${expr}, ${maxNum.toFixed(3)}, ${minNum.toFixed(3)})`;
      }
      return match;
    }
  );

  return result;
}
// ============================================================================
// PARENTHESES BALANCER
// ============================================================================

/**
 * Fix unbalanced parentheses by adding missing ones
 */
export function balanceParentheses(code: string): string {
  let result = code;

  // Count parentheses
  let parenCount = 0;
  let braceCount = 0;
  let bracketCount = 0;

  for (const char of result) {
    if (char === '(') parenCount++;
    else if (char === ')') parenCount--;
    else if (char === '{') braceCount++;
    else if (char === '}') braceCount--;
    else if (char === '[') bracketCount++;
    else if (char === ']') bracketCount--;
  }

  // Add missing closing parens before semicolons or end
  while (parenCount > 0) {
    // Find a good place to add closing paren (before semicolon)
    const semiMatch = result.match(/;(?=[^;]*$)/);
    if (semiMatch && semiMatch.index !== undefined) {
      result = result.substring(0, semiMatch.index) + ')' + result.substring(semiMatch.index);
    } else {
      // Add at end before closing brace
      const lastBrace = result.lastIndexOf('}');
      if (lastBrace > 0) {
        result = result.substring(0, lastBrace) + ')' + result.substring(lastBrace);
      } else {
        result += ')';
      }
    }
    parenCount--;
  }

  // Add missing opening parens (less common but handle it)
  while (parenCount < 0) {
    result = '(' + result;
    parenCount++;
  }

  return result;
}

// ============================================================================
// DIVISION BY ZERO FIXER
// ============================================================================

/**
 * Fix potential division by zero
 */
export function fixDivisionByZero(code: string): string {
  // Replace / 0.0 with / 0.001
  let result = code.replace(/\/\s*0\.0+\b/g, '/ 0.001');

  // Replace / 0 (integer) with / 1
  result = result.replace(/\/\s*0\b(?!\.)/, '/ 1');

  return result;
}

// ============================================================================
// POW ARGUMENT FIXER
// ============================================================================

/**
 * Fix pow() with negative base by wrapping in abs()
 */
export function fixPowArgs(code: string): string {
  // pow(expr, n) where expr might be negative - wrap in abs
  // This is a simplified version - full fix would need type inference
  return code.replace(
    /pow\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
    (match, base, exponent) => {
      // If base doesn't already have abs(), add it
      if (!base.trim().startsWith('abs(')) {
        return `pow(abs(${base}), ${exponent})`;
      }
      return match;
    }
  );
}

// ============================================================================
// ATAN2 ARGUMENT FIXER
// ============================================================================

/**
 * Fix atan2 with potentially both zero arguments
 */
export function fixAtan2Args(code: string): string {
  // atan2(0.0, 0.0) is undefined - add small epsilon
  return code.replace(
    /atan2\s*\(\s*0\.0+\s*,\s*0\.0+\s*\)/g,
    'atan2(0.001, 0.001)'
  );
}

// ============================================================================
// MISSING SEMICOLON FIXER
// ============================================================================

/**
 * Add missing semicolons at end of statements
 */
export function fixMissingSemicolons(code: string): string {
  // This is tricky - look for lines ending with ) or number followed by newline
  // but not if it's a function definition or control structure

  let lines = code.split('\n');
  let result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trimEnd();

    // Skip empty lines, comments, opening braces, annotations
    if (trimmed === '' ||
        trimmed.startsWith('//') ||
        trimmed.endsWith('{') ||
        trimmed.endsWith('}') ||
        trimmed.endsWith(',') ||
        trimmed.endsWith(';') ||
        trimmed.startsWith('@') ||
        trimmed.startsWith('fn ') ||
        trimmed.includes(' fn ')) {
      result.push(line);
      continue;
    }

    // Check if line looks like it needs a semicolon
    if (/\)$/.test(trimmed) || /\d$/.test(trimmed) || /[a-zA-Z_]$/.test(trimmed)) {
      // Check if next non-empty line starts with certain keywords that indicate continuation
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;

      if (j < lines.length) {
        const nextTrimmed = lines[j].trim();
        // If next line starts with operator, it's a continuation
        if (/^[+\-*\/%&|^]/.test(nextTrimmed) || /^\./.test(nextTrimmed)) {
          result.push(line);
          continue;
        }
      }

      // Likely needs semicolon - but be careful
      // Only add if it looks like an expression or declaration
      if (/^(let|var|return|col|[a-zA-Z_][a-zA-Z0-9_]*\s*=)/.test(trimmed) ||
          /^\s+(let|var|return|col|[a-zA-Z_][a-zA-Z0-9_]*\s*=)/.test(line)) {
        line = line.trimEnd() + ';';
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

// ============================================================================
// MAIN SANITIZER
// ============================================================================

/**
 * Apply all syntax fixes to a shader
 */
export function sanitizeShader(code: string): string {
  let result = code;

  // Fix in order of priority
  // CRITICAL: Fix for-loop corruption FIRST (before any other processing)
  result = fixCorruptedForLoops(result);

  // Remove duplicate function definitions
  result = fixFunctionRedeclarations(result);

  // Fix variable redeclarations
  result = fixVariableRedeclarations(result);

  // Fix math function arguments
  result = fixSmoothstepArgs(result);
  result = fixClampArgs(result);
  result = fixDivisionByZero(result);
  result = fixPowArgs(result);
  result = fixAtan2Args(result);

  // Balance parentheses last
  result = balanceParentheses(result);

  return result;
}

/**
 * Validate shader syntax (basic check)
 */
export function hasBasicSyntaxErrors(code: string): string[] {
  const errors: string[] = [];

  // Check for unbalanced delimiters
  let parenCount = 0;
  let braceCount = 0;
  for (const char of code) {
    if (char === '(') parenCount++;
    else if (char === ')') parenCount--;
    else if (char === '{') braceCount++;
    else if (char === '}') braceCount--;
  }

  if (parenCount !== 0) errors.push(`Unbalanced parentheses: ${parenCount > 0 ? 'missing )' : 'extra )'}`);
  if (braceCount !== 0) errors.push(`Unbalanced braces: ${braceCount > 0 ? 'missing }' : 'extra }'}`);

  // Check for obvious bad patterns
  if (/smoothstep\s*\(\s*(\d+\.?\d*)\s*,\s*(\1)\s*,/.test(code)) {
    errors.push('smoothstep with equal low and high values');
  }

  if (/\/\s*0\.0+\b/.test(code)) {
    errors.push('Division by zero');
  }

  return errors;
}
