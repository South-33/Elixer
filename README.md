# Elixir AI Agent

A powerful multi-pane AI chat application with advanced system prompts and tool usage capabilities.

## Features

- **Multi-Pane Chat**: Compare responses from different AI configurations side-by-side (up to 4 panes)
- **Customizable System Prompts**: Configure law, tone, and policy prompts to guide AI behavior
- **Agent Mode**: Enable/disable tool usage (web search, database queries, etc.)
- **Model Selection**: Choose from various Gemini models (2.5 Flash, 2.5 Flash Lite, 2.0 Flash)
- **Real-time Streaming**: Watch AI responses stream in real-time with processing phase indicators
- **Search Sources**: View and explore web sources used by the AI for each response

## Usage

### Basic Chat
1. Type your message in the input field at the bottom
2. Press "Send" or hit Enter to send to all active panes
3. Watch responses stream in from the AI with processing indicators

### Message Input Controls

**Clear/Cancel Button (✕)**
- **Location**: Appears next to the Send button when:
  - You have text in the input field, OR
  - The AI is currently streaming a response
- **Purpose**: Immediately clear the input and reset all streaming states across all panes
- **Visual Indicator**: 
  - Orange color when streaming is active (showing it's actively canceling)
  - Gray color when just clearing text
- **When to Use**:
  - **Error Recovery**: When a message send fails or crashes (e.g., "Failed to parse stream" errors)
  - **Stuck State**: When the UI is stuck showing "Sending..." indefinitely
  - **Cancel Request**: When you want to cancel an in-progress AI response
  - **Quick Reset**: To quickly clear everything and start fresh
- **How it Works**: 
  - Clears the input field immediately
  - Resets all pane streaming states
  - Resets the global streaming status
  - Allows you to send a new message right away
- **Always Available**: This button works even when other controls are disabled, making it your emergency "reset" button

**Send Button**
- Sends your message to all active chat panes
- Disabled during streaming to prevent conflicts
- Shows "Sending..." when processing

### Pane-Specific Controls
Each chat pane has its own toolbar with:
- **System [On/Off]**: Toggle system prompts for this pane
- **AGENT [ON/OFF]**: Enable/disable tool usage (web search, etc.)
- **Model Selector**: Choose which Gemini model to use
- **Trash Icon**: Clear all messages in this pane

### Managing Panes
- **Add Pane** (➕ icon): Create a new chat pane for comparison (max 4)
- **Remove Pane** (➖ icon): Remove the last pane

### Example Messages
When no messages exist, click on example prompts to quickly start a conversation across all panes.

## Error Recovery

If something goes wrong during message sending, **you now have an always-available recovery button**:

### How to Recover from Errors

1. **Look for the X button** - It appears next to the Send button when streaming is active
2. **Click the X (Clear/Cancel) button** - It turns orange when streaming is stuck
3. **Everything resets immediately** - All streaming states clear, input field clears
4. **Type and send a new message** - You're ready to go again!

### Common Error Scenarios

**"Failed to parse stream" Error**
- **Symptom**: Error message in console, AI shows error message, but UI stuck on "Sending..."
- **Solution**: Click the orange X button to force reset

**API Quota Exceeded**
- **Symptom**: Error toast notification, UI stuck in sending state
- **Solution**: Click the X button, wait a moment, then try again

**Connection Timeout**
- **Symptom**: AI takes too long, no response appears
- **Solution**: Click the X button to cancel and reset

**Stuck "Sending..." State**
- **Symptom**: Send button shows "Sending..." indefinitely with no activity
- **Solution**: Click the X button - it's designed exactly for this!

### Why This Works

The Clear/Cancel button:
- **Bypasses normal controls** - Works even when everything else is disabled
- **Resets all states** - Clears both frontend and backend streaming flags
- **Works across all panes** - Resets all chat panes simultaneously
- **No data loss** - Only clears the current unsent message, not your chat history

## Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Convex (real-time database and serverless functions)
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS
- **UI Components**: Headless UI, HeroIcons

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Tips

1. **Comparing Responses**: Use multiple panes with different configurations (e.g., one with System ON, one with AGENT ON) to see how settings affect responses
2. **System Prompts**: Customize the system prompts in the sidebar to specialize the AI for your use case
3. **Agent Mode**: Enable AGENT mode to allow the AI to search the web and use tools for more accurate, up-to-date responses
4. **Recovery**: If anything gets stuck, use the Clear (X) button to reset and start fresh
