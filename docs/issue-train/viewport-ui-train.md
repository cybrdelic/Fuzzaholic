# Fuzzaholic viewport UI train

## Epic

Rebuild Fuzzaholic around the shader viewport, with taste training, effect application, persistence, and export reachable without collapsing into a single scrolling control column.

## Train

1. Viewport shell
   - Full-screen shader viewport stays primary on desktop and mobile.
   - Desktop gets a left candidate rail, right mode panel, and bottom command bar.
   - Mobile keeps the viewport primary and moves controls into compact bottom actions.
   - Verify: app renders at desktop and mobile widths without hiding core actions.

2. Taste workflow
   - Like saves without advancing.
   - Nope and Similar advance to a new candidate.
   - Back returns to the prior candidate stack.
   - Verify: buttons call the existing taste, save, and candidate handlers.

3. Effect studio
   - Text shader modes and scroll shader modes live in a dedicated panel.
   - Cursor and scroll source edits remain available as explicit actions.
   - Verify: switching text and scroll modes recompiles without adding compilation report spam.

4. Library and export
   - Permanent file-backed library remains accessible as a first-class mode.
   - Save, Copy WGSL, Copy Embed, Copy Errors, and code dock are separated.
   - Verify: exports do not trigger candidate changes.

5. Runtime hardening
   - Keep the WebGPU render-path/API errors out of shader compilation reports.
   - Keep compute output textures compatible with text compositing.
   - Verify: TypeScript, production build, and browser smoke checks pass.

## Acceptance

- `npx tsc --noEmit`
- `npm run build`
- Browser smoke: desktop viewport, mobile viewport, effect mode switching, code dock, and no visible compile-error count growth on UI-only actions.
