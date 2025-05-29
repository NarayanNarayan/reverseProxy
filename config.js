module.exports = {
    server: {
        http: {
            port: 3000,
            host: '0.0.0.0',  // Listen on all available network interfaces
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
                ca: './ssl/ca-cert.pem',  // Certificate Authority certificate
                rejectUnauthorized: true  // Reject invalid certificates
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
                rejectUnauthorized: true  // Reject invalid certificates when making proxy requests
            }
        }
    },
    // Reconnection settings
    reconnection: {
        delay: 5000  // 5 seconds
    },
    // Logging configuration
    logging: {
        enabled: false,
        level: 'debug',  // debug, info, warn, error
        format: 'text', // text or json
        timestamp: true,
        // Log file configuration
        file: {
            enabled: false,
            path: './logs',
            filename: 'proxy.log',
            maxSize: '10m',  // Maximum size of each log file
            maxFiles: 5,     // Maximum number of log files to keep
            compress: true   // Compress old log files
        },
        // Console output configuration
        console: {
            enabled: true,
            colors: true
        },
        // Log categories to include/exclude
        categories: {
            request: true,    // Log HTTP requests
            response: true,   // Log HTTP responses
            error: true,      // Log errors
            socket: true,     // Log socket events
            proxy: true,      // Log proxy operations
            ssl: true         // Log SSL/TLS operations
        }
    }
}; 