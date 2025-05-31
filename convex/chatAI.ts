"use node";

import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { Id } from "./_generated/dataModel";
import { 
    rankInformationSources, 
    executeToolsByGroup, 
    estimateTokenCount, 
    combineSystemPrompts,
    SystemPrompts // Assuming this interface is exported from agentTools
    // ToolExecutionResult // Assuming this interface is exported from agentTools or defined locally if needed
} from "./agentTools"; // Adjust path if necessary

// --- CONSTANTS ---
const DEFAULT_MODEL_NAME = "gemini-2.5-flash-preview-05-20"; // Or import from agentTools
const STYLING_PROMPT = `Use standard Markdown for formatting your responses.

For document structure:
  - Use ### for section headings (three hash symbols followed by a space)
  - Use #### for subsection headings (four hash symbols followed by a space)
  - Separate paragraphs with a blank line between them for better readability

For emphasis and improved scannability:
  - Use *italic text* for general emphasis
  - Use **bold text** for:
    - Important names, terms, and keywords
    - Key concepts that readers should notice when scanning
    - Critical definitions or technical terms when first introduced
    - Decision points or action items
  - Use ***bold italic text*** for highest priority information or critical warnings

For lists of items:
  - Each item must be on a new line
  - For bulleted lists, consistently start EACH item with \`- \` (a hyphen followed by a space)
  - For numbered lists, consistently start EACH item with \`1. \`, \`2. \`, etc. (a number, a period, then a space)
  - For any list of multiple related items, ALWAYS use proper Markdown list formatting for visual consistency
  - Bold the first few words of list items when they contain distinct concepts to improve scannability

For legal citations and quotes:
  - Use > at the beginning of a line to format direct quotes or legal citations (a greater-than symbol followed by a space)
  - Use \`inline code\` formatting (with backticks) for specific article numbers or section references

For tables (when comparing multiple items):
  | Column 1 | Column 2 | Column 3 |
  | -------- | -------- | -------- |
  | Data     | Data     | Data     |

Always ensure key names, important terms, and critical concepts are in **bold text** to make your response easily scannable.
`;
const CHECK_NEXT_SOURCE_MARKER = "[CHECK_NEXT_SOURCE]";

// Define the structure of the law database for type safety (if not imported)
export interface LawArticle {
  article_number: string;
  article_title?: string;
  content: string | string[];
  source_page_number?: number;
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

// Type for result from agentTools.executeToolsByGroup
// If agentTools.ts doesn't export ToolExecutionResult, define it here or import.
// For simplicity, I'll redefine a compatible subset here.
interface ToolExecutionResult {
  source: string;
  content: string;
  result: string; // Often same as content
  isFullyFormatted: boolean;
  responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL" | "TRY_NEXT_TOOL_AND_ADD_CONTEXT";
  error?: string;
  contextToAdd?: string;
}


// --- HELPER FUNCTIONS ---

// Helper function to ensure a value is a string for safe processing (if not imported)
// const ensureString = (value: any): string => {
//   if (value === null || value === undefined) return "";
//   return String(value);
// };

async function initializeAIResponse(
    ctx: any,
    userId: Id<"users">,
    paneId: string
): Promise<{
    genAI: GoogleGenerativeAI;
    formattedHistory: { role: string; parts: { text: string }[] }[];
    messageId: Id<"messages">;
}> {
    console.log(`[initializeAIResponse] Initializing for user ${userId}, pane ${paneId}.`);
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

    const previousMessages = await ctx.runQuery(api.chat.getMessages, { userId, paneId });
    const formattedHistory = previousMessages.map((msg: { role: string; content: string }) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
    }));
    // console.log("[initializeAIResponse] Formatted conversation history:", JSON.stringify(formattedHistory, null, 2));

    const messageId = await ctx.runMutation(api.chat.createMessage, {
        userId,
        role: "assistant",
        content: "",
        isStreaming: true,
        paneId,
    });
    console.log(`[initializeAIResponse] Created placeholder message ${messageId}.`);
    return { genAI, formattedHistory, messageId };
}

function determineSystemPrompts(
    args: {
        lawPrompt?: string | null;
        tonePrompt?: string | null;
        policyPrompt?: string | null;
        disableSystemPrompt?: boolean | null;
    }
): SystemPrompts | undefined {
    if (args.disableSystemPrompt) {
        console.log("[determineSystemPrompts] System prompts disabled by user setting.");
        return undefined;
    }
    console.log("[determineSystemPrompts] System prompts enabled.");
    return {
        stylingPrompt: STYLING_PROMPT,
        lawPrompt: args.lawPrompt || undefined,
        tonePrompt: args.tonePrompt || undefined,
        policyPrompt: args.policyPrompt || undefined,
    };
}

async function handleNoToolResponseFlow(
    userMessage: string,
    conversationHistory: { role: string; parts: { text: string }[] }[],
    genAI: GoogleGenerativeAI,
    selectedModel: string | undefined,
    systemPrompts: SystemPrompts | undefined, // Use the determined prompts
    ctx: any,
    messageId: Id<"messages">
): Promise<string> {
    console.log(`[handleNoToolResponseFlow] Generating direct response.`);
    await ctx.runMutation(api.chat.updateProcessingPhase, { messageId, phase: "Thinking (No Tools)" });

    const model = genAI.getGenerativeModel({ model: selectedModel || DEFAULT_MODEL_NAME });
    const systemPromptsText = systemPrompts ? combineSystemPrompts(systemPrompts) : "";
    
    let conversationContext = '';
    if (conversationHistory.length > 0) {
      conversationContext = 'Conversation History:\n' + 
        conversationHistory
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.parts[0]?.text}`)
          .join('\n') + '\n\n';
    }

    const directPrompt = `${systemPromptsText}\n\n${conversationContext}User asks: "${userMessage}"\n\nPlease provide a helpful response that answers the question directly, taking into account the conversation history.`;
    
    try {
        const response = await model.generateContent(directPrompt);
        const responseText = response.response.text();
        console.log(`[handleNoToolResponseFlow] Generated response (${responseText.length} chars).`);
        return responseText;
    } catch (error) {
        console.error(`[handleNoToolResponseFlow] Error: ${error}`);
        return "I'm Elixer, your friendly AI assistant. I'm having trouble processing your request right now. How else can I help you?";
    }
}

async function callFinalLLMSynthesis(
    userMessage: string,
    toolContent: string, // Content from the tool execution
    toolSource: string,
    conversationHistory: { role: string; parts: { text: string }[] }[],
    genAI: GoogleGenerativeAI,
    selectedModel: string | undefined,
    systemPrompts: SystemPrompts | undefined // The full SystemPrompts object or undefined
): Promise<string> {
    console.log(`[callFinalLLMSynthesis] Synthesizing final response from source: ${toolSource}`);
    const model = genAI.getGenerativeModel({ model: selectedModel || DEFAULT_MODEL_NAME });

    // Extract search suggestions HTML if present in the tool content
    let searchSuggestionsHtml: string | undefined;
    let cleanedToolContent = toolContent;
    
    // Look for search suggestions in the standardized HTML comment format
    const searchMatch = toolContent.match(/<!-- SEARCH_SUGGESTIONS_HTML:([\s\S]*?) -->/i);
    if (searchMatch) {
        searchSuggestionsHtml = searchMatch[1];
        cleanedToolContent = toolContent.replace(/<!-- SEARCH_SUGGESTIONS_HTML:[\s\S]*? -->/i, '');
        console.log(`[callFinalLLMSynthesis] Extracted search suggestions HTML (${searchSuggestionsHtml.length} chars) from tool content.`);
    }

    // Construct the prompt for final synthesis
    // The systemPrompts (which include STYLING_PROMPT) are combined by combineSystemPrompts
    const systemPromptsText = systemPrompts ? combineSystemPrompts(systemPrompts) : STYLING_PROMPT; // Ensure styling if others disabled

    let messageToSendToGemini = `${systemPromptsText}\n\nAnswer the user's question based on the information provided.\n\nUser question: "${userMessage}"\n`;

    if (conversationHistory.length > 0) {
        messageToSendToGemini += "\nConversation history:\n";
        conversationHistory.forEach(msg => {
            const preview = msg.parts[0]?.text.length > 150 ? `${msg.parts[0]?.text.substring(0, 150)}...` : msg.parts[0]?.text;
            messageToSendToGemini += `- ${msg.role === "user" ? "User" : "Assistant"}: "${preview}"\n`;
        });
    }
    messageToSendToGemini += `\nInformation found from ${toolSource}:\n${cleanedToolContent}\n\nProvide a comprehensive and helpful response.`;

    const promptTokens = estimateTokenCount(messageToSendToGemini);
    console.log(`[callFinalLLMSynthesis] Sending prompt to Gemini. Length: ${messageToSendToGemini.length} chars, ~${promptTokens} tokens`);
    
    const result = await model.generateContent(messageToSendToGemini);
    let responseText = result.response.text();

    // Add search suggestions back to the response if they were present
    if (searchSuggestionsHtml && !responseText.includes("<!-- SEARCH_SUGGESTIONS_HTML:")) {
        responseText += `\n\n<!-- SEARCH_SUGGESTIONS_HTML:${searchSuggestionsHtml} -->`;
        console.log(`[callFinalLLMSynthesis] Re-added search suggestions HTML to final response.`);
    }

    const responseTokens = estimateTokenCount(responseText);
    console.log(`[callFinalLLMSynthesis] Final response generated. Length: ${responseText.length} chars, ~${responseTokens} tokens`);
    return responseText;
}

