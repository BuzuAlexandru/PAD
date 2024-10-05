const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const timeout = require('connect-timeout');
const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');

const { ACCOUNT_SERVICE_URL, GACHA_SERVICE_URL } = require('./config');

const app = express();
app.use(express.json());

 // app.use(timeout('30s'));

const wsProxy = createProxyMiddleware('/gacha/banner', {
    target: GACHA_SERVICE_URL,
    changeOrigin: true,
    ws: true,
});

// app.use('/gacha/banner', wsProxy);

// Concurrent request limiter (limits to 10 requests per minute per user)
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});

app.use(limiter);

// Middleware to handle timeouts
function haltOnTimedOut(req, res, next) {
    if (!req.timedout) next();
}
app.get('/status', haltOnTimedOut, async (req, res) => {
    try {
        const accountServiceResponse = await axios.get(`${ACCOUNT_SERVICE_URL}/status`, { timeout: 3000 });
        const gachaServiceResponse = await axios.get(`${GACHA_SERVICE_URL}/status`, { timeout: 3000 });

        res.json({
            accountServiceStatus: accountServiceResponse.data,
            gachaServiceStatus: gachaServiceResponse.data,
            message: "Gateway is operational"
        });
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ message: 'Request to service timed out.' });
        }
        res.status(500).json({ message: 'Error checking service statuses', error: error.message });
    }
});
// 1. Route to connect to the Account Service
app.post('/register', haltOnTimedOut, async (req, res) => {
    try {
        const response = await axios.post(`${ACCOUNT_SERVICE_URL}/register`, req.body, { timeout: 3000 });
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.post('/login', haltOnTimedOut, async (req, res) => {
    try {
        const response = await axios.post(`${ACCOUNT_SERVICE_URL}/login`, req.body, { timeout: 3000 });
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.get('/currency', haltOnTimedOut, async (req, res) => {
    try {
        const response = await axios.get(`${ACCOUNT_SERVICE_URL}/currency`, { timeout: 3000 }, {
            headers: { Authorization: req.headers.authorization },
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.post('/buy-currency', haltOnTimedOut, async (req, res) => {
    try {
        const response = await axios.post(`${ACCOUNT_SERVICE_URL}/buy-currency`, req.body, { timeout: 3000 }, {
            headers: { Authorization: req.headers.authorization },
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

// 2. Route to connect to the Gacha Service
app.get('/items', haltOnTimedOut, async (req, res) => {
    try {
        const response = await axios.get(`${GACHA_SERVICE_URL}/items`, { timeout: 3000 });
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.get('/chances', haltOnTimedOut, async (req, res) => {
    try {
        const response = await axios.get(`${GACHA_SERVICE_URL}/chances`, { timeout: 3000 });
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

const server = app.listen(3000, () => {
    console.log('Gateway running on port 3000');
});

// Setup WebSocket server (proxy WebSocket traffic to Gacha Service)
const wss = new WebSocket.Server({ server });
const GACHA_SOCKET_URL = 'ws://localhost:5001/gacha';  // URL of your gacha service WebSocket

// Handle WebSocket connections
wss.on('connection', function connection(ws, req) {
    console.log('Client connected to gateway WebSocket');

    // Listen for messages from the client
    ws.on('message', async function incoming(message) {
        console.log('Received message from client:', message);

        const data = JSON.parse(message);

        // Forward request to the Gacha service WebSocket
        const gachaWs = new WebSocket(`${GACHA_SOCKET_URL}/banner/${data.banner_id}`);

        // When Gacha service connection is open
        gachaWs.on('open', function open() {
            // Forward the user data to the Gacha service
            gachaWs.send(JSON.stringify({
                user_id: data.user_id,
                token: data.token
            }));
        });

        // Listen for messages from Gacha service and forward it to the client
        gachaWs.on('message', function incoming(gachaMessage) {
            console.log('Received message from Gacha service:', gachaMessage);

            // Forward the message from Gacha service back to the client
            ws.send(gachaMessage);
        });

        // Handle errors in Gacha service WebSocket
        gachaWs.on('error', function error(err) {
            console.error('Error in Gacha service WebSocket:', err);
            ws.send(JSON.stringify({ error: 'Gacha service error' }));
        });
    });

    // Handle WebSocket close events
    ws.on('close', function close() {
        console.log('Client disconnected from gateway WebSocket');
    });

    // Handle WebSocket errors
    ws.on('error', function error(err) {
        console.error('Error in client WebSocket:', err);
    });
});

// Error handling for service calls
function handleServiceError(res, error) {

    if (error.code === 'ERR_HTTP_HEADERS_SENT') {
            return res.status(504).json({ message: 'Request to service timed out after 3 seconds.' })}
    else if (error.response) {
        res.status(error.response.status).json(error.response.data);
    } else {
        res.status(500).json({ error: 'Service Unavailable' });
    }
}

// // Start server
// app.listen(3000, () => {
//     console.log('Gateway is running on port 3000');
// });
