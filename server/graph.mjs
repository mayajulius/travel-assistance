// memory-graph.mjs - Your updated graph with memory
import { StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import {
    routeQuery,
    runPlanner,
    inferDestinationFromText,
    FIELD_QUESTIONS
} from "./app.mjs";
import { isMissingField, normalizeEntities } from "./helpers.mjs";

// Enhanced state schema with conversation memory
const StateSchema = z.object({
    userMessage: z.string(),
    userProfile: z.record(z.any()).default({}),
    intent: z.string().optional(),
    entities: z.record(z.any()).default({}),
    reply: z.string().default(""),
    done: z.boolean().default(false),
    lastAskField: z.string().nullable().default(null),

    // Conversation memory fields
    conversationHistory: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.string(),
        entities: z.record(z.any()).optional(),
        intent: z.string().optional()
    })).default([]),

    conversationContext: z.record(z.any()).default({}),
    conversationTurn: z.number().default(0),

    previousPlans: z.array(z.object({
        intent: z.string(),
        entities: z.record(z.any()),
        result: z.string(),
        timestamp: z.string()
    })).default([])
});

const REQUIRED_FIELDS = {
    destination_recommendations: ["month_or_season", "budget", "interests"],
    packing_suggestions: ["destination", "trip_length_days", "month_or_season"],
    local_attractions: ["destination", "trip_length_days", "interests"]
};

// Add follow_up and refinement to supported intents
const SUPPORTED_INTENTS = new Set([
    ...Object.keys(REQUIRED_FIELDS),
    "follow_up",
    "refinement"
]);

const safeDefaults = {
    userMessage: "",
    userProfile: {},
    intent: undefined,
    entities: {},
    reply: "",
    done: false,
    lastAskField: null,
    conversationHistory: [],
    conversationContext: {},
    conversationTurn: 0,
    previousPlans: []
};

const validateState = (state) => {
    try {
        return StateSchema.parse({ ...safeDefaults, ...state });
    } catch (error) {
        console.error("State validation failed:", error);
        return StateSchema.parse({
            ...safeDefaults,
            reply: "I encountered an internal error. Please try again.",
            done: true
        });
    }
};

// Enhanced initializer
export const initialState = (userMessage, userProfile = {}, existingHistory = []) => ({
    userMessage,
    userProfile,
    intent: undefined,
    entities: {},
    reply: "",
    done: false,
    lastAskField: null,
    conversationHistory: existingHistory,
    conversationContext: {},
    conversationTurn: existingHistory.length,
    previousPlans: []
});

// Helper to add message to history
const addToHistory = (state, role, content, additionalData = {}) => {
    const historyEntry = {
        role,
        content,
        timestamp: new Date().toISOString(),
        ...additionalData
    };

    return {
        ...state,
        conversationHistory: [...state.conversationHistory, historyEntry],
        conversationTurn: state.conversationTurn + 1
    };
};

