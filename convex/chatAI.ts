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

const WEB_SEARCH_USAGE_INSTRUCTIONS = `
**Regarding Web Search Information If Provided:**
*   If web search snippets ARE PROVIDED to you, your primary task is to synthesize information from them to answer the user's question directly and concisely.
*   If the provided snippets clearly answer the question, use them.
*   **If the user asks for a specific number of items (e.g., "top 5 companies," "3 main benefits") AND web search results are provided, you MUST attempt to extract that specific number of relevant items from the provided web search snippets.
    *   If the snippets provide enough distinct and relevant items, list exactly the number requested.
    *   If the snippets mention fewer relevant items than requested, list what you find and clearly state that the search provided only that many examples.
    *   If the snippets mention more items than requested but don't offer a clear ranking or criteria to select the "top" ones, you may list a selection up to the requested number, and then state that the snippets mentioned other companies/items as well but a definitive top [number] wasn't clear from the provided information.
    *   Always prioritize relevance to the user's query when selecting items from search results.
*   **Crucially: If you are listing multiple distinct items extracted or derived from web search snippets, YOU MUST format this as a Markdown bulleted list. Each item should start with \`- \` (a hyphen followed by a space) on a new line. Be consistent for all items in such a list.**
    Example of how to list companies from search (if user asked for top 3 and search results were provided):
    Information from web sources suggests some prominent companies include:
    - Company X
    - Company Y
    - Company Z
    (If more were mentioned but no clear ranking: "Other companies were also mentioned in the search results.")
*   If web search snippets are provided but do not contain a direct answer, if the information is conflicting/unclear, or if the search indicated no relevant information was found for the query, state that the web search did not provide a definitive answer for that specific query.
*   **Under no circumstances should you mention the process of web searching, "scraping data," "technical issues with searching," or imply that you are performing the search yourself if you use web search data.** You are being *provided* with summaries. You should not say things like "Based on my web search..." but rather "Information from web sources suggests..." or "Some mentioned examples include:".
*   If the web search information (passed to you in the system prompt) indicates a timeout or an error in retrieving data, simply inform the user that the requested information could not be retrieved via web search at this time, without detailing the error.
*   If NO web search information is provided, answer based on your general knowledge. Do not invent search results or apologize for not searching.
`;

const WEB_SEARCH_TIMEOUT_MS = 4000;

// New function to decide if a search is needed
// Inside shouldPerformSearch - REVISED PROMPT
async function shouldPerformSearch(userMessage: string, history: { role: string; parts: { text: string; }[]; }[], selectedModel: string | undefined, genAI: GoogleGenerativeAI): Promise<boolean> {
  try {
    const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
    const prompt = `Analyze the following user message in the context of the provided conversation history. Your task is to decide if a web search would significantly improve the quality, accuracy, or recency of the answer. Output only "YES" or "NO".

**Conversation History (most recent last):**
${history.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n')}

**Strong reasons to search ("YES"):**
- The query explicitly asks for current or real-time information (e.g., "What's the weather like in London right now?", "latest news on X", "current stock price of Y").
- The query is about very recent events or developments (e.g., things that happened in the last few days/weeks, post-dating your knowledge cutoff).
- The query asks for specific, niche, or technical facts, statistics, or details about entities (people, places, organizations, products) that are not common knowledge or where precision is important.
- The query pertains to local information (businesses, services, events) and implies a need for current, location-specific data.
- The user is asking for a comparison or list of specific items where web data would provide comprehensive options (e.g., "top 5 laptops for students").

**Strong reasons NOT to search ("NO"):**
- The query is a simple greeting, conversational filler, or a personal statement not seeking external information (e.g., "hello", "my name is Alice", "I feel happy today").
- The query is for creative content generation (e.g., "write a poem", "tell me a story") unless it specifically asks for factual elements to be included from the web.
- The query asks for your own opinions, or internal AI instructions (unless the question is specifically about how you *use* web search as a tool).
- The query is about extremely broad, common knowledge that is highly unlikely to have changed (e.g., "What is the capital of France?", "How many days in a week?").
- The query is excessively vague, and a web search would not yield a focused or useful answer.

**Decision guidance:**
- If the query falls into a "Strong reasons to search" category, answer "YES".
- If it falls into a "Strong reasons NOT to search" category, answer "NO".
- **If it's borderline, but the user seems to be looking for factual, up-to-date, or specific information that *could* be on the web, lean towards "YES" to prioritize providing the most helpful and accurate response.**
- Do not search if the user is just making a statement or asking a question you can confidently answer from your existing knowledge without needing external verification for recency or specificity.

User Message: "${userMessage}"

Decision (YES or NO):`;

    console.log("[shouldPerformSearch] Prompting to decide on search for user message:", userMessage);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toUpperCase();
    console.log(`[shouldPerformSearch] Decision for "${userMessage}": ${responseText}`);
    return responseText === "YES";
  } catch (error) {
    console.error("[shouldPerformSearch] Error deciding whether to search:", error);
    return false; // Default to no search on error
  }
}

