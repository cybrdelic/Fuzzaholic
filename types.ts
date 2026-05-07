
export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  shaderCode?: string; // Optional: store shader code that caused error
}

export interface CompilationError {
  epoch: number;
  timestamp: Date;
  error: string;
  shaderCodeBefore: string;  // Original shader BEFORE mutation
  shaderCodeAfter: string;   // Resulting shader AFTER mutation (the one that failed)
  mutationType?: string;     // Which mutation button was clicked
}

export interface FuzzConfig {
  mutateNumbers: boolean;
  mutateOperators: boolean;
  mutateBuiltins: boolean;
  mutateGeometry: boolean; // Coordinate space warping (UVs)
  mutateColor: boolean;    // Color palette and post-processing
  mutateChaos: boolean;    // Random code injection and structural changes
  mutateStructure: boolean; // NEW: Ability to completely replace the visual algorithm
  intensity: number;       // 0 to 1
}

export type PresetName = 'Triangle' | 'Gradient' | 'Plasma' | 'Grid';

export interface ShaderPreset {
  name: PresetName;
  code: string;
}

export type FuzzMode = 'fragment' | 'vertex-fragment' | 'compute';

export type TextEffectMode = 'none' | 'poster' | 'extrude' | 'scan';

export type ScrollEffectMode = 'none' | 'viewportExpand' | 'backgroundReveal';
