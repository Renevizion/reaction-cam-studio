import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Sparkles, Ratio, Volume2, ImageIcon, FileText } from 'lucide-react';
import { CameraOverlay } from '@/components/CameraOverlay';
import { TeleprompterOverlay } from '@/components/TeleprompterOverlay';
import { TeleprompterEditor } from '@/components/TeleprompterEditor';
import { RecordingControls } from '@/components/RecordingControls';
import { RecordingsGallery } from '@/components/RecordingsGallery';
import { VideoPlayerModal } from '@/components/VideoPlayerModal';
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
import { useOverlays } from '@/hooks/useOverlays';
import { useCountdown } from '@/hooks/useCountdown';
import { useAspectRatio } from '@/hooks/useAspectRatio';
import { useLogo } from '@/hooks/useLogo';
import { useTeleprompter } from '@/hooks/useTeleprompter';
import { toast } from 'sonner';

const Index = () => {
  const [showGallery, setShowGallery] = useState(false);
  const [showOverlayEditor, setShowOverlayEditor] = useState(false);
  const [showAspectRatio, setShowAspectRatio] = useState(false);
  const [showSoundEffects, setShowSoundEffects] = useState(false);
  const [showLogoUploader, setShowLogoUploader] = useState(false);
  const [showTeleprompterEditor, setShowTeleprompterEditor] = useState(false);
  const [playingRecording, setPlayingRecording] = useState<Recording | null>(null);
  
  const { stream, isActive, startCamera, stopCamera, switchCamera, videoRef, error: cameraError } = useCamera();
  const { isRecording, isPaused, duration, recordingMode, startVideoRecording, startScreenRecording, stopRecording, pauseRecording, resumeRecording } = useRecorder();
  const { recordings, addRecording, deleteRecording, downloadRecording } = useRecordings();
  const overlays = useOverlays();
  const { count, isCountingDown, startCountdown, cancelCountdown } = useCountdown(3);
  const { aspectRatio, currentConfig, changeAspectRatio, presets } = useAspectRatio();
  const logo = useLogo();
  const teleprompter = useTeleprompter();

  const handleToggleCamera = useCallback(async () => {
    if (isActive) {
      stopCamera();
    } else {
      await startCamera();
    }
  }, [isActive, startCamera, stopCamera]);

  const handleStartRecording = useCallback(async () => {
    if (!stream) {
      toast.error('Please enable your camera first');
      return;
    }
    startCountdown(async () => {
      try {
        await startVideoRecording(stream);
        toast.success('Recording started!');
      } catch (err) {
        toast.error('Recording cancelled');
      }
    });
  }, [stream, startVideoRecording, startCountdown]);

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
        className="safe-area-top px-4 pt-2 pb-2 flex items-center gap-3 z-30"
      >
        <h1 className="text-lg font-bold text-foreground whitespace-nowrap">
          Script<span className="text-primary">Cam</span>
        </h1>
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-1">
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
          
          {/* Script/Teleprompter button */}
          <button
            onClick={() => setShowTeleprompterEditor(true)}
            className={`relative p-2 rounded-xl transition-colors ${
              teleprompter.hasScript
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground'
            }`}
            title="Script / Teleprompter"
          >
            <FileText className="w-5 h-5" />
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

      {/* Main content — full camera view */}
      <div className="flex-1 flex flex-col p-4 pt-2 pb-0 min-h-0">
        <div className="flex-1 flex items-center justify-center mb-28">
          <div 
            className="relative overflow-hidden rounded-2xl bg-secondary w-full h-full max-w-full max-h-full"
            style={{ aspectRatio: currentConfig.ratio }}
          >
            {/* Full-screen camera feed */}
            {isActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                  <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <p className="text-muted-foreground text-sm">
                  Enable your camera to get started
                </p>
              </div>
            )}

            {/* Overlays on top of camera */}
            <SocialOverlay settings={overlays.settings} />
            <LogoOverlay config={logo.config} />
            <TeleprompterOverlay
              state={teleprompter.state}
              scrollRef={teleprompter.scrollRef}
              onToggleAutoScroll={teleprompter.toggleAutoScroll}
              onResetScroll={teleprompter.resetScroll}
              onSetScrollSpeed={teleprompter.setScrollSpeed}
              onSetFontSize={teleprompter.setFontSize}
            />
          </div>
        </div>

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
          onStartVideoRecording={handleStartRecording}
          onStartScreenRecording={handleStartRecording}
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

      {/* Teleprompter editor */}
      <TeleprompterEditor
        isOpen={showTeleprompterEditor}
        script={teleprompter.state.script}
        onClose={() => setShowTeleprompterEditor(false)}
        onSave={teleprompter.setScript}
        onShow={teleprompter.show}
      />
    </div>
  );
};

export default Index;
