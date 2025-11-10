import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Shield, ArrowRight } from 'lucide-react';
import './CameraAccess.css';

const CameraPermission = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const handleAllow = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      // Stop the stream as we just needed permission
      stream.getTracks().forEach(track => track.stop());
      
      setPermissionGranted(true);
      navigate('/blink-detector');
    } catch (error) {
      console.error('Camera permission denied:', error);
    }
  };

  return (
    <div className="camera-access-container" ref={containerRef}>
      <div className="camera-access-card">
        <div className="camera-icon-wrapper">
          <div className="camera-pulse-effect" />
          <div className="camera-icon-circle">
            <Camera className="camera-svg-icon" />
          </div>
        </div>

        <h1 className="access-title">Camera Access Needed</h1>
        
        <p className="access-description">
          BlinkSpeak needs to see your beautiful eyes to understand your blinks!
        </p>

        <div className="features-list">
          <div className="feature-item">
            <Shield className="feature-icon" />
            <span>Your privacy is protected</span>
          </div>
          <div className="feature-item">
            <Shield className="feature-icon" />
            <span>Video stays on your device</span>
          </div>
          <div className="feature-item">
            <Shield className="feature-icon" />
            <span>No recording or storage</span>
          </div>
        </div>

        <div className="action-buttons">
          <button 
            className="allow-access-button"
            onClick={handleAllow}
          >
            <Camera className="button-icon-left" />
            Allow Camera Access
            <ArrowRight className="button-icon-right" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraPermission;