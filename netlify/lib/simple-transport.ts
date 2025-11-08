import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

// Minimal in-memory transport for handling single request/response
export class SimpleTransport implements Transport {
  sessionId?: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private responseHandler?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {
    // No-op for in-memory transport
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.responseHandler) {
      this.responseHandler(message);
    }
  }

  async close(): Promise<void> {
    this.onclose?.();
  }

  setResponseHandler(handler: (message: JSONRPCMessage) => void): void {
    this.responseHandler = handler;
  }
}
