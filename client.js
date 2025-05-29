const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const MessageBuffer = require('./MessageBuffer');
const config = require('./config');
const logger = require('./Logger');

class ProxyClient {
    constructor() {
        this.serverHost = config.client.server.host;
        this.serverPort = config.client.server.port;
        this.messageBuffer = new MessageBuffer();
        this.setupMessageBuffer();
        this.setupSSL();
    }

    setupSSL() {
        try {
            // Load SSL certificates if enabled
            if (config.client.server.ssl.enabled) {
                this.sslOptions = {
                    ca: fs.readFileSync(config.client.server.ssl.ca),
                    rejectUnauthorized: config.client.server.ssl.rejectUnauthorized
                };
                logger.info('ssl', 'Client SSL certificates loaded');
            }
        } catch (error) {
            logger.error('ssl', 'Failed to load SSL certificates', { error: error.message });
            throw error;
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
                logger.error('error', 'Error processing message', { error: error.message });
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
                logger.debug('proxy', 'URL rewritten', {
                    original: requestUrl,
                    rewritten: finalUrl,
                    rule: rule.pattern
                });
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
            logger.debug('proxy', 'Relative URL converted to absolute', {
                relative: requestData.url,
                absolute: targetUrl
            });
        }

        // Apply URL rewriting rules
        targetUrl = this.applyRewriteRules(targetUrl);

        // Parse the target URL
        const parsedUrl = url.parse(targetUrl);
        const isHttps = parsedUrl.protocol === 'https:';

        logger.info('request', 'Making proxy request', {
            method: requestData.method,
            url: targetUrl,
            protocol: parsedUrl.protocol,
            requestId: requestData.requestId
        });

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
                
                logger.info('response', 'Received response from target', {
                    statusCode: res.statusCode,
                    contentLength: body.length,
                    headers: res.headers,
                    requestId: requestData.requestId
                });

                // Convert binary data to base64 for JSON transmission
                const responseData = {
                    type: 'response',
                    clientId: requestData.clientId,
                    requestId: requestData.requestId,  // Include requestId in response
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body.toString('base64')  // Convert binary data to base64
                };

                this.socket.write(this.messageBuffer.produce(JSON.stringify(responseData)));
            });
        });

        req.on('error', (error) => {
            logger.error('error', 'Error making proxy request', {
                url: targetUrl,
                error: error.message,
                requestId: requestData.requestId
            });
            const errorResponse = {
                type: 'response',
                clientId: requestData.clientId,
                requestId: requestData.requestId,  // Include requestId in error response
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
            logger.debug('request', 'Request body sent', {
                size: bodyBuffer.length
            });
        }
        req.end();
    }

    connect() {
        const socketOptions = config.client.server.ssl.enabled ? this.sslOptions : {};
        this.socket = config.client.server.ssl.enabled ?
            tls.connect(this.serverPort, this.serverHost, socketOptions, () => {
                logger.info('socket', `Connected to ${config.client.server.ssl.enabled ? 'secure' : ''} server`, {
                    host: this.serverHost,
                    port: this.serverPort
                });
            }) :
            new net.Socket();

        if (!config.client.server.ssl.enabled) {
            this.socket.connect(this.serverPort, this.serverHost, () => {
                logger.info('socket', 'Connected to server', {
                    host: this.serverHost,
                    port: this.serverPort
                });
            });
        }

        this.socket.on('data', (data) => {
            this.messageBuffer.consume(data);
        });

        this.socket.on('close', () => {
            logger.warn('socket', 'Connection closed, attempting to reconnect');
            // Attempt to reconnect after delay specified in config
            setTimeout(() => this.connect(), config.reconnection.delay);
        });

        this.socket.on('error', (error) => {
            logger.error('socket', 'Socket error', {
                error: error.message
            });
        });
    }
}

// Create and start the client
const client = new ProxyClient();
client.connect(); 