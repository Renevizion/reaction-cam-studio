/* @refresh reset */
import { useState, useRef, useCallback } from 'react';

export interface Recording {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  createdAt: Date;
  thumbnail?: string;
}

type RecordingMode = 'video' | 'screen' | null;

interface UseRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  recordingMode: RecordingMode;
  startVideoRecording: (cameraStream: MediaStream) => Promise<void>;
  startScreenRecording: (cameraStream: MediaStream) => Promise<void>;
  stopRecording: () => Promise<Recording | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

export function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const getSupportedMimeType = useCallback(() => {
    const candidates = [
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];

    return candidates.find((type) => MediaRecorder.isTypeSupported(type));
  }, []);

  const startCameraRecording = useCallback(async (cameraStream: MediaStream, mode: RecordingMode) => {
    try {
      chunksRef.current = [];

      const videoTracks = cameraStream.getVideoTracks();
      const audioTracks = cameraStream.getAudioTracks();

      if (videoTracks.length === 0) {
        throw new Error('No camera video track available');
      }

      const recordingStream = new MediaStream([
        ...videoTracks.map((track) => track.clone()),
        ...audioTracks.map((track) => track.clone()),
      ]);

      recordingStreamRef.current = recordingStream;

      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = {};
      if (mimeType) options.mimeType = mimeType;
      // Request high bitrate to avoid laggy/compressed output
      options.videoBitsPerSecond = 8_000_000; // 8 Mbps video for 1080p
      options.audioBitsPerSecond = 256_000;   // 256 kbps audio for clean sound
      const mediaRecorder = new MediaRecorder(recordingStream, options);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);

      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      setRecordingMode(mode);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      throw err;
    }
  }, [getSupportedMimeType]);

  // Camera recording (iPhone/Safari friendly - no screen capture API required)
  const startVideoRecording = useCallback(async (cameraStream: MediaStream) => {
    await startCameraRecording(cameraStream, 'video');
  }, [startCameraRecording]);

  // Kept for API compatibility; currently same behavior as video recording
  const startScreenRecording = useCallback(async (cameraStream: MediaStream) => {
    await startCameraRecording(cameraStream, 'screen');
  }, [startCameraRecording]);

  const stopRecording = useCallback(async (): Promise<Recording | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const currentDuration = duration;

      mediaRecorderRef.current.onstop = () => {
        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
        }

        const blobType =
          chunksRef.current[0]?.type ||
          mediaRecorderRef.current?.mimeType ||
          'video/webm';

        const blob = new Blob(chunksRef.current, { type: blobType });
        const url = URL.createObjectURL(blob);
        
        const recording: Recording = {
          id: `rec-${Date.now()}`,
          blob,
          url,
          duration: currentDuration,
          createdAt: new Date(),
        };

        setIsRecording(false);
        setIsPaused(false);
        setRecordingMode(null);
        resolve(recording);
      };

      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        setIsRecording(false);
        setIsPaused(false);
        setRecordingMode(null);
        resolve(null);
      }
    });
  }, [duration]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRecording]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimeRef.current = Date.now() - (duration * 1000);
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
  }, [isPaused, duration]);

  return {
    isRecording,
    isPaused,
    duration,
    recordingMode,
    startVideoRecording,
    startScreenRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}
