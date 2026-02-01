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
  const screenStreamRef = useRef<MediaStream | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Camera + Video recording (captures this tab with YouTube + camera overlay)
  const startVideoRecording = useCallback(async (cameraStream: MediaStream) => {
    try {
      chunksRef.current = [];
      
      // Capture THIS TAB - preferCurrentTab makes it auto-select current tab in Chrome
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
        },
        audio: true, // Capture system audio (YouTube audio)
        // @ts-ignore - preferCurrentTab is a newer API
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      });
      
      screenStreamRef.current = screenStream;
      
      // Combine screen video with camera audio (mic)
      const audioTracks = cameraStream.getAudioTracks();
      const screenAudioTracks = screenStream.getAudioTracks();
      const videoTracks = screenStream.getVideoTracks();
      
      // Create AudioContext to mix both audio sources
      if (audioContextRef.current) {
        try {
          await audioContextRef.current.close();
        } catch {
          // ignore
        }
      }
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const destination = audioContext.createMediaStreamDestination();
      
      // Add microphone audio
      if (audioTracks.length > 0) {
        const micSource = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
        micSource.connect(destination);
      }
      
      // Add system/YouTube audio
      if (screenAudioTracks.length > 0) {
        const systemSource = audioContext.createMediaStreamSource(new MediaStream(screenAudioTracks));
        systemSource.connect(destination);
      }
      
      // Combine video from screen and mixed audio
      const combinedStream = new MediaStream([
        ...videoTracks,
        ...destination.stream.getAudioTracks(),
      ]);
      
      combinedStreamRef.current = combinedStream;
      
      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';
      
      const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // Handle when user stops screen sharing via browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      setRecordingMode('video');
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error('Failed to start video recording:', err);
      throw err;
    }
  }, []);

  // Screen recording for reacting to ANY screen/window (not just this tab)
  const startScreenRecording = useCallback(async (cameraStream: MediaStream) => {
    try {
      chunksRef.current = [];
      
      // Show full screen picker - lets user choose any window/screen
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      
      screenStreamRef.current = screenStream;
      
      // Combine screen video with camera audio (mic)
      const audioTracks = cameraStream.getAudioTracks();
      const screenAudioTracks = screenStream.getAudioTracks();
      const videoTracks = screenStream.getVideoTracks();
      
      // Create AudioContext to mix both audio sources
      if (audioContextRef.current) {
        try {
          await audioContextRef.current.close();
        } catch {
          // ignore
        }
      }
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const destination = audioContext.createMediaStreamDestination();
      
      // Add microphone audio
      if (audioTracks.length > 0) {
        const micSource = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
        micSource.connect(destination);
      }
      
      // Add system/YouTube audio
      if (screenAudioTracks.length > 0) {
        const systemSource = audioContext.createMediaStreamSource(new MediaStream(screenAudioTracks));
        systemSource.connect(destination);
      }
      
      // Combine video from screen and mixed audio
      const combinedStream = new MediaStream([
        ...videoTracks,
        ...destination.stream.getAudioTracks(),
      ]);
      
      combinedStreamRef.current = combinedStream;
      
      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';
      
      const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // Handle when user stops screen sharing via browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      setRecordingMode('screen');
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error('Failed to start screen recording:', err);
      throw err;
    }
  }, []);

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
        // Stop all screen capture tracks
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
        }
        if (combinedStreamRef.current) {
          combinedStreamRef.current.getTracks().forEach(track => track.stop());
          combinedStreamRef.current = null;
        }

        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => undefined);
          audioContextRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
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
