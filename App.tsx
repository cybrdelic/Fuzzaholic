import React, { useState, useCallback } from 'react';
import ShaderCanvas from './components/ShaderCanvas';
import Editor from './components/Editor';
import FuzzControls from './components/FuzzControls';
import LogViewer from './components/LogViewer';
import { fuzzShader } from './services/fuzzerService';
import { PRESETS } from './constants';
import { LogEntry, FuzzConfig, PresetName } from './types';

type MobileTab = 'canvas' | 'controls' | 'code';

const App: React.FC = () => {
  const [code, setCode] = useState<string>(PRESETS[0].code);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mobileTab, setMobileTab] = useState<MobileTab>('canvas');
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
    <div className="h-screen w-screen bg-black text-white flex flex-col lg:flex-row overflow-hidden font-sans">

      {/* Left HUD: Controls & Code */}
      <div className={`flex-col border-r border-zinc-900 bg-black z-10 lg:w-[450px] lg:flex-shrink-0 pb-14 lg:pb-0 ${mobileTab === 'canvas' ? 'hidden lg:flex' : 'flex flex-1 min-h-0'}`}>

        {/* Title + Controls — hidden on mobile Code tab */}
        <div className={`flex-shrink-0 overflow-y-auto ${mobileTab === 'code' ? 'hidden lg:block' : 'block'}`}>
          <div className="p-6 lg:p-8 pb-4">
            <h1 className="text-3xl lg:text-4xl font-black tracking-tighter leading-none mb-1 text-white">
              AETHER<br /><span className="text-zinc-600">FUZZ</span>
            </h1>
            <div className="flex items-center gap-3 mt-4">
              <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
              <span className="text-xs font-mono text-zinc-500 tracking-widest uppercase">System Online</span>
            </div>
          </div>

          <div className="px-6 lg:px-8 pb-6">
            <FuzzControls
              config={fuzzConfig}
              setConfig={setFuzzConfig}
              onFuzz={handleFuzz}
              onReset={handleReset}
              historyCount={historyCount}
            />
          </div>
        </div>

        {/* Code Editor — hidden on mobile Controls tab */}
        <div className={`flex-grow flex flex-col min-h-0 border-t border-zinc-900 ${mobileTab === 'controls' ? 'hidden lg:flex' : 'flex'}`}>
          <Editor
            code={code}
            onChange={setCode}
            error={compileError}
          />
        </div>

        {/* Logs — hidden on mobile Controls tab */}
        <div className={`h-32 flex-shrink-0 border-t border-zinc-900 bg-black ${mobileTab === 'controls' ? 'hidden lg:block' : 'block'}`}>
          <LogViewer logs={logs} />
        </div>
      </div>

      {/* Right Canvas: Full Bleed */}
      <div className={`flex-grow relative bg-zinc-950 pb-14 lg:pb-0 ${mobileTab !== 'canvas' ? 'hidden lg:block' : 'block'}`}>
        <ShaderCanvas
          fragmentCode={code}
          onCompilationError={handleCompilationError}
          onCompilationSuccess={handleCompilationSuccess}
        />

        <div className="absolute top-4 right-4 lg:top-8 lg:right-8 text-right pointer-events-none mix-blend-difference">
          <div className="text-5xl lg:text-8xl font-black text-white opacity-20 leading-none">
            {historyCount.toString().padStart(3, '0')}
          </div>
          <div className="text-[10px] lg:text-xs font-mono font-bold text-white uppercase tracking-widest mt-1 lg:mt-2">
            Mutation Epoch
          </div>
        </div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 flex h-14 border-t border-zinc-800 bg-black z-50">
        <button
          onClick={() => setMobileTab('canvas')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${mobileTab === 'canvas' ? 'text-emerald-400' : 'text-zinc-600'}`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" strokeLinecap="round" />
          </svg>
          Canvas
        </button>
        <button
          onClick={() => setMobileTab('controls')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${mobileTab === 'controls' ? 'text-emerald-400' : 'text-zinc-600'}`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
            <circle cx="9" cy="18" r="2" fill="currentColor" stroke="none" />
          </svg>
          Controls
        </button>
        <button
          onClick={() => setMobileTab('code')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${mobileTab === 'code' ? 'text-emerald-400' : 'text-zinc-600'}`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Code
        </button>
      </nav>
    </div>
  );
};

export default App;
