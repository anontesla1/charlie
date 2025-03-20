// netlify/functions/config.js
// Store your API configuration here

exports.config = {
  // Your OpenAI API key - will be set from environment variables
  openaiApiKey: process.env.OPENAI_API_KEY,
  
  // Other configurations as needed
  defaultModel: "gpt-3.5-turbo",
  maxTokens: 500
};
