import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from './components/Editor';
import LogViewer from './components/LogViewer';
import ShaderCanvas from './components/ShaderCanvas';
import ShaderLibrary from './components/ShaderLibrary';
import { PRESETS } from './constants';
import { captureThumbnail } from './services/shaderStorage';
import { generateAutoExplorationCandidate } from './services/autoExplorer';
import { getFileDbHealth, getFileDbShaders, getFileDbStats, getFileDbTaste, getStorageCapability, importShadersToFileDb, importTasteToFileDb, saveShaderToFileDb, saveTasteToFileDb, StorageCapability } from './services/fileShaderDb';
import { transformCurrentShader, ScopedTransformIntent } from './services/scopedShaderTransforms';
import { fuzzShaderV2WithMode, generateFreshShaderV2WithMode, generateIntentShaderV2WithMode } from './services/v2Fuzzer';
import { CompilationError, FuzzConfig, FuzzMode, LogEntry, PresetName, ScrollEffectMode, TextEffectMode } from './types';
import { buildStandaloneEmbed } from './services/embedExport';
import { bundleFilename, createFuzzaholicBundle, downloadText, parseFuzzaholicBundle } from './services/shaderBundle';

type TasteLabel = 'liked' | 'disliked' | 'tooSimilar';
type WorkspaceMode = 'discover' | 'effects' | 'library' | 'export';

interface TasteSample {
  code: string;
  label: TasteLabel;
  mode: FuzzMode;
  timestamp: number;
}

interface CandidateMetrics {
  seed: number;
  selectedIndex: number;
  candidateCount: number;
  score: number;
  novelty: number;
  complexity: number;
  restraint: number;
  taste: number;
}

const MAX_TASTE_SAMPLES = 80;
const EMPTY_STORAGE_CAPABILITY: StorageCapability = {
  mode: 'unavailable',
  ok: false,
  dbPath: '',
  message: 'Checking storage',
};

