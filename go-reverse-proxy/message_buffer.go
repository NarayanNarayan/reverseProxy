package main

import (
	"bytes"
	"encoding/binary"
)

// MessageBuffer handles message framing and buffering
type MessageBuffer struct {
	buffer bytes.Buffer
	onData func([]byte)
}

// NewMessageBuffer creates a new MessageBuffer instance
func NewMessageBuffer() *MessageBuffer {
	return &MessageBuffer{
		buffer: bytes.Buffer{},
	}
}

// SetOnDataCallback sets the callback function for when a complete message is received
func (mb *MessageBuffer) SetOnDataCallback(callback func([]byte)) {
	mb.onData = callback
}

// Consume processes incoming data and extracts complete messages
func (mb *MessageBuffer) Consume(data []byte) {
	mb.buffer.Write(data)

	for {
		// Check if we have enough data for the length prefix
		if mb.buffer.Len() < 4 {
			return
		}

		// Read the length prefix
		lengthBytes := mb.buffer.Bytes()[:4]
		length := binary.BigEndian.Uint32(lengthBytes)

		// Check if we have the complete message
		if mb.buffer.Len() < int(length)+4 {
			return
		}

		// Extract the message
		message := make([]byte, length)
		mb.buffer.Read(lengthBytes) // Skip the length prefix
		mb.buffer.Read(message)

		// Process the message
		if mb.onData != nil {
			mb.onData(message)
		}
	}
}

// Produce creates a framed message with length prefix
func (mb *MessageBuffer) Produce(data []byte) []byte {
	length := uint32(len(data))
	lengthBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(lengthBytes, length)

	// Combine length prefix and message
	result := make([]byte, 0, len(lengthBytes)+len(data))
	result = append(result, lengthBytes...)
	result = append(result, data...)

	return result
}
