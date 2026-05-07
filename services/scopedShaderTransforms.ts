import {
  B,
  call,
  emit,
  Expression,
  FunctionDecl,
  LetStmt,
  parse,
  ReturnStmt,
  Statement,
  WGSLType,
} from './v2';

export type ScopedTransformIntent =
  | 'variant'
  | 'math'
  | 'aesthetic'
  | 'cursor'
  | 'scroll';

function typed(expr: Expression, resultType: WGSLType): Expression {
  return { ...expr, resultType } as Expression;
}

function findFragmentFunction(functions: FunctionDecl[]): FunctionDecl | null {
  return functions.find(fn => fn.attributes.some(attr => attr.name === 'fragment'))
    ?? functions.find(fn => fn.name === 'fs_main')
    ?? functions.find(fn => fn.name === 'main')
    ?? null;
}

function findLastReturn(statements: Statement[]): { stmt: ReturnStmt; index: number } | null {
  for (let i = statements.length - 1; i >= 0; i--) {
    const stmt = statements[i];
    if (stmt.kind === 'ReturnStmt') return { stmt, index: i };
  }
  return null;
}

function hasLocal(fn: FunctionDecl, name: string): boolean {
  return fn.body.statements.some(stmt =>
    (stmt.kind === 'LetStmt' || stmt.kind === 'VarStmt') && stmt.name === name
  );
}

function local(name: string, initializer: Expression): LetStmt {
  return B.letStmt(name, initializer);
}

function ensureFragmentLocals(fn: FunctionDecl, returnIndex: number, intent: ScopedTransformIntent): number {
  const lines: Statement[] = [];

  if (!hasLocal(fn, 'centered')) {
    lines.push(local('centered', B.sub(B.mul(B.ident('uv', 'vec2<f32>'), B.f32(2)), B.f32(1))));
  }
  if (!hasLocal(fn, 't')) {
    lines.push(local('t', B.ident('time', 'f32')));
  }
  if (!hasLocal(fn, 'p')) {
    lines.push(local('p', B.ident('centered', 'vec2<f32>')));
  }
  if (intent === 'cursor' && !hasLocal(fn, 'mouseNorm')) {
    lines.push(local(
      'mouseNorm',
      B.clamp(
        B.ident('mouse', 'vec2<f32>'),
        B.vec2(B.f32(0)),
        B.vec2(B.f32(1))
      )
    ));
  }

  if (lines.length === 0) return returnIndex;
  fn.body.statements.splice(returnIndex, 0, ...lines);
  return returnIndex + lines.length;
}

function colorAndAlpha(value: Expression): { color: Expression; alpha: Expression } {
  if (value.kind === 'CallExpr' && value.callee === 'vec4<f32>') {
    if (value.args.length >= 4) {
      return {
        color: B.vec3(
          typed(value.args[0], 'f32'),
          typed(value.args[1], 'f32'),
          typed(value.args[2], 'f32')
        ),
        alpha: typed(value.args[3], 'f32'),
      };
    }
    if (value.args.length >= 2) {
      return {
        color: typed(value.args[0], 'vec3<f32>'),
        alpha: typed(value.args[1], 'f32'),
      };
    }
  }

  return {
    color: typed(value, 'vec3<f32>'),
    alpha: B.f32(1),
  };
}

