// scripts/uploadLawDatabases.cjs
const fs = require('fs');
const path = require('path');
const { ConvexClient } = require('convex/node'); // Use the Node client

// Path to your database files
const DATABASE_DIR = path.join(__dirname, '../Database');

// Function to upload a single database file
async function uploadDatabase(client, filePath, isEnhanced) {
  try {
    console.log(`Reading file: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const database = JSON.parse(fileContent);

    // Extract the filename without extension
    const fileName = path.basename(filePath, '.json');

    // Determine display name (remove Enhanced_ prefix if present)
    let displayName = fileName;
    if (displayName.startsWith('Enhanced_')) {
      displayName = displayName.substring(9); // Remove 'Enhanced_' prefix
    }
    displayName = displayName.replace(/_/g, ' '); // Replace underscores with spaces

    console.log(`Uploading database: ${displayName} (${fileName})`);

    // Upload the database (call your Convex mutation)
    const result = await client.mutation('lawDatabases:uploadLawDatabase', {
      name: fileName,
      displayName,
      content: database,
      isEnhanced: isEnhanced,
    });

    console.log(`Upload result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    console.error(`Error uploading database ${filePath}:`, error);
    return {
      success: false,
      message: `Failed to upload database: ${error.message}`,
    };
  }
}

// Main function to upload all databases
async function uploadAllDatabases() {
  try {
    // Initialize Convex client
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
      throw new Error('Please set CONVEX_URL environment variable.');
    }
    const client = new ConvexClient(convexUrl);

    // Get all files in the database directory
    const files = fs.readdirSync(DATABASE_DIR);

    // Upload each file
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(DATABASE_DIR, file);
        const isEnhanced = file.startsWith('Enhanced_');

        await uploadDatabase(client, filePath, isEnhanced);
      }
    }

    console.log('All databases uploaded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error uploading databases:', error);
    process.exit(1);
  }
}

// Run the upload function
uploadAllDatabases();