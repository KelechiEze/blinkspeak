import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Eye, Heart } from 'lucide-react';
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

        <h1 className="hero-title">BlinkSpeak</h1>
        
        <p className="hero-subtitle">
          Communicate with Your Eyes
        </p>

        <div className="features-grid">
          <div className="hero-features feature-card">
            <Eye className="feature-icon-svg" />
            <h3>One Blink = YES</h3>
            <p>Simple and natural</p>
          </div>
          
          <div className="hero-features feature-card">
            <div className="feature-icon-row">
              <Eye className="feature-icon-svg" />
              <Eye className="feature-icon-svg" />
            </div>
            <h3>Two Blinks = NO</h3>
            <p>Easy to remember</p>
          </div>
          
          <div className="hero-features feature-card">
            <Heart className="feature-icon-svg" />
            <h3>Made with Love</h3>
            <p>For amazing kids</p>
          </div>
        </div>

        <button 
          className="start-button"
          onClick={handleStart}
        >
          <Sparkles className="button-icon" />
          Start Your Journey
        </button>
      </div>
    </div>
  );
};

export default Landing;
