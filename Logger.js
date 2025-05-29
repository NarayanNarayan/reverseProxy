const fs = require('fs');
const path = require('path');
const config = require('./config');

class Logger {
    constructor() {
        this.config = config.logging;
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        this.currentLevel = this.levels[this.config.level] || this.levels.info;
        this.setupFileLogging();
    }

    setupFileLogging() {
        if (this.config.file.enabled) {
            // Create logs directory if it doesn't exist
            if (!fs.existsSync(this.config.file.path)) {
                fs.mkdirSync(this.config.file.path, { recursive: true });
            }
        }
    }

    formatMessage(level, category, message, data = {}) {
        const timestamp = this.config.timestamp ? new Date().toISOString() : '';
        const baseMessage = {
            timestamp,
            level,
            category,
            message
        };

        if (Object.keys(data).length > 0) {
            baseMessage.data = data;
        }

        return this.config.format === 'json' 
            ? JSON.stringify(baseMessage)
            : this.formatTextMessage(baseMessage);
    }

    formatTextMessage({ timestamp, level, category, message, data }) {
        const parts = [];
        if (timestamp) parts.push(`[${timestamp}]`);
        parts.push(`[${level.toUpperCase()}]`);
        if (category) parts.push(`[${category}]`);
        parts.push(message);
        if (data) parts.push(JSON.stringify(data));
        return parts.join(' ');
    }

    writeToFile(message) {
        if (!this.config.file.enabled) return;

        const logPath = path.join(this.config.file.path, this.config.file.filename);
        fs.appendFileSync(logPath, message + '\n');
    }

    shouldLog(level, category) {
        if (!this.config.enabled) return false;
        if (this.levels[level] < this.currentLevel) return false;
        if (!this.config.categories[category]) return false;
        return true;
    }

    log(level, category, message, data = {}) {
        if (!this.shouldLog(level, category)) return;

        const formattedMessage = this.formatMessage(level, category, message, data);

        // Console output
        if (this.config.console.enabled) {
            const consoleMethod = level === 'error' ? 'error' : 
                                level === 'warn' ? 'warn' : 
                                level === 'debug' ? 'debug' : 'log';
            
            if (this.config.console.colors) {
                const colors = {
                    debug: '\x1b[36m', // Cyan
                    info: '\x1b[32m',  // Green
                    warn: '\x1b[33m',  // Yellow
                    error: '\x1b[31m', // Red
                    reset: '\x1b[0m'   // Reset
                };
                console[consoleMethod](colors[level] + formattedMessage + colors.reset);
            } else {
                console[consoleMethod](formattedMessage);
            }
        }

        // File output
        this.writeToFile(formattedMessage);
    }

    debug(category, message, data) {
        this.log('debug', category, message, data);
    }

    info(category, message, data) {
        this.log('info', category, message, data);
    }

    warn(category, message, data) {
        this.log('warn', category, message, data);
    }

    error(category, message, data) {
        this.log('error', category, message, data);
    }
}

module.exports = new Logger(); 