import { useState, useCallback, useEffect } from 'react';
import { Recording } from './useRecorder';
import { saveRecording, loadRecordings, removeRecording } from './useRecordingsStore';

const formatStamp = (d: Date) => {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

const extFor = (blob: Blob) => {
  const t = blob.type || '';
  if (t.includes('mp4')) return 'mp4';
  if (t.includes('webm')) return 'webm';
  return 'webm';
};

export function useRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);

  // Hydrate from IndexedDB on mount so recordings survive refresh.
  useEffect(() => {
    let cancelled = false;
    loadRecordings().then((recs) => {
      if (!cancelled) setRecordings(recs);
    });
    return () => { cancelled = true; };
  }, []);

  const addRecording = useCallback((recording: Recording) => {
    setRecordings(prev => [recording, ...prev]);
    void saveRecording(recording);
  }, []);

  const deleteRecording = useCallback((id: string) => {
    setRecordings(prev => {
      const recording = prev.find(r => r.id === id);
      if (recording) {
        URL.revokeObjectURL(recording.url);
      }
      return prev.filter(r => r.id !== id);
    });
    void removeRecording(id);
  }, []);

  const downloadRecording = useCallback((recording: Recording) => {
    const ext = extFor(recording.blob);
    const stamp = formatStamp(recording.createdAt);
    const a = document.createElement('a');
    a.href = recording.url;
    a.download = `scriptcam-${stamp}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const shareRecording = useCallback(async (recording: Recording): Promise<boolean> => {
    const ext = extFor(recording.blob);
    const stamp = formatStamp(recording.createdAt);
    const filename = `scriptcam-${stamp}.${ext}`;
    const file = new File([recording.blob], filename, { type: recording.blob.type });

    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'My ScriptCam recording',
          text: 'Recorded with ScriptCam',
        });
        return true;
      } catch (err) {
        // user cancelled or share failed
        return false;
      }
    }
    // Fallback: trigger download so the user can post manually
    downloadRecording(recording);
    return false;
  }, [downloadRecording]);

  return {
    recordings,
    addRecording,
    deleteRecording,
    downloadRecording,
    shareRecording,
  };
}
