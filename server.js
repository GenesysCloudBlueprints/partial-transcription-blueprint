require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { WebSocket: WS } = require('ws');
const http = require('http');
const platformClient = require('purecloud-platform-client-v2');

const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

const client = platformClient.ApiClient.instance;
const environment = process.env.GENESYS_REGION || 'mypurecloud.com';
client.setEnvironment(environment);

const clientId = process.env.GENESYS_CLIENT_ID;
const clientSecret = process.env.GENESYS_CLIENT_SECRET;

let authenticated = false;
let tokenExpiresAt = 0;

async function ensureAuth() {
    const now = Date.now();
    if (!authenticated || now >= tokenExpiresAt) {
        try {
            const data = await client.loginClientCredentialsGrant(clientId, clientSecret);
            authenticated = true;
            // Set expiry 60s before actual to avoid edge cases
            tokenExpiresAt = now + ((data.tokenExpiryTime || 3600) * 1000) - 60000;
            console.log('Authenticated with Client Credentials');
        } catch (err) {
            authenticated = false;
            console.error('Auth failed:', err.status, err.body || err.message);
            throw err;
        }
    }
}

// Expose token endpoint for WebSocket auth (restricted to localhost)
app.get('/auth/token', async (req, res) => {
    const origin = req.headers.origin || '';
    if (origin && origin !== 'http://localhost:3000') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        await ensureAuth();
        res.json({ token: client.authData.accessToken });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Proxy endpoint — forwards requests to Genesys Cloud API
app.use('/api', async (req, res) => {
    try {
        await ensureAuth();
        const apiPath = req.originalUrl.replace(/^\/api/, '');
        const url = `https://api.${environment}/api${apiPath}`;
        const headers = {
            'Authorization': `Bearer ${client.authData.accessToken}`,
            'Content-Type': 'application/json',
        };
        const fetchOpts = { method: req.method, headers };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOpts.body = JSON.stringify(req.body);
        }
        const response = await fetch(url, fetchOpts);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error('Proxy error:', err.message);
        if (err.status === 401) authenticated = false;
        res.status(err.status || 500).json({ error: err.message });
    }
});

// WebSocket proxy — relays Genesys Cloud streaming to browser clients
const server = http.createServer(app);
const PORT = 3001;

server.on('upgrade', (req, socket, head) => {
    // Extract the Genesys Cloud WebSocket URI from the query param
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const targetUri = url.searchParams.get('target');
    if (!targetUri || !targetUri.startsWith('wss://streaming.')) {
        socket.destroy();
        return;
    }

    const gcWs = new WS(targetUri);
    let clientWs = null;

    gcWs.on('open', () => {
        // Complete the WebSocket handshake with the browser
        const key = req.headers['sec-websocket-key'];
        const accept = require('crypto')
            .createHash('sha1')
            .update(key + '258EAFA5-E914-47DA-95CA-5AB0FAC11E5C')
            .digest('base64');

        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n` +
            '\r\n'
        );
        clientWs = socket;

        // Relay messages from Genesys Cloud to browser
        gcWs.on('message', (data) => {
            if (clientWs && clientWs.writable) {
                // Forward raw WebSocket frame data
                const payload = data.toString();
                const payloadLen = Buffer.byteLength(payload);
                let frame;
                if (payloadLen < 126) {
                    frame = Buffer.alloc(2 + payloadLen);
                    frame[0] = 0x81;
                    frame[1] = payloadLen;
                    Buffer.from(payload).copy(frame, 2);
                } else if (payloadLen < 65536) {
                    frame = Buffer.alloc(4 + payloadLen);
                    frame[0] = 0x81;
                    frame[1] = 126;
                    frame.writeUInt16BE(payloadLen, 2);
                    Buffer.from(payload).copy(frame, 4);
                } else {
                    frame = Buffer.alloc(10 + payloadLen);
                    frame[0] = 0x81;
                    frame[1] = 127;
                    frame.writeBigUInt64BE(BigInt(payloadLen), 2);
                    Buffer.from(payload).copy(frame, 10);
                }
                clientWs.write(frame);
            }
        });
    });

    gcWs.on('close', () => socket.destroy());
    gcWs.on('error', () => socket.destroy());
    socket.on('close', () => gcWs.close());
    socket.on('error', () => gcWs.close());
});

server.listen(PORT, () => {
    console.log(`Genesys Cloud proxy server running on port ${PORT}`);
    console.log(`Environment: ${environment}`);
});
