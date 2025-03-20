// Main app functionality
document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const micButton = document.getElementById('mic-button');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    // Debug mode
    let debugMode = false;
    
    // Speech recognition setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        
        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            userInput.value = speechResult;
            micButton.classList.remove('voice-active');
            sendMessage();
        };
        
        recognition.onend = () => {
            micButton.classList.remove('voice-active');
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            logDebug(`Speech recognition error: ${event.error}`, 'error');
            micButton.classList.remove('voice-active');
        };
    }
    
    // Speech synthesis setup
    const synth = window.speechSynthesis;
    let isReading = false;
    let currentUtterance = null;
    
    // Initialize conversation memory
    let conversationHistory = loadConversationHistory();
    
    // Display existing conversation
    displayConversationHistory();
    
    // Add debug tools
    addDebugTools();
    
    // Event Listeners
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    if (recognition) {
        micButton.addEventListener('click', toggleSpeechRecognition);
    } else {
        micButton.style.display = 'none';
    }
    
    // Functions
    function sendMessage() {
        const message = userInput.value.trim();
        if (message === '') return;
        
        // Add user message to UI
        addMessageToChat('user', message);
        
        // Add to conversation history
        conversationHistory.push({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });
        
        // Clear input
        userInput.value = '';
        
        // Show loading indicator
        loadingIndicator.style.display = 'block';
        
        // Generate AI response
        setTimeout(() => {
            generateResponse(message);
        }, 500);
    }
    
    function generateResponse(userMessage) {
        // Handle debug commands
        if (userMessage.toLowerCase() === '/debug') {
            debugMode = !debugMode;
            const response = debugMode ? 'Debug mode enabled. Check the debug panel at the bottom right corner.' : 'Debug mode disabled.';
            
            // Update UI if debug toggle exists
            const debugToggle = document.querySelector('button[data-debug-toggle]');
            if (debugToggle) {
                debugToggle.textContent = debugMode ? '🐞 Debug: ON' : '🐞 Debug: OFF';
                debugToggle.style.backgroundColor = debugMode ? '#ffcccc' : '#e0e0e0';
            }
            
            // Create or toggle debug panel
            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel) {
                debugPanel.style.display = debugMode ? 'block' : 'none';
            } else if (debugMode) {
                createDebugPanel();
            }
            
            // Hide loading indicator
            loadingIndicator.style.display = 'none';
            
            // Add response to chat
            addMessageToChat('assistant', response);
            
            // Add to conversation history
            conversationHistory.push({
                role: 'assistant',
                content: response,
                timestamp: new Date().toISOString()
            });
            
            // Save conversation
            saveConversationHistory();
            return;
        }
        
        // Simple rule-based responses
        let response;
        const lowerCaseMessage = userMessage.toLowerCase();
        
        // Check for common questions/statements
        if (lowerCaseMessage.includes('hello') || lowerCaseMessage.includes('hi ') || lowerCaseMessage === 'hi') {
            response = "Hello! How can I help you today?";
        } else if (lowerCaseMessage.includes('your name')) {
            response = "I'm your AI Assistant. You can give me a name if you'd like!";
        } else if (lowerCaseMessage.includes('weather')) {
            response = "I don't have real-time weather data, but I'd be happy to help with other questions!";
        } else if (lowerCaseMessage.includes('thank')) {
            response = "You're welcome! Is there anything else I can help with?";
        } else if (lowerCaseMessage.includes('bye') || lowerCaseMessage.includes('goodbye')) {
            response = "Goodbye! Feel free to chat again anytime.";
        } else if (lowerCaseMessage.includes('help')) {
            response = "I can chat with you, remember our conversations, and respond to voice commands. You can enable debug mode by typing '/debug' to help troubleshoot connectivity issues.";
        } else if (lowerCaseMessage.includes('time')) {
            const now = new Date();
            response = `The current time is ${now.toLocaleTimeString()}.`;
        } else if (lowerCaseMessage.includes('date')) {
            const now = new Date();
            response = `Today is ${now.toLocaleDateString()}.`;
        } else if (lowerCaseMessage.includes('joke')) {
            const jokes = [
                "Why don't scientists trust atoms? Because they make up everything!",
                "Why did the scarecrow win an award? Because he was outstanding in his field!",
                "What's the best thing about Switzerland? I don't know, but the flag is a big plus!",
                "I told my wife she was drawing her eyebrows too high. She looked surprised.",
                "Why don't skeletons fight each other? They don't have the guts!"
            ];
            response = jokes[Math.floor(Math.random() * jokes.length)];
        } else {
            logDebug(`Checking for previous question context for: "${lowerCaseMessage}"`, 'info');
            // Check conversation history for context
            if (checkForPreviousQuestion(userMessage)) {
                response = checkForPreviousQuestion(userMessage);
                logDebug(`Found contextual response: "${response.substring(0, 50)}..."`, 'success');
            } else {
                logDebug('No contextual response found, using default', 'info');
                response = "I'm a simple AI assistant built as a PWA. In a real implementation, I would connect to an AI API like OpenAI or Anthropic to generate more intelligent responses. How else can I help you?";
            }
        }
        
        logDebug(`Generated response: "${response.substring(0, 50)}..."`, 'success');
        
        // Hide loading indicator
        loadingIndicator.style.display = 'none';
        
        // Add AI response to UI
        addMessageToChat('assistant', response);
        
        // Add to conversation history
        conversationHistory.push({
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        });
        
        // Save conversation
        saveConversationHistory();
        
        // Read response aloud if enabled
        speakText(response);
    }
    
    function checkForPreviousQuestion(userMessage) {
        // Simple context awareness based on previous exchanges
        const lowerCaseMessage = userMessage.toLowerCase();
        
        // Look for follow-up responses
        if (lowerCaseMessage === 'yes' || lowerCaseMessage === 'no' || lowerCaseMessage === 'maybe') {
            // Find the last question asked by the assistant
            for (let i = conversationHistory.length - 1; i >= 0; i--) {
                const entry = conversationHistory[i];
                if (entry.role === 'assistant' && entry.content.endsWith('?')) {
                    if (lowerCaseMessage === 'yes') {
                        return "Thanks for confirming! Is there anything specific you'd like to know about that?";
                    } else if (lowerCaseMessage === 'no') {
                        return "I understand. Is there something else you'd like to talk about?";
                    } else {
                        return "I see you're not entirely sure. Would you like me to explain more?";
                    }
                }
            }
        }
        
        // Check for references to previous topics
        const recentTopics = extractRecentTopics();
        for (const topic of recentTopics) {
            if (lowerCaseMessage.includes(topic)) {
                return `I see you're interested in ${topic}. In a full implementation, I would retrieve our previous conversation about this topic and provide a contextual response.`;
            }
        }
        
        return null;
    }
    
    function extractRecentTopics() {
        // Extract possible topics from recent conversation
        const topics = new Set();
        const stopwords = ['i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 
                          'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 
                          'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 
                          'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 
                          'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 
                          'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 
                          'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 
                          'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 
                          'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 
                          'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 
                          'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 
                          'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now'];
        
        // Look at the last 5 exchanges
        const recentMessages = conversationHistory.slice(-10);
        
        for (const message of recentMessages) {
            // Split content into words
            const words = message.content.toLowerCase().split(/\W+/);
            
            // Filter out stopwords and short words
            for (const word of words) {
                if (!stopwords.includes(word) && word.length > 3) {
                    topics.add(word);
                }
            }
        }
        
        return Array.from(topics);
    }
    
    function addMessageToChat(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        
        messageElement.textContent = message;
        
        // Add timestamp
        const timestamp = document.createElement('div');
        timestamp.classList.add('timestamp');
        timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageElement.appendChild(timestamp);
        
        chatContainer.appendChild(messageElement);
        
        // Add speak button for assistant messages
        if (sender === 'assistant' && synth) {
            const controls = document.createElement('div');
            controls.classList.add('controls');
            
            const speakButton = document.createElement('button');
            speakButton.textContent = '🔊 Speak';
            speakButton.addEventListener('click', () => {
                speakText(message);
            });
            
            controls.appendChild(speakButton);
            messageElement.appendChild(controls);
        }
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function displayConversationHistory() {
        // Clear chat container except for instructions
        const instructions = document.getElementById('app-instructions');
        chatContainer.innerHTML = '';
        if (instructions) {
            chatContainer.appendChild(instructions);
        }
        
        // Display up to the last 20 messages to avoid overwhelming the UI
        const messagesToShow = conversationHistory.slice(-20);
        
        for (const message of messagesToShow) {
            addMessageToChat(message.role, message.content);
        }
    }
    
    function toggleSpeechRecognition() {
        if (micButton.classList.contains('voice-active')) {
            recognition.stop();
            micButton.classList.remove('voice-active');
        } else {
            recognition.start();
            micButton.classList.add('voice-active');
        }
    }
    
    function speakText(text) {
        if (!synth) return;
        
        // Stop any ongoing speech
        if (isReading) {
            synth.cancel();
        }
        
        // Create a new utterance
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Set properties
        utterance.volume = 1;
        utterance.rate = 1;
        utterance.pitch = 1;
        
        // Set callbacks
        utterance.onstart = () => {
            isReading = true;
            currentUtterance = utterance;
        };
        
        utterance.onend = () => {
            isReading = false;
            currentUtterance = null;
        };
        
        // Speak
        synth.speak(utterance);
    }
    
    function saveConversationHistory() {
        try {
            localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
        } catch (error) {
            console.error('Error saving conversation history:', error);
            logDebug(`Error saving conversation history: ${error.message}`, 'error');
            
            // If storage limit exceeded, remove oldest conversations
            if (error.name === 'QuotaExceededError') {
                conversationHistory = conversationHistory.slice(-50); // Keep only the most recent 50 messages
                localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
            }
        }
    }
    
    function loadConversationHistory() {
        try {
            const savedHistory = localStorage.getItem('conversationHistory');
            return savedHistory ? JSON.parse(savedHistory) : [];
        } catch (error) {
            console.error('Error loading conversation history:', error);
            logDebug(`Error loading conversation history: ${error.message}`, 'error');
            return [];
        }
    }
    
    // Debug related functions
    function addDebugTools() {
        // Create debug toggle in header
        const header = document.querySelector('header');
        
        const debugContainer = document.createElement('div');
        debugContainer.style.marginTop = '5px';
        debugContainer.style.fontSize = '0.8rem';
        
        const debugToggle = document.createElement('button');
        debugToggle.textContent = '🐞 Debug: OFF';
        debugToggle.setAttribute('data-debug-toggle', 'true');
        debugToggle.style.padding = '3px 8px';
        debugToggle.style.backgroundColor = '#e0e0e0';
        debugToggle.style.border = 'none';
        debugToggle.style.borderRadius = '3px';
        debugToggle.style.cursor = 'pointer';
        debugToggle.style.fontSize = '0.8rem';
        
        debugToggle.addEventListener('click', () => {
            debugMode = !debugMode;
            debugToggle.textContent = debugMode ? '🐞 Debug: ON' : '🐞 Debug: OFF';
            debugToggle.style.backgroundColor = debugMode ? '#ffcccc' : '#e0e0e0';
            
            const debugPanel = document.getElementById('debug-panel');
            if (debugPanel) {
                debugPanel.style.display = debugMode ? 'block' : 'none';
            } else if (debugMode) {
                createDebugPanel();
            }
        });
        
        debugContainer.appendChild(debugToggle);
        header.appendChild(debugContainer);
    }
    
    function createDebugPanel() {
        // Create debug panel
        const debugPanel = document.createElement('div');
        debugPanel.id = 'debug-panel';
        debugPanel.style.position = 'fixed';
        debugPanel.style.bottom = '70px';
        debugPanel.style.right = '10px';
        debugPanel.style.width = '300px';
        debugPanel.style.height = '200px';
        debugPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        debugPanel.style.color = '#00ff00';
        debugPanel.style.padding = '10px';
        debugPanel.style.borderRadius = '5px';
        debugPanel.style.fontFamily = 'monospace';
        debugPanel.style.fontSize = '10px';
        debugPanel.style.overflow = 'auto';
        debugPanel.style.zIndex = '1000';
        
        // Add header and clear button
        const debugHeader = document.createElement('div');
        debugHeader.style.display = 'flex';
        debugHeader.style.justifyContent = 'space-between';
        debugHeader.style.marginBottom = '5px';
        
        const debugTitle = document.createElement('span');
        debugTitle.textContent = 'Debug Console';
        debugTitle.style.fontWeight = 'bold';
        
        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear';
        clearButton.style.padding = '1px 5px';
        clearButton.style.backgroundColor = '#333';
        clearButton.style.color = 'white';
        clearButton.style.border = 'none';
        clearButton.style.borderRadius = '3px';
        clearButton.style.cursor = 'pointer';
        clearButton.style.fontSize = '8px';
        
        clearButton.addEventListener('click', () => {
            const logContainer = document.getElementById('debug-log');
            if (logContainer) {
                logContainer.innerHTML = '';
            }
        });
        
        debugHeader.appendChild(debugTitle);
        debugHeader.appendChild(clearButton);
        debugPanel.appendChild(debugHeader);
        
        // Add log container
        const logContainer = document.createElement('div');
        logContainer.id = 'debug-log';
        debugPanel.appendChild(logContainer);
        
        document.body.appendChild(debugPanel);
        
        // Add initial debug info
        logDebug('Debug mode initialized', 'info');
        logDebug(`Conversation history: ${conversationHistory.length} messages`, 'info');
        logDebug('To disable debug mode, type "/debug" or click the debug button', 'info');
    }
    
    function logDebug(message, type = 'info') {
        // Always log to console
        console.log(`[DEBUG] ${message}`);
        
        if (!debugMode) return;
        
        const logContainer = document.getElementById('debug-log');
        if (!logContainer) return;
        
        const logEntry = document.createElement('div');
        logEntry.style.marginBottom = '2px';
        logEntry.style.borderBottom = '1px solid #333';
        logEntry.style.paddingBottom = '2px';
        
        // Set color based on type
        switch(type) {
            case 'error':
                logEntry.style.color = '#ff6666';
                break;
            case 'warn':
                logEntry.style.color = '#ffcc00';
                break;
            case 'success':
                logEntry.style.color = '#66ff66';
                break;
            case 'api':
                logEntry.style.color = '#66ccff';
                break;
            default:
                logEntry.style.color = '#cccccc';
        }
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        logEntry.innerHTML = `<span style="color:#888">[${timestamp}]</span> ${message}`;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    // Add a welcome message if it's the first time
    if (conversationHistory.length === 0) {
        const welcomeMessage = "Hello! I'm your AI assistant. I can chat with you, remember our conversations, and respond to voice commands. How can I help you today?";
        
        addMessageToChat('assistant', welcomeMessage);
        
        conversationHistory.push({
            role: 'assistant',
            content: welcomeMessage,
            timestamp: new Date().toISOString()
        });
        
        saveConversationHistory();
    }
});