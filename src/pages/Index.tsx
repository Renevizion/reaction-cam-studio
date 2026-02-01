import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Layers, MonitorPlay, Sparkles, Ratio, Volume2, ImageIcon } from 'lucide-react';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { CameraOverlay } from '@/components/CameraOverlay';
import { RecordingControls } from '@/components/RecordingControls';
import { RecordingsGallery } from '@/components/RecordingsGallery';
import { VideoPlayerModal } from '@/components/VideoPlayerModal';
import { UrlInput } from '@/components/UrlInput';
import { SocialOverlay } from '@/components/SocialOverlay';
import { OverlayEditor } from '@/components/OverlayEditor';
import { CountdownOverlay } from '@/components/CountdownOverlay';
import { AspectRatioSelector } from '@/components/AspectRatioSelector';
import { SoundEffectsBoard } from '@/components/SoundEffectsBoard';
import { LogoUploader } from '@/components/LogoUploader';
import { LogoOverlay } from '@/components/LogoOverlay';
import { AudioLevelMeter } from '@/components/AudioLevelMeter';
import { useCamera } from '@/hooks/useCamera';
import { useRecorder, Recording } from '@/hooks/useRecorder';
import { useRecordings } from '@/hooks/useRecordings';
import { useYouTube } from '@/hooks/useYouTube';
import { useOverlays } from '@/hooks/useOverlays';
import { useCountdown } from '@/hooks/useCountdown';
import { useAspectRatio } from '@/hooks/useAspectRatio';
import { useLogo } from '@/hooks/useLogo';
import { toast } from 'sonner';

type ViewMode = 'pip' | 'split';

