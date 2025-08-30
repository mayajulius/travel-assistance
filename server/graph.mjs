// memory-graph.mjs - Cleaned, fluent, and memory-enhanced
import { StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import {
    routeQuery,
    runPlanner,
    inferDestinationFromText,
    FIELD_QUESTIONS,
} from "./app.mjs";
import {
    isMissingField,
    normalizeEntities,
} from "./helpers.mjs";
import { heuristicRoute } from "./app.mjs";

const REQUIRED_FIELDS = {
    destination_recommendations: ["month_or_season", "budget", "interests"],
    packing_suggestions: ["destination", "trip_length_days", "month_or_season"],
    local_attractions: ["destination", "trip_length_days", "interests"],
};

const SUPPORTED_INTENTS = new Set([
    ...Object.keys(REQUIRED_FIELDS),
    "follow_up",
    "refinement",
]);

const StateSchema = z.object({
    userMessage: z.string(),
    userProfile: z.record(z.any()).default({}),
    intent: z.string().optional(),
    entities: z.record(z.any()).default({}),
    reply: z.string().default(""),
    done: z.boolean().default(false),
    lastAskField: z.string().nullable().default(null),
    conversationHistory: z
        .array(
            z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string(),
                timestamp: z.string(),
                entities: z.record(z.any()).optional(),
                intent: z.string().optional(),
            })
        )
        .default([]),
    conversationContext: z.record(z.any()).default({}),
    conversationTurn: z.number().default(0),
    previousPlans: z
        .array(
            z.object({
                intent: z.string(),
                entities: z.record(z.any()),
                result: z.string(),
                timestamp: z.string(),
            })
        )
        .default([]),
});

const safeDefaults = StateSchema.parse({ userMessage: "" });

const validateState = (state) => {
    try {
        return StateSchema.parse({ ...safeDefaults, ...state });
    } catch (err) {
        console.error("State validation failed:", err);
        return StateSchema.parse({
            ...safeDefaults,
            reply: "I encountered an internal error. Please try again.",
            done: true,
        });
    }
};

export const initialState = (userMessage, userProfile = {}, existingHistory = []) => ({
    ...safeDefaults,
    userMessage,
    userProfile,
    conversationHistory: existingHistory,
    conversationTurn: existingHistory.length,
});

const addToHistory = (state, role, content, additional = {}) => ({
    ...state,
    conversationTurn: state.conversationTurn + 1,
    conversationHistory: [
        ...state.conversationHistory,
        {
            role,
            content,
            timestamp: new Date().toISOString(),
            ...additional,
        },
    ],
});

function enhancedHeuristicRoute(userText, { conversationContext = {} } = {}) {
    const lower = userText.toLowerCase();
    const followUpPatterns = [
        /\b(more|what about|any other|also|additionally|instead|rather|change|better|compare|versus|vs|prefer|that|those|it|them)\b/i,
    ];

    const isFollowUp = followUpPatterns.some((p) => p.test(userText));
    if (isFollowUp && Object.keys(conversationContext).length) {
        return { intent: "follow_up", entities: conversationContext, conversationContinuation: true };
    }

    const entities = {};
    let intent = "destination_recommendations";

    if (/\b(pack|luggage|clothing|gear)\b/.test(lower)) intent = "packing_suggestions";
    else if (/\b(visit|attractions|things|restaurants?|museums?|sights?)\b.*\bin\b/.test(lower)) intent = "local_attractions";

    entities.destination = inferDestinationFromText(userText);
    const days = userText.match(/\b(\d{1,3})\s*(?:day|days|d)\b/i);
    if (days) entities.trip_length_days = Number(days[1]);

    const monthMatch = userText.match(/\b(january|february|...|december)\b/i);
    const seasonMatch = userText.match(/\b(spring|summer|fall|autumn|winter)\b/i);
    if (monthMatch) entities.month_or_season = capitalize(monthMatch[1]);
    if (seasonMatch) entities.month_or_season = capitalize(seasonMatch[1]);

    const budgetMatch = userText.match(/\b(low|mid|medium|high|luxury|cheap|budget|expensive)\b/i);
    if (budgetMatch) {
        const b = budgetMatch[1].toLowerCase();
        entities.budget = ["low", "budget", "cheap"].includes(b)
            ? "low"
            : ["mid", "medium"].includes(b)
                ? "medium"
                : "high";
    }

    const interests = ["hiking", "museums", "food", "beach", "culture", "history", "nightlife", "shopping", "nature", "adventure", "art", "architecture"];
    const matchedInterests = interests.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(userText));
    if (matchedInterests.length) entities.interests = matchedInterests;

    return { intent, entities: { ...conversationContext, ...entities }, conversationContinuation: false };
}

