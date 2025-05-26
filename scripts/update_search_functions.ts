/**
 * This file contains updated search functions to work with the enhanced database structure.
 * Copy these functions to your chatAI.ts file after enhancing your database.
 */

// Enhanced interface for the law database structure
interface EnhancedLawArticle extends LawArticle {
  id: string;
  normalized_number: string;
  fullText: string;
  keywords: string[];
  tags: string[];
  relatedArticles: string[];
  chapter_ref: string;
  chapter_title: string;
  section_ref?: string;
  section_title?: string;
}

interface EnhancedLawSection extends LawSection {
  id: string;
  normalized_number: string;
  search_terms: string[];
  articles: EnhancedLawArticle[];
}

interface EnhancedLawChapter extends LawChapter {
  id: string;
  normalized_number: string;
  search_terms: string[];
  articles?: EnhancedLawArticle[];
  sections?: EnhancedLawSection[];
}

interface EnhancedLawDatabase extends LawDatabase {
  metadata: {
    version: string;
    last_updated: string;
    enhanced: boolean;
    [key: string]: any;
  };
  chapters: EnhancedLawChapter[];
}

/**
 * Enhanced function to query the law database using the optimized structure
 */
async function queryEnhancedLawDatabase(query: string, lawDatabase: EnhancedLawDatabase): Promise<string> {
  // Check if the database is enhanced
  const isEnhanced = lawDatabase.metadata?.enhanced === true;
  if (!isEnhanced) {
    console.log("[queryEnhancedLawDatabase] Database is not enhanced, falling back to standard query");
    return queryLawDatabase(query, lawDatabase as LawDatabase);
  }

  console.log(`[queryEnhancedLawDatabase] Searching enhanced law database for query: "${query}"`);
  const queryKeywords = query.toLowerCase().split(/\s+/);
  const scoredResults: { content: string; score: number; id?: string; chapterTitle?: string; sectionTitle?: string }[] = [];

  // Check for direct chapter and article references
  const chapterMatch = query.match(/chapter\s*([IVX\d]+)/i);
  const articleMatch = query.match(/article\s*(\d+)/i);
  
  // Direct lookup by ID if we have specific references
  if (chapterMatch && articleMatch) {
    const targetChapter = chapterMatch[1].toUpperCase();
    const targetArticle = articleMatch[1];
    console.log(`[queryEnhancedLawDatabase] Direct reference detected: Chapter ${targetChapter}, Article ${targetArticle}`);
    
    // Try to find the article by ID using the enhanced structure
    const article = findArticleById(lawDatabase, targetChapter, targetArticle);
    
    if (article) {
      console.log(`[queryEnhancedLawDatabase] Found direct article match by ID: ${article.id}`);
      
      // Format the article content with all its properties
      const formattedContent = formatArticleContent(article);
      
      // Add related articles if available
      let relatedContent = "";
      if (article.relatedArticles && article.relatedArticles.length > 0) {
        relatedContent = "\n\nRelated Articles:\n";
        const relatedArticles = findRelatedArticles(lawDatabase, article.relatedArticles);
        relatedArticles.forEach(related => {
          relatedContent += `- Article ${related.article_number}`;
          if (related.chapter_title) {
            relatedContent += ` (${related.chapter_title}`;
            if (related.section_title) {
              relatedContent += `, ${related.section_title}`;
            }
            relatedContent += ")";
          }
          relatedContent += "\n";
        });
      }
      
      // Return the formatted content with chapter/section headers
      let result = "";
      if (article.chapter_title) {
        result += `--- Chapter ${targetChapter}: ${article.chapter_title} ---\n\n`;
      }
      if (article.section_title) {
        result += `--- Section: ${article.section_title} ---\n\n`;
      }
      result += formattedContent + relatedContent;
      
      return result;
    }
  }
  
  // If no direct match, perform keyword-based search
  console.log("[queryEnhancedLawDatabase] No direct match found, performing keyword search");
  
  // Search in all articles using fullText and keywords
  const allArticles = getAllArticles(lawDatabase);
  
  for (const article of allArticles) {
    let score = 0;
    
    // Score based on fullText
    for (const keyword of queryKeywords) {
      if (article.fullText.toLowerCase().includes(keyword)) {
        score += 1;
      }
    }
    
    // Bonus score for keyword matches
    if (article.keywords) {
      for (const keyword of article.keywords) {
        if (queryKeywords.includes(keyword)) {
          score += 3; // Higher weight for keyword matches
        }
      }
    }
    
    // Bonus score for tag matches
    if (article.tags) {
      for (const tag of article.tags) {
        for (const keyword of queryKeywords) {
          if (tag.includes(keyword)) {
            score += 2; // Medium weight for tag matches
          }
        }
      }
    }
    
    // If article has a decent score, add it to results
    if (score > 0) {
      const formattedContent = formatArticleContent(article);
      let content = "";
      
      if (article.chapter_title) {
        content += `--- Chapter ${article.chapter_ref.replace('chap_', '')}: ${article.chapter_title} ---\n\n`;
      }
      if (article.section_title) {
        content += `--- Section: ${article.section_title} ---\n\n`;
      }
      content += formattedContent;
      
      scoredResults.push({
        content,
        score,
        id: article.id,
        chapterTitle: article.chapter_title,
        sectionTitle: article.section_title
      });
    }
  }
  
  // Sort results by score (highest first)
  scoredResults.sort((a, b) => b.score - a.score);
  
  // Take top results
  const topResults = scoredResults.slice(0, 5);
  
  if (topResults.length > 0) {
    console.log(`[queryEnhancedLawDatabase] Found ${topResults.length} relevant articles`);
    return topResults.map(result => result.content).join('\n\n');
  } else {
    console.log("[queryEnhancedLawDatabase] No relevant content found");
    return "LAW_DATABASE_NO_RESULTS";
  }
}

