class MessageBuffer {
    constructor() {
        this.buffer = Buffer.alloc(0);
        this.onDataCallback = null;
    }

    setOnDataCallback(callback) {
        this.onDataCallback = callback;
    }

    consume(data) {
        // Append new data to existing buffer
        this.buffer = Buffer.concat([this.buffer, data]);

        while (this.buffer.length >= 4) {
            // Read the size prefix (first 4 bytes)
            const size = this.buffer.readUInt32BE(0);

            // Check if we have received the complete frame
            if (this.buffer.length >= size + 4) {
                // Extract the complete frame (excluding size prefix)
                const frame = this.buffer.slice(4, size + 4);
                
                // Remove the processed frame from buffer
                this.buffer = this.buffer.slice(size + 4);

                // Call the callback with the complete frame
                if (this.onDataCallback) {
                    this.onDataCallback(frame);
                }
            } else {
                // Not enough data for a complete frame, wait for more
                break;
            }
        }
    }

    produce(data) {
        // Ensure data is a Buffer
        const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        // Create a buffer for the size prefix (4 bytes)
        const sizeBuffer = Buffer.alloc(4);
        // Write the size of the data as a 32-bit big-endian integer
        sizeBuffer.writeUInt32BE(dataBuffer.length, 0);
        
        // Combine size prefix and data
        return Buffer.concat([sizeBuffer, dataBuffer]);
    }
}

module.exports = MessageBuffer; 