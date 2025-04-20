import express from 'express';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000; // Use environment port or default to 3000

// --- Configuration ---
const MODEL_NAME = "gemini-1.5-pro-latest"; // Or "gemini-1.5-flash-latest", etc. Check available models.
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("Error: GEMINI_API_KEY is not set in the environment variables.");
  process.exit(1); // Exit if API key is missing
}

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing for frontend requests
app.use(express.json()); // Enable parsing JSON request bodies

// --- AI Client Initialization ---
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// Store chat history per session (simple in-memory example)
// For production, use a database or more robust session management.
const chatHistories = {};

// --- API Endpoint ---
app.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Message and sessionId are required.' });
    }

    // Initialize history for new session
    if (!chatHistories[sessionId]) {
        chatHistories[sessionId] = [];
    }

    const currentHistory = chatHistories[sessionId];

    const generationConfig = {
      temperature: 0.9, // Controls randomness (0=deterministic, 1=max creative)
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048, // Adjust as needed
    };

    // Safety settings - adjust as needed for your use case
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    // Start a chat session with history
    const chat = model.startChat({
        history: currentHistory,
        generationConfig,
        safetySettings,
    });

    const result = await chat.sendMessage(message);
    const response = result.response;
    const aiReply = response.text();

    // Update history
    currentHistory.push({ role: "user", parts: [{ text: message }] });
    currentHistory.push({ role: "model", parts: [{ text: aiReply }] });
    // Optional: Limit history size to prevent memory issues
    const MAX_HISTORY = 20; // Keep last 20 turns (user + model)
     if (currentHistory.length > MAX_HISTORY) {
        chatHistories[sessionId] = currentHistory.slice(-MAX_HISTORY);
    }


    console.log(`Session ${sessionId}: User: ${message}`);
    console.log(`Session ${sessionId}: AI: ${aiReply}`);

    res.json({ reply: aiReply });

  } catch (error) {
    console.error('AI Error:', error.message);
    // Check for safety blocks specifically
    if (error.message.includes('SAFETY')) {
         res.status(400).json({ error: 'Response blocked due to safety concerns. Please rephrase your message.' });
    } else {
        res.status(500).json({ error: 'Failed to get response from AI service.' });
    }
  }
});

// --- Server Start ---
app.listen(port, () => {
  console.log(`Chatbot backend server listening on http://localhost:${port}`);
});