function extractSearchSuggestions(responseText: string): { finalContent: string, searchSuggestionsHtml?: string } {
    const match = responseText.match(/<!-- SEARCH_SUGGESTIONS_HTML:(.+?) -->/s);
    if (match && match[1]) {
        const html = match[1];
        const cleaned = responseText.replace(/<!-- SEARCH_SUGGESTIONS_HTML:.+? -->/s, "").trim();
        console.log(`[extractSearchSuggestions] Found search suggestions HTML (${html.length} chars).`);
        return { finalContent: cleaned, searchSuggestionsHtml: html };
    }
    return { finalContent: responseText, searchSuggestionsHtml: undefined };
}

async function processQueryWithTools(
    args: {
        userMessage: string;
        selectedModel?: string | null;
        paneId: string;
        disableSystemPrompt?: boolean | null; // Added from main args
    },
    { genAI, formattedHistory, messageId }: {
        genAI: GoogleGenerativeAI;
        formattedHistory: { role: string; parts: { text: string }[] }[];
        messageId: Id<"messages">;
    },
    systemPromptsToUse: SystemPrompts | undefined,
    ctx: any
): Promise<{ finalContent: string; searchSuggestionsHtml?: string }> {
    console.log("[processQueryWithTools] Starting tool-based processing.");

    // 1. Rank information sources
    const rankingResult = await rankInformationSources(
        args.userMessage,
        formattedHistory,
        args.selectedModel || undefined,
        genAI,
        systemPromptsToUse // Pass the determined system prompts
    );
    console.log(`[processQueryWithTools] Ranked tool groups: ${JSON.stringify(rankingResult.rankedToolGroups)}`);

    // 2. Fast path: Direct response from ranking if `no_tool` is first and response provided
    if (rankingResult.rankedToolGroups.length > 0 &&
        rankingResult.rankedToolGroups[0].length === 1 &&
        rankingResult.rankedToolGroups[0][0] === "no_tool" &&
        rankingResult.directResponse) {
        console.log(`[processQueryWithTools] OPTIMIZATION: Using direct response from ranking (${rankingResult.directResponse.length} chars).`);
        await ctx.runMutation(api.chat.updateProcessingPhase, { messageId, phase: "Thinking (Direct)" });
        return { finalContent: rankingResult.directResponse };
    }

    // 3. Execute tools by group
    let toolExecutionResult = await executeToolsByGroup(
        rankingResult.rankedToolGroups,
        args.userMessage,
        ctx,
        genAI,
        args.selectedModel || undefined,
        formattedHistory,
        systemPromptsToUse, // Pass determined system prompts to tool execution
        messageId
    );
    console.log(`[processQueryWithTools] Initial tool execution completed. Source: ${toolExecutionResult.source}, ResponseType: ${toolExecutionResult.responseType}`);

    // 4. Handle pre-formatted final answers from tools
    if (toolExecutionResult.isFullyFormatted && toolExecutionResult.responseType === "FINAL_ANSWER") {
        console.log(`[processQueryWithTools] Using pre-formatted response from ${toolExecutionResult.source}.`);
        return extractSearchSuggestions(toolExecutionResult.content);
    }
    
    // 5. Handle TRY_NEXT_TOOL_AND_ADD_CONTEXT response type
    let accumulatedContext = "";
    if (toolExecutionResult.responseType === "TRY_NEXT_TOOL_AND_ADD_CONTEXT" && toolExecutionResult.contextToAdd) {
        console.log(`[processQueryWithTools] Received TRY_NEXT_TOOL_AND_ADD_CONTEXT with context of ${toolExecutionResult.contextToAdd.length} chars.`);
        accumulatedContext = toolExecutionResult.contextToAdd;

        // Determine next group of tools to try
        const remainingGroups = rankingResult.rankedToolGroups.slice(1);
        
        if (remainingGroups.length > 0) {
            console.log(`[processQueryWithTools] Trying next tool group with context: ${JSON.stringify(remainingGroups[0])}`);
            
            // Execute the next tool group with the accumulated context
            toolExecutionResult = await executeToolsByGroup(
                remainingGroups,
                args.userMessage,
                ctx,
                genAI,
                args.selectedModel || undefined,
                formattedHistory,
                systemPromptsToUse,
                messageId,
                accumulatedContext
            );
            
            console.log(`[processQueryWithTools] Next tool execution completed with context. Source: ${toolExecutionResult.source}, ResponseType: ${toolExecutionResult.responseType}`);
        }
    }

    // 6. Synthesize final response or handle "CHECK_NEXT_SOURCE"
    //    The synthesis step uses systemPromptsToUse for persona, styling etc.
    let currentResponseContent = await callFinalLLMSynthesis(
        args.userMessage,
        toolExecutionResult.content,
        toolExecutionResult.source,
        formattedHistory,
        genAI,
        args.selectedModel || undefined,
        systemPromptsToUse
    );

    // 7. Handle "CHECK_NEXT_SOURCE" loop
    // This logic is simplified. If CHECK_NEXT_SOURCE is found, we assume the *next group* in rankingResult.rankedToolGroups.
    // A more robust implementation might need to track which tools were actually in the group that returned CHECK_NEXT_SOURCE.
    if (currentResponseContent.includes(CHECK_NEXT_SOURCE_MARKER)) {
        console.log(`[processQueryWithTools] AI indicated CHECK_NEXT_SOURCE.`);
        currentResponseContent = currentResponseContent.replace(CHECK_NEXT_SOURCE_MARKER, "").trim();
        
        await ctx.runMutation(api.chat.appendMessageContent, {
            messageId,
            content: currentResponseContent + "\n\n*Checking additional sources...*", // Append initial part
        });

        // Determine next group of tools to try. This assumes rankedToolGroups has more groups.
        const firstGroup = rankingResult.rankedToolGroups[0];
        const remainingGroups = rankingResult.rankedToolGroups.slice(1);

        if (remainingGroups.length > 0) {
            console.log(`[processQueryWithTools] Trying next tool group: ${JSON.stringify(remainingGroups[0])}`);
            toolExecutionResult = await executeToolsByGroup(
                remainingGroups, // Pass all remaining groups to executeToolsByGroup
                args.userMessage,
                ctx,
                genAI,
                args.selectedModel || undefined,
                formattedHistory,
                systemPromptsToUse, // System prompts for tool execution
                messageId
            );

            // Append content from the next tool execution for synthesis
            // The synthesis step uses systemPromptsToUse for persona, styling etc.
            currentResponseContent += `\n\n*Information from ${toolExecutionResult.source}:*\n${toolExecutionResult.content}`;

            // Re-synthesize with the new information.
            // The prompt to callFinalLLMSynthesis will now contain combined info.
            const combinedToolContent = currentResponseContent; // This now has initial + new tool's raw output
            const combinedToolSource = "multiple sources (checked next)";

            currentResponseContent = await callFinalLLMSynthesis(
                args.userMessage,
                combinedToolContent, 
                combinedToolSource,
                formattedHistory,
                genAI,
                args.selectedModel || undefined,
                systemPromptsToUse // System prompts for final synthesis
            );
            // Override the existing message content with the fully synthesized one
            await ctx.runMutation(api.chat.appendMessageContent, { // Assumes updateMessageContent exists
                 messageId,
                 content: currentResponseContent,
            });


        } else {
            console.log("[processQueryWithTools] CHECK_NEXT_SOURCE indicated, but no more tool groups to try.");
            // The currentResponseContent (without marker) will be used.
            // Update message to remove "Checking additional sources..." if it was the last thing
             await ctx.runMutation(api.chat.appendMessageContent, {
                 messageId,
                 content: currentResponseContent,
             });
        }
    }
    
    return extractSearchSuggestions(currentResponseContent);
}


