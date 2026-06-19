import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import CryptoJS from 'crypto-js';
import './App.css';

function App() {
    const [isMounted, setIsMounted] = useState(false);
    const backendUrl = 'https://ajinkyapagare-u19-secure-backend.hf.space';
    
    // V4 Architecture: Read routing code and encryption key securely from the Air-Gapped QR URL
    const urlParams = new URLSearchParams(window.location.search);
    const initialRoom = urlParams.get('room');
    const hashKey = window.location.hash.substring(1); // removes '#'
    
    const roomCode = initialRoom || '';
    const encryptionKey = hashKey || '';

    const [connected, setConnected] = useState(false);
    const [currentView, setCurrentView] = useState('home'); // 'home' or 'tools'
    const textRef = useRef(''); // Use ref instead of state to prevent massive re-render lag
    const [isSent, setIsSent] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);

    // Auto-switch to tools view when connection is established
    useEffect(() => {
        if (connected) {
            setCurrentView('tools');
        } else {
            setCurrentView('home');
        }
    }, [connected]);

    // Typing Controls State
    const [typingMode, setTypingMode] = useState('paste'); // 'paste' or 'type'
    const speedOptions = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000];
    const [typingSpeedIndex, setTypingSpeedIndex] = useState(5); // Default to 50 CPS
    const currentCPS = speedOptions[typingSpeedIndex];
    const [typingState, setTypingState] = useState({
        active: false,
        paused: false,
        progress: 0,
        total: 0
    });

    const socketRef = useRef(null);
    const textareaRef = useRef(null);
    const lastProgressUpdate = useRef(0);

    useEffect(() => {
        setIsMounted(true);
        connectSocket(roomCode);
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [roomCode]);

    // HEARTBEAT: Keep connection active
    useEffect(() => {
        const interval = setInterval(() => {
            if (socketRef.current && socketRef.current.connected) {
                socketRef.current.emit('ping_keepalive');
            }
        }, 25000);
        return () => clearInterval(interval);
    }, []);

    const connectSocket = (code) => {
        if (socketRef.current) socketRef.current.disconnect();

        try {
            socketRef.current = io(backendUrl, {
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000,
                autoConnect: true
            });

            socketRef.current.on('connect', () => {
                socketRef.current.emit('join_room', { code: code, type: 'sender' });
            });

            socketRef.current.on('room_joined', (data) => {
                setConnected(data.room_active);
            });

            socketRef.current.on('room_status', (data) => {
                if (data.status === 'active') {
                    setConnected(true);
                } else if (data.status === 'sender_left' || data.status === 'receiver_left') {
                    setConnected(false);
                }
            });

            socketRef.current.on('disconnect', () => {
                setConnected(false);
            });

            socketRef.current.on('typing_progress', (data) => {
                const now = Date.now();
                const isDone = data.index >= data.total;
                
                // Auto-clear the text area when the live typing transmission completes
                if (isDone) {
                    textRef.current = '';
                    if (textareaRef.current) textareaRef.current.value = '';
                }
                
                // Throttle React state updates to prevent the UI from freezing
                if (now - lastProgressUpdate.current > 100 || isDone) {
                    lastProgressUpdate.current = now;
                    setTypingState(prev => ({
                        ...prev,
                        progress: data.index,
                        total: data.total,
                        active: !isDone,
                        paused: isDone ? false : prev.paused
                    }));
                }
            });

        } catch (error) {
            console.error("Connection error:", error);
            setConnected(false);
        }
    };

    const sendText = () => {
        const textToTransmit = textRef.current;
        if (!textToTransmit || !socketRef.current) return;

        // V4 Security: Inject millisecond timestamp to prevent Replay Attacks
        const payloadObject = {
            t: textToTransmit,
            ts: Date.now()
        };
        const payloadString = JSON.stringify(payloadObject);
        
        // V4 Security: Drop massive payloads to prevent DoS
        if (payloadString.length > 5000000) {
            alert("Payload too massive! Dropping transmission to prevent DoS.");
            return;
        }

        // E2EE: Encrypt the payload using the Air-Gapped Hash Key
        const encryptedText = CryptoJS.AES.encrypt(payloadString, encryptionKey).toString();

        if (typingMode === 'type') {
            socketRef.current.emit('typing_command', {
                action: 'start',
                code: roomCode,
                text: encryptedText,
                speed: 1 / currentCPS
            });
            setTypingState({
                active: true,
                paused: false,
                progress: 0,
                total: textToTransmit.length
            });
        } else {
            const data = {
                text: encryptedText,
                timestamp: new Date().toISOString(),
                code: roomCode
            };
            socketRef.current.emit('send_text', data);
        }

        setIsSent(true);
        if (typingMode === 'paste') {
            textRef.current = '';
            if (textareaRef.current) {
                textareaRef.current.value = '';
                textareaRef.current.focus();
            }
        }

        setTimeout(() => setIsSent(false), 500);
    };

    const controlTyping = (action) => {
        if (!socketRef.current) return;
        socketRef.current.emit('typing_command', { action, code: roomCode });
        
        if (action === 'pause') setTypingState(prev => ({ ...prev, paused: true }));
        if (action === 'play') setTypingState(prev => ({ ...prev, paused: false }));
        if (action === 'stop') {
            setTypingState(prev => ({ ...prev, active: false }));
            textRef.current = '';
            if (textareaRef.current) textareaRef.current.value = '';
        }
    };

    const handleSpeedChange = (e) => {
        const idx = parseInt(e.target.value);
        setTypingSpeedIndex(idx);
        if (typingState.active) {
            socketRef.current.emit('typing_command', { action: 'speed', code: roomCode, speed: 1 / speedOptions[idx] });
        }
    };

    const resetRoom = () => {
        alert("For Air-Gapped Security, manual room creation is disabled. Please scan the QR code on your Desktop App.");
    };

    if (!isMounted) return <div className="loading-screen">Initializing Secure Connection...</div>;
    
    // V4 Security Lock: Prevent manual access without QR Code
    if (!roomCode || !encryptionKey) {
        return (
            <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="room-card" style={{ textAlign: 'center', padding: '40px' }}>
                    <h1 style={{ color: '#000000', marginBottom: '20px', fontSize: '24px' }}>Air-Gapped Security</h1>
                    <p style={{ color: '#666666', lineHeight: '1.6' }}>To ensure 100% End-to-End Encryption and mathematically prevent Man-in-the-Middle attacks, manual typing is permanently disabled.</p>
                    <p style={{ color: '#111827', fontWeight: 'bold', marginTop: '20px' }}>Please scan the QR code on your Desktop App to securely transfer the keys and connect.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <nav className="navbar">
                <div 
                    className="navbar-brand" 
                    onClick={() => setCurrentView('home')}
                    style={{ cursor: 'pointer' }}
                    title="Go to Home Screen"
                >
                    U19<span className="brand-dot">.</span>
                </div>
                <div className="navbar-status">
                    <div className={`status-indicator ${connected ? 'status-connected' : 'status-waiting'}`}></div>
                    <span className="status-text">{connected ? 'Secure Link Active' : 'Connecting...'}</span>
                </div>
            </nav>

            <main className="main-content">
                {currentView === 'home' ? (
                    <div className="room-card" style={{ textAlign: 'center', padding: '40px' }}>
                        <p className="room-label" style={{ letterSpacing: '1.5px', fontWeight: '600', color: '#6B7280' }}>SECURITY TUNNEL</p>
                        <h2 style={{ color: '#111827', margin: '20px 0', fontSize: '20px', fontWeight: 'bold' }}>Establishing Connection...</h2>
                        <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: '1.5' }}>Awaiting secure desktop receiver authentication handshake.</p>
                    </div>
                ) : (
                    <div className="transmission-card">
                        <div className="mode-toggle">
                            <button 
                                className={`toggle-btn ${typingMode === 'paste' ? 'active' : ''}`}
                                onClick={() => setTypingMode('paste')}
                            >
                                Instant Paste
                            </button>
                            <button 
                                className={`toggle-btn ${typingMode === 'type' ? 'active' : ''}`}
                                onClick={() => setTypingMode('type')}
                            >
                                Live Auto-Type
                            </button>
                        </div>

                        {!typingState.active ? (
                            <div className="input-section">
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                                    <button 
                                        onClick={() => {
                                            textRef.current = '';
                                            if (textareaRef.current) {
                                                textareaRef.current.value = '';
                                                textareaRef.current.focus();
                                            }
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                                        title="Clear all text from the box"
                                    >
                                        Clear Text
                                    </button>
                                </div>
                                <textarea
                                    ref={textareaRef}
                                    className="main-textarea"
                                    placeholder="Enter your text here to transmit securely... (Optimized for ultra-fast performance)"
                                    defaultValue={textRef.current}
                                    onChange={(e) => { textRef.current = e.target.value; }}
                                />
                                
                                {typingMode === 'type' && (
                                    <div className="speed-controller">
                                        <div className="speed-header">
                                            <label>Typing Speed</label>
                                            <span className="speed-value">{currentCPS >= 5000 ? 'MAX' : currentCPS} CPS</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="10" 
                                            step="1" 
                                            value={typingSpeedIndex} 
                                            onChange={handleSpeedChange}
                                            className="modern-slider"
                                        />
                                    </div>
                                )}

                                <button
                                    className={`btn-primary ${isSent ? 'btn-success' : ''}`}
                                    onClick={sendText}
                                    disabled={!connected}
                                >
                                    {isSent ? 'Transmitting...' : (typingMode === 'paste' ? 'Send to Clipboard' : 'Start Auto-Typing')}
                                </button>
                            </div>
                        ) : (
                            <div className="typing-active-section">
                                <h3 className="typing-header">Transmission in Progress</h3>
                                
                                <div className="progress-container">
                                    <div 
                                        className="progress-bar" 
                                        style={{ width: `${(typingState.progress / typingState.total) * 100}%` }}
                                    ></div>
                                </div>
                                
                                <p className="progress-text">
                                    {typingState.progress} / {typingState.total} characters transmitted
                                </p>

                                <div className="control-buttons">
                                    {typingState.paused ? (
                                        <button className="btn-control btn-play" onClick={() => controlTyping('play')}>
                                            Resume
                                        </button>
                                    ) : (
                                        <button className="btn-control btn-pause" onClick={() => controlTyping('pause')}>
                                            Pause
                                        </button>
                                    )}
                                    <button className="btn-control btn-stop" onClick={() => controlTyping('stop')}>
                                        Abort
                                    </button>
                                </div>

                                <div className="speed-controller mt-4">
                                    <div className="speed-header">
                                        <label>Live Speed Adjustment</label>
                                        <span className="speed-value">{currentCPS >= 5000 ? 'MAX' : currentCPS} CPS</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="10" 
                                        step="1" 
                                        value={typingSpeedIndex} 
                                        onChange={handleSpeedChange}
                                        className="modern-slider"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            <footer className="footer">
                <button className="btn-text" onClick={() => setShowPrivacy(true)}>Privacy Policy</button>
            </footer>

            {showPrivacy && (
                <div className="modal-overlay" onClick={() => setShowPrivacy(false)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <h2>Privacy Architecture</h2>
                        <div className="modal-content">
                            <p><strong>Ephemeral Routing:</strong> U19 acts strictly as a transport layer. Data is held in memory for the duration of the socket connection and instantly dropped.</p>
                            <p><strong>Zero Persistence:</strong> We do not log, store, or cache your text payloads on any database or persistent storage medium.</p>
                            <p><strong>Point-to-Point:</strong> Data is directly pushed to the authenticated receiver authenticated via the 6-digit cryptographic room code.</p>
                        </div>
                        <button className="btn-primary w-100" onClick={() => setShowPrivacy(false)}>Acknowledge</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
