import express from 'express';
import cors from 'cors';
import {TRAVEL_PROMPTS} from './prompts/travelPrompts.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

const weatherCache = new Map();

const CACHE_DURATION = 5 * 60 * 1000;

// Simple in-memory storage for conversations
const conversations = new Map();

// Ollama API configuration
const OLLAMA_URL = 'http://localhost:11434';
const MODEL_NAME = 'llama3.2'; // You can change this to your preferred model

function extractLocation(message) {
    // Simple patterns to find locations
    const patterns = [
        /\b(?:in|to|from|near|weather in|temperature in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:weather|temperature|climate)/i,
        /\bpack.*for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
    ];

    for (const pattern of patterns) {
        const match = pattern.exec(message);
        if (match) {
            return match[1].trim();
        }
    }
    return null;
}

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

async function getWeatherData(location) {
    if (!WEATHER_API_KEY) {
        return {error: 'Weather API key not configured. Add OPENWEATHER_API_KEY to your .env file'};
    }

    // Check cache first
    const cacheKey = location.toLowerCase();
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`🗃️ Cache hit for: ${cacheKey}`);
        return cached.data;
    }
    console.log(`🔁 Cache miss. Fetching weather for: ${location}`);

    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${WEATHER_API_KEY}&units=metric`
        );

        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        const data = await response.json();

        // Extract useful weather information
        const weatherInfo = {
            location: data.name,
            country: data.sys.country,
            temperature: Math.round(data.main.temp),
            feels_like: Math.round(data.main.feels_like),
            humidity: data.main.humidity,
            description: data.weather[0].description,
            wind_speed: Math.round(data.wind.speed * 10) / 10, // Round to 1 decimal
            timestamp: new Date().toISOString()
        };
        console.log({weatherInfo})
        // Cache the result
        weatherCache.set(cacheKey, {
            data: weatherInfo,
            timestamp: Date.now()
        });

        return weatherInfo;

    } catch (error) {
        console.error('Weather API error:', error);
        return {
            error: `Unable to get weather for ${location}. Please check the location name.`
        };
    }
}

function detectIntent(message) {
    const msg = message.toLowerCase();

    // More specific pattern matching
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


function shouldUseWeatherData(message) {
    const msg = message.toLowerCase();

    // Use weather API if message contains weather-related keywords
    const weatherKeywords = [
        'weather', 'temperature', 'rain', 'sunny', 'cloudy', 'hot', 'cold',
        'climate', 'forecast', 'pack', 'wear', 'dress', 'bring'
    ];

    const hasWeatherKeyword = weatherKeywords.some(keyword => msg.includes(keyword));
    const hasLocation = /\b(in|to|from|near)\s+[a-z]{2,}/i.test(message);

    console.log({msg, hasLocation, hasWeatherKeyword})
    return hasWeatherKeyword && hasLocation;
}

function buildPromptWithWeather(userMessage, weatherData, conversationHistory, intent) {
    let prompt = TRAVEL_PROMPTS[intent] || TRAVEL_PROMPTS.general;
    prompt += '\n\n';

    // Add weather data if available
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

    // Add conversation context
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
        console.log(`🧠 Detected intent: ${intent}`);
        let weatherData = null;
        let weatherUsed = false;

        // Decide if we need weather data
        if (shouldUseWeatherData(message)) {
            console.log('✅ Weather keywords + location detected');
            const location = extractLocation(message);
            console.log(`📍 Extracted location: ${location}`);

            if (location) {
                console.log(`🌤️ Fetching weather for: ${location}`);
                weatherData = await getWeatherData(location);
                console.log({weatherData});
                weatherUsed = !weatherData.error;
            }
        }

        // Build the enhanced prompt
        const enhancedPrompt = buildPromptWithWeather(
            message,
            weatherData,
            conversationHistory,
            intent
        );

        // Call Ollama
        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                prompt: enhancedPrompt,
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


// Main chat endpoint
app.post('/chat', async (req, res) => {
    try {
        const {message, sessionId = 'default'} = req.body;

        if (!message) {
            return res.status(400).json({error: 'Message is required'});
        }

        // Get conversation history
        let conversation = conversations.get(sessionId) || [];
        const reply = await callOllamaWithWeather(message, conversation);

        const intent = reply.intent;

        // Save to conversation history
        conversation.push(
            {role: 'user', message, timestamp: new Date().toISOString()},
            {
                role: 'assistant', message: reply.response, intent, weatherUsed: reply.weatherUsed,
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