"use node";

import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { Id } from "./_generated/dataModel";

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


// Define the structure of the law database for type safety
interface LawArticle {
  article_number: string;
  content: string;
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

interface LawSection {
  section_number: string;
  section_title: string;
  articles: LawArticle[];
}

interface LawChapter {
  chapter_number: string;
  chapter_title: string;
  articles?: LawArticle[];
  sections?: LawSection[];
}

interface LawDatabase {
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

// Function to query the law database
const calculateScore = (text: string, keywords: string[]) => {
  const lowerText = ensureString(text).toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      score++;
    }
  }
  return score;
};

const processArticleContent = (article: LawArticle, queryKeywords: string[], calculateScore: (text: string, keywords: string[]) => number) => {
  let articleText = `Article ${ensureString(article.article_number)}: ${ensureString(article.content)}`;
  let articleScore = calculateScore(ensureString(article.content), queryKeywords);

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
    if (article.sub_types) {
      article.sub_types.forEach(sub => {
        const subType = ensureString(sub.type);
        const subDescription = ensureString(sub.description);
        if (calculateScore(subType, queryKeywords) > 0 || calculateScore(subDescription, queryKeywords) > 0) {
          articleText += `\n  Sub-type ${subType}: ${subDescription}`;
          articleScore += calculateScore(subType, queryKeywords) + calculateScore(subDescription, queryKeywords);
        }
      });
    }
    if (article.prohibitions) {
      article.prohibitions.forEach(prohibition => {
        if (calculateScore(ensureString(prohibition), queryKeywords) > 0) {
          articleText += `\n  Prohibition: ${ensureString(prohibition)}`;
          articleScore += calculateScore(ensureString(prohibition), queryKeywords);
        }
      });
    }
    if (article.business_types) {
      article.business_types.forEach(type => {
        if (calculateScore(ensureString(type), queryKeywords) > 0) {
          articleText += `\n  Business Type: ${ensureString(type)}`;
          articleScore += calculateScore(ensureString(type), queryKeywords);
        }
      });
    }
    if (article.priority_order) {
      article.priority_order.forEach(item => {
        if (calculateScore(ensureString(item), queryKeywords) > 0) {
          articleText += `\n  Priority: ${ensureString(item)}`;
          articleScore += calculateScore(ensureString(item), queryKeywords);
        }
      });
    }
    if (article.conditions) {
      article.conditions.forEach(condition => {
        if (calculateScore(ensureString(condition), queryKeywords) > 0) {
          articleText += `\n  Condition: ${ensureString(condition)}`;
          articleScore += calculateScore(ensureString(condition), queryKeywords);
        }
      });
    }
    if (article.punishments) {
      article.punishments.forEach(punishment => {
        if (calculateScore(ensureString(punishment), queryKeywords) > 0) {
          articleText += `\n  Punishment: ${ensureString(punishment)}`;
          articleScore += calculateScore(ensureString(punishment), queryKeywords);
        }
      });
    }
    if (article.punishment_natural_person) { // Removed direct check for calculateScore > 0 here, as ensureString handles null/undefined
      const punishmentNaturalPerson = ensureString(article.punishment_natural_person);
      if (calculateScore(punishmentNaturalPerson, queryKeywords) > 0) {
        articleText += `\n  Punishment (Natural Person): ${punishmentNaturalPerson}`;
        articleScore += calculateScore(punishmentNaturalPerson, queryKeywords);
      }
    }
    if (article.punishment_legal_person) { // Removed direct check for calculateScore > 0 here, as ensureString handles null/undefined
      const punishmentLegalPerson = ensureString(article.punishment_legal_person);
      if (calculateScore(punishmentLegalPerson, queryKeywords) > 0) {
        articleText += `\n  Punishment (Legal Person): ${punishmentLegalPerson}`;
        articleScore += calculateScore(punishmentLegalPerson, queryKeywords);
      }
    }
    return { articleText, articleScore };
  };

  const scoreChaptersAndSections = (lawDatabase: LawDatabase, queryKeywords: string[], scoredResults: { content: string; score: number; chapterTitle?: string; sectionTitle?: string }[], calculateScore: (text: string, keywords: string[]) => number) => {
    if (lawDatabase.chapters && Array.isArray(lawDatabase.chapters)) {
      lawDatabase.chapters.forEach(chapter => {
        const chapterTitle = `Chapter ${ensureString(chapter.chapter_number)}: ${ensureString(chapter.chapter_title)}`;
        const chapterScore = calculateScore(ensureString(chapter.chapter_title), queryKeywords);

        if (chapterScore > 0) {
          scoredResults.push({
            content: `\n--- ${chapterTitle} ---`,
            score: chapterScore * 10, // Boost score for chapter title matches
            chapterTitle: chapterTitle
          });
        }

        if (chapter.sections) {
          chapter.sections.forEach(section => {
            const sectionTitle = `Section ${ensureString(section.section_number)}: ${ensureString(section.section_title)}`;
            const sectionScore = calculateScore(ensureString(section.section_title), queryKeywords);
            if (sectionScore > 0) {
              scoredResults.push({
                content: `\n--- ${chapterTitle} - ${sectionTitle} ---`,
                score: sectionScore * 5, // Boost score for section title matches
                chapterTitle: chapterTitle,
                sectionTitle: sectionTitle
              });
            }
          });
        }
      });
    }
  };

  const scoreAndProcessArticles = (lawDatabase: LawDatabase, queryKeywords: string[], scoredResults: { content: string; score: number; chapterTitle?: string; sectionTitle?: string }[], processArticleContent: (article: LawArticle, queryKeywords: string[], calculateScore: (text: string, keywords: string[]) => number) => { articleText: string; articleScore: number; }, calculateScore: (text: string, keywords: string[]) => number) => {
    if (lawDatabase.chapters && Array.isArray(lawDatabase.chapters)) {
      lawDatabase.chapters.forEach(chapter => {
        const chapterTitle = `Chapter ${ensureString(chapter.chapter_number)}: ${ensureString(chapter.chapter_title)}`;

        const processArticle = (article: LawArticle, currentSectionTitle?: string) => {
          const { articleText, articleScore } = processArticleContent(article, queryKeywords, calculateScore);

          if (articleScore > 0) {
            scoredResults.push({
              content: articleText,
              score: articleScore,
              chapterTitle: chapterTitle,
              sectionTitle: currentSectionTitle
            });
          }
        };

        if (chapter.articles) {
          chapter.articles.forEach(article => processArticle(article));
        }
        if (chapter.sections) {
          chapter.sections.forEach(section => {
            const sectionTitle = `Section ${ensureString(section.section_number)}: ${ensureString(section.section_title)}`;
            section.articles.forEach(article => processArticle(article, sectionTitle));
          });
        }
      });
    }
  };

  const aggregateAndSortResults = (scoredResults: { content: string; score: number; chapterTitle?: string; sectionTitle?: string }[]) => {
    const MAX_SNIPPETS = 30;
    const MAX_SNIPPET_LENGTH = 3000; // characters
    scoredResults.sort((a, b) => b.score - a.score);

    const finalRelevantContent: string[] = [];
    const addedHeaders = new Set<string>();
    const addedArticles = new Set<string>();

    for (const result of scoredResults) {
      if (finalRelevantContent.length >= MAX_SNIPPETS) break;
      let header = "";
      if (result.chapterTitle) {
        header += result.chapterTitle;
      }
      if (result.sectionTitle) {
        header += ` - ${result.sectionTitle}`;
      }

      if (header && !addedHeaders.has(header)) {
        finalRelevantContent.push(`\n--- ${header} ---`);
        addedHeaders.add(header);
      }

      // Truncate long snippets if needed
      let content = result.content;
      if (content.length > MAX_SNIPPET_LENGTH) {
        content = content.slice(0, MAX_SNIPPET_LENGTH) + " ...[truncated]";
      }
      if (!addedArticles.has(content)) {
        finalRelevantContent.push(content);
        addedArticles.add(content);
      }
    }
    return finalRelevantContent;
  };

