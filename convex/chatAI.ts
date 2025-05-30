"use node";

import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { Id } from "./_generated/dataModel";
import { rankInformationSources, executeToolsByGroup, estimateTokenCount } from "./agentTools";

// --- Hardcoded Prompts ---
const STYLING_PROMPT = `Use standard Markdown for formatting your responses.

For document structure:
  - Use ### for section headings (three hash symbols followed by a space)
  - Use #### for subsection headings (four hash symbols followed by a space)
  - Separate paragraphs with a blank line between them for better readability

For emphasis (making text stand out):
  - Use *italic text* for italics (single asterisks surrounding the text)
  - Use **bold text** for bold (double asterisks surrounding the text)
  - Use ***bold italic text*** for important points or legal definitions

For lists of items:
  - Each item must be on a new line
  - For bulleted lists, consistently start EACH item with \`- \` (a hyphen followed by a space)
  - For numbered lists, consistently start EACH item with \`1. \`, \`2. \`, etc. (a number, a period, then a space)
  - For any list of multiple related items, ALWAYS use proper Markdown list formatting for visual consistency

For legal citations and quotes:
  - Use > at the beginning of a line to format direct quotes or legal citations (a greater-than symbol followed by a space)
  - Use \`inline code\` formatting (with backticks) for specific article numbers or section references

For tables (when comparing multiple items):
  | Column 1 | Column 2 | Column 3 |
  | -------- | -------- | -------- |
  | Data     | Data     | Data     |
`;


// Define the structure of the law database for type safety
export interface LawArticle {
  article_number: string;
  article_title?: string;
  content: string | string[];
  source_page_number?: number;
  
  // Keep these fields as optional for backward compatibility
  points?: string[];
  definitions?: { [key: string]: string };
  sub_types?: { type: string; description: string }[];
  prohibitions?: string[];
  business_types?: string[];
  priority_order?: string[];
  conditions?: string[];
  punishments?: string[];
  punishment_natural_person?: string;
  punishment_legal_person?: string;
}

export interface LawSection {
  section_number: string;
  section_title: string;
  articles: LawArticle[];
}

export interface LawChapter {
  chapter_number: string;
  chapter_title: string;
  articles?: LawArticle[];
  sections?: LawSection[];
}

export interface LawDatabase {
  metadata: any;
  preamble: string[];
  chapters: LawChapter[];
}

// Helper function to ensure a value is a string for safe processing
const ensureString = (value: any): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

