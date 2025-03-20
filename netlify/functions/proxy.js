// netlify/functions/proxy.js
const axios = require('axios');
const { config } = require('./config');

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get the target API URL and request body from the request
    const { apiUrl, requestBody } = JSON.parse(event.body);
    
    if (!apiUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'API URL is required' })
      };
    }

    // Check if this is an OpenAI API request
    const isOpenAI = apiUrl.includes('openai.com');
    
    // Headers setup
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Add API key for OpenAI
    if (isOpenAI && config.openaiApiKey) {
      headers['Authorization'] = `Bearer ${config.openaiApiKey}`;
    }

    // Make the request to the API
    const response = await axios({
      method: 'post',
      url: apiUrl,
      data: requestBody,
      headers: headers
    });

    // Return the API response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(response.data)
    };
  } catch (error) {
    console.log('Error:', error.message);
    
    // Provide a meaningful error response
    let statusCode = 500;
    let errorMessage = 'Internal Server Error';
    
    if (error.response) {
      // The API responded with an error
      statusCode = error.response.status;
      errorMessage = error.response.data.error || error.message;
    }
    
    return {
      statusCode: statusCode,
      body: JSON.stringify({ 
        error: errorMessage,
        message: error.message
      })
    };
  }
};
