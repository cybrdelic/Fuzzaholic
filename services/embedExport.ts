import { FuzzMode, ScrollEffectMode, TextEffectMode } from '../types';

export interface EmbedExportOptions {
  shaderCode: string;
  mode: FuzzMode;
  textEffectMode: TextEffectMode;
  scrollEffectMode: ScrollEffectMode;
}

function escapeScriptContent(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}

export function buildStandaloneEmbed(options: EmbedExportOptions): string {
  const supported = options.mode === 'fragment';
  const shader = escapeScriptContent(options.shaderCode);
  const fallback = supported
    ? ''
    : `<p class="fuzzaholic-message">This export currently supports fragment shaders. Current mode: ${options.mode}.</p>`;

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fuzzaholic Shader Embed</title>
<style>
  html, body { margin: 0; min-height: 100%; background: #000; }
  .fuzzaholic-effect { position: relative; min-height: 100vh; overflow: hidden; background: #000; color: white; }
  .fuzzaholic-effect canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .fuzzaholic-message { position: absolute; inset: auto 1rem 1rem; font: 700 12px/1.4 ui-monospace, monospace; color: #ff6b6b; z-index: 2; }
  .fuzzaholic-text { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; font: 900 clamp(4rem, 13vw, 15rem)/0.82 Arial Black, Impact, sans-serif; color: rgba(255,255,255,.14); mix-blend-mode: screen; }
  .fuzzaholic-text[data-mode="none"] { display: none; }
  .fuzzaholic-text[data-mode="extrude"] { text-shadow: 8px 8px 0 rgba(255,255,255,.10), 16px 16px 0 rgba(16,185,129,.15); }
  .fuzzaholic-text[data-mode="scan"] { letter-spacing: .14em; background: repeating-linear-gradient(0deg, transparent 0 8px, rgba(255,255,255,.18) 9px 10px); }
</style>
<section class="fuzzaholic-effect" data-scroll="${options.scrollEffectMode}">
  <canvas></canvas>
  <div class="fuzzaholic-text" data-mode="${options.textEffectMode}">FUZZAHOLIC</div>
  ${fallback}
</section>
<script type="module">
const shaderCode = \`${shader}\`;
const mode = ${JSON.stringify(options.mode)};
const canvas = document.querySelector('canvas');
const message = document.querySelector('.fuzzaholic-message');
const vertex = \`
struct VertexOutput { @builtin(position) position : vec4<f32>, @location(0) uv : vec2<f32> };
@vertex fn main(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  var out : VertexOutput;
  out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  out.uv = pos[vertexIndex] * 0.5 + 0.5;
  return out;
}\`;

function fail(text) {
  const p = message || document.createElement('p');
  p.className = 'fuzzaholic-message';
  p.textContent = text;
  document.querySelector('.fuzzaholic-effect').appendChild(p);
}

if (mode !== 'fragment') {
  fail('This embed supports fragment shaders only.');
} else if (!navigator.gpu) {
  fail('WebGPU is not available in this browser.');
} else {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    fail('No WebGPU adapter found.');
  } else {
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });
    const timeBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const resolutionBuffer = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const mouseBuffer = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const scrollBuffer = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ code: shaderCode });
    const vertexModule = device.createShaderModule({ code: vertex });
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ]});
    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module: vertexModule, entryPoint: 'main' },
      fragment: { module, entryPoint: 'main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const bindGroup = device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: timeBuffer } },
      { binding: 1, resource: { buffer: resolutionBuffer } },
      { binding: 2, resource: { buffer: mouseBuffer } },
      { binding: 3, resource: { buffer: scrollBuffer } },
    ]});
    const start = performance.now();
    const mouse = new Float32Array([0.5, 0.5]);
    const scroll = new Float32Array([0, 0]);
    window.addEventListener('pointermove', event => {
      const rect = canvas.getBoundingClientRect();
      mouse[0] = (event.clientX - rect.left) / Math.max(1, rect.width);
      mouse[1] = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
    });
    window.addEventListener('scroll', () => {
      scroll[1] = window.scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
    }, { passive: true });
    function frame() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height;
      }
      device.queue.writeBuffer(timeBuffer, 0, new Float32Array([(performance.now() - start) / 1000]));
      device.queue.writeBuffer(resolutionBuffer, 0, new Float32Array([canvas.width, canvas.height]));
      device.queue.writeBuffer(mouseBuffer, 0, mouse);
      device.queue.writeBuffer(scrollBuffer, 0, scroll);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();
      device.queue.submit([encoder.finish()]);
      requestAnimationFrame(frame);
    }
    frame();
  }
}
</script>
</html>`;
}
