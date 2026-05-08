
import React, { useEffect, useRef, useState } from 'react';
import { BASE_VERTEX_SHADER, DISPLAY_FRAGMENT_SHADER, WGSL_PREAMBLE } from '../constants';
import { FuzzMode, ScrollEffectMode, TextEffectMode } from '../types';

interface ShaderCanvasProps {
  shaderCode: string;
  mode: FuzzMode;
  textEffectMode: TextEffectMode;
  scrollEffectMode: ScrollEffectMode;
  onCompilationError: (error: string) => void;
  onCompilationSuccess: () => void;
}

// Helper constants to substitute missing WebGPU types
const SHADER_STAGE_VERTEX = 1; // GPUShaderStage.VERTEX
const SHADER_STAGE_FRAGMENT = 2; // GPUShaderStage.FRAGMENT
const SHADER_STAGE_COMPUTE = 4; // GPUShaderStage.COMPUTE
const BUFFER_USAGE_UNIFORM = 64; // GPUBufferUsage.UNIFORM
const BUFFER_USAGE_COPY_DST = 8; // GPUBufferUsage.COPY_DST
const TEXTURE_USAGE_COPY_DST = 2; // GPUTextureUsage.COPY_DST
const TEXTURE_USAGE_TEXTURE_BINDING = 4; // GPUTextureUsage.TEXTURE_BINDING
const TEXTURE_USAGE_STORAGE_BINDING = 8; // GPUTextureUsage.STORAGE_BINDING
const TEXTURE_USAGE_RENDER_ATTACHMENT = 16; // GPUTextureUsage.RENDER_ATTACHMENT

