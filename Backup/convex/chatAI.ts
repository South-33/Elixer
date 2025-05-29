"use node";

import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { Id } from "./_generated/dataModel";
import { rankInformationSources, executeToolsSequentially, estimateTokenCount } from "./agentTools";

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
export async function queryLawDatabase(query: string, lawDatabase: LawDatabase): Promise<string> {
  const queryKeywords = query.toLowerCase().split(/\s+/);
  const scoredResults: { content: string; score: number; chapterTitle?: string; sectionTitle?: string }[] = [];

  console.log(`[queryLawDatabase] Searching law database for query: "${query}"`);
  
  // Helper function to convert between Roman and Arabic numerals
  const romanToArabic = (roman: string): number => {
    const romanMap: {[key: string]: number} = {
      'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
    };
    let result = 0;
    for (let i = 0; i < roman.length; i++) {
      const current = romanMap[roman[i]];
      const next = i + 1 < roman.length ? romanMap[roman[i + 1]] : 0;
      if (current < next) {
        result -= current;
      } else {
        result += current;
      }
    }
    return result;
  };

  const arabicToRoman = (num: number): string => {
    const romanNumerals = [
      { value: 1000, numeral: 'M' },
      { value: 900, numeral: 'CM' },
      { value: 500, numeral: 'D' },
      { value: 400, numeral: 'CD' },
      { value: 100, numeral: 'C' },
      { value: 90, numeral: 'XC' },
      { value: 50, numeral: 'L' },
      { value: 40, numeral: 'XL' },
      { value: 10, numeral: 'X' },
      { value: 9, numeral: 'IX' },
      { value: 5, numeral: 'V' },
      { value: 4, numeral: 'IV' },
      { value: 1, numeral: 'I' }
    ];
    let result = '';
    for (const { value, numeral } of romanNumerals) {
      while (num >= value) {
        result += numeral;
        num -= value;
      }
    }
    return result;
  };

  // Function to check if chapter numbers match, handling both Roman and Arabic numerals
  const chapterNumbersMatch = (a: string, b: string): boolean => {
    // Direct string match
    if (a === b) return true;
    
    // Try to convert and compare if they're in different formats
    if (/^[IVXLCDM]+$/i.test(a) && /^\d+$/.test(b)) {
      return romanToArabic(a.toUpperCase()) === parseInt(b, 10);
    }
    if (/^\d+$/.test(a) && /^[IVXLCDM]+$/i.test(b)) {
      return parseInt(a, 10) === romanToArabic(b.toUpperCase());
    }
    
    return false;
  };

  // Check for direct chapter and article references
  const chapterMatch = query.match(/chapter\s*([IVX\d]+)/i);
  const articleMatch = query.match(/article\s*(\d+)/i);
  
  // If we have specific chapter and article references, prioritize them
  if (chapterMatch && articleMatch && lawDatabase && lawDatabase.chapters) {
    const targetChapter = chapterMatch[1].toUpperCase();
    const targetArticle = articleMatch[1];
    console.log(`[queryLawDatabase] Direct reference detected: Chapter ${targetChapter}, Article ${targetArticle}`);
    
    // Find the specific chapter, handling both Roman and Arabic numerals
    for (const chapter of lawDatabase.chapters) {
      if (!chapter || !chapter.chapter_number) continue;
      
      if (chapterNumbersMatch(chapter.chapter_number, targetChapter)) {
        console.log(`[queryLawDatabase] Found matching chapter: ${chapter.chapter_number}`);
        
        // Check if the chapter has articles directly
        if (chapter.articles && Array.isArray(chapter.articles)) {
          for (const article of chapter.articles) {
            if (!article || !article.article_number) continue;
            
            if (article.article_number === targetArticle || article.article_number === targetArticle.replace(/^0+/, '')) {
              console.log(`[queryLawDatabase] Found direct article match: Article ${article.article_number}`);
              
              // Construct a comprehensive article text with all properties
              let articleContent = `Article ${article.article_number}: ${article.content}`;
              
              if (article.points && Array.isArray(article.points)) {
                articleContent += '\n\nPoints:';
                article.points.forEach(point => {
                  articleContent += `\n- ${point}`;
                });
              }
              
              if (article.definitions) {
                articleContent += '\n\nDefinitions:';
                for (const [term, definition] of Object.entries(article.definitions)) {
                  articleContent += `\n- ${term}: ${definition}`;
                }
              }
              
              // Add other properties if they exist
              ['sub_types', 'prohibitions', 'business_types', 'priority_order', 'conditions', 'punishments'].forEach(propName => {
                if (article[propName as keyof LawArticle] && Array.isArray(article[propName as keyof LawArticle])) {
                  articleContent += `\n\n${propName.replace('_', ' ').charAt(0).toUpperCase() + propName.replace('_', ' ').slice(1)}:`;
                  (article[propName as keyof LawArticle] as string[]).forEach(item => {
                    articleContent += `\n- ${item}`;
                  });
                }
              });
              
              // Add punishment details if they exist
              if (article.punishment_natural_person) {
                articleContent += `\n\nPunishment (Natural Person): ${article.punishment_natural_person}`;
              }
              
              if (article.punishment_legal_person) {
                articleContent += `\n\nPunishment (Legal Person): ${article.punishment_legal_person}`;
              }
              
              // Add with very high score to ensure it appears at the top
              scoredResults.push({
                content: `--- Chapter ${chapter.chapter_number}: ${chapter.chapter_title} ---\n\n${articleContent}`,
                score: 10000, // Very high score for direct matches
                chapterTitle: `Chapter ${chapter.chapter_number}: ${chapter.chapter_title}`
              });
              
              // Return early since we found an exact match
              return aggregateAndSortResults(scoredResults).join('\n\n');
            }
          }
        }
        
        // Check if the chapter has sections with articles
        if (chapter.sections && Array.isArray(chapter.sections)) {
          for (const section of chapter.sections) {
            if (!section || !section.articles || !Array.isArray(section.articles)) continue;
            
            for (const article of section.articles) {
              if (!article || !article.article_number) continue;
              
              if (article.article_number === targetArticle || article.article_number === targetArticle.replace(/^0+/, '')) {
                console.log(`[queryLawDatabase] Found article match in section: Article ${article.article_number}`);
                
                // Construct a comprehensive article text with all properties
                let articleContent = `Article ${article.article_number}: ${article.content}`;
                
                if (article.points && Array.isArray(article.points)) {
                  articleContent += '\n\nPoints:';
                  article.points.forEach(point => {
                    articleContent += `\n- ${point}`;
                  });
                }
                
                if (article.definitions) {
                  articleContent += '\n\nDefinitions:';
                  for (const [term, definition] of Object.entries(article.definitions)) {
                    articleContent += `\n- ${term}: ${definition}`;
                  }
                }
                
                // Add other properties if they exist
                ['sub_types', 'prohibitions', 'business_types', 'priority_order', 'conditions', 'punishments'].forEach(propName => {
                  if (article[propName as keyof LawArticle] && Array.isArray(article[propName as keyof LawArticle])) {
                    articleContent += `\n\n${propName.replace('_', ' ').charAt(0).toUpperCase() + propName.replace('_', ' ').slice(1)}:`;
                    (article[propName as keyof LawArticle] as string[]).forEach(item => {
                      articleContent += `\n- ${item}`;
                    });
                  }
                });
                
                // Add punishment details if they exist
                if (article.punishment_natural_person) {
                  articleContent += `\n\nPunishment (Natural Person): ${article.punishment_natural_person}`;
                }
                
                if (article.punishment_legal_person) {
                  articleContent += `\n\nPunishment (Legal Person): ${article.punishment_legal_person}`;
                }
                
                // Add with very high score to ensure it appears at the top
                scoredResults.push({
                  content: `--- Chapter ${chapter.chapter_number}: ${chapter.chapter_title} ---\n--- Section ${section.section_number}: ${section.section_title} ---\n\n${articleContent}`,
                  score: 10000, // Very high score for direct matches
                  chapterTitle: `Chapter ${chapter.chapter_number}: ${chapter.chapter_title}`,
                  sectionTitle: `Section ${section.section_number}: ${section.section_title}`
                });
                
                // Return early since we found an exact match
                return aggregateAndSortResults(scoredResults).join('\n\n');
              }
            }
          }
        }
      }
    }
  }
  
  // Continue with regular scoring if we don't have direct matches or as a fallback
  if (scoredResults.length === 0) {
    scoreChaptersAndSections(lawDatabase, queryKeywords, scoredResults, calculateScore);
    scoreAndProcessArticles(lawDatabase, queryKeywords, scoredResults, processArticleContent, calculateScore);
  }
  
  const finalRelevantContent = aggregateAndSortResults(scoredResults);

  if (finalRelevantContent.length > 0) {
    console.log(`[queryLawDatabase] Found ${finalRelevantContent.length} relevant sections.`);
    return finalRelevantContent.join('\n\n');
  } else {
    console.log("[queryLawDatabase] No relevant content found.");
    return "LAW_DATABASE_NO_RESULTS";
  }
}