export const getAIResponse = action({
  args: {
    userMessage: v.string(),
    userId: v.id("users"),
    lawPrompt: v.optional(v.string()),
    tonePrompt: v.optional(v.string()),
    policyPrompt: v.optional(v.string()),
    selectedModel: v.optional(v.string()),
    paneId: v.string(),
    disableSystemPrompt: v.optional(v.boolean()),
    disableTools: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args
  ): Promise<Id<"messages">> => {
    const { userMessage, userId, lawPrompt, tonePrompt, policyPrompt, selectedModel, paneId, disableSystemPrompt, disableTools } = args;
    console.log(`[getAIResponse] Received request for user ${userId}. Message: "${userMessage}". Selected Model: "${selectedModel || "gemini-2.5-flash-preview-04-17"}". Pane ID: "${paneId}". Disable System Prompt: ${!!disableSystemPrompt}. Disable Tools: ${!!disableTools}`);
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

    // Correct instantiation of Tool and GoogleSearch
    const googleSearchTool = {
      googleSearch: {},
    };

    let lawDatabaseContextForLLM = "";
    let lawDatabaseInfoForSystemPrompt = "Law database was not accessed for this query.";
    let webSearchInfoForSystemPrompt = "Web search was not performed for this query.";
    let searchSuggestionsHtml = ""; // To store the renderedContent from groundingMetadata

    let messageId: Id<"messages"> | null = null; // Initialize messageId as nullable

    try {
      const previousMessages = await ctx.runQuery(api.chat.getMessages, { userId: userId, paneId: paneId }); // Pass paneId to getMessages
      const formattedHistory = previousMessages.map((msg: { role: string; content: string }) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));
      console.log("[getAIResponse] Formatted conversation history:", JSON.stringify(formattedHistory, null, 2));

      // Skip the old decideInformationSource function and directly use our new agent-based approach
      console.log("[getAIResponse] Using new agent-based approach directly");
      
      // Set default values for the system prompt
      lawDatabaseInfoForSystemPrompt = "Using agent-based approach to determine the most relevant information sources.";
      webSearchInfoForSystemPrompt = "Using agent-based approach to determine if web search is needed.";
      
      // We'll handle the tool selection in the agent-based approach

      // Agent-based approach: Rank information sources and execute tools sequentially
      console.log("[getAIResponse] Using new agent-based approach with tool calling");
      
      // Initialize the model
      const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
      
      // 1. Create a placeholder message for streaming
      messageId = await ctx.runMutation(api.chat.createMessage, {
        userId,
        role: "assistant",
        content: "",
        isStreaming: true,
        paneId,
      });
      console.log(`[getAIResponse] Created placeholder message ${messageId} for streaming response.`);
      
      // 2. Rank information sources to determine tool calling order
      // If disableTools is true, we should skip tool calls and just use the model directly
      let rankingResult;
      if (disableTools) {
        console.log(`[getAIResponse] Tools disabled by user setting, using only no_tool`);
        rankingResult = { rankedToolGroups: [["no_tool"]] };
      } else {
        // Only pass system prompts if they're not disabled
        const systemPromptsToUse = disableSystemPrompt ? undefined : {
          stylingPrompt: STYLING_PROMPT,
          lawPrompt: lawPrompt,
          tonePrompt: tonePrompt,
          policyPrompt: policyPrompt
        };
        
        console.log(`[getAIResponse] System prompts ${disableSystemPrompt ? 'disabled' : 'enabled'} by user setting`);
        
        rankingResult = await rankInformationSources(
          userMessage,
          formattedHistory,
          selectedModel,
          genAI,
          systemPromptsToUse
        );
      }
      
      const { rankedToolGroups, directResponse } = rankingResult;
      
      // Log the ranked tool groups
      console.log(`[getAIResponse] Ranked tool groups: ${JSON.stringify(rankedToolGroups)}`);
      
      // Fast path: If no_tool is ranked first and we have a direct response, use it immediately
      // The rankInformationSources function already includes conversation history in the prompt
      if (rankedToolGroups.length > 0 && rankedToolGroups[0].length === 1 && rankedToolGroups[0][0] === "no_tool" && directResponse) {
        console.log(`[getAIResponse] OPTIMIZATION: Using direct response from ranking call (${directResponse.length} chars)`);
        
        // Set appropriate processing phase for the direct response path
        await ctx.runMutation(api.chat.updateProcessingPhase, {
          messageId,
          phase: "Thinking"
        });
        console.log(`[getAIResponse] Fast path - set processing phase to: Thinking`);
        
        // Update the message with the direct response
        await ctx.runMutation(api.chat.appendMessageContent, {
          messageId,
          content: directResponse,
        });
        
        // Mark the message as no longer streaming
        await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
          messageId,
          isStreaming: false,
        });
        
        // Important: For the fast path, we need to make sure the message gets properly
        // recognized as a streamed message in the frontend before it's marked as done.
        // This ensures the local pending indicator gets properly turned off.
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log(`[getAIResponse] Finalized message ${messageId} with direct response from ranking call.`);
        return messageId;
      }
      
      // Define the types for tool results
      type BasicToolResult = { source: string; result: string; };
      type ExtendedToolResult = BasicToolResult & { 
        isFullyFormatted: boolean; 
        responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL";
      };
      
      // 3. Execute tools by priority groups, with parallel execution within groups
      console.log(`[getAIResponse] Using new parallel tool execution with ${rankedToolGroups.length} groups`);
      
      const toolResults = await executeToolsByGroup(
        rankedToolGroups,
        userMessage,
        ctx,
        genAI,
        selectedModel,
        formattedHistory, // Pass conversation history for context-aware tool execution
        // Only pass system prompts if they're not disabled
        disableSystemPrompt ? undefined : {
          stylingPrompt: STYLING_PROMPT,
          lawPrompt: lawPrompt,
          tonePrompt: tonePrompt,
          policyPrompt: policyPrompt
        },
        messageId // Pass messageId to update processing phase
      );
      
      // Cast toolResults to the basic type first to ensure we can access source and result
      const basicResults = toolResults as BasicToolResult;
      
      console.log(`[getAIResponse] Tool execution completed. Source: ${basicResults.source}, Result length: ${basicResults.result.length}`);

      // 4. Generate the final answer based on tool results
      // Check if system prompt is disabled
      console.log(`[getAIResponse] System prompt disabled: ${disableSystemPrompt}`);
      
      let dynamicPrompts = "";
      if (!disableSystemPrompt) {
        dynamicPrompts = [
          lawPrompt,
          policyPrompt,
          tonePrompt,
        ].filter(Boolean).join("\n\n");
      }

      // Build the final system instruction based on whether system prompt is disabled
      let finalSystemInstruction = `You are a helpful assistant.
${STYLING_PROMPT}
// The prompt above defines how you MUST format your output using Markdown. Adhere to it strictly.
`;
      
      // Only include these parts if system prompt is not disabled
      if (!disableSystemPrompt) {
        finalSystemInstruction += `
${dynamicPrompts}
// The dynamic prompts above define your general persona, legal constraints, and company policies.
`;
      }
      
      // Always include these parts regardless of system prompt setting

      console.log("[getAIResponse] Final System Instruction (first 500 chars):", finalSystemInstruction.substring(0, 500) + "...");

      // Note: We already created the message placeholder and ranked tools above
      // No need to create another chat session or message placeholder

      // Check if toolResults has the new properties (isFullyFormatted and responseType)
      // This is for backward compatibility with older versions of executeToolsSequentially
      const hasExtendedProperties = 'isFullyFormatted' in basicResults && 'responseType' in basicResults;
      const extendedResults = hasExtendedProperties ? (basicResults as ExtendedToolResult) : null;
      
      // If the tool result is fully formatted and is a final answer, use it directly
      if (hasExtendedProperties && 
          extendedResults && 
          extendedResults.isFullyFormatted && 
          extendedResults.responseType === "FINAL_ANSWER") {
        // For fully formatted tools, we can use the result directly without additional processing
        console.log(`[getAIResponse] Using pre-formatted response from ${basicResults.source} directly`);
        
        // Update the message with the final response directly
        await ctx.runMutation(api.chat.appendMessageContent, {
          messageId,
          content: basicResults.result,
        });
        
        // Mark the message as no longer streaming
        await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
          messageId,
          isStreaming: false,
        });
        
        console.log(`[getAIResponse] Finalized message ${messageId} with pre-formatted response from ${basicResults.source}.`);
        return messageId;
      }
      
      // For non-formatted responses or TRY_NEXT_TOOL responses, we need to generate a response
      let messageToSendToGemini = "";
      
      // For backward compatibility with the old implementation
      if (!hasExtendedProperties && basicResults.source === "no_tool") {
        // For no_tool in old implementation, we can use the result directly
        console.log("[getAIResponse] Using no_tool response directly (legacy path)");
        
        // Update the message with the final response directly
        await ctx.runMutation(api.chat.appendMessageContent, {
          messageId,
          content: basicResults.result,
        });
        
        // Mark the message as no longer streaming
        await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
          messageId,
          isStreaming: false,
        });
        
        console.log(`[getAIResponse] Finalized message ${messageId} with no_tool response.`);
        return messageId;
      } else {
        // For other sources or non-final answers, generate a response based on the information found
        // Include system prompts in the final response generation
        // Only use the tonePrompt from the sidebar when available, with no hardcoded defaults
        const identityPrompt = tonePrompt ? 
          `IDENTITY AND PERSONALITY:\n${tonePrompt}\n\n` : 
          '';
        
        const policyPromptText = policyPrompt ? `COMPANY POLICY:\n${policyPrompt}\n\n` : '';
        const lawPromptText = lawPrompt ? `LAWS AND REGULATIONS:\n${lawPrompt}\n\n` : '';
        
        // Only include system prompts if not disabled
        const promptPrefix = disableSystemPrompt ? '' : `${identityPrompt}${policyPromptText}${lawPromptText}`;
        
        messageToSendToGemini = `
${promptPrefix}

Answer the user's question based on the information provided.

User question: "${userMessage}"

`;
        
        // Include full conversation history
        if (formattedHistory && formattedHistory.length > 0) {
          messageToSendToGemini += "Conversation history:\n";
          for (const msg of formattedHistory) {
            if (msg.role === "user") {
              messageToSendToGemini += `- User: "${msg.parts[0]?.text}"\n`;
            } else if (msg.role === "model") {
              // Include a summarized version of system responses to avoid token limits
              const responsePreview = msg.parts[0]?.text.length > 100 
                ? `${msg.parts[0]?.text.substring(0, 100)}...` 
                : msg.parts[0]?.text;
              messageToSendToGemini += `- System: "${responsePreview}"\n`;
            }
          }
          messageToSendToGemini += "\n";
        }
        
        // Add information from the current tool
        messageToSendToGemini += `Information found from ${basicResults.source}:\n${basicResults.result}\n\nProvide a comprehensive and helpful response.`;
      }

      console.log(`[getAIResponse] Sending to Gemini for response generation (first 500 chars): "${messageToSendToGemini.substring(0,500)}..."`);
      console.log("[getAIResponse] Initiating Gemini API call for final response...");
      
      // Log token estimation for prompt sent to model
      const promptTokens = estimateTokenCount(messageToSendToGemini);
      console.log(`[getAIResponse] Sending prompt to Gemini. Length: ${messageToSendToGemini.length} chars, ~${promptTokens} tokens`);
      
      // If this came from a database and we have multiple tools, ask the AI if it needs to check another source
      if (toolResults.source.startsWith('query_') && rankedToolGroups.flat().length > 1) {
        // Add a check to see if the AI should continue searching other databases
        const checkMoreSources = `\n\n--- IMPORTANT INSTRUCTION FOR AI ONLY ---\nBased on the information from ${toolResults.source}, can you find the specific information about "${userMessage}"?\nIf you found the exact information requested, respond with your normal answer.\nIf you CANNOT find the specific information requested, add this EXACT text at the end of your response: \"[CHECK_NEXT_SOURCE]\"\n--- END OF INSTRUCTION ---`;
        
        // Add this instruction to the message without telling the user
        messageToSendToGemini += checkMoreSources;
      }
      
      // Generate the final response with the model
      const finalResult = await model.generateContent(messageToSendToGemini);
      let finalResponse = finalResult.response.text();
      
      // Log token estimation for generated response
      const responseTokens = estimateTokenCount(finalResponse);
      console.log(`[getAIResponse] Final response generated. Length: ${finalResponse.length} chars, ~${responseTokens} tokens`);
      console.log(`[getAIResponse] Total tokens for this exchange: ~${promptTokens + responseTokens} tokens`);
      
      // Check if we need to try another source
      if (finalResponse.includes('[CHECK_NEXT_SOURCE]')) {
        console.log(`[getAIResponse] AI indicated it needs to check additional sources`);
        
        // Remove the special marker
        finalResponse = finalResponse.replace('[CHECK_NEXT_SOURCE]', '');
        
        // Try the next source if available
        const allTools = rankedToolGroups.flat();
        if (allTools.length > 1) {
          const nextTools = allTools.slice(1); // Remove the first tool we already tried
          console.log(`[getAIResponse] Trying next source in ranking: ${nextTools[0]}`);
          
          // Store message indicating we're checking more sources
          await ctx.runMutation(api.chat.appendMessageContent, {
            messageId,
            content: "\n\n*Checking additional sources...*"
          });
          
          // Execute next tool
          console.log(`[getAIResponse] Executing next tool: ${nextTools[0]}`);
          const nextToolResults = await executeToolsByGroup(
            [nextTools], // Wrap in array since executeToolsByGroup expects groups
            userMessage,
            ctx,
            genAI,
            selectedModel,
            formattedHistory, // Pass conversation history for context-aware tool execution
            undefined, // No system prompts needed here
            messageId // Pass messageId for updating processing phase
          );
          
          // Prepare message for next tool result with full conversation context
          // Include system prompts in the next tool response generation
          // Only use the tonePrompt from the sidebar when available, with no hardcoded defaults
          const nextIdentityPrompt = tonePrompt ? 
            `IDENTITY AND PERSONALITY:\n${tonePrompt}\n\n` : 
            '';
          
          const nextPolicyPromptText = policyPrompt ? `COMPANY POLICY:\n${policyPrompt}\n\n` : '';
          const nextLawPromptText = lawPrompt ? `LAWS AND REGULATIONS:\n${lawPrompt}\n\n` : '';
          
          // Only include system prompts if not disabled
          const nextPromptPrefix = disableSystemPrompt ? '' : `${nextIdentityPrompt}${nextPolicyPromptText}${nextLawPromptText}`;
          
          let nextMessageToSendToGemini = `
${nextPromptPrefix}

Answer the user's question based on the information provided.

User question: "${userMessage}"

`;
          
          // Include full conversation history
          if (formattedHistory && formattedHistory.length > 0) {
            nextMessageToSendToGemini += "Conversation history:\n";
            for (const msg of formattedHistory) {
              if (msg.role === "user") {
                nextMessageToSendToGemini += `- User: "${msg.parts[0]?.text}"\n`;
              } else if (msg.role === "model") {
                // Include a summarized version of system responses to avoid token limits
                const responsePreview = msg.parts[0]?.text.length > 100 
                  ? `${msg.parts[0]?.text.substring(0, 100)}...` 
                  : msg.parts[0]?.text;
                nextMessageToSendToGemini += `- System: "${responsePreview}"\n`;
              }
            }
            nextMessageToSendToGemini += "\n";
          }
          
          // Add the information from the current tool
          nextMessageToSendToGemini += `Information found from ${nextToolResults.source}:\n${nextToolResults.result}\n`;
          
          // Log token estimation
          const nextPromptTokens = estimateTokenCount(nextMessageToSendToGemini);
          console.log(`[getAIResponse] Sending next source prompt to Gemini. Length: ${nextMessageToSendToGemini.length} chars, ~${nextPromptTokens} tokens`);
          
          // Generate response with next tool
          const nextFinalResult = await model.generateContent(nextMessageToSendToGemini);
          const nextFinalResponse = nextFinalResult.response.text();
          
          // Log token usage for next tool
          const nextResponseTokens = estimateTokenCount(nextFinalResponse);
          console.log(`[getAIResponse] Next source response generated. Length: ${nextFinalResponse.length} chars, ~${nextResponseTokens} tokens`);
          console.log(`[getAIResponse] Additional tokens for next source: ~${nextPromptTokens + nextResponseTokens} tokens`);
          
          // Replace the current message content with the next result
          // First clear the current content by creating a replacement message
          await ctx.runMutation(api.chat.appendMessageContent, {
            messageId,
            content: "\n\n*Information from next source:*\n\n" + nextFinalResponse
          });
          
          // If we have search suggestions HTML in the response, extract and store it
          const nextSearchSuggestionsMatch = nextFinalResponse.match(/<!-- SEARCH_SUGGESTIONS_HTML:(.+?) -->/s);
          if (nextSearchSuggestionsMatch && nextSearchSuggestionsMatch[1]) {
            // Extract the search suggestions HTML
            const nextSearchSuggestionsHtml = nextSearchSuggestionsMatch[1];
            console.log(`[getAIResponse] Found search suggestions HTML from next source of length: ${nextSearchSuggestionsHtml.length}`);
            
            // Store it in the message metadata
            await ctx.runMutation(api.chat.updateMessageMetadata, {
              messageId,
              metadata: {
                searchSuggestionsHtml: nextSearchSuggestionsHtml
              }
            });
          }
          
          // Mark the message as no longer streaming - this is critical to ensure the message is displayed
          await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
            messageId,
            isStreaming: false,
          });
          
          console.log(`[getAIResponse] Finalized message after checking additional sources: ${messageId}.`);
          return messageId;
        }
      }
      
      // Check if the response contains search suggestions HTML
      const searchSuggestionsMatch = finalResponse.match(/<!-- SEARCH_SUGGESTIONS_HTML:(.+?) -->/s);
      let searchSuggestionsHtml = "";
      
      if (searchSuggestionsMatch && searchSuggestionsMatch[1]) {
        // Extract the search suggestions HTML
        searchSuggestionsHtml = searchSuggestionsMatch[1];
        console.log(`[getAIResponse] Found search suggestions HTML of length: ${searchSuggestionsHtml.length}`);
        
        // Remove the HTML comment from the response
        finalResponse = finalResponse.replace(/<!-- SEARCH_SUGGESTIONS_HTML:.+? -->/s, "");
      }
      
      // Update the message with the final response
      await ctx.runMutation(api.chat.appendMessageContent, {
        messageId,
        content: finalResponse,
      });
      
      // If we have search suggestions HTML, store it in the message metadata
      if (searchSuggestionsHtml) {
        await ctx.runMutation(api.chat.updateMessageMetadata, {
          messageId,
          metadata: {
            searchSuggestionsHtml
          }
        });
      }
      
      // Mark the message as no longer streaming
      await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
        messageId,
        isStreaming: false,
      });
      
      console.log(`[getAIResponse] Finalized message ${messageId}.`);
      return messageId;
    } catch (error) {
      console.error("[getAIResponse] Error in agent-based approach:", error);
      
      // Create a fallback message if we encountered an error
      if (messageId === null) {
        messageId = await ctx.runMutation(api.chat.createMessage, {
          userId,
          role: "assistant",
          content: "I'm sorry, I encountered an error while processing your request. Please try again.",
          isStreaming: false,
          paneId,
        });
      } else {
        // Update the existing message with an error notice
        await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
          messageId,
          isStreaming: false,
        });
        await ctx.runMutation(api.chat.appendMessageContent, {
          messageId,
          content: "I'm sorry, I encountered an error while processing your request. Please try again.",
        });
      }
      
      return messageId;
    }
  },
});
