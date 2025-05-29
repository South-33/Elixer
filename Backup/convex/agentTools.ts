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
  {
    name: "query_all_databases",
    description: "Query all available legal databases at once as a fallback option",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The query to search across all legal databases simultaneously"
        }
      },
      required: ["query"]
    }
  },
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

// Basic scoring function for law database queries
const calculateScore = (text: string, keywords: string[]) => {
  const lowerText = ensureString(text).toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      score++;
    }
  }
  return score;
};

// Process article content and calculate relevance score
const processArticleContent = (article: LawArticle, queryKeywords: string[]) => {
  let articleText = `Article ${ensureString(article.article_number)}: ${ensureString(article.content)}`;
  let articleScore = calculateScore(ensureString(article.content), queryKeywords);

  // Process all article properties
  if (article.points) {
    article.points.forEach(point => {
      if (calculateScore(ensureString(point), queryKeywords) > 0) {
        articleText += `\n  - ${ensureString(point)}`;
        articleScore += calculateScore(ensureString(point), queryKeywords);
      }
    });
  }
  
  if (article.definitions) {
    for (const term in article.definitions) {
      const definitionContent = ensureString(article.definitions[term]);
      if (calculateScore(ensureString(term), queryKeywords) > 0 || calculateScore(definitionContent, queryKeywords) > 0) {
        articleText += `\n  Definition of ${ensureString(term)}: ${definitionContent}`;
        articleScore += calculateScore(ensureString(term), queryKeywords) + calculateScore(definitionContent, queryKeywords);
      }
    }
  }
  
  // Add other article properties processing as needed
  
  return { articleText, articleScore };
};

