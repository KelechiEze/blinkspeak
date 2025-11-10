import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, 
  Eye, 
  Heart, 
  Smile, 
  Frown, 
  Hand, 
  Settings, 
  Check,
  X,
  ThumbsUp,
  ThumbsDown,
  Waves,
  Users
} from 'lucide-react';
import gsap from 'gsap';
import './Landing.css';

const Landing = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Simplified floating animation for nodes
    if (nodesRef.current) {
      const nodes = nodesRef.current.querySelectorAll('.floating-node');
      nodes.forEach((node, index) => {
        gsap.to(node, {
          y: '+=20',
          x: '+=15',
          duration: 4,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: index * 0.2,
        });
      });
    }

    // Simple fade-in animation with minimal delay
    gsap.fromTo('.hero-content', 
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );
  }, []);

  const handleStart = () => {
    gsap.to('.landing-container', {
      scale: 0.9,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.in',
      onComplete: () => navigate('/camera-permission'),
    });
  };

  return (
    <div className="landing-container" ref={containerRef}>
      <div className="floating-background" ref={nodesRef}>
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="floating-node"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <div className="hero-content">
        <div className="hero-icon">
          <Eye className="icon-eye" />
          <Sparkles className="icon-sparkle" />
        </div>

        <h1 className="hero-title">GesturePal</h1>
        
        <p className="hero-subtitle">
          Your Voice Through Movement
        </p>

        <div className="features-grid">
          {/* Blink Gesture */}
          <div className="feature-card">
            <Eye className="feature-icon-svg" />
            <h3>Eye Blinking</h3>
            <p>One blink for YES, two blinks for NO</p>
            <div className="gesture-examples">
              <div className="gesture-example">
                <Eye size={16} />
                <span>= Yes</span>
              </div>
              <div className="gesture-example">
                <Eye size={16} />
                <Eye size={16} />
                <span>= No</span>
              </div>
            </div>
          </div>
          
          {/* Smile Gesture */}
          <div className="feature-card">
            <Smile className="feature-icon-svg" />
            <h3>Smile Detection</h3>
            <p>Smile for YES, neutral for NO</p>
            <div className="gesture-examples">
              <div className="gesture-example">
                <Check size={16} />
                <span>= Yes</span>
              </div>
              <div className="gesture-example">
                <X size={16} />
                <span>= No</span>
              </div>
            </div>
          </div>
          
          {/* Head Nod Gesture */}
          <div className="feature-card">
            <Frown className="feature-icon-svg" />
            <h3>Head Nodding</h3>
            <p>Nod once for YES, twice for NO</p>
            <div className="gesture-examples">
              <div className="gesture-example">
                <ThumbsUp size={16} />
                <span>= Yes</span>
              </div>
              <div className="gesture-example">
                <ThumbsDown size={16} />
                <span>= No</span>
              </div>
            </div>
          </div>

          {/* Hand Wave Gesture */}
          <div className="feature-card">
            <Hand className="feature-icon-svg" />
            <h3>Hand Waving</h3>
            <p>Wave once for YES, twice for NO</p>
            <div className="gesture-examples">
              <div className="gesture-example">
                <Waves size={16} />
                <span>= Yes</span>
              </div>
              <div className="gesture-example">
                <Waves size={16} />
                <Waves size={16} />
                <span>= No</span>
              </div>
            </div>
          </div>

          {/* Multiple Options */}
          <div className="feature-card">
            <div className="feature-icon-row">
              <Eye className="feature-icon-svg" size={32} />
              <Smile className="feature-icon-svg" size={32} />
              <Hand className="feature-icon-svg" size={32} />
            </div>
            <h3>Multiple Gestures</h3>
            <p>Choose what works best for you</p>
            <div className="gesture-examples">
              <div className="gesture-example">
                <Settings size={16} />
                <span>Flexible</span>
              </div>
              <div className="gesture-example">
                <Users size={16} />
                <span>Adaptive</span>
              </div>
            </div>
          </div>
          
          {/* Made with Love */}
          <div className="feature-card">
            <Heart className="feature-icon-svg" />
            <h3>Made with Love</h3>
            <p>For amazing kids with CP</p>
            <div className="gesture-examples">
              <div className="gesture-example">
                <Heart size={16} />
                <span>Accessible</span>
              </div>
              <div className="gesture-example">
                <Users size={16} />
                <span>Inclusive</span>
              </div>
            </div>
          </div>
        </div>

        <button 
          className="start-button"
          onClick={handleStart}
        >
          <Sparkles className="button-icon" />
          Discover Your Voice
        </button>
      </div>
    </div>
  );
};

export default Landing;