// Function to query the law database
async function queryLawDatabase(query: string, lawDatabase: LawDatabase): Promise<string> {
  const queryKeywords = query.toLowerCase().split(/\s+/);
  const scoredResults: { content: string; score: number; chapterTitle?: string; sectionTitle?: string }[] = [];

  console.log(`[queryLawDatabase] Searching law database for query: "${query}"`);
  scoreChaptersAndSections(lawDatabase, queryKeywords, scoredResults, calculateScore);
  scoreAndProcessArticles(lawDatabase, queryKeywords, scoredResults, processArticleContent, calculateScore);
  const finalRelevantContent = aggregateAndSortResults(scoredResults);

  if (finalRelevantContent.length > 0) {
    console.log(`[queryLawDatabase] Found ${finalRelevantContent.length} relevant sections.`);
    return finalRelevantContent.join('\n\n');
  } else {
    console.log("[queryLawDatabase] No relevant content found.");
    return "LAW_DATABASE_NO_RESULTS";
  }
}

// New function to decide if law database access or web search is needed
async function decideInformationSource(userMessage: string, history: { role: string; parts: { text: string; }[]; }[], selectedModel: string | undefined, genAI: GoogleGenerativeAI): Promise<"LAW_DATABASE_ONLY" | "WEB_SEARCH_ONLY" | "BOTH" | "NONE"> {
  try {
    const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
    const prompt = `Analyze the following user message in the context of the provided conversation history. Your task is to decide the optimal information source(s) to answer the query. Output only one of the following: "LAW_DATABASE_ONLY", "WEB_SEARCH_ONLY", "BOTH", or "NONE".

**Conversation History (most recent last):**
${history.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n')}

**Decision Criteria:**

*   **LAW_DATABASE_ONLY:**
    *   The query explicitly asks about "law", "legal provisions", "articles of the law", "chapter", "section", "definition", "liquidation", "dissolution", "company", "enterprise", or similar terms directly related to the provided law database.
    *   The query is about definitions, procedures, rights, obligations, or specific content *within* the provided law document.
    *   The query can be fully and accurately answered *solely* by the content of the law database without needing external, real-time, or broader information.
    *   Examples: "What does Article 10 say about contracts?", "Define 'Company' according to the law.", "Which chapter discusses penalties?", "What are the general provisions of the law?", "What are the procedures for company liquidation?"

*   **WEB_SEARCH_ONLY:**
    *   The query explicitly asks for current or real-time information (e.g., "latest news on X", "current stock price of Y").
    *   The query is about very recent events or developments (e.g., things that happened in the last few days/weeks, post-dating your knowledge cutoff).
    *   The query asks for specific, niche, or technical facts, statistics, or details about entities (people, places, organizations, products) that are not common knowledge or where precision is important, and are *not* directly covered by the law database.
    *   The query pertains to local information (businesses, services, events) and implies a need for current, location-specific data.
    *   The user is asking for a comparison or list of specific items where web data would provide comprehensive options (e.g., "top 5 laptops for students").
    *   The query is clearly outside the scope of the "Law on Insurance" database (e.g., "What is the capital of France?").

*   **BOTH:**
    *   The query has components that could benefit from both the law database and a web search. For example, asking about a specific legal concept *and* its current real-world application or recent news (e.g., "What is compulsory insurance and are there any recent cases related to it?").
    *   The query asks for a legal definition or provision *and* examples of companies or situations related to it that might require current information (e.g., "What is a 'Motor Vehicle' according to the law, and what are current examples of compulsory motor vehicle insurance in practice?").
    *   The query is about a legal topic that might have recent interpretations, cases, or related news that are not in the static law document, but the core concept is in the law database.

*   **NONE:**
    *   The query is a simple greeting, conversational filler, or a personal statement not seeking external information (e.g., "hello", "my name is Alice", "I feel happy today").
    *   The query is for creative content generation (e.g., "write a poem", "tell me a story") unless it specifically asks for factual elements to be included from external sources.
    *   The query asks for your own opinions, or internal AI instructions (unless the question is specifically about how you *use* external tools).
    *   The query is about extremely broad, common knowledge that is highly unlikely to have changed (e.g., "What is the capital of France?", "How many days in a week?").
    *   The query is excessively vague, and neither a law database search nor a web search would yield a focused or useful answer.

User Message: "${userMessage}"

Decision (LAW_DATABASE_ONLY, WEB_SEARCH_ONLY, BOTH, or NONE):`;

    console.log("[decideInformationSource] Prompting to decide on information source for user message:", userMessage);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toUpperCase();
    console.log(`[decideInformationSource] Decision for "${userMessage}": ${responseText}`);

    if (["LAW_DATABASE_ONLY", "WEB_SEARCH_ONLY", "BOTH", "NONE"].includes(responseText)) {
      return responseText as "LAW_DATABASE_ONLY" | "WEB_SEARCH_ONLY" | "BOTH" | "NONE";
    }
    return "NONE"; // Default to none on error or unexpected response
  } catch (error) {
    console.error("[decideInformationSource] Error deciding information source:", error);
    return "NONE"; // Default to no search on error
  }
}

