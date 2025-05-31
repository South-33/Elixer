"use node";

import { GoogleGenerativeAI, GenerateContentResult } from "@google/generative-ai";
import { api } from "./_generated/api";
import { LawDatabase, LawChapter, LawSection, LawArticle } from "./chatAI";

// Simple utility to estimate token count (rough approximation)
export const estimateTokenCount = (text: string): number => {
  // A very rough estimate: 1 token is about 4 characters for English text
  // This is just an approximation - actual tokenization varies by model
  return Math.ceil(text.length / 4);
};

// Type definitions for handling Google Search responses
interface SearchEntryPoint {
  renderedContent: string;
}

interface GroundingMetadata {
  searchEntryPoint?: SearchEntryPoint;
}

// We'll use any for the tools to avoid TypeScript errors
type GenAITool = any;

// Tool interface definitions
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// Available tools for the agent
export const AVAILABLE_TOOLS: Tool[] = [
  {
    name: "no_tool",
    description: "Answer directly without using any specialized database or search",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The user's query to answer directly"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "query_law_on_insurance",
    description: "Query the Law on Insurance database for legal information",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The specific query to search for in the insurance law database"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "query_law_on_consumer_protection",
    description: "Query the Law on Consumer Protection database for legal information",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The specific query to search for in the consumer protection law database"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "query_insurance_qna",
    description: "Query the Insurance Q&A database for common questions and answers",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The specific question to search for in the Q&A database"
        }
      },
      required: ["query"]
    }
  },
  // Removed query_all_databases tool as we now support parallel execution of relevant tools
  {
    name: "search_web",
    description: "Search the web for general information not found in specialized databases",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query for the web"
        }
      },
      required: ["query"]
    }
  }
];

// Helper function to ensure a value is a string for safe processing
const ensureString = (value: any): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

// Query a law database and return relevant information based on the query
export const queryLawDatabase = async (
  query: string, 
  lawDatabase: any, // Allow any type to support different database formats
  conversationHistory?: { role: string; parts: { text: string; }[] }[]
): Promise<string> => {
  // Just return the raw database as JSON without any validation
  if (!lawDatabase) {
    return "The database is empty or could not be accessed.";
  }
  
  // Log basic database info
  const dbSize = JSON.stringify(lawDatabase).length;
  console.log(`[queryLawDatabase] Processing database with ${dbSize} chars of content`);
  
  // Log conversation history for context (just for logging purposes)
  if (conversationHistory && conversationHistory.length > 0) {
    console.log(`[queryLawDatabase] Including conversation context with ${conversationHistory.length} messages`);
  }
  
  // Return the entire database for the AI to process
  return JSON.stringify(lawDatabase, null, 2);
};

// Return type for rankInformationSources that includes optional direct response
interface RankingResult {
  rankedToolGroups: string[][];
  directResponse?: string;
}

// Function to rank information sources based on user query
export const rankInformationSources = async (
  userMessage: string,
  history: { role: string; parts: { text: string; }[] }[],
  selectedModel: string | undefined,
  genAI: GoogleGenerativeAI,
  systemPrompts?: {
    stylingPrompt?: string,
    lawPrompt?: string,
    tonePrompt?: string,
    policyPrompt?: string
  }
): Promise<RankingResult> => {
  console.log(`[rankInformationSources] Ranking tools for query: '${userMessage.substring(0, 50)}${userMessage.length > 50 ? "..." : ""}'`);
  console.log(`[rankInformationSources] History has ${history.length} messages`);
  console.log(`[rankInformationSources] Using model: ${selectedModel || "gemini-2.5-flash-preview-04-17"}`);
  
  const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
  
  // Skip the initial classification step and go straight to ranking all tools
  // This is more efficient and avoids an extra AI call
  console.log(`[rankInformationSources] Starting direct tool ranking (skipping classification step)`);
  
  // For more complex queries, rank the specialized tools
  let prompt = `Analyze the following user message and determine which information sources would be most helpful to answer their query.
  
  User message: "${userMessage}"
  `;
  
  // Add conversation history context if available
  if (history && history.length > 1) { // If there's more than just the current message
    console.log(`[rankInformationSources] Including conversation history (${history.length} messages) for context-aware ranking`);
    
    // Add a section for conversation history
    prompt += `
  Important context from conversation history:
`;
    
    // Include the last few messages for context (excluding the current message)
    const relevantHistory = history.slice(0, -1).slice(-5); // Last 5 messages excluding current
    for (const msg of relevantHistory) {
      if (msg.role === "user") {
        prompt += `  - User said: "${msg.parts[0]?.text}"
`;
      } else if (msg.role === "model") {
        prompt += `  - Assistant responded: "${msg.parts[0]?.text}"
`;
      }
    }
  } else {
    console.log(`[rankInformationSources] No prior conversation history available`);
  }
  
  // Continue with the rest of the prompt
  prompt += `
  Available information sources:
  - no_tool: Answer directly without using any specialized database or search
  - query_law_on_insurance: Cambodia's Law on Insurance database
  - query_law_on_consumer_protection: Cambodia's Consumer Protection Law database
  - query_insurance_qna: Q&A database about insurance in Cambodia
  - search_web: General web search for information
  
  IMPORTANT INSTRUCTIONS:
  GROUP TOOLS BY PRIORITY LEVEL. Tools in the same group should be executed together.
  Return your answer in this exact format:
  TOOL_GROUPS:
  [1] tool_name1, tool_name2  (tools to use first, together)
  [2] tool_name3  (tools to use second)
  [3] tool_name4  (tools to use third)
  
  GUIDELINES:
  - YOU MUST RANK ALL AVAILABLE TOOLS. Do not leave any tool unranked.
  - Rank tools in order of relevance for answering this specific query
  - Group tools by priority level, with most relevant tools in the first group [1]
  - Tools in the same group [n] will be executed in parallel
  - If multiple databases would be equally useful for this query, group them at the same priority level
  - If the query requires web search, include "search_web" in an appropriate group
  - Do NOT include "query_all_databases" in your response
  - Your ranking MUST include all 5 tools: no_tool, query_law_on_insurance, query_law_on_consumer_protection, query_insurance_qna, and search_web
  - IMPORTANT: If the question might benefit from ANY tool, ALWAYS place "no_tool" in the LAST group. Only rank "no_tool" first if you're ABSOLUTELY CERTAIN the question doesn't need any specialized tools or web search
  
  SPECIAL CASE - OPTIMIZATION:
  If you determine that "no_tool" should be ranked first (meaning this is a simple question that can be answered directly without specialized tools),
  also provide a direct response to the user after your ranking JSON using this exact format:
  
  ===DIRECT_RESPONSE_START===
  Your helpful response to the user (without any reference to tools, ranking, or internal processing). If the user has shared any personal information in previous messages, make sure to reference it appropriately.
  ===DIRECT_RESPONSE_END===
  
  IMPORTANT IDENTITY AND TONE GUIDELINES:${systemPrompts?.tonePrompt ? `
  ${systemPrompts.tonePrompt}` : ''}${systemPrompts?.policyPrompt ? `

  COMPANY POLICY:
  ${systemPrompts.policyPrompt}` : ''}${systemPrompts?.lawPrompt ? `

  LAWS AND REGULATIONS:
  ${systemPrompts.lawPrompt}` : ''}

  `;
  
  try {
    console.log(`[rankInformationSources] Sending ranking prompt to AI (length: ${prompt.length})`);
    const startTime = Date.now();
    const response = await model.generateContent(prompt);
    const endTime = Date.now();
    console.log(`[rankInformationSources] AI ranking response received in ${endTime - startTime}ms`);
    
    const responseText = response.response.text();
    console.log(`[rankInformationSources] AI suggested ranking: ${responseText}`);
    
    // Parse the tool groups from the response
    const toolGroups = parseToolGroups(responseText);
    console.log(`[rankInformationSources] Parsed tool groups: ${JSON.stringify(toolGroups)}`);
    
    // Check for direct response if the first tool group contains only "no_tool"
    let directResponse: string | undefined;
    if (toolGroups.length > 0 && toolGroups[0].length === 1 && toolGroups[0][0] === "no_tool") {
      const directResponseRegex = /===DIRECT_RESPONSE_START===\s*([\s\S]*?)\s*===DIRECT_RESPONSE_END===/;
      const directResponseMatch = responseText.match(directResponseRegex);
      
      if (directResponseMatch && directResponseMatch[1]) {
        directResponse = directResponseMatch[1].trim();
        console.log(`[rankInformationSources] Found direct response (${directResponse.length} chars)`);
      }
    }
    
    console.log(`[rankInformationSources] Final tool groups after parsing: ${JSON.stringify(toolGroups)}`);
    
    // Return both the ranked tool groups and any direct response
    return {
      rankedToolGroups: toolGroups,
      directResponse
    };
  } catch (error) {
    console.error(`[rankInformationSources] Error in ranking: ${error}`);
    return {
      rankedToolGroups: [["no_tool"], ["search_web"], ["query_law_on_insurance", "query_law_on_consumer_protection", "query_insurance_qna"]]
    };
  }
};

// We've removed the combineToolResults function as we're now passing labeled raw data to the AI

// Helper function to create a consistent tool result with the new fields
function createToolResult(source: string, content: string, responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL", systemPrompts?: {
  stylingPrompt?: string,
  lawPrompt?: string,
  tonePrompt?: string,
  policyPrompt?: string
}) {
  // We don't need to modify the content here as system prompts are now added in tool execution
  return {
    source,
    content,
    result: content, // Keep the original content in result field
    isFullyFormatted: true, // Assuming the content is already formatted
    responseType
  };
}