// Define the available information sources as a type
export type InformationSource = "WEB_SEARCH" | "LAW_ON_INSURANCE" | "LAW_ON_CONSUMER_PROTECTION" | "INSURANCE_QNA" | "ALL_DATABASES";

// Define agent tool names
export type AgentTool = "query_law_on_insurance" | "query_law_on_consumer_protection" | "query_insurance_qna" | "search_web";

// Function to decide which specific information sources to use
export const decideInformationSource = async (
  userMessage: string, 
  history: { role: string; parts: { text: string; }[]; }[], 
  selectedModel: string | undefined, 
  genAI: GoogleGenerativeAI
): Promise<InformationSource[]> => {
  console.log(`[decideInformationSource] Using AI to decide information sources for: '${userMessage}'`);
  
  try {
    const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
    const prompt = `Analyze the following user message and decide which information sources would be most appropriate to answer it. 
    User message: "${userMessage}"
    
    Available information sources and their descriptions:
    - WEB_SEARCH: Search the web for general information, current events, news, or any information not in the specialized legal databases.
    
    - LAW_ON_INSURANCE: Comprehensive legal database containing Cambodia's Law on Insurance. Includes detailed articles on:
      * Insurance contracts, policies, and premiums
      * Rights and obligations of insurers and insured parties
      * Insurance claim procedures and requirements
      * Insurance company regulations and licensing
      * Types of insurance (life, non-life, micro-insurance)
      * Insurance intermediaries and brokers
      * Penalties for insurance-related violations
    
    - LAW_ON_CONSUMER_PROTECTION: Complete legal database on Cambodia's Consumer Protection Law. Covers:
      * Consumer rights and remedies
      * Unfair practices and prohibited conduct
      * Product safety and liability
      * Consumer contracts and warranties
      * Advertising and labeling requirements
      * Dispute resolution mechanisms
      * Penalties for violations of consumer rights
    
    - INSURANCE_QNA: Question and answer database about insurance and reinsurance in Cambodia. Contains:
      * Practical explanations of insurance concepts
      * Common questions about insurance policies
      * Explanations of insurance terms and conditions
      * Guidance on insurance claims and disputes
      * Answers about insurance company operations
      * Information on reinsurance practices
    
    - ALL_DATABASES: Access all three law databases at once (recommended for complex questions that might require information from multiple sources)
    
    Return ONLY a JSON array with the most relevant information sources, e.g., ["WEB_SEARCH"] or ["LAW_ON_INSURANCE"] or ["ALL_DATABASES"].
    If the query mentions a specific article number or section from a law, select the appropriate law database.
    If the query might need information from multiple law databases, use ["ALL_DATABASES"] instead of listing individual databases.
    For general questions not related to Cambodia's legal system, use ["WEB_SEARCH"].
    `;
    
    const response = await model.generateContent(prompt);
    const responseText = response.response.text();
    console.log(`[decideInformationSource] AI suggested response: ${responseText}`);
    
    // Try to parse the response as JSON
    try {
      // Look for JSON array in the response
      const match = responseText.match(/\[.*\]/);
      if (match) {
        const suggestedSources = JSON.parse(match[0]);
        // Filter to valid information sources
        const validSources = suggestedSources.filter((source: string) => 
          ["WEB_SEARCH", "LAW_ON_INSURANCE", "LAW_ON_CONSUMER_PROTECTION", "INSURANCE_QNA", "ALL_DATABASES"].includes(source)
        );
        
        if (validSources.length > 0) {
          console.log(`[decideInformationSource] AI suggested sources: ${JSON.stringify(validSources)}`);
          return validSources as InformationSource[];
        }
      }
    } catch (parseError) {
      console.error(`[decideInformationSource] Error parsing AI suggestion: ${parseError}`);
    }
    
    // Fallback if parsing fails: check for keywords in the response
    if (responseText.toLowerCase().includes("insurance") && !responseText.toLowerCase().includes("consumer") && !responseText.toLowerCase().includes("q&a") && !responseText.toLowerCase().includes("qna")) {
      console.log(`[decideInformationSource] Fallback to LAW_ON_INSURANCE based on AI response keywords`);
      return ["LAW_ON_INSURANCE"];
    } else if (responseText.toLowerCase().includes("consumer")) {
      console.log(`[decideInformationSource] Fallback to LAW_ON_CONSUMER_PROTECTION based on AI response keywords`);
      return ["LAW_ON_CONSUMER_PROTECTION"];
    } else if (responseText.toLowerCase().includes("question") || responseText.toLowerCase().includes("answer") || responseText.toLowerCase().includes("qna") || responseText.toLowerCase().includes("q&a")) {
      console.log(`[decideInformationSource] Fallback to INSURANCE_QNA based on AI response keywords`);
      return ["INSURANCE_QNA"];
    } else if (responseText.toLowerCase().includes("all") || responseText.toLowerCase().includes("multiple") || responseText.toLowerCase().includes("databases")) {
      console.log(`[decideInformationSource] Fallback to ALL_DATABASES based on AI response keywords`);
      return ["ALL_DATABASES"];
    } else if (responseText.toLowerCase().includes("web") || responseText.toLowerCase().includes("search") || responseText.toLowerCase().includes("general")) {
      console.log(`[decideInformationSource] Fallback to WEB_SEARCH based on AI response keywords`);
      return ["WEB_SEARCH"];
    }
  } catch (error) {
    console.error(`[decideInformationSource] Error getting AI suggestion: ${error}`);
  }

  // Final fallback: use ALL_DATABASES as default to ensure the user gets comprehensive information
  console.log(`[decideInformationSource] Using default source: ALL_DATABASES`);
  return ["ALL_DATABASES"];
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
        rankingResult = { rankedTools: ["no_tool"] };
      } else {
        rankingResult = await rankInformationSources(
          userMessage,
          formattedHistory,
          selectedModel,
          genAI
        );
      }
      
      const { rankedTools, directResponse } = rankingResult;
      
      // Log the ranked tools
      console.log(`[getAIResponse] Ranked tools: ${JSON.stringify(rankedTools)}`);
      
      // Fast path: If no_tool is ranked first and we have a direct response, use it immediately
      // The rankInformationSources function already includes conversation history in the prompt
      if (rankedTools[0] === "no_tool" && directResponse) {
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
      
      // 3. Execute tools sequentially until an answer is found
      const toolResults = await executeToolsSequentially(
        rankedTools,
        userMessage,
        ctx,
        genAI,
        selectedModel,
        formattedHistory, // Pass conversation history for context-aware tool execution
        { // Pass system prompts to ensure consistent styling and instructions
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
You are a helpful assistant designed to assist users in Cambodia. You can provide information, answer questions, and offer support on a variety of topics. I am here to be your friendly AI companion.
`;
      }
      
      // Always include these parts regardless of system prompt setting
      finalSystemInstruction += `
${WEB_SEARCH_USAGE_INSTRUCTIONS}
// The instructions above specifically guide how you MUST use and refer to any web search information IF IT IS PROVIDED to you.

Your primary goal is to answer the user's question.
- Generate a complete and helpful response to the user's question based on the information provided.
- Format any lists as proper Markdown bulleted lists.
- Be concise and directly address the user's original question.
- Do not mention where the information came from, just provide the answer.
`;
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
        messageToSendToGemini = `
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
      if (toolResults.source.startsWith('query_') && rankedTools.length > 1) {
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
        if (rankedTools.length > 1) {
          const nextTools = rankedTools.slice(1); // Remove the first tool we already tried
          console.log(`[getAIResponse] Trying next source in ranking: ${nextTools[0]}`);
          
          // Store message indicating we're checking more sources
          await ctx.runMutation(api.chat.appendMessageContent, {
            messageId,
            content: "\n\n*Checking additional sources...*"
          });
          
          // Execute next tool
          console.log(`[getAIResponse] Executing next tool: ${nextTools[0]}`);
          const nextToolResults = await executeToolsSequentially(
            nextTools,
            userMessage,
            ctx,
            genAI,
            selectedModel,
            formattedHistory // Pass conversation history for context-aware tool execution
          );
          
          // Prepare message for next tool result with full conversation context
          let nextMessageToSendToGemini = `
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
