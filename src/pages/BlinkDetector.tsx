import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Eye, Home, Loader, Smile, Frown, Hand, Settings, Volume2, VolumeX, User, Users, Mic } from 'lucide-react';
import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import './BlinkDetection.css';

type GestureType = 'blink' | 'smile' | 'nod' | 'handWave';
type ResponseType = 'yes' | 'no' | null;
type VoiceType = 'male' | 'female';

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

interface Question {
  id: string;
  text: string;
  category: string;
}

interface Point {
  x: number;
  y: number;
}

interface VoiceInfo {
  type: VoiceType;
  name: string;
  icon: JSX.Element;
  voiceSettings: {
    rate: number;
    pitch: number;
    volume: number;
  };
}

const GestureDetection = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const statusIndicatorRef = useRef<HTMLDivElement>(null);
  const customQuestionRef = useRef<HTMLInputElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [showResponse, setShowResponse] = useState<ResponseType>(null);
  const [detectionState, setDetectionState] = useState<'searching' | 'detected' | 'error' | 'waiting'>('waiting');
  const [activeGesture, setActiveGesture] = useState<GestureType>('blink');
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [showGestureMenu, setShowGestureMenu] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDetectionActive, setIsDetectionActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceType>('female');
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedSystemVoice, setSelectedSystemVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [customQuestion, setCustomQuestion] = useState('');
  
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number>();
  const speechSynthRef = useRef<SpeechSynthesis | null>(null);
  const detectionTimeoutRef = useRef<NodeJS.Timeout>();
  const gestureTimeoutRef = useRef<NodeJS.Timeout>();
  
  // SPEED OPTIMIZATION PARAMETERS - Adjust these for faster/slower detection
  const detectionConfig = {
    // Blink detection - reduced thresholds for faster response
    blink: {
      threshold: 0.5,           // Lower = more sensitive
      minDuration: 30,          // Shorter minimum blink duration (ms)
      maxDuration: 350,         // Shorter maximum blink duration (ms)
      doubleBlinkWindow: 500,   // Time window for double blink detection (ms)
      confirmationDelay: 800    // Reduced confirmation delay (ms)
    },
    // Smile detection - faster response times
    smile: {
      duration: 1200,           // Reduced smile duration requirement (ms)
      thresholdMultiplier: 1.15 // Lower multiplier for easier detection
    },
    // Nod detection - faster counting
    nod: {
      cooldown: 600,            // Reduced cooldown between nods (ms)
      thresholdMultiplier: 1.2  // Lower threshold for easier detection
    },
    // Hand wave detection - more sensitive
    handWave: {
      threshold: 0.06,          // Lower threshold for wave detection
      cooldown: 600,            // Reduced cooldown (ms)
      historySize: 15           // Smaller history for faster processing
    },
    // General detection settings
    general: {
      detectionInterval: 16,    // ~60fps for faster processing
      faceDetectionTimeout: 2000 // Faster timeout for face detection
    }
  };

  // Gesture state tracking
  const gestureStateRef = useRef({
    // Blink detection
    isBlinking: false,
    blinkStartTime: 0,
    blinkCounter: 0,
    lastBlinkTime: 0,
    blinkHistory: [] as number[],
    pendingBlinkResponse: null as 'yes' | 'no' | null,
    
    // Smile detection
    smileStartTime: 0,
    smileDetected: false,
    neutralMouthWidth: 0,
    isSmiling: false,
    pendingSmileResponse: null as 'yes' | 'no' | null,
    
    // Nod detection
    nodStartTime: 0,
    nodDetected: false,
    headPitch: 0,
    neutralHeadPitch: 0,
    nodCount: 0,
    lastNodTime: 0,
    isNodding: false,
    pendingNodResponse: null as 'yes' | 'no' | null,
    
    // Hand wave detection
    waveStartTime: 0,
    waveDetected: false,
    handPositionHistory: [] as Point[],
    waveCount: 0,
    lastWaveTime: 0,
    isWaving: false,
    pendingWaveResponse: null as 'yes' | 'no' | null,
  });

  // Sample questions based on your image
  const availableQuestions: Question[] = [
    { id: '1', text: "need help?", category: "basic" },
    { id: '2', text: "are you thirsty", category: "basic" },
    { id: '3', text: "Are you hungry", category: "basic" },
    { id: '4', text: "Yes", category: "response" },
    { id: '5', text: "No", category: "response" },
    { id: '6', text: "Are you tired", category: "basic" },
    { id: '7', text: "need the bathroom?", category: "basic" },
    { id: '8', text: "Are you in pain", category: "medical" },
    { id: '9', text: "Are you okay", category: "medical" },
    { id: '10', text: "Do you love me", category: "emotional" },
    { id: '11', text: "Wanna Call someone?", category: "action" },
    { id: '12', text: "Thank you", category: "emotional" }
  ];

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
      duration: 1000
    },
    {
      type: 'smile',
      name: 'Smile Detection',
      description: 'Smile for YES, neutral for NO',
      icon: <Smile className="guide-icon" />,
      yesAction: 'Smile (2 sec)',
      noAction: 'Neutral (2 sec)',
      enabled: true,
      threshold: 0.15,
      duration: 2000
    },
    {
      type: 'nod',
      name: 'Head Nodding',
      description: 'Nod once for YES, twice for NO',
      icon: <Frown className="guide-icon" />,
      yesAction: 'Single Nod',
      noAction: 'Double Nod',
      enabled: true,
      threshold: 0.3,
      duration: 1000
    },
    {
      type: 'handWave',
      name: 'Hand Waving',
      description: 'Wave once for YES, twice for NO',
      icon: <Hand className="guide-icon" />,
      yesAction: 'Single Wave',
      noAction: 'Double Wave',
      enabled: true,
      threshold: 0.4,
      duration: 1000
    }
  ];

  const voiceConfigs: VoiceInfo[] = [
    {
      type: 'female',
      name: 'Female Voice',
      icon: <User className="voice-icon" />,
      voiceSettings: { 
        rate: 0.9,   // Slower for clarity
        pitch: 1.6,  // Higher pitch for feminine sound
        volume: 1 
      }
    },
    {
      type: 'male',
      name: 'Male Voice',
      icon: <Users className="voice-icon" />,
      voiceSettings: { 
        rate: 1.0, 
        pitch: 0.8, // Lower pitch for masculine sound
        volume: 1 
      }
    }
  ];

  // Get available system voices and filter for male/female
  const getAvailableVoices = (): SpeechSynthesisVoice[] => {
    if (!speechSynthRef.current) return [];
    return speechSynthRef.current.getVoices();
  };

  // Enhanced voice filtering with better scoring
  const findBestVoice = (voiceType: VoiceType): SpeechSynthesisVoice | null => {
    const voices = getAvailableVoices();
    if (voices.length === 0) return null;

    // Comprehensive voice filtering
    const femaleKeywords = [
      'female', 'woman', 'lady', 'girl', 'samantha', 'victoria', 'karen', 
      'moira', 'veena', 'tessa', 'fiona', 'kathy', 'kyoko', 'yuna',
      'sarah', 'emily', 'lisa', 'michelle', 'natalia', 'zuzana', 'monica',
      'paulina', 'melina', 'amelia', 'alice', 'catherine', 'claire',
      'agnes', 'alva', 'klara', 'elle'
    ];
    
    const maleKeywords = [
      'male', 'man', 'gentleman', 'boy', 'alex', 'daniel', 'lee',
      'thomas', 'david', 'mark', 'michael', 'john', 'kevin', 'steve', 'tom',
      'fred', 'ralph', 'eddy'
    ];

    const targetKeywords = voiceType === 'female' ? femaleKeywords : maleKeywords;
    const avoidKeywords = voiceType === 'female' ? maleKeywords : femaleKeywords;

    // Score voices based on how well they match
    const scoredVoices = voices.map(voice => {
      const voiceName = voice.name.toLowerCase();
      let score = 0;
      
      // Positive scoring for matching keywords
      targetKeywords.forEach(keyword => {
        if (voiceName.includes(keyword)) {
          score += 10;
        }
      });
      
      // Negative scoring for conflicting keywords
      avoidKeywords.forEach(keyword => {
        if (voiceName.includes(keyword)) {
          score -= 20;
        }
      });
      
      // Prefer voices that are locally installed (usually better quality)
      if (voice.localService) score += 5;
      
      // Prefer voices that are not default (often better specialized)
      if (!voice.default) score += 2;

      // Prefer US English voices for better compatibility
      if (voice.lang.startsWith('en-US')) score += 3;
      if (voice.lang.startsWith('en-GB')) score += 2;
      
      return { voice, score };
    });

    // Sort by score and get the best one
    scoredVoices.sort((a, b) => b.score - a.score);
    
    const bestVoice = scoredVoices[0];
    
    // Only return if we have a reasonably good match
    if (bestVoice && bestVoice.score > 0) {
      console.log(`Selected voice: ${bestVoice.voice.name} with score ${bestVoice.score}`);
      return bestVoice.voice;
    }

    // Fallback: Try to find any voice without conflicting gender
    for (const voice of voices) {
      const voiceName = voice.name.toLowerCase();
      const hasAvoidKeyword = avoidKeywords.some(keyword => voiceName.includes(keyword));
      
      if (!hasAvoidKeyword) {
        console.log(`Fallback voice: ${voice.name}`);
        return voice;
      }
    }

    // Last resort: return the first available voice
    return voices[0] || null;
  };

  // Test a voice to hear how it sounds
  const testVoice = (voice: SpeechSynthesisVoice | null) => {
    if (!speechSynthRef.current || !voice) return;
    
    if (speechSynthRef.current.speaking) {
      speechSynthRef.current.cancel();
    }

    const utterance = new SpeechSynthesisUtterance("Hello, this is a test of the female voice");
    utterance.voice = voice;
    
    const voiceConfig = voiceConfigs.find(v => v.type === selectedVoice);
    if (voiceConfig) {
      utterance.rate = voiceConfig.voiceSettings.rate;
      utterance.pitch = voiceConfig.voiceSettings.pitch;
      utterance.volume = voiceConfig.voiceSettings.volume;
    }
    
    speechSynthRef.current.speak(utterance);
  };

  // Handle custom question input and reading
  const handleCustomQuestion = async () => {
    if (!customQuestion.trim()) return;

    if (isSpeaking) {
      speechSynthRef.current?.cancel();
      setIsSpeaking(false);
    }

    // Clear any existing timeouts
    if (detectionTimeoutRef.current) {
      clearTimeout(detectionTimeoutRef.current);
    }
    if (gestureTimeoutRef.current) {
      clearTimeout(gestureTimeoutRef.current);
    }

    // Set custom question
    const customQ: Question = {
      id: 'custom',
      text: customQuestion,
      category: 'custom'
    };
    
    setSelectedQuestion(customQ);
    setIsDetectionActive(false);
    setDetectionState('waiting');
    setShowResponse(null);

    // Reset gesture state for new question
    gestureStateRef.current = {
      isBlinking: false,
      blinkStartTime: 0,
      blinkCounter: 0,
      lastBlinkTime: 0,
      blinkHistory: [],
      pendingBlinkResponse: null,
      smileStartTime: 0,
      smileDetected: false,
      neutralMouthWidth: 0,
      isSmiling: false,
      pendingSmileResponse: null,
      nodStartTime: 0,
      nodDetected: false,
      headPitch: 0,
      neutralHeadPitch: 0,
      nodCount: 0,
      lastNodTime: 0,
      isNodding: false,
      pendingNodResponse: null,
      waveStartTime: 0,
      waveDetected: false,
      handPositionHistory: [],
      waveCount: 0,
      lastWaveTime: 0,
      isWaving: false,
      pendingWaveResponse: null,
    };

    // Start detection immediately while speaking
    setIsDetectionActive(true);
    setDetectionState('searching');
    startGestureDetection();

    await speakText(customQuestion);
  };

  useEffect(() => {
    initializeFaceLandmarker();
    speechSynthRef.current = window.speechSynthesis;
    
    // Load voices when they become available
    const loadVoices = () => {
      const voices = getAvailableVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
        console.log('Available voices:', voices.map(v => v.name));
        
        // Auto-select the best female voice initially
        const bestFemaleVoice = findBestVoice('female');
        setSelectedSystemVoice(bestFemaleVoice);
        
        if (bestFemaleVoice) {
          console.log('Auto-selected voice:', bestFemaleVoice.name);
        }
      }
    };

    // Some browsers load voices asynchronously
    if (speechSynthRef.current.getVoices().length > 0) {
      loadVoices();
    } else {
      speechSynthRef.current.addEventListener('voiceschanged', loadVoices);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
      if (gestureTimeoutRef.current) {
        clearTimeout(gestureTimeoutRef.current);
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      // Stop any ongoing speech
      if (speechSynthRef.current?.speaking) {
        speechSynthRef.current.cancel();
      }
      // Clean up event listener
      speechSynthRef.current?.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  useEffect(() => {
    if (statusIndicatorRef.current) {
      statusIndicatorRef.current.className = `detection-state ${detectionState}`;
    }
  }, [detectionState]);

  // Update system voice when selectedVoice changes
  useEffect(() => {
    const bestVoice = findBestVoice(selectedVoice);
    setSelectedSystemVoice(bestVoice);
  }, [selectedVoice]);

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
            setDetectionState('waiting');
          }).catch(error => {
            console.error('Error playing video:', error);
            setCameraError('Failed to start camera feed');
            setIsLoading(false);
            setDetectionState('error');
          });
        };

        // REDUCED TIMEOUT for faster initialization
        setTimeout(() => {
          if (isLoading) {
            console.log('Fallback: Camera ready after timeout');
            setIsLoading(false);
            setDetectionState('waiting');
          }
        }, 1000); // Reduced from 2000ms to 1000ms
      }
    } catch (error) {
      console.error('Error setting up camera:', error);
      setCameraError('Camera access denied or not available');
      setIsLoading(false);
      setDetectionState('error');
    }
  };

  const speakText = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!speechSynthRef.current || isMuted) {
        resolve();
        return;
      }

      if (speechSynthRef.current.speaking) {
        speechSynthRef.current.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Get voice settings from config
      const voiceConfig = voiceConfigs.find(v => v.type === selectedVoice);
      const voiceSettings = voiceConfig?.voiceSettings || { rate: 1.0, pitch: 1.0, volume: 1 };
      
      // Apply voice settings
      utterance.rate = voiceSettings.rate;
      utterance.pitch = voiceSettings.pitch;
      utterance.volume = voiceSettings.volume;

      // Use the selected system voice
      if (selectedSystemVoice) {
        utterance.voice = selectedSystemVoice;
        console.log(`Using voice: ${selectedSystemVoice.name} for ${selectedVoice} type`);
      } else {
        console.log('No specific voice found, using default');
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };

      utterance.onerror = (error) => {
        console.error('Speech synthesis error:', error);
        setIsSpeaking(false);
        resolve();
      };

      speechSynthRef.current.speak(utterance);
    });
  };

  const handleQuestionSelect = async (question: Question) => {
    if (isSpeaking) {
      speechSynthRef.current?.cancel();
      setIsSpeaking(false);
    }

    if (detectionTimeoutRef.current) {
      clearTimeout(detectionTimeoutRef.current);
    }
    if (gestureTimeoutRef.current) {
      clearTimeout(gestureTimeoutRef.current);
    }

    setSelectedQuestion(question);
    setIsDetectionActive(false);
    setDetectionState('waiting');
    setShowResponse(null);

    // Reset gesture state for new question
    gestureStateRef.current = {
      isBlinking: false,
      blinkStartTime: 0,
      blinkCounter: 0,
      lastBlinkTime: 0,
      blinkHistory: [],
      pendingBlinkResponse: null,
      smileStartTime: 0,
      smileDetected: false,
      neutralMouthWidth: 0,
      isSmiling: false,
      pendingSmileResponse: null,
      nodStartTime: 0,
      nodDetected: false,
      headPitch: 0,
      neutralHeadPitch: 0,
      nodCount: 0,
      lastNodTime: 0,
      isNodding: false,
      pendingNodResponse: null,
      waveStartTime: 0,
      waveDetected: false,
      handPositionHistory: [],
      waveCount: 0,
      lastWaveTime: 0,
      isWaving: false,
      pendingWaveResponse: null,
    };

    // Start detection immediately while speaking
    setIsDetectionActive(true);
    setDetectionState('searching');
    startGestureDetection();

    await speakText(question.text);
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

  // Calculate distance between two points
  const calculateDistance = (point1: Point, point2: Point): number => {
    return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
  };

  const processGestureResponse = (response: 'yes' | 'no', gestureType: GestureType) => {
    const state = gestureStateRef.current;
    
    // Clear any existing timeout
    if (gestureTimeoutRef.current) {
      clearTimeout(gestureTimeoutRef.current);
    }

    // Set pending response and wait 1 second to confirm
    switch (gestureType) {
      case 'blink':
        state.pendingBlinkResponse = response;
        break;
      case 'smile':
        state.pendingSmileResponse = response;
        break;
      case 'nod':
        state.pendingNodResponse = response;
        break;
      case 'handWave':
        state.pendingWaveResponse = response;
        break;
    }

    // REDUCED CONFIRMATION DELAY for faster response
    gestureTimeoutRef.current = setTimeout(() => {
      // After reduced delay, confirm the response
      handleGestureResponse(response);
      
      // Reset all pending responses
      state.pendingBlinkResponse = null;
      state.pendingSmileResponse = null;
      state.pendingNodResponse = null;
      state.pendingWaveResponse = null;
    }, 800); // Reduced from 1000ms to 800ms
  };

  const detectBlink = (blendshapes: any[], currentTime: number) => {
    const leftEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
    const rightEyeBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
    const avgBlink = (leftEyeBlink + rightEyeBlink) / 2;

    // USING OPTIMIZED CONFIG VALUES
    const BLINK_THRESHOLD = detectionConfig.blink.threshold;
    const state = gestureStateRef.current;

    if (avgBlink > BLINK_THRESHOLD && !state.isBlinking) {
      state.isBlinking = true;
      state.blinkStartTime = currentTime;
    } else if (avgBlink < BLINK_THRESHOLD && state.isBlinking) {
      state.isBlinking = false;
      
      const blinkDuration = currentTime - state.blinkStartTime;
      // USING OPTIMIZED DURATION RANGE
      if (blinkDuration > detectionConfig.blink.minDuration && blinkDuration < detectionConfig.blink.maxDuration) {
        state.blinkHistory.push(currentTime);
        
        // Keep only recent blinks (last 2 seconds)
        state.blinkHistory = state.blinkHistory.filter(time => currentTime - time < 2000);
        
        // Check for double blink within optimized window
        if (state.blinkHistory.length >= 2) {
          const timeBetweenBlinks = state.blinkHistory[state.blinkHistory.length - 1] - state.blinkHistory[state.blinkHistory.length - 2];
          if (timeBetweenBlinks < detectionConfig.blink.doubleBlinkWindow) {
            processGestureResponse('no', 'blink');
            state.blinkHistory = [];
            return;
          }
        }
        
        // If no double blink detected within optimized time, treat as single blink
        if (state.blinkHistory.length === 1) {
          setTimeout(() => {
            if (state.blinkHistory.length === 1 && !state.pendingBlinkResponse) {
              processGestureResponse('yes', 'blink');
              state.blinkHistory = [];
            }
          }, detectionConfig.blink.confirmationDelay);
        }
        
        state.lastBlinkTime = currentTime;
      }
    }
  };

  const detectSmile = (landmarks: any[], currentTime: number) => {
    const state = gestureStateRef.current;
    
    // Get mouth corner landmarks
    const mouthLeft = landmarks[61];
    const mouthRight = landmarks[291];
    
    if (!mouthLeft || !mouthRight) return;
    
    const mouthWidth = calculateDistance(
      { x: mouthLeft.x, y: mouthLeft.y },
      { x: mouthRight.x, y: mouthRight.y }
    );
    
    // Initialize neutral mouth width
    if (state.neutralMouthWidth === 0) {
      state.neutralMouthWidth = mouthWidth;
      return;
    }
    
    // USING OPTIMIZED CONFIG VALUES
    const smileThreshold = state.neutralMouthWidth * detectionConfig.smile.thresholdMultiplier;
    const SMILE_DURATION = detectionConfig.smile.duration;
    
    if (mouthWidth > smileThreshold && !state.isSmiling) {
      state.isSmiling = true;
      state.smileStartTime = currentTime;
    } else if (mouthWidth > smileThreshold && state.isSmiling) {
      if (currentTime - state.smileStartTime >= SMILE_DURATION && !state.pendingSmileResponse) {
        processGestureResponse('yes', 'smile');
      }
    } else if (mouthWidth <= smileThreshold) {
      if (state.isSmiling && !state.pendingSmileResponse) {
        // User stopped smiling before duration
        processGestureResponse('no', 'smile');
      }
      state.isSmiling = false;
    }
  };

  const detectNod = (landmarks: any[], currentTime: number) => {
    const state = gestureStateRef.current;
    
    const noseTip = landmarks[1];
    const forehead = landmarks[10];
    
    if (!noseTip || !forehead) return;
    
    const verticalDistance = Math.abs(noseTip.y - forehead.y);
    
    if (state.neutralHeadPitch === 0) {
      state.neutralHeadPitch = verticalDistance;
      return;
    }
    
    // USING OPTIMIZED CONFIG VALUES
    const nodThreshold = state.neutralHeadPitch * detectionConfig.nod.thresholdMultiplier;
    const NOD_COOLDOWN = detectionConfig.nod.cooldown;
    
    if (verticalDistance > nodThreshold && !state.isNodding) {
      state.isNodding = true;
      state.nodCount++;
      state.lastNodTime = currentTime;
    } else if (verticalDistance <= nodThreshold * 0.9) {
      state.isNodding = false;
    }
    
    // Check for nod patterns after optimized cooldown
    if (state.nodCount > 0 && currentTime - state.lastNodTime > NOD_COOLDOWN && !state.pendingNodResponse) {
      if (state.nodCount === 1) {
        processGestureResponse('yes', 'nod');
      } else if (state.nodCount >= 2) {
        processGestureResponse('no', 'nod');
      }
      state.nodCount = 0;
    }
  };

  const detectHandWave = (landmarks: any[], currentTime: number) => {
    const state = gestureStateRef.current;
    
    // Use face landmarks to detect hand near face
    const faceLeft = landmarks[234]; // Left face edge
    const faceRight = landmarks[454]; // Right face edge
    
    if (!faceLeft || !faceRight) return;
    
    const faceWidth = Math.abs(faceRight.x - faceLeft.x);
    const detectionZone = faceWidth * 1.5;
    
    // Look for hand landmarks (simplified - using MediaPipe hand detection would be better)
    // For now, we'll use face landmarks and movement detection
    
    const currentPosition: Point = { 
      x: (faceLeft.x + faceRight.x) / 2, 
      y: (faceLeft.y + faceRight.y) / 2 
    };
    
    state.handPositionHistory.push(currentPosition);
    
    // Keep only recent positions using optimized size
    if (state.handPositionHistory.length > detectionConfig.handWave.historySize) {
      state.handPositionHistory = state.handPositionHistory.slice(-detectionConfig.handWave.historySize);
    }
    
    if (state.handPositionHistory.length < 5) return;
    
    let totalMovement = 0;
    for (let i = 1; i < state.handPositionHistory.length; i++) {
      totalMovement += calculateDistance(state.handPositionHistory[i-1], state.handPositionHistory[i]);
    }
    
    // USING OPTIMIZED CONFIG VALUES
    const WAVE_THRESHOLD = detectionConfig.handWave.threshold;
    const WAVE_COOLDOWN = detectionConfig.handWave.cooldown;
    
    if (totalMovement > WAVE_THRESHOLD && !state.isWaving) {
      state.isWaving = true;
      state.waveCount++;
      state.lastWaveTime = currentTime;
    } else if (totalMovement < WAVE_THRESHOLD * 0.5) {
      state.isWaving = false;
    }
    
    // Check for wave patterns after optimized cooldown
    if (state.waveCount > 0 && currentTime - state.lastWaveTime > WAVE_COOLDOWN && !state.pendingWaveResponse) {
      if (state.waveCount === 1) {
        processGestureResponse('yes', 'handWave');
      } else if (state.waveCount >= 2) {
        processGestureResponse('no', 'handWave');
      }
      state.waveCount = 0;
      state.handPositionHistory = [];
    }
  };

  const startGestureDetection = () => {
    if (!videoRef.current || !canvasRef.current || !faceLandmarkerRef.current || !isDetectionActive) {
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

    let lastDetectionTime = 0;
    const detectionInterval = detectionConfig.general.detectionInterval; // ~60fps

    const detect = async () => {
      if (!isDetectionActive || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      const currentTime = Date.now();
      
      // Throttle detection to optimize performance
      if (currentTime - lastDetectionTime < detectionInterval) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      
      lastDetectionTime = currentTime;

      try {
        const results = faceLandmarkerRef.current!.detectForVideo(video, currentTime);

        if (results.faceBlendshapes && results.faceBlendshapes.length > 0 && 
            results.faceLandmarks && results.faceLandmarks.length > 0) {
          
          const blendshapes = results.faceBlendshapes[0].categories;
          const landmarks = results.faceLandmarks[0];
          
          if (detectionState !== 'detected') {
            setDetectionState('detected');
          }

          // Run all gesture detections simultaneously
          detectBlink(blendshapes, currentTime);
          detectSmile(landmarks, currentTime);
          detectNod(landmarks, currentTime);
          detectHandWave(landmarks, currentTime);

          // KID-FRIENDLY FACE DRAWING - Softer, more playful visualization
          const drawingUtils = new DrawingUtils(ctx);
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Softer, more playful colors for kids
          const primaryColor = `hsl(270, 70%, 60%)`; // Softer purple
          const secondaryColor = `hsl(210, 80%, 60%)`; // Soft blue
          const accentColor = `hsl(120, 65%, 50%)`; // Friendly green
          
          // Draw a soft face outline instead of the scary mesh
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
            { color: `${primaryColor} / 0.6`, lineWidth: 3 }
          );

          // Highlight relevant features based on active gesture with kid-friendly styling
          switch (activeGesture) {
            case 'blink':
              // Draw friendly eyes with softer styling
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                { color: accentColor, lineWidth: 2 }
              );
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                { color: accentColor, lineWidth: 2 }
              );
              // Add playful eye dots
              const leftEyeCenter = landmarks[468]; // Left eye center
              const rightEyeCenter = landmarks[473]; // Right eye center
              if (leftEyeCenter && rightEyeCenter) {
                drawingUtils.drawLandmarks([leftEyeCenter], { color: accentColor, lineWidth: 4, radius: 2 });
                drawingUtils.drawLandmarks([rightEyeCenter], { color: accentColor, lineWidth: 4, radius: 2 });
              }
              break;
              
            case 'smile':
              // Draw friendly mouth with smile indicator
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LIPS,
                { color: secondaryColor, lineWidth: 3 }
              );
              break;
              
            case 'nod':
              // Simple head outline for nodding
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                { color: primaryColor, lineWidth: 4 }
              );
              break;
              
            case 'handWave':
              // Draw face boundary with wave detection area
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                { color: secondaryColor, lineWidth: 3 }
              );
              // Add a friendly detection zone indicator
              const faceCenter = landmarks[1]; // Nose tip
              if (faceCenter) {
                ctx.strokeStyle = `${accentColor} / 0.3`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(faceCenter.x * canvas.width, faceCenter.y * canvas.height, 100, 0, 2 * Math.PI);
                ctx.stroke();
              }
              break;
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

  const handleGestureResponse = (response: 'yes' | 'no') => {
    if (!isDetectionActive) return;

    setShowResponse(response);
    setIsDetectionActive(false);
    setDetectionState('waiting');
    
    setTimeout(() => {
      setShowResponse(null);
      setSelectedQuestion(null);
    }, 3000);
  };

  const currentConfig = gestureConfigs.find(g => g.type === activeGesture);
  const currentVoiceConfig = voiceConfigs.find(v => v.type === selectedVoice);

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

      <div className="top-navigation">
        <div className="navigation-left">
          <button 
            className="navigation-home"
            onClick={() => navigate('/')}
          >
            <Home className="home-svg-icon" />
          </button>
          
          <div className="voice-selector">
            <button 
              className="voice-menu-button"
              onClick={() => setShowVoiceMenu(!showVoiceMenu)}
            >
              {currentVoiceConfig?.icon}
              {currentVoiceConfig?.name}
            </button>
            
            {showVoiceMenu && (
              <div className="voice-menu">
                {voiceConfigs.map((voice) => (
                  <button
                    key={voice.type}
                    className={`voice-menu-item ${selectedVoice === voice.type ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedVoice(voice.type);
                      setShowVoiceMenu(false);
                    }}
                  >
                    {voice.icon}
                    <span>{voice.name}</span>
                  </button>
                ))}
                
                {/* Voice Testing Section */}
                <div className="voice-test-section">
                  <h4>Available System Voices:</h4>
                  <div className="system-voices-list">
                    {availableVoices.slice(0, 5).map((voice) => (
                      <button
                        key={voice.name}
                        className={`system-voice-item ${selectedSystemVoice?.name === voice.name ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedSystemVoice(voice);
                          testVoice(voice);
                        }}
                      >
                        <span>{voice.name}</span>
                        <small>
                          {voice.lang} {voice.localService ? '• Local' : ''}
                        </small>
                      </button>
                    ))}
                  </div>
                  <button 
                    className="test-voice-button"
                    onClick={() => testVoice(selectedSystemVoice)}
                  >
                    Test Selected Voice
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Question Input Section */}
      <div className="custom-question-container">
        <div className="custom-question-input-group">
          <input
            ref={customQuestionRef}
            type="text"
            placeholder="Type your question here..."
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            className="custom-question-input"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleCustomQuestion();
              }
            }}
          />
          <button
            onClick={handleCustomQuestion}
            disabled={!customQuestion.trim() || isSpeaking}
            className="read-aloud-button"
          >
            <Mic className="read-aloud-icon" />
            Read Aloud
          </button>
        </div>
      </div>

      <div ref={statusIndicatorRef} className="detection-state waiting">
        {detectionState === 'waiting' && 'Select a question to begin'}
        {detectionState === 'searching' && 'Searching for face...'}
        {detectionState === 'detected' && `${currentConfig?.name} - Ready!`}
        {detectionState === 'error' && `Error: ${cameraError}`}
      </div>

      {selectedQuestion && (
        <div className="question-container">
          <div className="question-header">
            <h2 className="current-question">{selectedQuestion.text}</h2>
            {isSpeaking && <div className="speaking-indicator">Speaking...</div>}
          </div>
          {isDetectionActive && (
            <p className="blink-instruction">
              {currentConfig?.yesAction} for YES, {currentConfig?.noAction} for NO
            </p>
          )}
        </div>
      )}

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
                    blinkHistory: [],
                    pendingBlinkResponse: null,
                    smileStartTime: 0,
                    smileDetected: false,
                    neutralMouthWidth: 0,
                    isSmiling: false,
                    pendingSmileResponse: null,
                    nodStartTime: 0,
                    nodDetected: false,
                    headPitch: 0,
                    neutralHeadPitch: 0,
                    nodCount: 0,
                    lastNodTime: 0,
                    isNodding: false,
                    pendingNodResponse: null,
                    waveStartTime: 0,
                    waveDetected: false,
                    handPositionHistory: [],
                    waveCount: 0,
                    lastWaveTime: 0,
                    isWaving: false,
                    pendingWaveResponse: null,
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

      <div className="questions-grid-container">
        <h3 className="questions-title">Select a Question</h3>
        <div className="questions-grid">
          {availableQuestions.map((question) => (
            <button
              key={question.id}
              className={`question-button ${selectedQuestion?.id === question.id ? 'selected' : ''} ${question.category}`}
              onClick={() => handleQuestionSelect(question)}
              disabled={isSpeaking}
            >
              {question.text}
            </button>
          ))}
        </div>
      </div>

      <div className="navigation-controls">
        <button 
          className="calibrate-button"
          onClick={calibrateGesture}
        >
          <Loader className="guide-icon2" />
          Calibrate
        </button>

        <button 
          className={`mute-button ${isMuted ? 'muted' : ''}`}
          onClick={() => setIsMuted(!isMuted)}
        >
          {isMuted ? <VolumeX className="guide-icon2" /> : <Volume2 className="guide-icon2" />}
        </button>
      </div>
    </div>
  );
};

export default GestureDetection;