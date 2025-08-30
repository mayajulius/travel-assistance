Prompt Engineering Notes:

Intent Detection: I used simple keyword and regex checks to route messages into 4 types: weather, packing, destinations, and attractions.
Custom Prompts per Intent: Each intent has a tailored prompt with specific instructions to give relevant and helpful answers.
Weather Integration: When the message mentions weather + location, I add real-time weather data to the prompt to improve advice.
Keep it Short: I instructed the model to give answers in 10 lines or less, using lists when possible.
Conversation Context: I include the last few messages to keep replies coherent in follow-ups.
Error Handling: If weather fails or the model crashes, the assistant responds clearly without breaking the chat.

Conversation example:

[user] What should I pack for hiking in Patagonia in March for 10 days?
[assistant] Let me analyze your trip needs... Patagonia in March can be quite chilly, with temperatures ranging from 8°C to 4°C. Overcast clouds and high humidity will make the air feel even cooler, while strong winds of 8.2 m/s might require additional layers for warmth. Since you'll be hiking, it's essential to prioritize warm and breathable clothing. Cultural considerations, such as dressing modestly when visiting indigenous communities or churches, should also be taken into account.

Given your 10-day trip length and luggage weight constraints, I'll provide a suggested packing list that balances essentials with optional items.

**ESSENTIALS:**
- 1 waterproof jacket - Patagonia's unpredictable weather requires a reliable outer layer.
- 2 insulating layers (fleece or down) - Warmth is crucial for chilly mornings and evenings.
- 1 warm hat and gloves set - Wind-chilled temperatures can drop significantly.
- 1 pair of sturdy, waterproof hiking boots - Essential for exploring Patagonia's rugged terrain.

**CLOTHING:**
- **Base layers (top and bottom):** Quick-drying merino wool or synthetic fabrics to keep you warm and dry. Consider packing two sets per day, as these can be layered under insulating layers.
- **Mid-layers (fleece or down jacket):** For colder days, pack an insulating layer that can be easily stowed away when not needed.
- **Outerwear:** Waterproof and breathable shell jacket to protect against wind and rain.

**OPTIONAL:**
- 1 lightweight, quick-drying dress or jumpsuit - Versatile for dinner or casual outings in towns.
- 2 pairs of warm socks per day - Consider packing moisture-wicking materials to keep feet dry.

Packing tips:

* Roll clothing to save space and reduce wrinkles.
* Use packing cubes to organize items and compress luggage.
* Pack a portable laundry detergent or pre-moistened laundry wipes for quick cleanups.
* Wear your heaviest or bulkiest items (hiking boots, coat) on travel days to save luggage space.

By prioritizing warm and breathable clothing, you'll be well-equipped to handle Patagonia's unpredictable weather. Don't forget to pack layers that can be easily mixed and matched to suit changing conditions.
[user] what should i wear?
[assistant] Let me think through your outfit question... Considering the chilly temperatures in March, strong winds, and potential overcast conditions, I'd recommend prioritizing warm, breathable, and moisture-wicking clothing. For Patagonia's rugged terrain, sturdy hiking boots are a must, while layers can help you adjust to changing weather conditions.

To create a versatile and comfortable outfit, consider the following combination:

- Start with a base layer of quick-drying merino wool or synthetic fabrics for your top and bottom.
- Add a mid-layer of insulating fleece or down for colder days.
- Wear a waterproof and breathable shell jacket over your mid-layer for protection against wind and rain.

For footwear, opt for sturdy, waterproof hiking boots that can handle Patagonia's rugged terrain. Consider packing a pair of warm socks made from moisture-wicking materials to keep your feet dry and comfortable.

When it comes to dressing modestly when visiting indigenous communities or churches, avoid revealing clothing and opt for layers that can be easily removed if needed. Additionally, consider the dress code for any planned activities, such as hiking or wildlife viewing.

Practical next steps would be to research specific dress codes for your planned itinerary and consider packing clothing items that can be easily mixed and matched to suit changing conditions.

Key considerations you might not have thought of include the importance of layering for temperature regulation, as well as the need for waterproof and breathable clothing to protect against Patagonia's unpredictable weather.
