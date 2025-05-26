import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";

// Define types for the enhanced database structure
type EnhancedArticle = {
  id: string;
  article_number: string;
  content: string;
  fullText: string;
  keywords: string[];
  tags: string[];
  relatedArticles: string[];
  chapter_ref: string;
  chapter_title: string;
  section_ref?: string;
  section_title?: string;
  points?: string[];
  definitions?: Record<string, string>;
};

type EnhancedSection = {
  id: string;
  section_number: string;
  section_title: string;
  search_terms: string[];
  articles: EnhancedArticle[];
};

type EnhancedChapter = {
  id: string;
  chapter_number: string;
  chapter_title: string;
  search_terms: string[];
  articles?: EnhancedArticle[];
  sections?: EnhancedSection[];
};

type EnhancedLawDatabase = {
  metadata: {
    version: string;
    last_updated: string;
    enhanced: boolean;
  };
  chapters: EnhancedChapter[];
};

/**
 * Converts Roman numerals to Arabic numbers
 */
function romanToArabic(roman: string): number {
  if (!roman) return 0;
  
  const romanMap: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000
  };

  let result = 0;
  const upperRoman = roman.toUpperCase();

  for (let i = 0; i < upperRoman.length; i++) {
    const current = romanMap[upperRoman[i]];
    const next = romanMap[upperRoman[i + 1]];

    if (next && current < next) {
      result += next - current;
      i++;
    } else {
      result += current;
    }
  }

  return result;
}

/**
 * Check if a string is a Roman numeral
 */
function isRomanNumeral(str: string): boolean {
  return /^[IVXLCDM]+$/i.test(str);
}

/**
 * Compare two chapter or article numbers, handling both Arabic and Roman numerals
 */
function compareNumbers(a: string, b: string): boolean {
  // Convert to strings if they aren't already
  const strA = String(a).trim();
  const strB = String(b).trim();
  
  // If both are numeric, compare as numbers
  if (!isNaN(Number(strA)) && !isNaN(Number(strB))) {
    return Number(strA) === Number(strB);
  }
  
  // If both are Roman numerals, convert and compare
  if (isRomanNumeral(strA) && isRomanNumeral(strB)) {
    return romanToArabic(strA) === romanToArabic(strB);
  }
  
  // If one is Roman and one is Arabic, convert Roman to Arabic and compare
  if (isRomanNumeral(strA) && !isNaN(Number(strB))) {
    return romanToArabic(strA) === Number(strB);
  }
  
  if (!isNaN(Number(strA)) && isRomanNumeral(strB)) {
    return Number(strA) === romanToArabic(strB);
  }
  
  // Direct string comparison as fallback
  return strA === strB;
}

/**
 * Extract keywords from a search query
 */
function extractKeywords(query: string): string[] {
  // Remove punctuation and convert to lowercase
  const cleanedQuery = query.toLowerCase().replace(/[^\w\s]/g, ' ');
  const words = cleanedQuery.split(/\s+/);
  
  // Remove common stop words
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'from', 'by', 'for', 'with', 'about', 'to', 'in', 'on', 'of']);
  const filteredWords = words.filter(word => !stopWords.has(word) && word.length > 2);
  
  // Return unique keywords
  return [...new Set(filteredWords)];
}

/**
 * Check if a query is looking for a specific chapter
 */
function isChapterQuery(query: string): { isChapter: boolean; chapterNum: string } {
  const chapterRegex = /\b(?:chapter|chap\.?|ch\.?)\s+([IVXLCDM\d]+)\b/i;
  const match = query.match(chapterRegex);
  
  if (match) {
    return { isChapter: true, chapterNum: match[1] };
  }
  
  return { isChapter: false, chapterNum: '' };
}

/**
 * Check if a query is looking for a specific article
 */
function isArticleQuery(query: string): { isArticle: boolean; articleNum: string } {
  const articleRegex = /\b(?:article|art\.?)\s+(\d+)\b/i;
  const match = query.match(articleRegex);
  
  if (match) {
    return { isArticle: true, articleNum: match[1] };
  }
  
  return { isArticle: false, articleNum: '' };
}

/**
 * Score an article based on how well it matches the search query
 */
