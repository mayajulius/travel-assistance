// server/app.mjs
import { readFile } from "node:fs/promises";
import { ollamaChatMarkdown } from "./ollama.mjs";

// ---------- Load prompts ----------
const [destinationsPrompt, packingPrompt, attractionsPrompt] = await Promise.all([
    readFile(new URL("./prompts/destinations.md", import.meta.url), "utf8"),
    readFile(new URL("./prompts/packing.md", import.meta.url), "utf8"),
    readFile(new URL("./prompts/attractions.md", import.meta.url), "utf8")
]);

// ---------- Router prompt ----------
const ROUTER_PROMPT = `You are a strict travel router. Classify the user's message into EXACTLY ONE of:
- "destination_recommendations"
- "packing_suggestions"  
- "local_attractions"

Then extract entities: destination (string), trip_length_days (number), month_or_season (string), budget (string), interests (string[]).

CRITICAL RULES:
1. Return ONLY valid JSON - no explanations, no markdown, no extra text
2. Start response with { and end with }
3. All keys must be quoted
4. All string values must be quoted
5. Numbers should not be quoted
6. Arrays must use proper JSON syntax

JSON structure:
{
  "intent": "one_of_the_three_options",
  "entities": {
    "destination": "string or null",
    "trip_length_days": number or null,
    "month_or_season": "string or null",
    "budget": "low/medium/high or null",
    "interests": ["array", "of", "strings"] or null
  }
}

DISAMBIGUATION RULES:
1) "what should I do/see in <place>" OR "I want to go/visit/travel to <place>" → "local_attractions"
2) "where should I go" / "recommend places" without specific destination → "destination_recommendations"  
3) "packing, luggage, what to bring, clothing" → "packing_suggestions"
4) Specific destination mentioned but unclear intent → prefer "local_attractions"

Examples:
Input: "i want to go to canada"
Output: {"intent":"local_attractions","entities":{"destination":"Canada"}}

Input: "What to pack for 5 days in Iceland in November?"
Output: {"intent":"packing_suggestions","entities":{"destination":"Iceland","trip_length_days":5,"month_or_season":"November"}}`

// ---------- Enhanced heuristic routing (fallback) ----------
function heuristicRoute(userText = "") {
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
    else {
        m = userText.match(/\b(\d{1,2})\s*(?:week|weeks|w)\b/i);
        if (m) entities.trip_length_days = Number(m[1]) * 7;
    }

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

    return { intent, entities, missing_fields: [] };
}

export function extractDestination(text = "") {
    const STOP = new Set(["november","december","january","february","march","april","may","june","july","august","september","october",
        "winter","spring","summer","fall","autumn","weekend","trip","vacation","holiday","days","weeks"]);
    const m = text.match(/\b(?:to|in|for)\s+([A-Z][\w''.-]+(?:\s+[A-Z][\w''.-]+){0,3})\b/);
    if (!m) return null;
    const candidate = m[1].trim();
    if (STOP.has(candidate.toLowerCase())) return null;
    return candidate;
}

function inferDestinationFromText(text = "") {
    const dict = [
        "Patagonia","Kyoto","Tokyo","Osaka","Bali","Iceland","Alps","Andes","Rockies",
        "Sahara","Lisbon","Porto","Seoul","Bangkok","New York","London","Paris","Rome",
        "Barcelona","Amsterdam","Berlin","Prague","Vienna","Budapest","Istanbul",
        "Tel Aviv","Athens","Naples","Sicily","Madeira","Azores","Taipei","San Francisco",
        "Los Angeles","Chicago","Sydney","Melbourne","Queenstown","Cusco","Machu Picchu","Canada",
        "Japan","France","Italy","Spain","Germany","Netherlands","Portugal"
    ];
    return dict.find(name => new RegExp(`\\b${name}\\b`, "i").test(text)) || null;
}

// ---------- Field questions ----------
const FIELD_QUESTIONS = {
    destination: "Where are you going? (city/country/region)",
    month_or_season: "When is the trip? (month or season)",
    trip_length_days: "How many days is the trip?",
    budget: "What's your budget? (low / medium / high)",
    interests: "Any interests? (comma-separated, e.g., hiking, food, museums)"
};

function parseAnswer(field, answer) {
    const cleaned = (answer ?? "").trim();
    if (!cleaned) return null;
    if (field === "trip_length_days") {
        const n = parseInt(cleaned, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (field === "interests") {
        return cleaned.split(",").map(s => s.trim()).filter(Boolean);
    }
    return cleaned;
}

// ---------- Router ----------
export async function routeQuery(userText, userProfile = {}) {
    const userPayload = `(User profile): ${JSON.stringify(userProfile)}\n(User message): ${userText}`;


    try {
        const raw = await ollamaChatMarkdown({
            system: ROUTER_PROMPT,
            user: userPayload,
            model: process.env.ROUTER_MODEL || "gemma3:8b",
        });
        return heuristicRoute(userText); // Don't parse JSON anymore
    } catch (err) {
        console.error("[router] ollama error:", err.message);
        return heuristicRoute(userText);
    }
}
// ---------- Planner ----------
export async function runPlanner(intent, entities, userProfile = {}) {
    const ctx = { ...userProfile, ...entities };
    const promptByIntent = {
        destination_recommendations: destinationsPrompt,
        packing_suggestions: packingPrompt,
        local_attractions: attractionsPrompt,
    };
    const prompt = promptByIntent[intent];
    if (!prompt) throw new Error(`Unknown intent: ${intent}`);


    try {
        const raw = await ollamaChatMarkdown({
            system: prompt,
            user: `Context:\n${JSON.stringify(ctx, null, 2)}`,
            model: process.env.PACKING_MODEL || "gemma3:8b",
        });
        return raw; // Return markdown string directly
    } catch (err) {
        console.error("[planner] ollama error:", err.message);
        return "Plan unavailable right now.";
    }
}

// ---------- Exports ----------
export {
    inferDestinationFromText,
    FIELD_QUESTIONS,
    parseAnswer
};