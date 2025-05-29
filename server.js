const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const MessageBuffer = require('./MessageBuffer');
const config = require('./config');
const logger = require('./Logger');

class ProxyServer {
    constructor() {
        this.httpPort = config.server.http.port;
        this.httpHost = config.server.http.host;
        this.socketPort = config.server.socket.port;
        this.socketHost = config.server.socket.host;
        this.clients = new Set();
        this.messageBuffer = new MessageBuffer();
        this.pendingRequests = new Map(); // Map to store pending requests by clientId
        this.setupMessageBuffer();
        this.setupSSL();
    }

    setupSSL() {
        try {
            // Load SSL certificates if enabled
            if (config.server.http.ssl.enabled) {
                this.httpSSL = {
                    key: fs.readFileSync(config.server.http.ssl.key),
                    cert: fs.readFileSync(config.server.http.ssl.cert)
                };
                logger.info('ssl', 'HTTP SSL certificates loaded');
            }

            if (config.server.socket.ssl.enabled) {
                this.socketSSL = {
                    key: fs.readFileSync(config.server.socket.ssl.key),
                    cert: fs.readFileSync(config.server.socket.ssl.cert)
                };
                logger.info('ssl', 'Socket SSL certificates loaded');
            }
        } catch (error) {
            logger.error('ssl', 'Failed to load SSL certificates', { error: error.message });
            throw error;
        }
    }

    setupMessageBuffer() {
        this.messageBuffer.setOnDataCallback((data) => {
            try {
                const response = JSON.parse(data.toString());
                const client = this.findClient(response.clientId);
                if (client) {
                    // Convert base64 body back to buffer if it exists
                    let body = null;
                    if (response.body) {
                        body = Buffer.from(response.body, 'base64');
                    }

                    // Send response back to the original HTTP request
                    const originalRequest = this.pendingRequests.get(response.requestId);
                    if (originalRequest && originalRequest.res) {
                        const res = originalRequest.res;
                        res.writeHead(response.statusCode, response.headers);
                        if (body) {
                            res.write(body);
                        }
                        res.end();
                        // Remove the request from pending requests
                        this.pendingRequests.delete(response.requestId);
                        logger.debug('response', 'Response sent to client', {
                            clientId: response.clientId,
                            requestId: response.requestId,
                            statusCode: response.statusCode
                        });
                    } else {
                        logger.warn('response', 'No matching request found for response', {
                            clientId: response.clientId,
                            requestId: response.requestId
                        });
                    }
                }
            } catch (error) {
                logger.error('error', 'Error processing message', { error: error.message });
            }
        });
    }

    findClient(clientId) {
        for (const client of this.clients) {
            if (client.id === clientId) {
                return client;
            }
        }
        return null;
    }

    start() {
        // Create HTTP/HTTPS server
        const serverOptions = config.server.http.ssl.enabled ? this.httpSSL : {};
        const server = config.server.http.ssl.enabled ? 
            https.createServer(serverOptions, this.handleRequest.bind(this)) :
            http.createServer(this.handleRequest.bind(this));

        // Create socket server
        const socketServer = config.server.socket.ssl.enabled ?
            tls.createServer(this.socketSSL, this.handleSocketConnection.bind(this)) :
            net.createServer(this.handleSocketConnection.bind(this));

        // Start both servers
        server.listen(this.httpPort, this.httpHost, () => {
            logger.info('server', `${config.server.http.ssl.enabled ? 'HTTPS' : 'HTTP'} server listening`, {
                host: this.httpHost,
                port: this.httpPort
            });
        });

        socketServer.listen(this.socketPort, this.socketHost, () => {
            logger.info('server', `${config.server.socket.ssl.enabled ? 'Secure' : ''} Socket server listening`, {
                host: this.socketHost,
                port: this.socketPort
            });
        });
    }

    handleRequest(req, res) {
        if (this.clients.size === 0) {
            logger.warn('request', 'No clients available');
            res.writeHead(503);
            res.end('No clients available');
            return;
        }

        // Get the first available client
        const client = Array.from(this.clients)[0];
        
        // Generate a unique request ID
        const requestId = Math.random().toString(36).substring(7);
        
        // Store the request in pending requests map
        this.pendingRequests.set(requestId, { req, res });
        
        logger.info('request', 'Incoming request', {
            method: req.method,
            url: req.url,
            clientId: client.id,
            requestId: requestId
        });

        // Forward the request to the client
        const requestData = {
            type: 'request',
            clientId: client.id,
            requestId: requestId, // Include requestId in the request data
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: []
        };

        req.on('data', chunk => {
            requestData.body.push(chunk);
        });

        req.on('end', () => {
            requestData.body = Buffer.concat(requestData.body);
            client.write(this.messageBuffer.produce(JSON.stringify(requestData)));
            logger.debug('request', 'Request forwarded to client', {
                clientId: client.id,
                requestId: requestId,
                bodySize: requestData.body.length
            });
        });

        // Clean up if the request is aborted
        req.on('aborted', () => {
            this.pendingRequests.delete(requestId);
            logger.warn('request', 'Request aborted', {
                clientId: client.id,
                requestId: requestId
            });
        });
    }

    handleSocketConnection(socket) {
        const clientId = Math.random().toString(36).substring(7);
        socket.id = clientId;
        this.clients.add(socket);

        logger.info('socket', 'Client connected', { clientId });

        socket.on('data', (data) => {
            this.messageBuffer.consume(data);
        });

        socket.on('end', () => {
            // Clean up any pending requests for this client
            for (const [requestId, request] of this.pendingRequests.entries()) {
                if (request.clientId === clientId) {
                    request.res.writeHead(503);
                    request.res.end('Client disconnected');
                    this.pendingRequests.delete(requestId);
                }
            }
            this.clients.delete(socket);
            logger.info('socket', 'Client disconnected', { clientId });
        });

        socket.on('error', (error) => {
            // Clean up any pending requests for this client
            for (const [requestId, request] of this.pendingRequests.entries()) {
                if (request.clientId === clientId) {
                    request.res.writeHead(503);
                    request.res.end('Client error');
                    this.pendingRequests.delete(requestId);
                }
            }
            logger.error('socket', 'Client error', { 
                clientId,
                error: error.message 
            });
            this.clients.delete(socket);
        });
    }
}

// Create and start the server
const server = new ProxyServer();
server.start(); 