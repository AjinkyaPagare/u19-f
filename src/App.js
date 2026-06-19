import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
    const [mode, setMode] = useState(() => localStorage.getItem('u19_mode') || 'selection');
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const [text, setText] = useState('');
    const backendUrl = 'https://u19-b-production.up.railway.app';

    const [roomCode, setRoomCode] = useState(() => localStorage.getItem('u19_roomCode') || '');
    const [inputRoomCode, setInputRoomCode] = useState(() => localStorage.getItem('u19_inputRoomCode') || '');
    const [joined, setJoined] = useState(() => localStorage.getItem('u19_joined') === 'true');
    const [connected, setConnected] = useState(false);

    const [isWaiting, setIsWaiting] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [receivedMessages, setReceivedMessages] = useState(() => {
        const saved = localStorage.getItem('u19_messages');
        return saved ? JSON.parse(saved) : [];
    });
    const [showPrivacy, setShowPrivacy] = useState(false);

    const socketRef = useRef(null);

    // Sync to localStorage
    useEffect(() => { localStorage.setItem('u19_mode', mode || 'selection'); }, [mode]);
    useEffect(() => { localStorage.setItem('u19_roomCode', roomCode); }, [roomCode]);
    useEffect(() => { localStorage.setItem('u19_inputRoomCode', inputRoomCode); }, [inputRoomCode]);
    useEffect(() => { localStorage.setItem('u19_joined', joined); }, [joined]);
    useEffect(() => { localStorage.setItem('u19_messages', JSON.stringify(receivedMessages)); }, [receivedMessages]);

    const resetState = () => {
        setMode('selection');
        setRoomCode('');
        setInputRoomCode('');
        setJoined(false);
        setReceivedMessages([]);
        localStorage.removeItem('u19_mode');
        localStorage.removeItem('u19_roomCode');
        localStorage.removeItem('u19_inputRoomCode');
        localStorage.removeItem('u19_joined');
        localStorage.removeItem('u19_messages');
        if (socketRef.current) socketRef.current.disconnect();
    };
    const textareaRef = useRef(null); // Ref to keep keyboard open
    const connectionTimeoutRef = useRef(null); // Track connection timeout

    // Generate 6-digit room code for sender
    const generateRoomCode = () => {
        return Math.floor(100000 + Math.random() * 900000).toString();
    };

    useEffect(() => {
        if (mode === 'sender') {
            let code = localStorage.getItem('u19_roomCode');
            if (!code) {
                code = generateRoomCode();
                setRoomCode(code);
            }
            connectSocket(code, 'sender');
        } else if (mode === 'receiver') {
            const savedJoined = localStorage.getItem('u19_joined') === 'true';
            const savedCode = localStorage.getItem('u19_inputRoomCode');
            if (savedJoined && savedCode && savedCode.length === 6) {
                connectSocket(savedCode, 'receiver');
            }
        }
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [mode]);

    // BACKGROUND PERSISTENCE: Handle app resume / visibility change
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('App active - verifying connection...');
                if (socketRef.current) {
                    if (!socketRef.current.connected) {
                        console.log('⚠️ Reconnecting socket immediately...');
                        socketRef.current.connect();
                    } else {
                        // Send heartbeat to ensure link is truly alive
                        socketRef.current.emit('ping_keepalive');
                    }
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // HEARTBEAT: Keep connection active
    useEffect(() => {
        const interval = setInterval(() => {
            if (socketRef.current && socketRef.current.connected) {
                // Lightweight packet to keep transport open
                socketRef.current.emit('ping_keepalive');
            }
        }, 25000); // 25s (under typical 60s timeout)
        return () => clearInterval(interval);
    }, []);

    // Typing Controls State
    const [typingMode, setTypingMode] = useState('paste'); // 'paste' or 'type'
    const [typingSpeed, setTypingSpeed] = useState(20); // characters per second
    const [typingState, setTypingState] = useState({
        active: false,
        paused: false,
        progress: 0,
        total: 0
    });

    const connectSocket = (code, deviceType) => {
        if (socketRef.current) socketRef.current.disconnect();

        try {
            socketRef.current = io(backendUrl, {
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                autoConnect: true,
                transports: ['websocket', 'polling']
            });

            socketRef.current.on('connect', () => {
                console.log('Socket connected, joining room...');
                socketRef.current.emit('join_room', { code: code, type: deviceType });
            });

            socketRef.current.on('room_joined', (data) => {
                console.log('Room joined:', data);
                if (data.room_active) {
                    setConnected(true);
                    setIsWaiting(false);
                } else {
                    setConnected(false);
                    setIsWaiting(true);
                }
            });

            socketRef.current.on('room_status', (data) => {
                console.log('Room status updated:', data);
                if (data.status === 'active') {
                    setConnected(true);
                    setIsWaiting(false);
                    if (connectionTimeoutRef.current) {
                        clearTimeout(connectionTimeoutRef.current);
                        connectionTimeoutRef.current = null;
                    }
                } else if (data.status === 'sender_left') {
                    setConnected(false);
                    setIsWaiting(true);
                }
            });

            socketRef.current.on('disconnect', () => {
                console.log('Socket disconnected');
                setConnected(false);
            });

            socketRef.current.on('typing_progress', (data) => {
                if (deviceType === 'sender') {
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
                }
            });

            if (deviceType === 'receiver') {
                socketRef.current.on('receive_text', (data) => {
                    const msg = {
                        text: data.text,
                        time: new Date().toLocaleTimeString()
                    };
                    setReceivedMessages(prev => [...prev, msg]);
                });
            }
        } catch (error) {
            console.error("Connection error:", error);
            setConnected(false);
        }
    };

    const joinRoom = () => {
        if (inputRoomCode.length !== 6) {
            alert('Please enter a valid 6-digit room code');
            return;
        }
        setJoined(true);
        connectSocket(inputRoomCode, 'receiver');
    };

    const sendText = () => {
        if (!text || !socketRef.current) return;

        if (typingMode === 'type') {
            socketRef.current.emit('typing_command', {
                action: 'start',
                code: roomCode,
                text: text,
                speed: 1 / typingSpeed
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
        // We do NOT clear the text in auto-type mode immediately so they can see what's typing
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
        const val = parseFloat(e.target.value);
        setTypingSpeed(val);
        if (typingState.active) {
            socketRef.current.emit('typing_command', { action: 'speed', code: roomCode, speed: 1 / val });
        }
    };

    // Safety check for mounting - placed AFTER all hooks
    if (!isMounted) return <div style={{ padding: 20 }}>Loading Interface...</div>;

    // Mode selection screen
    if (mode === 'selection' || mode === null) {
        return (
            <div className="App mode-selection">
                <div className="header">🔒 U19</div>
                <div className="container">
                    <h2 style={{ color: '#007bff', marginBottom: '30px' }}>U19 Secure</h2>

                    <button
                        className="mode-button sender-btn"
                        onClick={() => setMode('sender')}
                    >
                        <div style={{ fontSize: '48px' }}>📤</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Send</div>
                        <div style={{ fontSize: '14px', opacity: 0.8 }}>Securely send data</div>
                    </button>

                    <button
                        className="mode-button receiver-btn"
                        onClick={() => setMode('receiver')}
                    >
                        <div style={{ fontSize: '48px' }}>📥</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Receive</div>
                        <div style={{ fontSize: '14px', opacity: 0.8 }}>Securely receive data</div>
                    </button>

                    <div style={{ marginTop: '40px', textAlign: 'center' }}>
                        <button
                            onClick={() => setShowPrivacy(true)}
                            style={{
                                background: 'transparent',
                                color: '#64748b',
                                fontSize: '12px',
                                textDecoration: 'underline',
                                padding: '10px'
                            }}
                        >
                            Privacy Policy
                        </button>
                    </div>
                </div>

                {showPrivacy && (
                    <div className="modal-overlay" onClick={() => setShowPrivacy(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <h3>Privacy Policy</h3>
                            <div className="policy-text">
                                <p><strong>1. Introduction</strong>: U19 is a secure text transfer utility. No personal data is collected or shared.</p>
                                <p><strong>2. Data Handling</strong>: All text transfers are encrypted in transit and kept in memory only. We do not store any message history on our servers.</p>
                                <p><strong>3. Security</strong>: Rooms are temporary and expire after interaction. We use real-time socket communication for direct delivery.</p>
                                <p><strong>4. Third Parties</strong>: We do not share data with any third parties.</p>
                            </div>
                            <button onClick={() => setShowPrivacy(false)}>Close</button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Sender Mode
    if (mode === 'sender') {
        return (
            <div className="App">
                <div className="header">📤 U19</div>
                <div className="container">

                    <div className="status-bar">
                        <div className={`status-dot ${connected ? 'connected' : (isWaiting ? 'waiting' : '')}`}></div>
                        <span>
                            {connected ? '✅ Connected - Receiver Online' :
                                isWaiting ? '⏳ Waiting for Receiver...' :
                                    'Connecting...'}
                        </span>
                    </div>

                    {/* Room Code Display */}
                    <div className="room-code-display">
                        <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '10px' }}>
                            📡 Your Room Code
                        </div>
                        <div style={{ fontSize: '36px', fontWeight: 'bold', letterSpacing: '8px', color: '#007bff' }}>
                            {roomCode}
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '10px' }}>
                            Share this code with receiver
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(roomCode);
                                const btn = document.activeElement;
                                const originalText = btn.textContent;
                                btn.textContent = '✅ Copied!';
                                btn.style.backgroundColor = '#28a745';
                                setTimeout(() => {
                                    btn.textContent = originalText;
                                    btn.style.backgroundColor = '#007bff';
                                }, 1500);
                            }}
                            style={{
                                marginTop: '15px',
                                padding: '10px 25px',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                backgroundColor: '#007bff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.3s'
                            }}
                        >
                            📋 Copy Code
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <button 
                            onClick={() => setTypingMode('paste')}
                            style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', background: typingMode === 'paste' ? '#007bff' : 'white', color: typingMode === 'paste' ? 'white' : 'black' }}
                        >⚡ Instant Paste</button>
                        <button 
                            onClick={() => setTypingMode('type')}
                            style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', background: typingMode === 'type' ? '#007bff' : 'white', color: typingMode === 'type' ? 'white' : 'black' }}
                        >⌨️ Live Auto-Type</button>
                    </div>

                    {!typingState.active ? (
                        <div className="input-area">
                            <textarea
                                ref={textareaRef}
                                placeholder="Type your message here... (Press Enter to send)"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendText();
                                    }
                                }}
                                autoFocus
                            />
                            
                            {typingMode === 'type' && (
                                <div style={{marginTop: '10px', marginBottom: '10px'}}>
                                    <label style={{display: 'block', fontSize: '14px', marginBottom: '5px'}}>Typing Speed: {typingSpeed} chars / sec</label>
                                    <input 
                                        type="range" 
                                        min="2" 
                                        max="100" 
                                        step="1" 
                                        value={typingSpeed} 
                                        onChange={handleSpeedChange}
                                        style={{width: '100%'}}
                                    />
                                    <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#666'}}>
                                        <span>Slow</span>
                                        <span>Fast</span>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={sendText}
                                className={isSent ? 'sent' : ''}
                                disabled={!connected}
                            >
                                {isSent ? <span>Started! ✅</span> : <span>{typingMode === 'paste' ? 'Send & Paste 🚀' : 'Start Typing ⌨️'}</span>}
                            </button>
                        </div>
                    ) : (
                        <div className="typing-control-panel" style={{ background: '#f8f9fa', padding: '20px', borderRadius: '10px', border: '2px solid #007bff', marginTop: '20px' }}>
                            <h3 style={{marginTop: 0, color: '#007bff'}}>⌨️ Live Auto-Typing</h3>
                            <div style={{ background: '#e9ecef', borderRadius: '5px', height: '20px', overflow: 'hidden', marginBottom: '10px' }}>
                                <div style={{ background: '#28a745', height: '100%', width: `${(typingState.progress / typingState.total) * 100}%`, transition: 'width 0.2s' }}></div>
                            </div>
                            <p style={{textAlign: 'center', fontSize: '14px', margin: '5px 0 15px'}}>
                                Typed: {typingState.progress} / {typingState.total} characters
                            </p>

                            <div style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
                                {typingState.paused ? (
                                    <button onClick={() => controlTyping('play')} style={{flex: 1, padding: '15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontSize:'18px'}}>▶️ Resume</button>
                                ) : (
                                    <button onClick={() => controlTyping('pause')} style={{flex: 1, padding: '15px', background: '#ffc107', color: 'black', border: 'none', borderRadius: '5px', fontSize:'18px'}}>⏸️ Pause</button>
                                )}
                                <button onClick={() => controlTyping('stop')} style={{flex: 1, padding: '15px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', fontSize:'18px'}}>⏹️ Stop</button>
                            </div>

                            <label style={{display: 'block', fontSize: '14px', marginBottom: '5px'}}>Adjust Speed: {typingSpeed} chars / sec</label>
                            <input 
                                type="range" 
                                min="2" 
                                max="100" 
                                step="1" 
                                value={typingSpeed} 
                                onChange={handleSpeedChange}
                                style={{width: '100%'}}
                            />
                            <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#666'}}>
                                <span>Slow</span>
                                <span>Fast</span>
                            </div>
                        </div>
                    )}

                    <button
                        className="back-button"
                        onClick={resetState}
                    >
                        ← Change Mode
                    </button>

                </div>
            </div>
        );
    }

    // Receiver Mode
    if (mode === 'receiver') {
        if (!joined) {
            return (
                <div className="App">
                    <div className="header">📥 U19</div>
                    <div className="container">
                        <h3 style={{ color: '#28a745', marginBottom: '20px' }}>Enter Room Code</h3>

                        <div className="room-input-section">
                            <input
                                type="text"
                                className="room-code-input"
                                placeholder="000000"
                                maxLength={6}
                                value={inputRoomCode}
                                onChange={(e) => setInputRoomCode(e.target.value.replace(/\D/g, ''))}
                                style={{
                                    fontSize: '32px',
                                    textAlign: 'center',
                                    letterSpacing: '10px',
                                    padding: '20px',
                                    border: '3px solid #28a745',
                                    borderRadius: '12px',
                                    marginBottom: '20px',
                                    width: '100%',
                                    fontWeight: 'bold'
                                }}
                            />

                            <button
                                onClick={joinRoom}
                                style={{
                                    background: 'linear-gradient(135deg, #28a745, #20c997)',
                                    fontSize: '18px',
                                    padding: '18px',
                                    width: '100%'
                                }}
                            >
                                🚪 Join Room
                            </button>
                        </div>

                        <button
                            className="back-button"
                            onClick={resetState}
                        >
                            ← Change Mode
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="App">
                <div className="header">📥 Receiving from Room {inputRoomCode}</div>
                <div className="container">

                    <div className="status-bar">
                        <div className={`status-dot ${connected ? 'connected' : (isWaiting ? 'waiting' : '')}`}></div>
                        <span>
                            {connected ? `✅ Connected to Room ${inputRoomCode}` :
                                isWaiting ? '⏳ Waiting for Sender...' :
                                    'Connecting...'}
                        </span>
                    </div>

                    <div className="messages-area">
                        <h4 style={{ color: '#28a745', marginBottom: '15px' }}>📩 Received Messages:</h4>
                        <div className="messages-list">
                            {receivedMessages.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
                                    Waiting for messages...
                                </div>
                            ) : (
                                receivedMessages.map((msg, index) => (
                                    <div key={index} className="message-item">
                                        <div className="message-time">{msg.time}</div>
                                        <div className="message-text">{msg.text}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <button
                        className="back-button"
                        onClick={resetState}
                    >
                        ← Leave Room
                    </button>

                </div>
            </div>
        );
    }
}

export default App;


