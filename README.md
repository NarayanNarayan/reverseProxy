# Reverse Proxy Implementation

This is a reverse proxy implementation with a client-server architecture. The system consists of two main components:

1. Server: Opens two ports
   - Port A (3000): HTTP/HTTPS server that receives client requests
   - Port B (3001): Socket server for client connections (supports TLS)

2. Client: Connects to the server via socket connection and handles HTTP/HTTPS requests

## Features

- Message framing with size prefix (4 bytes)
- Automatic reconnection for clients
- Error handling and logging
- Modular and maintainable code structure
- Centralized configuration
- HTTPS support for both server and client
- TLS support for socket connections
- Configurable proxy target URL
- URL rewriting rules support

## Prerequisites

- Node.js >= 14.0.0
- SSL certificates (if using HTTPS/TLS)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) Set up SSL certificates:
   - Place your SSL certificates in the `ssl` directory
   - Update the certificate paths in `config.js`

## Configuration

The `config.js` file contains all configurable settings:

```javascript
{
    server: {
        http: {
            port: 3000,
            host: '0.0.0.0',
            ssl: {
                enabled: false,
                key: './ssl/server-key.pem',
                cert: './ssl/server-cert.pem'
            }
        },
        socket: {
            port: 3001,
            host: '0.0.0.0',
            ssl: {
                enabled: false,
                key: './ssl/server-key.pem',
                cert: './ssl/server-cert.pem'
            }
        }
    },
    client: {
        server: {
            host: 'localhost',
            port: 3001,
            ssl: {
                enabled: false,
                ca: './ssl/ca-cert.pem',
                rejectUnauthorized: true
            }
        },
        proxy: {
            // Default proxy URL if not specified in the request
            defaultTarget: 'http://example.com',
            // URL rewriting rules
            rewriteRules: [
                {
                    // Example: Rewrite /api/* to /v1/*
                    pattern: '^/api/(.*)',
                    replacement: '/v1/$1'
                }
            ],
            ssl: {
                rejectUnauthorized: true
            }
        }
    },
    reconnection: {
        delay: 5000
    }
}
```

### Proxy Configuration

The proxy settings in the configuration file allow you to:

1. Set a default target URL:
   - If a request comes with a relative path, it will be prepended with this URL
   - Example: `/users` becomes `http://example.com/users`

2. Define URL rewriting rules:
   - Each rule has a pattern (regex) and replacement
   - Rules are applied in order
   - Example: `/api/users` becomes `/v1/users`

3. Configure SSL settings:
   - Control certificate validation
   - Set security preferences

## Usage

1. Start the server:
   ```bash
   npm run start:server
   ```

2. Start the client:
   ```bash
   npm run start:client
   ```

## How it Works

1. The server listens on two ports:
   - Port 3000: HTTP/HTTPS requests
   - Port 3001: Client socket connections (with optional TLS)

2. When an HTTP/HTTPS request comes to port 3000:
   - The server forwards it to a connected client
   - The client processes the URL (applies default target and rewrite rules)
   - The client makes the actual HTTP/HTTPS request
   - The response is sent back through the socket connection
   - The server forwards the response to the original HTTP/HTTPS client

3. All socket communication uses a message framing protocol:
   - Each message is prefixed with 4 bytes indicating the message size
   - The MessageBuffer class handles the framing and buffering of messages

4. SSL/TLS Support:
   - Server can run in HTTP or HTTPS mode
   - Socket connections can be secured with TLS
   - Client can verify server certificates
   - Client can make HTTPS requests to target servers

## Code Structure

- `MessageBuffer.js`: Handles message framing and buffering
- `server.js`: Server implementation with HTTP/HTTPS support
- `client.js`: Client implementation with HTTPS support
- `config.js`: Configuration settings
- `package.json`: Project configuration
- `README.md`: Documentation 