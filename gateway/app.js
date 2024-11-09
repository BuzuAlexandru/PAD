const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const timeout = require('connect-timeout');
const { createProxyMiddleware } = require('http-proxy-middleware');
const CircuitBreaker = require('opossum');
const { ACCOUNT_SERVICE_URL, GACHA_SERVICE_URL } = require('./config');

const app = express();
app.use(express.json());

 // app.use(timeout('30s'));

const options = {
    timeout: 3000, // If a request takes longer than 3 seconds, it fails
    errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
    resetTimeout: 10000, // Try again after 10 seconds
};

const accountCircuit = new CircuitBreaker(async (endpoint, data, headers) => {
    const response = await axios.post(endpoint, data, { headers });
    return response.data;
}, options);

const gachaCircuit = new CircuitBreaker(async (endpoint) => {
    const response = await axios.get(endpoint);
    return response.data;
}, options);

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
        const response = await axios.get(`${ACCOUNT_SERVICE_URL}/currency`, {
            headers: { Authorization: req.headers.authorization },
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.post('/buy-currency', haltOnTimedOut, async (req, res) => {
    try {
        const response = await axios.post(`${ACCOUNT_SERVICE_URL}/buy-currency`, req.body, {
            headers: { Authorization: req.headers.authorization },
        }, { timeout: 3000 });
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

app.get('/gacha/pull/:banner_id', haltOnTimedOut, async (req, res) => {
    try {
        const response = await axios.get(`${GACHA_SERVICE_URL}/gacha/pull/${req.params.banner_id}`, {
            headers: { Authorization: req.headers.authorization },
            timeout: 3000,
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
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

 // Start server
 app.listen(3000, () => {
     console.log('Gateway is running on port 3000');
 });
