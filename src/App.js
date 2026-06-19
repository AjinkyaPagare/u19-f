import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
    const [isMounted, setIsMounted] = useState(false);
    const backendUrl = 'https://u19-b-production.up.railway.app';
    
    // Generate 6-digit room code for sender
    const generateRoomCode = () => {
        return Math.floor(100000 + Math.random() * 900000).toString();
    };

    const [roomCode, setRoomCode] = useState(() => {
        let code = localStorage.getItem('u19_sender_roomCode');
        if (!code) {
            code = generateRoomCode();
            localStorage.setItem('u19_sender_roomCode', code);
        }
        return code;
    });

    const [connected, setConnected] = useState(false);
    const [text, setText] = useState('');
    const [isSent, setIsSent] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);

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
                autoConnect: true,
                transports: ['websocket']
            });

            socketRef.current.on('connect', () => {
                socketRef.current.emit('join_room', { code: code, type: 'sender' });
            });

            socketRef.current.on('room_joined', (data) => {
                if (data.room_active) {
                    setConnected(true);
                } else {
                    setConnected(false);
                }
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
                setTypingState(prev => {
                    const newProgress = data.index;
                    const isDone = newProgress >= data.total;
                    return {
                        ...prev,
                        progress: newProgress,
                        total: data.total,
                        active: !isDone,
                        paused: isDone ? false : prev.paused
                    };
                });
            });

        } catch (error) {
            console.error("Connection error:", error);
            setConnected(false);
        }
    };

    const sendText = () => {
        if (!text || !socketRef.current) return;

        if (typingMode === 'type') {
            socketRef.current.emit('typing_command', {
                action: 'start',
                code: roomCode,
                text: text,
                speed: 1 / currentCPS
            });
            setTypingState({
                active: true,
                paused: false,
                progress: 0,
                total: text.length
            });
        } else {
            const data = {
                text: text,
                timestamp: new Date().toISOString(),
                code: roomCode
            };
            socketRef.current.emit('send_text', data);
        }

        setIsSent(true);
        if (typingMode === 'paste') {
            setText('');
            if (textareaRef.current) textareaRef.current.focus();
        }

        setTimeout(() => setIsSent(false), 1000);
    };

    const controlTyping = (action) => {
        if (!socketRef.current) return;
        socketRef.current.emit('typing_command', { action, code: roomCode });
        
        if (action === 'pause') setTypingState(prev => ({ ...prev, paused: true }));
        if (action === 'play') setTypingState(prev => ({ ...prev, paused: false }));
        if (action === 'stop') {
            setTypingState(prev => ({ ...prev, active: false }));
            setText('');
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
        const newCode = generateRoomCode();
        localStorage.setItem('u19_sender_roomCode', newCode);
        setRoomCode(newCode);
    };

    if (!isMounted) return <div className="loading-screen">Initializing Secure Connection...</div>;

    return (
        <div className="app-container">
            <nav className="navbar">
                <div className="navbar-brand">U19<span className="brand-dot">.</span></div>
                <div className="navbar-status">
                    <div className={`status-indicator ${connected ? 'status-connected' : 'status-waiting'}`}></div>
                    <span className="status-text">{connected ? 'Connected' : 'Waiting for Receiver'}</span>
                </div>
            </nav>

            <main className="main-content">
                <div className="room-card">
                    <p className="room-label">SECURE ROOM CODE</p>
                    <h1 className="room-code">{roomCode}</h1>
                    <div className="room-actions">
                        <button 
                            className="btn-secondary"
                            onClick={() => {
                                navigator.clipboard.writeText(roomCode);
                                const btn = document.activeElement;
                                const original = btn.textContent;
                                btn.textContent = 'Copied!';
                                setTimeout(() => btn.textContent = original, 1500);
                            }}
                        >
                            Copy Code
                        </button>
                        <button className="btn-secondary btn-outline" onClick={resetRoom}>
                            New Room
                        </button>
                    </div>
                </div>

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
                            <textarea
                                ref={textareaRef}
                                className="main-textarea"
                                placeholder="Enter your text here to transmit securely..."
                                value={text}
                                onChange={(e) => setText(e.target.value)}
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
                                    <div className="speed-labels">
                                        <span>Slow</span>
                                        <span>Fast</span>
                                    </div>
                                </div>
                            )}

                            <button
                                className={`btn-primary ${isSent ? 'btn-success' : ''}`}
                                onClick={sendText}
                                disabled={!connected || !text}
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
