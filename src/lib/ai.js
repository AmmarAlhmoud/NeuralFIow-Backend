const { GoogleGenerativeAI } = require("@google/generative-ai");

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });
  } catch (error) {
    console.error("🤖 Failed to initialize Gemini AI:", error);
    throw error;
  }
}

async function generateAIResponse(prompt, maxRetries = 3) {
  const model = getGemini();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🤖 Generating AI response (attempt ${attempt}/${maxRetries})`
      );

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text) {
        throw new Error("Empty response from AI model");
      }

      console.log("✅ AI response generated successfully");
      return text.trim();
    } catch (error) {
      console.error(`❌ AI generation attempt ${attempt} failed:`, error);

      if (attempt === maxRetries) {
        throw new Error(
          `AI generation failed after ${maxRetries} attempts: ${error.message}`
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}

module.exports = { getGemini, generateAIResponse };