// Query a law database and return relevant information based on the query
export const queryLawDatabase = async (
  query: string, 
  lawDatabase: LawDatabase,
  conversationHistory?: { role: string; parts: { text: string; }[] }[]
): Promise<string> => {
  if (!lawDatabase || !lawDatabase.chapters || !Array.isArray(lawDatabase.chapters)) {
    return "The database structure is invalid or empty.";
  }
  
  // Log conversation history for context
  if (conversationHistory && conversationHistory.length > 0) {
    console.log(`[queryLawDatabase] Using conversation history with ${conversationHistory.length} messages`);
    
    // Log recent messages for context visibility
    const recentMessages = conversationHistory.slice(-5); // Get the last 5 messages for context
    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i];
      const truncatedText = msg.parts[0]?.text.substring(0, 100);
      console.log(`[queryLawDatabase] Message ${i}: ${msg.role} - ${truncatedText}${msg.parts[0]?.text.length > 100 ? '...' : ''}`);
    }
  } else {
    console.log(`[queryLawDatabase] No conversation history available`);
  }
  
  // Format the conversation history for the AI
  let conversationContext = "";
  if (conversationHistory && conversationHistory.length > 0) {
    conversationContext = "\n\nConversation history:\n";
    const recentMessages = conversationHistory.slice(-5); // Last 5 messages for context
    for (const msg of recentMessages) {
      if (msg.role === "user") {
        conversationContext += `- User asked: "${msg.parts[0]?.text}"\n`;
      } else if (msg.role === "model") {
        conversationContext += `- AI responded about: "${msg.parts[0]?.text.substring(0, 100)}..."\n`;
      }
    }
  }
  
  // Define interface for article collection
  interface ArticleWithContext {
    article: LawArticle;
    chapter?: LawChapter;
    section?: LawSection;
  }

  // Collect all articles from the database
  let allArticles: ArticleWithContext[] = [];
  
  // Function to process articles from a chapter or section
  const processChapterArticles = (item: LawChapter | LawSection) => {
    if (item.articles && Array.isArray(item.articles)) {
      for (const article of item.articles) {
        // Log article details to help with debugging
        if (parseInt(article.article_number) <= 5) {
          console.log(`[queryLawDatabase] Raw article ${article.article_number} data:`, JSON.stringify(article, null, 2));
        }
        
        if ('chapter_number' in item) {
          // This is a LawChapter
          allArticles.push({
            article: article,
            chapter: item as LawChapter
          });
        } else {
          // This is a LawSection
          allArticles.push({
            article: article,
            section: item as LawSection
          });
        }
      }
    }
    
    // Check sections if this is a chapter
    if ('chapter_number' in item && item.sections && Array.isArray(item.sections)) {
      for (const section of item.sections) {
        if (section.articles && Array.isArray(section.articles)) {
          for (const article of section.articles) {
            allArticles.push({
              article: article,
              chapter: item as LawChapter,
              section: section
            });
          }
        }
      }
    }
  };
  
  // Process all chapters
  for (const chapter of lawDatabase.chapters) {
    processChapterArticles(chapter);
  }
  
  console.log(`[queryLawDatabase] Processing all ${allArticles.length} articles from the database`);
  
  // Add detailed logging for the first few articles to debug the "cut off" issue
  for (let i = 0; i < Math.min(5, allArticles.length); i++) {
    const article = allArticles[i].article;
    console.log(`[queryLawDatabase] Article ${article.article_number} details:`);
    console.log(`  - Title: ${article.article_title || 'Untitled'}`);
    
    // Log the content length and preview
    if (typeof article.content === 'string') {
      console.log(`  - Content type: string`);
      console.log(`  - Content length: ${article.content.length} characters`);
      console.log(`  - Content preview: "${article.content.substring(0, 100)}${article.content.length > 100 ? '...' : ''}"`);
      console.log(`  - Full content: "${article.content}"`);
    } else if (Array.isArray(article.content)) {
      console.log(`  - Content type: array with ${article.content.length} paragraphs`);
      for (let j = 0; j < article.content.length; j++) {
        const paragraph = article.content[j];
        console.log(`    - Paragraph ${j+1} length: ${paragraph.length} characters`);
        console.log(`    - Paragraph ${j+1} preview: "${paragraph.substring(0, 100)}${paragraph.length > 100 ? '...' : ''}"`);
        console.log(`    - Paragraph ${j+1} full: "${paragraph}"`);
      }
    } else {
      console.log(`  - Content type: ${typeof article.content}`);
      console.log(`  - Content value: ${JSON.stringify(article.content)}`);
    }
  }
  
  // Format all articles to provide to the AI
  let formattedArticles = "";
  
  // Special handling for exact article number reference
  const articleNumberMatch = query.match(/article\s*(\d+)/i) || 
                             (conversationHistory && conversationHistory.length > 0 ? 
                               conversationHistory[conversationHistory.length - 1].parts[0]?.text.match(/article\s*(\d+)/i) : null);
                               
  // Log the raw database structure for debugging
  console.log(`[queryLawDatabase] Database structure overview:`);
  console.log(`  - Chapters count: ${lawDatabase.chapters?.length || 0}`);
  if (lawDatabase.chapters && lawDatabase.chapters.length > 0) {
    console.log(`  - First chapter title: ${lawDatabase.chapters[0].chapter_title || 'Untitled'}`);
    console.log(`  - First chapter articles count: ${lawDatabase.chapters[0].articles?.length || 0}`);
  }
  
  if (articleNumberMatch) {
    const articleNumber = articleNumberMatch[1];
    console.log(`[queryLawDatabase] Detected specific request for Article ${articleNumber}`);
    
    // Filter to only include the specific article
    const specificArticles = allArticles.filter(item => 
      item.article.article_number === articleNumber ||
      item.article.article_number === `${articleNumber}` // Handle string/number format differences
    );
    
    if (specificArticles.length > 0) {
      console.log(`[queryLawDatabase] Found ${specificArticles.length} matches for Article ${articleNumber}`);
      
      formattedArticles = "\n\nHere are the specific articles you requested:\n\n";
      
      for (const item of specificArticles) {
        const article = item.article;
        
        formattedArticles += `## Article ${article.article_number}: ${article.article_title || 'Untitled'}\n`;
        
        if (item.section) {
          // If we have both section and chapter
          if (item.chapter) {
            formattedArticles += `*From Chapter ${item.chapter.chapter_number}: ${item.chapter.chapter_title || 'Untitled'}, Section ${item.section.section_number}: ${item.section.section_title || 'Untitled'}*\n\n`;
          } else {
            // Just section
            formattedArticles += `*From Section ${item.section.section_number}: ${item.section.section_title || 'Untitled'}*\n\n`;
          }
        } else if (item.chapter) {
          // Just chapter
          formattedArticles += `*From Chapter ${item.chapter.chapter_number}: ${item.chapter.chapter_title || 'Untitled'}*\n\n`;
        } else {
          // Neither chapter nor section (shouldn't happen, but just in case)
          formattedArticles += `\n`;
        }
        
        if (typeof article.content === 'string') {
          formattedArticles += article.content + "\n\n";
        } else if (Array.isArray(article.content)) {
          for (const paragraph of article.content) {
            formattedArticles += paragraph + "\n\n";
          }
        }
        
        formattedArticles += "---\n\n";
      }
    } else {
      // If no specific article found, include all articles
      console.log(`[queryLawDatabase] No matches found for Article ${articleNumber}, including all articles`);
      
      // Take first 10 articles (to avoid overwhelming the AI)
      const topArticles = allArticles.slice(0, 10);
      
      formattedArticles = "\n\nI couldn't find the specific article you requested, but here are some articles that might be relevant:\n\n";
      
      for (const item of topArticles) {
        const article = item.article;
        
        formattedArticles += `## Article ${article.article_number}: ${article.article_title || 'Untitled'}\n`;
        
        if (item.section) {
          // If we have both section and chapter
          if (item.chapter) {
            formattedArticles += `*From Chapter ${item.chapter.chapter_number}: ${item.chapter.chapter_title || 'Untitled'}, Section ${item.section.section_number}: ${item.section.section_title || 'Untitled'}*\n\n`;
          } else {
            // Just section
            formattedArticles += `*From Section ${item.section.section_number}: ${item.section.section_title || 'Untitled'}*\n\n`;
          }
        } else if (item.chapter) {
          // Just chapter
          formattedArticles += `*From Chapter ${item.chapter.chapter_number}: ${item.chapter.chapter_title || 'Untitled'}*\n\n`;
        } else {
          // Neither chapter nor section (shouldn't happen, but just in case)
          formattedArticles += `\n`;
        }
        
        if (typeof article.content === 'string') {
          formattedArticles += article.content + "\n\n";
        } else if (Array.isArray(article.content)) {
          for (const paragraph of article.content) {
            formattedArticles += paragraph + "\n\n";
          }
        }
        
        formattedArticles += "---\n\n";
      }
    }
  } else {
    // No specific article requested, include a reasonable number of articles
    console.log(`[queryLawDatabase] No specific article requested, including top 10 articles`);
    
    // Take first 10 articles (to avoid overwhelming the AI)
    const topArticles = allArticles.slice(0, 10);
    
    formattedArticles = "\n\nHere are some articles from the database that might be relevant to your query:\n\n";
    
    for (const item of topArticles) {
      const article = item.article;
      
      formattedArticles += `## Article ${article.article_number}: ${article.article_title || 'Untitled'}\n`;
      
      if (item.section) {
        // If we have both section and chapter
        if (item.chapter) {
          formattedArticles += `*From Chapter ${item.chapter.chapter_number}: ${item.chapter.chapter_title || 'Untitled'}, Section ${item.section.section_number}: ${item.section.section_title || 'Untitled'}*\n\n`;
        } else {
          // Just section
          formattedArticles += `*From Section ${item.section.section_number}: ${item.section.section_title || 'Untitled'}*\n\n`;
        }
      } else if (item.chapter) {
        // Just chapter
        formattedArticles += `*From Chapter ${item.chapter.chapter_number}: ${item.chapter.chapter_title || 'Untitled'}*\n\n`;
      } else {
        // Neither chapter nor section (shouldn't happen, but just in case)
        formattedArticles += `\n`;
      }
      
      if (typeof article.content === 'string') {
        formattedArticles += article.content + "\n\n";
      } else if (Array.isArray(article.content)) {
        for (const paragraph of article.content) {
          formattedArticles += paragraph + "\n\n";
        }
      }
      
      formattedArticles += "---\n\n";
    }
  }
  
  // Build the complete response for the AI
  const resultText = `Based on your query: "${query}"${conversationContext}${formattedArticles}`;
  
  console.log(`[queryLawDatabase] Generated formatted response. Length: ${resultText.length} chars`);
  
  return resultText;
};