const TEXT_COMPOSITE_FRAGMENT_SHADER = `
@group(0) @binding(0) var fillSampler : sampler;
@group(0) @binding(1) var shaderTexture : texture_2d<f32>;
@group(0) @binding(2) var textMaskTexture : texture_2d<f32>;
@group(0) @binding(3) var<uniform> time : f32;
@group(0) @binding(4) var<uniform> scroll : vec2<f32>;

fn mask_at(uv: vec2<f32>) -> f32 {
  let textUv = vec2<f32>(uv.x, 1.0 - uv.y);
  return textureSample(textMaskTexture, fillSampler, textUv).r;
}

fn guide_at(uv: vec2<f32>) -> vec4<f32> {
  let textUv = vec2<f32>(uv.x, 1.0 - uv.y);
  return textureSample(textMaskTexture, fillSampler, textUv);
}

@fragment
fn main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let px = vec2<f32>(0.00145, 0.00145);
  let pre = textureSample(shaderTexture, fillSampler, uv).rgb;
  let rough = sin(dot(pre, vec3<f32>(4.7, -3.1, 2.6)) + uv.x * 47.0 + uv.y * 31.0 + time * 0.7);
  let paintUv = uv + vec2<f32>(
    sin(uv.y * 42.0 + pre.r * 7.0 + time * 0.32),
    cos(uv.x * 38.0 + pre.g * 8.0 - time * 0.26)
  ) * 0.006;
  let mask = guide_at(paintUv);
  let text = mask.r;
  let scaffold = mask.g;
  let incision = mask.b;
  let mx1 = mask_at(uv + vec2<f32>(px.x, 0.0));
  let mx2 = mask_at(uv - vec2<f32>(px.x, 0.0));
  let my1 = mask_at(uv + vec2<f32>(0.0, px.y));
  let my2 = mask_at(uv - vec2<f32>(0.0, px.y));
  let grad = vec2<f32>(mx1 - mx2, my1 - my2);
  let edge = clamp(length(grad) * 4.2, 0.0, 1.0);

  let grow = smoothstep(-0.24, 0.72, sin(uv.x * 8.0 + uv.y * 3.0 + time * 0.9) + scroll.y * 1.8);
  let contourGate = smoothstep(0.18, 0.94, fract((uv.x + uv.y * 0.47) * 18.0 - time * 0.55));
  let built = clamp(text * grow + scaffold * 0.55 + incision * contourGate * 0.5, 0.0, 1.0);
  let outer = clamp(mask_at(uv + vec2<f32>(0.014, -0.012)) + mask_at(uv + vec2<f32>(-0.012, 0.014)), 0.0, 1.0);
  let halo = clamp((outer - text) * 0.48 + edge * 0.28 + scaffold * 0.32, 0.0, 1.0);

  let flow = vec2<f32>(
    sin(time * 0.72 + uv.y * 31.0 + incision * 9.0),
    cos(time * 0.86 + uv.x * 27.0 - scaffold * 7.0)
  );
  let bevelDir = normalize(grad + vec2<f32>(0.0001, -0.0001));
  let warp = bevelDir * (0.028 * edge + 0.012 * built) + flow * (0.004 + 0.014 * scaffold);
  let carvedUv = uv + warp * (0.5 + built);
  let refractedUv = uv - warp * (1.2 + scroll.y * 0.8);

  let core = textureSample(shaderTexture, fillSampler, carvedUv + rough * scaffold * vec2<f32>(0.006, -0.004)).rgb;
  let under = textureSample(shaderTexture, fillSampler, uv + flow * 0.025).rgb;
  let r = textureSample(shaderTexture, fillSampler, refractedUv + vec2<f32>(0.008, -0.003)).r;
  let g = textureSample(shaderTexture, fillSampler, carvedUv).g;
  let b = textureSample(shaderTexture, fillSampler, refractedUv - vec2<f32>(0.007, 0.004)).b;
  let chroma = vec3<f32>(r, g, b);

  let sourceEnergy = clamp(dot(core, vec3<f32>(0.299, 0.587, 0.114)), 0.0, 1.0);
  let contour = smoothstep(0.54, 0.98, sin((text + edge * 0.9 + sourceEnergy + dot(uv, vec2<f32>(2.3, -1.4))) * 38.0 + time * 2.1) * 0.5 + 0.5);
  let scan = smoothstep(0.82, 1.0, sin((uv.y + scroll.y * 0.9) * 105.0 + time * 4.4 + sourceEnergy * 5.0) * 0.5 + 0.5);
  let bevelLight = clamp(dot(normalize(vec2<f32>(-0.45, 0.9)), bevelDir) * 0.5 + 0.5, 0.0, 1.0);
  let material = mix(core * core * 1.55, chroma, 0.34 + contour * 0.28 + scan * 0.16);
  let vein = vec3<f32>(contour * incision, scan * edge, scaffold * sourceEnergy) * (0.42 + sourceEnergy);
  let builtGlyph = material * (0.42 + 0.82 * bevelLight) + vein + edge * vec3<f32>(0.42, 0.48, 0.52);
  let substrate = under * (0.025 + 0.10 * halo) + chroma * halo * 0.16;
  let spray = smoothstep(0.58, 0.96, scaffold + rough * 0.18) * (1.0 - text * 0.35);
  let construction = vec3<f32>(0.18, 0.92, 0.72) * scaffold * (0.18 + 0.42 * scan) + chroma * spray * 0.22;
  let alpha = clamp(built + edge * 0.8 + halo * 0.42 + spray * 0.28, 0.0, 1.0);
  return vec4<f32>(mix(substrate + construction, builtGlyph, alpha), 1.0);
}
`;

