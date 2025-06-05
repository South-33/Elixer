// Script to link existing Convex storage files to law database entries
const { ConvexClient } = require('convex/node');

// File IDs from your Convex storage (from the screenshot)
const FILES = [
  {
    name: "Enhanced_Law_on_Insurance",
    displayName: "Law on Insurance",
    fileId: "kg2a7ntd63s7qer-f07nnjgjrb97gpr8d", // 49.42 KB file
    isEnhanced: true
  },
  {
    name: "Enhanced_Law_on_Consumer_Protection",
    displayName: "Law on Consumer Protection",
    fileId: "kg23nfdr5rz7r9qem5dz6b61717gqeek", // 64.08 KB file
    isEnhanced: true
  },
  {
    name: "Enhanced_Insurance_and_Reinsurance_QnA",
    displayName: "Insurance and Reinsurance QnA",
    fileId: "kg22v67thedyktd5ghd091gjt57gpc9x", // 64.97 KB file
    isEnhanced: true
  }
];

// Main function to link files to database entries
async function linkFilesToDatabases() {
  try {
    // Initialize Convex client
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
      throw new Error('Please set CONVEX_URL environment variable.');
    }
    const client = new ConvexClient(convexUrl);

    // Link each file
    for (const file of FILES) {
      console.log(`Linking file for database: ${file.displayName}`);
      
      // Call the mutation to link the file
      const result = await client.mutation('Databases:linkStorageFileToDatabase', {
        name: file.name,
        displayName: file.displayName,
        fileId: file.fileId,
        isEnhanced: file.isEnhanced,
      });
      
      console.log(`Result: ${JSON.stringify(result)}`);
    }
    
    console.log('All files linked successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error linking files:', error);
    process.exit(1);
  }
}

// Run the link function
linkFilesToDatabases();
