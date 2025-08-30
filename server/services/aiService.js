import {TRAVEL_PROMPTS} from '../prompts/travelPrompts.js';
import {extractLocation, getWeatherData} from './weatherService.js';

const conversations = new Map();

const OLLAMA_URL = 'http://localhost:11434';
const MODEL_NAME = 'llama3.2'; // You can change this to your preferred model

export function detectIntent(message) {
    const msg = message.toLowerCase();

    if (msg.includes('weather') || msg.includes('temperature') || msg.includes('climate')) {
        return 'weather';
    }
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

export function shouldUseWeatherData(message) {
    const msg = message.toLowerCase();

    const weatherKeywords = [
        'weather', 'temperature', 'rain', 'sunny', 'cloudy', 'hot', 'cold',
        'climate', 'forecast', 'pack', 'wear', 'dress', 'bring'
    ];

    const hasWeatherKeyword = weatherKeywords.some(keyword => msg.includes(keyword));
    const hasLocation = /\b(in|to|from|near)\s+[a-z]{2,}/i.test(message);

    return hasWeatherKeyword && hasLocation;
}

function buildPromptWithWeather(userMessage, weatherData, conversationHistory, intent) {
    let prompt = TRAVEL_PROMPTS[intent] || TRAVEL_PROMPTS.general;
    prompt += '\n\n';

    if (weatherData && !weatherData.error) {
        prompt += `CURRENT WEATHER DATA:
Location: ${weatherData.location}, ${weatherData.country}
Temperature: ${weatherData.temperature}°C (feels like ${weatherData.feels_like}°C)
Conditions: ${weatherData.description}
Humidity: ${weatherData.humidity}%
Wind: ${weatherData.wind_speed} m/s

IMPORTANT: Use this real-time weather data to provide specific, practical advice. Don't just repeat the numbers - 
explain what they mean for travelers and what they should do about it.`;
    } else if (weatherData && weatherData.error) {
        prompt += `Weather data unavailable: ${weatherData.error}\nProvide general advice based on typical seasonal patterns.\n\n`;
    }

    if (conversationHistory.length > 0) {
        prompt += "Recent conversation:\n";
        conversationHistory.slice(-4).forEach(msg => {
            prompt += `${msg.role}: ${msg.message}\n`;
        });
        prompt += "\n";
    }

    prompt += `User: ${userMessage}\nAssistant:`;
    return prompt;
}

async function callOllamaWithWeather(message, conversationHistory = []) {
    try {
        const intent = detectIntent(message);

        let weatherData = null;
        let weatherUsed = false;

        if (shouldUseWeatherData(message)) {
            const location = extractLocation(message);

            if (location) {
                weatherData = await getWeatherData(location);
                weatherUsed = !weatherData.error;
            }
        }

        const promptWithWeather = buildPromptWithWeather(
            message,
            weatherData,
            conversationHistory,
            intent
        );

        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                prompt: promptWithWeather,
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

        return {
            response: data.response.trim(),
            weatherUsed: weatherUsed,
            weatherData: weatherUsed ? weatherData : null,
            intent: intent
        };

    } catch (error) {
        console.error('Ollama API error:', error);
        throw new Error('Failed to get AI response. Make sure Ollama is running.');
    }
}

export async function handleChat(req, res) {
    try {
        const {message, sessionId = 'default'} = req.body;

        if (!message) {
            return res.status(400).json({error: 'Message is required'});
        }

        let conversation = conversations.get(sessionId) || [];
        const reply = await callOllamaWithWeather(message, conversation);

        const intent = reply.intent;

        conversation.push(
            {role: 'user', message, timestamp: new Date().toISOString()},
            {
                role: 'assistant',
                message: reply.response,
                intent,
                weatherUsed: reply.weatherUsed,
                timestamp: new Date().toISOString()
            }
        );

        if (conversation.length > 20) {
            conversation = conversation.slice(-20);
        }

        conversations.set(sessionId, conversation);

        res.json({
            reply: reply.response,
            intent: reply.intent,
            weatherUsed: reply.weatherUsed,
            weatherData: reply.weatherData,
            model: MODEL_NAME,
            conversationLength: Math.floor(conversation.length / 2),
            success: true
        });

    } catch (error) {
        const fallbackResponse = "I'm having trouble connecting to my AI brain right now. Please make sure Ollama is running with: `ollama serve` and you have a model installed like: `ollama pull llama3.2`";
        res.status(500).json({
            error: 'AI service unavailable',
            reply: fallbackResponse,
            details: error.message
        });
    }
}