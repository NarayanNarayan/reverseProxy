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
    }
}; 