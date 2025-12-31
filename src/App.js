import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
    const [mode, setMode] = useState(null); // 'sender' or 'receiver'
    const [text, setText] = useState('');
    const backendUrl = 'https://u19-backend-production.up.railway.app';

    // Sender: generates room code
    const [roomCode, setRoomCode] = useState('');

    // Receiver: enters room code
    const [inputRoomCode, setInputRoomCode] = useState('');
    const [joined, setJoined] = useState(false);

    const [connected, setConnected] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [receivedMessages, setReceivedMessages] = useState([]);

    const socketRef = useRef(null);
    const textareaRef = useRef(null); // Ref to keep keyboard open

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

    const connectSocket = (code, deviceType) => {
        if (socketRef.current) socketRef.current.disconnect();

        try {
            socketRef.current = io(backendUrl);

            socketRef.current.on('connect', () => {
                setConnected(true);
                socketRef.current.emit('join_room', { code: code, type: deviceType });
            });

            socketRef.current.on('disconnect', () => {
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

    // Mode selection screen
    if (!mode) {
        return (
            <div className="App mode-selection">
                <div className="header">🔒 Secure Text Sync</div>
                <div className="container">
                    <h2 style={{ color: '#007bff', marginBottom: '30px' }}>Choose Your Mode</h2>

                    <button
                        className="mode-button sender-btn"
                        onClick={() => setMode('sender')}
                    >
                        <div style={{ fontSize: '48px' }}>📤</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Sender</div>
                        <div style={{ fontSize: '14px', opacity: 0.8 }}>Send text to receiver</div>
                    </button>

                    <button
                        className="mode-button receiver-btn"
                        onClick={() => setMode('receiver')}
                    >
                        <div style={{ fontSize: '48px' }}>📥</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Receiver</div>
                        <div style={{ fontSize: '14px', opacity: 0.8 }}>Receive text messages</div>
                    </button>
                </div>
            </div>
        );
    }

    // Sender Mode
    if (mode === 'sender') {
        return (
            <div className="App">
                <div className="header">📤 Secure Sender</div>
                <div className="container">

                    <div className="status-bar">
                        <div className={`status-dot ${connected ? 'connected' : ''}`}></div>
                        <span>{connected ? 'Connected' : 'Connecting...'}</span>
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
                    </div>

                    <div className="input-area">
                        <textarea
                            ref={textareaRef}
                            placeholder="Type your message here..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
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
                    <div className="header">📥 Secure Receiver</div>
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
                            onClick={() => setMode(null)}
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
                        <div className={`status-dot ${connected ? 'connected' : ''}`}></div>
                        <span>{connected ? `Connected to Room ${inputRoomCode}` : 'Connecting...'}</span>
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
                            setMode(null);
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


