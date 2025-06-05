import { mutation } from "./_generated/server";

export const migrateDataToDatabasesTable = mutation({
  handler: async (ctx) => {
    console.log("Starting migration from 'lawDatabases' to 'Databases'...");

    let oldDataTableName = "lawDatabases"; // The exact name of your old table

    // Fetch all documents from the old 'lawDatabases' table.
    // We use `any` for the document type and ctx.db.query(string) because 
    // 'lawDatabases' is no longer in the generated DataModel.
    const oldDocuments: any[] = await ctx.db.query(oldDataTableName as any).collect();

    if (oldDocuments.length === 0) {
      console.log(`No documents found in '${oldDataTableName}'. Migration might be complete or table was empty.`);
      return `No documents found in '${oldDataTableName}'. Migration not needed or already done.`;
    }

    console.log(`Found ${oldDocuments.length} documents in '${oldDataTableName}'.`);

    let migratedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const doc of oldDocuments) {
      try {
        // Prepare the document for insertion into the new 'Databases' table.
        // We exclude _id and _creationTime as Convex will generate new ones.
        const { _id, _creationTime, ...dataToInsert } = doc;
        
        // Ensure all fields from the old document are compatible with the 'Databases' schema.
        // If your schema changed beyond just the table name, you might need to transform fields here.
        await ctx.db.insert("Databases", dataToInsert);
        migratedCount++;
      } catch (e: any) {
        console.error(`Failed to migrate document with old ID ${doc._id}: ${e.message}`, e);
        errors.push(`Failed for old ID ${doc._id}: ${e.message}`);
        errorCount++;
      }
    }

    const summary = `Migration from '${oldDataTableName}' to 'Databases' summary: Migrated ${migratedCount} documents. Failed: ${errorCount} documents.`;
    console.log(summary);
    if (errorCount > 0) {
      console.error("Errors encountered:", errors.join("\n"));
      return `${summary} Errors: ${errors.join("; ")}`;
    }

    return summary;
  },
});

// IMPORTANT:
// 1. Run this mutation only ONCE from the Convex dashboard.
// 2. After successful migration and verification, you can consider removing the old 'lawDatabases' table.
//    You can do this by removing its definition from schema.ts (which we've already done by renaming it)
//    and then Convex may clean it up, or you might need to delete it via the dashboard.
//    There isn't a direct 'deleteTable' mutation for safety.
