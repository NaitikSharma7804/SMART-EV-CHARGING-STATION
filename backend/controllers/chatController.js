// backend/controllers/chatController.js
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const handleChat = async (req, res) => {
    try {
        const { message } = req.body;
        
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: message,
        });

        return res.status(200).json({ success: true, reply: response.text });
    } catch (error) {
        console.error('Gemini Chat Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to generate response from AI' });
    }
};