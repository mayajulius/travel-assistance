class SimpleSessionStore {
    constructor() {
        this.sessions = new Map();
        this.maxAge = 30 * 60 * 1000; // 30 minutes

        // Clean up expired sessions every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        if (Date.now() - session.lastAccess > this.maxAge) {
            this.sessions.delete(sessionId);
            return null;
        }

        session.lastAccess = Date.now();
        return session.state;
    }

    saveSession(sessionId, state) {
        this.sessions.set(sessionId, {
            state: this.trimHistoryIfNeeded(state),
            lastAccess: Date.now()
        });
    }

    // Keep only last 15 conversation turns to manage memory
    trimHistoryIfNeeded(state) {
        if (state.conversationHistory && state.conversationHistory.length > 15) {
            return {
                ...state,
                conversationHistory: state.conversationHistory.slice(-15)
            };
        }
        return state;
    }

    generateSessionId() {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }

    cleanup() {
        const now = Date.now();
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastAccess > this.maxAge) {
                this.sessions.delete(sessionId);
            }
        }
        console.log(`Cleaned up expired sessions. Active sessions: ${this.sessions.size}`);
    }

    // Get some stats
    getStats() {
        return {
            activeSessions: this.sessions.size,
            maxAge: this.maxAge / 1000 / 60, // in minutes
        };
    }
}

// Create singleton instance
export const sessionStore = new SimpleSessionStore();

// session-manager.mjs
import { buildGraph, initialState } from './graph.mjs';
import { sessionStore } from './session-manager.mjs';

export async function handleConversation(userMessage, sessionId = null, userProfile = {}) {
    try {
        // Get or create session
        if (!sessionId) {
            sessionId = sessionStore.generateSessionId();
        }

        let existingState = sessionStore.getSession(sessionId);

        // Initialize or update state
        const currentState = existingState ?
            { ...existingState, userMessage } :
            initialState(userMessage, userProfile);

        console.log(`[Session ${sessionId}] Turn ${currentState.conversationTurn}: "${userMessage}"`);

        // Run your graph
        const graph = buildGraph();
        const result = await graph.invoke(...currentState,sessionId);

        // Save updated state (clear userMessage for next turn)
        const stateToSave = {
            ...result,
            userMessage: ""
        };

        sessionStore.saveSession(sessionId, stateToSave);

        console.log(`[Session ${sessionId}] Response: "${result.reply}"`);

        return {
            sessionId,
            reply: result.reply,
            done: result.done,
            conversationTurn: result.conversationTurn,
            hasContext: result.conversationHistory.length > 0,
            intent: result.intent
        };

    } catch (error) {
        console.error('Conversation handler error:', error);
        return {
            sessionId: sessionId || sessionStore.generateSessionId(),
            reply: "I'm sorry, I encountered an error. Could you try asking again?",
            done: true,
            conversationTurn: 0,
            hasContext: false,
            intent: null,
            error: true
        };
    }
}

// Helper functions for debugging and management
export function getSessionInfo(sessionId) {
    const state = sessionStore.getSession(sessionId);
    if (!state) return null;

    return {
        sessionId,
        conversationTurn: state.conversationTurn,
        conversationContext: state.conversationContext,
        historyLength: state.conversationHistory.length,
        lastIntent: state.intent,
        previousPlans: state.previousPlans.length
    };
}

export function clearSession(sessionId) {
    sessionStore.sessions.delete(sessionId);
    return { success: true, message: 'Session cleared' };
}

export function getSessionStats() {
    return sessionStore.getStats();
}