async function generateSearchQuery(userMessage: string, history: { role: string; parts: { text: string; }[]; }[], lawPrompt: string | undefined, tonePrompt: string | undefined, policyPrompt: string | undefined, selectedModel: string | undefined, genAI: GoogleGenerativeAI): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
    const dynamicPrompts = [
      lawPrompt,
      policyPrompt,
      tonePrompt,
    ].filter(Boolean).join("\n\n");

    const prompt = `Based on the following user message and the conversation history, and considering the following system prompts, generate a effective Google search query to find the core information requested. The user's message has been deemed to require a web search. Output only the search query itself, without any preamble or explanation.

**System Prompts (if any):**
${dynamicPrompts}

**Conversation History (most recent last):**
${history.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n')}

**Guidance for Search Query Generation:**
- If the user's message or conversation history implies a search for quality, ranking, or recommendations (e.g., "best", "top", "leading", "highly-rated"), incorporate these terms into the search query.
- Be specific and concise.

User Message: "${userMessage}"
Search Query:`;
    console.log("[generateSearchQuery] Generating search query for:", userMessage);
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();
    console.log(`[generateSearchQuery] Generated query for "${userMessage}": "${text || userMessage}"`);
    return text || userMessage; // Fallback to userMessage if generation fails or is empty
  } catch (error) {
    console.error("[generateSearchQuery] Error generating search query:", error);
    return userMessage; // Fallback to userMessage on error
  }
}

