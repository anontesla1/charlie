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
                // IMPORTANT FOR GITHUB PAGES DEPLOYMENT:
                // If you're hosting on GitHub Pages, replace this URL with your proxy URL
                // Example: 'https://your-proxy-server.com/anthropic/v1/messages'
                apiEndpoint: 'https://api.anthropic.com/v1/messages',
                model: 'claude-3-opus-20240229',
                maxTokens: 1024
            },
            brave: {
                name: 'Brave Search',
                // Replace with your proxy URL for GitHub Pages deployment
                // Example: 'https://your-proxy-server.com/brave/res/v1/web/search'
                apiEndpoint: 'https://api.search.brave.com/res/v1/web/search',
                searchCount: 5
            },
            deepseek: {
                name: 'DeepSeek',
                // Replace with your proxy URL for GitHub Pages deployment
                // Example: 'https://your-proxy-server.com/deepseek/v1/chat/completions'
                apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
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
                        isGitHubPages: window.location.hostname.includes('github.io'),
                        isLocalhost: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                    },
                    browser: {
                        userAgent: navigator.userAgent,
                        language: navigator.language,
                        online: navigator.onLine
                    }
                };
                
                response = "Debug Information:\n```json\n" + JSON.stringify(debugInfo, null, 2) + "\n```\n\nCORS issues are likely if you're using GitHub Pages. Consider setting up a proxy server for API calls.";
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
                    
                    // If we get a CORS error, suggest using a proxy
                    if (apiError.message.includes('CORS') || apiError.message.includes('Failed to fetch')) {
                        response = `Error connecting to ${apiConfig.providers[apiConfig.currentProvider].name} API. This is likely due to CORS restrictions when running on GitHub Pages.\n\nPossible solutions:\n1. Set up a proxy server to handle API calls\n2. Host this app on your own domain with proper CORS headers\n3. Try the /debug command for more information`;
                    } else {
                        response = `Error from ${apiConfig.providers[apiConfig.currentProvider].name} API: ${apiError.message}`;
                    }
                    
                    // Add more helpful information
                    if (window.location.hostname.includes('github.io')) {
                        response += "\n\nNote: GitHub Pages doesn't allow direct API calls to most services due to security restrictions. You'll need to set up a proxy server to make this work.";
                    }
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
                
                if (window.location.hostname.includes('github.io')) {
                    errorMessage += " When hosting on GitHub Pages, you'll need a proxy server for API calls due to CORS restrictions.";
                }
            } else if (error.message.includes('API key')) {
                errorMessage += " Please check that you've entered the correct API key in the settings.";
            } else if (error.message.includes('CORS')) {
                errorMessage += " This is a Cross-Origin Resource Sharing (CORS) issue. When hosting on platforms like GitHub Pages, you'll need to use a proxy server for API calls.";
            }
            
            // Add general troubleshooting advice
            errorMessage += "\n\nTry the following:\n1. Check the browser console for detailed error logs\n2. Use the /debug command for system information\n3. Verify your API keys are correct";
            
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

        console.log("Preparing Anthropic API request with endpoint:", apiConfig.providers.anthropic.apiEndpoint);
        console.log("Using model:", apiConfig.providers.anthropic.model);
        
        try {
            // Use a proxy if in development/GitHub Pages environment to avoid CORS
            const useProxy = window.location.hostname.includes('github.io') || 
                             window.location.hostname === 'localhost' ||
                             window.location.hostname === '127.0.0.1';
            
            let requestEndpoint = apiConfig.providers.anthropic.apiEndpoint;
            let headers = {
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            };
            
            // Add direct API key or prepare for proxy
            if (useProxy) {
                console.log("Using proxy for Anthropic API call");
                // When using GitHub Pages, we need to use a proxy service
                requestEndpoint = 'https://cors-anywhere.herokuapp.com/' + requestEndpoint;
                // The proxy will need to add the API key on the server side
                headers['X-Proxy-API-Key'] = apiKey; // Custom header for our proxy
            } else {
                // Direct API key for self-hosted environments
                headers['x-api-key'] = apiKey;
            }
            
            // Make the API request
            const response = await fetch(requestEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: apiConfig.providers.anthropic.model,
                    messages: messages,
                    max_tokens: apiConfig.providers.anthropic.maxTokens
                })
            });
            
            console.log("Anthropic API response status:", response.status);
            
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
        } catch (error) {
            console.error("Error in Anthropic API call:", error);
            
            // Provide detailed error information based on the type of error
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error('Network error: Could not connect to Anthropic API. This could be due to CORS restrictions when running on GitHub Pages. Consider setting up a proxy server.');
            }
            
            throw error;
        }
    }
    
    async function makeBraveSearchRequest(query) {
        const apiKey = apiConfig.apiKeys.brave;
        if (!apiKey) return "Brave Search API key not set. Use /setkey brave YOUR_API_KEY";
        
        const searchUrl = `${apiConfig.providers.brave.apiEndpoint}?q=${encodeURIComponent(query)}&count=${apiConfig.providers.brave.searchCount}`;
        console.log("Preparing Brave Search API request to:", searchUrl);
        
        try {
            // Use a proxy if in development/GitHub Pages environment to avoid CORS
            const useProxy = window.location.hostname.includes('github.io') || 
                             window.location.hostname === 'localhost' ||
                             window.location.hostname === '127.0.0.1';
            
            let requestUrl = searchUrl;
            let headers = {
                'Accept': 'application/json'
            };
            
            if (useProxy) {
                console.log("Using proxy for Brave Search API call");
                requestUrl = 'https://cors-anywhere.herokuapp.com/' + requestUrl;
                headers['X-Proxy-API-Key'] = apiKey; // For proxy to use
            } else {
                headers['X-Subscription-Token'] = apiKey; // Direct API key
            }
            
            const response = await fetch(requestUrl, { headers });
            
            console.log("Brave Search API response status:", response.status);
            
            if (!response.ok) {
                let errorMessage = "HTTP error " + response.status;
                try {
                    const errorData = await response.json();
                    errorMessage = `Brave Search API error: ${errorData.message || response.statusText}`;
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
        } catch (error) {
            console.error("Error in Brave Search API call:", error);
            
            // Provide detailed error information
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error('Network error: Could not connect to Brave Search API. This could be due to CORS restrictions when running on GitHub Pages. Consider setting up a proxy server.');
            }
            
            throw error;
        }
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
        
        console.log("Preparing DeepSeek API request with endpoint:", apiConfig.providers.deepseek.apiEndpoint);
        console.log("Using model:", apiConfig.providers.deepseek.model);
        
        try {
            // Use a proxy if in development/GitHub Pages environment to avoid CORS
            const useProxy = window.location.hostname.includes('github.io') || 
                            window.location.hostname === 'localhost' ||
                            window.location.hostname === '127.0.0.1';
            
            let requestEndpoint = apiConfig.providers.deepseek.apiEndpoint;
            let headers = {
                'Content-Type': 'application/json',
            };
            
            if (useProxy) {
                console.log("Using proxy for DeepSeek API call");
                requestEndpoint = 'https://cors-anywhere.herokuapp.com/' + requestEndpoint;
                headers['X-Proxy-API-Key'] = apiKey; // For proxy to use
            } else {
                headers['Authorization'] = `Bearer ${apiKey}`; // Direct API key
            }
            
            const response = await fetch(requestEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: apiConfig.providers.deepseek.model,
                    messages: messages,
                    max_tokens: apiConfig.providers.deepseek.maxTokens
                })
            });
            
            console.log("DeepSeek API response status:", response.status);
            
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
        } catch (error) {
            console.error("Error in DeepSeek API call:", error);
            
            // Provide detailed error information
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error('Network error: Could not connect to DeepSeek API. This could be due to CORS restrictions when running on GitHub Pages. Consider setting up a proxy server.');
            }
            
            throw error;
        }
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
        // Create modal container if it doesn't exist
        let modal = document.getElementById('settings-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'settings-modal';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            modal.style.display = 'flex';
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
            modal.style.zIndex = '1000';
            
            document.body.appendChild(modal);
        } else {
            modal.innerHTML = '';
            modal.style.display = 'flex';
        }
        
        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.padding = '20px';
        modalContent.style.borderRadius = '10px';
        modalContent.style.width = '80%';
        modalContent.style.maxWidth = '500px';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflowY = 'auto';
        
        // Title
        const title = document.createElement('h2');
        title.textContent = 'Settings';
        title.style.marginBottom = '20px';
        modalContent.appendChild(title);
        
        // Close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.position = 'absolute';
        closeButton.style.right = '20px';
        closeButton.style.top = '15px';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '1.5rem';
        closeButton.style.cursor = 'pointer';
        closeButton.onclick = () => { modal.style.display = 'none'; };
        modalContent.appendChild(closeButton);
        
        // TTS toggle
        const ttsContainer = document.createElement('div');
        ttsContainer.style.marginBottom = '20px';
        
        const ttsLabel = document.createElement('label');
        ttsLabel.style.display = 'flex';
        ttsLabel.style.alignItems = 'center';
        
        const ttsToggle = document.createElement('input');
        ttsToggle.type = 'checkbox';
        ttsToggle.id = 'tts-toggle';
        ttsToggle.style.marginRight = '10px';
        ttsToggle.checked = localStorage.getItem('ttsEnabled') === 'true';
        
        ttsLabel.appendChild(ttsToggle);
        ttsLabel.appendChild(document.createTextNode('Auto-read responses aloud'));
        
        ttsContainer.appendChild(ttsLabel);
        modalContent.appendChild(ttsContainer);
        
        // API Provider selection
        const providerContainer = document.createElement('div');
        providerContainer.style.marginBottom = '20px';
        
        const providerLabel = document.createElement('label');
        providerLabel.textContent = 'Default API Provider:';
        providerLabel.style.display = 'block';
        providerLabel.style.marginBottom = '5px';
        
        providerContainer.appendChild(providerLabel);
        
        const providerSelect = document.createElement('select');
        providerSelect.id = 'provider-select';
        providerSelect.style.width = '100%';
        providerSelect.style.padding = '8px';
        providerSelect.style.borderRadius = '5px';
        providerSelect.style.border = '1px solid #ddd';
        
        for (const [key, value] of Object.entries(apiConfig.providers)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = value.name;
            if (key === apiConfig.currentProvider) {
                option.selected = true;
            }
            providerSelect.appendChild(option);
        }
        
        providerContainer.appendChild(providerSelect);
        modalContent.appendChild(providerContainer);
        
        // API Key fields for each provider
        const apiKeyContainer = document.createElement('div');
        apiKeyContainer.style.marginBottom = '20px';
        
        const apiKeyLabel = document.createElement('h3');
        apiKeyLabel.textContent = 'API Keys:';
        apiKeyLabel.style.marginBottom = '10px';
        
        apiKeyContainer.appendChild(apiKeyLabel);
        
        for (const [key, value] of Object.entries(apiConfig.providers)) {
            const fieldContainer = document.createElement('div');
            fieldContainer.style.marginBottom = '10px';
            
            const label = document.createElement('label');
            label.textContent = `${value.name} API Key:`;
            label.style.display = 'block';
            label.style.marginBottom = '5px';
            
            const input = document.createElement('input');
            input.type = 'password';
            input.id = `${key}-api-key`;
            input.value = apiConfig.apiKeys[key] || '';
            input.style.width = '100%';
            input.style.padding = '8px';
            input.style.borderRadius = '5px';
            input.style.border = '1px solid #ddd';
            
            fieldContainer.appendChild(label);
            fieldContainer.appendChild(input);
            apiKeyContainer.appendChild(fieldContainer);
        }
        
        modalContent.appendChild(apiKeyContainer);
        
        // Save button
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save Settings';
        saveButton.style.backgroundColor = '#4a90e2';
        saveButton.style.color = 'white';
        saveButton.style.border = 'none';
        saveButton.style.padding = '10px 15px';
        saveButton.style.borderRadius = '5px';
        saveButton.style.cursor = 'pointer';
        saveButton.style.width = '100%';
        
        saveButton.onclick = () => {
            // Save TTS setting
            localStorage.setItem('ttsEnabled', document.getElementById('tts-toggle').checked);
            
            // Save selected provider
            const selectedProvider = document.getElementById('provider-select').value;
            apiConfig.currentProvider = selectedProvider;
            localStorage.setItem('currentProvider', selectedProvider);
            
            // Save API keys
            for (const provider of Object.keys(apiConfig.providers)) {
                const apiKeyInput = document.getElementById(`${provider}-api-key`);
                if (apiKeyInput && apiKeyInput.value) {
                    apiConfig.apiKeys[provider] = apiKeyInput.value;
                }
            }
            
            saveApiKeys();
            modal.style.display = 'none';
        };
        
        modalContent.appendChild(saveButton);
        modal.appendChild(modalContent);
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
            // For this demo, we'll use localStorage with base64 encoding
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
        const welcomeMessage = "Hello! I'm your AI assistant. I can connect to various AI providers like Anthropic, Brave Search, and DeepSeek. Please set up your API keys using the settings button ⚙️ in the top right or with the /setkey command. Type /help for available commands.";
        
        addMessageToChat('assistant', welcomeMessage);
        
        conversationHistory.push({
            role: 'assistant',
            content: welcomeMessage,
            timestamp: new Date().toISOString()
        });
        
        saveConversationHistory();
    }
});
