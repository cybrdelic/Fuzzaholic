
import React from 'react';

interface EditorProps {
  code: string;
  onChange: (newCode: string) => void;
  error?: string | null;
}

const Editor: React.FC<EditorProps> = ({ code, onChange, error }) => {
  return (
    <div className="flex flex-col h-full relative group">
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black to-transparent h-4 z-10 pointer-events-none"></div>
      
      <div className="flex-grow relative bg-black">
        <textarea
          className="w-full h-full bg-black text-zinc-400 font-mono text-xs p-8 leading-relaxed outline-none resize-none selection:bg-emerald-900 selection:text-white"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>

      {error && (
        <div className="absolute bottom-4 left-4 right-4 bg-red-500/10 backdrop-blur border-l-2 border-red-500 p-3 shadow-2xl">
          <div className="text-red-500 text-[10px] font-bold uppercase tracking-widest mb-1">Compilation Failure</div>
          <pre className="text-red-300 text-xs font-mono whitespace-pre-wrap">{error}</pre>
        </div>
      )}
    </div>
  );
};

export default Editor;