// Enhanced heuristic route with context
function enhancedHeuristicRoute(userText, conversationState = {}) {
    const { conversationContext = {} } = conversationState;

    // Check for follow-up patterns
    const followUpPatterns = [
        /\b(more|tell me more|what about|can you suggest|any other|also|additionally)\b/i,
        /\b(that|those|it|them)\b/i, // references to previous content
        /\b(instead|actually|rather|prefer|change)\b/i, // refinements
        /\b(better|compare|versus|vs)\b/i // comparisons
    ];

    const isFollowUp = followUpPatterns.some(pattern => pattern.test(userText));

    // If it's a follow-up and we have context, classify as follow_up
    if (isFollowUp && Object.keys(conversationContext).length > 0) {
        return {
            intent: "follow_up",
            entities: conversationContext,
            conversationContinuation: true
        };
    }

    // Use original heuristic logic for new topics
    const t = userText.toLowerCase();
    let intent;

    if (/\b(pack|packing|bring|luggage|what to wear|clothing|gear|items|stuff)\b/.test(t)) {
        intent = "packing_suggestions";
    } else if (/\b(go|going|visit|travel(?:ling)?|heading)\s+to\b/.test(t) ||
        /\b(what.*(?:do|see|visit)|attractions|activities|things)\b.*\bin\b/.test(t) ||
        /\b(museums?|restaurants?|food|sights?)\b.*\bin\b/.test(t)) {
        intent = "local_attractions";
    } else {
        intent = "destination_recommendations";
    }

    const entities = {};

    // Extract destination
    const dest = extractDestination(userText) || inferDestinationFromText(userText);
    if (dest) entities.destination = dest;

    // Extract trip length
    let m = userText.match(/\b(\d{1,3})\s*(?:day|days|d)\b/i);
    if (m) entities.trip_length_days = Number(m[1]);

    // Extract month/season
    const months = "january|february|march|april|may|june|july|august|september|october|november|december";
    const monthMatch = userText.match(new RegExp(`\\b(${months})\\b`, "i"));
    const seasonMatch = userText.match(/\b(spring|summer|fall|autumn|winter)\b/i);

    if (monthMatch) {
        entities.month_or_season = monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1).toLowerCase();
    } else if (seasonMatch) {
        entities.month_or_season = seasonMatch[1].charAt(0).toUpperCase() + seasonMatch[1].slice(1).toLowerCase();
    }

    // Extract budget
    const budgetMatch = userText.match(/\b(low|budget|cheap|mid|medium|high|luxury|expensive)\b/i);
    if (budgetMatch) {
        const budget = budgetMatch[1].toLowerCase();
        if (['low', 'budget', 'cheap'].includes(budget)) entities.budget = 'low';
        else if (['mid', 'medium'].includes(budget)) entities.budget = 'medium';
        else if (['high', 'luxury', 'expensive'].includes(budget)) entities.budget = 'high';
    }

    // Extract interests
    const interestWords = ['hiking','museums','food','beach','culture','history','nightlife','shopping','nature','adventure','art','architecture'];
    const found = interestWords.filter(w => new RegExp(`\\b${w}\\b`, "i").test(userText));
    if (found.length) entities.interests = found;

    return {
        intent,
        entities: { ...conversationContext, ...entities },
        conversationContinuation: false
    };
}

function extractDestination(text = "") {
    const STOP = new Set(["november","december","january","february","march","april","may","june","july","august","september","october",
        "winter","spring","summer","fall","autumn","weekend","trip","vacation","holiday","days","weeks"]);
    const m = text.match(/\b(?:to|in|for)\s+([A-Z][\w''.-]+(?:\s+[A-Z][\w''.-]+){0,3})\b/);
    if (!m) return null;
    const candidate = m[1].trim();
    if (STOP.has(candidate.toLowerCase())) return null;
    return candidate;
}

// Enhanced route node with memory
async function routeNode(state) {
    try {
        // Add current user message to history
        const updatedState = addToHistory(state, "user", state.userMessage, {
            entities: state.entities,
            intent: state.intent
        });

        // Get routing with conversation context
        const routed = enhancedHeuristicRoute(
            state.userMessage,
            {
                conversationContext: state.conversationContext,
                previousPlans: state.previousPlans
            }
        );

        // Handle follow-ups
        if (routed.intent === "follow_up" || routed.intent === "refinement") {
            return await handleFollowUp(updatedState, routed);
        }

        // Destination inference with context
        if (routed.intent === "packing_suggestions" && !routed.entities?.destination) {
            const inferred = inferDestinationFromText(state.userMessage) ||
                state.conversationContext?.destination;
            if (inferred) {
                routed.entities = { ...(routed.entities || {}), destination: inferred };
            }
        }

        const mergedEntities = normalizeEntities({
            ...(state.entities || {}),
            ...(routed.entities || {})
        });

        // Update conversation context
        const updatedContext = {
            ...state.conversationContext,
            ...mergedEntities
        };

        const newState = {
            ...updatedState,
            intent: routed.intent,
            entities: mergedEntities,
            conversationContext: updatedContext
        };

        // Guard unknown/unsupported intents
        if (!SUPPORTED_INTENTS.has(routed.intent)) {
            return validateState({
                ...newState,
                reply: "I can help with destination recommendations, packing suggestions, or local attractions. What would you like?",
                done: true
            });
        }

        return validateState(newState);
    } catch (error) {
        console.error("Error in routeNode:", error);
        return validateState({
            ...state,
            reply: "I had trouble understanding your request. Could you rephrase it?",
            done: true
        });
    }
}