/**
 * Helper function to find an article by chapter and article number
 */
function findArticleById(lawDatabase: EnhancedLawDatabase, chapterNum: string, articleNum: string): EnhancedLawArticle | null {
  // Normalize chapter number (handle both Roman and Arabic)
  const normalizedChapterNum = normalizeNumber(chapterNum);
  
  for (const chapter of lawDatabase.chapters) {
    // Skip if chapter number doesn't match
    if (normalizeNumber(chapter.chapter_number) !== normalizedChapterNum) {
      continue;
    }
    
    // Check articles directly under chapter
    if (chapter.articles) {
      for (const article of chapter.articles) {
        if (article.article_number === articleNum) {
          return article as EnhancedLawArticle;
        }
      }
    }
    
    // Check articles in sections
    if (chapter.sections) {
      for (const section of chapter.sections) {
        for (const article of section.articles) {
          if (article.article_number === articleNum) {
            return article as EnhancedLawArticle;
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Helper function to normalize numbers (convert Roman to Arabic)
 */
function normalizeNumber(num: string): string {
  // Roman numeral conversion map
  const romanMap: {[key: string]: number} = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
  };
  
  // Check if it's a Roman numeral
  if (/^[IVXLCDM]+$/i.test(num)) {
    let result = 0;
    const upperNum = num.toUpperCase();
    
    for (let i = 0; i < upperNum.length; i++) {
      const current = romanMap[upperNum[i]];
      const next = i + 1 < upperNum.length ? romanMap[upperNum[i + 1]] : 0;
      
      if (current < next) {
        result -= current;
      } else {
        result += current;
      }
    }
    
    return result.toString();
  }
  
  // Already an Arabic numeral
  return num;
}

/**
 * Helper function to get all articles from the database
 */
function getAllArticles(lawDatabase: EnhancedLawDatabase): EnhancedLawArticle[] {
  const allArticles: EnhancedLawArticle[] = [];
  
  for (const chapter of lawDatabase.chapters) {
    // Add articles directly under chapter
    if (chapter.articles) {
      allArticles.push(...chapter.articles as EnhancedLawArticle[]);
    }
    
    // Add articles in sections
    if (chapter.sections) {
      for (const section of chapter.sections) {
        allArticles.push(...section.articles as EnhancedLawArticle[]);
      }
    }
  }
  
  return allArticles;
}

/**
 * Helper function to find related articles by their IDs
 */
function findRelatedArticles(lawDatabase: EnhancedLawDatabase, relatedIds: string[]): EnhancedLawArticle[] {
  const result: EnhancedLawArticle[] = [];
  const allArticles = getAllArticles(lawDatabase);
  
  for (const id of relatedIds) {
    const article = allArticles.find(a => a.id === id);
    if (article) {
      result.push(article);
    }
  }
  
  return result;
}

/**
 * Helper function to format article content with all its properties
 */
function formatArticleContent(article: EnhancedLawArticle): string {
  let content = `Article ${article.article_number}: ${article.content}`;
  
  // Add points if available
  if (article.points && article.points.length > 0) {
    content += "\n\nPoints:";
    article.points.forEach(point => {
      content += `\n- ${point}`;
    });
  }
  
  // Add definitions if available
  if (article.definitions) {
    content += "\n\nDefinitions:";
    for (const [term, definition] of Object.entries(article.definitions)) {
      content += `\n- ${term}: ${definition}`;
    }
  }
  
  // Add other properties if they exist
  const propertyMap: {[key: string]: string} = {
    'sub_types': 'Sub Types',
    'prohibitions': 'Prohibitions',
    'business_types': 'Business Types',
    'priority_order': 'Priority Order',
    'conditions': 'Conditions',
    'punishments': 'Punishments'
  };
  
  for (const [propKey, propTitle] of Object.entries(propertyMap)) {
    const prop = propKey as keyof LawArticle;
    if (article[prop] && Array.isArray(article[prop])) {
      content += `\n\n${propTitle}:`;
      (article[prop] as string[]).forEach(item => {
        content += `\n- ${item}`;
      });
    }
  }
  
  // Add punishment details if they exist
  if (article.punishment_natural_person) {
    content += `\n\nPunishment (Natural Person): ${article.punishment_natural_person}`;
  }
  
  if (article.punishment_legal_person) {
    content += `\n\nPunishment (Legal Person): ${article.punishment_legal_person}`;
  }
  
  // Add keywords and tags if available (for debugging)
  // content += "\n\nKeywords: " + (article.keywords || []).join(", ");
  // content += "\n\nTags: " + (article.tags || []).join(", ");
  
  return content;
}
