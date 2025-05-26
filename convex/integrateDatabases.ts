import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { queryEnhancedLawDatabase } from "./enhancedSearch";

// Helper function to load the enhanced law database
async function loadEnhancedLawDatabaseHelper(databaseName: string): Promise<any> {
  try {
    // For Convex, we need to use a different approach than direct filesystem access
    // This is a simplified version that returns hardcoded data for demonstration
    // In a real implementation, you would store these in Convex storage or a database
    
    // This is a temporary solution - in production, you should upload these to Convex storage
    // and use ctx.storage.get() to retrieve them
    
    // For now, we'll return a mock response to demonstrate the concept
    console.log(`Loading enhanced database: ${databaseName}`);
    
    // Mock response structure that matches your enhanced database format
    const mockEnhancedDatabase = {
      metadata: {
        version: "1.0",
        last_updated: new Date().toISOString(),
        enhanced: true
      },
      chapters: [
        {
          id: "chap_3",
          chapter_number: "3",
          chapter_title: "INSURANCE CONTRACT",
          search_terms: ["insurance contract"],
          sections: [
            {
              id: "chap_3_sec_I",
              section_number: "I",
              section_title: "GENERAL FORMS",
              search_terms: ["general forms"],
              articles: [
                {
                  id: "chap_3_sec_I_art_7",
                  article_number: "7",
                  content: "An Insurance, whether life or general insurance, which is beneficial to natural or legal person who is insured against any risks, shall be made only with insurance company having license to operate [the insurance business] in the Kingdom of Cambodia.",
                  fullText: "Article 7: An Insurance, whether life or general insurance, which is beneficial to natural or legal person who is insured against any risks, shall be made only with insurance company having license to operate [the insurance business] in the Kingdom of Cambodia.",
                  chapter_ref: "chap_3",
                  section_ref: "chap_3_sec_I",
                  chapter_title: "INSURANCE CONTRACT",
                  section_title: "GENERAL FORMS",
                  keywords: ["insurance", "license", "company", "risks", "kingdom", "cambodia"],
                  tags: ["insurance contract", "general forms"],
                  relatedArticles: ["chap_I_art_1", "chap_I_art_2"]
                }
              ]
            }
          ]
        }
      ]
    };
    
    return mockEnhancedDatabase;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error loading enhanced law database:", errorMessage);
    throw new Error(`Failed to load enhanced law database: ${errorMessage}`);
  }
}

/**
 * Integration function to use enhanced databases in the existing application
 * This function serves as a bridge between the old and new database formats
 */
export const queryWithEnhancedDatabase = query({
  args: {
    query: v.string(),
    databaseName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { query, databaseName } = args;
      
      // Load the enhanced database
      const enhancedDbName = databaseName.replace(/\.json$/, "").replace(/ /g, "_");
      const lawDatabase = await loadEnhancedLawDatabaseHelper(`Enhanced_${enhancedDbName}`);
      
      // Use the enhanced search function
      const results = await queryEnhancedLawDatabase(query, lawDatabase);
      
      return results;
    } catch (error: unknown) {
      // If enhanced database fails, fall back to original database
      console.error("Error using enhanced database:", error instanceof Error ? error.message : String(error));
      console.log("Falling back to original database...");
      
      try {
        // Load the original database
        const fs = require('fs');
        const filePath = `Database/${args.databaseName}`;
        const data = fs.readFileSync(filePath, 'utf8');
        const originalDatabase = JSON.parse(data);
        
        // Use the original query function (imported from chatAI.ts)
        const { queryLawDatabase } = require('./chatAI');
        const results = await queryLawDatabase(args.query, originalDatabase);
        
        return results;
      } catch (fallbackError: unknown) {
        const errorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`Failed to query database (both enhanced and original): ${errorMessage}`);
      }
    }
  },
});

/**
 * Function to determine if an enhanced database is available
 */
export const isEnhancedDatabaseAvailable = query({
  args: {
    databaseName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { databaseName } = args;
      // For now, we'll hardcode the available enhanced databases
      // In a real implementation, you would check Convex storage or a database
      const availableEnhancedDatabases = [
        "Law_on_Insurance",
        "Law_on_Consumer_Protection",
        "Insurance_and_reinsurance_in_Cambodia_QnA_format"
      ];
      
      console.log(`Checking if enhanced database is available: ${databaseName}`);
      return availableEnhancedDatabases.includes(databaseName);
    } catch (error) {
      console.error("Error checking enhanced database:", error);
      return false;
    }
  },
});

/**
 * Function to get all available databases (both original and enhanced)
 */
export const getAvailableDatabases = query({
  args: {},
  handler: async (ctx) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const databaseDir = 'Database';
      
      // Get all files in the database directory
      const files = fs.readdirSync(databaseDir);
      
      // Filter out non-JSON files
      const jsonFiles = files.filter((file: string) => file.endsWith('.json'));
      
      // Separate enhanced and original databases
      const enhancedDatabases = jsonFiles.filter((file: string) => file.startsWith('Enhanced_'));
      const originalDatabases = jsonFiles.filter((file: string) => !file.startsWith('Enhanced_'));
      
      return {
        enhanced: enhancedDatabases,
        original: originalDatabases,
        all: jsonFiles
      };
    } catch (error) {
      console.error("Error getting available databases:", error);
      return {
        enhanced: [],
        original: [],
        all: []
      };
    }
  },
});

/**
 * Helper function to update the application to use enhanced databases
 * This should be called when initializing the application
 */
export async function updateAppToUseEnhancedDatabases() {
  try {
    // Check if enhanced databases are available
    const fs = require('fs');
    const databaseDir = 'Database';
    const files = fs.readdirSync(databaseDir);
    const enhancedDatabases = files.filter((file: string) => file.startsWith('Enhanced_') && file.endsWith('.json'));
    
    if (enhancedDatabases.length > 0) {
      console.log(`Found ${enhancedDatabases.length} enhanced databases. Updating application to use them.`);
      
      // Map original database names to enhanced database names
      const databaseMap = enhancedDatabases.reduce((map: Record<string, string>, enhancedDb: string) => {
        const originalName = enhancedDb.replace('Enhanced_', '').replace('_', ' ');
        map[originalName] = enhancedDb;
        return map;
      }, {} as Record<string, string>);
      
      // Store the map for future reference
      (global as any).enhancedDatabaseMap = databaseMap;
      
      return {
        success: true,
        message: `Updated application to use ${enhancedDatabases.length} enhanced databases.`,
        databases: enhancedDatabases
      };
    } else {
      console.log("No enhanced databases found. Using original databases.");
      return {
        success: false,
        message: "No enhanced databases found. Using original databases.",
        databases: []
      };
    }
  } catch (error) {
    console.error("Error updating application to use enhanced databases:", error);
    return {
      success: false,
      message: `Error updating application: ${error instanceof Error ? error.message : String(error)}`,
      databases: []
    };
  }
}
