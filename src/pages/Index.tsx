import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Layers, MonitorPlay } from 'lucide-react';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { CameraOverlay } from '@/components/CameraOverlay';
import { RecordingControls } from '@/components/RecordingControls';
import { RecordingsGallery } from '@/components/RecordingsGallery';
import { VideoPlayerModal } from '@/components/VideoPlayerModal';
import { UrlInput } from '@/components/UrlInput';
import { useCamera } from '@/hooks/useCamera';
import { useRecorder, Recording } from '@/hooks/useRecorder';
import { useRecordings } from '@/hooks/useRecordings';
import { useYouTube } from '@/hooks/useYouTube';
import { toast } from 'sonner';

type ViewMode = 'pip' | 'split';

const Index = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('pip');
  const [showGallery, setShowGallery] = useState(false);
  const [playingRecording, setPlayingRecording] = useState<Recording | null>(null);
  
  const { embedUrl, videoId, setVideoUrl, isValidUrl, error: urlError } = useYouTube();
  const { stream, isActive, startCamera, stopCamera, switchCamera, videoRef, error: cameraError } = useCamera();
  const { isRecording, isPaused, duration, recordingMode, startCameraRecording, startScreenRecording, stopRecording, pauseRecording, resumeRecording } = useRecorder();
  const { recordings, addRecording, deleteRecording, downloadRecording } = useRecordings();

  const handleToggleCamera = useCallback(async () => {
    if (isActive) {
      stopCamera();
    } else {
      await startCamera();
    }
  }, [isActive, startCamera, stopCamera]);

  const handleStartCameraRecording = useCallback(async () => {
    if (!stream) {
      toast.error('Please enable your camera first');
      return;
    }
    try {
      await startCameraRecording(stream);
      toast.success('Recording started!');
    } catch (err) {
      toast.error('Failed to start recording');
    }
  }, [stream, startCameraRecording]);

  const handleStartScreenRecording = useCallback(async () => {
    if (!stream) {
      toast.error('Please enable your camera first');
      return;
    }
    try {
      await startScreenRecording(stream);
      toast.success('Recording started - share this tab to capture your reaction!');
    } catch (err) {
      toast.error('Screen sharing was cancelled or denied');
    }
  }, [stream, startScreenRecording]);

  const handleStopRecording = useCallback(async () => {
    const recording = await stopRecording();
    if (recording) {
      addRecording(recording);
      toast.success('Recording saved!');
    }
  }, [stopRecording, addRecording]);

  const handlePlay = (recording: Recording) => {
    setPlayingRecording(recording);
  };

  const handleDelete = (id: string) => {
    deleteRecording(id);
    toast.success('Recording deleted');
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="safe-area-top px-4 pt-2 pb-4 flex items-center justify-between z-30"
      >
        <h1 className="text-xl font-bold text-foreground">
          React<span className="text-primary">Cam</span>
        </h1>
        
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl bg-secondary">
            <button
              onClick={() => setViewMode('pip')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'pip' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'split' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MonitorPlay className="w-5 h-5" />
            </button>
          </div>
          
          {/* Gallery button */}
          <button
            onClick={() => setShowGallery(true)}
            className="relative p-2 rounded-xl bg-secondary text-foreground"
          >
            <FolderOpen className="w-5 h-5" />
            {recordings.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                {recordings.length}
              </span>
            )}
          </button>
        </div>
      </motion.header>

      {/* URL Input */}
      <div className="px-4 pb-4 z-20">
        <UrlInput onSubmit={setVideoUrl} error={urlError} />
      </div>

      {/* Main content area */}
      <div className="flex-1 relative overflow-hidden">
        {viewMode === 'pip' ? (
          // Picture-in-Picture mode
          <div className="relative h-full">
            <YouTubePlayer 
              embedUrl={embedUrl}
              videoId={videoId}
              className="absolute inset-4 bottom-32"
            />
            <AnimatePresence>
              <CameraOverlay
                videoRef={videoRef}
                isActive={isActive}
                onSwitchCamera={switchCamera}
              />
            </AnimatePresence>
          </div>
        ) : (
          // Split view mode
          <div className="h-full flex flex-col p-4 gap-4 pb-32">
            <YouTubePlayer 
              embedUrl={embedUrl}
              videoId={videoId}
              className="flex-1 min-h-0"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="h-48 rounded-2xl overflow-hidden bg-secondary relative"
            >
              {isActive ? (
                <video
                  ref={viewMode === 'split' ? videoRef : undefined}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-muted-foreground text-sm">
                    Camera preview will appear here
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* Recording controls */}
        <RecordingControls
          isRecording={isRecording}
          isPaused={isPaused}
          isCameraActive={isActive}
          duration={duration}
          recordingMode={recordingMode}
          onStartCameraRecording={handleStartCameraRecording}
          onStartScreenRecording={handleStartScreenRecording}
          onStopRecording={handleStopRecording}
          onPauseRecording={pauseRecording}
          onResumeRecording={resumeRecording}
          onToggleCamera={handleToggleCamera}
        />
      </div>

      {/* Camera error toast */}
      {cameraError && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-40 left-4 right-4 p-4 rounded-2xl bg-destructive/20 border border-destructive/30 z-40"
        >
          <p className="text-destructive text-sm text-center">{cameraError}</p>
        </motion.div>
      )}

      {/* Recordings gallery */}
      <RecordingsGallery
        isOpen={showGallery}
        recordings={recordings}
        onClose={() => setShowGallery(false)}
        onPlay={handlePlay}
        onDelete={handleDelete}
        onDownload={downloadRecording}
      />

      {/* Video player modal */}
      <VideoPlayerModal
        recording={playingRecording}
        onClose={() => setPlayingRecording(null)}
      />
    </div>
  );
};

export default Index;