async function routeNode(state) {
    const updatedState = addToHistory(state, "user", state.userMessage, {
        entities: state.entities,
        intent: state.intent,
    });

    const routed = enhancedHeuristicRoute(state.userMessage, updatedState);

    if (["follow_up", "refinement"].includes(routed.intent)) {
        return await handleFollowUp(updatedState, routed);
    }

    if (routed.intent === "packing_suggestions" && !routed.entities.destination) {
        routed.entities.destination = state.conversationContext?.destination || inferDestinationFromText(state.userMessage);
    }

    const mergedEntities = normalizeEntities({ ...state.entities, ...routed.entities });
    const newState = {
        ...updatedState,
        intent: routed.intent,
        entities: mergedEntities,
        conversationContext: { ...state.conversationContext, ...mergedEntities },
    };

    if (!SUPPORTED_INTENTS.has(routed.intent)) {
        return validateState({
            ...newState,
            reply: "I can help with destination recommendations, packing suggestions, or local attractions. What would you like?",
            done: true,
        });
    }

    return validateState(newState);
}

async function handleFollowUp(state, routed) {
    const lastPlan = state.previousPlans[state.previousPlans.length - 1];
    if (!lastPlan) {
        return validateState({ ...state, reply: "I'm not sure what you're referring to. Can you clarify?", done: true });
    }

    if (routed.intent === "refinement") {
        const updated = { ...lastPlan.entities, ...routed.entities };
        return validateState({ ...state, intent: lastPlan.intent, entities: updated, conversationContext: updated });
    }

    return validateState({
        ...state,
        reply: `Sure! What more would you like to know about your trip to ${lastPlan.entities.destination || "the destination"}?`,
        done: true,
    });
}

async function needMoreNode(state) {
    if (state.intent === "follow_up") return state;
    const missing = (REQUIRED_FIELDS[state.intent] || []).find((f) => isMissingField(f, state.entities[f]));
    if (missing) {
        const hint = missing === "interests" ? " (comma-separated)" : missing === "trip_length_days" ? " (number of days)" : "";
        return { ...state, reply: `${FIELD_QUESTIONS[missing] || `Please provide ${missing}`}${hint}`, done: false, lastAskField: missing };
    }
    return { ...state, lastAskField: null };
}

async function planNode(state) {
    if (!SUPPORTED_INTENTS.has(state.intent)) {
        return validateState({ ...state, reply: "I'm not sure how to help. Try rephrasing your request.", done: true });
    }

    try {
        const result = await runPlanner(state.intent, state.entities, state.userProfile);
        const plan = {
            intent: state.intent,
            entities: state.entities,
            result,
            timestamp: new Date().toISOString(),
        };

        return addToHistory({
            ...state,
            reply: result,
            done: true,
            previousPlans: [...state.previousPlans, plan],
        }, "assistant", result, {
            intent: state.intent,
            entities: state.entities,
        });
    } catch (err) {
        console.error("Planning failed:", err);
        return validateState({ ...state, reply: "Something went wrong while preparing your plan.", done: true });
    }
}

function needMoreOrPlan(state) {
    if (!SUPPORTED_INTENTS.has(state.intent)) return "ask";
    if (["follow_up", "refinement"].includes(state.intent)) return "plan";
    const missing = (REQUIRED_FIELDS[state.intent] || []).find((f) => isMissingField(f, state.entities[f]));
    return missing ? "ask" : "plan";
}

export function buildGraph() {
    return new StateGraph(StateSchema)
        .addNode("route", routeNode)
        .addNode("needMore", needMoreNode)
        .addNode("plan", planNode)
        .addEdge("__start__", "route")
        .addEdge("route", "needMore")
        .addConditionalEdges("needMore", needMoreOrPlan, {
            ask: "__end__",
            plan: "plan",
        })
        .addEdge("plan", "__end__")
        .compile();
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
