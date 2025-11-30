import React from 'react';
import { FuzzConfig, PresetName } from '../types';
import { PRESETS } from '../constants';

interface FuzzControlsProps {
  config: FuzzConfig;
  setConfig: React.Dispatch<React.SetStateAction<FuzzConfig>>;
  onFuzz: () => void;
  onReset: (presetName: PresetName) => void;
  historyCount: number;
}

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  highlight?: boolean;
}> = ({ label, checked, onChange, highlight }) => (
  <label className="group flex items-center justify-between cursor-pointer py-1.5 hover:bg-zinc-900/50 transition-colors -mx-2 px-2 rounded">
    <span className={`text-sm font-medium tracking-tight ${highlight ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
      {label}
    </span>
    <div className="relative">
      <input 
        type="checkbox" 
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-emerald-600' : 'bg-zinc-800'}`}></div>
      <div className={`absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform ${checked ? 'translate-x-4' : ''}`}></div>
    </div>
  </label>
);

const FuzzControls: React.FC<FuzzControlsProps> = ({ config, setConfig, onFuzz, onReset }) => {
  return (
    <div className="space-y-8">
      
      {/* Primary Actions */}
      <div className="space-y-4">
        <div className="space-y-1">
           <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-widest">Generative Matrix</h3>
           <div className="h-px w-8 bg-zinc-800 mb-4"></div>
           <Toggle 
             label="Procedural Reconstruction" 
             highlight
             checked={config.mutateStructure}
             onChange={(c) => setConfig(prev => ({ ...prev, mutateStructure: c }))}
           />
           <Toggle 
             label="Spatial Warping" 
             checked={config.mutateGeometry}
             onChange={(c) => setConfig(prev => ({ ...prev, mutateGeometry: c }))}
           />
           <Toggle 
             label="Color Shifting" 
             checked={config.mutateColor}
             onChange={(c) => setConfig(prev => ({ ...prev, mutateColor: c }))}
           />
            <Toggle 
             label="Chaos Injection" 
             checked={config.mutateChaos}
             onChange={(c) => setConfig(prev => ({ ...prev, mutateChaos: c }))}
           />
        </div>

        <div className="pt-2 space-y-2">
            <div className="flex justify-between items-baseline mb-2">
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-widest">Intensity</label>
                <span className="text-xl font-black text-emerald-500">{(config.intensity * 100).toFixed(0)}%</span>
            </div>
            <input 
            type="range" 
            min="0.01" 
            max="1" 
            step="0.01" 
            value={config.intensity} 
            onChange={e => setConfig(prev => ({ ...prev, intensity: parseFloat(e.target.value) }))}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
            />
        </div>
      </div>

      <button
        onClick={onFuzz}
        className="w-full py-4 bg-white text-black font-black text-lg tracking-wide hover:bg-emerald-400 transition-colors uppercase flex items-center justify-center gap-3 active:scale-[0.99]"
      >
        Mutate
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </button>

      {/* Secondary Controls */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1">
          <div>
            <h3 className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest mb-2">Atomic</h3>
            <Toggle 
                label="Numbers" 
                checked={config.mutateNumbers}
                onChange={(c) => setConfig(prev => ({ ...prev, mutateNumbers: c }))}
            />
            <Toggle 
                label="Ops" 
                checked={config.mutateOperators}
                onChange={(c) => setConfig(prev => ({ ...prev, mutateOperators: c }))}
            />
          </div>
           <div>
            <h3 className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest mb-2">Presets</h3>
            <div className="grid grid-cols-2 gap-1">
                {PRESETS.map(p => (
                    <button 
                        key={p.name}
                        onClick={() => onReset(p.name)}
                        className="
                          relative overflow-hidden group bg-zinc-900 border border-zinc-800 p-2 text-left
                          hover:border-emerald-500/50 hover:bg-zinc-800 transition-all duration-300
                        "
                    >
                        <div className="absolute inset-0 bg-emerald-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"/>
                        <span className="relative text-xs font-mono font-bold text-zinc-500 group-hover:text-emerald-400 uppercase tracking-wider transition-colors duration-200">
                            {p.name}
                        </span>
                    </button>
                ))}
            </div>
          </div>
      </div>

    </div>
  );
};

export default FuzzControls;