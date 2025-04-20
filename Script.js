document.addEventListener('DOMContentLoaded', () => {
    const messageArea = document.getElementById('message-area');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const typingIndicator = document.getElementById('typing-indicator');
    const statusIndicator = document.getElementById('status-indicator');

    // --- Configuration ---
    const BACKEND_URL = 'http://localhost:3000/chat'; // Your backend server URL
    const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // Basic unique session ID
    const PASTE_CHUNK_DELAY_MS = 1; // Milliseconds delay for paste handling (0 or 1 is often enough)
    const MAX_INPUT_HEIGHT = 150; // Corresponds to max-height in CSS

    let isSending = false; // Flag to prevent multiple submissions

    // --- Helper Functions ---

    const scrollToBottom = () => {
        // Use setTimeout to ensure scroll happens after DOM update
        setTimeout(() => {
            messageArea.scrollTop = messageArea.scrollHeight;
        }, 0);
    };

    const addMessage = (text, sender, type = '') => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        if (type) {
            messageElement.classList.add(type);
        }

        // Sanitize text before adding (basic example, consider a library for robust sanitization)
        const paragraph = document.createElement('p');
        paragraph.textContent = text; // Using textContent prevents basic XSS
        messageElement.appendChild(paragraph);

        messageArea.appendChild(messageElement);
        scrollToBottom();
        return messageElement; // Return for potential modification (e.g., streaming)
    };

    const setStatus = (connected) => {
        if (connected) {
            statusIndicator.classList.add('connected');
            statusIndicator.title = 'Connected to AI Backend';
        } else {
            statusIndicator.classList.remove('connected');
            statusIndicator.title = 'Disconnected - Check Backend Server';
             addMessage('Connection lost. Please ensure the backend server is running and refresh.', 'system', 'error');
        }
    };

     const adjustTextareaHeight = () => {
        userInput.style.height = 'auto'; // Temporarily shrink to calculate scrollHeight
        const scrollHeight = userInput.scrollHeight;
        // Set height based on content, but not exceeding max height
        userInput.style.height = `${Math.min(scrollHeight, MAX_INPUT_HEIGHT)}px`;
     };


    const showTypingIndicator = (show) => {
        if (show) {
            typingIndicator.classList.add('visible');
            scrollToBottom(); // Scroll down to make sure indicator is visible
        } else {
            typingIndicator.classList.remove('visible');
        }
    };

    // --- Main Send Logic ---

    const sendMessage = async () => {
        const messageText = userInput.value.trim();
        if (!messageText || isSending) {
            return; // Don't send empty messages or while already sending
        }

        isSending = true;
        sendButton.disabled = true;
        userInput.disabled = true;
        addMessage(messageText, 'user');
        userInput.value = ''; // Clear input immediately
        adjustTextareaHeight(); // Reset height after clearing
        showTypingIndicator(true);

        try {
            const response = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: messageText, sessionId: SESSION_ID }),
            });

             showTypingIndicator(false); // Hide indicator once response starts coming

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown server error' })); // Catch JSON parsing errors
                 throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            addMessage(data.reply, 'ai');
            if (!statusIndicator.classList.contains('connected')) {
                setStatus(true); // Mark as connected on first successful response
            }

        } catch (error) {
             showTypingIndicator(false);
             console.error('Send Message Error:', error);
             addMessage(`Error: ${error.message || 'Could not reach the AI service.'}`, 'system', 'error');
             setStatus(false); // Indicate connection issue
        } finally {
             // Re-enable input regardless of success or failure
            isSending = false;
            sendButton.disabled = false;
            userInput.disabled = false;
            userInput.focus(); // Put focus back on input
            adjustTextareaHeight(); // Adjust in case of error or quick response
        }
    };

    // --- Paste Anti-Freeze Logic ---

    const handlePaste = (event) => {
        event.preventDefault(); // Stop the browser's default paste behavior
        const pastedText = event.clipboardData.getData('text');

        if (!pastedText) return;

        // Algorithm: Insert the text using requestAnimationFrame.
        // This yields to the browser's rendering engine between potentially
        // heavy insertion operations if the text is truly massive, preventing freezing.
        // For most practical pastes, a simple direct insertion is fine, but this adds robustness.
        const insertPastedText = () => {
            const currentVal = userInput.value;
            const start = userInput.selectionStart;
            const end = userInput.selectionEnd;
            userInput.value = currentVal.slice(0, start) + pastedText + currentVal.slice(end);

            // Move cursor to the end of the pasted text
            userInput.selectionStart = userInput.selectionEnd = start + pastedText.length;

            // Trigger input event listeners (like auto-resize)
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
            console.log(`Pasted ${pastedText.length} characters.`);
        };

        // Schedule the insertion in the next animation frame
        requestAnimationFrame(insertPastedText);

        // --- Alternative (Chunking - More Complex, Usually Overkill for Pasting) ---
        // If requestAnimationFrame isn't enough for extreme cases (millions of chars),
        // you could chunk the insertion with setTimeout:
        /*
        const chunkSize = 10000; // Process 10k chars at a time
        let currentPos = 0;
        const insertChunk = () => {
            if (currentPos < pastedText.length) {
                const chunk = pastedText.substring(currentPos, currentPos + chunkSize);
                 const currentVal = userInput.value;
                 const start = userInput.selectionStart;
                 const end = userInput.selectionEnd;
                 userInput.value = currentVal.slice(0, start) + chunk + currentVal.slice(end);
                 userInput.selectionStart = userInput.selectionEnd = start + chunk.length;

                currentPos += chunkSize;
                setTimeout(insertChunk, PASTE_CHUNK_DELAY_MS); // Small delay between chunks
            } else {
                 userInput.dispatchEvent(new Event('input', { bubbles: true }));
                 console.log(`Pasted ${pastedText.length} characters (chunked).`);
            }
        };
        insertChunk();
        */
    };

    // --- Event Listeners ---

    sendButton.addEventListener('click', sendMessage);

    userInput.addEventListener('keydown', (event) => {
        // Send on Enter (unless Shift is pressed)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevent newline in textarea
            sendMessage();
        }
    });

    // Handle textarea auto-resizing
    userInput.addEventListener('input', adjustTextareaHeight);

    // Handle pasting large text
    userInput.addEventListener('paste', handlePaste);


    // --- Initial Setup ---
    adjustTextareaHeight(); // Initial height adjustment
    userInput.focus(); // Focus input on load

    // Add an initial connectivity check or assume disconnected until first message works
    setStatus(false); // Start as disconnected
    // Optional: You could ping the backend here to check status on load

    console.log("Chatbot UI Initialized. Session ID:", SESSION_ID);
     addMessage(`Chat Session ID: ${SESSION_ID}. Keep this if you need to reference the conversation.`, 'system');

});