function wrapColor(color: Expression, intent: ScopedTransformIntent, intensity: number): Expression {
  const amount = Math.max(0.02, Math.min(1, intensity));
  const p = B.ident('p', 'vec2<f32>');
  const uv = B.ident('uv', 'vec2<f32>');
  const mouseNorm = B.ident('mouseNorm', 'vec2<f32>');
  const scroll = B.ident('scroll', 'vec2<f32>');

  switch (intent) {
    case 'cursor': {
      const delta = B.sub(uv, mouseNorm);
      const dist = B.length(delta);
      const angle = call('atan2', [B.member(delta, 'y'), B.member(delta, 'x')], 'f32');
      const ring = B.abs(B.sin(B.add(B.mul(dist, B.f32(28 + amount * 48)), B.mul(B.ident('t', 'f32'), B.f32(2.5 + amount * 5)))));
      const spokes = B.abs(B.sin(B.add(B.mul(angle, B.f32(5 + amount * 11)), B.mul(dist, B.f32(10 + amount * 22)))));
      const pulse = B.sub(B.f32(1), B.smoothstep(B.f32(0.04), B.f32(0.62), dist));
      const field = B.mul(B.smoothstep(B.f32(0.18), B.f32(0.95), B.mix(ring, spokes, B.f32(0.45))), pulse);
      const shifted = B.add(
        B.mix(B.member(color, 'zxy'), B.member(color, 'yxz'), spokes),
        B.vec3(
          B.mul(B.f32(0.45), B.sin(B.add(angle, B.ident('t', 'f32')))),
          B.mul(B.f32(0.32), ring),
          B.mul(B.f32(0.55), B.cos(B.add(dist, B.ident('t', 'f32'))))
        )
      );
      return B.mix(color, shifted, B.clamp(B.mul(field, B.f32(0.35 + amount * 1.4)), B.f32(0), B.f32(1)));
    }
    case 'scroll': {
      const sy = B.member(scroll, 'y');
      const sx = B.member(scroll, 'x');
      const drift = B.add(B.mul(sy, B.f32(8 + amount * 22)), B.mul(B.ident('t', 'f32'), B.f32(0.2 + amount * 1.2)));
      const diagonal = B.add(
        B.mul(B.member(uv, 'x'), B.f32(7 + amount * 26)),
        B.mul(B.member(uv, 'y'), B.f32(11 + amount * 31))
      );
      const radial = B.length(B.add(p, B.vec2(B.mul(B.sin(drift), B.f32(0.25)), B.mul(B.cos(drift), B.f32(0.25)))));
      const shutters = B.smoothstep(
        B.f32(0.22),
        B.f32(0.82),
        B.abs(B.sin(B.add(diagonal, drift)))
      );
      const parallax = B.smoothstep(
        B.f32(0.1),
        B.f32(0.9),
        B.abs(B.sin(B.add(B.mul(radial, B.f32(18 + amount * 38)), B.mul(sy, B.f32(18)))))
      );
      const chroma = B.vec3(
        B.add(B.member(color, 'b'), B.mul(B.f32(0.35), B.sin(B.add(drift, B.member(uv, 'y'))))),
        B.add(B.member(color, 'r'), B.mul(B.f32(0.28), B.cos(B.add(drift, B.member(uv, 'x'))))),
        B.add(B.member(color, 'g'), B.mul(B.f32(0.42), B.sin(B.add(diagonal, sx))))
      );
      return B.mix(
        B.mix(color, B.member(color, 'zyx'), shutters),
        chroma,
        B.clamp(B.mul(parallax, B.f32(0.3 + amount * 1.2)), B.f32(0), B.f32(1))
      );
    }
    case 'math':
      return B.mix(
        color,
        B.mul(
          color,
          B.add(
            B.f32(0.65),
            B.mul(
              B.f32(0.35),
              B.cos(B.add(
                B.mul(call('atan2', [B.member(p, 'y'), B.member(p, 'x')], 'f32'), B.f32(2 + amount * 10)),
                B.mul(B.length(p), B.f32(4 + amount * 16))
              ))
            )
          )
        ),
        B.f32(Math.min(0.75, 0.18 + amount * 0.45))
      );
    case 'aesthetic':
      return B.smoothstep(
        B.vec3(B.f32(0)),
        B.vec3(B.f32(1)),
        B.mix(
          color,
          call('pow', [B.abs(color), B.vec3(B.f32(0.75 + amount * 0.75))], 'vec3<f32>'),
          B.f32(Math.min(0.8, 0.25 + amount * 0.45))
        )
      );
    case 'variant':
    default:
      return B.mix(
        color,
        B.member(color, 'yzx'),
        B.f32(Math.min(0.65, 0.15 + amount * 0.35))
      );
  }
}

export function transformCurrentShader(
  source: string,
  intent: ScopedTransformIntent,
  intensity: number
): string {
  const program = parse(source);
  const functions = program.declarations.filter((decl): decl is FunctionDecl => decl.kind === 'FunctionDecl');
  const fragmentFn = findFragmentFunction(functions);
  if (!fragmentFn) {
    throw new Error('Could not find a fragment function to transform.');
  }

  const returnRef = findLastReturn(fragmentFn.body.statements);
  if (!returnRef?.stmt.value) {
    throw new Error('Could not find a fragment return color to transform.');
  }

  ensureFragmentLocals(fragmentFn, returnRef.index, intent);
  const { color, alpha } = colorAndAlpha(returnRef.stmt.value);
  returnRef.stmt.value = B.vec4(wrapColor(color, intent, intensity), alpha);

  return emit(program);
}
