// server/index.mjs - Updated to use memory-enhanced graph
import express from "express";
import cors from "cors";
import { buildGraph, initialState } from "./graph.mjs"; // Changed from "./graph.mjs"
import { parseAnswer } from "./app.mjs";

const PORT = process.env.PORT || 3001;

// 1) Create the Express app
const app = express();

// 2) Middleware
app.use(cors());
app.use(express.json());

// 3) Build the enhanced LangGraph once
const compiled = buildGraph();

// 4) Enhanced in-memory sessions with conversation memory
class SessionStore {
    constructor() {
        this.sessions = new Map(); // sessionId -> { state, lastAccess, conversationHistory }
        this.maxAge = 30 * 60 * 1000; // 30 minutes

        // Clean up expired sessions every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    get(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        // Check if session expired
        if (Date.now() - session.lastAccess > this.maxAge) {
            this.sessions.delete(sessionId);
            return null;
        }

        session.lastAccess = Date.now();
        return session;
    }

    set(sessionId, state) {
        const existingSession = this.sessions.get(sessionId);
        const conversationHistory = existingSession?.conversationHistory || [];

        this.sessions.set(sessionId, {
            state,
            lastAccess: Date.now(),
            conversationHistory: this.trimHistory(conversationHistory)
        });
    }

    // Keep only last 20 messages to manage memory
    trimHistory(history) {
        return history.length > 20 ? history.slice(-20) : history;
    }

    addToHistory(sessionId, role, content, metadata = {}) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const historyEntry = {
            role,
            content,
            timestamp: new Date().toISOString(),
            ...metadata
        };

