import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Eye, Home, Loader, Smile, Frown, Hand, Settings } from 'lucide-react';
import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import './BlinkDetection.css';

type GestureType = 'blink' | 'smile' | 'headTilt' | 'eyebrowRaise';
type ResponseType = 'yes' | 'no' | null;

interface GestureConfig {
  type: GestureType;
  name: string;
  description: string;
  icon: JSX.Element;
  yesAction: string;
  noAction: string;
  enabled: boolean;
  threshold: number;
  duration: number;
}

const GestureDetection = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const statusIndicatorRef = useRef<HTMLDivElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [showResponse, setShowResponse] = useState<ResponseType>(null);
  const [detectionState, setDetectionState] = useState<'searching' | 'detected' | 'error'>('searching');
  const [activeGesture, setActiveGesture] = useState<GestureType>('blink');
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [showGestureMenu, setShowGestureMenu] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');
  
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number>();
  
  // Gesture state tracking
  const gestureStateRef = useRef({
    // Blink detection
    isBlinking: false,
    blinkStartTime: 0,
    blinkCounter: 0,
    lastBlinkTime: 0,
    
    // Smile detection
    isSmiling: false,
    smileStartTime: 0,
    smileDetected: false,
    isFrowning: false,
    frownStartTime: 0,
    frownDetected: false,
    
    // Head tilt detection
    headTiltStartTime: 0,
    currentHeadTilt: 'none' as 'left' | 'right' | 'none',
    tiltDetected: false,
    
    // Eyebrow detection
    eyebrowRaiseStartTime: 0,
    isEyebrowRaised: false,
    eyebrowDetected: false,
  });

  const questions = ['Are you hungry?', 'Do you want to play?', 'Are you comfortable?'];
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const userResponsesRef = useRef<Array<'yes' | 'no'>>([]);

  const gestureConfigs: GestureConfig[] = [
    {
      type: 'blink',
      name: 'Eye Blinking',
      description: 'Blink once for YES, twice for NO',
      icon: <Eye className="guide-icon" />,
      yesAction: 'Single Blink',
      noAction: 'Double Blink',
      enabled: true,
      threshold: 0.5,
      duration: 2000
    },
    {
      type: 'smile',
      name: 'Smile Detection',
      description: 'Smile for YES, frown for NO',
      icon: <Smile className="guide-icon" />,
      yesAction: 'Smile (2 sec)',
      noAction: 'Frown (2 sec)',
      enabled: true,
      threshold: 0.3,
      duration: 2000
    },
    {
      type: 'headTilt',
      name: 'Head Tilting',
      description: 'Tilt head left for YES, right for NO',
      icon: <Frown className="guide-icon" />,
      yesAction: 'Tilt Left (2 sec)',
      noAction: 'Tilt Right (2 sec)',
      enabled: true,
      threshold: 0.4,
      duration: 2000
    },
    {
      type: 'eyebrowRaise',
      name: 'Eyebrow Raise',
      description: 'Raise eyebrows for YES',
      icon: <Eye className="guide-icon" />,
      yesAction: 'Raise Eyebrows',
      noAction: 'No Movement',
      enabled: true,
      threshold: 0.3,
      duration: 1500
    }
  ];

  useEffect(() => {
    initializeFaceLandmarker();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (statusIndicatorRef.current) {
      statusIndicatorRef.current.className = `detection-state ${detectionState}`;
    }
  }, [detectionState]);

  const initializeFaceLandmarker = async () => {
    try {
      console.log('Initializing MediaPipe FaceLandmarker...');
      
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      
      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 1
      });
      
      faceLandmarkerRef.current = faceLandmarker;
      console.log('FaceLandmarker initialized successfully');
      
      await setupCamera();
    } catch (error) {
      console.error('Error initializing FaceLandmarker:', error);
      setCameraError('Failed to load face detection model');
      setIsLoading(false);
      setDetectionState('error');
    }
  };

  const setupCamera = async () => {
    try {
      console.log('Setting up camera...');
      
      const constraints = {
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Camera stream obtained');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        videoRef.current.onloadeddata = () => {
          console.log('Video loaded, starting playback');
          videoRef.current?.play().then(() => {
            console.log('Video playback started');
            setIsLoading(false);
            startGestureDetection();
          }).catch(error => {
            console.error('Error playing video:', error);
            setCameraError('Failed to start camera feed');
            setIsLoading(false);
            setDetectionState('error');
          });
        };

        setTimeout(() => {
          if (isLoading) {
            console.log('Fallback: Starting detection after timeout');
            setIsLoading(false);
            startGestureDetection();
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Error setting up camera:', error);
      setCameraError('Camera access denied or not available');
      setIsLoading(false);
      setDetectionState('error');
    }
  };

  const calibrateGesture = async () => {
    setCalibrationMode(true);
    setCalibrationProgress(0);
    
    for (let i = 0; i <= 100; i += 20) {
      setCalibrationProgress(i);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setCalibrationMode(false);
  };

  const detectBlink = (blendshapes: any[], currentTime: number) => {
    const leftEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
    const rightEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
    const avgBlink = (leftEyeBlink + rightEyeBlink) / 2;

    const BLINK_THRESHOLD = 0.5;
    const state = gestureStateRef.current;

    if (avgBlink > BLINK_THRESHOLD && !state.isBlinking) {
      state.isBlinking = true;
      state.blinkStartTime = currentTime;
    } else if (avgBlink < BLINK_THRESHOLD && state.isBlinking) {
      state.isBlinking = false;
      
      const timeSinceLastBlink = currentTime - state.lastBlinkTime;
      
      const DOUBLE_BLINK_MAX_TIME = 1000;
      const SINGLE_BLINK_TIMEOUT = 1200;
      
      if (timeSinceLastBlink < DOUBLE_BLINK_MAX_TIME && state.blinkCounter === 1) {
        state.blinkCounter = 0;
        state.lastBlinkTime = 0;
        handleGestureResponse('no');
      } else {
        state.blinkCounter = 1;
        state.lastBlinkTime = currentTime;
        
        setTimeout(() => {
          if (state.blinkCounter === 1 && Date.now() - currentTime >= SINGLE_BLINK_TIMEOUT) {
            state.blinkCounter = 0;
            state.lastBlinkTime = 0;
            handleGestureResponse('yes');
          }
        }, SINGLE_BLINK_TIMEOUT + 100);
      }
    }
  };

  const detectSmile = (blendshapes: any[], currentTime: number) => {
    // Use the correct blendshape names for MediaPipe
    const mouthSmileLeft = blendshapes.find(b => b.categoryName === 'mouthSmileLeft')?.score || 0;
    const mouthSmileRight = blendshapes.find(b => b.categoryName === 'mouthSmileRight')?.score || 0;
    const mouthFrownLeft = blendshapes.find(b => b.categoryName === 'mouthFrownLeft')?.score || 0;
    const mouthFrownRight = blendshapes.find(b => b.categoryName === 'mouthFrownRight')?.score || 0;
    
    const avgSmile = (mouthSmileLeft + mouthSmileRight) / 2;
    const avgFrown = (mouthFrownLeft + mouthFrownRight) / 2;
    
    const SMILE_THRESHOLD = 0.3;
    const FROWN_THRESHOLD = 0.2;
    const state = gestureStateRef.current;
    const DURATION = 2000;

    // Smile detection for YES
    if (avgSmile > SMILE_THRESHOLD && !state.isSmiling) {
      state.isSmiling = true;
      state.smileStartTime = currentTime;
      state.smileDetected = false;
    } else if (avgSmile > SMILE_THRESHOLD && state.isSmiling && !state.smileDetected) {
      if (currentTime - state.smileStartTime >= DURATION) {
        handleGestureResponse('yes');
        state.smileDetected = true;
      }
    } else if (avgSmile < SMILE_THRESHOLD * 0.7) {
      state.isSmiling = false;
      state.smileDetected = false;
    }

    // Frown detection for NO
    if (avgFrown > FROWN_THRESHOLD && !state.isFrowning) {
      state.isFrowning = true;
      state.frownStartTime = currentTime;
      state.frownDetected = false;
    } else if (avgFrown > FROWN_THRESHOLD && state.isFrowning && !state.frownDetected) {
      if (currentTime - state.frownStartTime >= DURATION) {
        handleGestureResponse('no');
        state.frownDetected = true;
      }
    } else if (avgFrown < FROWN_THRESHOLD * 0.7) {
      state.isFrowning = false;
      state.frownDetected = false;
    }
  };

  const detectHeadTilt = (blendshapes: any[], currentTime: number) => {
    // Use head rotation blendshapes for better tilt detection
    const headLeft = blendshapes.find(b => b.categoryName === 'headRollLeft')?.score || 0;
    const headRight = blendshapes.find(b => b.categoryName === 'headRollRight')?.score || 0;
    
    const TILT_THRESHOLD = 0.4;
    const state = gestureStateRef.current;
    const DURATION = 2000;

    // Detect left tilt (YES)
    if (headLeft > TILT_THRESHOLD && headRight < TILT_THRESHOLD * 0.5) {
      if (state.currentHeadTilt !== 'left') {
        state.currentHeadTilt = 'left';
        state.headTiltStartTime = currentTime;
        state.tiltDetected = false;
      } else if (!state.tiltDetected && currentTime - state.headTiltStartTime >= DURATION) {
        handleGestureResponse('yes');
        state.tiltDetected = true;
      }
    }
    // Detect right tilt (NO)
    else if (headRight > TILT_THRESHOLD && headLeft < TILT_THRESHOLD * 0.5) {
      if (state.currentHeadTilt !== 'right') {
        state.currentHeadTilt = 'right';
        state.headTiltStartTime = currentTime;
        state.tiltDetected = false;
      } else if (!state.tiltDetected && currentTime - state.headTiltStartTime >= DURATION) {
        handleGestureResponse('no');
        state.tiltDetected = true;
      }
    }
    // Reset if no significant tilt
    else {
      state.currentHeadTilt = 'none';
      state.tiltDetected = false;
    }
  };

  const detectEyebrowRaise = (blendshapes: any[], currentTime: number) => {
    // Use eyebrow blendshapes
    const browInnerUp = blendshapes.find(b => b.categoryName === 'browInnerUp')?.score || 0;
    const browOuterUpLeft = blendshapes.find(b => b.categoryName === 'browOuterUpLeft')?.score || 0;
    const browOuterUpRight = blendshapes.find(b => b.categoryName === 'browOuterUpRight')?.score || 0;
    
    const avgBrowRaise = (browInnerUp + browOuterUpLeft + browOuterUpRight) / 3;
    const BROW_THRESHOLD = 0.3;
    const state = gestureStateRef.current;
    const DURATION = 1500;

    if (avgBrowRaise > BROW_THRESHOLD && !state.isEyebrowRaised) {
      state.isEyebrowRaised = true;
      state.eyebrowRaiseStartTime = currentTime;
      state.eyebrowDetected = false;
    } else if (avgBrowRaise > BROW_THRESHOLD && state.isEyebrowRaised && !state.eyebrowDetected) {
      if (currentTime - state.eyebrowRaiseStartTime >= DURATION) {
        handleGestureResponse('yes');
        state.eyebrowDetected = true;
      }
    } else if (avgBrowRaise < BROW_THRESHOLD * 0.7) {
      state.isEyebrowRaised = false;
      state.eyebrowDetected = false;
    }
  };

  const startGestureDetection = () => {
    if (!videoRef.current || !canvasRef.current || !faceLandmarkerRef.current) {
      console.error('Missing required refs for detection');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    console.log('Starting gesture detection loop');

    const detect = async () => {
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      try {
        const results = faceLandmarkerRef.current!.detectForVideo(video, Date.now());

        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
          const blendshapes = results.faceBlendshapes[0].categories;
          
          // Debug: Log available blendshape categories (uncomment for debugging)
          // if (Math.random() < 0.01) { // Log occasionally to avoid spam
          //   console.log('Available blendshapes:', blendshapes.map(b => b.categoryName));
          // }

          if (detectionState !== 'detected') {
            setDetectionState('detected');
          }

          const currentTime = Date.now();

          switch (activeGesture) {
            case 'blink':
              detectBlink(blendshapes, currentTime);
              break;
            case 'smile':
              detectSmile(blendshapes, currentTime);
              break;
            case 'headTilt':
              detectHeadTilt(blendshapes, currentTime);
              break;
            case 'eyebrowRaise':
              detectEyebrowRaise(blendshapes, currentTime);
              break;
            default:
              detectBlink(blendshapes, currentTime);
          }

          // Draw facial landmarks
          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const drawingUtils = new DrawingUtils(ctx);
            const landmarks = results.faceLandmarks[0];
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = `hsl(var(--primary))`;
            ctx.lineWidth = 2;
            
            // Draw face mesh
            drawingUtils.drawConnectors(
              landmarks,
              FaceLandmarker.FACE_LANDMARKS_TESSELATION,
              { color: `hsl(var(--primary) / 0.3)`, lineWidth: 1 }
            );

            // Emphasize relevant features based on active gesture
            if (activeGesture === 'blink') {
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                { color: `hsl(var(--primary))`, lineWidth: 3 }
              );
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                { color: `hsl(var(--primary))`, lineWidth: 3 }
              );
            } else if (activeGesture === 'smile') {
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LIPS,
                { color: `hsl(var(--primary))`, lineWidth: 3 }
              );
            } else if (activeGesture === 'eyebrowRaise') {
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
                { color: `hsl(var(--primary))`, lineWidth: 3 }
              );
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
                { color: `hsl(var(--primary))`, lineWidth: 3 }
              );
            }
          }
        } else {
          if (detectionState !== 'searching') {
            setDetectionState('searching');
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      } catch (error) {
        console.error('Error in detection loop:', error);
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  const moveToNextQuestion = (answer: 'yes' | 'no') => {
    userResponsesRef.current[currentQuestionIndex] = answer;
    const isLastQuestion = currentQuestionIndex >= questions.length - 1;
    if (isLastQuestion) {
      navigate('/');
    } else {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handleGestureResponse = (response: 'yes' | 'no') => {
    setShowResponse(response);
    setTimeout(() => {
      setShowResponse(null);
      moveToNextQuestion(response);
    }, 1500);
  };

  const currentConfig = gestureConfigs.find(g => g.type === activeGesture);

  return (
    <div className="blink-detection-container">
      {isLoading && (
        <div className="loading-screen">
          <Loader className="loading-icon" />
          <p>Initializing Camera...</p>
          <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))' }}>
            Please allow camera permissions
          </p>
        </div>
      )}

      {calibrationMode && (
        <div className="calibration-overlay">
          <div className="calibration-content">
            <Loader className="loading-icon" />
            <h3>Calibrating Gestures...</h3>
            <div className="calibration-progress">
              <div 
                className="calibration-progress-fill" 
                style={{ width: `${calibrationProgress}%` }}
              />
            </div>
            <p>Please hold still while we calibrate...</p>
          </div>
        </div>
      )}

      <div ref={statusIndicatorRef} className="detection-state searching">
        {detectionState === 'searching' && 'Searching for face...'}
        {detectionState === 'detected' && `${currentConfig?.name} - Ready!`}
        {detectionState === 'error' && `Error: ${cameraError}`}
      </div>

      <div className="question-container">
        <div className="progress-indicator">
          <div 
            className="progress-fill" 
            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }} 
          />
        </div>
        <h2 className="current-question">{questions[currentQuestionIndex]}</h2>
        <p className="blink-instruction">
          {currentConfig?.yesAction} for YES, {currentConfig?.noAction} for NO
        </p>
      </div>

      <div className="gesture-selector">
        <button 
          className="gesture-menu-button"
          onClick={() => setShowGestureMenu(!showGestureMenu)}
        >
          <Settings className="guide-icon" />
          Change Gesture
        </button>
        
        {showGestureMenu && (
          <div className="gesture-menu">
            {gestureConfigs.filter(config => config.enabled).map((config) => (
              <button
                key={config.type}
                className={`gesture-menu-item ${activeGesture === config.type ? 'active' : ''}`}
                onClick={() => {
                  setActiveGesture(config.type);
                  setShowGestureMenu(false);
                  // Reset gesture state when changing gestures
                  gestureStateRef.current = {
                    isBlinking: false,
                    blinkStartTime: 0,
                    blinkCounter: 0,
                    lastBlinkTime: 0,
                    isSmiling: false,
                    smileStartTime: 0,
                    smileDetected: false,
                    isFrowning: false,
                    frownStartTime: 0,
                    frownDetected: false,
                    headTiltStartTime: 0,
                    currentHeadTilt: 'none',
                    tiltDetected: false,
                    eyebrowRaiseStartTime: 0,
                    isEyebrowRaised: false,
                    eyebrowDetected: false,
                  };
                }}
              >
                {config.icon}
                <div>
                  <h4>{config.name}</h4>
                  <p>{config.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={cameraContainerRef} className="camera-container">
        <video 
          ref={videoRef}
          className="camera-feed"
          autoPlay
          playsInline
          muted
        />
        <canvas 
          ref={canvasRef}
          className="detection-overlay"
        />
        
        {showResponse && (
          <div className="response-display">
            {showResponse === 'yes' ? (
              <div className="response-yes">
                <Check className="response-icon" />
                <h2>YES!</h2>
                <p>Gesture detected: {currentConfig?.yesAction}</p>
              </div>
            ) : (
              <div className="response-no">
                <X className="response-icon" />
                <h2>NO!</h2>
                <p>Gesture detected: {currentConfig?.noAction}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="guide-container">
        <div className="current-gesture-guide">
          <h3>Current: {currentConfig?.name}</h3>
          <div className="gesture-actions">
            <div className="guide-item">
              <Check className="guide-icon" style={{ color: 'hsl(var(--success))' }} />
              <div>
                <h3>YES: {currentConfig?.yesAction}</h3>
                <p>{currentConfig?.type === 'blink' ? 'One clear blink' : `Hold for ${currentConfig?.duration}ms`}</p>
              </div>
            </div>
            <div className="guide-item">
              <X className="guide-icon" style={{ color: 'hsl(var(--error))' }} />
              <div>
                <h3>NO: {currentConfig?.noAction}</h3>
                <p>{currentConfig?.type === 'blink' ? 'Two slower blinks' : `Hold for ${currentConfig?.duration}ms`}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="navigation-controls">
        <button 
          className="navigation-home"
          onClick={() => navigate('/')}
        >
          <Home className="home-svg-icon" />
        </button>
        
        <button 
          className="calibrate-button"
          onClick={calibrateGesture}
        >
          <Loader className="guide-icon" />
          Calibrate
        </button>
      </div>
    </div>
  );
};

export default GestureDetection;