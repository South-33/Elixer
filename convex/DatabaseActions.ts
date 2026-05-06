"use node";

import { readFileSync } from "fs";
import { basename } from "path";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Function to upload a law database from a JSON file
 * This action can be called from the client to upload a database file
 */
export const uploadLawDatabaseFromFile = action({
  args: {
    filePath: v.string(), // Path to the JSON file
    isEnhanced: v.boolean(), // Whether this is an enhanced database
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; message: string; id?: string }> => {
    try {
      const fileContent = readFileSync(args.filePath, "utf8");
      const database = JSON.parse(fileContent);

      const fileName = basename(args.filePath, ".json");

      let displayName = fileName;
      if (displayName.startsWith("Enhanced_")) {
        displayName = displayName.substring(9);
      }
      displayName = displayName.replace(/_/g, " ");

      const result = await ctx.runMutation(api.Databases.uploadLawDatabase, {
        name: fileName,
        displayName,
        file: database,
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