        session.conversationHistory.push(historyEntry);
    }

    getHistory(sessionId) {
        const session = this.sessions.get(sessionId);
        return session?.conversationHistory || [];
    }

    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastAccess > this.maxAge) {
                this.sessions.delete(sessionId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} expired sessions. Active: ${this.sessions.size}`);
        }
    }

    getStats() {
        return {
            activeSessions: this.sessions.size,
            maxAgeMinutes: this.maxAge / 1000 / 60
        };
    }
}

const sessionStore = new SessionStore();

// Helper functions for conversation context
function isFollowUpMessage(message, history) {
    if (!history.length) return false;

    const followUpPatterns = [
        /\b(more|tell me more|what about|can you suggest|any other|also|additionally)\b/i,
        /\b(that|those|it|them)\b/i, // references to previous content
        /\b(instead|actually|rather|prefer|change)\b/i, // refinements
        /\b(better|compare|versus|vs)\b/i // comparisons
    ];

    return followUpPatterns.some(pattern => pattern.test(message));
}

function extractContextFromHistory(history) {
    const context = {};

    // Extract entities mentioned in recent conversation
    for (const entry of history.slice(-6)) { // last 6 messages
        if (entry.entities) {
            Object.assign(context, entry.entities);
        }
    }

    return context;
}

function buildConversationSummary(history) {
    if (!history.length) return "";

    const recentMessages = history.slice(-6).map(h =>
        `${h.role}: ${h.content.substring(0, 100)}${h.content.length > 100 ? '...' : ''}`
    ).join('\n');

    return `Recent conversation:\n${recentMessages}\n\n`;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// 5) Enhanced chat endpoint with conversation memory
app.post("/chat", async (req, res) => {
    try {
        const { message, sessionId = "default" } = req.body || {};
        if (!message || typeof message !== "string") {
            return res.status(400).json({ error: "message is required" });
        }

        console.log(`💬 [${sessionId.slice(0, 8)}...] User: "${message}"`);

        // Load session with conversation history
        const session = sessionStore.get(sessionId);
        const conversationHistory = session?.conversationHistory || [];
        const previousState = session?.state;

        let state;

        if (!previousState) {
            // Brand new conversation
            state = initialState(message, {});
            console.log(`🆕 New conversation started`);
        } else {
            // Continuing conversation
            state = { ...previousState };

            // Check if this is a follow-up or refinement
            const isFollowUp = isFollowUpMessage(message, conversationHistory);
            const contextFromHistory = extractContextFromHistory(conversationHistory);

            if (state.lastAskField) {
                // User is answering a specific field question
                const parsed = parseAnswer(state.lastAskField, message);
                if (parsed != null) {
                    state.entities = { ...state.entities, [state.lastAskField]: parsed };
                    console.log(`📝 Field answer: ${state.lastAskField} = ${JSON.stringify(parsed)}`);
                }
                // Update user message but keep context
                state.userMessage = message;
                state.lastAskField = null; // clear the field ask
            } else if (isFollowUp && Object.keys(contextFromHistory).length > 0) {
                // This is a follow-up question - merge context
                console.log(`🔄 Follow-up detected with context:`, contextFromHistory);
                state = initialState(message, state.userProfile || {});
                state.entities = { ...contextFromHistory, ...state.entities };

                // Add conversation context to user message for better LLM understanding
                const conversationSummary = buildConversationSummary(conversationHistory);
                state.userMessage = `${conversationSummary}Current request: ${message}`;
            } else {
                // Brand new request in existing session
                console.log(`🆕 New request in existing session`);
                state = initialState(message, state.userProfile || {});
            }
        }

        // Add user message to conversation history
        sessionStore.addToHistory(sessionId, "user", message, {
            entities: state.entities,
            intent: state.intent
        });

        // Run the enhanced graph
        const out = await compiled.invoke(state);

        // Add bot response to conversation history
        sessionStore.addToHistory(sessionId, "assistant", out.reply, {
            intent: out.intent,
            entities: out.entities,
            done: out.done
        });

        // Persist state for this session
        sessionStore.set(sessionId, out);

        console.log(`🤖 [${sessionId.slice(0, 8)}...] Bot: "${out.reply.substring(0, 100)}${out.reply.length > 100 ? '...' : ''}"`);

        // Reply to client with enhanced info
        res.json({
            reply: out.reply,
            done: out.done,
            conversationTurn: conversationHistory.length + 1,
            hasContext: conversationHistory.length > 0,
            intent: out.intent
        });

    } catch (err) {
        console.error("❌ Chat error:", err);
        res.status(500).json({ error: "server_error", details: String(err) });
    }
});

// Optional: Get conversation history (useful for debugging)
app.get("/chat/:sessionId/history", (req, res) => {
    try {
        const { sessionId } = req.params;
        const history = sessionStore.getHistory(sessionId);

        if (!history.length) {
            return res.status(404).json({ error: "Session not found or no history" });
        }

        res.json({
            sessionId,
            history,
            length: history.length
        });
    } catch (err) {
        console.error("History error:", err);
        res.status(500).json({ error: "server_error" });
    }
});

// Optional: Clear conversation
app.delete("/chat/:sessionId", (req, res) => {
    try {
        const { sessionId } = req.params;
        sessionStore.sessions.delete(sessionId);

        res.json({ success: true, message: "Conversation cleared" });
    } catch (err) {
        console.error("Clear error:", err);
        res.status(500).json({ error: "server_error" });
    }
});

// Optional: Server stats
app.get("/stats", (req, res) => {
    try {
        const stats = sessionStore.getStats();
        res.json({
            ...stats,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error("Stats error:", err);
        res.status(500).json({ error: "server_error" });
    }
});

// Logging middleware (moved after routes to avoid logging health checks)
app.use((req, _res, next) => {
    if (req.url !== '/health') {
        console.log(`🌐 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

// 6) Start server
app.listen(PORT, () => {
    console.log(`🚀 Travel planning server running on http://localhost:${PORT}`);
    console.log(`💬 Enhanced with conversation memory`);
    console.log(`📊 Session cleanup every 5 minutes`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Gracefully shutting down...');
    process.exit(0);
});