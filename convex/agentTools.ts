"use node";

import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";
import { api } from "./_generated/api";
import { LawDatabase } from "./chatAI"; // Assuming LawDatabase and other related types are defined

// --- CONSTANTS ---
const DEFAULT_MODEL_NAME = "gemini-2.5-flash-preview-05-20"; 
const RANKING_MODEL_NAME = "gemini-2.0-flash"; // Use a fast model for ranking

// --- TYPE DEFINITIONS (Refactored and New) ---

// Interface for Convex context - simplified to avoid generic type issues
type ConvexActionCtx = any; // This type is only used for method signatures and will be properly typed at usage

interface SearchEntryPoint {
  renderedContent: string;
}

// Define the interface for Google's generative AI tools
interface GoogleSearchTool {
  googleSearch: Record<string, unknown>; // Can be {} for default params
}

// This type is for Google's generative AI library tools
type GenAITool = GoogleSearchTool | any; // Allow other tool types if necessary

// This interface is for model configuration when using tools
interface ModelConfig {
  model: string;
  tools?: GenAITool[];
  generationConfig?: Record<string, any>;
  systemInstruction?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface SystemPrompts {
  stylingPrompt?: string;
  lawPrompt?: string;
  tonePrompt?: string;
  policyPrompt?: string;
}

/**
 * Represents context accumulated from previous tool executions.
 */
interface AccumulatedContext {
  sources: string[];                            // Which tools contributed to this context
  content: string;                              // The actual context content
  searchSuggestionsHtmlToPreserve?: string;     // Preserved search suggestions HTML from a web search tool
}

/**
 * Parameters for a single tool's execution.
 */
interface ToolExecutionParams {
  query: string;
  conversationHistory: { role: string; parts: { text: string }[] }[];
  genAI: GoogleGenerativeAI;
  selectedModel: string | undefined;
  systemPrompts?: SystemPrompts;
  ctx: ConvexActionCtx;
  remainingTools: string[];
  messageId?: string;
  accumulatedContext?: AccumulatedContext;    // Context from previous tools
  nextToolGroup?: string[];                  // Information about the next group of tools to be executed
}

/**
 * Standardized result from a tool execution.
 */
interface ToolExecutionResult {
  source: string;                               // Name of the tool that produced this result
  content: string;                              // The primary content/answer from the tool
  responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL" | "TRY_NEXT_TOOL_AND_ADD_CONTEXT";
  error?: string;                                // Error if the tool execution failed
  contextToAdd?: string;                        // Context to preserve for next tools (if TRY_NEXT_TOOL_AND_ADD_CONTEXT)
  searchSuggestionsHtml?: string;              // HTML to add at the end of the response if FINAL_ANSWER
  isFullyFormatted?: boolean;                  // Whether the content is already fully formatted and can be used directly
  synthesisData?: string;                      // Data explicitly for synthesis during parallel tool execution
}

interface IToolExecutor {
  name: string;
  execute(params: ToolExecutionParams): Promise<ToolExecutionResult>;
}

/**
 * Expected JSON structure for LLM response when deciding tool execution flow.
 */
interface LLMToolExecutionDecision {
  responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL" | "TRY_NEXT_TOOL_AND_ADD_CONTEXT";
  content: string;       // Full answer for FINAL_ANSWER, or a note for others.
  reasoning: string;     // Explanation for the decision.
  contextToPreserve?: string; // Content for TRY_NEXT_TOOL_AND_ADD_CONTEXT.
}

/**
 * Expected JSON structure for LLM response when ranking tools.
 */
interface LLMRankingDecision {
    toolGroups: { rank: number; toolNames: string[] }[];
    directResponse?: string; // Optional direct response if no_tool is ranked first.
    reasoning?: string;      // Optional reasoning for the ranking.
}

/**
 * Expected JSON structure for LLM response when synthesizing parallel tool results.
 */
interface LLMParallelSynthesisResponse {
    synthesizedAnswer: string;
    reasoning?: string; // Optional reasoning for the synthesis.
}


interface RankingResult {
  rankedToolGroups: string[][];
  directResponse?: string;
}

// --- AVAILABLE TOOLS (Metadata) ---
export const AVAILABLE_TOOLS: Tool[] = [
  {
    name: "no_tool",
    description: "Answer directly without using any specialized database or search. Use if the query is simple or to synthesize accumulated context.",
    parameters: { type: "object", properties: { query: { type: "string", description: "The user's query to answer directly, considering accumulated context"}}, required: ["query"]},
  },
  {
    name: "query_law_on_insurance",
    description: "Query the Law on Insurance database for legal information. Provides structured legal text.",
    parameters: { type: "object", properties: { query: { type: "string", description: "The specific query to search for in the insurance law database"}}, required: ["query"]},
  },
  {
    name: "query_law_on_consumer_protection",
    description: "Query the Law on Consumer Protection database for legal information. Provides structured legal text.",
    parameters: { type: "object", properties: { query: { type: "string", description: "The specific query to search for in the consumer protection law database"}}, required: ["query"]},
  },
  {
    name: "query_insurance_qna",
    description: "Query the Insurance Q&A database for common questions and answers. Good for specific insurance-related questions.",
    parameters: { type: "object", properties: { query: { type: "string", description: "The specific question to search for in the Q&A database"}}, required: ["query"]},
  },
  {
    name: "search_web",
    description: "Search the web for general information, current events, or topics not found in specialized databases. Can provide search suggestion links.",
    parameters: { type: "object", properties: { query: { type: "string", description: "The search query for the web"}}, required: ["query"]},
  },
];

// --- UTILITY FUNCTIONS ---

/**
 * Estimates token count (simple approximation).
 */
export const estimateTokenCount = (text: string): number => {
  return Math.ceil(text.length / 4);
};

/**
 * Ensures a value is a string, returning an empty string for null/undefined.
 */
const ensureString = (value: any): string => {
  if (value === null || value === undefined) return "";
  return String(value);
};

/**
 * Combines system prompts into a single string.
 */
export const combineSystemPrompts = (systemPrompts?: SystemPrompts): string => {
  if (!systemPrompts) return "";
  let combined = "SYSTEM GUIDELINES:\n";
  if (systemPrompts.tonePrompt) combined += `TONE AND PERSONALITY:\n${systemPrompts.tonePrompt}\n\n`;
  if (systemPrompts.policyPrompt) combined += `COMPANY POLICY:\n${systemPrompts.policyPrompt}\n\n`;
  if (systemPrompts.lawPrompt) combined += `LAWS AND REGULATIONS:\n${systemPrompts.lawPrompt}\n\n`;
  if (systemPrompts.stylingPrompt) combined += `RESPONSE FORMATTING:\n${systemPrompts.stylingPrompt}\n\n`;
  return combined;
};

/**
 * Appends search suggestions HTML to content if provided and not already present.
 * Uses the specific HTML comment format expected by the frontend.
 */
const finalizeContentWithSuggestions = (mainContent: string, suggestionsHtml?: string): string => {
  if (suggestionsHtml && !mainContent.includes("<!-- SEARCH_SUGGESTIONS_HTML:")) {
    return `${mainContent}\n\n<!-- SEARCH_SUGGESTIONS_HTML:${suggestionsHtml} -->`;
  }
  return mainContent;
};

/**
 * Creates a standardized ToolExecutionResult.
 */
function createToolResult(
  source: string,
  content: string,
  responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL" | "TRY_NEXT_TOOL_AND_ADD_CONTEXT",
  contextToAdd?: string,
  error?: string,
  searchSuggestionsHtml?: string,
  finalSuggestionsHtmlToPreserve?: string // Used if this is a FINAL_ANSWER and we need to pull from accumulated
): ToolExecutionResult {
  
  let finalContent = content;
  if (responseType === "FINAL_ANSWER" && finalSuggestionsHtmlToPreserve) {
    finalContent = finalizeContentWithSuggestions(finalContent, finalSuggestionsHtmlToPreserve);
    if (finalContent !== content) {
        console.log(`[createToolResult] Added preserved search suggestions to final answer from ${source}.`);
    }
  }

  const res: ToolExecutionResult = {
    source,
    content: finalContent,
    responseType,
  };

  if (contextToAdd && responseType === "TRY_NEXT_TOOL_AND_ADD_CONTEXT") {
    res.contextToAdd = contextToAdd;
  }
  if (error) {
    res.error = error;
  }
  if (searchSuggestionsHtml) {
    res.searchSuggestionsHtml = searchSuggestionsHtml;
  }
  
  return res;
}


/**
 * Parses the AI's JSON response for tool execution decision.
 */
const parseToolExecutionDecision = (responseText: string): LLMToolExecutionDecision | { error: string } => {
  const result = parseLLMJson<LLMToolExecutionDecision>(responseText, "ToolExecutionDecision", isLLMToolExecutionDecision);
  
  if (!('error' in result)) {
    console.log(`[parseToolExecutionDecision] Parsed: responseType='${result.responseType}', contentLen=${result.content.length}, reasoningLen=${result.reasoning.length}, contextToPreserveLen=${result.contextToPreserve?.length || 0}`);
    
    // Additional warning for TRY_NEXT_TOOL_AND_ADD_CONTEXT without context
    if (result.responseType === "TRY_NEXT_TOOL_AND_ADD_CONTEXT" && !result.contextToPreserve) {
      console.warn(`[parseToolExecutionDecision] responseType is TRY_NEXT_TOOL_AND_ADD_CONTEXT, but contextToPreserve is missing.`);
    }
  }
  
  return result;
};

/**
 * Parses the AI's JSON response for parallel synthesis.
 */
const parseParallelSynthesisResponse = (responseText: string): LLMParallelSynthesisResponse | { error: string } => {
    const result = parseLLMJson<LLMParallelSynthesisResponse>(responseText, "ParallelSynthesisResponse", isLLMParallelSynthesisResponse);
    
    if (!('error' in result)) {
        console.log(`[parseParallelSynthesisResponse] Parsed synthesis. Answer length: ${result.synthesizedAnswer.length}`);
    }
    
    return result;
};


/**
 * Updates the processing phase of a message (e.g., in a database).
 */
async function updateProcessingPhase(
    ctx: ConvexActionCtx,
    messageId: string | undefined,
    phase: string,
    toolName: string
): Promise<void> {
    if (ctx && messageId) {
        try {
            await ctx.runMutation(api.chat.updateProcessingPhase, { messageId, phase });
            console.log(`[${toolName}] Updated phase: ${phase}`);
        } catch (error) {
            console.error(`[${toolName}] Phase update error for phase '${phase}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

// --- GEMINI API HELPERS ---
const getGenerationConfigForJson = (): GenerationConfig => ({
    responseMimeType: "application/json",
});

/**
 * Type-safe JSON parser for LLM responses
 */
function parseLLMJson<T>(responseText: string, context: string, typeGuard: (obj: any) => obj is T): T | { error: string } {
    try {
        // Clean up code blocks if present
        const cleanedText = responseText.replace(/^```(?:json)?\s*|```\s*$/g, '').trim();
        
        // Parse JSON
        const parsed = JSON.parse(cleanedText);
        
        // Validate parsed object against expected type
        if (typeGuard(parsed)) {
            return parsed;
        } else {
            console.error(`[parseLLMJson] ${context}: Parsed JSON doesn't match expected structure`);
            return { error: `Invalid ${context} structure` };
        }
    } catch (error: any) {
        console.error(`[parseLLMJson] ${context}: ${error.message}. Text: "${responseText.substring(0, 300)}..."`);
        return { error: `Error parsing ${context}: ${error.message}` };
    }
}

/**
 * Type guard for LLMToolExecutionDecision
 */
function isLLMToolExecutionDecision(obj: any): obj is LLMToolExecutionDecision {
    const validResponseTypes = ["FINAL_ANSWER", "TRY_NEXT_TOOL", "TRY_NEXT_TOOL_AND_ADD_CONTEXT"];
    return (
        obj && 
        typeof obj === 'object' &&
        typeof obj.responseType === 'string' &&
        validResponseTypes.includes(obj.responseType) &&
        typeof obj.content === 'string' &&
        typeof obj.reasoning === 'string' &&
        (obj.contextToPreserve === undefined || typeof obj.contextToPreserve === 'string')
    );
}

/**
 * Type guard for LLMParallelSynthesisResponse
 */
function isLLMParallelSynthesisResponse(obj: any): obj is LLMParallelSynthesisResponse {
    return (
        obj && 
        typeof obj === 'object' &&
        typeof obj.synthesizedAnswer === 'string' &&
        (obj.reasoning === undefined || typeof obj.reasoning === 'string')
    );
}

/**
 * Type guard for LLMRankingDecision
 */
function isLLMRankingDecision(obj: any): obj is LLMRankingDecision {
    return (
        obj && 
        typeof obj === 'object' &&
        Array.isArray(obj.toolGroups) &&
        obj.toolGroups.every((group: any) => 
            typeof group === 'object' &&
            typeof group.rank === 'number' &&
            Array.isArray(group.toolNames) &&
            group.toolNames.every((tool: any) => typeof tool === 'string')
        ) &&
        (obj.directResponse === undefined || typeof obj.directResponse === 'string') &&
        (obj.reasoning === undefined || typeof obj.reasoning === 'string')
    );
}

class PromptFactory {
  static generateToolExecutionPrompt(
    query: string,
    currentTool: string,
    toolDescriptionOrData: string, // Renamed for clarity
    remainingTools: string[],
    conversationHistory: { role: string; parts: { text: string }[] }[],
    systemPromptsText: string,
    accumulatedContext?: AccumulatedContext,
    nextToolGroup?: string[]
  ): string {
    let prompt = `${systemPromptsText}You are an AI assistant processing a user query: "${query}"

CURRENT TOOL: ${currentTool}
${toolDescriptionOrData ? `\nCONTEXT FOR ${currentTool}:\n${toolDescriptionOrData}\n` : `No specific data loaded for ${currentTool}. Rely on its function ('${AVAILABLE_TOOLS.find(t=>t.name === currentTool)?.description}') or your general knowledge if it's 'no_tool'.\n`}
REMAINING TOOLS TO TRY IF NEEDED (ranked in likely order of utility): ${remainingTools.length > 0 ? remainingTools.join(", ") : "None. This is the last chance."}

TOOL SEQUENCE INFORMATION:
- CURRENT TOOL: ${currentTool}
${nextToolGroup && nextToolGroup.length > 0 ? `- NEXT TOOL(S) IF YOU SELECT TRY_NEXT_TOOL or TRY_NEXT_TOOL_AND_ADD_CONTEXT: ${nextToolGroup.join(', ')}` : `- NEXT TOOL(S): None (this is the last tool in the planned sequence)`}
`;

    if (accumulatedContext && accumulatedContext.content) {
      prompt += `\nIMPORTANT ACCUMULATED CONTEXT FROM PREVIOUS TOOLS (Use this to build a comprehensive understanding and avoid redundant work. Total ${accumulatedContext.sources.length} sources: [${accumulatedContext.sources.join(', ')}]):\n${accumulatedContext.content}\n`;
      if (accumulatedContext.searchSuggestionsHtmlToPreserve) {
        prompt += `\nNOTE: Search suggestions from a previous web search are being preserved and will be added to the final answer if appropriate. Do not duplicate them in your 'content' output.\n`;
      }
    } else {
      prompt += `\nNo accumulated context from previous tools yet.\n`;
    }

    prompt += `
TASK:
1. Analyze the user query, conversation history, any data/context from the current tool, and any accumulated context.
2. Decide on the best course of action.
3. Respond in JSON format ONLY, matching this schema:
   \`\`\`json
   {
     "responseType": "FINAL_ANSWER" | "TRY_NEXT_TOOL" | "TRY_NEXT_TOOL_AND_ADD_CONTEXT",
     "content": "Your full answer to the user (for FINAL_ANSWER). For TRY_NEXT_TOOL or TRY_NEXT_TOOL_AND_ADD_CONTEXT, this can be a brief note or empty. The user will not see this intermediate content directly.",
     "reasoning": "Your detailed reasoning for choosing the responseType. If FINAL_ANSWER, explain sufficiency. If TRY_NEXT_TOOL, explain insufficiency and need for next. If TRY_NEXT_TOOL_AND_ADD_CONTEXT, explain what useful info was found and why it's being passed.",
     "contextToPreserve": "string (ONLY if responseType is TRY_NEXT_TOOL_AND_ADD_CONTEXT). Summarize key findings, quotes, data from CURRENT TOOL to pass to next tools. This will be added to ACCUMULATED CONTEXT."
   }
   \`\`\`

DECISION GUIDELINES:
- FINAL_ANSWER: If you have sufficient information from the current tool AND accumulated context for a complete answer.
- TRY_NEXT_TOOL_AND_ADD_CONTEXT: PREFERRED for most cases. If the current tool provided ANY useful, relevant information (even partial) that should be preserved.
- TRY_NEXT_TOOL: ONLY if the current tool yielded ABSOLUTELY NOTHING relevant or its output is unusable/error.

CONVERSATION HISTORY (for context):
`;
    if (conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.parts[0].text}\n`;
      });
    } else {
      prompt += "No prior conversation history.\n";
    }
    prompt += "\nEnsure your entire response is a single, valid JSON object."
    return prompt;
  }

  /**
   * This is designed to work with parseToolGroupsFromNaturalLanguage and the faster gemini-2.0-flash model.
   */
  static generateNaturalLanguageRankingPrompt(
    userMessage: string,
    history: { role: string; parts: { text: string }[] }[],
    tools: Tool[],
    systemPromptsText: string // Combined system prompts
  ): string {
    let prompt = `${systemPromptsText}Analyze the user message and conversation history to determine the optimal sequence and grouping of tools.

User message: "${userMessage}"
`;
    if (history && history.length > 1) {
      prompt += `\nImportant context from conversation history (last 5 messages before current query):\n`;
      const relevantHistory = history.slice(0, -1).slice(-5); // Exclude the current user message already provided
      for (const msg of relevantHistory) {
        prompt += `  - ${msg.role === "user" ? "User" : "Assistant"} said: "${ensureString(msg.parts[0]?.text)}"\n`;
      }
    }

    prompt += `\nAvailable tools and descriptions:\n`;
    tools.forEach(tool => {
      prompt += `- ${tool.name}: ${tool.description}\n`;
    });

    prompt += `
IMPORTANT INSTRUCTIONS:
GROUP TOOLS BY PRIORITY LEVEL. Tools in the same group should be executed together (in parallel if applicable, or sequentially if one depends on another within the group - though current system runs them in parallel if grouped).
Return your answer in this exact format, Example:
TOOL_GROUPS:
[1] tool_name1, tool_name2
[2] tool_name3
[3] tool_name4

GUIDELINES FOR RANKING:
- YOU MUST RANK ALL AVAILABLE TOOLS.
- Rank tools from most to least relevant for this specific query.
- Group tools that should be tried simultaneously (or at the same priority level) together.
- If the query requires web search, include "search_web" appropriately, often early if the topic is unknown.
- "no_tool" should generally be ranked last, or only if no other tool seems even remotely relevant. If "no_tool" is used after other tools, it can synthesize their accumulated context.
- Consider the descriptions carefully. If a specialized database matches the query, prioritize it over general web search for that specific information.

SPECIAL CASE - OPTIMIZATION:
Only rank "no_tool" first (in group [1] by itself), IF you are ABSOLUTELY CERTAIN no specialized tools or web search are needed and you can answer directly, if yes, provide a direct response:
===DIRECT_RESPONSE_START===
Your helpful response to the user (without reference to tools/ranking).
===DIRECT_RESPONSE_END===

IMPORTANT IDENTITY AND TONE GUIDELINES: Follow the system instructions provided above.
`;
    return prompt;
  }

  static generateRankingPrompt(
    userMessage: string,
    history: { role: string; parts: { text: string }[] }[],
    tools: Tool[],
    systemPromptsText: string // Combined system prompts
  ): string {
    let prompt = `${systemPromptsText}Analyze the user message and conversation history to determine the optimal sequence and grouping of tools.

User message: "${userMessage}"
`;
    if (history && history.length > 1) {
      prompt += `\nImportant context from conversation history (last 5 messages before current query):\n`;
      const relevantHistory = history.slice(0, -1).slice(-5); // Exclude the current user message already provided
      for (const msg of relevantHistory) {
        prompt += `  - ${msg.role === "user" ? "User" : "Assistant"} said: "${ensureString(msg.parts[0]?.text)}"\n`;
      }
    }

    prompt += `\nAvailable tools and descriptions:\n`;
    tools.forEach(tool => {
      prompt += `- ${tool.name}: ${tool.description}\n`;
    });

    prompt += `
INSTRUCTIONS:
1. Rank ALL available tools from most to least relevant for the query.
2. Group tools that should be tried at the same priority level. Tools in the same group might be executed in parallel.
3. Respond in JSON format ONLY, matching this schema:
   \`\`\`json
   {
     "toolGroups": [
       { "rank": 1, "toolNames": ["tool_name1", "tool_name2"] },
       { "rank": 2, "toolNames": ["tool_name3"] },
       { "rank": 3, "toolNames": ["tool_name4"] }
     ],
     "directResponse": "string (OPTIONAL: If 'no_tool' is ranked first [rank 1] AND you are CERTAIN no other tools are needed, provide the direct answer here. Otherwise, omit or leave null.)",
     "reasoning": "string (OPTIONAL: Briefly explain your ranking strategy.)"
   }
   \`\`\`
GUIDELINES FOR RANKING:
- "no_tool" should generally be last, or only if no other tool is relevant. If "no_tool" is used after other tools, it synthesizes their accumulated context.
- If "no_tool" is ranked first and a "directResponse" is provided, the system may skip other tools.
- Consider tool descriptions carefully. Prioritize specialized databases over general web search if a strong match exists.
Ensure your entire response is a single, valid JSON object.
`;
    return prompt;
  }

  static generateParallelSynthesisPrompt(
    query: string,
    collectedData: Array<{ toolName: string; data: string; error?: string }>,
    conversationHistory: { role: string; parts: { text: string }[] }[],
    systemPromptsText: string,
    accumulatedContext?: AccumulatedContext
  ): string {
    let prompt = `${systemPromptsText}You are synthesizing an answer for the user query: "${query}"`;

    if (accumulatedContext && accumulatedContext.content) {
      prompt += `\n\nACCUMULATED CONTEXT FROM PREVIOUS TOOLS (use for broader understanding and to connect information. From sources: [${accumulatedContext.sources.join(', ')}]):\n${accumulatedContext.content}\n`;
       if (accumulatedContext.searchSuggestionsHtmlToPreserve) {
        prompt += `\nNOTE: Search suggestions from a previous web search are being preserved and will be added to your synthesized answer automatically if appropriate. Do not duplicate them in your 'synthesizedAnswer' output.\n`;
      }
    }

    prompt += `\nYou have received data from multiple sources executed in parallel for the current query stage:\n`;
    collectedData.forEach(item => {
      prompt += `\n### Data from ${item.toolName}:\n`;
      if (item.error) {
        prompt += `Error reported by ${item.toolName}: ${item.error}\n`;
      } else if (item.data) {
        prompt += `${item.data}\n`;
      } else {
        prompt += `No specific data returned by ${item.toolName}.\n`;
      }
    });

    prompt += `\nCONVERSATION HISTORY (for context):\n`;
    if (conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.parts[0].text}\n`;
      });
    } else {
      prompt += "No prior conversation history.\n";
    }

    prompt += `
TASK:
1. Analyze ALL the provided data from the different sources AND any accumulated context in the context of the user query and conversation history.
2. Synthesize a single, comprehensive, and helpful answer for the user.
3. If some sources provided errors or irrelevant data, acknowledge if necessary but focus on the useful information.
4. If no source provided useful information, and accumulated context is also unhelpful, state that you couldn't find the answer.
5. The output from this synthesis will be treated as a FINAL_ANSWER for this stage.
6. Respond in JSON format ONLY, matching this schema:
   \`\`\`json
   {
     "synthesizedAnswer": "Your single, comprehensive, and helpful answer for the user, formatted using proper markdown.",
     "reasoning": "string (OPTIONAL: Briefly explain how you synthesized the information or why an answer couldn't be formed.)"
   }
   \`\`\`
Ensure your entire response is a single, valid JSON object.
`;
    return prompt;
  }
}

// --- TOOL EXECUTORS ---

class NoToolExecutor implements IToolExecutor {
  public name = "no_tool";

  async execute(params: ToolExecutionParams): Promise<ToolExecutionResult> {
    console.log(`[NoToolExecutor] Executing direct response. Accumulated context: ${params.accumulatedContext?.content.length || 0} chars.`);
    const systemPromptsText = combineSystemPrompts(params.systemPrompts);
    
    // Check for preserved search sources in accumulated context and extract them
    let searchSources = params.accumulatedContext?.searchSuggestionsHtmlToPreserve;
    let cleanedContext = params.accumulatedContext?.content;
    
    if (cleanedContext) {
      const sourceMatch = cleanedContext.match(/<!-- PRESERVED_SEARCH_SOURCES:([\s\S]*?) -->/i);
      if (sourceMatch) {
        // If we find sources in the content and don't already have them, use them
        if (!searchSources) {
          searchSources = sourceMatch[1];
          console.log(`[NoToolExecutor] Found preserved search sources in accumulated context.`);
        }
        
        // Remove the preserved sources comment from the context for the prompt
        cleanedContext = cleanedContext.replace(/<!-- PRESERVED_SEARCH_SOURCES:[\s\S]*? -->/gi, '');
        if (params.accumulatedContext) {
          params.accumulatedContext.content = cleanedContext;
        }
      }
    }
    
    const directPrompt = PromptFactory.generateToolExecutionPrompt(
        params.query,
        this.name,
        `Using general knowledge and accumulated context to generate a response. The user's query is: "${params.query}"`,
        params.remainingTools,
        params.conversationHistory,
        systemPromptsText,
        params.accumulatedContext,
        params.nextToolGroup
    );

    try {
      const model = params.genAI.getGenerativeModel({ model: params.selectedModel || DEFAULT_MODEL_NAME, generationConfig: getGenerationConfigForJson() });
      const response = await model.generateContent(directPrompt);
      const responseText = response.response.text();
      const parsedDecision = parseToolExecutionDecision(responseText);

      if ('error' in parsedDecision) {
        throw new Error(parsedDecision.error);
      }
      
      console.log(`[NoToolExecutor] LLM Decision: responseType='${parsedDecision.responseType}', contentLen=${parsedDecision.content.length}, contextToAddLen=${parsedDecision.contextToPreserve?.length || 0}. Reasoning: "${parsedDecision.reasoning.substring(0,100)}..."`);
      
      // Create result with all standard fields
      const result = createToolResult(
        this.name,
        parsedDecision.content,
        parsedDecision.responseType,
        parsedDecision.contextToPreserve,
        undefined,
        undefined, // NoToolExecutor doesn't generate its own search suggestions
        searchSources // Use the extracted search sources
      );
      
      // For synthesis in parallel execution, provide the direct answer content
      // This ensures the synthesis has access to the complete direct response
      result.synthesisData = parsedDecision.content;
      
      // If there's context to preserve, include it in the synthesis data
      if (parsedDecision.contextToPreserve) {
        result.synthesisData += `\n\nAdditional context: ${parsedDecision.contextToPreserve}`;
      }
      
      return result;
    } catch (error: any) {
      console.error(`[NoToolExecutor] LLM Error or Parsing Error: ${error.message || String(error)}`);
      return createToolResult(
        this.name,
        "I'm sorry, I encountered an error in processing your request.",
        "FINAL_ANSWER", // Fallback to final answer on error
        undefined,
        error.message || String(error),
        undefined,
        searchSources // Use the extracted search sources
      );
    }
  }
}

class WebSearchExecutor implements IToolExecutor {
  public name = "search_web";

  async execute(params: ToolExecutionParams): Promise<ToolExecutionResult> {
    console.log(`[WebSearchExecutor] Executing for query: "${params.query.substring(0, 50)}..." Accumulated context: ${params.accumulatedContext?.content.length || 0} chars.`);
    await updateProcessingPhase(params.ctx, params.messageId, "Searching web", this.name);

    const systemPromptsText = combineSystemPrompts(params.systemPrompts);
    const googleSearchTool: GoogleSearchTool = { googleSearch: {} };
    
    // as the LLM's response will be natural language possibly augmented by tool output.
    // The subsequent call in this executor *to decide what to do with the search results* WILL use JSON mode.
    const modelConfig: ModelConfig = {
      model: params.selectedModel || DEFAULT_MODEL_NAME,
      tools: [googleSearchTool],
      // systemInstruction: systemPromptsText, // Some models prefer system instruction here
    };
    const searchModel = params.genAI.getGenerativeModel(modelConfig);
    const chat = searchModel.startChat({ tools: [googleSearchTool] as GenAITool[], history: params.conversationHistory.slice(0, -1) });
    
    // This first prompt is to GET search results
    const searchInvocationPrompt = `Based on the query "${params.query}" and conversation history, perform a web search. Prioritize concise and directly relevant information.
    ${params.accumulatedContext?.content ? `\nConsider this accumulated context: ${params.accumulatedContext.content.substring(0,500)}...\n` : ''}
    ${systemPromptsText}
    Please provide the search results.`;

    let searchResultsText: string;
    let searchSuggestionsHtml: string | undefined;

    try {
        console.log(`[WebSearchExecutor] Sending search invocation prompt to LLM.`);
        const searchResponse = await chat.sendMessage(searchInvocationPrompt);
        searchResultsText = searchResponse.response.text();
        console.log(`[WebSearchExecutor] Received search results text (len: ${searchResultsText.length}).`);

        // Extract search suggestions if available (this part remains similar)
        const responseAny = searchResponse as any; // To access groundingMetadata
        if (responseAny.response.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent) {
            searchSuggestionsHtml = responseAny.response.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
            console.log(`[WebSearchExecutor] Extracted search suggestions HTML (len: ${searchSuggestionsHtml?.length}).`);
        }
    } catch (error: any) {
        console.error(`[WebSearchExecutor] Error during web search LLM call: ${error.message || String(error)}`);
        return createToolResult(
            this.name,
            "Sorry, I encountered an issue during web search.",
            "TRY_NEXT_TOOL", // Suggest trying next tool on search failure
            undefined,
            `Search LLM Error: ${error.message || String(error)}`,
            undefined,
            params.accumulatedContext?.searchSuggestionsHtmlToPreserve
        );
    }

    // Now, send the search results to another LLM call to decide what to do (using JSON mode)
    const decisionPrompt = PromptFactory.generateToolExecutionPrompt(
        params.query,
        this.name,
        `Web search results for "${params.query}":\n${searchResultsText}`,
        params.remainingTools,
        params.conversationHistory,
        systemPromptsText,
        params.accumulatedContext,
        params.nextToolGroup
    );
    
    try {
      console.log(`[WebSearchExecutor] Sending search results analysis prompt to LLM for decision.`);
      const decisionModel = params.genAI.getGenerativeModel({ model: params.selectedModel || DEFAULT_MODEL_NAME, generationConfig: getGenerationConfigForJson() });
      const decisionResponse = await decisionModel.generateContent(decisionPrompt);
      const decisionResponseText = decisionResponse.response.text();
      const parsedDecision = parseToolExecutionDecision(decisionResponseText);

      if ('error' in parsedDecision) {
        throw new Error(parsedDecision.error);
      }
      
      console.log(`[WebSearchExecutor] LLM Decision: responseType='${parsedDecision.responseType}', contentLen=${parsedDecision.content.length}, contextToAddLen=${parsedDecision.contextToPreserve?.length || 0}. Reasoning: "${parsedDecision.reasoning.substring(0,100)}..."`);

      // Auto-extract context if TRY_NEXT_TOOL but useful info exists (heuristic)
      let finalContextToPreserve = parsedDecision.contextToPreserve;
      let finalResponseType = parsedDecision.responseType;

      if (
          (parsedDecision.responseType === "TRY_NEXT_TOOL" || (parsedDecision.responseType === "TRY_NEXT_TOOL_AND_ADD_CONTEXT" && !parsedDecision.contextToPreserve)) &&
          searchResultsText.trim().length > 20 // If we got some search results
      ) {
          console.log(`[WebSearchExecutor] Heuristic: Has search results but LLM chose TRY_NEXT_TOOL or TRY_NEXT_TOOL_AND_ADD_CONTEXT without context. Auto-adding search summary.`);
          finalResponseType = "TRY_NEXT_TOOL_AND_ADD_CONTEXT";
          finalContextToPreserve = (finalContextToPreserve ? finalContextToPreserve + "\n\n" : "") + 
                                   `Summary from web search for "${params.query}":\n${searchResultsText.substring(0, Math.min(searchResultsText.length, 1500))}${searchResultsText.length > 1500 ? '... (truncated)' : ''}`;
      }
      
      const result = createToolResult(
        this.name,
        parsedDecision.content,
        finalResponseType,
        finalContextToPreserve,
        undefined,
        searchSuggestionsHtml, // Pass along the extracted HTML
        params.accumulatedContext?.searchSuggestionsHtmlToPreserve
      );
      
      // For synthesis in parallel execution, provide the complete search results
      // This ensures the synthesis has access to all relevant data
      result.synthesisData = `Web search results for "${params.query}":\n${searchResultsText}`;
      
      return result;
    } catch (error: any) {
      console.error(`[WebSearchExecutor] LLM Error or Parsing Error on decision: ${error.message || String(error)}`);
      return createToolResult(
        this.name,
        "Sorry, I encountered an issue processing the web search results.",
        "TRY_NEXT_TOOL",
        undefined,
        `Decision LLM Error: ${error.message || String(error)}`,
        searchSuggestionsHtml, // Still pass if we got them
        params.accumulatedContext?.searchSuggestionsHtmlToPreserve
      );
    }
  }
}

class DatabaseQueryExecutor implements IToolExecutor {
  public name: string;
  private databaseInternalName: string;
  private readableName: string;

  constructor(toolName: string, databaseInternalName: string, readableName: string) {
    this.name = toolName;
    this.databaseInternalName = databaseInternalName;
    this.readableName = readableName;
  }

  private async fetchDatabaseContent(ctx: ConvexActionCtx): Promise<{ content: LawDatabase | null; error?: string }> {
    try {
      const dbResult = await ctx.runQuery(api.lawDatabases.getLawDatabaseContentByName, {
        name: this.databaseInternalName,
      });

      if (dbResult.success && dbResult.database?.content) {
        // Basic validation, assuming LawDatabase is an object
        if (typeof dbResult.database.content !== 'object' || dbResult.database.content === null) {
             return { content: null, error: `The ${this.readableName} database content is not in the expected object format.` };
        }
        return { content: dbResult.database.content as LawDatabase };
      } else {
        const errorMessage = dbResult.error || `Failed to retrieve or parse content from ${this.readableName} database.`;
        console.warn(`[${this.name}] Database fetch warning: ${errorMessage}`);
        return { content: null, error: errorMessage };
      }
    } catch (error: any) {
      console.error(`[${this.name}] Error fetching database ${this.readableName}: ${error.message || String(error)}`);
      return { content: null, error: error.message || `An error occurred while accessing the ${this.readableName} database.` };
    }
  }
  
  async fetchRawData(ctx: ConvexActionCtx): Promise<{ toolName: string; data: string; error?: string; dbSize?: number }> {
    await updateProcessingPhase(ctx, undefined, `Fetching ${this.readableName} content`, this.name); // messageId is undefined here
    const dbFetchResult = await this.fetchDatabaseContent(ctx);
    if (dbFetchResult.content) {
        const jsonData = JSON.stringify(dbFetchResult.content, null, 2); // Limit size for prompt if necessary
        // Consider truncating jsonData if it's extremely large, or using a more sophisticated chunking/RAG approach
        const MAX_DATA_SIZE_FOR_PROMPT = 50000000000; // Example limit
        const truncatedJsonData = jsonData.length > MAX_DATA_SIZE_FOR_PROMPT ? jsonData.substring(0, MAX_DATA_SIZE_FOR_PROMPT) + "\n... (data truncated)" : jsonData;

        console.log(`[${this.name}] Fetched raw data (${truncatedJsonData.length} chars, original ${jsonData.length}) for parallel processing.`);
        return { toolName: this.name, data: truncatedJsonData, dbSize: jsonData.length };
    }
    console.warn(`[${this.name}] Failed to fetch raw data. Error: ${dbFetchResult.error}`);
    return { toolName: this.name, data: "", error: dbFetchResult.error || "Unknown error fetching data." };
  }

  async execute(params: ToolExecutionParams): Promise<ToolExecutionResult> {
    console.log(`[${this.name}] Executing for query: "${params.query.substring(0, 50)}..." Accumulated context: ${params.accumulatedContext?.content.length || 0} chars.`);
    await updateProcessingPhase(params.ctx, params.messageId, `Querying ${this.readableName} database`, this.name);

    const dbFetchResult = await this.fetchDatabaseContent(params.ctx);
    let toolDataForPrompt: string;

    if (dbFetchResult.content) {
      const jsonData = JSON.stringify(dbFetchResult.content, null, 2);
      // No longer truncating the database content to ensure all chapters are accessible
      // The LLM context window should be large enough to handle the full database
      toolDataForPrompt = `Contents of ${this.readableName} (JSON format) related to the query:\n\`\`\`json\n${jsonData}\n\`\`\``;
      console.log(`[${this.name}] Database content loaded for LLM analysis (${toolDataForPrompt.length} chars, full content).`);
    } else {
      toolDataForPrompt = `Error accessing or processing data from ${this.readableName}: ${dbFetchResult.error}. Inform the user if this prevents answering the query or try another tool.`;
      console.warn(`[${this.name}] ${toolDataForPrompt}`);
    }
    
    const systemPromptsText = combineSystemPrompts(params.systemPrompts);
    const dbPrompt = PromptFactory.generateToolExecutionPrompt(
      params.query,
      this.name,
      toolDataForPrompt,
      params.remainingTools,
      params.conversationHistory,
      systemPromptsText,
      params.accumulatedContext,
      params.nextToolGroup
    );

    try {
      const model = params.genAI.getGenerativeModel({ model: params.selectedModel || DEFAULT_MODEL_NAME, generationConfig: getGenerationConfigForJson() });
      const response = await model.generateContent(dbPrompt);
      const responseText = response.response.text();
      const parsedDecision = parseToolExecutionDecision(responseText);

      if ('error' in parsedDecision) {
        throw new Error(parsedDecision.error);
      }
      
      console.log(`[${this.name}] LLM Decision: responseType='${parsedDecision.responseType}', contentLen=${parsedDecision.content.length}, contextToAddLen=${parsedDecision.contextToPreserve?.length || 0}. Reasoning: "${parsedDecision.reasoning.substring(0,100)}..."`);
      
      // Create result with standard fields
      const result = createToolResult(
        this.name,
        parsedDecision.content,
        parsedDecision.responseType,
        parsedDecision.contextToPreserve,
        dbFetchResult.error && parsedDecision.responseType !== "FINAL_ANSWER" ? `Underlying DB issue: ${dbFetchResult.error}` : undefined,
        undefined, // Database queries don't generate search suggestions themselves
        params.accumulatedContext?.searchSuggestionsHtmlToPreserve
      );
      
      // For synthesis in parallel execution, provide the actual database content
      // This ensures the synthesis has access to the database data for better context
      if (dbFetchResult.content) {
        const jsonData = JSON.stringify(dbFetchResult.content, null, 2);
        // Use a larger size limit for synthesis data than for prompts
        const MAX_SIZE_FOR_SYNTHESIS = 100000;
        const truncatedData = jsonData.length > MAX_SIZE_FOR_SYNTHESIS ? 
          jsonData.substring(0, MAX_SIZE_FOR_SYNTHESIS) + "\n... (data truncated for synthesis)" : jsonData;
        
        result.synthesisData = `${this.readableName} database content:\n\`\`\`json\n${truncatedData}\n\`\`\``;
      } else if (dbFetchResult.error) {
        result.synthesisData = `Error accessing ${this.readableName} database: ${dbFetchResult.error}`;
      }
      
      return result;
    } catch (error: any) {
      console.error(`[${this.name}] LLM Error or Parsing Error: ${error.message || String(error)}`);
      return createToolResult(
        this.name,
        `I encountered an issue while searching the ${this.readableName} database.`,
        "TRY_NEXT_TOOL",
        undefined,
        `LLM/Parsing Error: ${error.message || String(error)}${dbFetchResult.error ? '; DB Error: ' + dbFetchResult.error : ''}`,
        undefined,
        params.accumulatedContext?.searchSuggestionsHtmlToPreserve
      );
    }
  }
}

// --- TOOL EXECUTOR REGISTRY ---
const toolExecutors: Record<string, IToolExecutor> = {
  "no_tool": new NoToolExecutor(),
  "search_web": new WebSearchExecutor(),
  "query_law_on_insurance": new DatabaseQueryExecutor("query_law_on_insurance", "Law_on_Insurance", "Law on Insurance"),
  "query_law_on_consumer_protection": new DatabaseQueryExecutor("query_law_on_consumer_protection", "Law_on_Consumer_Protection", "Law on Consumer Protection"),
  "query_insurance_qna": new DatabaseQueryExecutor("query_insurance_qna", "Insurance_and_reinsurance_in_Cambodia_QnA_format", "Insurance Q&A"),
};

// --- CORE LOGIC FUNCTIONS ---

/**
 * Parses the AI's ranking response from natural language format.
 * This is optimized for speed and flexibility, not requiring strict JSON format.
 */
const parseToolGroupsFromNaturalLanguage = (responseText: string, allToolNames: string[]): RankingResult => {
    try {
        console.log(`[parseToolGroupsFromNaturalLanguage] Parsing response with length ${responseText.length}`);
        const rankedToolGroups: string[][] = [];
        const rankedToolsSet = new Set<string>();
        let directResponse: string | undefined;
        
        // Extract groups using regex patterns
        // Look for patterns like "[1] search_web, query_law_on_insurance" or "1. search_web"
        const groupPatterns = [
            /\[(\d+)\]\s*([^\n]+)/gm,  // Matches [1] tool1, tool2
            /(?:Group|Group Priority|Priority|Rank)\s*(\d+)\s*[:\-]\s*([^\n]+)/gi,
            /(?:Tools|Tool Group|Tools Group)\s*(\d+)\s*[:\-]\s*([^\n]+)/gi,
            /(?:\b|^)(\d+)[.\)]\s*([^\n]+)/gm,
        ];
        
        // Also look for direct answers
        const directResponsePatterns = [
            /(?:Direct\s*Response|Direct\s*Answer)\s*[:\-]\s*([^\n]+(?:\n(?!Group|Tools|\d+[.\)])[^\n]+)*)/i,
            /(?:Answer without tools|No tools needed)\s*[:\-]\s*([^\n]+(?:\n(?!Group|Tools|\d+[.\)])[^\n]+)*)/i,
        ];
        
