const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const weatherCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

export function extractLocation(message) {
    const cleanMessage = message.replace(/\s+/g, ' ').trim();

    const patterns = [

        /\b(?:in|to|from|near|weather in|temperature in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?=\s+(?:in|on|for|during|this|next|last|tomorrow|today|yesterday|\d+\s+days?|\d+\s+weeks?|january|february|march|april|may|june|july|august|september|october|november|december)\b|[.,?!]|$)/i,


        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:weather|temperature|climate)/i,


        /\bpack.*?for\s+(?:hiking\s+in\s+|traveling\s+to\s+|visiting\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?=\s+(?:in|on|for|during|this|next|last|tomorrow|today|yesterday|\d+\s+days?|\d+\s+weeks?|january|february|march|april|may|june|july|august|september|october|november|december)\b|[.,?!]|$)/i,


        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?=\s+(?:weather|temperature|climate|is\s+(?:hot|cold|warm|cool|sunny|rainy))\b)/i
    ];

    for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const match = pattern.exec(cleanMessage);
        if (match) {
            let location = match[1].trim();

            location = location.replace(/\s+(?:in|on|for|during|this|next|last|tomorrow|today|yesterday|\d+\s+days?|\d+\s+weeks?|january|february|march|april|may|june|july|august|september|october|november|december).*$/i, '');

            if (location !== match[1].trim()) {
                console.log(`Cleaned location: "${location}"`);
            }

            if (isValidLocation(location)) {
                return location;
            } else {
                console.log(`Invalid location: "${location}"`);
            }
        }
    }

    const fallbackPattern = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b/g;
    let match;
    while ((match = fallbackPattern.exec(cleanMessage)) !== null) {
        const candidate = match[1];

        if (!isCommonWord(candidate) && isValidLocation(candidate)) {
            return candidate;
        }
    }

    console.log('No location found');
    return null;
}

function isValidLocation(location) {
    // Remove obviously bad matches
    const invalidPatterns = [
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
        /\b\d+\s+(days?|weeks?|months?|years?)\b/i,
        /\b(this|next|last|for|during|in|on|at|with|and|or|but)\b/i,
        /^(in|for|during|on|at|with|and|or|but)\s/i
    ];

    for (const pattern of invalidPatterns) {
        if (pattern.test(location)) {
            return false;
        }
    }

    const words = location.split(/\s+/);
    if (words.length > 4 || words.some(word => word.length < 2)) {
        return false;
    }

    return true;
}

function isCommonWord(word) {
    const commonWords = [
        'This', 'That', 'These', 'Those', 'What', 'Where', 'When', 'Why', 'How',
        'Can', 'Could', 'Should', 'Would', 'Will', 'May', 'Might', 'Must',
        'The', 'And', 'But', 'For', 'Not', 'You', 'All', 'Any', 'Can',
        'Had', 'Her', 'Was', 'One', 'Our', 'Out', 'Day', 'Get', 'Has',
        'Him', 'His', 'How', 'Its', 'Let', 'New', 'Now', 'Old', 'See',
        'Two', 'Way', 'Who', 'Boy', 'Did', 'End', 'Few', 'Got', 'Man',
        'Own', 'Say', 'She', 'Too', 'Use'
    ];
    return commonWords.includes(word);
}

export async function getWeatherData(location) {
    if (!WEATHER_API_KEY) {
        return {error: 'Weather API key not configured. Add OPENWEATHER_API_KEY to your .env file'};
    }

    const cacheKey = location.toLowerCase();
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }

    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${WEATHER_API_KEY}&units=metric`
        );

        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        const data = await response.json();

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