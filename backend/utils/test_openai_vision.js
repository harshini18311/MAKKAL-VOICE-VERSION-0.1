require('dotenv').config({ path: '../.env' });
const OpenAI = require('openai');

async function testOpenAIVision() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("No OPENAI_API_KEY");
    return;
  }
  
  const openai = new OpenAI({ apiKey });
  
  try {
    console.log("Testing OpenAI GPT-4o-mini Vision...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this image? Reply with one word." },
            {
              type: "image_url",
              image_url: {
                "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
              },
            },
          ],
        },
      ],
    });

    console.log("Result:", response.choices[0].message.content);
  } catch (err) {
    console.error("OpenAI Error:", err.message);
  }
}

testOpenAIVision();
