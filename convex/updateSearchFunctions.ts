import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { queryEnhancedLawDatabase } from "./enhancedSearch";

// Helper function to load the enhanced law database
async function loadEnhancedLawDatabaseHelper(databaseName: string): Promise<any> {
  try {
    // Construct the file path
    const filePath = `Database/Enhanced_${databaseName}.json`;
    
    // Read the file using Node.js fs module
    const fs = require('fs');
    const data = fs.readFileSync(filePath, 'utf8');
    
    // Parse the JSON data
    const lawDatabase = JSON.parse(data);
    
    return lawDatabase;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error loading enhanced law database:", errorMessage);
    throw new Error(`Failed to load enhanced law database: ${errorMessage}`);
  }
}

/**
 * Update the main application's search function to use the enhanced databases
 * This function modifies the existing generateSearchQuery function to use the enhanced search
 */
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
        const lawDatabase = await loadEnhancedLawDatabaseHelper(`Enhanced_${enhancedDbName}`);
        
        // Use the enhanced search function
        const results = await queryEnhancedLawDatabase(query, lawDatabase);
        return {
          response: results,
          source: `Enhanced_${enhancedDbName}.json`,
          enhanced: true
        };
      } catch (enhancedError) {
        console.error("Error using enhanced database:", enhancedError);
        
        // Fall back to original database and search function
        const { queryLawDatabase } = require('./chatAI');
        const fs = require('fs');
        const filePath = `Database/${databaseName}`;
        const data = fs.readFileSync(filePath, 'utf8');
        const originalDatabase = JSON.parse(data);
        
        const results = await queryLawDatabase(query, originalDatabase);
        return {
          response: results,
          source: databaseName,
          enhanced: false
        };
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
        
        return {
          success: true,
          message: `Updated search functions to use ${enhancedDatabases.length} enhanced databases.`,
          databases: enhancedDatabases,
          databaseMap
        };
      } else {
        console.log("No enhanced databases found. Using original search functions.");
        return {
          success: false,
          message: "No enhanced databases found. Using original search functions.",
          databases: [],
          databaseMap: {}
        };
      }
    } catch (error) {
      console.error("Error initializing enhanced search:", error);
      return {
        success: false,
        message: `Error initializing enhanced search: ${error instanceof Error ? error.message : String(error)}`,
        databases: [],
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
      
      // Get all JSON files
      const jsonFiles = files.filter((file: string) => file.endsWith('.json'));
      
      // Separate enhanced and original databases
      const enhancedDatabases = jsonFiles.filter((file: string) => file.startsWith('Enhanced_'));
      const originalDatabases = jsonFiles.filter((file: string) => !file.startsWith('Enhanced_'));
      
      // Get file sizes
      const databaseSizes: Record<string, number> = {};
      for (const file of jsonFiles) {
        const stats = fs.statSync(`${databaseDir}/${file}`);
        databaseSizes[file] = stats.size;
      }
      
      return {
        enhanced: enhancedDatabases,
        original: originalDatabases,
        all: jsonFiles,
        sizes: databaseSizes,
        enhancedAvailable: enhancedDatabases.length > 0
      };
    } catch (error) {
      console.error("Error getting database info:", error);
      return {
        enhanced: [],
        original: [],
        all: [],
        sizes: {},
        enhancedAvailable: false
      };
    }
  },
});
