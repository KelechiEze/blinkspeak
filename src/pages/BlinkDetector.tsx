import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Eye, Home, Loader } from 'lucide-react';
import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import './BlinkDetection.css';

const BlinkDetection = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const statusIndicatorRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showResponse, setShowResponse] = useState<'yes' | 'no' | null>(null);
  const [detectionState, setDetectionState] = useState<'searching' | 'detected' | 'error'>('searching');
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number>();
  const blinkStateRef = useRef({ isBlinking: false, blinkStartTime: 0 });
  const blinkCounterRef = useRef(0);
  const lastBlinkRef = useRef(0);
  const questions = ['Are you hungry?', 'Do you want to play?', 'Are you comfortable?'];
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const userResponsesRef = useRef<Array<'yes' | 'no'>>([]);

  useEffect(() => {
    setupCamera();
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

  const getMobileOptimizedConstraints = () => {
    if (!cameraContainerRef.current || !canvasRef.current) return null;

    const containerRect = cameraContainerRef.current.getBoundingClientRect();
    
    canvasRef.current.width = containerRect.width;
    canvasRef.current.height = containerRect.height;
    
    const constraints = {
      video: {
        width: { ideal: containerRect.width },
        height: { ideal: containerRect.height },
        facingMode: 'user',
        aspectRatio: containerRect.width / containerRect.height
      }
    };
    
    return constraints;
  };

  const setupCamera = async () => {
    try {
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

      const mobileConstraints = getMobileOptimizedConstraints();
      const streamSettings = mobileConstraints || {
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(streamSettings);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsLoading(false);
          startBlinkDetection();
        };
      }
    } catch (error) {
      console.error('Error setting up camera:', error);
      setIsLoading(false);
      setDetectionState('error');
    }
  };

  const startBlinkDetection = async () => {
    if (!videoRef.current || !canvasRef.current || !faceLandmarkerRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const detect = async () => {
      if (!video.paused && !video.ended && faceLandmarkerRef.current) {
        const displayWidth = canvas.width;
        const displayHeight = canvas.height;

        ctx.clearRect(0, 0, displayWidth, displayHeight);

        const results = faceLandmarkerRef.current.detectForVideo(video, Date.now());

        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
          const blendshapes = results.faceBlendshapes[0].categories;
          
          if (detectionState !== 'detected') {
            setDetectionState('detected');
          }

          const leftEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
          const rightEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
          const avgBlink = (leftEyeBlink + rightEyeBlink) / 2;

          const BLINK_THRESHOLD = 0.5;
          const currentTime = Date.now();
          
          if (avgBlink > BLINK_THRESHOLD && !blinkStateRef.current.isBlinking) {
            blinkStateRef.current.isBlinking = true;
            blinkStateRef.current.blinkStartTime = currentTime;
          } else if (avgBlink < BLINK_THRESHOLD && blinkStateRef.current.isBlinking) {
            blinkStateRef.current.isBlinking = false;
            
            const timeSinceLastBlink = currentTime - lastBlinkRef.current;
            if (timeSinceLastBlink < 450 && blinkCounterRef.current === 1) {
              blinkCounterRef.current = 0;
              lastBlinkRef.current = 0;
              handleDoubleBlinkResponse();
            } else {
              blinkCounterRef.current = 1;
              lastBlinkRef.current = currentTime;
              setTimeout(() => {
                if (blinkCounterRef.current === 1 && Date.now() - currentTime >= 450) {
                  blinkCounterRef.current = 0;
                  lastBlinkRef.current = 0;
                  handleSingleBlinkResponse();
                }
              }, 460);
            }
          }

          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const drawingUtils = new DrawingUtils(ctx);
            const landmarks = results.faceLandmarks[0];
            
            ctx.strokeStyle = `hsl(var(--primary))`;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = `hsl(var(--primary))`;
            
            drawingUtils.drawConnectors(
              landmarks,
              FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
              { color: `hsl(var(--primary))`, lineWidth: 2 }
            );
            drawingUtils.drawConnectors(
              landmarks,
              FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
              { color: `hsl(var(--primary))`, lineWidth: 2 }
            );
          }
        } else {
          if (detectionState !== 'searching') {
            setDetectionState('searching');
          }
        }
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

  const handleSingleBlinkResponse = () => {
    setShowResponse('yes');
    setTimeout(() => {
      setShowResponse(null);
      moveToNextQuestion('yes');
    }, 1000);
  };

  const handleDoubleBlinkResponse = () => {
    setShowResponse('no');
    setTimeout(() => {
      setShowResponse(null);
      moveToNextQuestion('no');
    }, 1000);
  };

  return (
    <div className="blink-detection-container">
      {isLoading && (
        <div className="loading-screen">
          <Loader className="loading-icon" />
          <p>Initializing Camera...</p>
        </div>
      )}

      <div ref={statusIndicatorRef} className="detection-state searching">
        {detectionState === 'searching' && 'Searching for face...'}
        {detectionState === 'detected' && 'Face detected! Ready for blinks'}
        {detectionState === 'error' && 'Camera error - Please check permissions'}
      </div>

      <div className="question-container">
        <div className="progress-indicator">
          <div 
            className="progress-fill" 
            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }} 
          />
        </div>
        <h2 className="current-question">{questions[currentQuestionIndex]}</h2>
        <p className="blink-instruction">Blink once for Yes, twice for No</p>
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
              </div>
            ) : (
              <div className="response-no">
                <X className="response-icon" />
                <h2>NO!</h2>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="guide-container">
        <div className="guide-item">
          <Eye className="guide-icon" />
          <div>
            <h3>Blink Once = YES</h3>
            <p>One clear blink</p>
          </div>
        </div>
        <div className="guide-item">
          <Eye className="guide-icon" />
          <div>
            <h3>Blink Twice = NO</h3>
            <p>Two quick blinks</p>
          </div>
        </div>
      </div>

      <button 
        className="navigation-home"
        onClick={() => navigate('/')}
      >
        <Home className="home-svg-icon" />
      </button>
    </div>
  );
};

export default BlinkDetection;