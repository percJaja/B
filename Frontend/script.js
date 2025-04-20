document.addEventListener('DOMContentLoaded', () => {
    const messageArea = document.getElementById('message-area');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const typingIndicator = document.getElementById('typing-indicator');
    const statusIndicator = document.getElementById('status-indicator');
    const initialSystemMessage = document.querySelector('.message.system'); // Get initial message

    // --- Configuration ---
    const BACKEND_URL = 'http://localhost:3000/chat'; // Default backend server URL
    const SESSION_ID = `web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // Unique session ID for this browser tab
    const PASTE_CHUNK_DELAY_MS = 1; // Delay for potential chunked pasting (usually not needed)
    const MAX_INPUT_HEIGHT_PX = 150; // Corresponds to max-height in CSS

    let isSending = false; // Flag to prevent multiple submissions
    let isConnected = false; // Track backend connection status

    // --- Helper Functions ---

    const scrollToBottom = (force = false) => {
        // Only auto-scroll if user is near the bottom, unless forced
        const isScrolledToBottom = messageArea.scrollHeight - messageArea.clientHeight <= messageArea.scrollTop + 100; // 100px buffer
        if (force || isScrolledToBottom) {
            // Use setTimeout to ensure scroll happens after DOM update/render
            setTimeout(() => {
                messageArea.scrollTop = messageArea.scrollHeight;
            }, 0);
        }
    };

    const addMessage = (text, sender, type = '') => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        if (type) {
            messageElement.classList.add(type);
        }

        // Basic sanitization: Use textContent to prevent HTML injection
        // For more complex needs (like rendering markdown), use a sanitizer library (e.g., DOMPurify)
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        messageElement.appendChild(paragraph);

        // Add a small delay before appending for the animation to be perceived correctly
        // if the message area was previously empty.
        setTimeout(() => {
            messageArea.appendChild(messageElement);
             // Force scroll when adding *any* message to ensure it's seen
             scrollToBottom(true);
        }, 50);


        return messageElement;
    };

    const setStatus = (connected) => {
        isConnected = connected;
        if (connected) {
            statusIndicator.classList.add('connected');
            statusIndicator.title = 'Connection Status: Connected';
            userInput.disabled = false;
            sendButton.disabled = false;
             if (initialSystemMessage && initialSystemMessage.textContent.includes('Waiting')) {
                 initialSystemMessage.querySelector('p').textContent = 'Connected! Ask me anything.';
            }
            userInput.placeholder = "Type your message...";
        } else {
            statusIndicator.classList.remove('connected');
            statusIndicator.title = 'Connection Status: Disconnected - Check Backend Server';
            userInput.disabled = true;
            sendButton.disabled = true;
            // Don't add duplicate errors if already disconnected
            if (!document.querySelector('.message.error.connection-error')) {
                 addMessage('Connection lost. Please ensure the backend server is running and refresh the page.', 'system', 'error connection-error');
            }
             userInput.placeholder = "Cannot connect to backend...";
        }
    };

     const adjustTextareaHeight = () => {
         // Temporarily remove height limit to measure natural scroll height
         // userInput.style.maxHeight = 'none';
         userInput.style.height = 'auto'; // Contract height first
         const scrollHeight = userInput.scrollHeight;

        // Apply the calculated height, capped by the max height
         userInput.style.height = `${Math.min(scrollHeight, MAX_INPUT_HEIGHT_PX)}px`;
         // userInput.style.maxHeight = `${MAX_INPUT_HEIGHT_PX}px`; // Re-apply max height if needed
     };


    const showTypingIndicator = (show) => {
        if (show) {
            typingIndicator.classList.add('visible');
            scrollToBottom(true); // Scroll down to make sure indicator is visible
        } else {
            typingIndicator.classList.remove('visible');
        }
    };

    // --- Main Send Logic ---

    const sendMessage = async () => {
        const messageText = userInput.value.trim();
        // Also check connection status
        if (!messageText || isSending || !isConnected) {
            if (!isConnected) console.warn("Attempted to send message while disconnected.");
            return;
        }

        isSending = true;
        sendButton.disabled = true; // Disable send button
        userInput.disabled = true; // Disable input field temporarily
        addMessage(messageText, 'user');
        userInput.value = ''; // Clear input immediately
        adjustTextareaHeight(); // Reset height after clearing
        showTypingIndicator(true);

        try {
            console.log(`Sending to backend: ${JSON.stringify({ message: messageText, sessionId: SESSION_ID })}`);
            const response = await fetch(BACKEND_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: messageText, sessionId: SESSION_ID }),
                mode: 'cors', // Explicitly set CORS mode
            });

             showTypingIndicator(false); // Hide indicator once response starts coming

            if (!response.ok) {
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    // Try to parse backend error message if available
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg; // Use backend error if present
                } catch (e) {
                    // Ignore JSON parsing error, use HTTP status message
                    console.warn ("Could not parse error response body.");
                }
                 throw new Error(errorMsg);
            }

            const data = await response.json();
            addMessage(data.reply, 'ai');
            if (!isConnected) setStatus(true); // Mark as connected if this is the first success

        } catch (error) {
             showTypingIndicator(false);
             console.error('Send Message Error:', error);
             addMessage(`Error: ${error.message || 'Could not reach the AI service.'}`, 'system', 'error');
             // If the error is network-related, update status
             if (error instanceof TypeError || error.message.includes('Failed to fetch')) {
                setStatus(false);
             }
        } finally {
             // Re-enable input ONLY if connected, regardless of success/failure of this specific message
            isSending = false;
            if (isConnected) {
                userInput.disabled = false;
                sendButton.disabled = false;
                 userInput.focus(); // Put focus back on input
            }
           adjustTextareaHeight(); // Adjust in case of error or quick response
        }
    };

    // --- Paste Anti-Freeze Logic ---

    const handlePaste = (event) => {
        // Allow default paste if input is disabled
         if (userInput.disabled) return;

        event.preventDefault(); // Stop the browser's default paste behavior
        const pastedText = event.clipboardData?.getData('text/plain'); // Use text/plain preferred

        if (!pastedText) return;

        const insertPastedText = () => {
            const currentVal = userInput.value;
            const start = userInput.selectionStart;
            const end = userInput.selectionEnd;

            // Insert text respecting cursor position/selection
            userInput.value = currentVal.slice(0, start) + pastedText + currentVal.slice(end);

            // Move cursor to the end of the pasted text
            userInput.selectionStart = userInput.selectionEnd = start + pastedText.length;

            // Trigger input event listeners (like auto-resize) and scroll if needed
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
            userInput.scrollTop = userInput.scrollHeight; // Scroll textarea if needed
            console.log(`Pasted ${pastedText.length} characters.`);
        };

        // Use requestAnimationFrame: yields to browser rendering, preventing freeze for large pastes.
        requestAnimationFrame(insertPastedText);
    };

    // --- Event Listeners ---

    sendButton.addEventListener('click', sendMessage);

    userInput.addEventListener('keydown', (event) => {
        // Send on Enter (unless Shift is pressed for newline)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevent default newline in textarea
            sendMessage();
        }
        // Optional: Trigger height adjustment on keydown for faster response than 'input'
        // setTimeout(adjustTextareaHeight, 0);
    });

    // Handle textarea auto-resizing on input event
    userInput.addEventListener('input', adjustTextareaHeight);

    // Handle pasting large text without freezing
    userInput.addEventListener('paste', handlePaste);


    // --- Initial Backend Connectivity Check ---
    const checkBackendStatus = async () => {
        try {
            // Simple check: just try sending an empty message (backend should handle it gracefully)
            // Or ideally, backend has a '/status' endpoint (GET request)
            const response = await fetch(BACKEND_URL, {
                 method: 'POST', // Using POST as per our '/chat' endpoint setup
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ message: 'ping', sessionId: `status_check_${Date.now()}` }), // Send a dummy message
                 mode: 'cors',
                 signal: AbortSignal.timeout(5000) // Timeout after 5 seconds
             });

            // We only care if the server responds, even if with a 400 Bad Request for the dummy message
            if (response.ok || response.status === 400) {
                console.log("Backend connection successful.");
                setStatus(true);
            } else {
                 throw new Error(`Backend check failed with status: ${response.status}`);
            }
        } catch (error) {
            console.error("Initial backend connection check failed:", error.message);
            setStatus(false);
        }
    };


    // --- Initial Setup ---
    console.log("Chatbot UI Initializing. Session ID:", SESSION_ID);
    adjustTextareaHeight(); // Initial height adjustment
    checkBackendStatus(); // Check connection on load
    // Don't focus input until connection is confirmed
    // userInput.focus();
});
