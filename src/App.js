import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
    const [text, setText] = useState('');
    const [backendUrl, setBackendUrl] = useState(
        localStorage.getItem('backend_url') || 'https://u19.onrender.com'
    );
    // Default code 1234
    const [roomCode, setRoomCode] = useState(
        localStorage.getItem('room_code') || '1234'
    );

    const [connected, setConnected] = useState(false);
    const [isSent, setIsSent] = useState(false);

    const socketRef = useRef(null);

    useEffect(() => {
        connectSocket(backendUrl, roomCode);
        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    const connectSocket = (url, code) => {
        if (socketRef.current) socketRef.current.disconnect();

        try {
            socketRef.current = io(url);

            socketRef.current.on('connect', () => {
                setConnected(true);
                // Start by joining the room
                socketRef.current.emit('join_room', { code: code, type: 'sender' });
            });

            socketRef.current.on('disconnect', () => {
                setConnected(false);
            });
        } catch (error) {
            console.error("Connection error:", error);
            setConnected(false);
        }
    };

    const handleUrlChange = (e) => {
        const newUrl = e.target.value;
        setBackendUrl(newUrl);
        localStorage.setItem('backend_url', newUrl);
        connectSocket(newUrl, roomCode);
    };

    const handleCodeChange = (e) => {
        const newCode = e.target.value;
        setRoomCode(newCode);
        localStorage.setItem('room_code', newCode);
        // Reconnect to join new room
        connectSocket(backendUrl, newCode);
    };

    const sendText = () => {
        if (!text || !socketRef.current) return;

        const data = {
            text: text,
            timestamp: new Date().toISOString(),
            code: roomCode // SEND TO THIS ROOM
        };

        socketRef.current.emit('send_text', data);

        setIsSent(true);
        setTimeout(() => setIsSent(false), 1000);
    };

    return (
        <div className="App">
            <div className="header">Secure Text Sync 🔒</div>
            <div className="container">

                <div className="status-bar">
                    <div className={`status-dot ${connected ? 'connected' : ''}`}></div>
                    <span>{connected ? `Connected: Room ${roomCode}` : "Disconnected"}</span>
                </div>

                <div className="input-area">
                    <textarea
                        placeholder="Type text to send..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                    />
                    <button
                        onClick={sendText}
                        className={isSent ? 'sent' : ''}
                    >
                        {isSent ? <span><span>Sent!</span> ✅</span> : <span><span>Send Securely</span> 🚀</span>}
                    </button>
                </div>

                <div className="config-area">
                    <label style={{ fontSize: '0.9rem', color: '#666' }}>Backend URL:</label>
                    <input
                        type="text"
                        className="config-input"
                        value={backendUrl}
                        onChange={handleUrlChange}
                    />

                    <label style={{ fontSize: '0.9rem', color: '#666', marginTop: '10px', display: 'block' }}>Connection Code (Room):</label>
                    <input
                        type="text"
                        className="config-input"
                        value={roomCode}
                        onChange={handleCodeChange}
                        placeholder="e.g. 1234"
                    />

                    <div style={{ marginTop: '20px', padding: '15px', background: '#f8f9ff', borderRadius: '8px', textAlign: 'center' }}>
                        <label style={{ fontSize: '0.9rem', color: '#666', display: 'block', marginBottom: '10px' }}>Download Receiver App:</label>
                        <a
                            href="/TextSync_Receiver.zip"
                            download
                            style={{
                                display: 'inline-block',
                                padding: '12px 24px',
                                background: '#28a745',
                                color: 'white',
                                textDecoration: 'none',
                                borderRadius: '8px',
                                fontWeight: '600',
                                fontSize: '0.95rem'
                            }}
                        >
                            📥 Download for Windows (16 MB)
                        </a>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default App;

