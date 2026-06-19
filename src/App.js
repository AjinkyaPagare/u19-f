import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
    const [mode, setMode] = useState('selection'); // Default to selection, avoid null
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Safety check for mounting
    const [text, setText] = useState('');
    const backendUrl = 'https://web-production-0e636.up.railway.app';

    // Sender: generates room code
    const [roomCode, setRoomCode] = useState('');

    // Receiver: enters room code
    const [inputRoomCode, setInputRoomCode] = useState('');
    const [joined, setJoined] = useState(false);
    const [connected, setConnected] = useState(false); // Fixed: Added missing state

    const [isWaiting, setIsWaiting] = useState(false); // NEW: Track waiting state
    const [isSent, setIsSent] = useState(false);
    const [receivedMessages, setReceivedMessages] = useState([]);
    const [showPrivacy, setShowPrivacy] = useState(false); // NEW: Privacy Policy Toggle

    const socketRef = useRef(null);
    const textareaRef = useRef(null); // Ref to keep keyboard open
    const connectionTimeoutRef = useRef(null); // Track connection timeout

    // Generate 6-digit room code for sender
    const generateRoomCode = () => {
        return Math.floor(100000 + Math.random() * 900000).toString();
    };

    useEffect(() => {
        if (mode === 'sender') {
            const code = generateRoomCode();
            setRoomCode(code);
            connectSocket(code, 'sender');
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
                // DON'T set connected=true yet! Wait for room status
                socketRef.current.emit('join_room', { code: code, type: deviceType });
            });

            // ONLY set connected when room is ACTIVE (both sender & receiver present)
            socketRef.current.on('room_joined', (data) => {
                console.log('Room joined:', data);

                if (data.room_active) {
                    console.log('✅ Room is ACTIVE - both participants present');
                    setConnected(true);
                    setIsWaiting(false);
                } else {
                    console.log('⏳ Waiting for other participant...');
                    console.log(`Has sender: ${data.has_sender}, Has receiver: ${data.has_receiver}`);
                    setConnected(false);  // NOT connected until both are there
                    setIsWaiting(true);   // Show waiting status
                }
            });

            // Room becomes active when other participant joins
            socketRef.current.on('room_status', (data) => {
                console.log('Room status updated:', data);
                if (data.status === 'active') {
                    setConnected(true);
                    setIsWaiting(false);
                    // Clear timeout if room becomes active
                    if (connectionTimeoutRef.current) {
                        clearTimeout(connectionTimeoutRef.current);
                        connectionTimeoutRef.current = null;
                    }
                } else if (data.status === 'sender_left') {
                    // Do NOT disconnect. Just show waiting status.
                    console.log('Sender left - waiting for return');
                    setConnected(false);
                    setIsWaiting(true);
                }
            });

            socketRef.current.on('disconnect', () => {
                console.log('Socket disconnected');
                setConnected(false);
            });

            socketRef.current.on('connect_error', (error) => {
                console.error('Connection error:', error);
                setConnected(false);
            });

            socketRef.current.on('error', (error) => {
                console.error('Socket error:', error);
                setConnected(false);
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

        // Timeout removed for persistent connection
        // connectionTimeoutRef.current = setTimeout(...)
    };

    const sendText = () => {
        if (!text || !socketRef.current) return;

        const data = {
            text: text,
            timestamp: new Date().toISOString(),
            code: roomCode
        };

        socketRef.current.emit('send_text', data);

        setIsSent(true);
        setText('');

        // KEEP KEYBOARD OPEN - Refocus IMMEDIATELY before keyboard can close
        if (textareaRef.current) {
            textareaRef.current.focus();
        }

        setTimeout(() => setIsSent(false), 1000);
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

                    <div className="input-area">
                        <textarea
                            ref={textareaRef}
                            placeholder="Type your message here... (Press Enter to send, Shift+Enter for new line)"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                // Press Enter to send (Shift+Enter for new line)
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault(); // Prevent new line
                                    sendText();
                                }
                            }}
                            autoFocus
                        />
                        <button
                            onClick={sendText}
                            className={isSent ? 'sent' : ''}
                            disabled={!connected}
                            onMouseDown={(e) => {
                                // Prevent button from stealing focus
                                e.preventDefault();
                            }}
                            onTouchStart={(e) => {
                                // Prevent keyboard close on mobile
                                e.preventDefault();
                                sendText();
                            }}
                        >
                            {isSent ? <span>Sent! ✅</span> : <span>Send Securely 🚀</span>}
                        </button>
                    </div>

                    <button
                        className="back-button"
                        onClick={() => {
                            setMode(null);
                            if (socketRef.current) socketRef.current.disconnect();
                        }}
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
                            onClick={() => setMode('selection')}
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
                        onClick={() => {
                            setMode('selection');
                            setJoined(false);
                            setInputRoomCode('');
                            if (socketRef.current) socketRef.current.disconnect();
                        }}
                    >
                        ← Leave Room
                    </button>

                </div>
            </div>
        );
    }
}

export default App;


