const axios = require('axios');
const FormData = require('form-data');

let mockCounter = 0;
const mockComplaints = [
  "The road conditions here are very poor with huge potholes.",
  "There is a lack of proper street lighting in our area.",
  "The drainage is periodically overflowing and clogging the streets.",
  "We are experiencing severe water leakage in the main pipelines.",
  "Garbage collection has been extremely irregular this month.",
  "People are practicing open garbage dumping near the school.",
  "Sewage is overflowing into the residential areas dangerously.",
  "There is a severe drinking water shortage in our village.",
  "The water supply we receive is visibly contaminated and dirty.",
  "We have very low water pressure in our homes.",
  "There has been absolutely no water supply for the past three days.",
  "The public taps and hand pumps are broken and unusable.",
  "We are facing frequent power cuts every single day.",
  "Severe voltage fluctuations are damaging our home appliances.",
  "The main transformer in our street is faulty and sparking.",
  "There is a huge delay in repairing the broken power lines.",
  "Traffic congestion is unbearable during the morning hours.",
  "There is a complete lack of traffic signals at the main junction.",
  "Poor public transport availability makes it hard to commute to the city.",
  "The roads are very unsafe because there are no speed breakers.",
  "Illegal parking is causing endless chaos on the narrow streets.",
  "Mosquito breeding is rampant due to stagnant water everywhere.",
  "Stray dogs and cattle are roaming freely and attacking people at night.",
  "There is a severe lack of public toilets in the marketplace.",
  "Public spaces are incredibly dirty and completely unmaintained.",
  "There is a huge delay in receiving basic essential government services.",
  "I want to report severe corruption and bribery by local ward officials.",
  "Poor maintenance of public buildings is causing them to crumble.",
  "There is a complete lack of proper complaint response from authorities.",
  "We are facing massive irrigation problems and lack of water for farming.",
  "The stray animal menace on the highways is increasing rapidly."
];

// This service mocks Whisper STT for offline demo purposes, or uses OpenAI API if key provided.
async function transcribeAudio(audioBuffer) {
  try {
    if (process.env.OPENAI_API_KEY) {
      const form = new FormData();
      form.append('file', audioBuffer, { filename: 'audio.webm', contentType: 'audio/webm' });
      form.append('model', 'whisper-1');

      const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      });
      return response.data.text;
    } else {
      console.log('No OPENAI_API_KEY provided. Using Mock Whisper Transcriber.');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const text = mockComplaints[mockCounter % mockComplaints.length];
      mockCounter++;
      return text;
    }
  } catch (error) {
    const apiError = error.response?.data?.error?.message || error.message;
    console.error('Speech-to-Text Error:', apiError);
    throw new Error(`Audio transcription failed: ${apiError}. Please check your API key.`);
  }
}

module.exports = { transcribeAudio };