async function searchWeb(query: string): Promise<string> {
  console.log(`[searchWeb] Performing search for query: "${query}"`);
  try {
    const searchPromise = customsearch.cse.list({
      auth: process.env.GOOGLE_API_KEY,
      cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
      q: query,
      num: 5,
    });

    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Google Search API timeout')), WEB_SEARCH_TIMEOUT_MS)
    );

    // @ts-ignore - googleapis types can be tricky with Promise.race
    const response: any = await Promise.race([searchPromise, timeoutPromise]);

    if (response === null) {
      console.warn(`[searchWeb] Web search for "${query}" timed out.`);
      return "WEB_SEARCH_TIMED_OUT";
    }
    
    if (!response.data || !response.data.items || response.data.items.length === 0) {
      console.log(`[searchWeb] No results found for query: "${query}"`);
      return "WEB_SEARCH_NO_RESULTS";
    }

    const results = response.data.items
      .map((item: any) => `Source Title: ${item.title}\nSnippet: ${item.snippet}`)
      .join('\n\n---\n\n');
    console.log(`[searchWeb] Found ${response.data.items.length} results for query: "${query}"`);
    return results;
  } catch (error: any) {
    console.error(`[searchWeb] Error during search for "${query}":`, error.message);
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
    selectedModel: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"messages">> => {
    const { userMessage, userId, lawPrompt, tonePrompt, policyPrompt, selectedModel } = args;
    console.log(`[getAIResponse] Received request for user ${userId}. Message: "${userMessage}". Selected Model: "${selectedModel || "gemini-2.5-flash-preview-04-17"}"`);
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

    let searchContextForLLM = "";
    let searchInfoForSystemPrompt = "Web search was not performed for this query, as it was deemed unnecessary or the query was conversational. Answer from general knowledge.";

    const previousMessages = await ctx.runQuery(api.chat.getMessages, { userId: userId });
    const formattedHistory = previousMessages.map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));
    console.log("[getAIResponse] Formatted conversation history:", JSON.stringify(formattedHistory, null, 2));

    console.log("[getAIResponse] Calling shouldPerformSearch with user message, history, and selected model...");
    const performSearch = await shouldPerformSearch(userMessage, formattedHistory, selectedModel, genAI);
    console.log(`[getAIResponse] shouldPerformSearch returned: ${performSearch}`);

    let optimizedSearchQuery = ""; // Initialize
    if (performSearch) {
      console.log("[getAIResponse] Decision: Performing web search.");
      console.log("[getAIResponse] Calling generateSearchQuery with user message, history, system prompts, and selected model...");
      optimizedSearchQuery = await generateSearchQuery(userMessage, formattedHistory, lawPrompt, tonePrompt, policyPrompt, selectedModel, genAI);
      console.log(`[getAIResponse] generateSearchQuery returned: "${optimizedSearchQuery}"`);
      const searchResultsOrErrorKey = await searchWeb(optimizedSearchQuery);
      console.log(`[getAIResponse] searchWeb returned: ${searchResultsOrErrorKey.substring(0, 100)}...`);

      if (searchResultsOrErrorKey === "WEB_SEARCH_TIMED_OUT") {
        searchInfoForSystemPrompt = `A web search attempt (query: "${optimizedSearchQuery}") timed out. Inform the user that the information could not be retrieved at this time. Do not attempt to answer the part of the query that required the search.`;
      } else if (searchResultsOrErrorKey === "WEB_SEARCH_NO_RESULTS") {
        searchInfoForSystemPrompt = `A web search (query: "${optimizedSearchQuery}") found no relevant results. Inform the user that the search didn't find specific information for that part of the query. Do not attempt to answer the part of the query that required the search from general knowledge if the search was meant to find specifics.`;
      } else if (searchResultsOrErrorKey === "WEB_SEARCH_ERROR") {
        searchInfoForSystemPrompt = `An error occurred during a web search attempt (query: "${optimizedSearchQuery}"). Inform the user that the information could not be retrieved. Do not attempt to answer the part of the query that required the search.`;
      } else if (searchResultsOrErrorKey) { // This means actual search results were returned
        searchInfoForSystemPrompt = `Web search results for query "${optimizedSearchQuery}" are provided below. You MUST synthesize this information to answer the user's query if it's relevant, strictly adhering to any specific number of items requested by the user (e.g., "top 5"). Format any list of items as a Markdown bulleted list, each item starting with '- '. Follow WEB_SEARCH_USAGE_INSTRUCTIONS for how to present this information.`;
        searchContextForLLM = `\n\nRelevant web search snippets (search term used: "${optimizedSearchQuery}"):
---
${searchResultsOrErrorKey}
---
Use this information to help answer the user's original question, adhering to the WEB_SEARCH_USAGE_INSTRUCTIONS.`;
      } else {
         // Fallback, should ideally not be reached if searchWeb returns one of the defined strings or results
         searchInfoForSystemPrompt = `Web search was attempted for query "${optimizedSearchQuery}" but yielded no usable results. Proceed by answering from general knowledge if appropriate.`;
      }
    } else {
      console.log("[getAIResponse] Decision: NOT performing web search. Answering from general knowledge.");
      // searchContextForLLM remains ""
      // searchInfoForSystemPrompt remains its default "Web search was not performed..."
    }

    const dynamicPrompts = [
      lawPrompt,
      policyPrompt,
      tonePrompt,
    ].filter(Boolean).join("\n\n");

    const finalSystemInstruction = `You are ELIXIR AI, a helpful assistant.
${STYLING_PROMPT}
// The prompt above defines how you MUST format your output using Markdown. Adhere to it strictly.

${dynamicPrompts} 
// The dynamic prompts above (if any) define your general persona, legal constraints, and company policies.

${WEB_SEARCH_USAGE_INSTRUCTIONS} 
// The instructions above specifically guide how you MUST use and refer to any web search information IF IT IS PROVIDED to you.

${searchInfoForSystemPrompt}
// The line above gives you crucial context: EITHER the outcome of a web search attempt OR an instruction that no search was performed and you should rely on general knowledge.

Your primary goal is to answer the user's question.
- If web search results were provided (see context above), integrate them according to WEB_SEARCH_USAGE_INSTRUCTIONS.
- If no search was performed, or if search yielded no results for the specific information sought, answer from your general training knowledge to the best of your ability. Do not invent search results.
- Always be concise and directly address the user's original question.
`;
    console.log("[getAIResponse] Final System Instruction (first 500 chars):", finalSystemInstruction.substring(0, 500) + "...");

    const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: finalSystemInstruction }] },
        { role: "model", parts: [{ text: "Understood. I will follow all instructions. If web search data is provided, I will use it as guided. Otherwise, I will rely on my general knowledge." }] },
        ...formattedHistory,
      ],
    });

    const messageId: Id<"messages"> = await ctx.runMutation(api.chat.createMessage, {
      userId,
      role: "assistant",
      content: "",
      isStreaming: true,
    });
    console.log(`[getAIResponse] Created placeholder message ${messageId} for streaming response.`);

    // Construct the final message to send to the LLM for response generation
    // It includes the search context (if any) and then the user's original question.
    const messageToSendToGemini = (searchContextForLLM ? searchContextForLLM + "\n\nUser's original question: " : "User's original question: ") + userMessage;
    
    console.log(`[getAIResponse] Sending to Gemini for response generation (first 500 chars): "${messageToSendToGemini.substring(0,500)}..."`);

    const streamResult = await chat.sendMessageStream(messageToSendToGemini);

    let accumulatedResponse = "";
    for await (const chunk of streamResult.stream) {
      const textChunk = chunk.text();
      if (textChunk) {
        // console.log(`[getAIResponse] Streaming chunk for ${messageId}: "${textChunk}"`); // Verbose log, uncomment if needed
        accumulatedResponse += textChunk;
        await ctx.runMutation(api.chat.appendMessageContent, {
          messageId,
          content: textChunk,
        });
      }
    }
    console.log(`[getAIResponse] Finished streaming for ${messageId}. Total response length: ${accumulatedResponse.length}`);

    await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
      messageId,
      isStreaming: false,
    });
    console.log(`[getAIResponse] Finalized message ${messageId}.`);

    return messageId;
  }
});