function scoreArticle(article: EnhancedArticle, queryKeywords: string[]): number {
  let score = 0;
  
  // Check fullText for keyword matches
  const fullTextLower = article.fullText.toLowerCase();
  for (const keyword of queryKeywords) {
    const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (keywordRegex.test(fullTextLower)) {
      score += 2;
    }
  }
  
  // Check if any of the article's keywords match query keywords
  for (const keyword of article.keywords || []) {
    if (queryKeywords.includes(keyword.toLowerCase())) {
      score += 5;
    }
  }
  
  // Check if any of the article's tags match query keywords
  for (const tag of article.tags || []) {
    if (queryKeywords.includes(tag.toLowerCase())) {
      score += 3;
    }
  }
  
  return score;
}

/**
 * Helper function to load the enhanced law database
 */
async function loadEnhancedLawDatabaseHelper(databaseName: string): Promise<EnhancedLawDatabase> {
  try {
    // Construct the file path
    const filePath = `Database/Enhanced_${databaseName}.json`;
    
    // Read the file using Node.js fs module
    const fs = require('fs');
    const data = fs.readFileSync(filePath, 'utf8');
    
    // Parse the JSON data
    const lawDatabase = JSON.parse(data) as EnhancedLawDatabase;
    
    return lawDatabase;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error loading enhanced law database:", errorMessage);
    throw new Error(`Failed to load enhanced law database: ${errorMessage}`);
  }
}

/**
 * Enhanced search function for the law database
 */
