const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const MessageBuffer = require('./MessageBuffer');
const config = require('./config');

class ProxyClient {
    constructor() {
        this.serverHost = config.client.server.host;
        this.serverPort = config.client.server.port;
        this.messageBuffer = new MessageBuffer();
        this.setupMessageBuffer();
        this.setupSSL();
    }

    setupSSL() {
        // Load SSL certificates if enabled
        if (config.client.server.ssl.enabled) {
            this.sslOptions = {
                ca: fs.readFileSync(config.client.server.ssl.ca),
                rejectUnauthorized: config.client.server.ssl.rejectUnauthorized
            };
        }
    }

    setupMessageBuffer() {
        this.messageBuffer.setOnDataCallback((data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'request') {
                    this.handleRequest(message);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });
    }

    applyRewriteRules(requestUrl) {
        let finalUrl = requestUrl;
        
        // Apply URL rewriting rules
        for (const rule of config.client.proxy.rewriteRules) {
            const regex = new RegExp(rule.pattern);
            if (regex.test(finalUrl)) {
                finalUrl = finalUrl.replace(regex, rule.replacement);
                break;
            }
        }
        
        return finalUrl;
    }

    handleRequest(requestData) {
        // Parse the request URL
        let targetUrl = requestData.url;
        
        // If URL is relative, prepend the default target
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = new URL(targetUrl, config.client.proxy.defaultTarget).toString();
        }

        // Apply URL rewriting rules
        targetUrl = this.applyRewriteRules(targetUrl);

        // Parse the target URL
        const parsedUrl = url.parse(targetUrl);
        const isHttps = parsedUrl.protocol === 'https:';

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.path,
            method: requestData.method,
            headers: requestData.headers,
            rejectUnauthorized: config.client.proxy.ssl.rejectUnauthorized
        };

        // Remove host header to avoid conflicts
        delete options.headers.host;

        const requestModule = isHttps ? https : http;
        const req = requestModule.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                
                // Convert binary data to base64 for JSON transmission
                const responseData = {
                    type: 'response',
                    clientId: requestData.clientId,
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body.toString('base64')  // Convert binary data to base64
                };

                this.socket.write(this.messageBuffer.produce(JSON.stringify(responseData)));
            });
        });

        req.on('error', (error) => {
            console.error('Error making request:', error);
            const errorResponse = {
                type: 'response',
                clientId: requestData.clientId,
                statusCode: 500,
                headers: {},
                body: Buffer.from('Internal Server Error').toString('base64')
            };
            this.socket.write(this.messageBuffer.produce(JSON.stringify(errorResponse)));
        });

        if (requestData.body && requestData.body.length > 0) {
            // Ensure body is a Buffer
            const bodyBuffer = Buffer.isBuffer(requestData.body) ? 
                requestData.body : 
                Buffer.from(requestData.body);
            req.write(bodyBuffer);
        }
        req.end();
    }

    connect() {
        const socketOptions = config.client.server.ssl.enabled ? this.sslOptions : {};
        this.socket = config.client.server.ssl.enabled ?
            tls.connect(this.serverPort, this.serverHost, socketOptions, () => {
                console.log(`Connected to ${config.client.server.ssl.enabled ? 'secure' : ''} server at ${this.serverHost}:${this.serverPort}`);
            }) :
            new net.Socket();

        if (!config.client.server.ssl.enabled) {
            this.socket.connect(this.serverPort, this.serverHost, () => {
                console.log(`Connected to server at ${this.serverHost}:${this.serverPort}`);
            });
        }

        this.socket.on('data', (data) => {
            this.messageBuffer.consume(data);
        });

        this.socket.on('close', () => {
            console.log('Connection closed');
            // Attempt to reconnect after delay specified in config
            setTimeout(() => this.connect(), config.reconnection.delay);
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
    }
}

// Create and start the client
const client = new ProxyClient();
client.connect(); 