"use client";

import { io, Socket } from "socket.io-client";
import { TaskPayload } from "./types";

export interface SocketEvents {
  // From server
  plan_generated: (payload: { plan: string[] }) => void;
  step_executing: (payload: { step: string; command?: string }) => void;
  step_result: (payload: { stdout: string; stderr: string; exit_code: number }) => void;
  error_detected: (payload: { error: string; failed_step: string }) => void;
  re_planning: () => void;
  workflow_complete: (payload: { status: string }) => void;

  // To server
  execute_goal: (payload: { goal: string }) => void;
}

class SocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private static readonly DEFAULT_BACKEND_URL: string =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  private currentUrl: string | null = null;

  connect(url: string = SocketClient.DEFAULT_BACKEND_URL) {
    // If already connected to the same URL, reuse connection
    if (this.socket?.connected && this.currentUrl === url) return this.socket;

    // If URL changed or socket exists, disconnect first
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch (e) {
        // no-op
      }
      this.socket = null;
    }

    this.currentUrl = url;
    this.socket = io(url, {
      transports: ["websocket", "polling"],
      timeout: 5000,
    });

    this.socket.on("connect", () => {
      console.log("Connected to Terminus backend");
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from Terminus backend");
    });

    this.socket.on("error", (error) => {
      console.error("Socket error:", error);
    });

    // Forward all events to registered listeners
    const events: (keyof SocketEvents)[] = [
      "plan_generated",
      "step_executing",
      "step_result",
      "error_detected",
      "re_planning",
      "workflow_complete"
    ];

    events.forEach(event => {
      this.socket?.on(event, (payload: any) => {
        // Backend emits objects shaped as { type, payload }
        const data = payload && typeof payload === "object" && "payload" in payload ? payload.payload : payload;
        this.emit(event, data);
      });
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
    this.currentUrl = null;
  }

  on<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  private emit(event: string, payload: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(payload));
    }
  }

  executeGoal(goal: string) {
    if (this.socket?.connected) {
      // Backend expects a wrapper: { payload: { goal } }
      this.socket.emit("execute_goal", { payload: { goal } });
    } else {
      console.warn("Socket not connected. Cannot execute goal:", goal);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketClient = new SocketClient();
