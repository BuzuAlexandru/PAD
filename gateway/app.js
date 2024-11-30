const express = require('express');
const axios = require('axios');
const dns = require('dns').promises;
const rateLimit = require('express-rate-limit');
const timeout = require('connect-timeout');
const { createProxyMiddleware } = require('http-proxy-middleware');
const CircuitBreaker = require('opossum');
const Consul = require('consul');
const { ACCOUNT_SERVICE_URL, GACHA_SERVICE_URL } = require('./config');

const app = express();
app.use(express.json());

// Consul agent URL
const consul = new Consul({
    host: 'consul', // Consul address
    port: 8500      // Consul port
});

async function getServiceIPs(serviceName) {
  try {
    const result = await dns.lookup(serviceName, { all: true });
    return result.map(record => record.address);
  } catch (error) {
    console.error(`Error resolving service '${serviceName}':`, error.message);
    return [];
  }
}

async function registerServiceInConsul(name, address, port, tags = []) {
  const payload = {
      ID: name,
      Name: name,
      Address: address,
      Port: port,
      Tags: tags
  };

  try {
    const response = await consul.agent.service.register(payload);
    if (response.status === 200) {
      console.log(`Registered service '${name}' at ${address}:${port}`);
    } else {
      console.error(`Failed to register service '${name}'. Status: ${response.status}`);
    }
  } catch (error) {

    // console.error(`Error registering service '${name}':`, error.message);
  }
}

async function getServices() {
  const serviceName = "gacha-service"; // Docker Compose service name
  const servicePort = 5001;        // Port replicas are using

  // Discover replicas
  const replicas = await getServiceIPs(serviceName);
  console.log(`Discovered replicas for '${serviceName}':`, replicas);
    let i = 1
  // Register each replica in Consul
  for (const replica of replicas) {
    await registerServiceInConsul(`${serviceName}-${i}`, replica, servicePort, ["replica", "v1"]);
    i++;
  }
    const payload = {
      ID: 'account-service',
      Name: 'account-service',
      Address: '127.0.0.1',
      Port: 5000,
      Tags: ["account", "v1"]
  };

  try {
      const response = await consul.agent.service.register(payload);
  }catch (error) {
    console.error(`Error registering service 'account-service':`, error.message);
}}

setInterval(getServices, 100000);

// Initial call to set up service URLs on startup
getServices();

// Concurrent request limiter (limits to 10 requests per minute per user)
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});

app.use(limiter);

const TIMEOUT_LIMIT = 5000;
const RETRY_WINDOW = 3.5 * TIMEOUT_LIMIT;
async function requestWrapper(serviceName, servicePort, api, method, data = null, headers=null, retries=3, delay = RETRY_WINDOW / 3 ) {
    let serviceInstances = await consul.agent.service.list();
    serviceInstances = Object.values(serviceInstances).filter(service => service.Service.includes(`${serviceName}`));
    let serviceCounter = 0
    while (serviceInstances.length > 0){
        serviceInstances = await consul.agent.service.list();
        serviceInstances = Object.values(serviceInstances).filter(service => service.Service.includes(`${serviceName}`));
        if (serviceInstances.length === 0 || serviceCounter === 3) {break}
        serviceCounter++;
        let service = serviceInstances[Math.floor(Math.random()*serviceInstances.length)]
        const url = `http://${service.ID.includes('gacha')? service.Address: service.ID}:${servicePort}/${api}`;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                 return await axios({method: method, url: url, data: data, headers: headers, timeout: TIMEOUT_LIMIT});
            }
            catch (error) {
                // console.log(error)
                // Check if the error has a response and its status
                if (error.response && error.response.status < 500) {
                    // If status code < 500, return the response as is
                    return error.response;
                } else {
                    // Log the error and prepare to retry
                    console.log(`Attempt ${attempt + 1} failed: ${error.response ? error.response.status : error.message}`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }
        console.log(`${service.ID} unavailable`);
        await consul.agent.service.deregister(service.ID);
    }
    throw new Error('Services unavailable');
}

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
        const response = await requestWrapper('account-service', 5000, 'register', 'post', req.body)
            // await axios.post(`${ACCOUNT_SERVICE_URL}/register`, req.body, { timeout: 3000 });
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.post('/login', async (req, res) => {
    try {
        const response = await requestWrapper('account-service', 5000, 'login', 'post', req.body)
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.get('/currency', haltOnTimedOut, async (req, res) => {
    try {
        const response = await requestWrapper('account-service', 5000, 'currency', 'get', req.body,
            { Authorization: req.headers.authorization })
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.post('/buy-currency', haltOnTimedOut, async (req, res) => {
    try {
        const response = await requestWrapper('account-service', 5000, 'buy-currency', 'post', req.body,
            { Authorization: req.headers.authorization })
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

// 2. Route to connect to the Gacha Service
app.get('/items', haltOnTimedOut, async (req, res) => {
    try {
        const response = await requestWrapper('gacha-service', 5001, 'items', 'get', req.body)
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.get('/chances', haltOnTimedOut, async (req, res) => {
    try {
        const response = await requestWrapper('gacha-service', 5001, 'chances', 'get', req.body)
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});

app.get('/gacha/pull/:banner_id', haltOnTimedOut, async (req, res) => {
    try {
        const response = await requestWrapper('gacha-service', 5001, `gacha/pull/${req.params.banner_id}`,
            'get', req.body, { Authorization: req.headers.authorization })
        //     await axios.get(`${GACHA_SERVICE_URL}/gacha/pull/${req.params.banner_id}`, {
        //     headers: { Authorization: req.headers.authorization },
        //     timeout: 3000,
        // });
            //
        res.status(response.status).json(response.data);
    } catch (error) {
        handleServiceError(res, error);
    }
});
// Error handling for service calls
function handleServiceError(res, error) {

    if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ message: 'Request to service timed out after 3 seconds.' })}
    else{
        res.status(error.response?.status || 500).json({ msg: error.message });
    }
}

 // Start server
 app.listen(3000, () => {
     console.log('Gateway is running on port 3000');
 });