async function handleFollowUp(state, routed) {
    const lastPlan = state.previousPlans[state.previousPlans.length - 1];

    if (!lastPlan) {
        return validateState({
            ...state,
            reply: "I don't have context from our previous conversation. Could you please be more specific?",
            done: true
        });
    }

    // For refinements, update context and re-plan
    if (routed.intent === "refinement") {
        const updatedEntities = { ...lastPlan.entities, ...routed.entities };
        return validateState({
            ...state,
            intent: lastPlan.intent,
            entities: updatedEntities,
            conversationContext: updatedEntities
        });
    }

    // For follow-ups, provide contextual response
    const followUpReply = `Based on our previous discussion about ${lastPlan.entities.destination || 'your trip'}, ` +
        `I can help you with more details. What specific aspect would you like me to elaborate on?`;

    return validateState({
        ...state,
        reply: followUpReply,
        done: true
    });
}

async function needMoreNode(state) {
    // For follow-ups, skip the field checking
    if (state.intent === "follow_up") {
        return { ...state };
    }

    const required = REQUIRED_FIELDS[state.intent] || [];
    const entities = state.entities || {};
    const askField = required.find((f) => isMissingField(f, entities[f]));

    if (askField) {
        const hint =
            askField === "interests" ? " (comma-separated)" :
                askField === "trip_length_days" ? " (number of days)" : "";
        const q = `${FIELD_QUESTIONS[askField] || `Please provide ${askField}`}${hint}`;
        return { ...state, reply: q, done: false, lastAskField: askField };
    }
    return { ...state, lastAskField: null };
}

async function planNode(state) {
    if (!state.intent || (!SUPPORTED_INTENTS.has(state.intent))) {
        return validateState({
            ...state,
            reply: state.reply || "I can help with destination recommendations, packing suggestions, or local attractions.",
            done: true
        });
    }

    try {
        const data = await runPlanner(state.intent, state.entities, state.userProfile || {});
        const reply = (typeof data === "string" && data.trim()) ? data : "I prepared your plan.";

        // Add the plan to history
        const planRecord = {
            intent: state.intent,
            entities: state.entities,
            result: reply,
            timestamp: new Date().toISOString()
        };

        const finalState = {
            ...state,
            reply,
            done: true,
            previousPlans: [...(state.previousPlans || []), planRecord]
        };

        // Add assistant response to conversation history
        return addToHistory(finalState, "assistant", reply, {
            intent: state.intent,
            entities: state.entities
        });

    } catch (err) {
        console.error("Error in planNode:", err);
        return validateState({
            ...state,
            reply: "Something went wrong while preparing your plan. Please try again.",
            done: true
        });
    }
}

function needMoreOrPlan(state) {
    if (!state.intent || !SUPPORTED_INTENTS.has(state.intent)) {
        return "ask";
    }

    // Follow-ups go straight to planning/response
    if (state.intent === "follow_up" || state.intent === "refinement") {
        return "plan";
    }
    console.log("maya");
    const required = REQUIRED_FIELDS[state.intent] || [];
    const entities = state.entities || {};
    const missing = required.find((f) => isMissingField(f, entities[f]));
    return missing ? "ask" : "plan";
}

export function buildGraph() {
    const graph = new StateGraph(StateSchema)
        .addNode("route", routeNode)
        .addNode("needMore", needMoreNode)
        .addNode("plan", planNode)
        .addEdge("__start__", "route")
        .addEdge("route", "needMore")
        .addConditionalEdges("needMore", needMoreOrPlan, { ask: "__end__", plan: "plan" })
        .addEdge("plan", "__end__");

    return graph.compile();
}