const Index = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('pip');
  const [showGallery, setShowGallery] = useState(false);
  const [showOverlayEditor, setShowOverlayEditor] = useState(false);
  const [showAspectRatio, setShowAspectRatio] = useState(false);
  const [showSoundEffects, setShowSoundEffects] = useState(false);
  const [showLogoUploader, setShowLogoUploader] = useState(false);
  const [playingRecording, setPlayingRecording] = useState<Recording | null>(null);
  
  const { embedUrl, videoId, setVideoUrl, isValidUrl, error: urlError } = useYouTube();
  const { stream, isActive, startCamera, stopCamera, switchCamera, videoRef, error: cameraError } = useCamera();
  const { isRecording, isPaused, duration, recordingMode, startVideoRecording, startScreenRecording, stopRecording, pauseRecording, resumeRecording } = useRecorder();
  const { recordings, addRecording, deleteRecording, downloadRecording } = useRecordings();
  const overlays = useOverlays();
  const { count, isCountingDown, startCountdown, cancelCountdown } = useCountdown(3);
  const { aspectRatio, currentConfig, changeAspectRatio, presets } = useAspectRatio();
  const logo = useLogo();

  const handleToggleCamera = useCallback(async () => {
    if (isActive) {
      stopCamera();
    } else {
      await startCamera();
    }
  }, [isActive, startCamera, stopCamera]);

  const handleStartVideoRecording = useCallback(async () => {
    if (!stream) {
      toast.error('Please enable your camera first');
      return;
    }
    startCountdown(async () => {
      try {
        await startVideoRecording(stream);
        toast.success('Recording! Make sure to check "Share tab audio"');
      } catch (err) {
        toast.error('Recording cancelled');
      }
    });
  }, [stream, startVideoRecording, startCountdown]);

  const handleStartScreenRecording = useCallback(async () => {
    if (!stream) {
      toast.error('Please enable your camera first');
      return;
    }
    startCountdown(async () => {
      try {
        await startScreenRecording(stream);
        toast.success('Recording! Share audio if you want sound');
      } catch (err) {
        toast.error('Recording cancelled');
      }
    });
  }, [stream, startScreenRecording, startCountdown]);

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
      {/* Header with URL Input */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="safe-area-top px-4 pt-2 pb-2 flex items-center gap-3 z-30"
      >
        <h1 className="text-lg font-bold text-foreground whitespace-nowrap">
          React<span className="text-primary">Cam</span>
        </h1>
        
        {/* URL Input - compact in header */}
        <div className="flex-1 min-w-0">
          <UrlInput onSubmit={setVideoUrl} error={urlError} />
        </div>
        
        <div className="flex items-center gap-1">
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
          
          {/* Aspect ratio button */}
          <button
            onClick={() => setShowAspectRatio(true)}
            className="p-2 rounded-xl bg-secondary text-foreground"
            title="Aspect Ratio"
          >
            <Ratio className="w-5 h-5" />
          </button>
          
          {/* Overlay editor button */}
          <button
            onClick={() => setShowOverlayEditor(true)}
            className={`relative p-2 rounded-xl transition-colors ${
              overlays.hasVisibleOverlays
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground'
            }`}
            title="Social Links"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          
          {/* Logo button */}
          <button
            onClick={() => setShowLogoUploader(true)}
            className={`relative p-2 rounded-xl transition-colors ${
              logo.hasLogo
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground'
            }`}
            title="Logo/Watermark"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          
          {/* Sound effects button */}
          <button
            onClick={() => setShowSoundEffects(true)}
            className="p-2 rounded-xl bg-secondary text-foreground"
            title="Sound Effects"
          >
            <Volume2 className="w-5 h-5" />
          </button>
          
          {/* Gallery button */}
          <button
            onClick={() => setShowGallery(true)}
            className="relative p-2 rounded-xl bg-secondary text-foreground"
            title="Recordings"
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

      {/* Main content area */}
      <div className="flex-1 flex flex-col p-4 pt-2 pb-0 min-h-0">
        {viewMode === 'pip' ? (
          // Picture-in-Picture mode - video container with camera overlay INSIDE
          <div className="flex-1 relative overflow-hidden rounded-2xl mb-28">
            <YouTubePlayer 
              embedUrl={embedUrl}
              videoId={videoId}
              className="absolute inset-0"
            />
            <SocialOverlay settings={overlays.settings} />
            <LogoOverlay config={logo.config} />
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
          <div className="flex-1 flex flex-col gap-3 mb-28 min-h-0">
            <div className="flex-1 min-h-0 relative overflow-hidden rounded-2xl">
              <YouTubePlayer 
                embedUrl={embedUrl}
                videoId={videoId}
                className="absolute inset-0"
              />
              <SocialOverlay settings={overlays.settings} />
              <LogoOverlay config={logo.config} />
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="h-40 rounded-2xl overflow-hidden bg-secondary relative flex-shrink-0"
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

        {/* Audio level meter */}
        <AnimatePresence>
          {isRecording && (
            <div className="absolute bottom-32 left-4 z-30">
              <AudioLevelMeter stream={stream} isRecording={isRecording} />
            </div>
          )}
        </AnimatePresence>

        {/* Recording controls */}
        <RecordingControls
          isRecording={isRecording}
          isPaused={isPaused}
          isCameraActive={isActive}
          duration={duration}
          recordingMode={recordingMode}
          onStartVideoRecording={handleStartVideoRecording}
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

      {/* Overlay editor */}
      <OverlayEditor
        isOpen={showOverlayEditor}
        settings={overlays.settings}
        onClose={() => setShowOverlayEditor(false)}
        onAddSocialLink={overlays.addSocialLink}
        onUpdateSocialLink={overlays.updateSocialLink}
        onRemoveSocialLink={overlays.removeSocialLink}
        onSetPosition={overlays.setPosition}
        onToggleBackground={overlays.toggleBackground}
      />

      {/* Countdown overlay */}
      <CountdownOverlay count={count} />

      {/* Aspect ratio selector */}
      <AspectRatioSelector
        isOpen={showAspectRatio}
        current={aspectRatio}
        onSelect={changeAspectRatio}
        onClose={() => setShowAspectRatio(false)}
      />

      {/* Sound effects board */}
      <SoundEffectsBoard
        isOpen={showSoundEffects}
        onClose={() => setShowSoundEffects(false)}
      />

      {/* Logo uploader */}
      <LogoUploader
        isOpen={showLogoUploader}
        config={logo.config}
        onClose={() => setShowLogoUploader(false)}
        onUpload={logo.uploadLogo}
        onRemove={logo.removeLogo}
        onUpdatePosition={logo.updatePosition}
        onUpdateSize={logo.updateSize}
        onUpdateOpacity={logo.updateOpacity}
      />
    </div>
  );
};

export default Index;