export async function queryEnhancedLawDatabase(query: string, lawDatabase: EnhancedLawDatabase): Promise<string> {
  // Check if query is empty
  if (!query.trim()) {
    return "Please provide a search query.";
  }
  
  // Extract keywords from the query
  const queryKeywords = extractKeywords(query);
  
  // Check if looking for a specific chapter
  const { isChapter, chapterNum } = isChapterQuery(query);
  
  // Check if looking for a specific article
  const { isArticle, articleNum } = isArticleQuery(query);
  console.log(`[queryEnhancedLawDatabase] Query: "${query}", isArticle: ${isArticle}, articleNum: "${articleNum}"`);
  
  // Results array with scores
  const scoredResults: { content: string; score: number; chapterTitle?: string; sectionTitle?: string; id?: string }[] = [];
  
  // Direct lookup for specific chapter
  if (isChapter) {
    for (const chapter of lawDatabase.chapters) {
      if (compareNumbers(chapter.chapter_number, chapterNum)) {
        let chapterContent = `# Chapter ${chapter.chapter_number}: ${chapter.chapter_title}\n\n`;
        
        // Add articles directly under the chapter
        if (chapter.articles && chapter.articles.length > 0) {
          chapterContent += "## Articles\n\n";
          for (const article of chapter.articles) {
            chapterContent += `### Article ${article.article_number}\n${article.content}\n\n`;
          }
        }
        
        // Add sections and their articles
        if (chapter.sections && chapter.sections.length > 0) {
          for (const section of chapter.sections) {
            chapterContent += `## Section ${section.section_number}: ${section.section_title}\n\n`;
            
            if (section.articles && section.articles.length > 0) {
              for (const article of section.articles) {
                chapterContent += `### Article ${article.article_number}\n${article.content}\n\n`;
              }
            }
          }
        }
        
        return chapterContent;
      }
    }
  }
  
  // Direct lookup for specific article
  if (isArticle) {
    console.log(`[queryEnhancedLawDatabase] Searching for Article ${articleNum}`);
    let foundArticle = false;
    let articleContent = "";
    
    // Search for the article across all chapters and sections
    for (const chapter of lawDatabase.chapters) {
      // Check articles directly under chapter
      if (chapter.articles) {
        for (const article of chapter.articles) {
          console.log(`[queryEnhancedLawDatabase] Comparing article_number: "${article.article_number}" with articleNum: "${articleNum}"`);
          if (compareNumbers(article.article_number, articleNum)) {
            console.log(`[queryEnhancedLawDatabase] Found Article ${articleNum} in Chapter ${chapter.chapter_number}`);
            foundArticle = true;
            articleContent = `# Article ${article.article_number}\n${article.fullText || article.content}\n\n`;
            articleContent += `From Chapter ${chapter.chapter_number}: ${chapter.chapter_title}\n\n`;
            
            // Add related articles if available
            if (article.relatedArticles && article.relatedArticles.length > 0) {
              articleContent += "## Related Articles\n";
              for (const relatedId of article.relatedArticles) {
                articleContent += `- ${relatedId}\n`;
              }
            }
            
            return articleContent;
          }
        }
      }
      
      // Check articles in sections
      if (chapter.sections) {
        for (const section of chapter.sections) {
          for (const article of section.articles) {
            console.log(`[queryEnhancedLawDatabase] Comparing article_number: "${article.article_number}" with articleNum: "${articleNum}"`);
            if (compareNumbers(article.article_number, articleNum)) {
              console.log(`[queryEnhancedLawDatabase] Found Article ${articleNum} in Chapter ${chapter.chapter_number}, Section ${section.section_number}`);
              foundArticle = true;
              articleContent = `# Article ${article.article_number}\n${article.fullText || article.content}\n\n`;
              articleContent += `From Chapter ${chapter.chapter_number}: ${chapter.chapter_title}, Section ${section.section_number}: ${section.section_title}\n\n`;
              
              // Add related articles if available
              if (article.relatedArticles && article.relatedArticles.length > 0) {
                articleContent += "## Related Articles\n";
                for (const relatedId of article.relatedArticles) {
                  articleContent += `- ${relatedId}\n`;
                }
              }
              
              return articleContent;
            }
          }
        }
      }
    }
    
    // If we get here and foundArticle is still false, log that we couldn't find the article
    if (!foundArticle) {
      console.log(`[queryEnhancedLawDatabase] Article ${articleNum} not found in the database`);
    }
  }
  
  // Keyword-based search if no direct chapter or article match
  for (const chapter of lawDatabase.chapters) {
    // Score chapter title
    const chapterTitleLower = chapter.chapter_title.toLowerCase();
    let chapterScore = 0;
    for (const keyword of queryKeywords) {
      if (chapterTitleLower.includes(keyword)) {
        chapterScore += 3;
      }
    }
    
    // Check articles directly under chapter
    if (chapter.articles) {
      for (const article of chapter.articles) {
        const score = scoreArticle(article, queryKeywords) + chapterScore;
        
        if (score > 0) {
          scoredResults.push({
            content: article.content,
            score,
            chapterTitle: chapter.chapter_title,
            id: article.id
          });
        }
      }
    }
    
    // Check articles in sections
    if (chapter.sections) {
      for (const section of chapter.sections) {
        // Score section title
        const sectionTitleLower = section.section_title.toLowerCase();
        let sectionScore = chapterScore;
        for (const keyword of queryKeywords) {
          if (sectionTitleLower.includes(keyword)) {
            sectionScore += 2;
          }
        }
        
        for (const article of section.articles) {
          const score = scoreArticle(article, queryKeywords) + sectionScore;
          
          if (score > 0) {
            scoredResults.push({
              content: article.content,
              score,
              chapterTitle: chapter.chapter_title,
              sectionTitle: section.section_title,
              id: article.id
            });
          }
        }
      }
    }
  }
  
  // Sort results by score (highest first)
  scoredResults.sort((a, b) => b.score - a.score);
  
  // Format and return results
  if (scoredResults.length === 0) {
    return "No results found for your query.";
  }
  
  let resultText = `# Search Results for "${query}"\n\n`;
  
  // Take top 5 results
  const topResults = scoredResults.slice(0, 5);
  
  for (const [index, result] of topResults.entries()) {
    resultText += `## Result ${index + 1} (Score: ${result.score})\n`;
    if (result.sectionTitle) {
      resultText += `From Chapter: ${result.chapterTitle}, Section: ${result.sectionTitle}\n\n`;
    } else {
      resultText += `From Chapter: ${result.chapterTitle}\n\n`;
    }
    resultText += `${result.content}\n\n`;
    
    // Add ID for reference
    if (result.id) {
      resultText += `ID: ${result.id}\n\n`;
    }
  }
  
  return resultText;
}

/**
 * Load the enhanced law database
 */
export const loadEnhancedLawDatabase = query({
  args: {
    databaseName: v.string(),
  },
  handler: async (ctx, args) => {
    return await loadEnhancedLawDatabaseHelper(args.databaseName);
  },
});

/**
 * Search the enhanced law database
 */
export const searchEnhancedLawDatabase = query({
  args: {
    query: v.string(),
    databaseName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { query, databaseName } = args;
      
      // Load the enhanced law database
      const lawDatabase = await loadEnhancedLawDatabaseHelper(databaseName);
      
      // Query the law database
      const results = await queryEnhancedLawDatabase(query, lawDatabase);
      
      return results;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error searching enhanced law database:", errorMessage);
      throw new Error(`Failed to search enhanced law database: ${errorMessage}`);
    }
  },
});

/**
 * Get article by ID
 */
