"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from 'googleapis';
import { Id } from "./_generated/dataModel"; // Import Id

const customsearch = google.customsearch('v1');

const stylingPrompt = `Use standard Markdown for formatting your responses. For emphasis, ensure text is correctly enclosed (e.g., *italic text*, **bold text**). For lists, use standard Markdown list formats (e.g., \`1. Item\`, \`- Item\`).`;

async function searchWeb(query: string) {
  try {
    const response = await customsearch.cse.list({
      auth: process.env.GOOGLE_API_KEY,
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
      q: query,
      num: 5
    });

    if (!response.data.items) return "";

    return response.data.items
      .map(item => `${item.title}\n${item.snippet}`)
      .join('\n\n');
  } catch (error) {
    console.error('Search error:', error);
    return "";
  }
}

export const getAIResponse = action({
  args: {
    userMessage: v.string(),
    userId: v.id("users"),
    lawPrompt: v.optional(v.string()),
    tonePrompt: v.optional(v.string()),
    policyPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"messages">> => { // Explicitly type handler return
    console.log("getAIResponse action triggered"); // Add logging
    const { userMessage, userId, lawPrompt, tonePrompt, policyPrompt } = args;

    // Combine the separate prompts into a single system prompt
    const combinedSystemPrompt = [
      lawPrompt,
      policyPrompt,
      tonePrompt,
      stylingPrompt, // Place styling prompt at the end
    ]
      .filter(Boolean) // Remove any undefined or empty strings
      .join("\n\n"); // Separate prompts with double newlines

    const systemPrompt = combinedSystemPrompt; // Use the combined prompt

    // Search the web for relevant information
    const searchResults = await searchWeb(userMessage);
    const searchContext = searchResults
      ? "\nRelevant information from web search:\n" + searchResults
      : "";

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });

    // Start the chat with combined context
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: systemPrompt + "\n\nYou have access to real-time web search results. Use this information when relevant, but make sure to fact-check and verify the information." }],
        },
        {
          role: "model",
          parts: [{ text: "Understood, I will use the web search results responsibly and fact-check information." }],
        },
      ],
    });

    // Create a new message document in the database to stream into
    console.log("Creating message document in database"); // Add logging
    const messageId: Id<"messages"> = await ctx.runMutation(api.chat.createMessage, { // Explicitly type messageId
      userId,
      role: "assistant",
      content: "", // Start with empty content
      isStreaming: true, // Indicate that the message is currently streaming
    });
    console.log("Message document created with ID:", messageId); // Add logging

    // Send message with search context and handle streaming
    console.log("Sending message stream to Gemini"); // Add logging
    const streamResult = await chat.sendMessageStream(searchContext + "\n\nUser question: " + userMessage);
    console.log("Received stream result from Gemini"); // Add logging


    // Process the stream and update the message document
    console.log("Processing stream and updating message document"); // Add logging
    for await (const chunk of streamResult.stream) {
      const textChunk = chunk.text();
      if (textChunk) {
        await ctx.runMutation(api.chat.appendMessageContent, {
          messageId,
          content: textChunk,
        });
      }
    }
    console.log("Finished processing stream"); // Add logging


    // Mark the message as no longer streaming
    console.log("Updating message streaming status to false"); // Add logging
    await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
      messageId,
      isStreaming: false,
    });
    console.log("Message streaming status updated"); // Add logging


    return messageId; // Return the message ID to the client
  }
});