// Return type for rankInformationSources that includes optional direct response
interface RankingResult {
  rankedTools: string[];
  directResponse?: string;
}

// Function to rank information sources based on user query
export const rankInformationSources = async (
  userMessage: string,
  history: { role: string; parts: { text: string; }[] }[],
  selectedModel: string | undefined,
  genAI: GoogleGenerativeAI
): Promise<RankingResult> => {
  console.log(`[rankInformationSources] Ranking tools for query: '${userMessage.substring(0, 50)}${userMessage.length > 50 ? "..." : ""}'`);
  console.log(`[rankInformationSources] History has ${history.length} messages`);
  console.log(`[rankInformationSources] Using model: ${selectedModel || "gemini-2.5-flash-preview-04-17"}`);
  
  const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
  
  // Skip the initial classification step and go straight to ranking all tools
  // This is more efficient and avoids an extra AI call
  console.log(`[rankInformationSources] Starting direct tool ranking (skipping classification step)`);
  
  // For more complex queries, rank the specialized tools
  let prompt = `Analyze the following user message and rank the information sources from most relevant to least relevant.
  
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
  - query_all_databases: Search across all legal databases simultaneously
  - search_web: General web search for information
  
  IMPORTANT INSTRUCTIONS:
  1. Rank the tools from most appropriate to least appropriate for answering this specific query
  2. Return a JSON array with ALL information sources ranked by relevance
  
  Example: ["query_law_on_insurance", "query_insurance_qna", "query_law_on_consumer_protection", "query_all_databases", "search_web", "no_tool"]
  
  SPECIAL CASE - OPTIMIZATION:
  If you determine that "no_tool" should be ranked first (meaning this is a simple question that can be answered directly without specialized tools),
  also provide a direct response to the user after your ranking JSON using this exact format:
  
  ===DIRECT_RESPONSE_START===
  Your helpful response to the user (without any reference to tools, ranking, or internal processing). If the user has shared any personal information in previous messages, make sure to reference it appropriately.
  ===DIRECT_RESPONSE_END===
  `;
  
  try {
    console.log(`[rankInformationSources] Sending ranking prompt to AI (length: ${prompt.length})`);
    const startTime = Date.now();
    const response = await model.generateContent(prompt);
    const endTime = Date.now();
    console.log(`[rankInformationSources] AI ranking response received in ${endTime - startTime}ms`);
    
    const responseText = response.response.text();
    console.log(`[rankInformationSources] AI suggested ranking: ${responseText}`);
    
    // Parse the JSON array from the response
    // Use a regex that can handle markdown code blocks and multiline JSON
    const regex = /```(?:json)?\s*([\s\S]*?\[\s*[\s\S]*?\])[\s\S]*?```|\[(\s*"[^"]*"\s*,?\s*)+\]/;
    const match = responseText.match(regex);
    
    if (match) {
      // The JSON array could be in group 1 (inside code blocks) or group 0 (direct match)
      const jsonText = match[1] ? match[1].trim() : match[0];
      console.log(`[rankInformationSources] JSON array found in response: ${jsonText}`);
      try {
        const rankedSources = JSON.parse(jsonText);
        console.log(`[rankInformationSources] Successfully parsed JSON. Raw AI ranking: ${JSON.stringify(rankedSources)}`);
        
        // Validate that all sources are included
        const validTools = ["no_tool", "query_law_on_insurance", "query_law_on_consumer_protection", "query_insurance_qna", "query_all_databases", "search_web"];
        console.log(`[rankInformationSources] Valid tools: ${JSON.stringify(validTools)}`);
        
        // Ensure all valid tools are included and no invalid ones
        const validRankedSources = rankedSources.filter((source: string) => validTools.includes(source));
        console.log(`[rankInformationSources] Valid sources after filtering: ${JSON.stringify(validRankedSources)}`);
        
        // Check for missing tools
        const missingTools = validTools.filter(tool => !validRankedSources.includes(tool));
        if (missingTools.length > 0) {
          console.log(`[rankInformationSources] Missing tools that will be added: ${JSON.stringify(missingTools)}`);
        }
        
        // Add any missing tools at the end
        validTools.forEach(tool => {
          if (!validRankedSources.includes(tool)) {
            validRankedSources.push(tool);
            console.log(`[rankInformationSources] Added missing tool to ranking: ${tool}`);
          }
        });
        
        let directResponse: string | undefined;
        if (validRankedSources[0] === "no_tool") {
          const directResponseRegex = /===DIRECT_RESPONSE_START===\s*([\s\S]*?)\s*===DIRECT_RESPONSE_END===/;
          const directResponseMatch = responseText.match(directResponseRegex);
          
          if (directResponseMatch && directResponseMatch[1]) {
            directResponse = directResponseMatch[1].trim();
            console.log(`[rankInformationSources] Found direct response (${directResponse.length} chars)`);
          }
        }
        
        console.log(`[rankInformationSources] Final ranking after validation: ${JSON.stringify(validRankedSources)}`);
        
        // Return both the ranked tools and any direct response
        return {
          rankedTools: validRankedSources,
          directResponse
        };
      } catch (jsonError) {
        console.error(`[rankInformationSources] Failed to parse JSON from response: ${jsonError}`);
        return {
          rankedTools: ["no_tool", "search_web", "query_all_databases", "query_law_on_insurance", "query_law_on_consumer_protection", "query_insurance_qna"]
        };
      }
    } else {
      console.error(`[rankInformationSources] No JSON array found in response: ${responseText}`);
      return {
        rankedTools: ["no_tool", "search_web", "query_all_databases", "query_law_on_insurance", "query_law_on_consumer_protection", "query_insurance_qna"]
      };
    }
  } catch (error) {
    console.error(`[rankInformationSources] Error in ranking: ${error}`);
    return {
      rankedTools: ["no_tool", "search_web", "query_all_databases", "query_law_on_insurance", "query_law_on_consumer_protection", "query_insurance_qna"]
    };
  }
};

// Helper function to create a consistent tool result with the new fields
function createToolResult(source: string, content: string, responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL") {
  return {
    source,
    result: content,
    isFullyFormatted: true,
    responseType
  };
}

// Function to execute tool calls in sequence until an answer is found
// Parse the AI's structured response to determine if it's a final answer or we should try the next tool
function parseToolResponse(responseText: string): { responseType: "FINAL_ANSWER" | "TRY_NEXT_TOOL", content: string, reasoning: string } {
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
        phase = "";
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
          // Combine any system prompts into a single string
          const combinedSystemPrompts = [
            systemPrompts?.stylingPrompt || '',
            systemPrompts?.lawPrompt || '',
            systemPrompts?.tonePrompt || '',
            systemPrompts?.policyPrompt || ''
          ].filter(Boolean).join('\n\n');
          
          let specializedPrompt = `
You are a helpful assistant responding to: "${query}"

${combinedSystemPrompts ? combinedSystemPrompts + '\n\n' : ''}
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
            
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType);
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
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType);
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
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType);
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
          console.log(`[executeToolsSequentially] Insurance_QnA query result success: ${qnaDb.success}, has database: ${!!qnaDb.database}`);
          
          let toolData = "";
          
          if (qnaDb.success && qnaDb.database && qnaDb.database.content) {
            console.log(`[executeToolsSequentially] Insurance_QnA database found with content`);
            
            // Get the database query results
            toolData = await queryLawDatabase(query, qnaDb.database.content, conversationHistory);
            console.log(`[executeToolsSequentially] Insurance_QnA query result length: ${toolData.length}`);
            console.log(`[executeToolsSequentially] Insurance_QnA query result preview: ${toolData.substring(0, 100)}...`);
          } else {
            toolData = "The Insurance Q&A database is not available or could not be accessed.";
            console.log(`[executeToolsSequentially] Insurance_QnA database not found or query unsuccessful`);
          }
          
          // Create a specialized prompt that includes tool context and response format
          let specializedPrompt = `
You are a helpful assistant responding to: "${query}"

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
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType);
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
          console.log(`[executeToolsSequentially] Using one-call search_web for query: ${query}`);
          
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
          
          console.log(`[executeToolsSequentially] Preparing one-call search with structured response format`);
          
          // If we have conversation history, use it for context-aware search
          if (conversationHistory && conversationHistory.length > 0) {
            console.log(`[executeToolsSequentially] Using conversation history (${conversationHistory.length} messages) for context-aware search`);
            
            // Initialize the chat with conversation history
            for (let i = 0; i < conversationHistory.length - 1; i++) {
              const msg = conversationHistory[i];
              if (msg.role === "user") {
                await chat.sendMessage(msg.parts[0].text);
              }
            }
          } else {
            console.log(`[executeToolsSequentially] No conversation history available, using only current query`);
          }
          
          // Create a specialized search prompt that includes instructions for structured response
          const searchPrompt = `
I need information about: "${query}"

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
            return createToolResult(tool, result, "FINAL_ANSWER");
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
          let specializedPrompt = `
You are a helpful assistant responding to: "${query}"

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
            return createToolResult(tool, parsedResponse.content, parsedResponse.responseType);
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
    "FINAL_ANSWER"
  );
};
