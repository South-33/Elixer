import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

// Database loading and querying logic is now fully self-contained and does not rely on integrateDatabases.ts or enhancedSearch.ts.

export const sendMessage = mutation({
  args: {
    content: v.string(),
    lawPrompt: v.optional(v.string()),
    tonePrompt: v.optional(v.string()),
    policyPrompt: v.optional(v.string()),
    selectedModel: v.optional(v.string()),
    paneId: v.string(), // Add paneId here
    disableSystemPrompt: v.optional(v.boolean()), // New argument
    disableTools: v.optional(v.boolean()), // Add disableTools parameter
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Store user message
    await ctx.db.insert("messages", {
      role: "user",
      content: args.content,
      userId,
      paneId: args.paneId, // Store paneId
    });

    // Get AI response via action
    await ctx.scheduler.runAfter(0, api.chatAI.getAIResponse, {
      userMessage: args.content,
      userId,
      lawPrompt: args.lawPrompt || "",
      tonePrompt: args.tonePrompt || "",
      policyPrompt: args.policyPrompt || "",
      selectedModel: args.selectedModel,
      paneId: args.paneId, // Pass paneId to the action
      disableSystemPrompt: args.disableSystemPrompt, // Pass new argument
      disableTools: args.disableTools, // Pass disableTools parameter
    });
  },
});

export const getMessages = query({
  args: { userId: v.id("users"), paneId: v.string() }, // Add paneId argument
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", q => q.eq("userId", args.userId).eq("paneId", args.paneId)) // Filter by userId and paneId
      .order("desc")
      .collect();

    return messages.reverse();
  },
});

export const storeAIResponse = mutation({
  args: {
    content: v.string(),
    userId: v.id("users"),
    paneId: v.string(), // Add paneId here
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      role: "assistant",
      content: args.content,
      userId: args.userId,
      paneId: args.paneId, // Store paneId
    });
  },
});

export const saveSystemPrompt = mutation({
  args: {
    lawPrompt: v.optional(v.string()),
    tonePrompt: v.optional(v.string()),
    policyPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Find existing settings
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    const updateData: {
      lawPrompt?: string;
      tonePrompt?: string;
      policyPrompt?: string;
    } = {};

    if (args.lawPrompt !== undefined) updateData.lawPrompt = args.lawPrompt;
    if (args.tonePrompt !== undefined) updateData.tonePrompt = args.tonePrompt;
    if (args.policyPrompt !== undefined) updateData.policyPrompt = args.policyPrompt;


    if (existing) {
      await ctx.db.patch(existing._id, updateData);
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        ...updateData,
      });
    }
  },
});

export const getSystemPrompts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { lawPrompt: "", tonePrompt: "", policyPrompt: "" };

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    return {
      lawPrompt: settings?.lawPrompt || "",
      tonePrompt: settings?.tonePrompt || "",
      policyPrompt: settings?.policyPrompt || "",
    };
  },
});

export const deleteUserSettings = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", q => q.eq("userId", userId))
      .first();

    if (settings) {
      await ctx.db.delete(settings._id);
    }
  },
});

export const createMessage = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    content: v.string(),
    isStreaming: v.boolean(),
    paneId: v.string(), // Add paneId here
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      userId: args.userId,
      role: args.role,
      content: args.content,
      isStreaming: args.isStreaming,
      paneId: args.paneId, // Store paneId
    });
  },
});

export const clearChat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Delete all messages for the authenticated user
    const messagesToDelete = await ctx.db
      .query("messages")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    await Promise.all(messagesToDelete.map(msg => ctx.db.delete(msg._id)));
  },
});

export const clearPaneMessages = mutation({
  args: { paneId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Delete all messages for the authenticated user and specific paneId
    const BATCH_SIZE = 100; // Define a batch size for deletion

    let messagesDeleted = 0;
    while (true) {
      const messagesToDelete = await ctx.db
        .query("messages")
        .withIndex("by_user", q => q.eq("userId", userId).eq("paneId", args.paneId))
        .take(BATCH_SIZE); // Take only a batch of messages

      if (messagesToDelete.length === 0) {
        break; // No more messages to delete
      }

      await Promise.all(messagesToDelete.map(msg => ctx.db.delete(msg._id)));
      messagesDeleted += messagesToDelete.length;
    }
    console.log(`Deleted ${messagesDeleted} messages for pane ${args.paneId}`);
  },
});


export const appendMessageContent = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    await ctx.db.patch(args.messageId, {
      content: message.content + args.content,
    });
  },
});

