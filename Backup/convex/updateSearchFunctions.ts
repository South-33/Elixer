import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";

import { LawDatabase } from "./chatAI";

// Helper function to load the enhanced law database from Convex database
async function loadEnhancedLawDatabaseHelper(ctx: any, databaseName: string): Promise<LawDatabase> {
  try {
    // Format the database name for lookup
    const normalizedDbName = databaseName.replace(/\.json$/, "").replace(/ /g, "_");
    
    // Try to get the database from Convex
    const dbDoc = await ctx.db
      .query("lawDatabases")
      .withIndex("by_name", (q: any) => q.eq("name", normalizedDbName))
      .first();
    
    if (!dbDoc) {
      throw new Error(`Database not found: ${databaseName}`);
    }
    
    return dbDoc.content as LawDatabase;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error loading law database from Convex:", errorMessage);
    throw new Error(`Failed to load law database from Convex: ${errorMessage}`);
  }
}

/**
 * Query the enhanced law database with a user query
 * This function returns the full database content instead of searching for specific articles
 */
async function queryEnhancedLawDatabase(query: string, lawDatabase: LawDatabase): Promise<string> {
  try {
    console.log(`[queryEnhancedLawDatabase] Returning full database content for query: "${query}"`);
    
    // Return the full database content as JSON
    const fullDatabaseContext = JSON.stringify(lawDatabase);
    return `\n# Full Database Context\n${fullDatabaseContext}\n`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in queryEnhancedLawDatabase:", errorMessage);
    return `Failed to query enhanced law database: ${errorMessage}`;
  }
}

export const generateEnhancedSearchQuery = query({
  args: {
    query: v.string(),
    databaseName: v.string(),
  },
  handler: async (ctx, args) => {
    const { query, databaseName } = args;
    
    try {
      // Format the enhanced database name
      const enhancedDbName = databaseName.replace(/\.json$/, "").replace(/ /g, "_");
      
      // Try to load the enhanced database
      try {
        const lawDatabase = await loadEnhancedLawDatabaseHelper(ctx, `Enhanced_${enhancedDbName}`);
        
        // Use the enhanced search function
        const results = await queryEnhancedLawDatabase(query, lawDatabase);
        return {
          response: results,
          source: `Enhanced_${enhancedDbName}`,
          enhanced: true
        };
      } catch (enhancedError) {
        console.error("Error using enhanced database:", enhancedError);
        
        try {
          // Fall back to original database
          const originalDatabase = await loadEnhancedLawDatabaseHelper(ctx, enhancedDbName);
          
          // Import the queryLawDatabase function from chatAI
          const { queryLawDatabase } = await import('./chatAI');
          
          // Use the original search function
          const results = await queryLawDatabase(query, originalDatabase);
          return {
            response: results,
            source: databaseName,
            enhanced: false
          };
        } catch (originalError) {
          console.error("Error using original database:", originalError);
          return {
            response: `Could not find database '${databaseName}'. Please upload it using the uploadLawDatabases functions.`,
            source: "none",
            enhanced: false,
            error: true
          };
        }
      }
    } catch (error) {
      console.error("Error in generateEnhancedSearchQuery:", error);
      throw new Error(`Failed to generate search query: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

/**
 * Function to update the application to use the enhanced search functions
 * This should be called when initializing the application
 */
export const initializeEnhancedSearch = mutation({
  args: {},
  handler: async (ctx) => {
    try {
      // Check if enhanced databases are available
      const fs = require('fs');
      const databaseDir = 'Database';
      const files = fs.readdirSync(databaseDir);
      const enhancedDatabases = files.filter((file: string) => file.startsWith('Enhanced_') && file.endsWith('.json'));
      
      if (enhancedDatabases.length > 0) {
        console.log(`Found ${enhancedDatabases.length} enhanced databases. Search functions updated.`);
        
        // Create a mapping of original database names to enhanced database names
        const databaseMap: Record<string, string> = {};
        for (const enhancedDb of enhancedDatabases) {
          let originalName = enhancedDb.replace('Enhanced_', '').replace(/_/g, ' ');
          if (!originalName.endsWith('.json')) {
            originalName += '.json';
          }
          databaseMap[originalName] = enhancedDb;
        }
        
        // Store the database mapping for future reference
        return {
          success: true,
          message: `Enhanced search initialized with ${enhancedDatabases.length} databases`,
          databaseMap
        };
      } else {
        console.log("No enhanced databases found. Using original search functions.");
        return {
          success: false,
          message: "No enhanced databases found",
          databaseMap: {}
        };
      }
    } catch (error) {
      console.error("Error initializing enhanced search:", error);
      return {
        success: false,
        message: `Error initializing enhanced search: ${error instanceof Error ? error.message : String(error)}`,
        databaseMap: {}
      };
    }
  },
});

/**
 * Function to get information about available databases
 */
export const getDatabaseInfo = query({
  args: {},
  handler: async (ctx) => {
    try {
      const fs = require('fs');
      const databaseDir = 'Database';
      const files = fs.readdirSync(databaseDir);
      
      const databases = files.filter((file: string) => file.endsWith('.json'));
      const enhancedDatabases = databases.filter((file: string) => file.startsWith('Enhanced_'));
      const regularDatabases = databases.filter((file: string) => !file.startsWith('Enhanced_'));
      
      // Create a mapping of database names to their enhanced status
      const databaseInfo: Record<string, any> = {};
      
      for (const db of regularDatabases) {
        const enhancedVersion = `Enhanced_${db.replace(/\.json$/, "").replace(/ /g, "_")}.json`;
        const hasEnhanced = enhancedDatabases.includes(enhancedVersion);
        
        databaseInfo[db] = {
          name: db,
          hasEnhanced,
          enhancedName: hasEnhanced ? enhancedVersion : null
        };
      }
      
      return {
        total: databases.length,
        regular: regularDatabases.length,
        enhanced: enhancedDatabases.length,
        databases: databaseInfo
      };
    } catch (error) {
      console.error("Error getting database info:", error);
      return {
        error: `Failed to get database info: ${error instanceof Error ? error.message : String(error)}`,
        total: 0,
        regular: 0,
        enhanced: 0,
        databases: {}
      };
    }
  },
});