// Function to parse tool groups from the AI response
const parseToolGroups = (responseText: string): string[][] => {
  const groups: string[][] = [];
  // Define all valid tools
  const allValidTools = ["no_tool", "query_law_on_insurance", "query_law_on_consumer_protection", "query_insurance_qna", "search_web"];
  // Keep track of which tools have been ranked
  const rankedTools = new Set<string>();
  
  // Look for patterns like [1] tool1, tool2
  const groupsSection = responseText.match(/TOOL_GROUPS:\s*([\s\S]*?)(?:\n\n|$)/i)?.[1] || "";
  const groupRegex = /\[(\d+)\]\s+(.+?)(?=\n\[\d+\]|\n\n|$)/gs;
  
  let match;
  while ((match = groupRegex.exec(groupsSection)) !== null) {
    const toolNames = match[2].split(',').map(t => t.trim());
    // Filter out any empty tool names or invalid tools
    const validToolsInGroup = toolNames.filter(name => name && allValidTools.includes(name));
    
    if (validToolsInGroup.length > 0) {
      groups.push(validToolsInGroup);
      // Mark these tools as ranked
      validToolsInGroup.forEach(tool => rankedTools.add(tool));
    }
  }
  
  // Check if all tools have been ranked as instructed
  const unrankedTools = allValidTools.filter(tool => !rankedTools.has(tool));
  const allToolsRanked = unrankedTools.length === 0;
  
  // If no valid groups were found or not all tools were ranked, use an intelligent ranking approach
  if (groups.length === 0) {
    // If no groups at all, use default ranking
    console.log('[parseToolGroups] No valid tool groups found, using default ranking');
    groups.push(["no_tool"]);
    groups.push(["search_web"]);
    groups.push(["query_law_on_insurance", "query_law_on_consumer_protection"]);
    groups.push(["query_insurance_qna"]);
  } else if (!allToolsRanked) {
    // Some tools were ranked but not all of them
    console.log(`[parseToolGroups] Adding unranked tools as separate groups: ${unrankedTools.join(', ')}`);
    
    // First add search_web if it's unranked, as it's often a good fallback
    if (unrankedTools.includes("search_web")) {
      groups.push(["search_web"]);
      unrankedTools.splice(unrankedTools.indexOf("search_web"), 1);
    }
    
    // Group law-related databases together if they're unranked
    const unrankedLawDatabases = unrankedTools.filter(tool => 
      tool === "query_law_on_insurance" || 
      tool === "query_law_on_consumer_protection"
    );
    
    if (unrankedLawDatabases.length > 0) {
      groups.push(unrankedLawDatabases);
      unrankedLawDatabases.forEach(db => {
        unrankedTools.splice(unrankedTools.indexOf(db), 1);
      });
    }
    
    // Add insurance Q&A separately if unranked
    if (unrankedTools.includes("query_insurance_qna")) {
      groups.push(["query_insurance_qna"]);
      unrankedTools.splice(unrankedTools.indexOf("query_insurance_qna"), 1);
    }
    
    // Add no_tool last if it's unranked (least likely to be useful if not explicitly ranked)
    if (unrankedTools.includes("no_tool")) {
      groups.push(["no_tool"]);
      unrankedTools.splice(unrankedTools.indexOf("no_tool"), 1);
    }
    
    // Add any remaining tools individually
    unrankedTools.forEach(tool => {
      groups.push([tool]);
    });
  }
  
  console.log(`[parseToolGroups] Final tool groups after ensuring all tools are ranked: ${JSON.stringify(groups)}`);
  return groups;
};

// Helper function to combine system prompts
export const combineSystemPrompts = (systemPrompts?: {
  stylingPrompt?: string,
  lawPrompt?: string,
  tonePrompt?: string,
  policyPrompt?: string
}): string => {
  if (!systemPrompts) return "";
  
  let combinedPrompt = "";
  
  // Add each prompt if it exists
  if (systemPrompts.tonePrompt) {
    combinedPrompt += `TONE AND PERSONALITY:\n${systemPrompts.tonePrompt}\n\n`;
  }
  
  if (systemPrompts.policyPrompt) {
    combinedPrompt += `COMPANY POLICY:\n${systemPrompts.policyPrompt}\n\n`;
  }
  
  if (systemPrompts.lawPrompt) {
    combinedPrompt += `LAWS AND REGULATIONS:\n${systemPrompts.lawPrompt}\n\n`;
  }
  
  if (systemPrompts.stylingPrompt) {
    combinedPrompt += `RESPONSE FORMATTING:\n${systemPrompts.stylingPrompt}\n\n`;
  }
  return combinedPrompt;
};

