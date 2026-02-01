import { useState, useCallback } from 'react';
import { Recording } from './useRecorder';

const STORAGE_KEY = 'reaction-recordings';

export function useRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>(() => {
    // Note: We only store metadata, not the actual blobs in localStorage
    // In a real app, you'd use IndexedDB or cloud storage
    return [];
  });

  const addRecording = useCallback((recording: Recording) => {
    setRecordings(prev => [recording, ...prev]);
  }, []);

  const deleteRecording = useCallback((id: string) => {
    setRecordings(prev => {
      const recording = prev.find(r => r.id === id);
      if (recording) {
        URL.revokeObjectURL(recording.url);
      }
      return prev.filter(r => r.id !== id);
    });
  }, []);

  const downloadRecording = useCallback((recording: Recording) => {
    const a = document.createElement('a');
    a.href = recording.url;
    a.download = `reaction-${recording.id}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  return {
    recordings,
    addRecording,
    deleteRecording,
    downloadRecording,
  };
}
