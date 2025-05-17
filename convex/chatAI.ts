"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from 'googleapis';
import { Id } from "./_generated/dataModel";

const customsearch = google.customsearch('v1');

// --- Hardcoded Prompts ---
const STYLING_PROMPT = `Use standard Markdown for formatting your responses.

For emphasis (making text stand out):
  - Use *italic text* for italics (single asterisks or underscores surrounding the text).
  - Use **bold text** for bold (double asterisks or underscores surrounding the text).

For lists of items:
  - Each item must be on a new line.
  - For bulleted lists, consistently start EACH item in the list with \`- \` (a hyphen followed by a space) OR consistently start EACH item in the list with \`* \` (an asterisk followed by a space). Do not mix these markers within a single list. Example of a correct list:
    - Item A
    - Item B
    - Item C
  - For numbered lists, consistently start EACH item in the list with \`1. \`, \`2. \`, etc. (a number, a period, then a space).
If you are presenting multiple related items sequentially that form a conceptual list (like a list of names, features, or steps), YOU MUST use one of the above Markdown list formats for ALL items in that list for visual consistency. Do not present some items as plain text lines and others as Markdown list items within the same conceptual list.
`;

// THIS IS THE UPDATED/CORRECTED WEB_SEARCH_USAGE_INSTRUCTIONS
const WEB_SEARCH_USAGE_INSTRUCTIONS = `
**Only use the web search tool to access up-to-date information from the web or when responding to the user requires information about their location. Some examples of when to use the web search tool include:
- Local Information: weather, local businesses, events.
- Freshness: if up-to-date information on a topic could change or enhance the answer.
- Niche Information: detailed info not widely known or understood (found on the internet).
- Accuracy: if the cost of outdated information is high, use web sources directly.:**

*   Your primary task is to synthesize information from any provided web search snippets to answer the user's question directly and concisely.
*   If the provided snippets clearly answer the question, use them.
*   **If the user asks for a specific number of items (e.g., "top 5 companies," "3 main benefits"), you MUST attempt to extract that specific number of relevant items from the provided web search snippets.
    *   If the snippets provide enough distinct and relevant items, list exactly the number requested.
    *   If the snippets mention fewer relevant items than requested, list what you find and clearly state that the search provided only that many examples.
    *   If the snippets mention more items than requested but don't offer a clear ranking or criteria to select the "top" ones, you may list a selection up to the requested number, and then state that the snippets mentioned other companies/items as well but a definitive top [number] wasn't clear from the provided information.
    *   Always prioritize relevance to the user's query when selecting items.
*   **Crucially: If you are listing multiple distinct items extracted or derived from the web search snippets (e.g., company names, product features, statistics), YOU MUST format this as a Markdown bulleted list. Each item should start with \`- \` (a hyphen followed by a space) on a new line. Be consistent for all items in such a list.**
    Example of how to list companies from search (if user asked for top 3):
    Information from web sources suggests some prominent companies include:
    - Company X
    - Company Y
    - Company Z
    (If more were mentioned but no clear ranking: "Other companies were also mentioned in the search results.")
*   If the snippets do not contain a direct answer, if the information is conflicting/unclear, or if the search indicated no relevant information was found for the query, state that the web search did not provide a definitive answer for that specific query.
*   **Under no circumstances should you mention the process of web searching, "scraping data," "technical issues with searching," or imply that you are performing the search yourself.** You are being *provided* with summaries. You should not say things like "Based on my web search..." but rather "Information from web sources suggests..." or "Some mentioned examples include:".
*   If the web search information indicates a timeout or an error in retrieving data (you will be told this), simply inform the user that the requested information could not be retrieved via web search at this time, without detailing the error.
*   Your main goal is to answer the user's original question. Use the web search snippets as a tool to do so, but do not let the search process itself become the topic of conversation.
`;


const WEB_SEARCH_TIMEOUT_MS = 4000;

async function generateSearchQuery(userMessage: string, genAI: GoogleGenerativeAI): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });
    const prompt = `Based on the following user message, generate a concise and effective Google search query to find the core information requested. Output only the search query itself.
User Message: "${userMessage}"
Search Query:`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();
    return text || userMessage;
  } catch (error) {
    console.error("Error generating search query:", error);
    return userMessage;
  }
}

