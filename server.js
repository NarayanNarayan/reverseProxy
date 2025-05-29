const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const MessageBuffer = require('./MessageBuffer');
const config = require('./config');

class ProxyServer {
    constructor() {
        this.httpPort = config.server.http.port;
        this.httpHost = config.server.http.host;
        this.socketPort = config.server.socket.port;
        this.socketHost = config.server.socket.host;
        this.clients = new Set();
        this.messageBuffer = new MessageBuffer();
        this.setupMessageBuffer();
        this.setupSSL();
    }

    setupSSL() {
        // Load SSL certificates if enabled
        if (config.server.http.ssl.enabled) {
            this.httpSSL = {
                key: fs.readFileSync(config.server.http.ssl.key),
                cert: fs.readFileSync(config.server.http.ssl.cert)
            };
        }

        if (config.server.socket.ssl.enabled) {
            this.socketSSL = {
                key: fs.readFileSync(config.server.socket.ssl.key),
                cert: fs.readFileSync(config.server.socket.ssl.cert)
            };
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

                    const responseData = {
                        type: 'response',
                        statusCode: response.statusCode,
                        headers: response.headers,
                        body: body
                    };

                    client.write(this.messageBuffer.produce(JSON.stringify(responseData)));
                }
            } catch (error) {
                console.error('Error processing message:', error);
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
            console.log(`${config.server.http.ssl.enabled ? 'HTTPS' : 'HTTP'} server listening on ${this.httpHost}:${this.httpPort}`);
        });

        socketServer.listen(this.socketPort, this.socketHost, () => {
            console.log(`${config.server.socket.ssl.enabled ? 'Secure' : ''} Socket server listening on ${this.socketHost}:${this.socketPort}`);
        });
    }

    handleRequest(req, res) {
        if (this.clients.size === 0) {
            res.writeHead(503);
            res.end('No clients available');
            return;
        }

        // Get the first available client
        const client = Array.from(this.clients)[0];
        
        // Forward the request to the client
        const requestData = {
            type: 'request',
            clientId: client.id,
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
        });
    }

    handleSocketConnection(socket) {
        const clientId = Math.random().toString(36).substring(7);
        socket.id = clientId;
        this.clients.add(socket);

        console.log(`Client connected: ${clientId}`);

        socket.on('data', (data) => {
            this.messageBuffer.consume(data);
        });

        socket.on('end', () => {
            this.clients.delete(socket);
            console.log(`Client disconnected: ${clientId}`);
        });

        socket.on('error', (error) => {
            console.error(`Client error: ${error.message}`);
            this.clients.delete(socket);
        });
    }
}

// Create and start the server
const server = new ProxyServer();
server.start(); 