export const getArticleById = query({
  args: {
    articleId: v.string(),
    databaseName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { articleId, databaseName } = args;
      
      // Load the enhanced law database
      const lawDatabase = await loadEnhancedLawDatabaseHelper(databaseName);
      
      // Search for the article by ID
      for (const chapter of lawDatabase.chapters) {
        // Check articles directly under chapter
        if (chapter.articles) {
          for (const article of chapter.articles) {
            if (article.id === articleId) {
              return {
                article,
                chapter: {
                  id: chapter.id,
                  chapter_number: chapter.chapter_number,
                  chapter_title: chapter.chapter_title,
                },
              };
            }
          }
        }
        
        // Check articles in sections
        if (chapter.sections) {
          for (const section of chapter.sections) {
            for (const article of section.articles) {
              if (article.id === articleId) {
                return {
                  article,
                  chapter: {
                    id: chapter.id,
                    chapter_number: chapter.chapter_number,
                    chapter_title: chapter.chapter_title,
                  },
                  section: {
                    id: section.id,
                    section_number: section.section_number,
                    section_title: section.section_title,
                  },
                };
              }
            }
          }
        }
      }
      
      throw new Error(`Article with ID ${articleId} not found`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error getting article by ID:", errorMessage);
      throw new Error(`Failed to get article by ID: ${errorMessage}`);
    }
  },
});

/**
 * Search by tags
 */
export const searchByTags = query({
  args: {
    tags: v.array(v.string()),
    databaseName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { tags, databaseName } = args;
      
      // Load the enhanced law database
      const lawDatabase = await loadEnhancedLawDatabaseHelper(databaseName);
      
      // Results array
      const results: EnhancedArticle[] = [];
      
      // Search for articles with matching tags
      for (const chapter of lawDatabase.chapters) {
        // Check articles directly under chapter
        if (chapter.articles) {
          for (const article of chapter.articles) {
            if (article.tags) {
              const hasMatchingTag = tags.some(tag => 
                article.tags.some((articleTag: string) => 
                  articleTag.toLowerCase() === tag.toLowerCase()
                )
              );
              
              if (hasMatchingTag) {
                results.push(article);
              }
            }
          }
        }
        
        // Check articles in sections
        if (chapter.sections) {
          for (const section of chapter.sections) {
            for (const article of section.articles) {
              if (article.tags) {
                const hasMatchingTag = tags.some(tag => 
                  article.tags.some((articleTag: string) => 
                    articleTag.toLowerCase() === tag.toLowerCase()
                  )
                );
                
                if (hasMatchingTag) {
                  results.push(article);
                }
              }
            }
          }
        }
      }
      
      return results;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error searching by tags:", errorMessage);
      throw new Error(`Failed to search by tags: ${errorMessage}`);
    }
  },
});

/**
 * Search by keywords
 */
export const searchByKeywords = query({
  args: {
    keywords: v.array(v.string()),
    databaseName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { keywords, databaseName } = args;
      
      // Load the enhanced law database
      const lawDatabase = await loadEnhancedLawDatabaseHelper(databaseName);
      
      // Results array with scores
      const scoredResults: { article: EnhancedArticle; score: number }[] = [];
      
      // Search for articles with matching keywords
      for (const chapter of lawDatabase.chapters) {
        // Check articles directly under chapter
        if (chapter.articles) {
          for (const article of chapter.articles) {
            if (article.keywords) {
              let score = 0;
              
              for (const keyword of keywords) {
                const matchCount = article.keywords.filter((k: string) => 
                  k.toLowerCase() === keyword.toLowerCase()
                ).length;
                
                score += matchCount * 2;
              }
              
              if (score > 0) {
                scoredResults.push({ article, score });
              }
            }
          }
        }
        
        // Check articles in sections
        if (chapter.sections) {
          for (const section of chapter.sections) {
            for (const article of section.articles) {
              if (article.keywords) {
                let score = 0;
                
                for (const keyword of keywords) {
                  const matchCount = article.keywords.filter((k: string) => 
                    k.toLowerCase() === keyword.toLowerCase()
                  ).length;
                  
                  score += matchCount * 2;
                }
                
                if (score > 0) {
                  scoredResults.push({ article, score });
                }
              }
            }
          }
        }
      }
      
      // Sort results by score (highest first)
      scoredResults.sort((a, b) => b.score - a.score);
      
      // Return top results
      return scoredResults.slice(0, 10).map(result => result.article);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error searching by keywords:", errorMessage);
      throw new Error(`Failed to search by keywords: ${errorMessage}`);
    }
  },
});
