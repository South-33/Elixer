/**
 * Script to update the application to use enhanced databases
 * Run this script to automatically update the application configuration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DATABASE_DIR = path.join(__dirname, '..', 'Database');
const CONFIG_FILE = path.join(__dirname, '..', 'config', 'database_config.json');

// Create config directory if it doesn't exist
if (!fs.existsSync(path.join(__dirname, '..', 'config'))) {
  fs.mkdirSync(path.join(__dirname, '..', 'config'));
}

// Main function to update the application
async function updateAppToUseEnhancedDatabases() {
  console.log('Updating application to use enhanced databases...');
  
  try {
    // Check if enhanced databases are available
    const files = fs.readdirSync(DATABASE_DIR);
    const enhancedDatabases = files.filter(file => file.startsWith('Enhanced_') && file.endsWith('.json'));
    
    if (enhancedDatabases.length === 0) {
      console.log('No enhanced databases found. Please run the enhancement scripts first.');
      return;
    }
    
    console.log(`Found ${enhancedDatabases.length} enhanced databases:`);
    enhancedDatabases.forEach(db => console.log(`- ${db}`));
    
    // Create mapping between original and enhanced databases
    const databaseMap = {};
    for (const enhancedDb of enhancedDatabases) {
      // Handle different naming patterns
      if (enhancedDb === 'Enhanced_Law_on_Insurance.json') {
        databaseMap['Law on Insurance.json'] = enhancedDb;
      } else if (enhancedDb === 'Enhanced_Law_on_Consumer_Protection.json') {
        databaseMap['Law on Consumer Protection.json'] = enhancedDb;
      } else if (enhancedDb === 'Enhanced_Insurance_QnA.json') {
        databaseMap['Insurance and reinsurance in Cambodia(QnA format).json'] = enhancedDb;
      } else {
        // Generic mapping for other databases
        const originalName = enhancedDb.replace('Enhanced_', '').replace(/_/g, ' ');
        databaseMap[originalName] = enhancedDb;
      }
    }
    
    // Create configuration
    const config = {
      useEnhancedDatabases: true,
      databaseMap,
      enhancedDatabases,
      lastUpdated: new Date().toISOString(),
      version: '2.0'
    };
    
    // Save configuration
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`Configuration saved to ${CONFIG_FILE}`);
    
    // Update import in main app file if it exists
    const mainAppFile = path.join(__dirname, '..', 'src', 'app.js');
    if (fs.existsSync(mainAppFile)) {
      let appContent = fs.readFileSync(mainAppFile, 'utf8');
      
      // Check if enhanced search is already imported
      if (!appContent.includes('import { generateEnhancedSearchQuery }')) {
        // Add import for enhanced search
        appContent = appContent.replace(
          /import {.*} from ['"]\.\/convex\/chatAI['"];/,
          `$&\nimport { generateEnhancedSearchQuery, initializeEnhancedSearch } from './convex/updateSearchFunctions';`
        );
        
        // Add initialization code
        appContent = appContent.replace(
          /\/\/ Initialize app/,
          `// Initialize app\ninitializeEnhancedSearch();\n`
        );
        
        fs.writeFileSync(mainAppFile, appContent);
        console.log(`Updated main app file: ${mainAppFile}`);
      } else {
        console.log('Main app file already updated.');
      }
    }
    
    console.log('Application successfully updated to use enhanced databases!');
    console.log('');
    console.log('NEXT STEPS:');
    console.log('1. Import the enhanced search functions in your application:');
    console.log('   import { generateEnhancedSearchQuery } from "./convex/updateSearchFunctions";');
    console.log('');
    console.log('2. Replace calls to the original search function with the enhanced version:');
    console.log('   // Old: const results = await queryLawDatabase(query, database);');
    console.log('   // New: const results = await generateEnhancedSearchQuery({ query, databaseName });');
    console.log('');
    console.log('3. Initialize the enhanced search when your app starts:');
    console.log('   import { initializeEnhancedSearch } from "./convex/updateSearchFunctions";');
    console.log('   // Call during app initialization');
    console.log('   initializeEnhancedSearch();');
    
  } catch (error) {
    console.error('Error updating application:', error);
  }
}

// Run the update function
updateAppToUseEnhancedDatabases();