export const updateMessageStreamingStatus = mutation({
  args: {
    messageId: v.id("messages"),
    isStreaming: v.boolean(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    await ctx.db.patch(args.messageId, {
      isStreaming: args.isStreaming,
    });
  },
});

export const getMessage = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

export const getLawDatabaseContent = query({
  args: {
    databaseNames: v.optional(v.array(v.string())), // New argument to specify which databases to retrieve
  },
  handler: async (ctx, args) => {
    const result: { [key: string]: any } = {}; // Object to hold selected database content

    try {
      // Get the database names from the arguments or use defaults
      const databaseNames = args.databaseNames || ["Law on Insurance", "Law on Consumer Protection", "Insurance and Reinsurance QnA"];
      
      // For each requested database, try to retrieve it from Convex database
      for (const dbName of databaseNames) {
        try {
          // First, try to find the database by display name
          const dbByDisplayName = await ctx.db
            .query("lawDatabases")
            .filter(q => q.eq(q.field("displayName"), dbName))
            .first();
          
          if (dbByDisplayName) {
            // Found database by display name
            // Check if we have cached content
            if (dbByDisplayName.cachedContent) {
              // Check if the content is empty (just an empty object)
              const isEmptyContent = 
                typeof dbByDisplayName.cachedContent === 'object' && 
                Object.keys(dbByDisplayName.cachedContent).length === 0;
              
              if (isEmptyContent) {
                console.log(`Database found but content is empty: ${dbName}. Attempting to load from file storage...`);
                
                // Try to load content from file storage if file ID exists
                if (dbByDisplayName.fileId) {
                  try {
                    // Get the file from storage
                    const storageId = dbByDisplayName.fileId;
                    // Use the getUrl method instead of get
                    const fileUrl = await ctx.storage.getUrl(storageId);
                    
                    if (fileUrl) {
                      // Fetch the file content from the URL
                      try {
                        const response = await fetch(fileUrl);
                        const contentText = await response.text();
                        const parsedContent = JSON.parse(contentText);
                        
                        // Use mutation to update the database - we can't directly update in a query
                        // Instead, just return the parsed content
                        console.log(`Loaded content from file storage for: ${dbName}`);
                        result[dbName] = parsedContent;
                        console.log(`Successfully loaded content from file storage for: ${dbName}`);
                        continue;
                      } catch (parseError) {
                        console.error(`Error parsing file content for ${dbName}:`, parseError);
                      }
                    }
                  } catch (fileError) {
                    console.error(`Error loading file from storage for ${dbName}:`, fileError);
                  }
                }
                
                // If we get here, we couldn't load from file storage
                result[dbName] = { 
                  error: `Database found but content is empty. Please upload content for: ${dbName}`,
                  message: "The database exists but has no content. Please upload or refresh the database content."
                };
                continue;
              }
              
              result[dbName] = dbByDisplayName.cachedContent;
              console.log(`Successfully loaded database by display name from cache: ${dbName}`);
              continue;
            } else {
              // No cached content available
              result[dbName] = { 
                error: `Database content is being loaded. Please try again in a moment: ${dbName}`,
              };
              console.log(`Database found but content not cached yet: ${dbName}`);
              continue;
            }
          }
          
          // If not found by display name, try normalized name format
          const normalizedDbName = dbName.replace(/\.json$/, "").replace(/ /g, "_");
          
          // Try to get the database by normalized name
          const dbDoc = await ctx.db
            .query("lawDatabases")
            .withIndex("by_name", q => q.eq("name", normalizedDbName))
            .first();
          
          if (dbDoc && dbDoc.cachedContent) {
            // Database exists in Convex database and has cached content
            result[dbName] = dbDoc.cachedContent;
            console.log(`Successfully loaded database from cache by normalized name: ${normalizedDbName}`);
          } else if (dbDoc) {
            // Database exists but no cached content
            result[dbName] = { 
              error: `Database content is being loaded. Please try again in a moment: ${dbName}`,
            };
            console.log(`Database found by normalized name but content not cached yet: ${normalizedDbName}`);
          } else {
            // No database found in Convex database
            result[dbName] = { 
              error: `Database not found in Convex database: ${dbName}`,
              message: "Please upload the database using the uploadLawDatabases functions",
              // Include example data structure for development
              exampleStructure: {
                metadata: { title: "Example Database Structure" },
                preamble: ["This is an example preamble"],
                chapters: [
                  {
                    chapter_number: "1",
                    chapter_title: "Example Chapter",
                    articles: [
                      {
                        article_number: "1",
                        content: "This is an example article content."
                      }
                    ]
                  }
                ]
              }
            };
            console.log(`Database not found in Convex database: ${dbName}`);
          }
        } catch (error) {
          console.error(`Error processing database ${dbName}:`, error);
          result[dbName] = { 
            error: `Failed to process database: ${error instanceof Error ? error.message : "Unknown error"}` 
          };
        }
      }
      
      return JSON.stringify(result);
    } catch (error) {
      console.error("Error in getLawDatabaseContent:", error);
      return JSON.stringify({ 
        error: `Failed to get law database content: ${error instanceof Error ? error.message : "Unknown error"}` 
      });
    }
  },
});
