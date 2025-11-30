
export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
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