// --- MAIN ACTION ---
export const getAIResponse = action({
  // Return type annotation for the action
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
    handler: async (ctx, args): Promise<Id<"messages">> => {
        const { userMessage, userId, selectedModel, paneId, disableSystemPrompt, disableTools } = args;
        console.log(`[getAIResponse] START User: ${userId}, Pane: ${paneId}, DisableSysPrompt: ${!!disableSystemPrompt}, DisableTools: ${!!disableTools}, Model: ${selectedModel || DEFAULT_MODEL_NAME}, Msg: "${userMessage.substring(0,50)}..."`);
        
        let messageId: Id<"messages"> | null = null;

        try {
            // 1. Initialize (fetch history, create placeholder message)
            const initData = await initializeAIResponse(ctx, userId, paneId);
            messageId = initData.messageId;

            // 2. Determine system prompts to use
            const systemPromptsToUse = determineSystemPrompts(args);

            // 3. Process query (either no-tool flow or tool-based flow)
            let responseData: { finalContent: string; searchSuggestionsHtml?: string };

            if (disableTools) {
                const content = await handleNoToolResponseFlow(
                    userMessage,
                    initData.formattedHistory,
                    initData.genAI,
                    selectedModel || undefined,
                    systemPromptsToUse, // Pass determined prompts
                    ctx,
                    messageId
                );
                responseData = { finalContent: content };
            } else {
                responseData = await processQueryWithTools(
                    args, // Pass all relevant args
                    initData,
                    systemPromptsToUse, // Pass determined prompts
                    ctx
                );
            }

            // 4. Finalize message in database
            await ctx.runMutation(api.chat.appendMessageContent, { // Using updateMessageContent instead of append
                messageId,
                content: responseData.finalContent,
            });

            if (responseData.searchSuggestionsHtml) {
                await ctx.runMutation(api.chat.updateMessageMetadata, {
                    messageId,
                    metadata: { searchSuggestionsHtml: responseData.searchSuggestionsHtml },
                });
            }

            await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
                messageId,
                isStreaming: false,
            });

            console.log(`[getAIResponse] SUCCESS Finalized message ${messageId}.`);
            return messageId;

        } catch (error: any) {
            console.error("[getAIResponse] Top-level error:", error.message, error.stack);
            const errorMessage = "I'm sorry, I encountered an unexpected error while processing your request. Please try again.";

            if (messageId) {
                try {
                    await ctx.runMutation(api.chat.appendMessageContent, { messageId, content: errorMessage });
                    await ctx.runMutation(api.chat.updateMessageStreamingStatus, { messageId, isStreaming: false });
                } catch (updateError) {
                    console.error("[getAIResponse] Error updating message with error state:", updateError);
                }
            } else {
                // If messageId was never created (error in initializeAIResponse)
                try {
                    messageId = await ctx.runMutation(api.chat.createMessage, {
                        userId,
                        role: "assistant",
                        content: errorMessage,
                        isStreaming: false,
                        paneId,
                    });
                } catch (createError) {
                     console.error("[getAIResponse] Error creating error message:", createError);
                     // If we can't even save an error message, we might just have to let Convex handle the action failure.
                     // Or throw a new ConvexError to ensure client gets some feedback.
                     throw new ConvexError("Failed to process request and failed to save error message.");
                }
            }
            // Depending on how you want to handle errors client-side,
            // you might return the messageId of the error message, or re-throw.
            // Returning messageId allows client to see the error message in chat.
            if (!messageId) {
                 // This case should be rare if the above logic is correct
                 throw new ConvexError("Critical error: No message ID available after failure.");
            }
            return messageId;
        }
    },
});