function repairEditorWGSL(source: string): string {
  let repaired = source.trimStart();
  repaired = repaired.replace(/^oup\s*\(/, '@group(');
  repaired = repaired.replace(/^group\s*\(/, '@group(');
  repaired = repaired.replace(/^@?binding\s*\(/, '@group(0) @binding(');
  return repaired;
}

const ShaderCanvas: React.FC<ShaderCanvasProps> = ({
  shaderCode,
  mode,
  textEffectMode,
  scrollEffectMode,
  onCompilationError,
  onCompilationSuccess
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [gpuReady, setGpuReady] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const onCompilationErrorRef = useRef(onCompilationError);
  const onCompilationSuccessRef = useRef(onCompilationSuccess);
  const lastCompileReportRef = useRef<string>('');

  // Use any for WebGPU refs since types might not be available in the environment
  const deviceRef = useRef<any | null>(null);
  const contextRef = useRef<any | null>(null);
  const pipelineRef = useRef<any | null>(null);
  const computePipelineRef = useRef<any | null>(null);
  const displayPipelineRef = useRef<any | null>(null);
  const uniformBufferRef = useRef<any | null>(null);
  const mouseBufferRef = useRef<any | null>(null);
  const scrollBufferRef = useRef<any | null>(null);
  const bindGroupRef = useRef<any | null>(null);
  const computeBindGroupRef = useRef<any | null>(null);
  const displayBindGroupRef = useRef<any | null>(null);
  const displaySamplerRef = useRef<any | null>(null);
  const outputTextureRef = useRef<any | null>(null);
  const textMaskTextureRef = useRef<any | null>(null);
  const animationFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  // Mouse and scroll tracking
  const mousePos = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const scrollPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    onCompilationErrorRef.current = onCompilationError;
    onCompilationSuccessRef.current = onCompilationSuccess;
  }, [onCompilationError, onCompilationSuccess]);

  const reportCompilationError = (message: string) => {
    const key = `${mode}|${textEffectMode}|${message}`;
    if (lastCompileReportRef.current === key) return;
    lastCompileReportRef.current = key;
    onCompilationErrorRef.current(message);
  };

  const reportCompilationSuccess = () => {
    lastCompileReportRef.current = '';
    onCompilationSuccessRef.current();
  };

  const createTextMaskTexture = (device: any, textMode: Exclude<TextEffectMode, 'none'>) => {
    const size = 1200;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size;
    maskCanvas.height = size;
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = 'rgb(0,0,0)';
    ctx.fillRect(0, 0, size, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const drawLayer = (color: string, offsetX = 0, offsetY = 0) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (textMode === 'poster') {
        ctx.font = '900 270px Arial Black, Impact, sans-serif';
        ctx.fillText('FUZZ', 600 + offsetX, 520 + offsetY);
        ctx.font = '900 190px Arial Black, Impact, sans-serif';
        ctx.fillText('AHOLIC', 600 + offsetX, 750 + offsetY);
      } else if (textMode === 'extrude') {
        ctx.font = '900 210px Arial Black, Impact, sans-serif';
        ctx.fillText('FUZZAHOLIC', 600 + offsetX, 632 + offsetY);
        ctx.font = '900 82px Arial Black, Impact, sans-serif';
        ctx.fillText('SHADER LAB', 604 + offsetX, 770 + offsetY);
      } else if (textMode === 'graffiti') {
        ctx.save();
        ctx.translate(600 + offsetX, 630 + offsetY);
        ctx.rotate(-0.08);
        ctx.font = '900 235px Impact, Arial Black, sans-serif';
        ctx.fillText('FUZZ', -230, -40);
        ctx.rotate(0.13);
        ctx.font = '900 175px Impact, Arial Black, sans-serif';
        ctx.fillText('AHOLIC', -300, 150);
        ctx.restore();
      } else if (textMode === 'rupture') {
        ctx.font = '900 188px Arial Black, Impact, sans-serif';
        ctx.fillText('FUZZAHOLIC', 600 + offsetX, 610 + offsetY);
        ctx.font = '900 74px Arial Black, Impact, sans-serif';
        ctx.fillText('MATERIAL TYPE', 600 + offsetX, 745 + offsetY);
      } else {
        ctx.font = '900 155px Arial Black, Impact, sans-serif';
        ctx.fillText('FUZZAHOLIC', 600 + offsetX, 620 + offsetY);
        ctx.font = '900 58px Arial Black, Impact, sans-serif';
        ctx.fillText('LIVE TEXTURE TYPE', 600 + offsetX, 720 + offsetY);
      }
    };

    drawLayer('rgb(0,72,0)', 10, -10);
    drawLayer('rgb(0,0,76)', -7, 7);
    ctx.strokeStyle = 'rgb(0,0,96)';
    ctx.lineWidth = textMode === 'extrude' ? 10 : 6;
    for (let y = 420; y < 810; y += textMode === 'scan' ? 22 : 38) {
      ctx.beginPath();
      ctx.moveTo(210, y);
      ctx.lineTo(990, y + Math.sin(y * 0.02) * 18);
      ctx.stroke();
    }
    if (textMode === 'graffiti' || textMode === 'rupture') {
      const rng = (i: number) => Math.sin(i * 127.1 + (textMode === 'graffiti' ? 9.3 : 17.8)) * 43758.5453 % 1;
      ctx.fillStyle = 'rgb(0,96,0)';
      for (let i = 0; i < 420; i++) {
        const x = 160 + Math.abs(rng(i)) * 880;
        const y = 380 + Math.abs(rng(i + 11)) * 470;
        const radius = textMode === 'graffiti' ? 1.5 + Math.abs(rng(i + 23)) * 7 : 1 + Math.abs(rng(i + 23)) * 4;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgb(0,0,116)';
      ctx.lineWidth = textMode === 'graffiti' ? 12 : 7;
      for (let i = 0; i < 26; i++) {
        const x = 210 + Math.abs(rng(i + 41)) * 780;
        const y = 455 + Math.abs(rng(i + 71)) * 280;
        const drop = 45 + Math.abs(rng(i + 91)) * (textMode === 'graffiti' ? 180 : 90);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 18 * rng(i + 3), y + drop * 0.3, x - 24 * rng(i + 5), y + drop * 0.7, x + 8 * rng(i + 7), y + drop);
        ctx.stroke();
      }
      if (textMode === 'rupture') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 20; i++) {
          const x = 210 + Math.abs(rng(i + 120)) * 820;
          const y = 500 + Math.abs(rng(i + 160)) * 230;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rng(i + 190) * 0.8);
          ctx.fillRect(-70, -5, 140, 10 + Math.abs(rng(i + 200)) * 18);
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    drawLayer('rgb(255,0,0)');

    const texture = device.createTexture({
      size: [size, size],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
      { source: maskCanvas },
      { texture },
      [size, size]
    );
    return texture;
  };

  // Initialize WebGPU Device
  useEffect(() => {
    let active = true;
    let createdDevice: any | null = null;

    const initWebGPU = async () => {
      if (!(navigator as any).gpu) {
        if (active) setError("WebGPU not supported in this browser.");
        return;
      }

      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (!active) return;
        if (!adapter) {
          if (active) setError("No appropriate GPU adapter found.");
          return;
        }

        const device = await adapter.requestDevice();
        createdDevice = device;
        if (!active) {
          device.destroy?.();
          return;
        }

        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('webgpu');
          if (!active) {
            device.destroy?.();
            return;
          }
          if (context) {
            deviceRef.current = device;
            contextRef.current = context;
            const presentationFormat = (navigator as any).gpu.getPreferredCanvasFormat();
            contextRef.current.configure({
              device,
              format: presentationFormat,
              alphaMode: 'premultiplied',
            });
            setGpuReady(true);
          } else {
            if (active) setError("WebGPU canvas context could not be created.");
          }
        }
      } catch (e: any) {
        if (active) setError(e.message);
      }
    };

    initWebGPU();

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        mousePos.current = {
          x: (e.clientX - rect.left) / rect.width,
          y: 1.0 - (e.clientY - rect.top) / rect.height, // Flip Y for shader coords
        };
      }
    };

    // Scroll tracking - track window scroll
    const handleScroll = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const nextScroll = {
        x: window.scrollX / Math.max(1, document.documentElement.scrollWidth - window.innerWidth),
        y: window.scrollY / maxScroll,
      };
      scrollPos.current = nextScroll;
      setScrollProgress(nextScroll.y);
    };

    const handleWheel = (e: WheelEvent) => {
      const nextScroll = {
        x: Math.max(0, Math.min(1, scrollPos.current.x + e.deltaX * 0.001)),
        y: Math.max(0, Math.min(1, scrollPos.current.y + e.deltaY * 0.001)),
      };
      scrollPos.current = nextScroll;
      setScrollProgress(nextScroll.y);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('wheel', handleWheel, { passive: true });
    handleScroll();

    return () => {
      active = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wheel', handleWheel);
      if (createdDevice && deviceRef.current === createdDevice) {
        deviceRef.current = null;
        contextRef.current = null;
        setGpuReady(false);
        createdDevice.destroy?.();
      }
    }
  }, []);

  // Compile Shader and Create Pipeline
  useEffect(() => {
    const device = deviceRef.current;
    const context = contextRef.current;

    if (!gpuReady) return;
    if (!device || !context) return;

    let active = true;

    pipelineRef.current = null;
    computePipelineRef.current = null;
    displayPipelineRef.current = null;
    uniformBufferRef.current = null;
    mouseBufferRef.current = null;
    scrollBufferRef.current = null;
    bindGroupRef.current = null;
    computeBindGroupRef.current = null;
    displayBindGroupRef.current = null;
    displaySamplerRef.current = null;
    outputTextureRef.current = null;
    textMaskTextureRef.current = null;

    const buildUniformBuffers = () => {
      const timeBuffer = device.createBuffer({
        size: 4, // f32
        usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
      });

      const resolutionBuffer = device.createBuffer({
        size: 8, // vec2<f32>
        usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
      });

      const mouseBuffer = device.createBuffer({
        size: 8, // vec2<f32>
        usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
      });

      const scrollBuffer = device.createBuffer({
        size: 8, // vec2<f32>
        usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
      });

      uniformBufferRef.current = timeBuffer;
      mouseBufferRef.current = mouseBuffer;
      scrollBufferRef.current = scrollBuffer;

      // Update resolution once
      device.queue.writeBuffer(resolutionBuffer, 0, new Float32Array([
        canvasRef.current?.width || 800,
        canvasRef.current?.height || 600
      ]));

      return { timeBuffer, resolutionBuffer, mouseBuffer, scrollBuffer };
    };

    const buildDisplayPipeline = async (
      sourceTexture: any,
      timeBuffer: any,
      scrollBuffer: any,
      presentationFormat: string
    ): Promise<boolean> => {
      const displayVertexModule = device.createShaderModule({
        label: 'Display Vertex',
        code: BASE_VERTEX_SHADER,
      });

      if (!displaySamplerRef.current) {
        displaySamplerRef.current = device.createSampler({
          magFilter: 'linear',
          minFilter: 'linear',
        });
      }

      if (textEffectMode !== 'none') {
        const textMaskTexture = createTextMaskTexture(device, textEffectMode);
        if (!textMaskTexture) return;
        textMaskTextureRef.current = textMaskTexture;

        const displayFragmentModule = device.createShaderModule({
          label: 'Shader Text Composite Fragment',
          code: TEXT_COMPOSITE_FRAGMENT_SHADER,
        });
        const compositeInfo = await displayFragmentModule.getCompilationInfo();
        const compositeErrors = compositeInfo.messages
          .filter((msg: any) => msg.type === 'error')
          .map((msg: any) => `Text effect line ${msg.lineNum}: ${msg.message}`)
          .join('\n');
        if (compositeErrors) {
          reportCompilationError(compositeErrors);
          return false;
        }

        const displayBindGroupLayout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: SHADER_STAGE_FRAGMENT, sampler: {} },
            { binding: 1, visibility: SHADER_STAGE_FRAGMENT, texture: { sampleType: 'float' } },
            { binding: 2, visibility: SHADER_STAGE_FRAGMENT, texture: { sampleType: 'float' } },
            { binding: 3, visibility: SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 4, visibility: SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
          ],
        });

        const displayPipelineLayout = device.createPipelineLayout({
          bindGroupLayouts: [displayBindGroupLayout],
        });

        displayPipelineRef.current = device.createRenderPipeline({
          layout: displayPipelineLayout,
          vertex: { module: displayVertexModule, entryPoint: 'main' },
          fragment: { module: displayFragmentModule, entryPoint: 'main', targets: [{ format: presentationFormat }] },
          primitive: { topology: 'triangle-list' },
        });

        displayBindGroupRef.current = device.createBindGroup({
          layout: displayBindGroupLayout,
          entries: [
            { binding: 0, resource: displaySamplerRef.current },
            { binding: 1, resource: sourceTexture.createView() },
            { binding: 2, resource: textMaskTexture.createView() },
            { binding: 3, resource: { buffer: timeBuffer } },
            { binding: 4, resource: { buffer: scrollBuffer } },
          ],
        });
        return true;
      }

      const displayFragmentModule = device.createShaderModule({
        label: 'Display Fragment',
        code: DISPLAY_FRAGMENT_SHADER,
      });

      const displayBindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: SHADER_STAGE_FRAGMENT, sampler: {} },
          { binding: 1, visibility: SHADER_STAGE_FRAGMENT, texture: { sampleType: 'float' } },
        ],
      });

      const displayPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [displayBindGroupLayout],
      });

      displayPipelineRef.current = device.createRenderPipeline({
        layout: displayPipelineLayout,
        vertex: { module: displayVertexModule, entryPoint: 'main' },
        fragment: { module: displayFragmentModule, entryPoint: 'main', targets: [{ format: presentationFormat }] },
        primitive: { topology: 'triangle-list' },
      });

      displayBindGroupRef.current = device.createBindGroup({
        layout: displayBindGroupLayout,
        entries: [
          { binding: 0, resource: displaySamplerRef.current },
          { binding: 1, resource: sourceTexture.createView() },
        ],
      });
      return true;
    };

    const buildPipeline = async () => {
      device.pushErrorScope('validation');

      const presentationFormat = (navigator as any).gpu.getPreferredCanvasFormat();
      const safeModuleCode = `diagnostic(off, derivative_uniformity);\n`
        + WGSL_PREAMBLE
        + repairEditorWGSL(shaderCode);

      if (mode === 'compute') {
        const computeModule = device.createShaderModule({
          label: 'Fuzzed Compute',
          code: safeModuleCode,
        });

        let compilationInfo;
        try {
          compilationInfo = await computeModule.getCompilationInfo();
        } catch (e: any) {
          if (active) {
            reportCompilationError(e?.message || String(e));
          }
          device.popErrorScope();
          return;
        }
        if (!active) return;
        const errors = compilationInfo.messages
          .filter((msg: any) => msg.type === 'error')
          .map((msg: any) => `Line ${msg.lineNum}: ${msg.message}`)
          .join('\n');

        if (errors) {
          device.popErrorScope();
          reportCompilationError(errors);
          return;
        }

        reportCompilationSuccess();

        const { timeBuffer, resolutionBuffer, mouseBuffer, scrollBuffer } = buildUniformBuffers();
        const canvasWidth = canvasRef.current?.width || 800;
        const canvasHeight = canvasRef.current?.height || 600;

        const outputTexture = device.createTexture({
          size: [canvasWidth, canvasHeight],
          format: 'rgba8unorm',
          usage: TEXTURE_USAGE_STORAGE_BINDING | TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT,
        });
        outputTextureRef.current = outputTexture;

        const computeBindGroupLayout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: SHADER_STAGE_COMPUTE, buffer: { type: 'uniform' } },
            { binding: 1, visibility: SHADER_STAGE_COMPUTE, buffer: { type: 'uniform' } },
            { binding: 2, visibility: SHADER_STAGE_COMPUTE, buffer: { type: 'uniform' } },
            { binding: 3, visibility: SHADER_STAGE_COMPUTE, buffer: { type: 'uniform' } },
            {
              binding: 4,
              visibility: SHADER_STAGE_COMPUTE,
              storageTexture: { access: 'write-only', format: 'rgba8unorm' },
            },
          ],
        });

        const computePipelineLayout = device.createPipelineLayout({
          bindGroupLayouts: [computeBindGroupLayout],
        });

        computePipelineRef.current = device.createComputePipeline({
          layout: computePipelineLayout,
          compute: {
            module: computeModule,
            entryPoint: 'cs_main',
          },
        });

        computeBindGroupRef.current = device.createBindGroup({
          layout: computeBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: timeBuffer } },
            { binding: 1, resource: { buffer: resolutionBuffer } },
            { binding: 2, resource: { buffer: mouseBuffer } },
            { binding: 3, resource: { buffer: scrollBuffer } },
            { binding: 4, resource: outputTexture.createView() },
          ],
        });

        if (!(await buildDisplayPipeline(outputTexture, timeBuffer, scrollBuffer, presentationFormat))) return;

        device.popErrorScope().then((error: any) => {
          if (error) {
            reportCompilationError(error.message);
          }
        });

        return;
      }

      if (mode === 'vertex-fragment') {
        const module = device.createShaderModule({
          label: 'Fuzzed Vertex+Fragment',
          code: safeModuleCode,
        });

        let compilationInfo;
        try {
          compilationInfo = await module.getCompilationInfo();
        } catch (e: any) {
          if (active) {
            reportCompilationError(e?.message || String(e));
          }
          device.popErrorScope();
          return;
        }
        if (!active) return;
        const errors = compilationInfo.messages
          .filter((msg: any) => msg.type === 'error')
          .map((msg: any) => `Line ${msg.lineNum}: ${msg.message}`)
          .join('\n');

        if (errors) {
          device.popErrorScope();
          reportCompilationError(errors);
          return;
        }

        reportCompilationSuccess();

        const outputFormat = textEffectMode !== 'none' ? 'rgba8unorm' : presentationFormat;
        const { timeBuffer, resolutionBuffer, mouseBuffer, scrollBuffer } = buildUniformBuffers();
        if (textEffectMode !== 'none') {
          const canvasWidth = canvasRef.current?.width || 800;
          const canvasHeight = canvasRef.current?.height || 600;
          const outputTexture = device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: outputFormat,
            usage: TEXTURE_USAGE_RENDER_ATTACHMENT | TEXTURE_USAGE_TEXTURE_BINDING,
          });
          outputTextureRef.current = outputTexture;
          if (!(await buildDisplayPipeline(outputTexture, timeBuffer, scrollBuffer, presentationFormat))) return;
        }

        const bindGroupLayout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: SHADER_STAGE_VERTEX | SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 1, visibility: SHADER_STAGE_VERTEX | SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 2, visibility: SHADER_STAGE_VERTEX | SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 3, visibility: SHADER_STAGE_VERTEX | SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
          ],
        });

        const pipelineLayout = device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout],
        });

        pipelineRef.current = device.createRenderPipeline({
          layout: pipelineLayout,
          vertex: {
            module,
            entryPoint: 'vs_main',
          },
          fragment: {
            module,
            entryPoint: 'fs_main',
            targets: [{ format: outputFormat }],
          },
          primitive: { topology: 'triangle-list' },
        });

        bindGroupRef.current = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: timeBuffer } },
            { binding: 1, resource: { buffer: resolutionBuffer } },
            { binding: 2, resource: { buffer: mouseBuffer } },
            { binding: 3, resource: { buffer: scrollBuffer } },
          ]
        });

        device.popErrorScope().then((error: any) => {
          if (error) {
            reportCompilationError(error.message);
          }
        });

        return;
      }

      const vertexModule = device.createShaderModule({
        label: 'Base Vertex',
        code: BASE_VERTEX_SHADER,
      });

      const fragmentModule = device.createShaderModule({
        label: 'Fuzzed Fragment',
        code: safeModuleCode,
      });

      let compilationInfo;
      try {
        compilationInfo = await fragmentModule.getCompilationInfo();
      } catch (e: any) {
        if (active) {
          reportCompilationError(e?.message || String(e));
        }
        device.popErrorScope();
        return;
      }
      if (!active) return;
      const errors = compilationInfo.messages
        .filter((msg: any) => msg.type === 'error')
        .map((msg: any) => `Line ${msg.lineNum}: ${msg.message}`)
        .join('\n');

      if (errors) {
        device.popErrorScope();
        reportCompilationError(errors);
        return;
      }

      reportCompilationSuccess();

      const outputFormat = textEffectMode !== 'none' ? 'rgba8unorm' : presentationFormat;
      const { timeBuffer, resolutionBuffer, mouseBuffer, scrollBuffer } = buildUniformBuffers();
      if (textEffectMode !== 'none') {
        const canvasWidth = canvasRef.current?.width || 800;
        const canvasHeight = canvasRef.current?.height || 600;
        const outputTexture = device.createTexture({
          size: [canvasWidth, canvasHeight],
          format: outputFormat,
          usage: TEXTURE_USAGE_RENDER_ATTACHMENT | TEXTURE_USAGE_TEXTURE_BINDING,
        });
        outputTextureRef.current = outputTexture;
        if (!(await buildDisplayPipeline(outputTexture, timeBuffer, scrollBuffer, presentationFormat))) return;
      }

      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 2, visibility: SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 3, visibility: SHADER_STAGE_FRAGMENT, buffer: { type: 'uniform' } },
        ],
      });

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      });

      pipelineRef.current = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
          module: vertexModule,
          entryPoint: 'main',
        },
        fragment: {
          module: fragmentModule,
          entryPoint: 'main',
          targets: [{ format: outputFormat }],
        },
        primitive: { topology: 'triangle-list' },
      });

      bindGroupRef.current = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: timeBuffer } },
          { binding: 1, resource: { buffer: resolutionBuffer } },
          { binding: 2, resource: { buffer: mouseBuffer } },
          { binding: 3, resource: { buffer: scrollBuffer } },
        ]
      });

      device.popErrorScope().then((error: any) => {
        if (error) {
          reportCompilationError(error.message);
        }
      });
    };

    buildPipeline();
    return () => {
      active = false;
    };
  }, [shaderCode, mode, gpuReady, textEffectMode] );

  // Render Loop
  useEffect(() => {
    const render = () => {
      const device = deviceRef.current;
      const context = contextRef.current;
      const pipeline = pipelineRef.current;
      const bindGroup = bindGroupRef.current;
      const computePipeline = computePipelineRef.current;
      const computeBindGroup = computeBindGroupRef.current;
      const displayPipeline = displayPipelineRef.current;
      const displayBindGroup = displayBindGroupRef.current;
      const outputTexture = outputTextureRef.current;

      if (!device || !context) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Update Time Uniform
      const timeVal = (Date.now() - startTimeRef.current) / 1000.0;
      if (uniformBufferRef.current) {
        device.queue.writeBuffer(uniformBufferRef.current, 0, new Float32Array([timeVal]));
      }

      // Update Mouse Uniform
      if (mouseBufferRef.current) {
        device.queue.writeBuffer(mouseBufferRef.current, 0, new Float32Array([
          mousePos.current.x,
          mousePos.current.y
        ]));
      }

      // Update Scroll Uniform
      if (scrollBufferRef.current) {
        device.queue.writeBuffer(scrollBufferRef.current, 0, new Float32Array([
          scrollPos.current.x,
          scrollPos.current.y
        ]));
      }

      if (mode === 'compute') {
        if (!computePipeline || !computeBindGroup || !displayPipeline || !displayBindGroup) {
          animationFrameRef.current = requestAnimationFrame(render);
          return;
        }

        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, computeBindGroup);

        const width = canvasRef.current?.width || 800;
        const height = canvasRef.current?.height || 600;
        const workgroupSize = 8;
        const workgroupsX = Math.ceil(width / workgroupSize);
        const workgroupsY = Math.ceil(height / workgroupSize);
        computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
        computePass.end();

        const textureView = context.getCurrentTexture().createView();
        const renderPassDescriptor = {
          colorAttachments: [
            {
              view: textureView,
              clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(displayPipeline);
        passEncoder.setBindGroup(0, displayBindGroup);
        passEncoder.draw(6);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      if (!pipeline || !bindGroup) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const commandEncoder = device.createCommandEncoder();
      const textureView = textEffectMode !== 'none' && outputTexture
        ? outputTexture.createView()
        : context.getCurrentTexture().createView();

      const renderPassDescriptor = {
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6);
      passEncoder.end();

      if (textEffectMode !== 'none' && displayPipeline && displayBindGroup) {
        const compositePass = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
        compositePass.setPipeline(displayPipeline);
        compositePass.setBindGroup(0, displayBindGroup);
        compositePass.draw(6);
        compositePass.end();
      }

      device.queue.submit([commandEncoder.finish()]);
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [mode, textEffectMode]);

  const easedScroll = scrollProgress * scrollProgress * (3 - 2 * scrollProgress);
  const expandScale = 0.18 + easedScroll * 0.82;
  const revealStrength = Math.min(1, Math.max(0, (scrollProgress - 0.08) / 0.78));
  const canvasStyle: React.CSSProperties = {};
  if (scrollEffectMode === 'viewportExpand') {
    canvasStyle.transform = `scale(${expandScale})`;
    canvasStyle.borderRadius = `${Math.round((1 - easedScroll) * 46)}px`;
    canvasStyle.boxShadow = `0 0 ${Math.round(24 + easedScroll * 90)}px rgba(255,255,255,${0.12 + easedScroll * 0.1})`;
  }
  if (scrollEffectMode === 'backgroundReveal') {
    const leftGate = 48 - revealStrength * 56;
    const rightGate = 52 + revealStrength * 56;
    canvasStyle.clipPath = `polygon(${leftGate}% 0, ${rightGate}% 0, ${100 + revealStrength * 12}% 100%, ${-revealStrength * 12}% 100%)`;
    canvasStyle.filter = `saturate(${0.2 + revealStrength * 1.15}) contrast(${0.9 + revealStrength * 0.35}) brightness(${0.16 + revealStrength * 0.9})`;
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        width={1200}
        height={1200}
        className="w-full h-full object-cover bg-black"
        style={canvasStyle}
      />
      {scrollEffectMode === 'viewportExpand' && (
        <div
          className="absolute inset-0 pointer-events-none border border-white/20"
          style={{
            transform: `scale(${expandScale})`,
            borderRadius: `${Math.round((1 - easedScroll) * 46)}px`,
            opacity: 0.5 - easedScroll * 0.3,
          }}
        />
      )}
      {scrollEffectMode === 'backgroundReveal' && (
        <div
          className="absolute inset-0 pointer-events-none mix-blend-screen"
          style={{
            background: `radial-gradient(circle at ${38 + revealStrength * 28}% ${54 - revealStrength * 16}%, rgba(255,255,255,${0.1 + revealStrength * 0.18}), transparent ${12 + revealStrength * 34}%), linear-gradient(90deg, rgba(0,0,0,${0.86 - revealStrength * 0.62}), transparent, rgba(0,0,0,${0.86 - revealStrength * 0.62}))`,
          }}
        />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-600 font-mono p-12 text-center">
          <div className="max-w-md">
            <h3 className="font-bold mb-2">GPU INITIALIZATION FAILURE</h3>
            <p className="text-sm opacity-50">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShaderCanvas;

