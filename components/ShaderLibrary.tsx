/**
 * SHADER LIBRARY COMPONENT
 *
 * UI for browsing, searching, and managing saved shaders.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    downloadShaderAsWGSL,
    ShaderStats,
    StoredShader,
} from '../services/shaderStorage';
import { deleteFileDbShader, getFileDbShaders, getFileDbStats, getFileDbTaste, getStorageCapability, importShadersToFileDb, importTasteToFileDb, updateFileDbShaderRating } from '../services/fileShaderDb';
import { bundleFilename, createFuzzaholicBundle, downloadText, parseFuzzaholicBundle } from '../services/shaderBundle';

// ============================================================================
// TYPES
// ============================================================================

interface ShaderLibraryProps {
  onLoadShader: (code: string) => void;
  onClose: () => void;
  currentShaderCode?: string;
}

type ViewMode = 'recent' | 'top-rated' | 'all' | 'search';

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '1200px',
    height: '80%',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    border: '1px solid #333',
  },
  header: {
    padding: '20px',
    borderBottom: '1px solid #333',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    color: '#fff',
    fontSize: '24px',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '28px',
    cursor: 'pointer',
    padding: '0 10px',
  },
  toolbar: {
    padding: '15px 20px',
    borderBottom: '1px solid #333',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  viewButton: (active: boolean) => ({
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: active ? '#4a4a8a' : '#2a2a4a',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  }),
  searchInput: {
    flex: 1,
    minWidth: '200px',
    padding: '10px 15px',
    borderRadius: '6px',
    border: '1px solid #444',
    backgroundColor: '#2a2a4a',
    color: '#fff',
    fontSize: '14px',
  },
  exportButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#3a6a3a',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '20px',
  },
  card: {
    backgroundColor: '#2a2a4a',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  cardHover: {
    transform: 'translateY(-4px)',
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
  },
  thumbnail: {
    width: '100%',
    height: '150px',
    backgroundColor: '#1a1a2e',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  },
  cardContent: {
    padding: '15px',
  },
  cardTitle: {
    margin: '0 0 8px 0',
    color: '#fff',
    fontSize: '16px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardMeta: {
    color: '#888',
    fontSize: '12px',
    marginBottom: '8px',
  },
  cardTags: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '5px',
  },
  tag: {
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: '#3a3a6a',
    color: '#aaa',
    fontSize: '11px',
  },
  rating: {
    display: 'flex',
    gap: '3px',
    marginTop: '10px',
  },
  star: (filled: boolean) => ({
    color: filled ? '#ffd700' : '#444',
    cursor: 'pointer',
    fontSize: '18px',
  }),
  cardActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
  },
  actionButton: {
    padding: '5px 10px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#3a3a6a',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  },
  deleteButton: {
    padding: '5px 10px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#6a3a3a',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  },
  stats: {
    padding: '15px 20px',
    borderTop: '1px solid #333',
    display: 'flex',
    gap: '30px',
    color: '#888',
    fontSize: '13px',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statValue: {
    color: '#fff',
    fontWeight: 'bold' as const,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '60px 20px',
    color: '#666',
  },
};

// ============================================================================
// COMPONENTS
// ============================================================================

const ShaderCard: React.FC<{
  shader: StoredShader;
  onLoad: () => void;
  onRate: (rating: number) => void;
  onDelete: () => void;
  onDownload: () => void;
}> = ({ shader, onLoad, onRate, onDelete, onDownload }) => {
  const [hover, setHover] = useState(false);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  return (
    <div
      style={{ ...styles.card, ...(hover ? styles.cardHover : {}) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onLoad}
    >
      <div
        style={{
          ...styles.thumbnail,
          backgroundImage: shader.thumbnail ? `url(${shader.thumbnail})` : undefined,
        }}
      />
      <div style={styles.cardContent}>
        <h3 style={styles.cardTitle}>{shader.name}</h3>
        <div style={styles.cardMeta}>
          {formatDate(shader.timestamp)} • Gen {shader.generation}
          {shader.metadata.equation && ` • ${shader.metadata.equation}`}
        </div>
        {shader.tags.length > 0 && (
          <div style={styles.cardTags}>
            {shader.tags.slice(0, 3).map((tag, i) => (
              <span key={i} style={styles.tag}>{tag}</span>
            ))}
          </div>
        )}
        <div style={styles.rating} onClick={(e) => e.stopPropagation()}>
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={star}
              style={styles.star(star <= shader.rating)}
              onClick={() => onRate(star)}
            >
              ★
            </span>
          ))}
        </div>
        <div style={styles.cardActions} onClick={(e) => e.stopPropagation()}>
          <button style={styles.actionButton} onClick={onDownload}>
            ↓ WGSL
          </button>
          <button style={styles.deleteButton} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ShaderLibrary: React.FC<ShaderLibraryProps> = ({
  onLoadShader,
  onClose,
}) => {
  const [shaders, setShaders] = useState<StoredShader[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<ShaderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const loadShaders = useCallback(async () => {
    setLoading(true);
    try {
      let result: StoredShader[];

      switch (viewMode) {
        case 'recent':
          result = await getFileDbShaders(50);
          break;
        case 'top-rated':
          result = (await getFileDbShaders(200))
            .filter(shader => shader.rating > 0)
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 50);
          break;
        case 'search':
          result = (await getFileDbShaders(200)).filter(shader =>
            !searchQuery ||
            shader.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            shader.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
          );
          break;
        default:
          result = await getFileDbShaders(200);
      }

      setShaders(result);

      // Load stats
      const statsData = await getFileDbStats();
      setStats(statsData);
    } catch (e) {
      console.error('Failed to load shaders:', e);
    } finally {
      setLoading(false);
    }
  }, [viewMode, searchQuery]);

  useEffect(() => {
    loadShaders();
  }, [loadShaders]);

  const handleRate = async (shader: StoredShader, rating: number) => {
    const updated = { ...shader, rating };
    await updateFileDbShaderRating(updated.id, updated.rating);
    loadShaders();
  };

  const handleDelete = async (shader: StoredShader) => {
    if (window.confirm(`Delete "${shader.name}"?`)) {
      await deleteFileDbShader(shader.id);
      loadShaders();
    }
  };

  const handleDownload = (shader: StoredShader) => {
    downloadShaderAsWGSL(shader);
  };

  const handleExportAll = async () => {
    const [allShaders, taste, capability] = await Promise.all([
      getFileDbShaders(1000),
      getFileDbTaste(),
      getStorageCapability(),
    ]);
    const bundle = createFuzzaholicBundle(
      allShaders,
      taste,
      capability.mode === 'local-file-db' ? 'local-file-db' : 'static-session'
    );
    downloadText(bundleFilename(), JSON.stringify(bundle, null, 2));
  };

  const handleImportBundle = async (file: File) => {
    const bundle = parseFuzzaholicBundle(await file.text());
    await importShadersToFileDb(bundle.shaders);
    await importTasteToFileDb(bundle.tasteSamples);
    await loadShaders();
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleLoad = (shader: StoredShader) => {
    onLoadShader(shader.code);
    onClose();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setViewMode('search');
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>🎨 Shader Library</h2>
          <button style={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div style={styles.toolbar}>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) handleImportBundle(file).catch(error => console.error('Bundle import failed:', error));
            }}
          />
          <button
            style={styles.viewButton(viewMode === 'recent')}
            onClick={() => setViewMode('recent')}
          >
            Recent
          </button>
          <button
            style={styles.viewButton(viewMode === 'top-rated')}
            onClick={() => setViewMode('top-rated')}
          >
            Top Rated
          </button>
          <button
            style={styles.viewButton(viewMode === 'all')}
            onClick={() => setViewMode('all')}
          >
            All
          </button>
          <input
            type="text"
            placeholder="Search shaders..."
            value={searchQuery}
            onChange={handleSearchChange}
            style={styles.searchInput}
          />
          <button style={styles.exportButton} onClick={handleExportAll}>
            Export Bundle
          </button>
          <button style={styles.exportButton} onClick={() => importInputRef.current?.click()}>
            Import Bundle
          </button>
        </div>

        <div style={styles.content}>
          {loading ? (
            <div style={styles.emptyState}>Loading...</div>
          ) : shaders.length === 0 ? (
            <div style={styles.emptyState}>
              <h3>No shaders saved yet</h3>
              <p>Click "Save" on a shader you like to add it to your library!</p>
            </div>
          ) : (
            <div style={styles.grid}>
              {shaders.map((shader) => (
                <ShaderCard
                  key={shader.id}
                  shader={shader}
                  onLoad={() => handleLoad(shader)}
                  onRate={(rating) => handleRate(shader, rating)}
                  onDelete={() => handleDelete(shader)}
                  onDownload={() => handleDownload(shader)}
                />
              ))}
            </div>
          )}
        </div>

        {stats && (
          <div style={styles.stats}>
            <div style={styles.statItem}>
              <span>Total:</span>
              <span style={styles.statValue}>{stats.totalCount}</span>
            </div>
            <div style={styles.statItem}>
              <span>Rated:</span>
              <span style={styles.statValue}>{stats.ratedCount}</span>
            </div>
            <div style={styles.statItem}>
              <span>Avg Rating:</span>
              <span style={styles.statValue}>{stats.averageRating.toFixed(1)} ★</span>
            </div>
            {stats.topTags.length > 0 && (
              <div style={styles.statItem}>
                <span>Top Tags:</span>
                <span style={styles.statValue}>
                  {stats.topTags.slice(0, 3).map(t => t.tag).join(', ')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShaderLibrary;
