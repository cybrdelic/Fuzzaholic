
import React, { useEffect, useRef, useState } from 'react';
import { BASE_VERTEX_SHADER, WGSL_PREAMBLE } from '../constants';

interface ShaderCanvasProps {
  fragmentCode: string;
  onCompilationError: (error: string) => void;
  onCompilationSuccess: () => void;
}

// Helper constants to substitute missing WebGPU types
const SHADER_STAGE_FRAGMENT = 2; // GPUShaderStage.FRAGMENT
const BUFFER_USAGE_UNIFORM = 64; // GPUBufferUsage.UNIFORM
const BUFFER_USAGE_COPY_DST = 8; // GPUBufferUsage.COPY_DST

const ShaderCanvas: React.FC<ShaderCanvasProps> = ({ 
  fragmentCode, 
  onCompilationError,
  onCompilationSuccess
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Use any for WebGPU refs since types might not be available in the environment
  const deviceRef = useRef<any | null>(null);
  const contextRef = useRef<any | null>(null);
  const pipelineRef = useRef<any | null>(null);
  const uniformBufferRef = useRef<any | null>(null);
  const bindGroupRef = useRef<any | null>(null);
  const animationFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  // Initialize WebGPU Device
  useEffect(() => {
    const initWebGPU = async () => {
      if (!(navigator as any).gpu) {
        setError("WebGPU not supported in this browser.");
        return;
      }

      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (!adapter) {
          setError("No appropriate GPU adapter found.");
          return;
        }

        const device = await adapter.requestDevice();
        deviceRef.current = device;

        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('webgpu');
          if (context) {
            contextRef.current = context;
            const presentationFormat = (navigator as any).gpu.getPreferredCanvasFormat();
            contextRef.current.configure({
              device,
              format: presentationFormat,
              alphaMode: 'premultiplied',
            });
          }
        }
      } catch (e: any) {
        setError(e.message);
      }
    };

    initWebGPU();

    return () => {
        // Cleanup if necessary
    }
  }, []);

  // Compile Shader and Create Pipeline
  useEffect(() => {
    const device = deviceRef.current;
    const context = contextRef.current;

    if (!device || !context) return;

    const buildPipeline = async () => {
      // 1. Create Shader Modules
      device.pushErrorScope('validation');
      
      const vertexModule = device.createShaderModule({
        label: 'Base Vertex',
        code: BASE_VERTEX_SHADER,
      });

      // INVARIANT: Suppress uniformity analysis errors which are common in fuzzed code
      // We also inject the WGSL helper library (PREAMBLE) here.
      const safeFragmentCode = `diagnostic(off, derivative_uniformity);\n` 
        + WGSL_PREAMBLE 
        + fragmentCode;

      const fragmentModule = device.createShaderModule({
        label: 'Fuzzed Fragment',
        code: safeFragmentCode,
      });

      // Check for compilation info (errors)
      const compilationInfo = await fragmentModule.getCompilationInfo();
      const errors = compilationInfo.messages
        .filter((msg: any) => msg.type === 'error')
        .map((msg: any) => `Line ${msg.lineNum}: ${msg.message}`)
        .join('\n');

      if (errors) {
        onCompilationError(errors);
        return; 
      }

      onCompilationSuccess();

      // 2. Create Layout
      
      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: SHADER_STAGE_FRAGMENT,
            buffer: { type: 'uniform' },
          },
          {
            binding: 1,
            visibility: SHADER_STAGE_FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
      });

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      });

      // 3. Create Pipeline
      const presentationFormat = (navigator as any).gpu.getPreferredCanvasFormat();
      
      try {
        const pipeline = device.createRenderPipeline({
          layout: pipelineLayout,
          vertex: {
            module: vertexModule,
            entryPoint: 'main',
          },
          fragment: {
            module: fragmentModule,
            entryPoint: 'main',
            targets: [{ format: presentationFormat }],
          },
          primitive: {
            topology: 'triangle-list',
          },
        });

        pipelineRef.current = pipeline;

        // 4. Uniform Buffers
        const timeBuffer = device.createBuffer({
            size: 4, // f32
            usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
        });

        const resolutionBuffer = device.createBuffer({
            size: 8, // vec2<f32>
            usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
        });

        uniformBufferRef.current = timeBuffer; 

        // 5. Create Bind Group
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: timeBuffer } },
                { binding: 1, resource: { buffer: resolutionBuffer } }
            ]
        });
        bindGroupRef.current = bindGroup;

        // Update resolution once
        device.queue.writeBuffer(resolutionBuffer, 0, new Float32Array([
            canvasRef.current?.width || 800,
            canvasRef.current?.height || 600
        ]));

        device.popErrorScope().then((error: any) => {
            if (error) {
                onCompilationError(error.message);
            }
        });

      } catch (e: any) {
        onCompilationError(e.message);
      }
    };

    buildPipeline();
  }, [fragmentCode, onCompilationError, onCompilationSuccess]);

  // Render Loop
  useEffect(() => {
    const render = () => {
      const device = deviceRef.current;
      const context = contextRef.current;
      const pipeline = pipelineRef.current;
      const bindGroup = bindGroupRef.current;

      if (!device || !context || !pipeline || !bindGroup) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Update Time Uniform
      const timeVal = (Date.now() - startTimeRef.current) / 1000.0;
      if (uniformBufferRef.current) {
        device.queue.writeBuffer(uniformBufferRef.current, 0, new Float32Array([timeVal]));
      }

      const commandEncoder = device.createCommandEncoder();
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
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6); 
      passEncoder.end();

      device.queue.submit([commandEncoder.finish()]);
      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-red-600 font-mono p-12 text-center">
        <div className="max-w-md">
            <h3 className="font-bold mb-2">GPU INITIALIZATION FAILURE</h3>
            <p className="text-sm opacity-50">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={1200}
      className="w-full h-full object-cover bg-black"
    />
  );
};

export default ShaderCanvas;
