import React, { useState } from 'react';
import { PRESETS } from '../constants';
import { FuzzConfig, FuzzMode, PresetName, ScrollEffectMode, TextEffectMode } from '../types';

const TEXT_EFFECTS: { mode: TextEffectMode; label: string; tone: string }[] = [
  { mode: 'none', label: 'None', tone: 'bg-zinc-950' },
  { mode: 'poster', label: 'Poster', tone: 'bg-emerald-950' },
  { mode: 'extrude', label: 'Extrude', tone: 'bg-indigo-950' },
  { mode: 'scan', label: 'Scan', tone: 'bg-cyan-950' },
];

const SCROLL_EFFECTS: { mode: ScrollEffectMode; label: string; hint: string; tone: string }[] = [
  { mode: 'none', label: 'None', hint: 'static', tone: 'bg-zinc-950' },
  { mode: 'viewportExpand', label: 'Expand', hint: 'small to full', tone: 'bg-neutral-950' },
  { mode: 'backgroundReveal', label: 'Reveal', hint: 'from background', tone: 'bg-stone-950' },
];

interface FuzzControlsProps {
  config: FuzzConfig;
  setConfig: React.Dispatch<React.SetStateAction<FuzzConfig>>;
  mode: FuzzMode;
  onModeChange: (mode: FuzzMode) => void;
  onFuzz: () => void;
  onRandomFuzz: () => void;
  onMathFuzz: () => void;
  onRandomMathFuzz: () => void;
  onPhysicsFuzz: () => void;
  onRandomPhysicsFuzz: () => void;
  onCursorFuzz: () => void;
  onRandomCursorFuzz: () => void;
  onScrollFuzz: () => void;
  onRandomScrollFuzz: () => void;
  onFragmentFuzz: () => void;
  onRandomFragmentFuzz: () => void;
  onVertexFuzz: () => void;
  onComputeFuzz: () => void;
  onAestheticFuzz: () => void;
  onRandomAestheticFuzz: () => void;
  onProDesignerFuzz: () => void;
  onRandomProDesignerFuzz: () => void;
  // V2 AST-based handlers
  onV2Generate?: () => void;
  onV2Mutate?: () => void;
  onV2Fuzz?: () => void;
  onAutoExplore?: () => void;
  onBack?: () => void;
  canGoBack?: boolean;
  onLike?: () => void;
  onDislike?: () => void;
  onTooSimilar?: () => void;
  tasteCounts?: { liked: number; disliked: number; tooSimilar: number };
  onCopyErrors: () => void;
  onReset: (presetName: PresetName) => void;
  onSave: () => void;
  onCopyWGSL: () => void;
  onCopyTextEmbed: () => void;
  onShowLibrary: () => void;
  onTextEffectModeChange: (mode: TextEffectMode) => void;
  textEffectMode: TextEffectMode;
  onScrollEffectModeChange: (mode: ScrollEffectMode) => void;
  scrollEffectMode: ScrollEffectMode;
  historyCount: number;
  errorCount: number;
  libraryCount: number;
}

