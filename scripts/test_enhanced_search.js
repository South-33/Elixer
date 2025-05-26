// Test script for enhanced search functionality
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the enhanced database
function loadEnhancedDatabase(databaseName) {
  try {
    const filePath = path.join(__dirname, '..', 'Database', `Enhanced_${databaseName}.json`);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading database: ${error.message}`);
    return null;
  }
}

// Import the search functions
// Note: Since we can't directly import TypeScript in Node.js without compilation,
// we'll reimplement the essential functions here for testing

// Convert Roman numerals to Arabic
function romanToArabic(roman) {
  if (!roman) return 0;
  
  const romanMap = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000
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

// Check if a string is a Roman numeral
function isRomanNumeral(str) {
  return /^[IVXLCDM]+$/i.test(str);
}

// Compare two chapter or article numbers
function compareNumbers(a, b) {
  const strA = String(a).trim();
  const strB = String(b).trim();
  
  if (!isNaN(Number(strA)) && !isNaN(Number(strB))) {
    return Number(strA) === Number(strB);
  }
  
  if (isRomanNumeral(strA) && isRomanNumeral(strB)) {
    return romanToArabic(strA) === romanToArabic(strB);
  }
  
  if (isRomanNumeral(strA) && !isNaN(Number(strB))) {
    return romanToArabic(strA) === Number(strB);
  }
  
  if (!isNaN(Number(strA)) && isRomanNumeral(strB)) {
    return Number(strA) === romanToArabic(strB);
  }
  
  return strA === strB;
}

// Extract keywords from query
function extractKeywords(query) {
  const cleanedQuery = query.toLowerCase().replace(/[^\w\s]/g, ' ');
  const words = cleanedQuery.split(/\s+/);
  
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'from', 'by', 'for', 'with', 'about', 'to', 'in', 'on', 'of']);
  const filteredWords = words.filter(word => !stopWords.has(word) && word.length > 2);
  
  return [...new Set(filteredWords)];
}

// Check if query is looking for a specific chapter
function isChapterQuery(query) {
  const chapterRegex = /\b(?:chapter|chap\.?|ch\.?)\s+([IVXLCDM\d]+)\b/i;
  const match = query.match(chapterRegex);
  
  if (match) {
    return { isChapter: true, chapterNum: match[1] };
  }
  
  return { isChapter: false, chapterNum: '' };
}

// Check if query is looking for a specific article
function isArticleQuery(query) {
  const articleRegex = /\b(?:article|art\.?)\s+(\d+)\b/i;
  const match = query.match(articleRegex);
  
  if (match) {
    return { isArticle: true, articleNum: match[1] };
  }
  
  return { isArticle: false, articleNum: '' };
}

// Score an article based on query keywords
function scoreArticle(article, queryKeywords) {
  let score = 0;
  
  const fullTextLower = article.fullText.toLowerCase();
  for (const keyword of queryKeywords) {
    const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (keywordRegex.test(fullTextLower)) {
      score += 2;
    }
  }
  
  for (const keyword of article.keywords || []) {
    if (queryKeywords.includes(keyword.toLowerCase())) {
      score += 5;
    }
  }
  
  for (const tag of article.tags || []) {
    if (queryKeywords.includes(tag.toLowerCase())) {
      score += 3;
    }
  }
  
  return score;
}

// Main search function
function searchDatabase(query, lawDatabase) {
  if (!query.trim()) {
    return "Please provide a search query.";
  }
  
  const queryKeywords = extractKeywords(query);
  const { isChapter, chapterNum } = isChapterQuery(query);
  const { isArticle, articleNum } = isArticleQuery(query);
  
  const scoredResults = [];
  
  // Direct chapter lookup
  if (isChapter) {
    for (const chapter of lawDatabase.chapters) {
      if (compareNumbers(chapter.chapter_number, chapterNum)) {
        return `Found Chapter ${chapter.chapter_number}: ${chapter.chapter_title}`;
      }
    }
  }
  
  // Direct article lookup
  if (isArticle) {
    for (const chapter of lawDatabase.chapters) {
      if (chapter.articles) {
        for (const article of chapter.articles) {
          if (compareNumbers(article.article_number, articleNum)) {
            return `Found Article ${article.article_number} in Chapter ${chapter.chapter_title}`;
          }
        }
      }
      
      if (chapter.sections) {
        for (const section of chapter.sections) {
          for (const article of section.articles) {
            if (compareNumbers(article.article_number, articleNum)) {
              return `Found Article ${article.article_number} in Chapter ${chapter.chapter_title}, Section ${section.section_title}`;
            }
          }
        }
      }
    }
  }
  
  // Keyword search
  for (const chapter of lawDatabase.chapters) {
    const chapterTitleLower = chapter.chapter_title.toLowerCase();
    let chapterScore = 0;
    for (const keyword of queryKeywords) {
      if (chapterTitleLower.includes(keyword)) {
        chapterScore += 3;
      }
    }
    
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
    
    if (chapter.sections) {
      for (const section of chapter.sections) {
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
  
  // Sort results by score
  scoredResults.sort((a, b) => b.score - a.score);
  
  if (scoredResults.length === 0) {
    return "No results found for your query.";
  }
  
  // Return top results
  return `Found ${scoredResults.length} results. Top result (score: ${scoredResults[0].score}): ${scoredResults[0].content.substring(0, 100)}...`;
}

// Function to search by tag
function searchByTag(tag, lawDatabase) {
  const results = [];
  
  for (const chapter of lawDatabase.chapters) {
    if (chapter.articles) {
      for (const article of chapter.articles) {
        if (article.tags && article.tags.some(t => t.toLowerCase() === tag.toLowerCase())) {
          results.push(article);
        }
      }
    }
    
    if (chapter.sections) {
      for (const section of chapter.sections) {
        for (const article of section.articles) {
          if (article.tags && article.tags.some(t => t.toLowerCase() === tag.toLowerCase())) {
            results.push(article);
          }
        }
      }
    }
  }
  
  return results;
}

// Function to get article by ID
function getArticleById(articleId, lawDatabase) {
  for (const chapter of lawDatabase.chapters) {
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
  
  return null;
}

// Run tests
async function runTests() {
  console.log("Loading enhanced law database...");
  const lawDatabase = loadEnhancedDatabase("Law_on_Insurance");
  
  if (!lawDatabase) {
    console.error("Failed to load database");
    return;
  }
  
  console.log("Database loaded successfully!");
  console.log(`Database has ${lawDatabase.chapters.length} chapters`);
  
  // Test 1: Direct chapter lookup
  console.log("\n=== Test 1: Direct Chapter Lookup ===");
  const chapterQuery = "Chapter 1";
  console.log(`Query: "${chapterQuery}"`);
  console.log(searchDatabase(chapterQuery, lawDatabase));
  
  // Test 2: Direct article lookup
  console.log("\n=== Test 2: Direct Article Lookup ===");
  const articleQuery = "Article 5";
  console.log(`Query: "${articleQuery}"`);
  console.log(searchDatabase(articleQuery, lawDatabase));
  
  // Test 3: Keyword search
  console.log("\n=== Test 3: Keyword Search ===");
  const keywordQuery = "insurance contract";
  console.log(`Query: "${keywordQuery}"`);
  console.log(searchDatabase(keywordQuery, lawDatabase));
  
  // Test 4: Tag search
  console.log("\n=== Test 4: Tag Search ===");
  const tagResults = searchByTag("penalties", lawDatabase);
  console.log(`Found ${tagResults.length} articles with tag "penalties"`);
  if (tagResults.length > 0) {
    console.log(`First result: Article ${tagResults[0].article_number}`);
  }
  
  // Test 5: Get article by ID
  console.log("\n=== Test 5: Get Article by ID ===");
  // Get the first article ID from the database
  let sampleArticleId = null;
  for (const chapter of lawDatabase.chapters) {
    if (chapter.articles && chapter.articles.length > 0) {
      sampleArticleId = chapter.articles[0].id;
      break;
    }
    
    if (chapter.sections) {
      for (const section of chapter.sections) {
        if (section.articles && section.articles.length > 0) {
          sampleArticleId = section.articles[0].id;
          break;
        }
      }
      if (sampleArticleId) break;
    }
  }
  
  if (sampleArticleId) {
    console.log(`Looking up article with ID: ${sampleArticleId}`);
    const articleResult = getArticleById(sampleArticleId, lawDatabase);
    if (articleResult) {
      console.log(`Found article ${articleResult.article.article_number} in Chapter ${articleResult.chapter.chapter_title}`);
      if (articleResult.section) {
        console.log(`Section: ${articleResult.section.section_title}`);
      }
    } else {
      console.log("Article not found");
    }
  } else {
    console.log("No sample article ID found to test");
  }
  
  console.log("\nAll tests completed!");
}

// Run the tests
runTests();