async function generateSearchQuery(userMessage: string, history: { role: string; parts: { text: string; }[]; }[], lawPrompt: string | undefined, tonePrompt: string | undefined, policyPrompt: string | undefined, selectedModel: string | undefined, genAI: GoogleGenerativeAI, searchType: "LAW_DATABASE", isRetry: boolean = false): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
    const dynamicPrompts = [
      lawPrompt,
      policyPrompt,
      tonePrompt,
    ].filter(Boolean).join("\n\n");

    let prompt = `Based on the following user message and the conversation history, and considering the following system prompts, generate an effective search query. Output only the search query itself, without any preamble or explanation.

**System Prompts (if any):**
${dynamicPrompts}

**Conversation History (most recent last):**
${history.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n')}

User Message: "${userMessage}"
`;

    if (searchType === "LAW_DATABASE") {
      prompt += `
**Guidance for Law Database Query Generation:**
- The user's message has been deemed to require a search within the local law database.
- Extract specific keywords or phrases that are highly likely to be found directly within the law document's structure (e.g., chapter titles, section titles, or key terms from article content).
- Prioritize terms that directly relate to legal concepts, procedures, or specific parts of a law.
- For example, if the user asks "what chapter discusses company dissolution", a good query might be "LIQUIDATION AND DISSOLUTION OF COMPANY" or "company dissolution".
`;
      if (isRetry) {
        prompt += `
- **RETRY ATTEMPT**: The previous search attempt for the law database yielded no results. Generate a broader or alternative set of keywords. Consider synonyms or more general terms related to the user's query to improve the chances of a match.
`;
      }
      prompt += `
Search Query for Law Database:`;
    }
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

