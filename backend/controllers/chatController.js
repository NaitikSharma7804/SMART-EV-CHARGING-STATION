import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI(); // Automatically picks up GEMINI_API_KEY from environment variables

export const handleChat = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: "You are an intelligent customer support assistant for EV Charge Hub. Help electric vehicle drivers with charging issues, station locations, bookings, and platform features."
            }
        });

        res.status(200).json({ reply: response.text });
    } catch (error) {
        console.error('Gemini Chat Error:', error);
        res.status(500).json({ error: 'Failed to generate response from AI' });
    }
};