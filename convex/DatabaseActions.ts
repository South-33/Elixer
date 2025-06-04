"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { LawDatabase } from "./chatAI";

/**
 * Function to upload a law database from a JSON file
 * This action can be called from the client to upload a database file
 */
export const uploadLawDatabaseFromFile = action({
  args: {
    filePath: v.string(), // Path to the JSON file
    isEnhanced: v.boolean(), // Whether this is an enhanced database
  },
  handler: async (ctx, args): Promise<{ success: boolean; message: string; id?: string }> => {
    try {
      // This requires the "use node" directive at the top of the file
      const fs = require('fs');
      const path = require('path');
      
      // Read the file
      const fileContent = fs.readFileSync(args.filePath, 'utf8');
      const database = JSON.parse(fileContent);
      
      // Extract the filename without extension
      const fileName = path.basename(args.filePath, '.json');
      
      // Determine display name (remove Enhanced_ prefix if present)
      let displayName = fileName;
      if (displayName.startsWith('Enhanced_')) {
        displayName = displayName.substring(9); // Remove 'Enhanced_' prefix
      }
      displayName = displayName.replace(/_/g, ' '); // Replace underscores with spaces
      
      // Upload the database using the mutation API
      const result = await ctx.runMutation(api.Databases.uploadLawDatabase, {
        name: fileName,
        displayName,
        file: database,  // Changed from 'content' to 'file' to match schema
        isEnhanced: args.isEnhanced,
      });
      
      return result;
    } catch (error) {
      console.error("Error uploading law database from file:", error);
      return {
        success: false,
        message: `Failed to upload database from file: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
