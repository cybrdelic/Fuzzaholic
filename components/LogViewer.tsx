
import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
}

const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="h-full bg-black flex flex-col font-mono text-[10px] p-4 text-zinc-600 overflow-hidden">
      <div className="flex-grow overflow-y-auto space-y-1 no-scrollbar">
        {logs.length === 0 && <div className="text-zinc-800 italic">_awaiting_input</div>}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 hover:text-zinc-300 transition-colors">
            <span className="opacity-30">{log.timestamp.toLocaleTimeString().split(' ')[0]}</span>
            <span className={`
              font-bold
              ${log.type === 'error' ? 'text-red-600' : ''}
              ${log.type === 'success' ? 'text-emerald-600' : ''}
              ${log.type === 'info' ? 'text-zinc-500' : ''}
            `}>
              {log.type === 'info' ? '>>' : log.type.toUpperCase()}
            </span>
            <span className={log.type === 'error' ? 'text-red-800' : ''}>{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default LogViewer;