async function searchWeb(query: string): Promise<string> {
  try {
    const searchPromise = customsearch.cse.list({
      auth: process.env.GOOGLE_API_KEY,
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
      q: query,
      num: 5, // Fetching up to 5 results to give LLM more to pick from for "top N"
    });

    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Google Search API timeout')), WEB_SEARCH_TIMEOUT_MS)
    );

    // @ts-ignore
    const response: any = await Promise.race([searchPromise, timeoutPromise]);

    if (response === null) {
      console.warn(`Web search for "${query}" timed out.`);
      return "WEB_SEARCH_TIMED_OUT";
    }
    
    if (!response.data || !response.data.items || response.data.items.length === 0) {
      return "WEB_SEARCH_NO_RESULTS";
    }

    return response.data.items
      .map((item: any) => `Source Title: ${item.title}\nSnippet: ${item.snippet}`)
      .join('\n\n---\n\n');
  } catch (error: any) {
    console.error('Search error:', error.message);
    if (error.message === 'Google Search API timeout') {
      return "WEB_SEARCH_TIMED_OUT";
    }
    return "WEB_SEARCH_ERROR";
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
  handler: async (ctx, args): Promise<Id<"messages">> => {
    const { userMessage, userId, lawPrompt, tonePrompt, policyPrompt } = args;

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

    const optimizedSearchQuery = await generateSearchQuery(userMessage, genAI);
    const searchResultsOrErrorKey = await searchWeb(optimizedSearchQuery);
    
    let searchContextForLLM = "";
    let searchInfoForSystemPrompt = `Web search was not performed for query "${optimizedSearchQuery}" or it yielded no usable results.`;


    if (searchResultsOrErrorKey === "WEB_SEARCH_TIMED_OUT") {
        searchInfoForSystemPrompt = `A web search attempt (query: "${optimizedSearchQuery}") timed out. Inform the user that the information could not be retrieved at this time if the query seemed to require external data.`;
    } else if (searchResultsOrErrorKey === "WEB_SEARCH_NO_RESULTS") {
        searchInfoForSystemPrompt = `A web search (query: "${optimizedSearchQuery}") found no relevant results. If the user's question likely required external data, state that the search didn't find specific information.`;
    } else if (searchResultsOrErrorKey === "WEB_SEARCH_ERROR") {
        searchInfoForSystemPrompt = `An error occurred during a web search attempt (query: "${optimizedSearchQuery}"). Inform the user that the information could not be retrieved at this time if the query seemed to require external data.`;
    } else if (searchResultsOrErrorKey) { 
        searchInfoForSystemPrompt = `Web search results (query: "${optimizedSearchQuery}") are available and provided below. You MUST synthesize this information to answer the user's query, strictly adhering to any specific number of items requested by the user (e.g., "top 5"). Format any list of items as a Markdown bulleted list, each item starting with '- '.`;
        searchContextForLLM = `\n\nHere are some snippets from a web search related to the user's query (search term used: "${optimizedSearchQuery}"):
---
${searchResultsOrErrorKey}
---
Please use this information to help answer the user's original question. If the user requested a specific number of items (e.g., "top 5"), you MUST try to provide that many distinct and relevant items from these snippets. If you cannot, clearly explain why (e.g., "The provided snippets listed several companies but did not rank them to identify a definitive top 5."). If listing multiple items, format them as a Markdown bulleted list (each item starting with '- ').`;
    }


    const dynamicPrompts = [
      lawPrompt,
      policyPrompt,
      tonePrompt,
    ].filter(Boolean).join("\n\n");

    const finalSystemInstruction = `
${STYLING_PROMPT}
// The prompt above defines how you MUST format your output using Markdown, especially for lists and emphasis. Adhere to it strictly.

${dynamicPrompts} 
// The dynamic prompts above define your general persona, legal constraints, and company policies.

${WEB_SEARCH_USAGE_INSTRUCTIONS} 
// The instructions above specifically guide how you MUST use and refer to any web search information that is provided to you, including how to handle requests for a specific number of items and how to format lists of items derived from search.

${searchInfoForSystemPrompt}
// The line above gives you context about the outcome of any web search attempt related to the current user query.

Your primary goal is to answer the user's question based on your training, the ELIXIR internal knowledge base (if a RAG system is in place), and any provided web search snippets.
Remember to be concise and directly address the user's original question, including any constraints like a requested number of items.
`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });

    // Fetch previous messages
    const previousMessages = await ctx.runQuery(api.chat.getMessages, { userId: userId }); // Pass the userId

    // Format messages for Gemini history
    const formattedHistory = previousMessages.map(msg => ({
      role: msg.role === "user" ? "user" : "model", // Gemini uses "model" for assistant
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: finalSystemInstruction }] },
        { role: "model", parts: [{ text: "Understood. I will strictly adhere to all guidelines, including synthesizing search results to meet specific user requests like a 'top 5' list if the information allows, and formatting all lists correctly using Markdown." }] },
        ...formattedHistory, // Include previous messages
      ],
    });

    const messageId: Id<"messages"> = await ctx.runMutation(api.chat.createMessage, {
      userId,
      role: "assistant",
      content: "",
      isStreaming: true,
    });

    const messageToSendToGemini = (searchContextForLLM ? searchContextForLLM + "\n\n" : "") + "User's original question: " + userMessage;
    
    const streamResult = await chat.sendMessageStream(messageToSendToGemini);

    for await (const chunk of streamResult.stream) {
      const textChunk = chunk.text();
      if (textChunk) {
        await ctx.runMutation(api.chat.appendMessageContent, {
          messageId,
          content: textChunk,
        });
      }
    }

    await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
      messageId,
      isStreaming: false,
    });

    return messageId;
  }
});
