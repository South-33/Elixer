import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { LawDatabase } from "./chatAI";
import { api } from "./_generated/api";
import { StorageId } from "convex/server";

/**
 * Function to link an existing file in Convex storage to a law database entry
 * This is used when you've already uploaded files via the dashboard
 */
export const linkStorageFileToDatabase = mutation({
  args: {
    name: v.string(), // Database name (e.g., "Enhanced_Law_on_Insurance")
    displayName: v.string(), // Human-readable name (e.g., "Law on Insurance")
    fileId: v.string(), // The Convex Storage file ID as a string
    isEnhanced: v.boolean(), // Whether this is an enhanced database
  },
  handler: async (ctx, args): Promise<{ success: boolean; message: string; id?: string }> => {
    try {
      // Check if a database with this name already exists
      const existingDb = await ctx.db
        .query("Databases")
        .withIndex("by_name", q => q.eq("name", args.name))
        .first();

      if (existingDb) {
        // Update the existing database
        await ctx.db.patch(existingDb._id, {
          displayName: args.displayName,
          fileId: args.fileId,
          isEnhanced: args.isEnhanced,
          lastUpdated: Date.now(),
        });
        return {
          success: true,
          message: `Updated existing database: ${args.name}`,
          id: existingDb._id,
        };
      } else {
        // Create a new database entry
        const id = await ctx.db.insert("Databases", {
          name: args.name,
          displayName: args.displayName,
          fileId: args.fileId,
          isEnhanced: args.isEnhanced,
          lastUpdated: Date.now(),
        });
        return {
          success: true,
          message: `Created new database: ${args.name}`,
          id,
        };
      }
    } catch (error) {
      console.error("Error linking law database:", error);
      return {
        success: false,
        message: `Failed to link database: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Function to upload a law database to Convex with file storage
 * This should be used to upload both original and enhanced databases
 */
export const uploadLawDatabase = mutation({
  args: {
    name: v.string(), // Database name (e.g., "Enhanced_Law_on_Insurance")
    displayName: v.string(), // Human-readable name (e.g., "Law on Insurance")
    file: v.any(), // The file to upload
    isEnhanced: v.boolean(), // Whether this is an enhanced database
  },
  handler: async (ctx, args): Promise<{ success: boolean; message: string; id?: string }> => {
    try {
      // For file upload, we'd need to use a different approach with file objects
      // This function would be called from the client with a File object
      const fileId = args.file as StorageId;
      
      // Check if a database with this name already exists
      const existingDb = await ctx.db
        .query("Databases")
        .withIndex("by_name", q => q.eq("name", args.name))
        .first();

      if (existingDb) {
        // Update the existing database
        await ctx.db.patch(existingDb._id, {
          displayName: args.displayName,
          fileId: fileId,
          isEnhanced: args.isEnhanced,
          lastUpdated: Date.now(),
        });
        return {
          success: true,
          message: `Updated existing database: ${args.name}`,
          id: existingDb._id,
        };
      } else {
        // Create a new database entry
        const id = await ctx.db.insert("Databases", {
          name: args.name,
          displayName: args.displayName,
          fileId: fileId,
          isEnhanced: args.isEnhanced,
          lastUpdated: Date.now(),
        });
        return {
          success: true,
          message: `Created new database: ${args.name}`,
          id,
        };
      }
    } catch (error) {
      console.error("Error uploading law database:", error);
      return {
        success: false,
        message: `Failed to upload database: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Function to get a law database content by name
 * This function retrieves the database content from file storage and implements caching
 */
export const getLawDatabaseContentByName = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; database?: { id: string; name: string; displayName: string; content: any; isEnhanced: boolean; lastUpdated: number }; message?: string }> => {
    try {
      // Find the database entry
      const db = await ctx.db
        .query("Databases")
        .withIndex("by_name", q => q.eq("name", args.name))
        .first();
      
      if (!db) {
        return {
          success: false,
          message: `Database not found: ${args.name}`,
        };
      }

      // Check if we have cached content
      if (db.cachedContent) {
        return {
          success: true,
          database: {
            id: db._id,
            name: db.name,
            displayName: db.displayName,
            content: db.cachedContent,
            isEnhanced: db.isEnhanced,
            lastUpdated: db.lastUpdated,
          },
        };
      }

      // No cached content, retrieve from storage
      // In a query, we can't fetch external data, so we return a message
      // The client will need to call the fetchAndCacheDatabaseContent action

      // Return a placeholder message since we can't fetch in a query
      return {
        success: false,
        message: `Database content is being loaded. Please try again in a moment.`,
      };
    } catch (error) {
      console.error("Error retrieving law database:", error);
      return {
        success: false,
        message: `Failed to retrieve database: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Action to fetch and cache database content from file storage
 * This is needed because queries can't fetch external URLs
 */
export const fetchAndCacheDatabaseContent = action({
  args: {
    databaseId: v.id("Databases"),
    name: v.string(),
    fileId: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message?: string }> => {
    try {
      // Get the URL for the file
      const url = await ctx.storage.getUrl(args.fileId as StorageId);
      if (!url) {
        return {
          success: false,
          message: `File not found for database: ${args.name}`,
        };
      }

      // Fetch the file content
      const response = await fetch(url);
      if (!response.ok) {
        return {
          success: false,
          message: `Failed to fetch database file: ${response.statusText}`,
        };
      }

      // Parse the JSON content
      const content = await response.json();

      // Update the cache
      await ctx.runMutation(api.Databases.updateDatabaseCache, {
        databaseId: args.databaseId,
        content,
      });

      return {
        success: true,
        message: `Successfully cached database content for ${args.name}`,
      };
    } catch (error) {
      console.error("Error fetching database content:", error);
      return {
        success: false,
        message: `Failed to fetch database content: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Mutation to update the database cache
 */
export const updateDatabaseCache = mutation({
  args: {
    databaseId: v.id("Databases"),
    content: v.any(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    await ctx.db.patch(args.databaseId, {
      cachedContent: args.content,
    });
    return { success: true };
  },
});

/**
 * Function to get a law database by name (metadata only, no content)
 */
export const getLawDatabaseByName = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args): Promise<Array<{ id: string; name: string; displayName: string; fileId: string; isEnhanced: boolean; lastUpdated: number }>> => {
    const databases = await ctx.db
      .query("Databases")
      .withIndex("by_name", q => q.eq("name", args.name))
      .collect();
      
    return databases.map(db => ({
      id: db._id,
      name: db.name,
      displayName: db.displayName,
      fileId: db.fileId,
      isEnhanced: db.isEnhanced,
      lastUpdated: db.lastUpdated,
    }));
  },
});

/**
 * Function to get all law databases
 */
export const getAllDatabases = query({
  args: {},
  handler: async (ctx): Promise<Array<{ id: string; name: string; displayName: string; isEnhanced: boolean; lastUpdated: string }>> => {
    const databases = await ctx.db.query("Databases").collect();
    
    return databases.map(db => ({
      id: db._id,
      name: db.name,
      displayName: db.displayName,
      isEnhanced: db.isEnhanced,
      lastUpdated: new Date(db.lastUpdated).toISOString(),
    }));
  },
});

/**
 * Function to get a list of all available law databases
 */
export const listDatabases = query({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; message?: string; databases: Array<{ id: string; name: string; displayName: string; isEnhanced: boolean; lastUpdated: string }> }> => {
    try {
      // Get databases directly from the database instead of calling getAllDatabases.handler
      const databases = await ctx.db.query("Databases").collect();
      
      // Format the results
      const formattedDatabases = databases.map(db => ({
        id: db._id,
        name: db.name,
        displayName: db.displayName,
        isEnhanced: db.isEnhanced,
        lastUpdated: new Date(db.lastUpdated).toISOString(),
      }));
      
      return {
        success: true,
        databases: formattedDatabases,
      };
    } catch (error) {
      console.error("Error listing law databases:", error);
      return {
        success: false,
        message: `Failed to list databases: ${error instanceof Error ? error.message : "Unknown error"}`,
        databases: [],
      };
    }
  },
});