// Dice icon for random buttons
const DiceIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  highlight?: boolean;
}> = ({ label, checked, onChange, highlight }) => (
  <label className="group flex items-center justify-between cursor-pointer py-1 hover:bg-zinc-900/50 transition-colors -mx-2 px-2 rounded">
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

const FuzzControls: React.FC<FuzzControlsProps> = ({ config, setConfig, mode, onModeChange, onFuzz, onRandomFuzz, onMathFuzz, onRandomMathFuzz, onPhysicsFuzz, onRandomPhysicsFuzz, onCursorFuzz, onRandomCursorFuzz, onScrollFuzz, onRandomScrollFuzz, onFragmentFuzz, onRandomFragmentFuzz, onVertexFuzz, onComputeFuzz, onAestheticFuzz, onRandomAestheticFuzz, onProDesignerFuzz, onRandomProDesignerFuzz, onV2Generate, onV2Mutate, onV2Fuzz, onAutoExplore, onBack, canGoBack, onLike, onDislike, onTooSimilar, tasteCounts, onCopyErrors, onReset, onSave, onCopyWGSL, onCopyTextEmbed, onShowLibrary, onTextEffectModeChange, textEffectMode, onScrollEffectModeChange, scrollEffectMode, errorCount, libraryCount }) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <div className="space-y-3">
      {/* Pipeline Mode */}
      <div className="space-y-2">
        <div className="space-y-0">
          <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Pipeline</h3>
          <div className="h-px w-8 bg-zinc-800 mb-2"></div>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => onModeChange('fragment')}
            className={`py-2 text-xs font-black uppercase tracking-wide transition-colors ${mode === 'fragment' ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
          >
            Fragment
          </button>
          <button
            onClick={() => onModeChange('vertex-fragment')}
            className={`py-2 text-xs font-black uppercase tracking-wide transition-colors ${mode === 'vertex-fragment' ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
          >
            Vertex+Frag
          </button>
          <button
            onClick={() => onModeChange('compute')}
            className={`py-2 text-xs font-black uppercase tracking-wide transition-colors ${mode === 'compute' ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
          >
            Compute
          </button>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="space-y-2">
        <div className="space-y-0">
           <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Generative Matrix</h3>
           <div className="h-px w-8 bg-zinc-800 mb-2"></div>
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

        <div className="pt-1 space-y-1">
            <div className="flex justify-between items-baseline">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Intensity</label>
                <span className="text-lg font-black text-emerald-500">{(config.intensity * 100).toFixed(0)}%</span>
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

      {/* Main Workflow */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Discover</h3>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={onBack}
            disabled={!canGoBack}
            className={`py-2.5 font-black text-xs uppercase tracking-wide active:scale-[0.99] ${canGoBack ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-950 text-zinc-700 cursor-not-allowed'}`}
          >
            Back
          </button>
          <button
            onClick={onAutoExplore}
            className="col-span-2 py-2.5 bg-white text-black font-black text-xs uppercase tracking-wide hover:bg-emerald-300 active:scale-[0.99]"
          >
            Next Candidate
          </button>
        </div>

        {(onLike || onDislike || onTooSimilar) && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Taste Trainer</h3>
              {tasteCounts && (
                <span className="text-[10px] font-mono text-zinc-600">
                  {tasteCounts.liked}/{tasteCounts.disliked}/{tasteCounts.tooSimilar}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={onLike}
                className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wide active:scale-[0.99]"
              >
                Like
              </button>
              <button
                onClick={onDislike}
                className="py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black text-xs uppercase tracking-wide active:scale-[0.99]"
              >
                Nope
              </button>
              <button
                onClick={onTooSimilar}
                className="py-2 bg-amber-700 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wide active:scale-[0.99]"
              >
                Similar
              </button>
            </div>
          </div>
        )}

        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Keep / Use</h3>
        <div className="grid grid-cols-2 gap-1">
          <button onClick={onSave} className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wide active:scale-[0.99]">
            Save
          </button>
          <button onClick={onShowLibrary} className="py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white font-black text-xs uppercase tracking-wide active:scale-[0.99]">
            Library ({libraryCount})
          </button>
          <button onClick={onCopyWGSL} className="py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs uppercase tracking-wide active:scale-[0.99]">
            Copy WGSL
          </button>
          <button onClick={onCopyTextEmbed} className="py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs uppercase tracking-wide active:scale-[0.99]">
            Copy Embed
          </button>
        </div>
        <div className="space-y-1">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Text Effects</h3>
          <div className="grid grid-cols-4 gap-1">
            {TEXT_EFFECTS.map(effect => (
              <button
                key={effect.mode}
                onClick={() => onTextEffectModeChange(effect.mode)}
                className={`relative min-h-14 overflow-hidden border p-1 text-left active:scale-[0.99] ${textEffectMode === effect.mode ? 'border-white bg-white text-black' : 'border-zinc-800 text-zinc-300 ' + effect.tone}`}
              >
                <div className={`absolute inset-x-2 top-2 h-4 ${textEffectMode === effect.mode ? 'bg-black/20' : 'bg-white/15'} ${effect.mode === 'extrude' ? 'translate-x-1 translate-y-1 shadow-[4px_4px_0_rgba(255,255,255,0.12)]' : ''} ${effect.mode === 'scan' ? 'h-px top-6 shadow-[0_8px_0_rgba(255,255,255,0.18)]' : ''}`} />
                <span className="absolute bottom-1.5 left-1.5 text-[9px] font-black uppercase tracking-wide">{effect.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Scroll Effects</h3>
          <div className="grid grid-cols-3 gap-1">
            {SCROLL_EFFECTS.map(effect => (
              <button
                key={effect.mode}
                onClick={() => onScrollEffectModeChange(effect.mode)}
                className={`relative min-h-16 overflow-hidden border p-2 text-left active:scale-[0.99] ${scrollEffectMode === effect.mode ? 'border-white bg-white text-black' : 'border-zinc-800 text-zinc-300 ' + effect.tone}`}
              >
                {effect.mode === 'viewportExpand' && (
                  <div className={`absolute left-1/2 top-3 h-6 w-8 -translate-x-1/2 border ${scrollEffectMode === effect.mode ? 'border-black/40' : 'border-white/35'} shadow-[0_0_18px_rgba(255,255,255,0.12)]`} />
                )}
                {effect.mode === 'backgroundReveal' && (
                  <div className={`absolute inset-x-3 top-4 h-5 [clip-path:polygon(42%_0,58%_0,75%_100%,25%_100%)] ${scrollEffectMode === effect.mode ? 'bg-black/30' : 'bg-white/20'}`} />
                )}
                {effect.mode === 'none' && (
                  <div className={`absolute inset-x-3 top-5 h-px ${scrollEffectMode === effect.mode ? 'bg-black/30' : 'bg-white/15'}`} />
                )}
                <span className="absolute bottom-5 left-2 text-[10px] font-black uppercase tracking-wide">{effect.label}</span>
                <span className="absolute bottom-1.5 left-2 text-[8px] font-mono uppercase opacity-55">{effect.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setAdvancedOpen(open => !open)}
          className="w-full py-2 bg-zinc-950 hover:bg-zinc-900 text-zinc-500 font-bold text-xs uppercase tracking-wide border border-zinc-900"
        >
          {advancedOpen ? 'Hide Advanced Generator Controls' : 'Advanced Generator Controls'}
        </button>

        {advancedOpen && (
          <>
            {/* V2 AST-BASED - Guaranteed to compile! */}
            {(onV2Generate || onV2Mutate || onV2Fuzz) && (
              <div className="grid grid-cols-3 gap-1">
                {onV2Generate && <button onClick={onV2Generate} className="py-2 bg-emerald-800 text-white font-black text-xs uppercase">Generate</button>}
                {onV2Mutate && <button onClick={onV2Mutate} className="py-2 bg-teal-800 text-white font-black text-xs uppercase">Variant</button>}
                {onV2Fuzz && <button onClick={onV2Fuzz} className="py-2 bg-cyan-800 text-white font-black text-xs uppercase">Fuzz</button>}
              </div>
            )}

        {/* Primary Row - General & Full Random */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onFuzz}
            className="py-2.5 bg-white text-black font-black text-sm tracking-wide hover:bg-emerald-400 transition-colors uppercase flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            Explore
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>

          <button
            onClick={onRandomFuzz}
            className="py-2.5 bg-gradient-to-r from-red-600 to-orange-600 text-white font-black text-sm tracking-wide hover:from-red-500 hover:to-orange-500 transition-colors uppercase flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            Fresh
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </button>
        </div>

        {/* Math Row - Mutate + Random */}
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={onMathFuzz}
            className="col-span-3 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-xs tracking-wide hover:from-violet-500 hover:to-fuchsia-500 transition-all uppercase flex items-center justify-center gap-1 active:scale-[0.99]"
          >
            Math
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={onRandomMathFuzz}
            className="py-2 bg-violet-900 hover:bg-violet-800 text-violet-300 font-bold text-xs transition-all flex items-center justify-center active:scale-[0.99]"
            title="Random Math"
          >
            <DiceIcon />
          </button>
        </div>

        {/* Physics Row - Mutate + Random */}
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={onPhysicsFuzz}
            className="col-span-3 py-2 bg-gradient-to-r from-sky-500 to-blue-700 text-white font-bold text-xs tracking-wide hover:from-sky-400 hover:to-blue-600 transition-all uppercase flex items-center justify-center gap-1 active:scale-[0.99]"
          >
            Physics
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
          <button
            onClick={onRandomPhysicsFuzz}
            className="py-2 bg-blue-900 hover:bg-blue-800 text-blue-300 font-bold text-xs transition-all flex items-center justify-center active:scale-[0.99]"
            title="Random Physics"
          >
            <DiceIcon />
          </button>
        </div>

        {/* Aesthetic Row - Mutate + Random */}
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={onAestheticFuzz}
            className="col-span-3 py-2 bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold text-xs tracking-wide hover:from-amber-400 hover:to-rose-400 transition-all uppercase flex items-center justify-center gap-1 active:scale-[0.99]"
          >
            Aesthetic
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </button>
          <button
            onClick={onRandomAestheticFuzz}
            className="py-2 bg-rose-900 hover:bg-rose-800 text-rose-300 font-bold text-xs transition-all flex items-center justify-center active:scale-[0.99]"
            title="Random Aesthetic"
          >
            <DiceIcon />
          </button>
        </div>

        {/* Cursor Row - Mutate + Random */}
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={onCursorFuzz}
            className="col-span-3 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold text-xs tracking-wide hover:from-pink-400 hover:to-purple-400 transition-all uppercase flex items-center justify-center gap-1 active:scale-[0.99]"
          >
            Cursor
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          </button>
          <button
            onClick={onRandomCursorFuzz}
            className="py-2 bg-purple-900 hover:bg-purple-800 text-purple-300 font-bold text-xs transition-all flex items-center justify-center active:scale-[0.99]"
            title="Random Cursor"
          >
            <DiceIcon />
          </button>
        </div>

        {/* Scroll Row - Mutate + Random */}
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={onScrollFuzz}
            className="col-span-3 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold text-xs tracking-wide hover:from-teal-400 hover:to-cyan-400 transition-all uppercase flex items-center justify-center gap-1 active:scale-[0.99]"
          >
            Scroll
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
          <button
            onClick={onRandomScrollFuzz}
            className="py-2 bg-cyan-900 hover:bg-cyan-800 text-cyan-300 font-bold text-xs transition-all flex items-center justify-center active:scale-[0.99]"
            title="Random Scroll"
          >
            <DiceIcon />
          </button>
        </div>

        {/* Fragment Row - Mutate + Random */}
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={onFragmentFuzz}
            className="col-span-3 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold text-xs tracking-wide hover:from-green-400 hover:to-emerald-400 transition-all uppercase flex items-center justify-center gap-1 active:scale-[0.99]"
          >
            Fragment
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </button>
          <button
            onClick={onRandomFragmentFuzz}
            className="py-2 bg-emerald-900 hover:bg-emerald-800 text-emerald-300 font-bold text-xs transition-all flex items-center justify-center active:scale-[0.99]"
            title="Random Fragment"
          >
            <DiceIcon />
          </button>
        </div>

        {/* Pro Designer Row - Mutate + Random */}
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={onProDesignerFuzz}
            className="col-span-3 py-2 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-700 text-white font-bold text-xs tracking-wide hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-600 transition-all uppercase flex items-center justify-center gap-1 active:scale-[0.99] shadow-lg shadow-blue-500/25"
          >
            Pro Designer
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={onRandomProDesignerFuzz}
            className="py-2 bg-indigo-900 hover:bg-indigo-800 text-indigo-300 font-bold text-xs transition-all flex items-center justify-center active:scale-[0.99]"
            title="Random Pro Designer"
          >
            <DiceIcon />
          </button>
        </div>

        {/* Vertex & Compute (less commonly used, keep simple) */}
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={onVertexFuzz}
            className="py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold text-[10px] tracking-wide hover:from-blue-400 hover:to-indigo-400 transition-all uppercase flex items-center justify-center gap-1 active:scale-[0.99]"
          >
            Vertex
          </button>
          <button
            onClick={onComputeFuzz}
            className="py-1.5 bg-gradient-to-r from-slate-600 to-zinc-600 text-white font-bold text-[10px] tracking-wide hover:from-slate-500 hover:to-zinc-500 transition-all uppercase flex items-center justify-center gap-1 active:scale-[0.99]"
          >
            Compute
          </button>
        </div>
          </>
        )}
      </div>

      {/* Copy Errors Button */}
      <button
        onClick={onCopyErrors}
        disabled={errorCount === 0}
        className={`w-full py-2 font-bold text-sm tracking-wide uppercase flex items-center justify-center gap-2 active:scale-[0.99] transition-all ${
          errorCount > 0
            ? 'bg-red-900/50 text-red-400 hover:bg-red-800/50 border border-red-800'
            : 'bg-zinc-900 text-zinc-600 cursor-not-allowed border border-zinc-800'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
        Copy All Errors ({errorCount})
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
