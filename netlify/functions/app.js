// Main app functionality
document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const micButton = document.getElementById('mic-button');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    // Configuration for API providers
    const apiConfig = {
        currentProvider: 'anthropic', // Default provider
        providers: {
            anthropic: {
                name: 'Anthropic',
                // Using Netlify Function instead of direct API call
                apiEndpoint: '/.netlify/functions/anthropic',
                model: 'claude-3-opus-20240229',
                maxTokens: 1024
            },
            brave: {
                name: 'Brave Search',
                // Using Netlify Function instead of direct API call
                apiEndpoint: '/.netlify/functions/brave',
                searchCount: 5
            },
            deepseek: {
                name: 'DeepSeek',
                // Using Netlify Function instead of direct API call
                apiEndpoint: '/.netlify/functions/deepseek',
                model: 'deepseek-chat',
                maxTokens: 1024
            }
        },
        // API keys (these will be stored in a more secure way in production)
        apiKeys: {
            anthropic: '',
            brave: '',
            deepseek: ''
        }
    };
    
    // Check for saved API keys
    loadApiKeys();
    
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
    
    // Add settings button if not present
    addSettingsButtonIfNeeded();
    
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
        
        // Check if this is an API key setting command
        if (message.startsWith('/setkey')) {
            handleSetKeyCommand(message);
            return;
        }
        
        // Generate AI response
        generateResponse(message);
    }
    
    async function generateResponse(userMessage) {
        try {
            // Check for offline mode
            if (!navigator.onLine) {
                loadingIndicator.style.display = 'none';
                const offlineResponse = "You appear to be offline. I'm operating in limited mode with only basic functionality. Please check your internet connection.";
                addMessageToChat('assistant', offlineResponse);
                conversationHistory.push({
                    role: 'assistant',
                    content: offlineResponse,
                    timestamp: new Date().toISOString()
                });
                saveConversationHistory();
                
                // If offline, provide some basic responses to common queries
                const simpleResponses = getOfflineResponses(userMessage);
                if (simpleResponses) {
                    setTimeout(() => {
                        addMessageToChat('assistant', simpleResponses);
                        conversationHistory.push({
                            role: 'assistant',
                            content: simpleResponses,
                            timestamp: new Date().toISOString()
                        });
                        saveConversationHistory();
                    }, 1000);
                }
                return;
            }
            
            // Check if API keys are set
            if (!areApiKeysSet()) {
                loadingIndicator.style.display = 'none';
                const response = "Please set your API keys first using the settings menu (⚙️) or the /setkey command. For example: /setkey anthropic YOUR_API_KEY";
                addMessageToChat('assistant', response);
                conversationHistory.push({
                    role: 'assistant',
                    content: response,
                    timestamp: new Date().toISOString()
                });
                saveConversationHistory();
                return;
            }
            
            let response;
            const lowerCaseMessage = userMessage.toLowerCase();
            
            // Special commands
            if (lowerCaseMessage.startsWith('/help')) {
                response = `
                Available commands:
                /help - Show this help message
                /setkey [provider] [key] - Set API key for a provider
                /provider [name] - Switch to a different provider (anthropic, brave, or deepseek)
                /clear - Clear conversation history
                /debug - Show debug information about the current setup
                `;
            } else if (lowerCaseMessage.startsWith('/provider')) {
                const parts = userMessage.split(' ');
                if (parts.length > 1) {
                    const provider = parts[1].toLowerCase();
                    if (apiConfig.providers[provider]) {
                        apiConfig.currentProvider = provider;
                        localStorage.setItem('currentProvider', provider);
                        response = `Switched to ${apiConfig.providers[provider].name} as the active provider.`;
                        
                        // Update provider badge
                        const providerBadge = document.getElementById('provider-badge');
                        if (providerBadge) {
                            providerBadge.textContent = apiConfig.providers[provider].name;
                        }
                    } else {
                        response = `Provider not found. Available providers: ${Object.keys(apiConfig.providers).join(', ')}`;
                    }
                } else {
                    response = `Current provider: ${apiConfig.providers[apiConfig.currentProvider].name}. Available providers: ${Object.keys(apiConfig.providers).join(', ')}`;
                }
            } else if (lowerCaseMessage.startsWith('/clear')) {
                conversationHistory = [];
                saveConversationHistory();
                displayConversationHistory();
                response = "Conversation history cleared.";
            } else if (lowerCaseMessage.startsWith('/debug')) {
                // Show debug information about the current setup
                const debugInfo = {
                    currentProvider: apiConfig.currentProvider,
                    apiKeys: {
                        anthropic: apiConfig.apiKeys.anthropic ? 'Set' : 'Not set',
                        brave: apiConfig.apiKeys.brave ? 'Set' : 'Not set',
                        deepseek: apiConfig.apiKeys.deepseek ? 'Set' : 'Not set'
                    },
                    hosting: {
                        hostname: window.location.hostname,
                        protocol: window.location.protocol,
                        isNetlify: window.location.hostname.includes('netlify.app'),
                        netlifyFunctionsAvailable: true
                    },
                    browser: {
                        userAgent: navigator.userAgent,
                        language: navigator.language,
                        online: navigator.onLine
                    }
                };
                
                response = "Debug Information:\n```json\n" + JSON.stringify(debugInfo, null, 2) + "\n```";
            } else {
                // Make API request based on the current provider
                try {
                    if (apiConfig.currentProvider === 'anthropic') {
                        response = await makeAnthropicRequest(userMessage);
                    } else if (apiConfig.currentProvider === 'brave') {
                        response = await makeBraveSearchRequest(userMessage);
                    } else if (apiConfig.currentProvider === 'deepseek') {
                        response = await makeDeepseekRequest(userMessage);
                    } else {
                        response = "No valid provider selected.";
                    }
                } catch (apiError) {
                    console.error(`Error calling ${apiConfig.currentProvider} API:`, apiError);
                    response = `Error from ${apiConfig.providers[apiConfig.currentProvider].name} API: ${apiError.message}`;
                }
            }
            
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
            if (document.getElementById('tts-toggle') && document.getElementById('tts-toggle').checked) {
                speakText(response);
            }
            
        } catch (error) {
            console.error('Error generating response:', error);
            loadingIndicator.style.display = 'none';
            
            // Create a more detailed error message
            let errorMessage = `Sorry, there was an error: ${error.message}.`;
            
            // Add suggestions based on error type
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage += " This appears to be a network error. Please check your internet connection.";
            } else if (error.message.includes('API key')) {
                errorMessage += " Please check that you've entered the correct API key in the settings.";
            }
            
            addMessageToChat('assistant', errorMessage);
            
            conversationHistory.push({
                role: 'assistant',
                content: errorMessage,
                timestamp: new Date().toISOString()
            });
            
            saveConversationHistory();
        }
    }
    
    // Function to provide basic responses when offline
    function getOfflineResponses(message) {
        const lowerMessage = message.toLowerCase();
        
        // Simple pattern matching for offline mode
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi ') || lowerMessage === 'hi') {
            return "Hello! I'm currently in offline mode, but I can still help with basic responses.";
        } else if (lowerMessage.includes('help')) {
            return "I'm in offline mode with limited functionality. Once you're back online, you can use the full features of this AI assistant.";
        } else if (lowerMessage.includes('weather')) {
            return "I can't check the weather while offline. Please reconnect to the internet.";
        } else if (lowerMessage.includes('time')) {
            return `The current time is ${new Date().toLocaleTimeString()}.`;
        } else if (lowerMessage.includes('date')) {
            return `Today is ${new Date().toLocaleDateString()}.`;
        } else if (lowerMessage.includes('joke')) {
            const jokes = [
                "Why don't scientists trust atoms? Because they make up everything!",
                "Why did the scarecrow win an award? Because he was outstanding in his field!",
                "I told my wife she was drawing her eyebrows too high. She looked surprised."
            ];
            return jokes[Math.floor(Math.random() * jokes.length)];
        }
        
        return "I'm currently offline and can only provide limited responses. Please check your internet connection to use the full AI features.";
    }
    
    async function makeAnthropicRequest(userMessage) {
        const apiKey = apiConfig.apiKeys.anthropic;
        if (!apiKey) return "Anthropic API key not set. Use /setkey anthropic YOUR_API_KEY";
        
        // Prepare conversation history for Anthropic
        const messages = [];
        
        // Include up to 10 most recent messages for context
        const recentMessages = conversationHistory.slice(-10);
        for (const msg of recentMessages) {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        }
        
        // Add the current user message
        messages.push({
            role: 'user',
            content: userMessage
        });

        console.log("Preparing Anthropic API request to Netlify Function");
        
        // Send request to our Netlify Function instead of directly to Anthropic
        const response = await fetch(apiConfig.providers.anthropic.apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Proxy-API-Key': apiKey  // Send API key via header for the function to use
            },
            body: JSON.stringify({
                model: apiConfig.providers.anthropic.model,
                messages: messages,
                max_tokens: apiConfig.providers.anthropic.maxTokens
            })
        });
        
        if (!response.ok) {
            let errorMessage = "HTTP error " + response.status;
            try {
                const errorData = await response.json();
                errorMessage = `Anthropic API error: ${errorData.error?.message || response.statusText}`;
                console.error("API error details:", errorData);
            } catch (jsonError) {
                // If response isn't JSON
                const textError = await response.text();
                errorMessage = `Anthropic API error: ${textError || response.statusText}`;
                console.error("API error text:", textError);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log("Anthropic API response received successfully");
        return data.content[0].text;
    }
    
    async function makeBraveSearchRequest(query) {
        const apiKey = apiConfig.apiKeys.brave;
        if (!apiKey) return "Brave Search API key not set. Use /setkey brave YOUR_API_KEY";
        
        console.log("Preparing Brave Search API request to Netlify Function");
        
        // Use Netlify Function for Brave Search
        const response = await fetch(`${apiConfig.providers.brave.apiEndpoint}?q=${encodeURIComponent(query)}&count=${apiConfig.providers.brave.searchCount}`, {
            headers: {
                'Accept': 'application/json',
                'X-Proxy-API-Key': apiKey
            }
        });
        
        if (!response.ok) {
            let errorMessage = "HTTP error " + response.status;
            try {
                const errorData = await response.json();
                errorMessage = `Brave Search API error: ${errorData.error?.message || response.statusText}`;
                console.error("API error details:", errorData);
            } catch (jsonError) {
                // If response isn't JSON
                const textError = await response.text();
                errorMessage = `Brave Search API error: ${textError || response.statusText}`;
                console.error("API error text:", textError);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log("Brave Search API response received successfully");
        
        // Format search results
        let formattedResponse = `Here are search results for "${query}":\n\n`;
        
        if (data.web && data.web.results && data.web.results.length > 0) {
            data.web.results.forEach((result, index) => {
                formattedResponse += `${index + 1}. [${result.title}](${result.url})\n`;
                formattedResponse += `${result.description}\n\n`;
            });
        } else {
            formattedResponse += "No results found.";
        }
        
        return formattedResponse;
    }
    
    async function makeDeepseekRequest(userMessage) {
        const apiKey = apiConfig.apiKeys.deepseek;
        if (!apiKey) return "DeepSeek API key not set. Use /setkey deepseek YOUR_API_KEY";
        
        // Prepare conversation history for DeepSeek
        const messages = [];
        
        // Include up to 10 most recent messages for context
        const recentMessages = conversationHistory.slice(-10);
        for (const msg of recentMessages) {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        }
        
        // Add the current user message
        messages.push({
            role: 'user',
            content: userMessage
        });
        
        console.log("Preparing DeepSeek API request to Netlify Function");
        
        // Use Netlify Function for DeepSeek
        const response = await fetch(apiConfig.providers.deepseek.apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Proxy-API-Key': apiKey
            },
            body: JSON.stringify({
                model: apiConfig.providers.deepseek.model,
                messages: messages,
                max_tokens: apiConfig.providers.deepseek.maxTokens
            })
        });
        
        if (!response.ok) {
            let errorMessage = "HTTP error " + response.status;
            try {
                const errorData = await response.json();
                errorMessage = `DeepSeek API error: ${errorData.error?.message || response.statusText}`;
                console.error("API error details:", errorData);
            } catch (jsonError) {
                // If response isn't JSON
                const textError = await response.text();
                errorMessage = `DeepSeek API error: ${textError || response.statusText}`;
                console.error("API error text:", textError);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log("DeepSeek API response received successfully");
        return data.choices[0].message.content;
    }
    
    function handleSetKeyCommand(message) {
        // Format: /setkey provider apikey
        const parts = message.split(' ');
        if (parts.length < 3) {
            const response = "Invalid command format. Use /setkey [provider] [key]";
            loadingIndicator.style.display = 'none';
            addMessageToChat('assistant', response);
            conversationHistory.push({
                role: 'assistant',
                content: response,
                timestamp: new Date().toISOString()
            });
            saveConversationHistory();
            return;
        }
        
        const provider = parts[1].toLowerCase();
        const apiKey = parts.slice(2).join(' ');
        
        if (!apiConfig.providers[provider]) {
            const response = `Unknown provider: ${provider}. Available providers: ${Object.keys(apiConfig.providers).join(', ')}`;
            loadingIndicator.style.display = 'none';
            addMessageToChat('assistant', response);
            conversationHistory.push({
                role: 'assistant',
                content: response,
                timestamp: new Date().toISOString()
            });
            saveConversationHistory();
            return;
        }
        
        // Store API key
        apiConfig.apiKeys[provider] = apiKey;
        saveApiKeys();
        
        const response = `API key for ${apiConfig.providers[provider].name} has been set.`;
        loadingIndicator.style.display = 'none';
        addMessageToChat('assistant', response);
        
        // Add to conversation history, but replace the API key with [HIDDEN] for security
        conversationHistory.push({
            role: 'user',
            content: `/setkey ${provider} [HIDDEN]`,
            timestamp: new Date().toISOString()
        });
        
        conversationHistory.push({
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        });
        
        saveConversationHistory();
    }
    
    function areApiKeysSet() {
        return apiConfig.apiKeys[apiConfig.currentProvider] !== '';
    }
    
    function addSettingsButtonIfNeeded() {
        // Check if settings button already exists
        if (document.getElementById('settings-button')) return;
        
        // Add settings button to header
        const header = document.querySelector('header');
        const settingsButton = document.createElement('button');
        settingsButton.id = 'settings-button';
        settingsButton.innerHTML = '⚙️';
        settingsButton.style.position = 'absolute';
        settingsButton.style.right = '15px';
        settingsButton.style.top = '15px';
        settingsButton.style.background = 'transparent';
        settingsButton.style.border = 'none';
        settingsButton.style.fontSize = '1.5rem';
        settingsButton.style.cursor = 'pointer';
        settingsButton.style.color = 'white';
        settingsButton.onclick = showSettingsModal;
        
        header.style.position = 'relative';
        header.appendChild(settingsButton);
    }
    
    function showSettingsModal() {
        // This function is defined in the HTML file
        // It opens the settings modal that's built into the HTML
        if (typeof openSettings === 'function') {
            openSettings();
        } else {
            console.error('openSettings function not found');
            alert('Settings functionality not available. Please refresh the page.');
        }
    }
    
    function addMessageToChat(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        
        // Check if the message contains markdown links [text](url)
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let formattedMessage = message.replace(markdownLinkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // Convert line breaks to <br>
        formattedMessage = formattedMessage.replace(/\n/g, '<br>');
        
        messageElement.innerHTML = formattedMessage;
        
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
                // Remove HTML tags for speaking
                const plainText = message.replace(/<[^>]*>/g, '');
                speakText(plainText);
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
        
        // Display up to the last 50 messages to avoid overwhelming the UI
        const messagesToShow = conversationHistory.slice(-50);
        
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
        
        // Break long text into chunks (browser may have limits on utterance length)
        const textChunks = chunkText(text, 200); // Split into chunks of roughly 200 words
        
        for (let i = 0; i < textChunks.length; i++) {
            // Create a new utterance for each chunk
            const utterance = new SpeechSynthesisUtterance(textChunks[i]);
            
            // Set properties
            utterance.volume = 1;
            utterance.rate = 1;
            utterance.pitch = 1;
            
            // Set callbacks only for the first chunk
            if (i === 0) {
                utterance.onstart = () => {
                    isReading = true;
                    currentUtterance = utterance;
                };
            }
            
            // Set callback for the last chunk
            if (i === textChunks.length - 1) {
                utterance.onend = () => {
                    isReading = false;
                    currentUtterance = null;
                };
            }
            
            // Speak
            synth.speak(utterance);
        }
    }
    
    function chunkText(text, wordsPerChunk) {
        const words = text.split(/\s+/);
        const chunks = [];
        
        for (let i = 0; i < words.length; i += wordsPerChunk) {
            chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
        }
        
        return chunks;
    }
    
    function saveConversationHistory() {
        try {
            localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
        } catch (error) {
            console.error('Error saving conversation history:', error);
            
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
            return [];
        }
    }
    
    function saveApiKeys() {
        try {
            // In a production app, you would use a more secure storage method
            // For this demo, we'll use localStorage with basic encoding
            // Note: This is not truly secure and should not be used for production
            for (const provider of Object.keys(apiConfig.apiKeys)) {
                if (apiConfig.apiKeys[provider]) {
                    localStorage.setItem(`apiKey_${provider}`, btoa(apiConfig.apiKeys[provider]));
                }
            }
        } catch (error) {
            console.error('Error saving API keys:', error);
        }
    }
    
    function loadApiKeys() {
        try {
            // Load saved API keys
            for (const provider of Object.keys(apiConfig.apiKeys)) {
                const savedKey = localStorage.getItem(`apiKey_${provider}`);
                if (savedKey) {
                    apiConfig.apiKeys[provider] = atob(savedKey);
                }
            }
            
            // Load saved provider
            const savedProvider = localStorage.getItem('currentProvider');
            if (savedProvider && apiConfig.providers[savedProvider]) {
                apiConfig.currentProvider = savedProvider;
            }
        } catch (error) {
            console.error('Error loading API keys:', error);
        }
    }
    
    // Add a welcome message if it's the first time
    if (conversationHistory.length === 0) {
        const welcomeMessage = "Hello! I'm your AI assistant powered by Netlify Functions. I can connect to various AI providers like Anthropic, Brave Search, and DeepSeek. Please set up your API keys using the settings button ⚙️ in the top right or with the /setkey command. Type /help for available commands.";
        
        addMessageToChat('assistant', welcomeMessage);
        
        conversationHistory.push({
            role: 'assistant',
            content: welcomeMessage,
            timestamp: new Date().toISOString()
        });
        
        saveConversationHistory();
    }
});