const App: React.FC = () => {
  const [code, setCode] = useState<string>(PRESETS[0].code);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [allErrors, setAllErrors] = useState<CompilationError[]>([]);
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
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryCount, setLibraryCount] = useState(0);
  const [pipelineMode, setPipelineMode] = useState<FuzzMode>('fragment');
  const [lastWorkingCode, setLastWorkingCode] = useState<string>(PRESETS[0].code);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [candidateBackStack, setCandidateBackStack] = useState<string[]>([]);
  // Track the shader BEFORE mutation for error reporting
  const [shaderBeforeMutation, setShaderBeforeMutation] = useState<string>(PRESETS[0].code);
  const [lastMutationType, setLastMutationType] = useState<string>('init');
  const [textEffectMode, setTextEffectMode] = useState<TextEffectMode>('none');
  const [scrollEffectMode, setScrollEffectMode] = useState<ScrollEffectMode>('none');
  const [tasteSamples, setTasteSamples] = useState<TasteSample[]>([]);
  const [fileDbPath, setFileDbPath] = useState('');
  const [storageCapability, setStorageCapability] = useState<StorageCapability>(EMPTY_STORAGE_CAPABILITY);
  const [latestCandidateMetrics, setLatestCandidateMetrics] = useState<CandidateMetrics | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('discover');
  const [codeDockOpen, setCodeDockOpen] = useState(false);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      type,
      message
    }].slice(-50));
  }, []);

  // Load file-backed database state
  useEffect(() => {
    const loadFileDbState = async () => {
      try {
        const health = await getFileDbHealth();
        setStorageCapability(health);
        setFileDbPath(health.dbPath);
        const [stats, taste] = await Promise.all([getFileDbStats(), getFileDbTaste()]);
        setLibraryCount(stats.totalCount);
        setTasteSamples(taste.slice(0, MAX_TASTE_SAMPLES) as TasteSample[]);
      } catch (e) {
        const capability = await getStorageCapability();
        setStorageCapability(capability);
        setFileDbPath(capability.dbPath);
        addLog('warning', capability.message);
      }
    };
    loadFileDbState();
  }, [addLog]);

  // Note: SQLite auto-saves on each operation, no need for manual persist effect
  const handlePipelineModeChange = useCallback((nextMode: FuzzMode) => {
    if (nextMode === pipelineMode) return;

    try {
      const seed = Date.now();
      const newCode = generateFreshShaderV2WithMode(fuzzConfig.intensity, seed, nextMode);
      setPipelineMode(nextMode);
      setShaderBeforeMutation(newCode);
      setLastMutationType('mode-switch');
      setPendingCode(null);
      setCode(newCode);
      setLastWorkingCode(newCode);
      addLog('info', `[V2] Switched to ${nextMode}; generated new shader (seed: ${seed})`);
    } catch (e) {
      addLog('error', `Failed to switch pipeline mode: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [pipelineMode, fuzzConfig.intensity, addLog]);

  const handleCompilationError = useCallback((error: string) => {
    setCompileError(error);
    const isWebGPUApiError = /Destination texture|APIInjectError|Validation Error|GPU.*usage|RenderAttachment|CopyDst/i.test(error);
    addLog('error', isWebGPUApiError ? 'WebGPU render path failed.' : 'Shader compilation failed. Reverting to last working version.');
    if (isWebGPUApiError) {
      return;
    }
    // Store error with full details for later export - including BEFORE and AFTER
    setAllErrors(prev => [...prev, {
      epoch: historyCount,
      timestamp: new Date(),
      error: error,
      shaderCodeBefore: shaderBeforeMutation,
      shaderCodeAfter: code,
      mutationType: lastMutationType
    }]);
    // Auto-revert to last working shader
    if (pendingCode && lastWorkingCode !== code) {
      setTimeout(() => {
        setCode(lastWorkingCode);
        setPendingCode(null);
      }, 100);
    }
  }, [addLog, historyCount, code, lastWorkingCode, pendingCode, shaderBeforeMutation, lastMutationType]);

  const handleCompilationSuccess = useCallback(() => {
    setCompileError(null);
    if (compileError) {
        addLog('success', 'Shader compiled successfully.');
    }
    // Save this as the last working shader
    setLastWorkingCode(code);
    setPendingCode(null);
  }, [compileError, addLog, code]);

  const handleCopyAllErrors = useCallback(() => {
    if (allErrors.length === 0) {
      addLog('warning', 'No errors to copy.');
      return;
    }

    const errorReport = allErrors.map((err, idx) => {
      return `=== ERROR ${idx + 1} (Epoch ${err.epoch}) ===
Timestamp: ${err.timestamp.toISOString()}
Mutation Type: ${err.mutationType || 'unknown'}
Error Message:
${err.error}

--- SHADER BEFORE MUTATION ---
\`\`\`wgsl
${err.shaderCodeBefore}
\`\`\`

--- SHADER AFTER MUTATION (FAILED) ---
\`\`\`wgsl
${err.shaderCodeAfter}
\`\`\`
`;
    }).join('\n\n');

    const header = `# Fuzzaholic Compilation Errors Report
Generated: ${new Date().toISOString()}
Total Errors: ${allErrors.length}

`;

    navigator.clipboard.writeText(header + errorReport).then(() => {
      addLog('success', `Copied ${allErrors.length} errors to clipboard!`);
    }).catch(() => {
      addLog('error', 'Failed to copy to clipboard.');
    });
  }, [allErrors, addLog]);

  const applyScopedTransform = (intent: ScopedTransformIntent, mutationType: string, label: string) => {
    if (pipelineMode === 'compute') {
      throw new Error(`${label} transforms only apply to fragment render shaders right now.`);
    }

    setShaderBeforeMutation(lastWorkingCode);
    setLastMutationType(mutationType);
    const newCode = transformCurrentShader(lastWorkingCode, intent, fuzzConfig.intensity);
    setCandidateBackStack(prev => [lastWorkingCode, ...prev].slice(0, 50));
    setPendingCode(newCode);
    setCode(newCode);
    setHistoryCount(prev => prev + 1);
    addLog('success', `${label} applied to current shader.`);
  };

  const handleFuzz = () => {
    try {
      addLog('info', `Running mutation pass...`);
      applyScopedTransform('variant', 'fuzz', 'Exploratory variant');
    } catch (e) {
      addLog('error', 'Fuzzing algorithm exception.');
    }
  };

  const handleMathFuzz = () => {
    try {
      addLog('info', `Generating math-focused variant...`);
      applyScopedTransform('math', 'math', 'Math transform');
    } catch (e) {
      addLog('error', 'Math fuzz algorithm exception.');
    }
  };

  const handlePhysicsFuzz = () => {
    try {
      addLog('info', `Generating physics-style variant...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('physics');
      const newCode = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), pipelineMode, 'physics');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Physics-style variant generated!');
    } catch (e) {
      addLog('error', 'Physics fuzz algorithm exception.');
    }
  };

  const handleAestheticFuzz = () => {
    try {
      addLog('info', `Generating aesthetic variant...`);
      applyScopedTransform('aesthetic', 'aesthetic', 'Aesthetic transform');
    } catch (e) {
      addLog('error', 'Aesthetic fuzzing exception.');
    }
  };

  const handleProDesignerFuzz = () => {
    try {
      addLog('info', `Generating pro designer shader...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('proDesigner');
      const newCode = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), pipelineMode, 'aesthetic');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Pro designer shader generated!');
    } catch (e) {
      addLog('error', 'Pro designer fuzzing exception.');
    }
  };

  const handleRandomFuzz = () => {
    try {
      addLog('info', `Generating fresh shader...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('random');
      const newCode = generateFreshShaderV2WithMode(fuzzConfig.intensity, Date.now(), pipelineMode);
      setCandidateBackStack(prev => [lastWorkingCode, ...prev].slice(0, 50));
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Fresh shader generated!');
    } catch (e) {
      addLog('error', 'Random fuzzing exception.');
    }
  };

  // =============================================
  // V2 AST-BASED HANDLERS (Guaranteed to compile!)
  // =============================================

  const handleV2Generate = () => {
    try {
      addLog('info', `[V2] Generating fresh AST-based shader (${pipelineMode})...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('v2-generate');
      const seed = Date.now();
      const newCode = generateFreshShaderV2WithMode(fuzzConfig.intensity, seed, pipelineMode);
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', `[V2] Fresh shader generated (seed: ${seed})`);
    } catch (e) {
      addLog('error', `[V2] Generation failed: ${e}`);
    }
  };

  const handleV2Mutate = () => {
    try {
      addLog('info', `[V2] Mutating shader with AST (${pipelineMode})...`);
      applyScopedTransform('variant', 'v2-mutate', '[V2] Variant transform');
    } catch (e) {
      addLog('error', `[V2] Mutation failed: ${e}`);
    }
  };

  const handleV2Fuzz = () => {
    try {
      addLog('info', `[V2] Running full fuzz pipeline (${pipelineMode})...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('v2-fuzz');
      const rounds = Math.floor(1 + fuzzConfig.intensity * 4); // 1-5 rounds
      const { code: newCode, mutations } = fuzzShaderV2WithMode(fuzzConfig.intensity, rounds, undefined, pipelineMode);
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', `[V2] Fuzz complete: ${mutations.length} mutations in ${rounds} rounds`);
      if (mutations.length > 0) {
        addLog('info', `Mutations: ${mutations.slice(0, 5).join(', ')}${mutations.length > 5 ? '...' : ''}`);
      }
    } catch (e) {
      addLog('error', `[V2] Fuzz failed: ${e}`);
    }
  };

  const handleAutoExplore = async () => {
    try {
      addLog('info', `[Auto] Searching generated shader space (${pipelineMode})...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('auto-explore');
      const result = await generateAutoExplorationCandidate({
        intensity: fuzzConfig.intensity,
        mode: pipelineMode,
        currentCode: lastWorkingCode,
        candidateCount: Math.floor(32 + fuzzConfig.intensity * 48),
        archiveLimit: 40,
        likedCodes: tasteSamples.filter(sample => sample.label === 'liked').map(sample => sample.code),
        dislikedCodes: tasteSamples.filter(sample => sample.label === 'disliked').map(sample => sample.code),
        tooSimilarCodes: tasteSamples.filter(sample => sample.label === 'tooSimilar').map(sample => sample.code),
      });
      setCandidateBackStack(prev => [lastWorkingCode, ...prev].slice(0, 50));
      setPendingCode(result.code);
      setCode(result.code);
      setHistoryCount(prev => prev + 1);
      setLatestCandidateMetrics(result);
      addLog('success', `[Auto] Selected ${result.selectedIndex + 1}/${result.candidateCount} seed ${result.seed}`);
      addLog('info', `[Auto] novelty ${result.novelty.toFixed(2)} complexity ${result.complexity.toFixed(2)} restraint ${result.restraint.toFixed(2)} taste ${result.taste.toFixed(2)} score ${result.score.toFixed(2)}`);
    } catch (e) {
      addLog('error', `[Auto] Exploration failed: ${e}`);
    }
  };

  const saveLikedShaderPermanently = async (shaderCode: string) => {
    const timestamp = new Date();
    const name = `Liked ${timestamp.toLocaleString()}`;

    try {
      const canvas = document.querySelector('canvas');
      const thumbnail = canvas ? captureThumbnail(canvas) : undefined;
      await saveShaderToFileDb({
        name,
        code: shaderCode,
        tags: ['liked', 'taste-liked', lastMutationType],
        generation: historyCount,
        rating: 5,
        thumbnail,
        metadata: { intensity: fuzzConfig.intensity },
      });
      const stats = await getFileDbStats();
      const capability = await getStorageCapability();
      setStorageCapability(capability);
      setLibraryCount(stats.totalCount);
      addLog('success', capability.mode === 'local-file-db'
        ? `[Save] Permanently saved liked shader: ${name}`
        : `[Save] Session saved liked shader. Export a bundle for permanence.`);
    } catch (e) {
      console.error('Failed to save liked shader to file database:', e);
      addLog('error', '[Save] File database save failed. Start with npm run dev.');
    }
  };

  const saveCurrentShaderToLibrary = async (tags: string[] = ['saved']) => {
    const timestamp = new Date();
    const name = `${tags.includes('liked') ? 'Liked' : 'Saved'} ${timestamp.toLocaleString()}`;
    const canvas = document.querySelector('canvas');
    const thumbnail = canvas ? captureThumbnail(canvas) : undefined;

    await saveShaderToFileDb({
      name,
      code: lastWorkingCode,
      tags: [...new Set([...tags, lastMutationType])],
      generation: historyCount,
      rating: tags.includes('liked') ? 5 : 0,
      thumbnail,
      metadata: { intensity: fuzzConfig.intensity },
    });

    const stats = await getFileDbStats();
    const capability = await getStorageCapability();
    setStorageCapability(capability);
    setLibraryCount(stats.totalCount);
    addLog('success', capability.mode === 'local-file-db'
      ? `[Save] Saved to file DB: ${name}`
      : `[Save] Session saved. Export a bundle for permanence.`);
  };

  const recordTasteAndAdvance = async (label: TasteLabel) => {
    const ratedCode = lastWorkingCode;
    setTasteSamples(prev => [
      { code: ratedCode, label, mode: pipelineMode, timestamp: Date.now() },
      ...prev,
    ].slice(0, MAX_TASTE_SAMPLES));
    saveTasteToFileDb({ code: ratedCode, label, mode: pipelineMode, timestamp: Date.now() }).catch(e => {
      console.error('Failed to save taste sample to file database:', e);
      addLog('warning', '[Taste] File database taste save failed.');
    });

    const labelText = label === 'liked' ? 'liked' : label === 'disliked' ? 'rejected' : 'marked too similar';
    addLog('info', `[Taste] ${labelText}${label === 'liked' ? '.' : '; generating next candidate...'}`);

    try {
      if (label === 'liked') {
        await saveLikedShaderPermanently(ratedCode);
        return;
      }

      setShaderBeforeMutation(ratedCode);
      setLastMutationType(`taste-${label}`);
      const nextSamples = [
        { code: ratedCode, label, mode: pipelineMode, timestamp: Date.now() },
        ...tasteSamples,
      ].slice(0, MAX_TASTE_SAMPLES);
      const result = await generateAutoExplorationCandidate({
        intensity: fuzzConfig.intensity,
        mode: pipelineMode,
        currentCode: ratedCode,
        candidateCount: Math.floor(36 + fuzzConfig.intensity * 56),
        archiveLimit: 40,
        likedCodes: nextSamples.filter(sample => sample.label === 'liked').map(sample => sample.code),
        dislikedCodes: nextSamples.filter(sample => sample.label === 'disliked').map(sample => sample.code),
        tooSimilarCodes: nextSamples.filter(sample => sample.label === 'tooSimilar').map(sample => sample.code),
      });
      setCandidateBackStack(prev => [ratedCode, ...prev].slice(0, 50));
      setPendingCode(result.code);
      setCode(result.code);
      setHistoryCount(prev => prev + 1);
      setLatestCandidateMetrics(result);
      addLog('success', `[Taste] Next candidate selected (${result.selectedIndex + 1}/${result.candidateCount})`);
    } catch (e) {
      addLog('error', `[Taste] Could not advance: ${e}`);
    }
  };

  const handleCursorFuzz = () => {
    try {
      addLog('info', `Generating cursor-reactive variant...`);
      applyScopedTransform('cursor', 'cursor', 'Cursor transform');
    } catch (e) {
      addLog('error', 'Cursor effect fuzzing exception.');
    }
  };

  const handleScrollFuzz = () => {
    try {
      addLog('info', `Generating scroll-reactive variant...`);
      applyScopedTransform('scroll', 'scroll', 'Scroll transform');
    } catch (e) {
      addLog('error', 'Scroll effect fuzzing exception.');
    }
  };

  const handleFragmentFuzz = () => {
    try {
      addLog('info', `Running fragment shader mutation...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('fragment');
      setPipelineMode('fragment');
      const newCode = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), 'fragment', 'fragment');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Fragment mutation applied!');
    } catch (e) {
      addLog('error', 'Fragment fuzzing exception.');
    }
  };

  const handleVertexFuzz = () => {
    try {
      addLog('info', `Running vertex shader mutation...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('vertex');
      setPipelineMode('vertex-fragment');
      const newCode = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), 'vertex-fragment', 'vertex');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Vertex mutation applied!');
    } catch (e) {
      addLog('error', 'Vertex fuzzing exception.');
    }
  };

  const handleComputeFuzz = () => {
    try {
      addLog('info', `Running compute shader mutation...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('compute');
      setPipelineMode('compute');
      const newCode = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), 'compute', 'compute');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Compute mutation applied!');
    } catch (e) {
      addLog('error', 'Compute fuzzing exception.');
    }
  };

  // =============================================
  // RANDOM HANDLERS - Generate fresh shaders
  // =============================================

  const handleRandomMathFuzz = () => {
    try {
      addLog('info', `Generating random math shader...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('random-math');
      // Use mathFuzzShader which generates fresh math-based shaders
      const complexity = 1 + fuzzConfig.intensity * 3; // 1-4 based on intensity
      const newCode = generateIntentShaderV2WithMode(complexity / 4, Date.now(), pipelineMode, 'math');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Random math shader generated!');
    } catch (e) {
      addLog('error', 'Random math generation exception.');
    }
  };

  const handleRandomPhysicsFuzz = () => {
    try {
      addLog('info', `Generating random physics shader...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('random-physics');
      const newCode = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), pipelineMode, 'physics');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Random physics shader generated!');
    } catch (e) {
      addLog('error', 'Random physics generation exception.');
    }
  };

  const handleRandomAestheticFuzz = () => {
    try {
      addLog('info', `Generating random aesthetic shader...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('random-aesthetic');
      const newCode = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), pipelineMode, 'aesthetic');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Random aesthetic shader generated!');
    } catch (e) {
      addLog('error', 'Random aesthetic generation exception.');
    }
  };

  const handleRandomCursorFuzz = () => {
    try {
      addLog('info', `Generating random cursor shader...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('random-cursor');
      const generated = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), pipelineMode, 'cursor');
      const newCode = pipelineMode === 'compute'
        ? generated
        : transformCurrentShader(generated, 'cursor', Math.max(0.45, fuzzConfig.intensity));
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Random cursor shader generated!');
    } catch (e) {
      addLog('error', 'Random cursor generation exception.');
    }
  };

  const handleRandomScrollFuzz = () => {
    try {
      addLog('info', `Generating random scroll shader...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('random-scroll');
      const generated = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), pipelineMode, 'scroll');
      const newCode = pipelineMode === 'compute'
        ? generated
        : transformCurrentShader(generated, 'scroll', Math.max(0.45, fuzzConfig.intensity));
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Random scroll shader generated!');
    } catch (e) {
      addLog('error', 'Random scroll generation exception.');
    }
  };

  const handleRandomFragmentFuzz = () => {
    try {
      addLog('info', `Generating random fragment shader...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('random-fragment');
      // Fragment is just a fresh random shader
      setPipelineMode('fragment');
      const newCode = generateFreshShaderV2WithMode(fuzzConfig.intensity, Date.now(), 'fragment');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Random fragment shader generated!');
    } catch (e) {
      addLog('error', 'Random fragment generation exception.');
    }
  };

  const handleRandomProDesignerFuzz = () => {
    try {
      addLog('info', `Generating random pro designer shader...`);
      setShaderBeforeMutation(lastWorkingCode);
      setLastMutationType('random-prodesigner');
      const newCode = generateIntentShaderV2WithMode(fuzzConfig.intensity, Date.now(), pipelineMode, 'aesthetic');
      setPendingCode(newCode);
      setCode(newCode);
      setHistoryCount(prev => prev + 1);
      addLog('success', 'Random pro designer shader generated!');
    } catch (e) {
      addLog('error', 'Random pro designer generation exception.');
    }
  };

  const handleReset = (presetName: PresetName) => {
    const preset = PRESETS.find(p => p.name === presetName);
    if (preset) {
      setCode(preset.code);
      setLastWorkingCode(preset.code);
      setPendingCode(null);
      addLog('info', `Loaded preset: ${presetName}`);
      setCompileError(null);
    }
  };

  const handleSaveShader = async () => {
    try {
      await saveCurrentShaderToLibrary(['saved']);
    } catch (e) {
      console.error('Failed to save to library:', e);
      addLog('error', 'File DB save failed.');
    }
  };

  const handleBackCandidate = () => {
    const [previous, ...rest] = candidateBackStack;
    if (!previous) {
      addLog('warning', 'No previous candidate.');
      return;
    }
    setCandidateBackStack(rest);
    setShaderBeforeMutation(lastWorkingCode);
    setLastMutationType('back');
    setPendingCode(previous);
    setCode(previous);
    addLog('info', 'Returned to previous candidate.');
  };

  const handleCopyWGSL = async () => {
    await navigator.clipboard.writeText(lastWorkingCode);
    addLog('success', 'Copied WGSL shader.');
  };

  const handleCopyTextEmbed = async () => {
    const snippet = buildStandaloneEmbed({
      shaderCode: lastWorkingCode,
      mode: pipelineMode,
      textEffectMode,
      scrollEffectMode,
    });
    await navigator.clipboard.writeText(snippet);
    addLog('success', pipelineMode === 'fragment'
      ? 'Copied runnable fragment shader embed.'
      : 'Copied embed with explicit fragment-only fallback.');
  };

  const handleDownloadEmbed = () => {
    const html = buildStandaloneEmbed({
      shaderCode: lastWorkingCode,
      mode: pipelineMode,
      textEffectMode,
      scrollEffectMode,
    });
    downloadText(`fuzzaholic-embed-${Date.now()}.html`, html, 'text/html');
    addLog('success', 'Downloaded standalone embed HTML.');
  };

  const handleExportBundle = async () => {
    const [shaders, taste] = await Promise.all([getFileDbShaders(1000), getFileDbTaste()]);
    const source = storageCapability.mode === 'local-file-db' ? 'local-file-db' : 'static-session';
    const bundle = createFuzzaholicBundle(shaders, taste, source);
    downloadText(bundleFilename(), JSON.stringify(bundle, null, 2));
    addLog('success', `Exported bundle with ${shaders.length} shaders and ${taste.length} taste samples.`);
  };

  const handleImportBundleFile = async (file: File) => {
    try {
      const bundle = parseFuzzaholicBundle(await file.text());
      const shaderResult = await importShadersToFileDb(bundle.shaders);
      const tasteCount = await importTasteToFileDb(bundle.tasteSamples);
      const [stats, taste, capability] = await Promise.all([getFileDbStats(), getFileDbTaste(), getStorageCapability()]);
      setStorageCapability(capability);
      setLibraryCount(stats.totalCount);
      setTasteSamples(taste.slice(0, MAX_TASTE_SAMPLES) as TasteSample[]);
      addLog('success', `[Import] ${shaderResult.imported} shaders imported, ${shaderResult.skipped} skipped, ${tasteCount} taste samples loaded.`);
    } catch (error) {
      addLog('error', `[Import] ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (bundleInputRef.current) bundleInputRef.current.value = '';
    }
  };

  const handleLoadFromLibrary = (code: string) => {
    setCode(code);
    setLastWorkingCode(code);
    setPendingCode(null);
    addLog('info', 'Loaded shader from library');
  };

  const tasteCounts = {
    liked: tasteSamples.filter(sample => sample.label === 'liked').length,
    disliked: tasteSamples.filter(sample => sample.label === 'disliked').length,
    tooSimilar: tasteSamples.filter(sample => sample.label === 'tooSimilar').length,
  };
  const modeButtons: { mode: WorkspaceMode; label: string }[] = [
    { mode: 'discover', label: 'Discover' },
    { mode: 'effects', label: 'Effect Studio' },
    { mode: 'library', label: 'Library' },
    { mode: 'export', label: 'Export' },
  ];
  const pipelineButtons: { mode: FuzzMode; label: string }[] = [
    { mode: 'fragment', label: 'Fragment' },
    { mode: 'vertex-fragment', label: 'Vertex' },
    { mode: 'compute', label: 'Compute' },
  ];
  const textEffects: { mode: TextEffectMode; label: string }[] = [
    { mode: 'none', label: 'None' },
    { mode: 'poster', label: 'Poster' },
    { mode: 'extrude', label: 'Extrude' },
    { mode: 'scan', label: 'Scan' },
  ];
  const scrollEffects: { mode: ScrollEffectMode; label: string }[] = [
    { mode: 'none', label: 'Static' },
    { mode: 'viewportExpand', label: 'Viewport Expand' },
    { mode: 'backgroundReveal', label: 'Background Reveal' },
  ];
  const latestLog = logs[logs.length - 1];

  return (
    <div className="min-h-[200vh] w-screen bg-black text-white font-sans">
      <input
        ref={bundleInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) handleImportBundleFile(file);
        }}
      />
      <div className="sticky top-0 h-screen w-screen overflow-hidden bg-black">
        <ShaderCanvas
          shaderCode={code}
          mode={pipelineMode}
          textEffectMode={textEffectMode}
          scrollEffectMode={scrollEffectMode}
          onCompilationError={handleCompilationError}
          onCompilationSuccess={handleCompilationSuccess}
        />

        <header className="absolute left-0 right-0 top-0 z-20 flex h-14 items-center justify-between border-b border-white/10 bg-black/72 px-3 backdrop-blur md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="leading-none">
              <div className="text-lg font-black tracking-tight md:text-2xl">FUZZAHOLIC</div>
              <div className="text-[9px] font-mono uppercase tracking-[0.32em] text-emerald-400">Aetherfuzz live</div>
            </div>
            <div className="hidden h-7 w-px bg-white/10 sm:block" />
            <div className="hidden min-w-0 text-[10px] font-mono uppercase tracking-widest text-zinc-500 md:block">
              {storageCapability.mode === 'local-file-db' && fileDbPath ? <span className="truncate">DB {fileDbPath}</span> : storageCapability.message}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
            <span className={storageCapability.mode === 'local-file-db' ? 'text-emerald-400' : 'text-amber-300'}>
              {storageCapability.mode === 'local-file-db' ? 'Durable' : 'Export only'}
            </span>
            <span className={compileError ? 'text-red-400' : 'text-emerald-400'}>{compileError ? 'Compile fault' : 'Compiling'}</span>
            <span className="hidden text-zinc-600 sm:inline">Epoch {historyCount.toString().padStart(3, '0')}</span>
          </div>
        </header>

        <aside className="absolute bottom-24 left-3 top-16 z-20 hidden w-16 flex-col items-center gap-2 md:flex">
          <button
            onClick={handleBackCandidate}
            disabled={candidateBackStack.length === 0}
            className={`h-12 w-12 border text-lg font-black ${candidateBackStack.length ? 'border-white/20 bg-black/70 text-white hover:bg-white hover:text-black' : 'border-white/10 bg-black/40 text-zinc-700'}`}
            title="Back"
          >
            ←
          </button>
          {candidateBackStack.slice(0, 7).map((_, index) => (
            <div
              key={index}
              className="h-12 w-12 border border-white/10 bg-black/60 p-1"
              title={`Previous candidate ${index + 1}`}
            >
              <div className="h-full w-full bg-[conic-gradient(from_90deg,rgba(16,185,129,.9),rgba(59,130,246,.6),rgba(244,63,94,.7),rgba(16,185,129,.9))] opacity-70" />
            </div>
          ))}
          <div className="mt-auto rotate-180 text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-600 [writing-mode:vertical-rl]">
            Candidates
          </div>
        </aside>

        <main className="absolute inset-x-3 bottom-24 top-28 z-10 md:left-24 md:right-[360px] md:top-16">
          <div className="relative h-full overflow-hidden border border-white/10 bg-black/10 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]">
            <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1">
              {pipelineButtons.map(button => (
                <button
                  key={button.mode}
                  onClick={() => handlePipelineModeChange(button.mode)}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${pipelineMode === button.mode ? 'bg-emerald-400 text-black' : 'bg-black/70 text-zinc-300 hover:bg-white hover:text-black'}`}
                >
                  {button.label}
                </button>
              ))}
            </div>
            <div className="absolute bottom-4 left-4 z-10 max-w-[72%]">
              <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-500">Current candidate</div>
              <div className="mt-1 text-5xl font-black leading-none text-white/80 mix-blend-screen md:text-8xl">
                {historyCount.toString().padStart(3, '0')}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 border border-white/5" />
          </div>
        </main>

        <aside className="absolute bottom-24 right-3 top-16 z-20 hidden w-[336px] flex-col border border-white/10 bg-black/78 backdrop-blur md:flex">
          <nav className="grid grid-cols-2 border-b border-white/10">
            {modeButtons.map(button => (
              <button
                key={button.mode}
                onClick={() => {
                  setWorkspaceMode(button.mode);
                  if (button.mode === 'export') setCodeDockOpen(true);
                }}
                className={`px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest ${workspaceMode === button.mode ? 'bg-white text-black' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
              >
                {button.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {workspaceMode === 'discover' && (
              <div className="space-y-4">
                <button onClick={handleAutoExplore} className="w-full bg-white px-4 py-5 text-left text-2xl font-black uppercase leading-none text-black hover:bg-emerald-300">
                  Next Candidate
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => recordTasteAndAdvance('liked')} className="bg-emerald-500 px-3 py-4 text-sm font-black uppercase text-black hover:bg-emerald-300">Like</button>
                  <button onClick={() => recordTasteAndAdvance('disliked')} className="bg-zinc-850 border border-white/10 px-3 py-4 text-sm font-black uppercase text-white hover:bg-white hover:text-black">Nope</button>
                  <button onClick={() => recordTasteAndAdvance('tooSimilar')} className="bg-amber-500 px-3 py-4 text-sm font-black uppercase text-black hover:bg-amber-300">Similar</button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="border border-white/10 p-3"><div className="text-xl font-black">{tasteCounts.liked}</div><div className="text-[9px] font-mono uppercase text-zinc-500">Liked</div></div>
                  <div className="border border-white/10 p-3"><div className="text-xl font-black">{tasteCounts.disliked}</div><div className="text-[9px] font-mono uppercase text-zinc-500">Nope</div></div>
                  <div className="border border-white/10 p-3"><div className="text-xl font-black">{tasteCounts.tooSimilar}</div><div className="text-[9px] font-mono uppercase text-zinc-500">Similar</div></div>
                </div>
                {latestCandidateMetrics && (
                  <div className="border border-white/10 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Candidate scoring</span>
                      <span className="font-mono text-xs text-emerald-300">{latestCandidateMetrics.selectedIndex + 1}/{latestCandidateMetrics.candidateCount}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-center">
                      {[
                        ['Novel', latestCandidateMetrics.novelty],
                        ['Complex', latestCandidateMetrics.complexity],
                        ['Rest', latestCandidateMetrics.restraint],
                        ['Taste', latestCandidateMetrics.taste],
                        ['Score', latestCandidateMetrics.score],
                      ].map(([label, value]) => (
                        <div key={label as string} className="bg-white/5 p-2">
                          <div className="font-mono text-xs text-white">{Math.round((value as number) * 100)}</div>
                          <div className="text-[8px] font-mono uppercase text-zinc-500">{label as string}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <label className="block">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Search pressure</span>
                    <span className="font-mono text-sm text-emerald-400">{Math.round(fuzzConfig.intensity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="1"
                    step="0.01"
                    value={fuzzConfig.intensity}
                    onChange={e => setFuzzConfig(prev => ({ ...prev, intensity: parseFloat(e.target.value) }))}
                    className="w-full accent-emerald-400"
                  />
                </label>
              </div>
            )}

            {workspaceMode === 'effects' && (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Text shader modes</div>
                  <div className="grid grid-cols-2 gap-2">
                    {textEffects.map(effect => (
                      <button
                        key={effect.mode}
                        onClick={() => setTextEffectMode(effect.mode)}
                        className={`relative h-24 overflow-hidden border p-3 text-left ${textEffectMode === effect.mode ? 'border-white bg-white text-black' : 'border-white/10 bg-zinc-950/80 text-white hover:border-emerald-400'}`}
                      >
                        <div className="absolute inset-x-3 top-4 h-7 bg-[linear-gradient(90deg,rgba(16,185,129,.45),rgba(255,255,255,.18),rgba(59,130,246,.45))]" />
                        {effect.mode === 'extrude' && <div className="absolute inset-x-5 top-8 h-7 translate-x-2 translate-y-2 bg-white/15" />}
                        {effect.mode === 'scan' && <div className="absolute inset-x-3 top-11 h-px bg-white shadow-[0_8px_0_rgba(255,255,255,.45),0_16px_0_rgba(255,255,255,.25)]" />}
                        <span className="absolute bottom-3 left-3 text-xs font-black uppercase tracking-widest">{effect.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Scroll shader modes</div>
                  <div className="space-y-2">
                    {scrollEffects.map(effect => (
                      <button
                        key={effect.mode}
                        onClick={() => setScrollEffectMode(effect.mode)}
                        className={`flex w-full items-center justify-between border px-3 py-3 text-left ${scrollEffectMode === effect.mode ? 'border-white bg-white text-black' : 'border-white/10 bg-zinc-950/80 text-white hover:border-emerald-400'}`}
                      >
                        <span className="text-xs font-black uppercase tracking-widest">{effect.label}</span>
                        <span className="h-8 w-14 border border-current opacity-40" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleCursorFuzz} className="border border-white/10 bg-black px-3 py-3 text-xs font-black uppercase tracking-widest hover:bg-white hover:text-black">Cursor edit</button>
                  <button onClick={handleScrollFuzz} className="border border-white/10 bg-black px-3 py-3 text-xs font-black uppercase tracking-widest hover:bg-white hover:text-black">Scroll edit</button>
                </div>
              </div>
            )}

            {workspaceMode === 'library' && (
              <div className="space-y-4">
                <div className={`border p-3 ${storageCapability.mode === 'local-file-db' ? 'border-emerald-400/40 text-emerald-200' : 'border-amber-400/40 text-amber-200'}`}>
                  <div className="text-[10px] font-black uppercase tracking-widest">Storage</div>
                  <div className="mt-1 text-xs font-mono">{storageCapability.message}</div>
                </div>
                <button onClick={() => setShowLibrary(true)} className="w-full bg-indigo-500 px-4 py-5 text-left text-2xl font-black uppercase leading-none text-white hover:bg-indigo-400">Open Library</button>
                <button onClick={handleSaveShader} className="w-full border border-emerald-400 px-4 py-4 text-left text-sm font-black uppercase tracking-widest text-emerald-300 hover:bg-emerald-400 hover:text-black">Save current</button>
                <button onClick={handleExportBundle} className="w-full border border-white/10 px-4 py-4 text-left text-sm font-black uppercase tracking-widest hover:bg-white hover:text-black">Export Bundle</button>
                <button onClick={() => bundleInputRef.current?.click()} className="w-full border border-white/10 px-4 py-4 text-left text-sm font-black uppercase tracking-widest hover:bg-white hover:text-black">Import Bundle</button>
                <div className="border border-white/10 p-4">
                  <div className="text-3xl font-black">{libraryCount}</div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{storageCapability.mode === 'local-file-db' ? 'Permanent shaders' : 'Session shaders'}</div>
                </div>
              </div>
            )}

            {workspaceMode === 'export' && (
              <div className="space-y-3">
                <button onClick={handleCopyWGSL} className="w-full bg-white px-4 py-4 text-left text-sm font-black uppercase tracking-widest text-black hover:bg-emerald-300">Copy WGSL</button>
                <button onClick={handleCopyTextEmbed} className="w-full border border-white/10 px-4 py-4 text-left text-sm font-black uppercase tracking-widest hover:bg-white hover:text-black">Copy Embed</button>
                <button onClick={handleDownloadEmbed} className="w-full border border-white/10 px-4 py-4 text-left text-sm font-black uppercase tracking-widest hover:bg-white hover:text-black">Download Embed HTML</button>
                <button onClick={handleExportBundle} className="w-full border border-white/10 px-4 py-4 text-left text-sm font-black uppercase tracking-widest hover:bg-white hover:text-black">Export Bundle</button>
                <button onClick={() => setCodeDockOpen(open => !open)} className="w-full border border-white/10 px-4 py-4 text-left text-sm font-black uppercase tracking-widest hover:bg-white hover:text-black">
                  {codeDockOpen ? 'Hide Code Dock' : 'Open Code Dock'}
                </button>
                <button onClick={handleCopyAllErrors} disabled={allErrors.length === 0} className={`w-full border px-4 py-4 text-left text-sm font-black uppercase tracking-widest ${allErrors.length ? 'border-red-500 text-red-300 hover:bg-red-500 hover:text-black' : 'border-white/10 text-zinc-700'}`}>
                  Copy Errors ({allErrors.length})
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-white/10">
            <LogViewer logs={logs.slice(-5)} />
          </div>
        </aside>

        <section className="absolute inset-x-3 bottom-3 z-30 border border-white/10 bg-black/82 p-2 backdrop-blur md:left-24 md:right-[360px]">
          <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
            <button onClick={handleBackCandidate} disabled={candidateBackStack.length === 0} className={`px-3 py-3 text-xs font-black uppercase tracking-widest ${candidateBackStack.length ? 'bg-zinc-900 text-white hover:bg-white hover:text-black' : 'bg-zinc-950 text-zinc-700'}`}>Back</button>
            <button onClick={handleAutoExplore} className="col-span-2 bg-white px-3 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-emerald-300 md:col-span-2">Next</button>
            <button onClick={() => recordTasteAndAdvance('liked')} className="bg-emerald-400 px-3 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-emerald-300">Like</button>
            <button onClick={() => recordTasteAndAdvance('disliked')} className="bg-zinc-800 px-3 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-white hover:text-black">Nope</button>
            <button onClick={() => recordTasteAndAdvance('tooSimilar')} className="bg-amber-400 px-3 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-amber-300">Similar</button>
            <button onClick={handleSaveShader} className="bg-indigo-500 px-3 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-400">Save</button>
            <button onClick={() => { setWorkspaceMode('effects'); setTextEffectMode(textEffectMode === 'none' ? 'poster' : textEffectMode); }} className="bg-zinc-900 px-3 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-white hover:text-black">Text</button>
          </div>
          {latestLog && (
            <div className="mt-2 truncate text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              {latestLog.type}: {latestLog.message}
            </div>
          )}
        </section>

        <div className="absolute left-3 right-3 top-16 z-30 grid grid-cols-4 gap-1 md:hidden">
          {modeButtons.map(button => (
            <button
              key={button.mode}
              onClick={() => {
                setWorkspaceMode(button.mode);
                if (button.mode === 'export') setCodeDockOpen(true);
              }}
              className={`px-2 py-2 text-[9px] font-black uppercase tracking-widest ${workspaceMode === button.mode ? 'bg-white text-black' : 'bg-black/80 text-white'}`}
            >
              {button.label.split(' ')[0]}
            </button>
          ))}
        </div>

        {codeDockOpen && (
          <div className="absolute inset-x-3 bottom-[118px] z-40 h-[42vh] border border-white/10 bg-black shadow-2xl md:left-24 md:right-[360px]">
            <div className="flex h-9 items-center justify-between border-b border-white/10 px-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">WGSL Dock</span>
              <button onClick={() => setCodeDockOpen(false)} className="text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white">Close</button>
            </div>
            <div className="h-[calc(100%-2.25rem)]">
              <Editor code={code} onChange={setCode} error={compileError} />
            </div>
          </div>
        )}
      </div>

      <div className="h-screen bg-black" aria-hidden="true" />

      {showLibrary && (
        <ShaderLibrary
          onLoadShader={handleLoadFromLibrary}
          onClose={() => {
            setShowLibrary(false);
            getFileDbStats().then(stats => setLibraryCount(stats.totalCount));
          }}
          currentShaderCode={code}
        />
      )}
    </div>
  );
};

export default App;