        // Try to extract direct response
        for (const pattern of directResponsePatterns) {
            const match = responseText.match(pattern);
            if (match && match[1]) {
                directResponse = match[1].trim();
                console.log(`[parseToolGroupsFromNaturalLanguage] Found direct response: "${directResponse.substring(0, 100)}..."`);
                break;
            }
        }
        
        // Extract all tool groups with their priority
        const groupMatches = new Map<number, string[]>();
        
        for (const pattern of groupPatterns) {
            let match;
            while ((match = pattern.exec(responseText)) !== null) {
                if (match.length >= 3) {
                    const rank = parseInt(match[1], 10);
                    const toolsText = match[2].trim();
                    
                    // Extract tool names from the tools text
                    // Look for words that match available tool names
                    const extractedTools: string[] = [];
                    
                    // Split by common delimiters and check each part
                    const parts = toolsText.split(/[,;\s]+/);
                    for (const part of parts) {
                        const cleanPart = part.trim().toLowerCase();
                        
                        // Try to match with available tool names - prioritize exact matches first
                        let foundMatch = false;
                        
                        // First pass: Look for exact matches (highest confidence)
                        for (const toolName of allToolNames) {
                            if (cleanPart === toolName.toLowerCase()) {
                                if (!rankedToolsSet.has(toolName)) {
                                    extractedTools.push(toolName);
                                    rankedToolsSet.add(toolName);
                                    foundMatch = true;
                                }
                                break;
                            }
                        }
                        
                        // Second pass: Only if no exact match was found, try partial matches with minimum length
                        if (!foundMatch && cleanPart.length >= 4) {
                            for (const toolName of allToolNames) {
                                // Check if the tool name contains the clean part or vice versa
                                // But only for substantial matches (4+ chars)
                                if (toolName.toLowerCase().includes(cleanPart) || 
                                    cleanPart.includes(toolName.toLowerCase())) {
                                    if (!rankedToolsSet.has(toolName)) {
                                        extractedTools.push(toolName);
                                        rankedToolsSet.add(toolName);
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (extractedTools.length > 0) {
                        groupMatches.set(rank, extractedTools);
                    }
                }
            }
        }
        
        // Sort groups by rank and add them to the result
        const sortedRanks = Array.from(groupMatches.keys()).sort((a, b) => a - b);
        for (const rank of sortedRanks) {
            const tools = groupMatches.get(rank);
            if (tools && tools.length > 0) {
                rankedToolGroups.push(tools);
            }
        }
        
        // Add any unranked tools to the end, 'no_tool' last among them
        const unrankedTools = allToolNames.filter(tool => !rankedToolsSet.has(tool));
        if (unrankedTools.length > 0) {
            console.log(`[parseToolGroupsFromNaturalLanguage] Tools not ranked by AI: ${unrankedTools.join(', ')}. Adding them as individual trailing groups.`);
            const noToolIndex = unrankedTools.indexOf("no_tool");
            if (noToolIndex > -1) {
                unrankedTools.splice(noToolIndex, 1); // Remove no_tool
                unrankedTools.push("no_tool");      // Add it to the very end of unranked
            }
            unrankedTools.forEach(tool => rankedToolGroups.push([tool]));
        }
        
        // If there's a direct response, ensure no_tool is prioritized at the beginning
        if (directResponse) {
            console.log(`[parseToolGroupsFromNaturalLanguage] Direct response found, prioritizing no_tool`);
            
            // First, remove no_tool from wherever it is in the groups
            let noToolRemoved = false;
            for (let i = 0; i < rankedToolGroups.length; i++) {
                const groupIndex = rankedToolGroups[i].indexOf("no_tool");
                if (groupIndex >= 0) {
                    rankedToolGroups[i].splice(groupIndex, 1);
                    noToolRemoved = true;
                    // Remove empty groups
                    if (rankedToolGroups[i].length === 0) {
                        rankedToolGroups.splice(i, 1);
                        i--;
                    }
                }
            }
            
            // Add no_tool as the first tool in the first group
            if (rankedToolGroups.length === 0) {
                rankedToolGroups.push(["no_tool"]);
            } else {
                rankedToolGroups.unshift(["no_tool"]);
            }
            
            console.log(`[parseToolGroupsFromNaturalLanguage] Prioritized no_tool for direct response.`);
        }
        
        if (rankedToolGroups.length === 0) { // Should not happen if unranked tools are added
            console.warn('[parseToolGroupsFromNaturalLanguage] No valid tool groups parsed. This is unexpected.');
            return { rankedToolGroups: [allToolNames.includes("search_web") ? ["search_web"] : [allToolNames[0]] ] }; // Basic fallback
        }
        
        console.log(`[parseToolGroupsFromNaturalLanguage] Final tool groups: ${JSON.stringify(rankedToolGroups)}`);
        return {
            rankedToolGroups,
            directResponse: directResponse,
        };
    } catch (e: any) {
        console.error(`[parseToolGroupsFromNaturalLanguage] Error parsing LLM ranking: ${e.message}. Response: "${responseText.substring(0, 300)}..."`);
        // Fallback to a default ranking on error
        return {
            rankedToolGroups: [["search_web"], ["query_law_on_insurance", "query_law_on_consumer_protection", "query_insurance_qna"], ["no_tool"]].filter(group => group.every(tool => allToolNames.includes(tool))) // Ensure tools exist
        };
    }
};

/**
 * Parses the AI's JSON ranking response.
 * This is the original JSON-based parser, kept for compatibility.
 */
const parseToolGroupsFromLLMJson = (responseText: string, allToolNames: string[]): RankingResult => {
    try {
        const parsed = parseLLMJson<LLMRankingDecision>(responseText, "RankingDecision", isLLMRankingDecision);
        
        if ('error' in parsed) {
            throw new Error(parsed.error);
        }

        const rankedToolGroups: string[][] = [];
        const rankedToolsSet = new Set<string>();

        // Sort groups by rank just in case LLM doesn't order them
        parsed.toolGroups.sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));

        for (const group of parsed.toolGroups) {
            if (!group || !Array.isArray(group.toolNames) || typeof group.rank !== 'number') {
                console.warn("[parseToolGroupsFromLLMJson] Skipping invalid group in LLM response:", group);
                continue;
            }
            const validToolNamesInGroup = group.toolNames.filter(name => {
                if (allToolNames.includes(name)) {
                    if (rankedToolsSet.has(name)) {
                        console.warn(`[parseToolGroupsFromLLMJson] Tool '${name}' ranked multiple times. Using first occurrence.`);
                        return false;
                    }
                    return true;
                }
                console.warn(`[parseToolGroupsFromLLMJson] Invalid or unknown tool name in ranking: '${name}'`);
                return false;
            });

            if (validToolNamesInGroup.length > 0) {
                rankedToolGroups.push(validToolNamesInGroup);
                validToolNamesInGroup.forEach(name => rankedToolsSet.add(name));
            }
        }
        
        // Add any unranked tools to the end, 'no_tool' last among them
        const unrankedTools = allToolNames.filter(tool => !rankedToolsSet.has(tool));
        if (unrankedTools.length > 0) {
            console.log(`[parseToolGroupsFromLLMJson] Tools not ranked by AI: ${unrankedTools.join(', ')}. Adding them as individual trailing groups.`);
            const noToolIndex = unrankedTools.indexOf("no_tool");
            if (noToolIndex > -1) {
                unrankedTools.splice(noToolIndex, 1); // Remove no_tool
                unrankedTools.push("no_tool");      // Add it to the very end of unranked
            }
            unrankedTools.forEach(tool => rankedToolGroups.push([tool]));
        }
        
        if (rankedToolGroups.length === 0) { // Should not happen if unranked tools are added
             console.warn('[parseToolGroupsFromLLMJson] No valid tool groups parsed. This is unexpected.');
             return { rankedToolGroups: [allToolNames.includes("search_web") ? ["search_web"] : [allToolNames[0]] ] }; // Basic fallback
        }

        console.log(`[parseToolGroupsFromLLMJson] Final tool groups: ${JSON.stringify(rankedToolGroups)}`);
        return {
            rankedToolGroups,
            directResponse: parsed.directResponse?.trim() || undefined,
        };

    } catch (e: any) {
        console.error(`[parseToolGroupsFromLLMJson] Error parsing LLM JSON ranking: ${e.message}. Response: "${responseText.substring(0, 500)}..."`);
        // Fallback to a default ranking on error
        return {
            rankedToolGroups: [["search_web"], ["query_law_on_insurance", "query_law_on_consumer_protection", "query_insurance_qna"], ["no_tool"]].filter(group => group.every(tool => allToolNames.includes(tool))) // Ensure tools exist
        };
    }
};


export const rankInformationSources = async (
  userMessage: string,
  history: { role: string; parts: { text: string }[] }[],
  selectedModel: string | undefined, // This param is kept, but RANKING_MODEL_NAME is used
  genAI: GoogleGenerativeAI,
  systemPrompts?: SystemPrompts
): Promise<RankingResult> => {
  console.log(`[rankInformationSources] Ranking tools for query: '${userMessage.substring(0, 100)}...'`);
  
  // Use the fast model with natural language output (no JSON config) for better performance
  const model = genAI.getGenerativeModel({ model: RANKING_MODEL_NAME });
  const systemPromptsText = combineSystemPrompts(systemPrompts);
  
  // Generate a natural language ranking prompt instead of asking for JSON
  const rankingPrompt = PromptFactory.generateNaturalLanguageRankingPrompt(userMessage, history, AVAILABLE_TOOLS, systemPromptsText);
  // console.log(`[rankInformationSources] Generated ranking prompt (length: ${rankingPrompt.length}). First 300 chars: ${rankingPrompt.substring(0,300)}`);

  // Move this outside the try block so it's available in the catch block too
  const allToolNames = AVAILABLE_TOOLS.map(t => t.name);
  
  try {
    const startTime = Date.now();
    const response = await model.generateContent(rankingPrompt);
    const responseText = response.response.text();
    console.log(`[rankInformationSources] AI ranking response received in ${Date.now() - startTime}ms. Response text (first 500 chars): \n${responseText.substring(0,500)}`);
    
    // Use the natural language parser for faster processing
    const parsedRanking = parseToolGroupsFromNaturalLanguage(responseText, allToolNames);
    
    // Special handling: if directResponse is provided and no_tool is first, it might be the final answer.
    if (parsedRanking.directResponse && 
        parsedRanking.rankedToolGroups.length > 0 && 
        parsedRanking.rankedToolGroups[0].length === 1 && 
        parsedRanking.rankedToolGroups[0][0] === "no_tool") {
      console.log(`[rankInformationSources] Extracted direct response (${parsedRanking.directResponse.length} chars).`);
      // This directResponse will be handled by the calling function if it wants to use it immediately.
    }
    return parsedRanking;
  } catch (error: any) {
    console.error(`[rankInformationSources] Error: ${error.message}. Prompt: \n${rankingPrompt.substring(0,300)}...`);
    console.log("[rankInformationSources] Falling back to default ranking.");
    const defaultGroups = [["search_web"], ["query_law_on_insurance", "query_law_on_consumer_protection", "query_insurance_qna"], ["no_tool"]];
    return {
      rankedToolGroups: defaultGroups.filter(group => group.every(tool => allToolNames.includes(tool) && toolExecutors[tool]))
    };
  }
};

export const executeToolsByGroup = async (
  toolGroups: string[][], query: string, ctx: ConvexActionCtx, genAI: GoogleGenerativeAI,
  selectedModel: string | undefined, conversationHistory: { role: string; parts: { text: string }[] }[] = [],
  systemPrompts?: SystemPrompts, messageId?: string, initialContext?: string
): Promise<ToolExecutionResult> => {
  console.log(`[executeToolsByGroup] Start: ${toolGroups.length} groups for query: "${query.substring(0,100)}..."`);
  
  const accumulatedContext: AccumulatedContext = {
    sources: initialContext ? ['initial_context'] : [],
    content: initialContext || "",
    searchSuggestionsHtmlToPreserve: undefined // Initialize
  };
  
  if (initialContext) console.log(`[executeToolsByGroup] Initial context: ${initialContext.length} chars.`);

  for (let groupIndex = 0; groupIndex < toolGroups.length; groupIndex++) {
    const toolGroup = toolGroups[groupIndex];
    const remainingToolGroups = toolGroups.slice(groupIndex + 1);
    const remainingToolsForPrompt = remainingToolGroups.flat();
    const nextToolGroup = remainingToolGroups[0] || [];

    console.log(`[executeToolsByGroup] Group ${groupIndex + 1}/${toolGroups.length}: [${toolGroup.join(', ')}]. Accumulated context: ${accumulatedContext.content.length} chars from [${accumulatedContext.sources.join(', ')}]. Preserved suggestions: ${!!accumulatedContext.searchSuggestionsHtmlToPreserve}`);

    const executionParamsBase: Omit<ToolExecutionParams, 'remainingTools' | 'nextToolGroup' | 'accumulatedContext'> = {
        query, ctx, genAI, selectedModel, conversationHistory, systemPrompts, messageId
    };

    if (toolGroup.length === 1) { // Single tool execution
      const toolName = toolGroup[0];
      const executor = toolExecutors[toolName];
      if (!executor) {
        console.warn(`[executeToolsByGroup] Unknown tool '${toolName}' in single group. Skipping.`);
        continue;
      }
      
      console.log(`[executeToolsByGroup] Executing single tool: ${toolName}`);
      const result = await executor.execute({ 
        ...executionParamsBase, 
        remainingTools: remainingToolsForPrompt,
        nextToolGroup: nextToolGroup,
        accumulatedContext: { ...accumulatedContext } // Pass a copy
      });
      
      console.log(`[executeToolsByGroup] Result from ${toolName}: type='${result.responseType}', contentLen=${result.content.length}, contextToAddLen=${result.contextToAdd?.length || 0}, suggestions: ${!!result.searchSuggestionsHtml}`);

      if (result.searchSuggestionsHtml) {
        accumulatedContext.searchSuggestionsHtmlToPreserve = result.searchSuggestionsHtml;
        accumulatedContext.content += `\n\n<!-- PRESERVED_SEARCH_SOURCES:${result.searchSuggestionsHtml} -->`;
        console.log(`[executeToolsByGroup] Preserved search suggestions from ${toolName}.`);
      }

      if (result.responseType === "FINAL_ANSWER") {
        console.log(`[executeToolsByGroup] FINAL_ANSWER from ${toolName}. Returning.`);
        return createToolResult(
          result.source, result.content, "FINAL_ANSWER", undefined, result.error,
          undefined, // searchSuggestionsHtml already in result.content or handled by finalSuggestionsHtmlToPreserve
          accumulatedContext.searchSuggestionsHtmlToPreserve // This ensures it's added if not already
        );
      } else if (result.responseType === "TRY_NEXT_TOOL_AND_ADD_CONTEXT" && result.contextToAdd?.trim()) {
          accumulatedContext.sources.push(toolName);
          accumulatedContext.content += (accumulatedContext.content ? "\n\n" : "") + 
            `--- Context from ${toolName} ---\n${result.contextToAdd.trim()}`;
          console.log(`[executeToolsByGroup] Added context from ${toolName}. Total: ${accumulatedContext.content.length} chars.`);
      }
    
    } else { // Parallel tool execution
      console.log(`[executeToolsByGroup] Parallel tools: [${toolGroup.join(', ')}]`);
      await updateProcessingPhase(ctx, messageId, `Searching multiple sources`, "executeToolsByGroup-parallel");
      
      const dataCollectionPromises = toolGroup
        .map(toolName => {
            const executor = toolExecutors[toolName];
            if (!executor) {
                console.warn(`[executeToolsByGroup] Unknown tool '${toolName}' in parallel. Skipping.`);
                return Promise.resolve({ toolName, data: "", error: `Unknown tool: ${toolName}` });
            }
            if (executor instanceof DatabaseQueryExecutor) {
                return executor.fetchRawData(ctx);
            } else if (executor instanceof WebSearchExecutor || executor instanceof NoToolExecutor) {
                console.log(`[executeToolsByGroup] Executing ${executor.name} in parallel (will synthesize its output).`);
                // For parallel, we want the raw output that can be synthesized, not its decision to continue.
                // So, we treat its direct output as "data" for synthesis.
                return executor.execute({
                        ...executionParamsBase,
                        remainingTools: [], // No "remaining" in this sub-execution context
                        nextToolGroup: [],  // No "next group" in this sub-execution
                        accumulatedContext: { ...accumulatedContext } // Pass current accumulated context
                    }).then(res => {
                        // If WebSearch in parallel produced suggestions, capture them.
                        // The last one from a parallel group will win.
                        if (res.searchSuggestionsHtml) {
                            accumulatedContext.searchSuggestionsHtmlToPreserve = res.searchSuggestionsHtml;
                            accumulatedContext.content += `\n\n<!-- PRESERVED_SEARCH_SOURCES:${res.searchSuggestionsHtml} -->`;
                            console.log(`[executeToolsByGroup] Parallel ${executor.name} produced search suggestions, will preserve.`);
                        }
                        // For synthesis, prioritize the dedicated synthesisData field if available
                        // Otherwise fall back to content, and include contextToAdd if present
                        let synthesisData = res.synthesisData || res.content;
                        if (res.contextToAdd) {
                            synthesisData += `\n\n${res.contextToAdd}`;
                        }
                        return { toolName: executor.name, data: synthesisData, error: res.error };
                    });
            }
            console.warn(`[executeToolsByGroup] Tool ${toolName} not configured for parallel. Placeholder.`);
            return Promise.resolve({ toolName, data: "", error: `Tool ${toolName} not supported in parallel.` });
        });

      const collectedData = await Promise.all(dataCollectionPromises);
      console.log(`[executeToolsByGroup] Parallel data collection complete. Results: ${JSON.stringify(collectedData.map(r => ({tool: r.toolName, dataLen: r.data.length, err: !!r.error})))}`);
      
      const hasMeaningfulResults = collectedData.some(d => (d.data && d.data.trim().length > 10) || (d.error && !d.error.startsWith("Unknown tool")));
      if (!hasMeaningfulResults) {
        console.log(`[executeToolsByGroup] No meaningful data/errors from parallel group. Skipping synthesis.`);
        continue;
      }

      const systemPromptsText = combineSystemPrompts(systemPrompts);
      const synthesisPrompt = PromptFactory.generateParallelSynthesisPrompt(
        query, collectedData, conversationHistory, systemPromptsText, accumulatedContext
      );
      
      console.log(`[executeToolsByGroup] Sending parallel synthesis prompt (len: ${synthesisPrompt.length}).`);
      const model = genAI.getGenerativeModel({ model: selectedModel || DEFAULT_MODEL_NAME, generationConfig: getGenerationConfigForJson() });
      try {
        const response = await model.generateContent(synthesisPrompt);
        const parsedSynthesis = parseLLMJson<LLMParallelSynthesisResponse>(response.response.text(), "ParallelSynthesisResponse", isLLMParallelSynthesisResponse);

        if ('error' in parsedSynthesis) throw new Error(parsedSynthesis.error);

        console.log(`[executeToolsByGroup] Parallel synthesis successful (${parsedSynthesis.synthesizedAnswer.length} chars). FINAL for this group.`);
        return createToolResult("parallel_synthesis", parsedSynthesis.synthesizedAnswer, "FINAL_ANSWER",
            undefined, undefined, undefined, accumulatedContext.searchSuggestionsHtmlToPreserve
        );
      } catch(error: any) {
        console.error(`[executeToolsByGroup] Parallel synthesis error: ${error.message}. Prompt start:\n${synthesisPrompt.substring(0,300)}...`);
        console.log(`[executeToolsByGroup] Synthesis failed. Proceeding to next group.`);
        // Error in synthesis, try next group
      }
    }
  }

  console.log(`[executeToolsByGroup] All tool groups exhausted. Accumulated context: ${accumulatedContext.content.length} chars.`);
  
  if (accumulatedContext.content && accumulatedContext.content.trim().length > 10) {
    console.log("[executeToolsByGroup] Attempting final synthesis with NoToolExecutor using accumulated context.");
    try {
      const noToolExecutor = toolExecutors["no_tool"] as NoToolExecutor;
      if (noToolExecutor) {
        const finalSynthesisResult = await noToolExecutor.execute({
          query: `Based on all previously gathered information, provide a comprehensive answer or summary for the original query: "${query}"`,
          conversationHistory, genAI, selectedModel, systemPrompts, ctx,
          remainingTools: [], messageId,
          accumulatedContext: { ...accumulatedContext } // Pass copy
        });
        
        // Ensure this fallback is always FINAL_ANSWER
        console.log(`[executeToolsByGroup] NoToolExecutor (final synthesis) responded type: '${finalSynthesisResult.responseType}'. Forcing FINAL_ANSWER.`);
        return createToolResult(
            "final_synthesis_no_tool", finalSynthesisResult.content, "FINAL_ANSWER",
            undefined, finalSynthesisResult.error, undefined, accumulatedContext.searchSuggestionsHtmlToPreserve
        );
      }
    } catch (error: any) {
      console.error(`[executeToolsByGroup] Final synthesis error: ${error.message}`);
    }
  }

  console.log("[executeToolsByGroup] Returning standard fallback.");
  return createToolResult(
    "fallback_standard",
    "I've processed available information but couldn't formulate a specific answer. Please try rephrasing or adding details.",
    "FINAL_ANSWER", undefined, undefined, undefined, accumulatedContext.searchSuggestionsHtmlToPreserve
  );
};