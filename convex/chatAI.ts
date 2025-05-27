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
export interface LawArticle {
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
type InformationSource = "WEB_SEARCH" | "LAW_ON_INSURANCE" | "LAW_ON_CONSUMER_PROTECTION" | "INSURANCE_QNA" | "ALL_DATABASES";

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

// Function to generate a structured search query for the law database
async function generateSearchQuery(userMessage: string, history: { role: string; parts: { text: string; }[]; }[], lawPrompt: string | undefined, tonePrompt: string | undefined, policyPrompt: string | undefined, selectedModel: string | undefined, genAI: GoogleGenerativeAI, searchType: "LAW_DATABASE", isRetry: boolean = false): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: selectedModel || "gemini-2.5-flash-preview-04-17" });
    const systemPrompt = `You are a legal search query generator. Your task is to analyze the user's question and generate an effective search query for our law database.

QUERY GUIDELINES:
1. Extract key legal concepts, terms, and entities from the user's question
2. Include specific article numbers if mentioned or implied
3. Include chapter or section titles if relevant
4. For definitions, include the term being defined
5. For penalties or punishments, include relevant terms like "fine", "imprisonment", etc.
6. For procedural questions, include terms like "procedure", "process", "steps", etc.
7. Format your response as a JSON object with the following structure:
   {
     "mainTerms": ["term1", "term2"],  // 2-5 primary search terms
     "relatedTerms": ["term3", "term4"],  // 2-5 secondary terms
     "articleNumbers": ["7", "8"],  // specific article numbers if mentioned
     "chapterTitles": ["INSURANCE CONTRACT"],  // chapter titles if relevant
     "sectionTitles": ["GENERAL FORMS"]  // section titles if relevant
   }

${isRetry ? "IMPORTANT: The previous query did not yield good results. Please reformulate the query to be more specific and use different keywords." : ""}

Output ONLY the JSON search query object, nothing else. No explanations, no additional text.`;

    // Start a chat to generate the search query
    const chat = model.startChat({
      history: history,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
      },
    });

    const result = await chat.sendMessage(systemPrompt + "\n\nUser's message: " + userMessage);
    let searchQuery = result.response.text().trim();
    
    // Extract direct chapter and article references from the user message
    const chapterMatch = userMessage.match(/chapter\s*(\d+|[ivx]+)/i);
    const articleMatch = userMessage.match(/article\s*(\d+)/i);
    let directReferences = [];
    
    if (chapterMatch && chapterMatch[1]) {
      directReferences.push(`Chapter ${chapterMatch[1].toUpperCase()}`);
    }
    
    if (articleMatch && articleMatch[1]) {
      directReferences.push(`Article ${articleMatch[1]}`);
    }
    
    // Try to parse the JSON response
    try {
      // Remove any markdown code block formatting if present
      let cleanedResponse = searchQuery.replace(/```json|```/g, "").trim();
      
      // Handle non-standard JSON format that might be returned
      if (!cleanedResponse.startsWith("{")) {
        // Try to convert a key-value format to proper JSON
        cleanedResponse = cleanedResponse
          .replace(/([\w]+)\s*:\s*/g, '"$1":') // Convert keys to quoted format
          .replace(/,\s*([\w]+)\s*:/g, ',"$1":') // Fix keys after commas
          .replace(/:\s*([\w\s]+)(?=,|$)/g, ':"$1"') // Quote string values
          .replace(/"([\d]+)"/g, '$1'); // Remove quotes from numbers
          
        // Ensure it's wrapped in braces
        if (!cleanedResponse.startsWith("{")) {
          cleanedResponse = "{" + cleanedResponse + "}";
        }
      }
      
      const jsonQuery = JSON.parse(cleanedResponse);
      // Convert the structured query into a format that works with the existing search system
      const allTerms = [
        ...(jsonQuery.mainTerms || []),
        ...(jsonQuery.relatedTerms || []),
        ...(jsonQuery.articleNumbers || []).map((num: string) => `Article ${num}`),
        ...(jsonQuery.chapterTitles || []),
        ...(jsonQuery.sectionTitles || []),
        ...directReferences // Add direct references from user message
      ].filter(Boolean);
      
      searchQuery = allTerms.join(" ");
      console.log(`[generateSearchQuery] Structured query parsed successfully: ${searchQuery}`);
    } catch (error) {
      // If JSON parsing fails, use the raw text and direct references
      console.error("[generateSearchQuery] Error parsing JSON query:", error);
      // Clean up the text and add direct references
      searchQuery = searchQuery.replace(/[\{\}\[\]\"\'`]/g, " ").replace(/\s+/g, " ").trim();
      if (directReferences.length > 0) {
        searchQuery = directReferences.join(" ") + " " + searchQuery;
      }
      console.log(`[generateSearchQuery] Using cleaned raw text: ${searchQuery}`);
    }
    
    console.log(`[generateSearchQuery] Final query for "${userMessage}": "${searchQuery}"`);
    return searchQuery || userMessage; // Fallback to userMessage if generation fails or is empty
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
  handler: async (
  ctx: any,
  args: {
    userMessage: string;
    userId: Id<"users">;
    lawPrompt?: string;
    tonePrompt?: string;
    policyPrompt?: string;
    selectedModel?: string;
    paneId: string;
    disableSystemPrompt?: boolean;
    disableTools?: boolean;
  }
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

      console.log("[getAIResponse] Calling decideInformationSource with user message, history, and selectedModel...");
      const informationSources: string[] = await decideInformationSource(userMessage, formattedHistory, selectedModel, genAI);
      console.log(`[decideInformationSource] decideInformationSource returned: ${JSON.stringify(informationSources)}`);

      // Map the information sources to database names
      const sourceToDbNameMap: Record<string, string> = {
        "LAW_ON_INSURANCE": "Law_on_Insurance",
        "LAW_ON_CONSUMER_PROTECTION": "Law_on_Consumer_Protection",
        "INSURANCE_QNA": "Insurance_and_reinsurance_in_Cambodia_QnA_format",
        "ALL_DATABASES": "All Databases"
      };
      
      // Get the relevant database names based on the selected information sources
      let relevantDatabaseNames: string[] = [];
      
      // Add selected law databases to the list
      if (!disableTools) {
        if (informationSources.includes("ALL_DATABASES")) {
          // If ALL_DATABASES is selected, include all three law databases
          relevantDatabaseNames = ["Law_on_Insurance", "Law_on_Consumer_Protection", "Insurance_and_reinsurance_in_Cambodia_QnA_format"];
        } else {
          for (const source of informationSources) {
            if (source !== "WEB_SEARCH" && sourceToDbNameMap[source]) {
              relevantDatabaseNames.push(sourceToDbNameMap[source]);
            }
          }
        }
      }
      
      if (relevantDatabaseNames.length > 0) {
        console.log(`[getAIResponse] Using selected law databases: ${JSON.stringify(relevantDatabaseNames)}`);
        
        // Log the database names that we're requesting to help with debugging
        console.log(`[getAIResponse] Database names being requested: ${JSON.stringify(relevantDatabaseNames)}`);

        try {
          console.log("[getAIResponse] Accessing full law database(s).");
          const lawDatabaseContent: string = await ctx.runQuery(api.chat.getLawDatabaseContent, { databaseNames: relevantDatabaseNames });
          console.log(`[getAIResponse] Raw database content length: ${lawDatabaseContent?.length || 0} characters`);
          const lawDatabaseResults = JSON.parse(lawDatabaseContent);

          // For each selected database, add the full content to the context
          for (const dbName of relevantDatabaseNames) {
            if (!lawDatabaseResults[dbName] || lawDatabaseResults[dbName].error) {
              console.log(`[getAIResponse] Database not available or error: ${dbName}`);
              continue;
            }

            console.log(`[getAIResponse] Adding full database content for: ${dbName}`);
            lawDatabaseContextForLLM += `\n\n--- FULL DATABASE: ${dbName} ---\n${JSON.stringify(lawDatabaseResults[dbName])}\n---\n`;
          }

          if (lawDatabaseContextForLLM) {
            lawDatabaseInfoForSystemPrompt = `Full content from the following law databases is provided below: ${relevantDatabaseNames.join(", ")}. You MUST use this information to answer the user's query.`;
          } else {
            lawDatabaseInfoForSystemPrompt = "The requested law databases could not be accessed. Answering from general knowledge.";
          }
        } catch (error) {
          console.error(`[getAIResponse] Error accessing law database: ${error}`);
          console.error(`[getAIResponse] Error details: ${JSON.stringify(error)}`);
          lawDatabaseInfoForSystemPrompt = "An error occurred while accessing the law database. Answering from general knowledge. If you mentioned a specific article or law, I might not have access to that particular information.";
        }
      } else {
        lawDatabaseInfoForSystemPrompt = "No specific law databases were determined to be relevant for this query.";
      }

     // At the top of the handler:
let useWebSearch: boolean = false;
const toolsToUse: any[] = [];
// ...
// Later in the handler, after informationSources is available:
useWebSearch = !disableTools && informationSources.includes("WEB_SEARCH");
if (!disableTools && useWebSearch) {
        console.log(`[getAIResponse] Decision: Enabling Google Search tool for pane ${paneId}. disableTools=${disableTools}, informationSources=${JSON.stringify(informationSources)}`);
        // ... (rest of the code remains the same)
        toolsToUse.push(googleSearchTool);
        webSearchInfoForSystemPrompt = `Google Search tool was enabled. If the model uses the tool, relevant web search results will be provided in groundingMetadata. You MUST synthesize this information to answer the user's query if it's relevant, strictly adhering to any specific number of items requested by the user (e.g., "top 5"). Format any list of items as a Markdown bulleted list, each item starting with '- '. Follow WEB_SEARCH_USAGE_INSTRUCTIONS for how to present this information.`;
      } else if (disableTools) {
        console.log(`[getAIResponse] Decision: Tools explicitly disabled for pane ${paneId}, therefore NOT performing any external search or database access. Answering from general knowledge only. disableTools=${disableTools}, informationSources=${JSON.stringify(informationSources)}`);
        webSearchInfoForSystemPrompt = "All external information sources (both law database and web search) were explicitly disabled for this query. Answer from general knowledge only.";
        lawDatabaseInfoForSystemPrompt = "Law database access was explicitly disabled for this query. Answer from general knowledge only.";
      } else if (informationSources.length === 0) {
        console.log(`[getAIResponse] Decision: NOT performing any external search for pane ${paneId}. Answering from general knowledge. disableTools=${disableTools}, informationSources=${JSON.stringify(informationSources)}`);
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
// The lines above give you crucial context about the law databases that were provided to you.

Your primary goal is to answer the user's question.
- You have been provided with FULL DATABASE CONTENT for the selected law databases. Use this information to answer the user's question.
- If the user's question asks about a specific article, search through the provided database to find that article.
- For article references, look for both the exact article number and any variations (e.g., for "Article 3", look for "Article 3", "Article III", etc.)
- The databases have enhanced structure with unique IDs, full-text fields, keywords, tags, and related articles. Use this structure to find the most relevant information.
- If multiple databases were provided, prioritize the most relevant one for the user's query.
- If no law databases were provided, or if the provided databases don't contain the information sought, answer from your general training knowledge to the best of your ability.
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

      if (messageId === null) throw new Error("Failed to generate messageId");
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
