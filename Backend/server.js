import express from 'express';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000; // Use environment port or default to 3000

// --- Configuration ---
const MODEL_NAME = "gemini-1.5-pro-latest"; // Or "gemini-1.5-flash-latest", etc. Check available models.
const API_KEY = process.env.GEMINI_API_KEY; // Loaded from .env

if (!API_KEY) {
  console.error("FATAL ERROR: GEMINI_API_KEY is not set in the .env file.");
  console.error("Please create a .env file in the 'backend' directory with your API key:");
  console.error("Example .env content:");
  console.error("GEMINI_API_KEY=AIzaSy...YourActualKey...");
  process.exit(1); // Exit if API key is missing
}

// --- Middleware ---
// Configure CORS more restrictively in production if needed
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
      console.warn(`Received invalid request: Missing message or sessionId. Session: ${sessionId}, Message: ${message}`);
      return res.status(400).json({ error: 'Bad Request: Message and sessionId are required.' });
    }

    // Initialize history for new session
    if (!chatHistories[sessionId]) {
        console.log(`Initializing new chat history for session: ${sessionId}`);
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

    console.log(`[${sessionId}] Processing message: "${message}" with history length: ${currentHistory.length}`);

    // Start a chat session with history
    const chat = model.startChat({
        history: currentHistory,
        generationConfig,
        safetySettings,
    });

    const result = await chat.sendMessage(message);
    const response = result.response;

    // Check for blocked responses BEFORE trying to access text()
    if (response.promptFeedback?.blockReason) {
        console.warn(`[${sessionId}] AI response blocked. Reason: ${response.promptFeedback.blockReason}`);
        // Optionally check response.candidates[0].finishReason === 'SAFETY' too
        return res.status(400).json({ error: 'Response blocked due to safety concerns. Please try rephrasing your message.' });
    }

    const aiReply = response.text(); // Now safe to call text()

    // Update history
    currentHistory.push({ role: "user", parts: [{ text: message }] });
    currentHistory.push({ role: "model", parts: [{ text: aiReply }] });

    // Optional: Limit history size to prevent excessive memory use
    const MAX_HISTORY_TURNS = 10; // Keep last 10 turns (1 turn = 1 user + 1 model message = 2 entries)
    const MAX_HISTORY_ENTRIES = MAX_HISTORY_TURNS * 2;
     if (currentHistory.length > MAX_HISTORY_ENTRIES) {
        console.log(`[${sessionId}] Trimming history from ${currentHistory.length} to ${MAX_HISTORY_ENTRIES} entries.`);
        chatHistories[sessionId] = currentHistory.slice(-MAX_HISTORY_ENTRIES);
    }

    console.log(`[${sessionId}] AI Replied: "${aiReply.substring(0, 100)}..."`); // Log snippet

    res.json({ reply: aiReply });

  } catch (error) {
    console.error(`[${sessionId || 'Unknown Session'}] AI Chat Error:`, error);
    // Distinguish API/network errors from safety blocks handled earlier
    if (error.message && error.message.includes('SAFETY')) {
         // This case might be less likely now with the check above, but keep as fallback
         res.status(400).json({ error: 'Response blocked due to safety concerns after generation.' });
    } else if (error.message && error.message.includes('RESOURCE_EXHAUSTED')) {
         console.warn(`[${sessionId}] API Quota possibly exceeded.`);
         res.status(429).json({ error: 'API rate limit or quota exceeded. Please try again later.' });
    }
     else {
        // General server or API communication error
        res.status(500).json({ error: 'Internal Server Error: Failed to get response from AI service.' });
    }
  }
});

// --- Simple Root Endpoint (Optional: for testing if server is up) ---
app.get('/', (req, res) => {
    res.send('Advanced Chatbot Backend is running.');
});

// --- Server Start ---
app.listen(port, () => {
  console.log(`Chatbot backend server listening on http://localhost:${port}`);
  console.log('Ensure the frontend is configured to connect to this URL.');
  console.log('Press Ctrl+C to stop the server.');
});
