import express from 'express';
import cors from 'cors';
import {TRAVEL_PROMPTS} from './prompts/travelPrompts.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Simple in-memory storage for conversations
const conversations = new Map();

// Ollama API configuration
const OLLAMA_URL = 'http://localhost:11434';
const MODEL_NAME = 'llama3.2'; // You can change this to your preferred model

// Function to call Ollama API with specialized prompts
async function callOllama(prompt, conversationHistory = [], intent = 'general') {
    try {
        // Get the appropriate specialized prompt
        const systemPrompt = TRAVEL_PROMPTS[intent] || TRAVEL_PROMPTS.general;

        // Build context from conversation history
        let contextPrompt = systemPrompt + '\n\n';

        // Add recent conversation context
        if (conversationHistory.length > 0) {
            contextPrompt += "Recent conversation context:\n";
            conversationHistory.slice(-6).forEach(msg => {
                contextPrompt += `${msg.role}: ${msg.message}\n`;
            });
            contextPrompt += "\n";
        }

        contextPrompt += `User: ${prompt}\nAssistant:`;

        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                prompt: contextPrompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    max_tokens: 600
                }
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`);
        }

        const data = await response.json();
        return data.response.trim();

    } catch (error) {
        console.error('Ollama API error:', error);
        throw new Error('Failed to get AI response. Make sure Ollama is running.');
    }
}

function detectIntent(message) {
    const msg = message.toLowerCase();

    // More specific pattern matching
    if (msg.includes('destination') || msg.includes('where to go') || msg.includes('where should') ||
        msg.includes('recommend') || msg.includes('place to visit') || msg.includes('country to') ||
        /\b(go|visit|travel)\s+to\b/.test(msg) || msg.includes('trip ideas')) {
        return 'destinations';
    }

    if (msg.includes('pack') || msg.includes('bring') || msg.includes('luggage') ||
        msg.includes('what to wear') || msg.includes('clothing') || msg.includes('gear') ||
        msg.includes('suitcase') || msg.includes('backpack') || /\bwhat.*need\b/.test(msg)) {
        return 'packing';
    }

    if (msg.includes('attraction') || msg.includes('things to do') || msg.includes('activities') ||
        msg.includes('see') || msg.includes('visit') || msg.includes('itinerary') ||
        msg.includes('museums') || msg.includes('restaurants') || /\bwhat.*do\b.*\bin\b/.test(msg)) {
        return 'attractions';
    }

    if (msg.includes('hello') || msg.includes('hi') || msg.includes('help') || msg.includes('start')) {
        return 'greeting';
    }

    return 'general';
}

// Main chat endpoint
app.post('/chat', async (req, res) => {
    try {
        const { message, sessionId = 'default' } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get conversation history
        let conversation = conversations.get(sessionId) || [];

        // Detect intent for analytics
        const intent = detectIntent(message);

        // Get AI response from Ollama with specialized prompt
        const reply = await callOllama(message, conversation, intent);

        // Save to conversation history
        conversation.push(
            { role: 'user', message, timestamp: new Date().toISOString() },
            { role: 'assistant', message: reply, intent, timestamp: new Date().toISOString() }
        );

        if (conversation.length > 20) {
            conversation = conversation.slice(-20);
        }

        conversations.set(sessionId, conversation);

        res.json({
            reply,
            intent,
            conversationLength: Math.floor(conversation.length / 2),
            model: MODEL_NAME,
            success: true
        });

    } catch (error) {
        console.error('Chat error:', error);
        const fallbackResponse = "I'm having trouble connecting to my AI brain right now. Please make sure Ollama is running with: `ollama serve` and you have a model installed like: `ollama pull llama3.2`";
        res.status(500).json({
            error: 'AI service unavailable',
            reply: fallbackResponse,
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(` AI Travel Bot running on http://localhost:${PORT}`);
});