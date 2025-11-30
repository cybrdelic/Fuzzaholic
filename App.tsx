import React, { useState, useCallback } from 'react';
import ShaderCanvas from './components/ShaderCanvas';
import Editor from './components/Editor';
import FuzzControls from './components/FuzzControls';
import LogViewer from './components/LogViewer';
import { fuzzShader } from './services/fuzzerService';
import { PRESETS } from './constants';
import { LogEntry, FuzzConfig, PresetName } from './types';

const App: React.FC = () => {
  const [code, setCode] = useState<string>(PRESETS[0].code);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [fuzzConfig, setFuzzConfig] = useState<FuzzConfig>({
    mutateNumbers: true,
    mutateOperators: false,
    mutateBuiltins: false,
    mutateGeometry: true,
    mutateColor: true,
    mutateChaos: false,
    mutateStructure: false,
    intensity: 0.2,
  });
  const [historyCount, setHistoryCount] = useState(0);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      type,
      message
    }].slice(-50));
  }, []);

  const handleCompilationError = useCallback((error: string) => {
    setCompileError(error);
    addLog('error', 'Shader compilation failed.');
  }, [addLog]);

  const handleCompilationSuccess = useCallback(() => {
    setCompileError(null);
    if (compileError) {
        addLog('success', 'Shader compiled successfully.');
    }
  }, [compileError, addLog]);

  const handleFuzz = () => {
    try {
      addLog('info', `Running mutation pass...`);
      const newCode = fuzzShader(code, fuzzConfig);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
    } catch (e) {
      addLog('error', 'Fuzzing algorithm exception.');
    }
  };

  const handleReset = (presetName: PresetName) => {
    const preset = PRESETS.find(p => p.name === presetName);
    if (preset) {
      setCode(preset.code);
      addLog('info', `Loaded preset: ${presetName}`);
      setCompileError(null);
    }
  };

  return (
    <div className="h-screen w-screen bg-black text-white flex overflow-hidden font-sans">
      
      {/* Left HUD: Controls & Code */}
      <div className="w-[450px] flex-shrink-0 flex flex-col border-r border-zinc-900 bg-black z-10">
        
        {/* Title Area */}
        <div className="p-8 pb-4">
          <h1 className="text-4xl font-black tracking-tighter leading-none mb-1 text-white">
            AETHER<br/><span className="text-zinc-600">FUZZ</span>
          </h1>
          <div className="flex items-center gap-3 mt-4">
            <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
            <span className="text-xs font-mono text-zinc-500 tracking-widest uppercase">System Online</span>
          </div>
        </div>

        {/* Controls */}
        <div className="px-8 pb-6">
          <FuzzControls 
            config={fuzzConfig} 
            setConfig={setFuzzConfig} 
            onFuzz={handleFuzz} 
            onReset={handleReset}
            historyCount={historyCount}
          />
        </div>

        {/* Code Editor Area */}
        <div className="flex-grow flex flex-col min-h-0 border-t border-zinc-900">
           <Editor 
              code={code} 
              onChange={setCode} 
              error={compileError} 
            />
        </div>

        {/* Minimal Logs */}
        <div className="h-32 border-t border-zinc-900 bg-black">
          <LogViewer logs={logs} />
        </div>
      </div>

      {/* Right Canvas: Full Bleed */}
      <div className="flex-grow relative bg-zinc-950">
        <ShaderCanvas 
          fragmentCode={code} 
          onCompilationError={handleCompilationError} 
          onCompilationSuccess={handleCompilationSuccess}
        />
        
        {/* Overlay Info */}
        <div className="absolute top-8 right-8 text-right pointer-events-none mix-blend-difference">
          <div className="text-8xl font-black text-white opacity-20 leading-none">
            {historyCount.toString().padStart(3, '0')}
          </div>
          <div className="text-xs font-mono font-bold text-white uppercase tracking-widest mt-2">
            Mutation Epoch
          </div>
        </div>
      </div>

    </div>
  );
};

export default App;