// Function to execute tools by priority groups, with parallel execution within groups
export const executeToolsByGroup = async (
  toolGroups: string[][],
  query: string,
  ctx: any,
  genAI: GoogleGenerativeAI,
  selectedModel: string | undefined,
  conversationHistory: { role: string; parts: { text: string; }[] }[] = [],
  systemPrompts?: {
    stylingPrompt?: string,
    lawPrompt?: string,
    tonePrompt?: string,
    policyPrompt?: string
  },
  messageId?: string // Add messageId parameter to update processing phase
): Promise<{ 
  source: string; 
  content: string; 
  result: string; 
  isFullyFormatted: boolean; 
  responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL" 
}> => {
  console.log(`[executeToolsByGroup] Starting execution with ${toolGroups.length} groups`);
  
  // Process each group in priority order
  for (let groupIndex = 0; groupIndex < toolGroups.length; groupIndex++) {
    const toolGroup = toolGroups[groupIndex];
    console.log(`[executeToolsByGroup] Processing group ${groupIndex + 1}: ${toolGroup.join(', ')}`);
    
    if (toolGroup.length === 1) {
      // Single tool case - similar to existing tool execution logic
      const tool = toolGroup[0];
      const startTime = Date.now();
      console.log(`[executeToolsByGroup] Single tool in group: ${tool}`);
      
      try {
        // Update processing phase based on the tool
        let phase = "Thinking";
        let toolDisplayName = tool.replace('query_', '').replace(/_/g, ' ');
        
        if (tool.startsWith("query_law")) {
          phase = `Searching ${toolDisplayName} database`;
        } else if (tool === "search_web") {
          phase = "Searching web";
        }
        
        // Only update phase if we have a context and messageId
        if (ctx && messageId) {
          try {
            await ctx.runMutation(api.chat.updateProcessingPhase, {
              messageId,
              phase
            });
            console.log(`[executeToolsByGroup] Updated phase: ${phase}`);
          } catch (error) {
            console.error(`[executeToolsByGroup] Phase update error: ${error instanceof Error ? error.message : String(error)}`);
            // Continue execution despite phase update error
          }
        }
        
        // Execute tool logic based on the tool name
        let toolResult = "";
        
        switch (tool) {
          case "no_tool":
            // Direct response without using specialized tools
            console.log(`[executeToolsByGroup] Using no_tool direct response`);
            
            // If system prompts are available, generate a more personalized response
            if (systemPrompts) {
              // Use the model to generate a response that incorporates system prompts
              try {
                const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
                const systemPromptsText = combineSystemPrompts(systemPrompts);
                
                // Create a prompt that incorporates the system identity and conversation history
                let conversationContext = '';
                if (conversationHistory && conversationHistory.length > 0) {
                  conversationContext = 'Conversation History:\n' + 
                    conversationHistory.slice(0, -1) // Exclude the current message
                    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.parts[0].text}`)
                    .join('\n') + '\n\n';
                }

                const directPrompt = `${systemPromptsText}

${conversationContext}User asks: "${query}"

Please provide a helpful response that answers the question directly, taking into account the conversation history.`;
                
                console.log(`[executeToolsByGroup] Generating no_tool response with system prompts`);
                const response = await model.generateContent(directPrompt);
                toolResult = response.response.text();
                console.log(`[executeToolsByGroup] Generated personalized no_tool response (${toolResult.length} chars)`);
              } catch (error) {
                console.error(`[executeToolsByGroup] Error generating personalized no_tool response: ${error}`);
                // Fallback to generic response
                toolResult = "I'm Elixer, your friendly AI assistant. How can I help you today?";
              }
            } else {
              // Default response when no system prompts are available
              toolResult = "I'm Elixer, your friendly AI assistant. How can I help you today?";
            }
            break;
            
            case "search_web":
              try {
                console.log(`[executeToolsByGroup] Using web search for query: ${query}`);
                
                // Get remaining tools for context
                const remainingTools = toolGroups.slice(groupIndex + 1).flat();
                console.log(`[executeToolsByGroup] Remaining tools: ${JSON.stringify(remainingTools)}`);
                
                // Define the Google Search tool
                const googleSearchTool: GenAITool = {
                  googleSearch: {}
                };
                
                // Configure the model with Google Search tool
                const searchModel = genAI.getGenerativeModel({
                  model: selectedModel || "gemini-2.5-flash-preview-04-17",
                  tools: [googleSearchTool]
                });
                
                // Create a chat session with the search tool enabled
                const chat = searchModel.startChat({
                  tools: [googleSearchTool]
                });
                
                console.log(`[executeToolsByGroup] Preparing search with structured response format`);
                
                // If we have conversation history, use it for context-aware search
                if (conversationHistory && conversationHistory.length > 0) {
                  console.log(`[executeToolsByGroup] Using conversation history (${conversationHistory.length} messages) for context-aware search`);
                  
                  // Initialize the chat with conversation history
                  for (let i = 0; i < conversationHistory.length - 1; i++) {
                    const msg = conversationHistory[i];
                    if (msg.role === "user") {
                      await chat.sendMessage(msg.parts[0].text);
                    }
                  }
                } else {
                  console.log(`[executeToolsByGroup] No conversation history available, using only current query`);
                }
                
                // Create a specialized search prompt that includes instructions for structured response
                // Add system prompts if available
                const systemPromptsText = combineSystemPrompts(systemPrompts);
                
                const searchPrompt = `
            ${systemPromptsText}I need information about: "${query}"
            
            IMPORTANT: When interpreting this query, consider the ENTIRE conversation context to determine what to search for. 
            
            If the query is short or ambiguous (like "how about X" or "what about Y"), use the conversation context to determine the FULL search intent. 
            For example:
            - If we were previously discussing stock prices and the user asks "how about nvidia", search for "current nvidia stock price"
            - If we were discussing weather and user asks "what about LA", search for "current weather in Los Angeles"
            
            Do not just search for the literal query text if context provides more information about the user's intent.
            
            Please search the web and analyze if you can find relevant information.
            
            TOOLS INFORMATION:
            - Current tool: search_web (Web Search)
            - Remaining tools to try if needed: ${remainingTools.join(", ")}
            
            RESPONSE FORMAT:
            [RESPONSE_TYPE: FINAL_ANSWER or TRY_NEXT_TOOL]
            [CONTENT]
            Your answer here...
            [/CONTENT]
            [REASONING]
            Brief explanation of why you chose this response type
            [/REASONING]
            
            RESPONSE GUIDELINES:
            - Use FINAL_ANSWER if you found sufficient information to answer the query
            - Use TRY_NEXT_TOOL if you couldn't find relevant information or if the information is insufficient
            
            If using FINAL_ANSWER, provide a complete, helpful response that directly addresses the query.
            If using TRY_NEXT_TOOL, briefly explain why the search results weren't sufficient.
            `;
                
                // Add conversation context to the search prompt
                let promptWithHistory = searchPrompt;
                if (conversationHistory && conversationHistory.length > 0) {
                  promptWithHistory += `
            
            CONVERSATION HISTORY:
            `;
                  
                  // Include ALL conversation history, not just a subset
                  for (const msg of conversationHistory) {
                    if (msg.role === "user") {
                      promptWithHistory += `User: ${msg.parts[0]?.text}
            
            `;
                    } else if (msg.role === "model") {
                      promptWithHistory += `Assistant: ${msg.parts[0]?.text}
            
            `;
                    }
                  }
                }
                
                // Execute the search with the structured prompt in a single API call
                console.log(`[executeToolsByGroup] Sending search with structured prompt`);
                const searchResponse = await chat.sendMessage(promptWithHistory);
                const responseText = searchResponse.response.text();
                
                // Parse the response to determine if it's a final answer or we should try the next tool
                const parsedResponse = parseToolResponse(responseText);
                console.log(`[executeToolsByGroup] Parsed response type: ${parsedResponse.responseType}`);
                
                // Check if there's grounding metadata (search results)
                const responseAny = searchResponse as any;
                const hasGroundingMetadata = responseAny.candidates?.[0]?.groundingMetadata;
                
                // Add search suggestions if available and it's a final answer
                if (parsedResponse.responseType === "FINAL_ANSWER") {
                  let result = parsedResponse.content;
                  
                  if (hasGroundingMetadata && responseAny.candidates?.[0]?.groundingMetadata?.searchEntryPoint) {
                    const searchSuggestionsHtml = responseAny.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
                    console.log(`[executeToolsByGroup] Search returned suggestions HTML of length: ${searchSuggestionsHtml.length}`);
                    result += `
            
            <!-- SEARCH_SUGGESTIONS_HTML:${searchSuggestionsHtml} -->`;
                  }
                  
                  console.log(`[executeToolsByGroup] Using search_web final answer (length: ${result.length})`);
                  return createToolResult("search_web", result, "FINAL_ANSWER", systemPrompts);
                } else {
                  console.log(`[executeToolsByGroup] search_web suggested trying next tool: ${parsedResponse.reasoning}`);
                  // Continue to next tool
                  toolResult = ""; // Clear tool result to ensure we don't use it
                }
              } catch (error) {
                console.error(`[executeToolsByGroup] Error using search_web: ${error}`);
              }
              break;
            
          case "query_law_on_insurance":
          case "query_law_on_consumer_protection":
          case "query_insurance_qna":
            // Database query logic with improved error handling and logging
            const dbQueryStartTime = Date.now();
            const databaseName = tool === "query_law_on_insurance" ? "Law_on_Insurance" :
                              tool === "query_law_on_consumer_protection" ? "Law_on_Consumer_Protection" :
                              "Insurance_and_reinsurance_in_Cambodia_QnA_format";
            const readableName = databaseName.replace(/_/g, " ");
            
            console.log(`[executeToolsByGroup] Querying ${readableName} database`);
            
            try {
              // Get the database content
              if (!ctx) {
                console.error(`[executeToolsByGroup] No context available for database query`);
                toolResult = `I couldn't access the database because the system context is unavailable.`;
                break;
              }
              
              // Track database query time
              const dbFetchStartTime = Date.now();
              const databaseResult = await ctx.runQuery(api.chat.getLawDatabaseContent, {
                databaseNames: [databaseName]
              });
              const dbFetchTime = Date.now() - dbFetchStartTime;
              
              // Handle missing database result
              if (!databaseResult) {
                console.error(`[executeToolsByGroup] Failed to get ${readableName} database (${dbFetchTime}ms)`);
                toolResult = `I couldn't access the ${readableName} database. It may be temporarily unavailable.`;
                break;
              }
              
              try {
                // Parse database content
                const databaseContent = JSON.parse(databaseResult);
                
                // Validate database structure
                if (!databaseContent[databaseName]) {
                  console.error(`[executeToolsByGroup] ${readableName} database not found in result (${dbFetchTime}ms)`);
                  toolResult = `I couldn't find the ${readableName} database. It may not be properly configured.`;
                  break;
                }
                
                // Check for explicit database errors
                if (databaseContent[databaseName].error) {
                  const errorMsg = databaseContent[databaseName].error;
                  console.error(`[executeToolsByGroup] ${readableName} database error: ${errorMsg}`);
                  toolResult = `There was an error accessing the ${readableName} database: ${errorMsg}`;
                  break;
                }
                
                // Get the raw database
                const rawDatabase = databaseContent[databaseName];
                const dbSize = JSON.stringify(rawDatabase).length;
                
                // Skip structure validation for QnA format database
                if (databaseName === "Insurance_and_reinsurance_in_Cambodia_QnA_format") {
                  console.log(`[executeToolsByGroup] ${readableName} database loaded: ${dbSize} chars (QnA format) (${dbFetchTime}ms)`);
                  
                  // Check if database is empty based on size
                  if (dbSize < 50) {
                    console.warn(`[executeToolsByGroup] ${readableName} database appears to be empty (${dbSize} chars)`);
                    toolResult = `The ${readableName} database appears to be empty or doesn't contain relevant information.`;
                    break;
                  }
                } else {
                  // For regular law databases with chapters and articles structure
                  const chaptersCount = rawDatabase.chapters?.length || 0;
                  const articlesCount = rawDatabase.chapters?.reduce((count: number, chapter: LawChapter) => 
                    count + (chapter.articles?.length || 0), 0) || 0;
                  
                  console.log(`[executeToolsByGroup] ${readableName} database loaded: ${dbSize} chars, ${chaptersCount} chapters, ~${articlesCount} articles (${dbFetchTime}ms)`);
                  
                  // Check if database is empty or has no useful content
                  if (chaptersCount === 0 || articlesCount === 0) {
                    console.warn(`[executeToolsByGroup] ${readableName} database appears to be empty (${chaptersCount} chapters, ${articlesCount} articles)`);
                    toolResult = `The ${readableName} database appears to be empty or doesn't contain relevant information.`;
                    break;
                  }
                }
                
                // Create a prompt for the AI with the labeled database
                const promptStartTime = Date.now();
                let prompt = `I need information about: "${query}"

I have access to the following database:\n\n`;
                
                // Add the database with a clear label
                prompt += `### ${readableName} Database:\n\n\`\`\`json\n${JSON.stringify(rawDatabase, null, 2)}\n\`\`\`\n\n`;
                
                // Add conversation context if available
                if (conversationHistory && conversationHistory.length > 0) {
                  prompt += `\n### Conversation Context:\n`;
                  const lastMessages = conversationHistory.slice(-2); // Just include last 2 messages for context
                  lastMessages.forEach(msg => {
                    if (msg.role === "user") {
                      prompt += `User: ${msg.parts[0]?.text}\n\n`;
                    }
                  });
                }
                
                prompt += `\nPlease analyze this database and provide a comprehensive answer to my query. Format your response using proper markdown.`;
                
                // Estimate token count for logging
                const estimatedTokens = estimateTokenCount(prompt);
                console.log(`[executeToolsByGroup] Prompt prepared: ${prompt.length} chars, ~${estimatedTokens} tokens`);
                
                // Use the model to generate a response with error handling
                try {
                  console.log(`[executeToolsByGroup] Sending prompt to AI model`);
                  const aiStartTime = Date.now();
                  const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
                  const response = await model.generateContent(prompt);
                  const aiTime = Date.now() - aiStartTime;
                  
                  toolResult = response.response.text();
                  const responseTokens = estimateTokenCount(toolResult);
                  
                  console.log(`[executeToolsByGroup] AI response: ${toolResult.length} chars, ~${responseTokens} tokens (${aiTime}ms)`);
                  
                  // Check if response is too short, which might indicate a problem
                  if (toolResult.length < 100) {
                    console.warn(`[executeToolsByGroup] AI response suspiciously short (${toolResult.length} chars), may be incomplete`);
                  }
                } catch (aiError) {
                  // Handle AI-specific errors
                  console.error(`[executeToolsByGroup] AI model error: ${aiError instanceof Error ? aiError.message : String(aiError)}`);
                  toolResult = `I encountered an error while analyzing the ${readableName} database. The AI processing system may be temporarily unavailable.`;
                }
                
              } catch (parseError) {
                // Handle JSON parsing errors
                console.error(`[executeToolsByGroup] Database parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                toolResult = `I had trouble processing the ${readableName} database format. The database may be corrupted.`;
              }
            } catch (error) {
              // Handle general query errors
              console.error(`[executeToolsByGroup] Database query error: ${error instanceof Error ? error.message : String(error)}`);
              toolResult = `An error occurred while accessing the ${readableName} database. Please try again later.`;
            }
            
            // Log total database operation time
            const totalDbTime = Date.now() - dbQueryStartTime;
            console.log(`[executeToolsByGroup] ${readableName} database operation completed in ${totalDbTime}ms`);
            break;
            
          default:
            console.log(`[executeToolsByGroup] Unknown tool: ${tool}`);
            toolResult = `I don't know how to use the tool: ${tool}`;
            break;
        }
        
        // Check if the tool provided a sufficient answer
        if (toolResult) {
          console.log(`[executeToolsByGroup] Got result from ${tool} (${toolResult.length} chars)`);
          
          // Evaluate if this is a final answer or we should try the next tool
          // This would use similar logic to executeToolsSequentially
          
          // For now, assume it's a final answer
          return createToolResult(tool, toolResult, "FINAL_ANSWER", systemPrompts);
        }
      } catch (error) {
        console.error(`[executeToolsByGroup] Error executing tool ${tool}:`, error);
      }
    } else {
      // Multiple tools case - execute in parallel and provide labeled databases to AI
      const parallelStartTime = Date.now();
      console.log(`[executeToolsByGroup] Executing ${toolGroup.length} tools in parallel`);
      
      try {
        // Update processing phase to indicate parallel search
        if (ctx && messageId) {
          try {
            await ctx.runMutation(api.chat.updateProcessingPhase, {
              messageId,
              phase: "Searching multiple sources"
            });
            console.log(`[executeToolsByGroup] Updated phase: Searching multiple sources`);
          } catch (error) {
            console.error(`[executeToolsByGroup] Phase update error: ${error instanceof Error ? error.message : String(error)}`);
            // Continue execution despite phase update error
          }
        }
        
        // Create an array of promises for parallel execution
        const toolPromises = toolGroup.map(async (tool) => {
          const toolStartTime = Date.now();
          console.log(`[executeToolsByGroup] Starting parallel tool: ${tool}`);
          let result = "";
          let rawDatabase = null;
          let databaseName = "";
          let databaseMetadata = {};
          let remainingTools = toolGroups.slice(groupIndex).flat().filter(t => t !== tool);
          
          try {
            switch (tool) {
              case "query_law_on_insurance":
              case "query_law_on_consumer_protection":
              case "query_insurance_qna":
                // Extract the database name from the tool name
                databaseName = tool === "query_law_on_insurance" ? "Law_on_Insurance" :
                               tool === "query_law_on_consumer_protection" ? "Law_on_Consumer_Protection" :
                               "Insurance_and_reinsurance_in_Cambodia_QnA_format";
                const readableName = databaseName.replace(/_/g, " ");
                
                console.log(`[executeToolsByGroup] Parallel query: ${readableName}`);
                
                // Get the database content
                if (!ctx) {
                  console.error(`[executeToolsByGroup] No context for parallel query: ${readableName}`);
                  result = `I couldn't access the ${readableName} database because the system context is unavailable.`;
                  break;
                }
                
                // Track database query time
                const dbFetchStartTime = Date.now();
                const databaseResult = await ctx.runQuery(api.chat.getLawDatabaseContent, {
                  databaseNames: [databaseName]
                });
                const dbFetchTime = Date.now() - dbFetchStartTime;
                
                // Handle missing database result
                if (!databaseResult) {
                  console.error(`[executeToolsByGroup] Failed to get ${readableName} (${dbFetchTime}ms)`);
                  result = `I couldn't access the ${readableName} database. It may be temporarily unavailable.`;
                  break;
                }
                
                try {
                  // Parse database content
                  const databaseContent = JSON.parse(databaseResult);
                  
                  // Validate database structure
                  if (!databaseContent[databaseName]) {
                    console.error(`[executeToolsByGroup] ${readableName} not found in result (${dbFetchTime}ms)`);
                    result = `I couldn't find the ${readableName} database. It may not be properly configured.`;
                    break;
                  }
                  
                  // Check for explicit database errors
                  if (databaseContent[databaseName].error) {
                    const errorMsg = databaseContent[databaseName].error;
                    console.error(`[executeToolsByGroup] ${readableName} error: ${errorMsg}`);
                    result = `There was an error accessing the ${readableName} database: ${errorMsg}`;
                    break;
                  }
                  
                  // Store the raw database for later use
                  rawDatabase = databaseContent[databaseName];
                  const dbSize = JSON.stringify(rawDatabase).length;
                  
                  // Log basic database info without any structure validation
                  databaseMetadata = { dbSize, dbFetchTime };
                  console.log(`[executeToolsByGroup] ${readableName} loaded: ${dbSize} chars (${dbFetchTime}ms)`);
                  
                  // Only check if it's completely empty based on raw size
                  if (dbSize < 50) {
                    console.warn(`[executeToolsByGroup] ${readableName} appears empty (${dbSize} chars)`);
                    result = `The ${readableName} database appears to be empty or doesn't contain relevant information.`;
                  }
                } catch (parseError) {
                  console.error(`[executeToolsByGroup] Parse error for ${readableName}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                  result = `I had trouble processing the ${readableName} database format. The database may be corrupted.`;
                }
                break;
                
                case "search_web":
                  try {
                    console.log(`[executeToolsByGroup] Parallel web search started for: ${query}`);
                    
                    // Define the Google Search tool
                    const googleSearchTool: GenAITool = {
                      googleSearch: {}
                    };
                    
                    // Configure the model with Google Search tool
                    const searchModel = genAI.getGenerativeModel({
                      model: selectedModel || "gemini-2.5-flash-preview-04-17",
                      tools: [googleSearchTool]
                    });
                    
                    // Create a chat session with the search tool enabled
                    const chat = searchModel.startChat({
                      tools: [googleSearchTool]
                    });
                    
                    // If we have conversation history, use it for context-aware search
                    if (conversationHistory && conversationHistory.length > 0) {
                      console.log(`[executeToolsByGroup] Using conversation history for parallel search`);
                      
                      // Initialize the chat with conversation history
                      for (let i = 0; i < conversationHistory.length - 1; i++) {
                        const msg = conversationHistory[i];
                        if (msg.role === "user") {
                          await chat.sendMessage(msg.parts[0].text);
                        }
                      }
                    }
                    
                    // Add system prompts if available
                    const systemPromptsText = combineSystemPrompts(systemPrompts);
                    
                    // Create a prompt that includes system identity and instructions
                    // Get remaining tools for context (all tools in the current group and later groups)
                    const remainingToolGroups = toolGroups.slice(groupIndex);
                    const remainingTools = remainingToolGroups.flat().filter(t => t !== tool);
                    console.log(`[executeToolsByGroup] Remaining tools for parallel execution: ${JSON.stringify(remainingTools)}`);
                    
                    const searchPrompt = `
${systemPromptsText}I need information about: "${query}"

TOOLS INFORMATION:
- Current tool: search_web (Web Search)
- Remaining tools to try if needed: ${remainingTools.join(", ")}

Please search the web and provide a comprehensive answer based on reliable sources.
`;
                    
                    // Execute the search with system prompts included
                    console.log(`[executeToolsByGroup] Parallel search with system prompts (${systemPromptsText.length > 0 ? 'included' : 'not available'})`); 
                    const searchResponse = await chat.sendMessage(searchPrompt);
                    result = searchResponse.response.text();
                    
                    // Check for search suggestions metadata
                    const responseAny = searchResponse as any;
                    if (responseAny.candidates?.[0]?.groundingMetadata?.searchEntryPoint) {
                      const searchSuggestionsHtml = responseAny.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
                      console.log(`[executeToolsByGroup] Parallel search returned suggestions HTML: ${searchSuggestionsHtml.length} chars`);
                      
                      // Append search suggestions as a special comment for later extraction
                      result += `\n\n<!-- SEARCH_SUGGESTIONS_HTML:${searchSuggestionsHtml} -->`;
                    }
                    
                    console.log(`[executeToolsByGroup] Parallel web search completed, result length: ${result.length}`);
                  } catch (error) {
                    console.error(`[executeToolsByGroup] Error in parallel web search: ${error instanceof Error ? error.message : String(error)}`);
                    result = `I encountered an error while searching the web: ${error instanceof Error ? error.message : String(error)}`;
                  }
                  break;
            }
            
            const toolTime = Date.now() - toolStartTime;
            console.log(`[executeToolsByGroup] Tool ${tool} completed in ${toolTime}ms`);
            return { tool, result, rawDatabase, databaseName, databaseMetadata, executionTime: toolTime, remainingTools };
          } catch (error) {
            const toolTime = Date.now() - toolStartTime;
            console.error(`[executeToolsByGroup] Error in parallel tool ${tool}: ${error instanceof Error ? error.message : String(error)}`);
            return { 
              tool, 
              result: `Error executing ${tool}: ${error instanceof Error ? error.message : String(error)}`, 
              rawDatabase, 
              databaseName,
              executionTime: toolTime,
              error: true 
            };
          }
        });
        
        // Wait for all tools in the group to complete
        const parallelExecutionStartTime = Date.now();
        const toolResults = await Promise.all(toolPromises);
        const parallelExecutionTime = Date.now() - parallelExecutionStartTime;
        
        // Log results with timing information
        const toolsWithTimes = toolResults.map(r => `${r.tool} (${r.executionTime}ms)`).join(', ');
        console.log(`[executeToolsByGroup] All parallel tools completed in ${parallelExecutionTime}ms: ${toolsWithTimes}`);
        
        // Filter out empty results but keep track of errors
        const validResults = toolResults.filter(r => r.rawDatabase || (r.result && r.result.trim() !== ""));
        const errorCount = toolResults.filter(r => r.error).length;
        
        if (validResults.length === 0) {
          console.log(`[executeToolsByGroup] No valid results from parallel tools (${errorCount} errors)`);
          continue; // Try next group
        }
        
        // Create a prompt for the AI with labeled databases
        const promptStartTime = Date.now();
        let prompt = `I need information about: "${query}"

I have access to the following databases:\n\n`;
        
        // Add each database with a clear label
        let databaseCount = 0;
        let hasWebSearchResults = false;
        validResults.forEach(({ tool, databaseName, rawDatabase, result, databaseMetadata, remainingTools }) => {
          if (rawDatabase) {
            databaseCount++;
            const readableName = databaseName.replace(/_/g, " ");
            prompt += `### ${readableName} Database:\n\n\`\`\`json\n${JSON.stringify(rawDatabase, null, 2)}\n\`\`\`\n\n`;
          } else if (tool === "search_web" && result && result.trim() !== "") {
            hasWebSearchResults = true;
            prompt += `### Web Search Results:\n\n${result}\n\n`;
          }
        });
        
        // Add conversation context if available
        if (conversationHistory && conversationHistory.length > 0) {
          prompt += `\n### Conversation Context:\n`;
          const lastMessages = conversationHistory.slice(-2); // Just include last 2 messages for context
          lastMessages.forEach(msg => {
            if (msg.role === "user") {
              prompt += `User: ${msg.parts[0]?.text}\n\n`;
            }
          });
        }
        
        prompt += `\nPlease analyze ${hasWebSearchResults ? (databaseCount > 0 ? 'these databases and web search results' : 'these web search results') : (databaseCount > 1 ? 'these databases' : 'this database')} and provide a comprehensive answer to my query. Format your response using proper markdown.`;
        
        // Estimate token count for logging
        const estimatedTokens = estimateTokenCount(prompt);
        console.log(`[executeToolsByGroup] Parallel prompt prepared: ${prompt.length} chars, ~${estimatedTokens} tokens`);
        
        // Use the model to generate a response based on the labeled databases
        try {
          console.log(`[executeToolsByGroup] Sending parallel prompt with ${databaseCount} databases${hasWebSearchResults ? ' and web search results' : ''} to AI`);
          const aiStartTime = Date.now();
          const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
          const response = await model.generateContent(prompt);
          const aiResponse = response.response.text();
          const aiTime = Date.now() - aiStartTime;
          
          const responseTokens = estimateTokenCount(aiResponse);
          console.log(`[executeToolsByGroup] AI parallel response: ${aiResponse.length} chars, ~${responseTokens} tokens (${aiTime}ms)`);
          
          // Check if response is too short, which might indicate a problem
          if (aiResponse.length < 100) {
            console.warn(`[executeToolsByGroup] AI parallel response suspiciously short (${aiResponse.length} chars)`);
          }
          
          // Log total parallel execution time
          const totalParallelTime = Date.now() - parallelStartTime;
          console.log(`[executeToolsByGroup] Total parallel execution completed in ${totalParallelTime}ms`);
          
          // Return the AI-generated response
          return createToolResult(
            "parallel_databases", 
            aiResponse,
            "FINAL_ANSWER",
            systemPrompts
          );
        } catch (aiError) {
          // Handle AI-specific errors
          console.error(`[executeToolsByGroup] AI model error in parallel execution: ${aiError instanceof Error ? aiError.message : String(aiError)}`);
          return createToolResult(
            "parallel_databases_error", 
            `I encountered an error while analyzing the databases. The AI processing system may be temporarily unavailable.`,
            "FINAL_ANSWER",
            systemPrompts
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[executeToolsByGroup] Error executing parallel tools: ${errorMessage}`);
        
        // Return error message but allow trying next group
        return createToolResult(
          "parallel_error", 
          `I encountered an error while searching multiple databases. The system may be temporarily unavailable.`,
          "FINAL_ANSWER",
          systemPrompts
        );
      }
    }
    
  }
  
  // If we reach here, it means we've tried all tool groups and none provided a satisfactory answer
  // Log this outcome and return a helpful fallback message
  console.log(`[executeToolsByGroup] All tool groups exhausted without finding relevant information`);
  return createToolResult(
    "fallback", 
    "I've searched through all available sources but couldn't find specific information to answer your question. You might want to try rephrasing your question or providing more specific details about what you're looking for.",
    "FINAL_ANSWER",
    systemPrompts
  );
  // Handle any remaining fallback case
  console.log(`[executeToolsByGroup] Returning generic fallback response`);
  return createToolResult(
    "system_error", 
    `I apologize, but I encountered a system error while processing your request. This might be a temporary issue. Please try again in a moment.`,
    "FINAL_ANSWER",
    systemPrompts
  );
};

// Parse the AI's structured response to determine if it's a final answer or we should try the next tool
const parseToolResponse = (responseText: string): { responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL", content: string, reasoning: string } => {
  // Default values
  let responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL" = "TRY_NEXT_TOOL";
  let content = "";
  let reasoning = "";
  
  // Extract response type
  const typeMatch = responseText.match(/\[RESPONSE_TYPE:\s*(FINAL_ANSWER|TRY_NEXT_TOOL)\]/i);
  if (typeMatch && typeMatch[1]) {
    responseType = typeMatch[1] as "FINAL_ANSWER" | "TRY_NEXT_TOOL";
  }
  
  // Extract content
  const contentMatch = responseText.match(/\[CONTENT\]([\s\S]*?)\[\/CONTENT\]/i);
  if (contentMatch && contentMatch[1]) {
    content = contentMatch[1].trim();
  } else {
    // If no content markers found, use the whole response as content
    content = responseText;
  }
  
  // Extract reasoning
  const reasoningMatch = responseText.match(/\[REASONING\]([\s\S]*?)\[\/REASONING\]/i);
  if (reasoningMatch && reasoningMatch[1]) {
    reasoning = reasoningMatch[1].trim();
  }
  
  return { responseType, content, reasoning };
}

export const executeToolsSequentially = async (
  rankedTools: string[],
  query: string,
  ctx: any,
  genAI: GoogleGenerativeAI,
  selectedModel: string | undefined,
  conversationHistory?: { role: string; parts: { text: string; }[] }[],
  systemPrompts?: {
    stylingPrompt?: string,
    lawPrompt?: string,
    tonePrompt?: string,
    policyPrompt?: string
  },
  messageId?: string // Add messageId parameter to update processing phase
): Promise<{ 
  source: string, 
  result: string, 
  isFullyFormatted: boolean, 
  responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL" 
}> => {
  console.log(`[executeToolsSequentially] Starting sequential tool execution`);
  console.log(`[executeToolsSequentially] Ranked tools (${rankedTools.length}): ${JSON.stringify(rankedTools)}`);
  console.log(`[executeToolsSequentially] Query: "${query.substring(0, 50)}${query.length > 50 ? "..." : ""}"`);
  console.log(`[executeToolsSequentially] Selected model: ${selectedModel || "default"}`);
  
  // Initialize the model for use with various tools
  const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
  
  let toolResult = "";
  let toolsAttempted = 0;
  
  // Try each tool in sequence until we get a result
  for (const tool of rankedTools) {
    toolsAttempted++;
    const startTime = Date.now();
    console.log(`[executeToolsSequentially] Trying tool: ${tool} (${toolsAttempted}/${rankedTools.length}) for query: ${query.substring(0, 50)}${query.length > 50 ? "..." : ""}`);
    
    // Update the processing phase if we have a messageId
    if (messageId) {
      let phase = "Thinking";
      
      // Set appropriate phase based on the tool
      if (tool === "search_web") {
        phase = "Searching web";
      } else if (tool.includes("query_") || tool.includes("database")) {
        phase = "Searching database";
      } else if (tool === "no_tool" && toolsAttempted > 1) {
        phase = "Generating response";
      }
      
      // Update the processing phase in the database
      try {
        await ctx.runMutation(api.chat.updateProcessingPhase, {
          messageId,
          phase
        });
        console.log(`[executeToolsSequentially] Updated processing phase to: ${phase}`);
      } catch (error) {
        console.error(`[executeToolsSequentially] Error updating processing phase: ${error}`);
      }
    }
    
    // Execute the appropriate tool
    switch (tool) {
      case "no_tool":
        // For no_tool, we'll use the model directly to generate a response with the optimized approach
        try {
          console.log(`[executeToolsSequentially] Using optimized no_tool for query: ${query}`);
          
          // Get remaining tools for context
          const remainingTools = rankedTools.slice(rankedTools.indexOf(tool) + 1);
          console.log(`[executeToolsSequentially] Remaining tools: ${JSON.stringify(remainingTools)}`);
          
          // Create a specialized prompt that includes tool context and response format
          // Add system prompts if available
          const systemPromptsText = combineSystemPrompts(systemPrompts);
          
          let specializedPrompt = `
${systemPromptsText}You are a helpful assistant responding to: "${query}"

TOOLS INFORMATION:
- Current tool: no_tool (direct response)
- Remaining tools to try if needed: ${remainingTools.join(", ")}

TASK:
1. Provide a friendly, helpful response using only your general knowledge.
2. Keep your response concise and directly address what the user is asking.
3. If this is a greeting or simple conversation, respond naturally.

FORMAT YOUR RESPONSE LIKE THIS:
[RESPONSE_TYPE: FINAL_ANSWER or TRY_NEXT_TOOL]
[CONTENT]
Your answer here...
[/CONTENT]
[REASONING]
Brief explanation of why you chose this response type
[/REASONING]

RESPONSE GUIDELINES:
- Use FINAL_ANSWER if you can answer the query with your general knowledge
- Use TRY_NEXT_TOOL if you think a specialized database or web search would provide better information
`;
          
          // Add full conversation history context
          if (conversationHistory && conversationHistory.length > 0) {
            console.log(`[executeToolsSequentially] Including full conversation history in no_tool prompt (${conversationHistory.length} messages)`);
            
            specializedPrompt += `

CONVERSATION HISTORY:
`;
            
            // Include ALL conversation history, not just a subset
            for (const msg of conversationHistory) {
              if (msg.role === "user") {
                specializedPrompt += `User: ${msg.parts[0]?.text}

`;
              } else if (msg.role === "model") {
                specializedPrompt += `Assistant: ${msg.parts[0]?.text}

`;
              }
            }
          } else {
            console.log(`[executeToolsSequentially] No conversation history available for no_tool`);
          }
          
          console.log(`[executeToolsSequentially] Sending optimized no_tool prompt with${conversationHistory ? '' : 'out'} conversation context`);
          const response = await model.generateContent(specializedPrompt);
          const responseText = response.response.text();
          
          // Parse the response to determine if it's a final answer or we should try the next tool
          const parsedResponse = parseToolResponse(responseText);
          console.log(`[executeToolsSequentially] Parsed response type: ${parsedResponse.responseType}`);
          
          if (parsedResponse.responseType === "FINAL_ANSWER") {
            console.log(`[executeToolsSequentially] Using no_tool final answer (length: ${parsedResponse.content.length})`);
            
            // Set final phase to "Generating response" if we have a messageId
            if (messageId) {
              try {
                await ctx.runMutation(api.chat.updateProcessingPhase, {
                  messageId,
                  phase: "Generating response"
                });
                console.log(`[executeToolsSequentially] Updated final processing phase to: Generating response`);
              } catch (error) {
                console.error(`[executeToolsSequentially] Error updating final processing phase: ${error}`);
              }
            }
            
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType, systemPrompts);
          } else {
            console.log(`[executeToolsSequentially] no_tool suggested trying next tool: ${parsedResponse.reasoning}`);
            // Continue to next tool
            toolResult = ""; // Clear tool result to ensure we don't use it
          }
        } catch (error) {
          console.error(`[executeToolsSequentially] Error using optimized no_tool: ${error}`);
        }
        break;
        
      case "query_law_on_insurance":
        try {
          console.log(`[executeToolsSequentially] Querying Law_on_Insurance database with optimized approach for: ${query}`);
          
          // Get remaining tools for context
          const remainingTools = rankedTools.slice(rankedTools.indexOf(tool) + 1);
          console.log(`[executeToolsSequentially] Remaining tools: ${JSON.stringify(remainingTools)}`);
          
          // Retrieve the database content
          const lawDb = await ctx.runQuery(api.lawDatabases.getLawDatabaseContentByName, { 
            name: "Law_on_Insurance" 
          });
          console.log(`[executeToolsSequentially] Law_on_Insurance query result success: ${lawDb.success}, has database: ${!!lawDb.database}`);
          
          let toolData = "";
          
          if (lawDb.success && lawDb.database && lawDb.database.content) {
            console.log(`[executeToolsSequentially] Law_on_Insurance database found with content`);
            
            // Log the raw database content structure before processing
            console.log(`[executeToolsSequentially] Law_on_Insurance raw database structure:`);
            console.log(`  - Content type: ${typeof lawDb.database.content}`);
            console.log(`  - Has chapters: ${!!lawDb.database.content.chapters}`);
            console.log(`  - Chapters count: ${lawDb.database.content.chapters?.length || 0}`);
            
            if (lawDb.database.content.chapters && lawDb.database.content.chapters.length > 0) {
              const firstChapter = lawDb.database.content.chapters[0];
              console.log(`  - First chapter title: ${firstChapter.chapter_title || 'Untitled'}`);
              console.log(`  - First chapter articles count: ${firstChapter.articles?.length || 0}`);
              
              // Log details of first few articles if they exist
              if (firstChapter.articles && firstChapter.articles.length > 0) {
                for (let i = 0; i < Math.min(3, firstChapter.articles.length); i++) {
                  const article = firstChapter.articles[i];
                  console.log(`  - Article ${article.article_number} title: ${article.article_title || 'Untitled'}`);
                  
                  if (typeof article.content === 'string') {
                    console.log(`    - Content type: string, length: ${article.content.length} chars`);
                    console.log(`    - Full content: "${article.content}"`);
                  } else if (Array.isArray(article.content)) {
                    console.log(`    - Content type: array with ${article.content.length} paragraphs`);
                    for (let j = 0; j < article.content.length; j++) {
                      console.log(`      - Paragraph ${j+1}: "${article.content[j]}"`);
                    }
                  }
                }
              }
            }
            
            // Just pass the raw JSON database instead of formatted
            toolData = `Here is the full Law on Insurance database in JSON format:\n\n${JSON.stringify(lawDb.database.content, null, 2)}\n\nPlease use this data to answer the query: "${query}"\n\nPay special attention to the 'points' arrays which contain bullet points that follow the main content of some articles.`;
            console.log(`[executeToolsSequentially] Passing raw Law_on_Insurance database as JSON`);
            console.log(`[executeToolsSequentially] Raw JSON database length: ${toolData.length}`);
          } else {
            toolData = "The Law on Insurance database is not available or could not be accessed.";
            console.log(`[executeToolsSequentially] Law_on_Insurance database not found or query unsuccessful`);
          }
          
          // Create a specialized prompt that includes tool context and response format
          let specializedPrompt = `
You are a helpful assistant responding to: "${query}"

TOOLS INFORMATION:
- Current tool: ${tool} (Law on Insurance database)
- Remaining tools to try if needed: ${remainingTools.join(", ")}

DATABASE QUERY RESULTS:
${toolData}

TASK:
1. Analyze the database query results above.
2. If the results contain relevant information to answer the query, provide a complete answer.
3. If the results don't contain relevant information, indicate we should try the next tool.

FORMAT YOUR RESPONSE LIKE THIS:
[RESPONSE_TYPE: FINAL_ANSWER or TRY_NEXT_TOOL]
[CONTENT]
Your answer here...
[/CONTENT]
[REASONING]
Brief explanation of why you chose this response type
[/REASONING]

RESPONSE GUIDELINES:
- Use FINAL_ANSWER if the database provides sufficient information to answer the query
- Use TRY_NEXT_TOOL if the database lacks relevant information for the query
`;
          
          // Add full conversation history context
          if (conversationHistory && conversationHistory.length > 0) {
            console.log(`[executeToolsSequentially] Including full conversation history in ${tool} prompt (${conversationHistory.length} messages)`);
            
            specializedPrompt += `

CONVERSATION HISTORY:
`;
            
            // Include ALL conversation history, not just a subset
            for (const msg of conversationHistory) {
              if (msg.role === "user") {
                specializedPrompt += `User: ${msg.parts[0]?.text}

`;
              } else if (msg.role === "model") {
                specializedPrompt += `Assistant: ${msg.parts[0]?.text}

`;
              }
            }
          } else {
            console.log(`[executeToolsSequentially] No conversation history available for ${tool}`);
          }
          
          console.log(`[executeToolsSequentially] Sending optimized ${tool} prompt with${conversationHistory ? '' : 'out'} conversation context`);
          const response = await model.generateContent(specializedPrompt);
          const responseText = response.response.text();
          
          // Parse the response to determine if it's a final answer or we should try the next tool
          const parsedResponse = parseToolResponse(responseText);
          console.log(`[executeToolsSequentially] Parsed response type: ${parsedResponse.responseType}`);
          
          if (parsedResponse.responseType === "FINAL_ANSWER") {
            console.log(`[executeToolsSequentially] Using ${tool} final answer (length: ${parsedResponse.content.length})`);
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType, systemPrompts);
          } else {
            console.log(`[executeToolsSequentially] ${tool} suggested trying next tool: ${parsedResponse.reasoning}`);
            // Continue to next tool
            toolResult = ""; // Clear tool result to ensure we don't use it
          }
        } catch (error) {
          console.error(`[executeToolsSequentially] Error using optimized ${tool}: ${error}`);
        }
        break;
        
      case "query_law_on_consumer_protection":
        try {
          console.log(`[executeToolsSequentially] Querying Law_on_Consumer_Protection database with optimized approach for: ${query}`);
          
          // Get remaining tools for context
          const remainingTools = rankedTools.slice(rankedTools.indexOf(tool) + 1);
          console.log(`[executeToolsSequentially] Remaining tools: ${JSON.stringify(remainingTools)}`);
          
          // Retrieve the database content
          const lawDb = await ctx.runQuery(api.lawDatabases.getLawDatabaseContentByName, { 
            name: "Law_on_Consumer_Protection" 
          });
          console.log(`[executeToolsSequentially] Law_on_Consumer_Protection query result success: ${lawDb.success}, has database: ${!!lawDb.database}`);
          
          let toolData = "";
          
          if (lawDb.success && lawDb.database && lawDb.database.content) {
            console.log(`[executeToolsSequentially] Law_on_Consumer_Protection database found with content`);
            
            // Get the database query results
            toolData = await queryLawDatabase(query, lawDb.database.content, conversationHistory);
            console.log(`[executeToolsSequentially] Law_on_Consumer_Protection query result length: ${toolData.length}`);
            console.log(`[executeToolsSequentially] Law_on_Consumer_Protection query result preview: ${toolData.substring(0, 100)}...`);
          } else {
            toolData = "The Law on Consumer Protection database is not available or could not be accessed.";
            console.log(`[executeToolsSequentially] Law_on_Consumer_Protection database not found or query unsuccessful`);
          }
          
          // Create a specialized prompt that includes tool context and response format
          let specializedPrompt = `
You are a helpful assistant responding to: "${query}"

TOOLS INFORMATION:
- Current tool: ${tool} (Law on Consumer Protection database)
- Remaining tools to try if needed: ${remainingTools.join(", ")}

DATABASE QUERY RESULTS:
${toolData}

TASK:
1. Analyze the database query results above.
2. If the results contain relevant information to answer the query, provide a complete answer.
3. If the results don't contain relevant information, indicate we should try the next tool.

FORMAT YOUR RESPONSE LIKE THIS:
[RESPONSE_TYPE: FINAL_ANSWER or TRY_NEXT_TOOL]
[CONTENT]
Your answer here...
[/CONTENT]
[REASONING]
Brief explanation of why you chose this response type
[/REASONING]

RESPONSE GUIDELINES:
- Use FINAL_ANSWER if the database provides sufficient information to answer the query
- Use TRY_NEXT_TOOL if the database lacks relevant information for the query
`;
          
          // Add full conversation history context
          if (conversationHistory && conversationHistory.length > 0) {
            console.log(`[executeToolsSequentially] Including full conversation history in ${tool} prompt (${conversationHistory.length} messages)`);
            
            specializedPrompt += `

CONVERSATION HISTORY:
`;
            
            // Include ALL conversation history, not just a subset
            for (const msg of conversationHistory) {
              if (msg.role === "user") {
                specializedPrompt += `User: ${msg.parts[0]?.text}

`;
              } else if (msg.role === "model") {
                specializedPrompt += `Assistant: ${msg.parts[0]?.text}

`;
              }
            }
          } else {
            console.log(`[executeToolsSequentially] No conversation history available for ${tool}`);
          }
          
          console.log(`[executeToolsSequentially] Sending optimized ${tool} prompt with${conversationHistory ? '' : 'out'} conversation context`);
          const response = await model.generateContent(specializedPrompt);
          const responseText = response.response.text();
          
          // Parse the response to determine if it's a final answer or we should try the next tool
          const parsedResponse = parseToolResponse(responseText);
          console.log(`[executeToolsSequentially] Parsed response type: ${parsedResponse.responseType}`);
          
          if (parsedResponse.responseType === "FINAL_ANSWER") {
            console.log(`[executeToolsSequentially] Using ${tool} final answer (length: ${parsedResponse.content.length})`);
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType, systemPrompts);
          } else {
            console.log(`[executeToolsSequentially] ${tool} suggested trying next tool: ${parsedResponse.reasoning}`);
            // Continue to next tool
            toolResult = ""; // Clear tool result to ensure we don't use it
          }
        } catch (error) {
          console.error(`[executeToolsSequentially] Error using optimized ${tool}: ${error}`);
        }
        break;
        
      case "query_insurance_qna":
        try {
          console.log(`[executeToolsSequentially] Querying Insurance QnA database with optimized approach for: ${query}`);
          
          // Get remaining tools for context
          const remainingTools = rankedTools.slice(rankedTools.indexOf(tool) + 1);
          console.log(`[executeToolsSequentially] Remaining tools: ${JSON.stringify(remainingTools)}`);
          
          // Retrieve the database content
          const qnaDb = await ctx.runQuery(api.lawDatabases.getLawDatabaseContentByName, { 
            name: "Insurance_and_reinsurance_in_Cambodia_QnA_format" 
          });
          console.log(`[executeToolsSequentially] Insurance_and_reinsurance_in_Cambodia_QnA_format query result success: ${qnaDb.success}, has database: ${!!qnaDb.database}`);
          
          let toolData = "";
          
          if (qnaDb.success && qnaDb.database && qnaDb.database.content) {
            console.log(`[executeToolsSequentially] Insurance_and_reinsurance_in_Cambodia_QnA_format database found with content`);
            
            // Get the database query results
            toolData = await queryLawDatabase(query, qnaDb.database.content, conversationHistory);
            console.log(`[executeToolsSequentially] Insurance_and_reinsurance_in_Cambodia_QnA_format query result length: ${toolData.length}`);
            console.log(`[executeToolsSequentially] Insurance_and_reinsurance_in_Cambodia_QnA_format query result preview: ${toolData.substring(0, 100)}...`);
          } else {
            toolData = "The Insurance Q&A database is not available or could not be accessed.";
            console.log(`[executeToolsSequentially] Insurance_and_reinsurance_in_Cambodia_QnA_format database not found or query unsuccessful`);
          }
          
          // Create a specialized prompt that includes tool context and response format
          // Add system prompts if available
          const systemPromptsText = combineSystemPrompts(systemPrompts);
          let specializedPrompt = `
${systemPromptsText}You are a helpful assistant responding to: "${query}"

TOOLS INFORMATION:
- Current tool: ${tool} (Insurance Q&A database)
- Remaining tools to try if needed: ${remainingTools.join(", ")}

DATABASE QUERY RESULTS:
${toolData}

TASK:
1. Analyze the database query results above.
2. If the results contain relevant information to answer the query, provide a complete answer.
3. If the results don't contain relevant information, indicate we should try the next tool.

FORMAT YOUR RESPONSE LIKE THIS:
[RESPONSE_TYPE: FINAL_ANSWER or TRY_NEXT_TOOL]
[CONTENT]
Your answer here...
[/CONTENT]
[REASONING]
Brief explanation of why you chose this response type
[/REASONING]

RESPONSE GUIDELINES:
- Use FINAL_ANSWER if the database provides sufficient information to answer the query
- Use TRY_NEXT_TOOL if the database lacks relevant information for the query
`;
          
          // Add full conversation history context
          if (conversationHistory && conversationHistory.length > 0) {
            console.log(`[executeToolsSequentially] Including full conversation history in ${tool} prompt (${conversationHistory.length} messages)`);
            
            specializedPrompt += `

CONVERSATION HISTORY:
`;
            
            // Include ALL conversation history, not just a subset
            for (const msg of conversationHistory) {
              if (msg.role === "user") {
                specializedPrompt += `User: ${msg.parts[0]?.text}

`;
              } else if (msg.role === "model") {
                specializedPrompt += `Assistant: ${msg.parts[0]?.text}

`;
              }
            }
          } else {
            console.log(`[executeToolsSequentially] No conversation history available for ${tool}`);
          }
          
          console.log(`[executeToolsSequentially] Sending optimized ${tool} prompt with${conversationHistory ? '' : 'out'} conversation context`);
          const response = await model.generateContent(specializedPrompt);
          const responseText = response.response.text();
          
          // Parse the response to determine if it's a final answer or we should try the next tool
          const parsedResponse = parseToolResponse(responseText);
          console.log(`[executeToolsSequentially] Parsed response type: ${parsedResponse.responseType}`);
          
          if (parsedResponse.responseType === "FINAL_ANSWER") {
            console.log(`[executeToolsSequentially] Using ${tool} final answer (length: ${parsedResponse.content.length})`);
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType, systemPrompts);
          } else {
            console.log(`[executeToolsSequentially] ${tool} suggested trying next tool: ${parsedResponse.reasoning}`);
            // Continue to next tool
            toolResult = ""; // Clear tool result to ensure we don't use it
          }
        } catch (error) {
          console.error(`[executeToolsSequentially] Error using optimized ${tool}: ${error}`);
        }
        break;
        
      case "search_web":
        try {
          console.log(`[executeToolsSequentially] Using search web for query: ${query}`);

          // Get remaining tools for context
          const remainingTools = rankedTools.slice(rankedTools.indexOf(tool) + 1);
          console.log(`[executeToolsSequentially] Remaining tools: ${JSON.stringify(remainingTools)}`);
          
          // Define the Google Search tool
          const googleSearchTool: GenAITool = {
            googleSearch: {}
          };
          
          // Configure the model with Google Search tool
          const searchModel = genAI.getGenerativeModel({
            model: selectedModel || "gemini-2.5-flash-preview-04-17",
            tools: [googleSearchTool]
          });
          
          // Create a chat session with the search tool enabled
          const chat = searchModel.startChat({
            tools: [googleSearchTool]
          });
          
          // If we have conversation history, use it for context-aware search
          if (conversationHistory && conversationHistory.length > 0) {
            console.log(`[executeToolsSequentially] Using conversation history for search_web`);
            
            // Initialize the chat with conversation history
            for (let i = 0; i < conversationHistory.length - 1; i++) {
              const msg = conversationHistory[i];
              if (msg.role === "user") {
                await chat.sendMessage(msg.parts[0].text);
              }
            }
          }
          
          // Add system prompts if available
          const systemPromptsText = combineSystemPrompts(systemPrompts);
          
          // Create a prompt that includes system identity and instructions
          const searchPrompt = `
${systemPromptsText}I need information about: "${query}"

IMPORTANT: When interpreting this query, consider the ENTIRE conversation context to determine what to search for. 

If the query is short or ambiguous (like "how about X" or "what about Y"), use the conversation context to determine the FULL search intent. 
For example:
- If we were previously discussing stock prices and the user asks "how about nvidia", search for "current nvidia stock price"
- If we were discussing weather and user asks "what about LA", search for "current weather in Los Angeles"

Do not just search for the literal query text if context provides more information about the user's intent.

Please search the web and analyze if you can find relevant information.

TOOLS INFORMATION:
- Current tool: ${tool} (Web Search)
- Remaining tools to try if needed: ${remainingTools.join(", ")}

RESPONSE FORMAT:
[RESPONSE_TYPE: FINAL_ANSWER or TRY_NEXT_TOOL]
[CONTENT]
Your answer here...
[/CONTENT]
[REASONING]
Brief explanation of why you chose this response type
[/REASONING]

RESPONSE GUIDELINES:
- Use FINAL_ANSWER if you found sufficient information to answer the query
- Use TRY_NEXT_TOOL if you couldn't find relevant information or if the information is insufficient

If using FINAL_ANSWER, provide a complete, helpful response that directly addresses the query.
If using TRY_NEXT_TOOL, briefly explain why the search results weren't sufficient.
`;
          
          // Add conversation context to the search prompt
          let promptWithHistory = searchPrompt;
          if (conversationHistory && conversationHistory.length > 0) {
            promptWithHistory += `

CONVERSATION HISTORY:
`;
            
            // Include ALL conversation history, not just a subset
            for (const msg of conversationHistory) {
              if (msg.role === "user") {
                promptWithHistory += `User: ${msg.parts[0]?.text}

`;
              } else if (msg.role === "model") {
                promptWithHistory += `Assistant: ${msg.parts[0]?.text}

`;
              }
            }
          }
          
          // Execute the search with the structured prompt in a single API call
          console.log(`[executeToolsSequentially] Sending one-call search with structured prompt`);
          const searchResponse = await chat.sendMessage(promptWithHistory);
          const responseText = searchResponse.response.text();
          
          // Parse the response to determine if it's a final answer or we should try the next tool
          const parsedResponse = parseToolResponse(responseText);
          console.log(`[executeToolsSequentially] Parsed response type: ${parsedResponse.responseType}`);
          
          // Check if there's grounding metadata (search results)
          const responseAny = searchResponse as any;
          const hasGroundingMetadata = responseAny.candidates?.[0]?.groundingMetadata;
          
          // Add search suggestions if available and it's a final answer
          if (parsedResponse.responseType === "FINAL_ANSWER") {
            let result = parsedResponse.content;
            
            if (hasGroundingMetadata && responseAny.candidates?.[0]?.groundingMetadata?.searchEntryPoint) {
              const searchSuggestionsHtml = responseAny.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
              console.log(`[executeToolsSequentially] Search returned suggestions HTML of length: ${searchSuggestionsHtml.length}`);
              result += `

<!-- SEARCH_SUGGESTIONS_HTML:${searchSuggestionsHtml} -->`;
            }
            
            console.log(`[executeToolsSequentially] Using ${tool} final answer (length: ${result.length})`);
            return createToolResult(tool, result, "FINAL_ANSWER", systemPrompts);
          } else {
            console.log(`[executeToolsSequentially] ${tool} suggested trying next tool: ${parsedResponse.reasoning}`);
            // Continue to next tool
            toolResult = ""; // Clear tool result to ensure we don't use it
          }
        } catch (error) {
          console.error(`[executeToolsSequentially] Error using one-call ${tool}: ${error}`);
        }
        break;
        
      case "query_all_databases":
        try {
          console.log(`[executeToolsSequentially] Querying ALL databases with optimized approach for: ${query}`);
          
          // Get remaining tools for context
          const remainingTools = rankedTools.slice(rankedTools.indexOf(tool) + 1);
          console.log(`[executeToolsSequentially] Remaining tools: ${JSON.stringify(remainingTools)}`);
          
          let combinedResult = "\n--- COMBINED DATABASE SEARCH RESULTS ---\n\n";
          let foundAnyResults = false;
          
          // Query Law_on_Insurance
          const insuranceDb = await ctx.runQuery(api.lawDatabases.getLawDatabaseContentByName, { 
            name: "Law_on_Insurance" 
          });
          
          if (insuranceDb.success && insuranceDb.database && insuranceDb.database.content) {
            console.log(`[executeToolsSequentially] Adding Law_on_Insurance to combined search`);
            const insuranceResult = await queryLawDatabase(query, insuranceDb.database.content, conversationHistory);
            if (!insuranceResult.includes("No relevant information found")) {
              combinedResult += "\n=== FROM LAW ON INSURANCE ===\n\n" + insuranceResult + "\n\n";
              foundAnyResults = true;
            } else {
              combinedResult += "\n=== LAW ON INSURANCE: No relevant information found ===\n";
            }
          }
          
          // Query Law_on_Consumer_Protection
          const consumerDb = await ctx.runQuery(api.lawDatabases.getLawDatabaseContentByName, { 
            name: "Law_on_Consumer_Protection" 
          });
          
          if (consumerDb.success && consumerDb.database && consumerDb.database.content) {
            console.log(`[executeToolsSequentially] Adding Law_on_Consumer_Protection to combined search`);
            const consumerResult = await queryLawDatabase(query, consumerDb.database.content, conversationHistory);
            if (!consumerResult.includes("No relevant information found")) {
              combinedResult += "\n=== FROM LAW ON CONSUMER PROTECTION ===\n\n" + consumerResult + "\n\n";
              foundAnyResults = true;
            } else {
              combinedResult += "\n=== LAW ON CONSUMER PROTECTION: No relevant information found ===\n";
            }
          }
          
          // Query Insurance QnA
          const qnaDb = await ctx.runQuery(api.lawDatabases.getLawDatabaseContentByName, { 
            name: "Insurance_and_reinsurance_in_Cambodia_QnA_format" 
          });
          
          if (qnaDb.success && qnaDb.database && qnaDb.database.content) {
            console.log(`[executeToolsSequentially] Adding Insurance QnA to combined search`);
            const qnaResult = await queryLawDatabase(query, qnaDb.database.content, conversationHistory);
            if (!qnaResult.includes("No relevant information found")) {
              combinedResult += "\n=== FROM INSURANCE Q&A ===\n\n" + qnaResult;
              foundAnyResults = true;
            } else {
              combinedResult += "\n=== INSURANCE Q&A: No relevant information found ===\n";
            }
          }
          
          // Log results of combined search
          const resultLength = combinedResult.length;
          console.log(`[executeToolsSequentially] Combined database query result length: ${resultLength}`);
          
          // Create a specialized prompt that includes tool context and response format
          // Add system prompts if available
          const systemPromptsText = combineSystemPrompts(systemPrompts);
          
          let specializedPrompt = `
${systemPromptsText}You are a helpful assistant responding to: "${query}"

TOOLS INFORMATION:
- Current tool: ${tool} (Combined Database Search)
- Remaining tools to try if needed: ${remainingTools.join(", ")}

COMBINED DATABASE SEARCH RESULTS:
${combinedResult}

TASK:
1. Analyze the combined database search results above.
2. If the results contain relevant information to answer the query, provide a complete answer.
3. If the results don't contain relevant information, indicate we should try the next tool.

FORMAT YOUR RESPONSE LIKE THIS:
[RESPONSE_TYPE: FINAL_ANSWER or TRY_NEXT_TOOL]
[CONTENT]
Your answer here...
[/CONTENT]
[REASONING]
Brief explanation of why you chose this response type
[/REASONING]

RESPONSE GUIDELINES:
- Use FINAL_ANSWER if any of the databases provide sufficient information to answer the query
- Use TRY_NEXT_TOOL if none of the databases contain relevant information for the query
`;
          
          // Add full conversation history context
          if (conversationHistory && conversationHistory.length > 0) {
            console.log(`[executeToolsSequentially] Including full conversation history in ${tool} prompt (${conversationHistory.length} messages)`);
            
            specializedPrompt += `

CONVERSATION HISTORY:
`;
            
            // Include ALL conversation history, not just a subset
            for (const msg of conversationHistory) {
              if (msg.role === "user") {
                specializedPrompt += `User: ${msg.parts[0]?.text}

`;
              } else if (msg.role === "model") {
                specializedPrompt += `Assistant: ${msg.parts[0]?.text}

`;
              }
            }
          } else {
            console.log(`[executeToolsSequentially] No conversation history available for ${tool}`);
          }
          
          console.log(`[executeToolsSequentially] Sending optimized ${tool} prompt with${conversationHistory ? '' : 'out'} conversation context`);
          const response = await model.generateContent(specializedPrompt);
          const responseText = response.response.text();
          
          // Parse the response to determine if it's a final answer or we should try the next tool
          const parsedResponse = parseToolResponse(responseText);
          console.log(`[executeToolsSequentially] Parsed response type: ${parsedResponse.responseType}`);
          
          if (parsedResponse.responseType === "FINAL_ANSWER") {
            console.log(`[executeToolsSequentially] Using ${tool} final answer (length: ${parsedResponse.content.length})`);
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType, systemPrompts);
          } else {
            console.log(`[executeToolsSequentially] ${tool} suggested trying next tool: ${parsedResponse.reasoning}`);
            // Continue to next tool
            toolResult = ""; // Clear tool result to ensure we don't use it
          }
        } catch (error) {
          console.error(`[executeToolsSequentially] Error using optimized ${tool}: ${error}`);
        }
        break;
    }
    
    // With the optimized approach, we don't need to check toolResult here anymore
    // Each tool case now handles its own evaluation and returns directly if it has a final answer
    // This code will only execute if the tool didn't return a result and we need to try the next tool
    console.log(`[executeToolsSequentially] Moving to next tool after ${tool}`);
  }
  
  // If no tool provided a sufficient answer, return a fallback message
  return createToolResult(
    "fallback", 
    "After searching through all available resources, I couldn't find specific information to answer your question completely. You might want to rephrase or provide more details about what you're looking for.",
    "FINAL_ANSWER",
    systemPrompts
  );
};