async function determineRelevantDatabases(userMessage: string, history: { role: string; parts: { text: string; }[]; }[], selectedModel: string | undefined, genAI: GoogleGenerativeAI): Promise<string[]> {
  try {
    const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
    const prompt = `Based on the following user message and conversation history, identify which of the following law databases are most relevant to answer the query.
    
    Available Databases:
    - "Law on Insurance"
    - "Insurance and Reinsurance QnA"
    - "Law on Consumer Protection"

    Output a comma-separated list of the relevant database names. If no database is relevant, output "NONE".

    **Conversation History (most recent last):**
    ${history.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n')}

    User Message: "${userMessage}"

    Relevant Databases (comma-separated, or NONE):`;

    console.log("[determineRelevantDatabases] Prompting to decide on relevant databases for user message:", userMessage);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    console.log(`[determineRelevantDatabases] Decision for "${userMessage}": ${responseText}`);

    if (responseText.toUpperCase() === "NONE" || responseText === "") {
      return [];
    }
    return responseText.split(',').map(db => db.trim());
  } catch (error) {
    console.error("[determineRelevantDatabases] Error determining relevant databases:", error);
    return []; // Default to no databases on error
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
    paneId: v.string(), // Add paneId here
    disableSystemPrompt: v.optional(v.boolean()), // Argument for system prompt
    disableTools: v.optional(v.boolean()), // Argument for tool use
  },
  handler: async (ctx, args): Promise<Id<"messages">> => {
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
      const formattedHistory = previousMessages.map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));
      console.log("[getAIResponse] Formatted conversation history:", JSON.stringify(formattedHistory, null, 2));

      console.log("[getAIResponse] Calling decideInformationSource with user message, history, and selectedModel...");
      const decision = await decideInformationSource(userMessage, formattedHistory, selectedModel, genAI);
      console.log(`[decideInformationSource] decideInformationSource returned: ${decision}`);

      let relevantDatabaseNames: string[] = [];
      if (decision === "LAW_DATABASE_ONLY" || decision === "BOTH") {
        console.log("[getAIResponse] Decision: Law database access indicated. Using all law databases.");
        relevantDatabaseNames = [
          "Law on Insurance",
          "Insurance and Reinsurance QnA",
          "Law on Consumer Protection"
        ];
        console.log(`[getAIResponse] Using all law databases: ${JSON.stringify(relevantDatabaseNames)}`);

        if (relevantDatabaseNames.length > 0) {
          console.log("[getAIResponse] Accessing law database(s).");
          let lawQuery = await generateSearchQuery(userMessage, formattedHistory, lawPrompt, tonePrompt, policyPrompt, selectedModel, genAI, "LAW_DATABASE", false); // Initial search
          const lawDatabaseContent = await ctx.runQuery(api.chat.getLawDatabaseContent, { databaseNames: relevantDatabaseNames });
          const lawDatabaseResults = JSON.parse(lawDatabaseContent);

          let combinedLawResults = "";
          for (const dbName of relevantDatabaseNames) {
            if (lawDatabaseResults[dbName]) {
              const dbContent = lawDatabaseResults[dbName];
              // Assuming queryLawDatabase can take a specific database content and query
              const resultsForDb = await queryLawDatabase(lawQuery, dbContent); // Pass specific database content
              if (resultsForDb !== "LAW_DATABASE_NO_RESULTS") {
                combinedLawResults += `\n\n--- Results from ${dbName} ---\n${resultsForDb}`;
              }
            }
          }

          if (combinedLawResults.trim() === "") {
            console.log("[getAIResponse] First law database search yielded no results across selected databases. Attempting retry with broader query.");
            // Retry: Generate a broader query and try again
            lawQuery = await generateSearchQuery(userMessage, formattedHistory, lawPrompt, tonePrompt, policyPrompt, selectedModel, genAI, "LAW_DATABASE", true); // Retry with isRetry = true
            
            combinedLawResults = ""; // Reset for retry
            for (const dbName of relevantDatabaseNames) {
              if (lawDatabaseResults[dbName]) {
                const dbContent = lawDatabaseResults[dbName];
                const resultsForDb = await queryLawDatabase(lawQuery, dbContent);
                if (resultsForDb !== "LAW_DATABASE_NO_RESULTS") {
                  combinedLawResults += `\n\n--- Results from ${dbName} (after retry) ---\n${resultsForDb}`;
                }
              }
            }

            if (combinedLawResults.trim() === "") {
              lawDatabaseInfoForSystemPrompt = `A search of the law database(s) (query: "${lawQuery}") found no relevant results after two attempts across selected databases: ${relevantDatabaseNames.join(", ")}.`;
            } else {
              lawDatabaseInfoForSystemPrompt = `Relevant information from the law database(s) for query "${lawQuery}" (after retry) is provided below. You MUST synthesize this information to answer the user's query if it's relevant.`;
              lawDatabaseContextForLLM = `\n\nRelevant law database snippets (search term used: "${lawQuery}" - after retry) from databases: ${relevantDatabaseNames.join(", ")}:\n---\n${combinedLawResults.trim()}\n---\nUse this information to help answer the user's original question.`;
            }
          } else {
            lawDatabaseInfoForSystemPrompt = `Relevant information from the law database(s) for query "${lawQuery}" is provided below. You MUST synthesize this information to answer the user's query if it's relevant.`;
            lawDatabaseContextForLLM = `\n\nRelevant law database snippets (search term used: "${lawQuery}") from databases: ${relevantDatabaseNames.join(", ")}:\n---\n${combinedLawResults.trim()}\n---\nUse this information to help answer the user's original question.`;
          }
        } else {
          lawDatabaseInfoForSystemPrompt = "No specific law databases were determined to be relevant for this query.";
        }
      }

      const toolsToUse: any[] = []; // Use any[] for the array type
      if (!disableTools && (decision === "WEB_SEARCH_ONLY" || decision === "BOTH")) {
        console.log(`[getAIResponse] Decision: Enabling Google Search tool for pane ${paneId}. disableTools=${disableTools}, decision=${decision}`);
        toolsToUse.push(googleSearchTool);
        webSearchInfoForSystemPrompt = `Google Search tool was enabled. If the model uses the tool, relevant web search results will be provided in groundingMetadata. You MUST synthesize this information to answer the user's query if it's relevant, strictly adhering to any specific number of items requested by the user (e.g., "top 5"). Format any list of items as a Markdown bulleted list, each item starting with '- '. Follow WEB_SEARCH_USAGE_INSTRUCTIONS for how to present this information.`;
      } else if (disableTools) {
        console.log(`[getAIResponse] Decision: Tools explicitly disabled for pane ${paneId}, therefore NOT performing any external search. Answering from general knowledge. disableTools=${disableTools}, decision=${decision}`);
        webSearchInfoForSystemPrompt = "External search (neither law database nor web) was explicitly disabled for this query. Answer from general knowledge.";
      } else if (decision === "NONE") {
        console.log(`[getAIResponse] Decision: NOT performing any external search for pane ${paneId}. Answering from general knowledge. disableTools=${disableTools}, decision=${decision}`);
        webSearchInfoForSystemPrompt = "No external search (neither law database nor web) was performed for this query. Answer from general knowledge.";
      }

      const dynamicPrompts = disableSystemPrompt ? "" : [
        lawPrompt,
        policyPrompt,
        tonePrompt,
      ].filter(Boolean).join("\n\n");

      const finalSystemInstruction = `You are a helpful assistant.
${STYLING_PROMPT}
// The prompt above defines how you MUST format your output using Markdown. Adhere to it strictly.

${dynamicPrompts}
// The dynamic prompts above (if any) define your general persona, legal constraints, and company policies.
${disableSystemPrompt ? "" : "You are a helpful assistant designed to assist users in Cambodia. You can provide information, answer questions, and offer support on a variety of topics. I am here to be your friendly AI companion."}

${WEB_SEARCH_USAGE_INSTRUCTIONS}
// The instructions above specifically guide how you MUST use and refer to any web search information IF IT IS PROVIDED to you.

${lawDatabaseInfoForSystemPrompt}
${webSearchInfoForSystemPrompt}
// The lines above give you crucial context: EITHER the outcome of a law database search, a web search, both, or an instruction that no search was performed and you should rely on general knowledge.

Your primary goal is to answer the user's question.
- If external search results (law database and/or web) were provided (see context above), integrate them according to the specific instructions for each.
- If no search was performed, or if search yielded no results for the specific information sought, answer from your general training knowledge to the best of your ability. Do not invent search results.
- Always be concise and directly address the user's original question.
`;
      console.log("[getAIResponse] Final System Instruction (first 500 chars):", finalSystemInstruction.substring(0, 500) + "...");

      const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
      console.log("[getAIResponse] Tools to be used in chat session:", JSON.stringify(toolsToUse));
      const chat = model.startChat({
        history: [
          { role: "user", parts: [{ text: finalSystemInstruction }] },
          { role: "model", parts: [{ text: "Understood. I will follow all instructions. If external data is provided, I will use it as guided. Otherwise, I will rely on my general knowledge." }] },
          ...formattedHistory,
        ],
        tools: toolsToUse as any, // Pass the tools here
      });

      messageId = await ctx.runMutation(api.chat.createMessage, {
        userId,
        role: "assistant",
        content: "",
        isStreaming: true,
        paneId, // Pass paneId here
      });
      console.log(`[getAIResponse] Created placeholder message ${messageId} for streaming response.`);

      // Construct the final message to send to the LLM for response generation
      // It includes the law database context, web search context (if any), and then the user's original question.
      let messageToSendToGemini = "";
      if (lawDatabaseContextForLLM) {
        messageToSendToGemini += lawDatabaseContextForLLM;
      }
      // No webSearchContextForLLM here, as Gemini will handle the search internally
      if (messageToSendToGemini) {
        messageToSendToGemini += "\n\nUser's original question: " + userMessage;
      } else {
        messageToSendToGemini = "User's original question: " + userMessage;
      }

      console.log(`[getAIResponse] Sending to Gemini for response generation (first 500 chars): "${messageToSendToGemini.substring(0,500)}..."`);
      console.log("[getAIResponse] Initiating Gemini API call (sendMessageStream)...");
      const streamResult = await chat.sendMessageStream(messageToSendToGemini);
      console.log("[getAIResponse] Gemini API call returned stream result. Starting to process chunks...");

      let accumulatedResponse = "";
      let bufferToSend = "";
      let errorCount = 0;
      const MAX_RETRIES = 3;
      const CHUNK_SIZE = 3; // Smaller chunk size for more frequent updates
      const RETRY_DELAY_MS = 200; // Slightly reduced delay between retries
      
      // Helper function to delay execution
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Helper function to append content with retry logic
      const appendWithRetry = async (content: string): Promise<boolean> => {
        // If messageId is null, we can't append content
        if (!messageId) {
          console.error(`[getAIResponse] Cannot append content: messageId is null`);
          return false;
        }
        
        let retries = 0;
        while (retries <= MAX_RETRIES) {
          try {
            await ctx.runMutation(api.chat.appendMessageContent, {
              messageId,
              content,
            });
            return true; // Success
          } catch (appendError) {
            retries++;
            console.error(`[getAIResponse] Error appending content (attempt ${retries}/${MAX_RETRIES}):`, appendError);
            if (retries <= MAX_RETRIES) {
              // Wait before retrying
              await delay(RETRY_DELAY_MS);
            }
          }
        }
        return false; // Failed after all retries
      };
      
      try {
        for await (const chunk of streamResult.stream) {
          // Check if there's a text part in the chunk
          const textPart = chunk.candidates?.[0]?.content?.parts?.find(part => part.text);
          if (textPart) {
            const chunkText = textPart.text;
            accumulatedResponse += chunkText;
            bufferToSend += chunkText;
            
            // Log streaming response chunks for debugging
            if (accumulatedResponse.length % 100 === 0 || accumulatedResponse.length < 100) {
              console.log(`[getAIResponse] Streaming response for pane ${paneId} (disableTools=${disableTools}): Current length: ${accumulatedResponse.length} chars. Latest chunk: "${chunkText ? chunkText.substring(0, 50) : ''}${chunkText && chunkText.length > 50 ? '...' : ''}"`);
            }
            
            // Send buffer in chunks to avoid too many small DB updates
            if (bufferToSend.length >= CHUNK_SIZE) {
              const success = await appendWithRetry(bufferToSend);
              if (success) {
                bufferToSend = ""; // Clear buffer after successful append
                errorCount = 0; // Reset error count on success
              } else {
                errorCount++;
                if (errorCount > MAX_RETRIES) {
                  throw new Error(`Failed to append content after ${MAX_RETRIES} retries.`);
                }
              }
            }
          }
        }
        
        // Send any remaining characters in the buffer
        if (bufferToSend.length > 0) {
          await appendWithRetry(bufferToSend);
        }
      } catch (streamError) {
        console.error(`[getAIResponse] Error during streaming:`, streamError);
        // Handle streaming error gracefully
        if (messageId) {
          try {
            await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
              messageId,
              isStreaming: false,
            });
            
            // Only append error message if the content is very short
            const currentMessage = await ctx.runQuery(api.chat.getMessage, { messageId });
            if (currentMessage && currentMessage.content.length < 50) {
              await ctx.runMutation(api.chat.appendMessageContent, {
                messageId,
                content: `Error: Streaming interrupted. Please try again.`,
              });
            }
          } catch (finalError) {
            console.error(`[getAIResponse] Error finalizing message after streaming error:`, finalError);
          }
        }
      }
      console.log(`[getAIResponse] Finished streaming for ${messageId}. Total response length: ${accumulatedResponse.length}`);

      // Check for grounding metadata and extract search suggestions from the final response
      const finalResponse = await streamResult.response; // Await the full response
      if (finalResponse.candidates && finalResponse.candidates[0] && finalResponse.candidates[0].groundingMetadata && finalResponse.candidates[0].groundingMetadata.searchEntryPoint && finalResponse.candidates[0].groundingMetadata.searchEntryPoint.renderedContent) {
        searchSuggestionsHtml = finalResponse.candidates[0].groundingMetadata.searchEntryPoint.renderedContent;
        console.log("[getAIResponse] Extracted search suggestions from groundingMetadata.");
      } else {
        console.log("[getAIResponse] No search suggestions (groundingMetadata) found in the final response.");
      }


      await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
        messageId,
        isStreaming: false,
      });
      console.log(`[getAIResponse] Finalized message ${messageId}.`);

      return messageId;
    } catch (error) {
      console.error("[getAIResponse] Error during AI response generation:", error);

      // Handle "Too Many Requests" error specifically
      if (error instanceof GoogleGenerativeAIFetchError && error.status === 429) {
        console.error("[getAIResponse] Caught 429 Too Many Requests error.");
        // If a message was already created, update its status and content
        if (messageId) {
          await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
            messageId,
            isStreaming: false,
          });
          await ctx.runMutation(api.chat.appendMessageContent, {
            messageId,
            content: "Error: You've exceeded your API quota. Please try again later.",
          });
        }
        throw new ConvexError({
          code: "TOO_MANY_REQUESTS",
          message: "You've exceeded your API quota. Please try again later.",
        });
      } else if (messageId) {
        // For any other error, ensure the message is marked as not streaming
        // and append a generic error message if it's not already done.
        await ctx.runMutation(api.chat.updateMessageStreamingStatus, {
          messageId,
          isStreaming: false,
        });
        // Only append if the message content is still empty or very short,
        // to avoid overwriting partial valid responses.
        const currentMessage = await ctx.runQuery(api.chat.getMessage, { messageId });
        if (currentMessage && currentMessage.content.length < 50) { // Arbitrary threshold
          await ctx.runMutation(api.chat.appendMessageContent, {
            messageId,
            content: `Error: An unexpected error occurred. Please try again.`,
          });
        }
        throw error; // Re-throw the original error for other error types
      } else {
        // If messageId was never created, just re-throw the error
        throw error;
      }
    }
  },
});
